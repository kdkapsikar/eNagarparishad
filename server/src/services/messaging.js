// Messages to residents: daily birthday / anniversary wishes and notice broadcasts.
//
// Every message is first written to the `messages` table (the outbox). How it then reaches the resident
// depends on MESSAGE_CHANNEL:
//   manual - nothing is sent automatically. The staff screen shows each message with a WhatsApp button
//            (a wa.me link with the text pre-filled); the volunteer taps it, presses send in their own
//            WhatsApp, and marks the message sent. Needs no API account, no template approval, no cost.
//   log    - development: "sends" by printing to the console.
// To deliver automatically, add a channel to CHANNELS below (WhatsApp Cloud API or an SMS gateway). It
// must resolve when the message was accepted and throw otherwise. Note: SMS in India needs DLT-registered
// templates, and WhatsApp Business API needs pre-approved templates and opted-in recipients.
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { getSettings } from './settings.js';

const CHANNELS = {
  manual: null,
  log: async (message) => console.log(`[message:${message.kind}] to ${message.phone}: ${message.body}`),
};

if (!(config.messageChannel in CHANNELS)) {
  throw new Error(`MESSAGE_CHANNEL must be one of: ${Object.keys(CHANNELS).join(', ')}`);
}

export const isManualChannel = () => CHANNELS[config.messageChannel] === null;

/** Fill {placeholders}; unknown ones are left as they are so a typo in a template is visible. */
export const render = (template, vars) => template.replace(/\{(\w+)\}/g, (whole, k) => (vars[k] ?? whole));

/** YYYY-MM-DD for "today" in the ward's time zone (the server may run in UTC). */
export function todayInWard(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function hourInWard(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

/** Month-day keys to match for a date: 29 February birthdays are wished on 28 February in other years. */
export function monthDayKeys(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const keys = [`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (m === 2 && d === 28 && !leap) keys.push('02-29');
  return keys;
}

// A member's own mobile first, then the family's WhatsApp, then the family's mobile.
const PHONE_SQL = 'COALESCE(m.mobile, h.whatsapp, h.mobile)';

/** People whose birthday / anniversary is on `date`, with the number a wish would go to. */
export async function occasionsOn(date) {
  const keys = monthDayKeys(date);
  const select = (kind, column) => `
    SELECT '${kind}' AS kind, m.id AS member_id, m.name, m.dob, m.anniversary, h.id AS household_id,
           h.head_name, h.area, ${PHONE_SQL} AS phone
      FROM members m JOIN households h ON h.id = m.household_id
     WHERE to_char(m.${column}, 'MM-DD') = ANY($1)`;
  const { rows } = await query(
    `${select('birthday', 'dob')} UNION ALL ${select('anniversary', 'anniversary')} ORDER BY kind, name`,
    [keys],
  );
  return rows;
}

/**
 * Write today's birthday and anniversary wishes to the outbox. Idempotent (a unique index allows one wish
 * per person per day), so it is safe to call from both the hourly timer and every dashboard load - which
 * matters on hosts that put the server to sleep when idle.
 */
export async function prepareDailyMessages(date = todayInWard()) {
  const settings = await getSettings();
  const people = (await occasionsOn(date)).filter((p) => p.phone);
  let created = 0;
  for (const p of people) {
    const template = p.kind === 'birthday' ? settings.template_birthday : settings.template_anniversary;
    const body = render(template, { name: p.name, sender: settings.sender_name });
    const { rowCount } = await query(
      `INSERT INTO messages (kind, member_id, household_id, recipient, phone, body, for_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (kind, member_id, for_date) WHERE kind IN ('birthday', 'anniversary') DO NOTHING`,
      [p.kind, p.member_id, p.household_id, p.name, p.phone, body, date],
    );
    created += rowCount;
  }
  if (created) await deliverPending();
  return created;
}

/** One message per family (to its WhatsApp, else mobile) in `area`, or the whole ward. */
export async function broadcast({ kind, body, noticeId = null, area = null }) {
  const { rows } = await query(
    `INSERT INTO messages (kind, household_id, notice_id, recipient, phone, body)
     SELECT $1, h.id, $2, h.head_name, COALESCE(h.whatsapp, h.mobile), $3
       FROM households h
      WHERE h.verified AND COALESCE(h.whatsapp, h.mobile) IS NOT NULL AND ($4::text IS NULL OR h.area = $4)
     RETURNING id`,
    [kind, noticeId, body, area],
  );
  await deliverPending();
  return rows.length;
}

/** Hand pending messages to an automatic channel. With the manual channel this does nothing. */
export async function deliverPending() {
  const send = CHANNELS[config.messageChannel];
  if (!send) return 0;
  const { rows } = await query(`SELECT * FROM messages WHERE status = 'pending' ORDER BY id LIMIT 500`);
  for (const message of rows) {
    try {
      await send(message);
      await query(`UPDATE messages SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1`, [message.id]);
    } catch (err) {
      await query(`UPDATE messages SET status = 'failed', error = $2 WHERE id = $1`, [message.id, String(err.message).slice(0, 300)]);
    }
  }
  return rows.length;
}

/** Start the hourly timer that prepares the day's wishes once the configured hour has passed. */
export function startReminderScheduler() {
  const tick = () => {
    if (hourInWard() < config.reminderHour) return;
    prepareDailyMessages().catch((e) => console.error('Daily reminders failed:', e.message));
  };
  tick();
  return setInterval(tick, 60 * 60 * 1000).unref();
}
