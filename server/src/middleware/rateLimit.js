import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';

const limiter = ({ windowMs, limit, message, ...rest }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.isTest,
    message: { error: { code: 'rate_limited', message } },
    ...rest,
  });

// Only failed logins count, so a legitimate user is never locked out by their own successes.
export const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Try again in 15 minutes.',
});

// Public forms (self-registration, certificate requests).
export const submitLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: 'Too many submissions. Please try again later.',
});

export const lookupLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 30,
  message: 'Too many lookups. Please slow down.',
});

// The assistant speaks every message, so this is generous; it only stops scripted abuse of the
// (quota-limited) Bhashini service. Cached sentences still count but cost Bhashini nothing.
export const speechLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 90,
  message: 'Too many speech requests. Please slow down.',
});
