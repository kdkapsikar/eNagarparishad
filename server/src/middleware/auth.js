import { HttpError } from '../lib/httpError.js';
import { resolveSession, tokenFromRequest } from '../services/sessions.js';

/** Attach `req.user` (or null) from the Authorization: Bearer token. */
export async function loadSession(req, _res, next) {
  req.sessionToken = tokenFromRequest(req);
  req.user = await resolveSession(req.sessionToken);
  next();
}

/** Any signed-in staff member (admin or volunteer). */
export function requireStaff(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Please sign in');
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Please sign in');
  if (req.user.role !== 'admin') throw new HttpError(403, 'forbidden', 'Only the office admin can do this');
  next();
}
