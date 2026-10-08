import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { BCRYPT_ROUNDS } from '../lib/constants.js';
import { HttpError } from '../lib/httpError.js';
import { parse, settingsSchema, userSchema } from '../lib/validation.js';
import { getSettings, updateSettings } from '../services/settings.js';

const router = Router();

router.get('/users', async (_req, res) => {
  const { rows } = await query('SELECT id, name, username, role, is_active, created_at FROM users ORDER BY role, name');
  res.json({ users: rows });
});

router.post('/users', async (req, res) => {
  const u = parse(userSchema, req.body ?? {});
  try {
    const { rows } = await query(
      'INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, username, role, is_active',
      [u.name, u.username, await bcrypt.hash(u.password, BCRYPT_ROUNDS), u.role],
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      throw new HttpError(409, 'validation_error', 'Please fix the highlighted fields', { username: 'This username is already taken' });
    }
    throw err;
  }
});

/** Activate / deactivate an account, or set a new password. Deactivating signs the user out everywhere. */
router.put('/users/:id', async (req, res) => {
  const id = Number(req.params.id) || 0;
  if (id === req.user.id && req.body?.is_active === false) {
    throw new HttpError(400, 'bad_request', 'You cannot deactivate your own account');
  }
  if (typeof req.body?.is_active === 'boolean') {
    await query('UPDATE users SET is_active = $2 WHERE id = $1', [id, req.body.is_active]);
    if (!req.body.is_active) await query('DELETE FROM sessions WHERE user_id = $1', [id]);
  }
  if (req.body?.password !== undefined) {
    const { password } = parse(userSchema.pick({ password: true }), req.body);
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, await bcrypt.hash(password, BCRYPT_ROUNDS)]);
    await query('DELETE FROM sessions WHERE user_id = $1 AND user_id <> $2', [id, req.user.id]);
  }
  res.json({ ok: true });
});

router.get('/settings', async (_req, res) => {
  res.json({ settings: await getSettings() });
});

router.put('/settings', async (req, res) => {
  res.json({ settings: await updateSettings(parse(settingsSchema, req.body ?? {})) });
});

export default router;
