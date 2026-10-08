import { Router } from 'express';
import { query } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { broadcastSchema, parse } from '../lib/validation.js';
import { requireAdmin } from '../middleware/auth.js';
import { broadcast, isManualChannel, prepareDailyMessages, render, todayInWard } from '../services/messaging.js';
import { getSettings } from '../services/settings.js';

const router = Router();

/** The outbox. Defaults to today's pending messages; also prepares today's wishes if not done yet. */
router.get('/', async (req, res) => {
  await prepareDailyMessages();
  const status = ['pending', 'sent', 'failed', 'skipped'].includes(req.query.status) ? req.query.status : 'pending';
  const { rows } = await query(
    `SELECT id, kind, recipient, phone, body, for_date, status, error, sent_at, household_id
       FROM messages WHERE status = $1 ${status === 'pending' ? '' : 'AND for_date > CURRENT_DATE - 30'}
      ORDER BY for_date DESC, kind, id LIMIT 500`,
    [status],
  );
  const counts = await query(`SELECT status, count(*)::int AS n FROM messages GROUP BY status`);
  res.json({
    messages: rows,
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
    manual: isManualChannel(),
    today: todayInWard(),
  });
});

/** Mark a message as sent (manual channel: after sending it from WhatsApp) or skipped. */
router.post('/:id/status', async (req, res) => {
  const status = req.body?.status;
  if (!['sent', 'skipped', 'pending'].includes(status)) throw new HttpError(400, 'bad_request', 'Invalid status');
  const { rowCount } = await query(
    `UPDATE messages SET status = $2, sent_at = CASE WHEN $2 = 'sent' THEN now() END, sent_by = $3 WHERE id = $1`,
    [Number(req.params.id) || 0, status, req.user.id],
  );
  if (!rowCount) throw new HttpError(404, 'not_found', 'Message not found');
  res.json({ ok: true });
});

/** Send a notice (or a custom text) to every family in an area, or the whole ward. */
router.post('/broadcast', requireAdmin, async (req, res) => {
  const { notice_id: noticeId, body, area } = parse(broadcastSchema, req.body ?? {});
  const settings = await getSettings();
  let text = body;
  let kind = 'custom';
  let targetArea = area;
  if (noticeId) {
    const { rows } = await query('SELECT * FROM notices WHERE id = $1', [noticeId]);
    if (!rows[0]) throw new HttpError(404, 'not_found', 'Notice not found');
    text = render(settings.template_notice, { title: rows[0].title, body: rows[0].body, sender: settings.sender_name });
    kind = 'notice';
    targetArea = area ?? rows[0].area;
  } else {
    text = `${body}\n— ${settings.sender_name}`;
  }
  const count = await broadcast({ kind, body: text, noticeId, area: targetArea });
  res.status(201).json({ count });
});

export default router;
