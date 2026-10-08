// Admin management of notices and schemes (the public read side is in routes/public.js).
import { Router } from 'express';
import { query } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { noticeSchema, parse, schemeSchema } from '../lib/validation.js';

const router = Router();
const idOf = (req) => Number(req.params.id) || 0;

router.get('/notices', async (_req, res) => {
  const { rows } = await query('SELECT * FROM notices ORDER BY created_at DESC LIMIT 200');
  res.json({ notices: rows });
});

router.post('/notices', async (req, res) => {
  const n = parse(noticeSchema, req.body ?? {});
  const { rows } = await query(
    `INSERT INTO notices (kind, title, body, area, starts_at, ends_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [n.kind, n.title, n.body, n.area, n.starts_at, n.ends_at, req.user.id],
  );
  res.status(201).json({ notice: rows[0] });
});

router.put('/notices/:id', async (req, res) => {
  const n = parse(noticeSchema, req.body ?? {});
  const { rows } = await query(
    `UPDATE notices SET kind = $2, title = $3, body = $4, area = $5, starts_at = $6, ends_at = $7 WHERE id = $1 RETURNING *`,
    [idOf(req), n.kind, n.title, n.body, n.area, n.starts_at, n.ends_at],
  );
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Notice not found');
  res.json({ notice: rows[0] });
});

router.delete('/notices/:id', async (req, res) => {
  await query('DELETE FROM notices WHERE id = $1', [idOf(req)]);
  res.status(204).end();
});

const SCHEME_FIELDS = ['title', 'level', 'category', 'summary', 'benefits', 'eligibility', 'documents', 'how_to_apply', 'link', 'is_new', 'is_active'];

router.get('/schemes', async (_req, res) => {
  const { rows } = await query('SELECT * FROM schemes ORDER BY is_active DESC, is_new DESC, title');
  res.json({ schemes: rows });
});

router.post('/schemes', async (req, res) => {
  const s = parse(schemeSchema, req.body ?? {});
  const { rows } = await query(
    `INSERT INTO schemes (${SCHEME_FIELDS.join(', ')}) VALUES (${SCHEME_FIELDS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    SCHEME_FIELDS.map((f) => s[f]),
  );
  res.status(201).json({ scheme: rows[0] });
});

router.put('/schemes/:id', async (req, res) => {
  const s = parse(schemeSchema, req.body ?? {});
  const { rows } = await query(
    `UPDATE schemes SET ${SCHEME_FIELDS.map((f, i) => `${f} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
    [idOf(req), ...SCHEME_FIELDS.map((f) => s[f])],
  );
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Scheme not found');
  res.json({ scheme: rows[0] });
});

router.delete('/schemes/:id', async (req, res) => {
  await query('DELETE FROM schemes WHERE id = $1', [idOf(req)]);
  res.status(204).end();
});

export default router;
