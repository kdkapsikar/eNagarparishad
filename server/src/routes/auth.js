import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { BCRYPT_ROUNDS } from '../lib/constants.js';
import { HttpError } from '../lib/httpError.js';
import { loginSchema, parse } from '../lib/validation.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { createSession, destroySession, findUser } from '../services/sessions.js';

// Compared against when the username does not exist, so response time does not reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const router = Router();

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = parse(loginSchema, req.body ?? {});
  const { rows } = await query('SELECT id, password_hash, is_active FROM users WHERE lower(username) = lower($1)', [username]);
  const row = rows[0];
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok || !row.is_active) {
    if (!config.isTest) {
      const reason = !row ? 'unknown_username' : !ok ? 'wrong_password' : 'account_inactive';
      console.warn(`login_failed username=${JSON.stringify(username)} reason=${reason} ip=${req.ip}`);
    }
    throw new HttpError(401, 'invalid_credentials', 'Invalid username or password');
  }
  const token = await createSession(row.id);
  res.json({ token, user: await findUser(row.id) });
});

// 200 with { user: null } when signed out, so the SPA boot is not a console error.
router.get('/me', (req, res) => res.json({ user: req.user }));

router.post('/logout', async (req, res) => {
  await destroySession(req.sessionToken);
  res.status(204).end();
});

export default router;
