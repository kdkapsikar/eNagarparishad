import { query } from '../db/pool.js';

// Shown on the public site; everything else (message templates) is staff-only.
export const PUBLIC_KEYS = ['office_name', 'ward_label', 'office_address', 'office_phone', 'sender_name'];
export const EDITABLE_KEYS = [...PUBLIC_KEYS, 'template_birthday', 'template_anniversary', 'template_notice'];

export async function getSettings() {
  const { rows } = await query('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getPublicSettings() {
  const all = await getSettings();
  return Object.fromEntries(PUBLIC_KEYS.map((k) => [k, all[k] ?? '']));
}

export async function updateSettings(values) {
  for (const key of EDITABLE_KEYS) {
    if (values[key] === undefined) continue;
    await query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [key, values[key].trim()],
    );
  }
  return getSettings();
}
