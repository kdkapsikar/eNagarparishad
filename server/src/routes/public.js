import { Router } from 'express';
import { query } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { certificateId, normalizeCertificateId } from '../lib/ids.js';
import { certificateRequestSchema, householdSchema, normalizeIndianMobile, parse } from '../lib/validation.js';
import { lookupLimiter, submitLimiter } from '../middleware/rateLimit.js';
import { createHousehold } from '../services/households.js';
import { getPublicSettings } from '../services/settings.js';

const router = Router();

router.get('/settings', async (_req, res) => {
  res.json({ settings: await getPublicSettings() });
});

// Current notices: still running, or posted in the last 15 days when they have no end time.
router.get('/notices', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, kind, title, body, area, starts_at, ends_at, created_at FROM notices
      WHERE (ends_at IS NOT NULL AND ends_at > now()) OR (ends_at IS NULL AND created_at > now() - interval '15 days')
      ORDER BY COALESCE(starts_at, created_at) DESC LIMIT 50`,
  );
  res.json({ notices: rows });
});

router.get('/schemes', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, title, level, category, summary, is_new FROM schemes WHERE is_active ORDER BY is_new DESC, title`,
  );
  res.json({ schemes: rows });
});

router.get('/schemes/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = Number.isInteger(id) ? await query('SELECT * FROM schemes WHERE id = $1 AND is_active', [id]) : { rows: [] };
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Scheme not found');
  res.json({ scheme: rows[0] });
});

/** A resident registers their own family through the public bot. Staff verify it before it is used. */
router.post('/self-register', submitLimiter, async (req, res) => {
  const data = parse(householdSchema, req.body ?? {});
  if (!data.mobile && !data.whatsapp) {
    throw new HttpError(400, 'validation_error', 'Please fix the highlighted fields', { mobile: 'Enter a valid 10-digit Indian mobile number' });
  }
  await createHousehold(data, { source: 'self', verified: false });
  res.status(201).json({ ok: true });
});

router.post('/certificates', submitLimiter, async (req, res) => {
  const data = parse(certificateRequestSchema, req.body ?? {});
  const columns = Object.keys(data);
  // Retry on the (very unlikely) chance of an ID collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = certificateId(data.kind);
    try {
      await query(
        `INSERT INTO certificate_requests (id, ${columns.join(', ')}) VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(', ')})`,
        [id, ...columns.map((c) => data[c])],
      );
      await query(`INSERT INTO certificate_updates (request_id, status) VALUES ($1, 'submitted')`, [id]);
      return res.status(201).json({ id });
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  }
  throw new Error('Could not allocate a certificate request ID');
});

/** Track a request. The applicant's mobile number is required too, so IDs alone do not reveal anything. */
router.post('/certificates/track', lookupLimiter, async (req, res) => {
  const id = normalizeCertificateId(req.body?.id);
  const phone = normalizeIndianMobile(req.body?.phone);
  const { rows } = id && phone
    ? await query(
      `SELECT id, kind, person_name, event_date, status, registration_no, copies, created_at, updated_at
         FROM certificate_requests WHERE id = $1 AND applicant_phone = $2`,
      [id, phone],
    )
    : { rows: [] };
  if (!rows[0]) throw new HttpError(404, 'not_found', 'No request found with this number and mobile');
  const updates = await query(
    'SELECT status, remark, created_at FROM certificate_updates WHERE request_id = $1 ORDER BY created_at, id',
    [id],
  );
  res.json({ request: rows[0], updates: updates.rows });
});

export default router;
