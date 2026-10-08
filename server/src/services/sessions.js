import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { query } from '../db/pool.js';

const hash = (token) => createHash('sha256').update(token).digest('hex');

export async function findUser(id) {
  const { rows } = await query('SELECT id, name, username, role, is_active FROM users WHERE id = $1', [id]);
  const row = rows[0];
  if (!row?.is_active) return null;
  return { id: row.id, name: row.name, username: row.username, role: row.role };
}

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [hash(token), userId, config.sessionTtlHours],
  );
  return token;
}

/** Resolve a session token to the signed-in user, or null (unknown, expired or deactivated). */
export async function resolveSession(token) {
  if (!token) return null;
  const { rows } = await query('SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()', [hash(token)]);
  return rows[0] ? findUser(rows[0].user_id) : null;
}

export async function destroySession(token) {
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hash(token)]);
}

export async function purgeExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at <= now()');
}

/** The session token from `Authorization: Bearer <token>`, or null. */
export function tokenFromRequest(req) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
