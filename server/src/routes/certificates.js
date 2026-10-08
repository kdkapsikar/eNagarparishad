import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { normalizeCertificateId } from '../lib/ids.js';
import { CERTIFICATE_STATUSES, certificateUpdateSchema, parse } from '../lib/validation.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const status = CERTIFICATE_STATUSES.includes(req.query.status) ? req.query.status : null;
  const { rows } = await query(
    `SELECT id, kind, person_name, event_date, applicant_name, applicant_phone, status, created_at, updated_at
       FROM certificate_requests WHERE ($1::text IS NULL OR status = $1)
      ORDER BY created_at DESC LIMIT 300`,
    [status],
  );
  res.json({ requests: rows });
});

router.get('/:id', async (req, res) => {
  const id = normalizeCertificateId(req.params.id);
  const { rows } = await query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Request not found');
  const updates = await query(
    `SELECT cu.status, cu.remark, cu.created_at, u.name AS by_name
       FROM certificate_updates cu LEFT JOIN users u ON u.id = cu.created_by
      WHERE cu.request_id = $1 ORDER BY cu.created_at, cu.id`,
    [id],
  );
  res.json({ request: rows[0], updates: updates.rows });
});

router.post('/:id/status', requireAdmin, async (req, res) => {
  const id = normalizeCertificateId(req.params.id);
  const { status, remark, registration_no: registrationNo } = parse(certificateUpdateSchema, req.body ?? {});
  if (status === 'rejected' && !remark) {
    throw new HttpError(400, 'validation_error', 'Please fix the highlighted fields', { remark: 'Give the reason for rejection' });
  }
  await withTransaction(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE certificate_requests SET status = $2, registration_no = COALESCE($3, registration_no), updated_at = now() WHERE id = $1`,
      [id, status, registrationNo],
    );
    if (!rowCount) throw new HttpError(404, 'not_found', 'Request not found');
    await c.query('INSERT INTO certificate_updates (request_id, status, remark, created_by) VALUES ($1, $2, $3, $4)', [id, status, remark, req.user.id]);
  });
  res.json({ ok: true });
});

export default router;
