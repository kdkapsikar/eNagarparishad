import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { analyse, commit, templateWorkbook } from '../services/importer.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxImportBytes, files: 1 } });

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

router.get('/template', async (_req, res) => {
  res.setHeader('Content-Type', XLSX_TYPE);
  res.setHeader('Content-Disposition', 'attachment; filename="family-survey-template.xlsx"');
  res.send(Buffer.from(await templateWorkbook()));
});

router.get('/batches', async (_req, res) => {
  const { rows } = await query(
    `SELECT b.*, u.name AS created_by_name FROM import_batches b LEFT JOIN users u ON u.id = b.created_by
      ORDER BY b.created_at DESC LIMIT 20`,
  );
  res.json({ batches: rows });
});

/**
 * POST /api/imports  (multipart: file, commit=true|false)
 * commit=false (default) only checks the file and reports errors; commit=true also saves the valid families.
 * The person uploading confirms (consent=true) that the families agreed to their data being kept.
 */
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'invalid_file', 'Choose a file to upload');
  const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
  const result = await analyse(req.file.buffer, filename);
  const summary = {
    rows: result.rowCount,
    households: result.valid.length,
    members: result.valid.reduce((n, f) => n + f.data.members.length, 0),
    errors: result.errors.slice(0, 300),
    errorCount: result.errors.length,
  };
  if (req.body.commit !== 'true') return res.json({ preview: true, ...summary });
  if (req.body.consent !== 'true') {
    throw new HttpError(400, 'validation_error', 'Please fix the highlighted fields', { consent: 'Consent of the family is required' });
  }
  const saved = await commit(result, { filename, userId: req.user.id });
  res.status(201).json({ preview: false, ...summary, saved });
});

export default router;
