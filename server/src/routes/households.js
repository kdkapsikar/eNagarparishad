import { Router } from 'express';
import { query } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { householdSchema, parse } from '../lib/validation.js';
import { requireAdmin } from '../middleware/auth.js';
import { createHousehold, exportRows, getHousehold, listAreas, listHouseholds, updateHousehold } from '../services/households.js';
import { exportWorkbook } from '../services/importer.js';

const router = Router();

const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'not_found', 'Family not found');
  return id;
};

router.get('/', async (req, res) => {
  const { q, area, verified } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  res.json(await listHouseholds({ q: typeof q === 'string' ? q.trim() : '', area: typeof area === 'string' ? area : '', verified, page }));
});

router.get('/areas', async (_req, res) => {
  res.json({ areas: await listAreas() });
});

router.get('/export', requireAdmin, async (_req, res) => {
  const buffer = await exportWorkbook(await exportRows());
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="families-${date}.xlsx"`);
  res.send(Buffer.from(buffer));
});

router.post('/', async (req, res) => {
  const data = parse(householdSchema, req.body ?? {});
  const source = req.body?.source === 'bot' ? 'bot' : 'form';
  const id = await createHousehold(data, { source, userId: req.user.id });
  res.status(201).json({ household: await getHousehold(id) });
});

router.get('/:id', async (req, res) => {
  res.json({ household: await getHousehold(idParam(req)) });
});

router.put('/:id', async (req, res) => {
  const id = idParam(req);
  await updateHousehold(id, parse(householdSchema, req.body ?? {}));
  res.json({ household: await getHousehold(id) });
});

router.post('/:id/verify', async (req, res) => {
  const { rowCount } = await query('UPDATE households SET verified = true, updated_at = now() WHERE id = $1', [idParam(req)]);
  if (!rowCount) throw new HttpError(404, 'not_found', 'Family not found');
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const { rowCount } = await query('DELETE FROM households WHERE id = $1', [idParam(req)]);
  if (!rowCount) throw new HttpError(404, 'not_found', 'Family not found');
  res.status(204).end();
});

export default router;
