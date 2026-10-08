import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ quiet: true });

const num = (value, fallback) => (value === undefined || value === '' ? fallback : Number(value));
const bool = (value, fallback) => (value === undefined || value === '' ? fallback : value === 'true');

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  // API_PORT wins over PORT so a tool that sets PORT for the web dev server does not move the API;
  // hosts like Render set only PORT.
  port: num(process.env.API_PORT, num(process.env.PORT, 3002)),
  databaseUrl: process.env.DATABASE_URL,
  clientDistDir: path.resolve(process.env.CLIENT_DIST_DIR || '../client/dist'),
  sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 12),
  trustProxy: num(process.env.TRUST_PROXY, 0),
  forceHttps: bool(process.env.FORCE_HTTPS, env === 'production'),
  // Exact web-app origins allowed to call the API from a browser, e.g. https://kdkapsikar.github.io
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
  // 32-byte key (64 hex chars) used to encrypt PAN numbers at rest. Generate one with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  dataKey: process.env.DATA_ENCRYPTION_KEY,
  // Time zone the daily reminder job and "today" use. The ward is in India, the server may not be.
  timeZone: process.env.TZ_NAME || 'Asia/Kolkata',
  // Hour (0-23, in timeZone) at which the daily birthday/anniversary messages are prepared.
  reminderHour: num(process.env.REMINDER_HOUR, 7),
  // 'manual' = staff send each message from their own WhatsApp via a wa.me link (no API account needed).
  // 'log'    = pretend to send and print to the console (development).
  // See services/messaging.js to add WhatsApp Cloud API / SMS.
  messageChannel: process.env.MESSAGE_CHANNEL || 'manual',
  maxImportBytes: 5 * 1024 * 1024,
  maxImportRows: 5000,
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env first.');
}
if (!/^postgres(ql)?:\/\//i.test(config.databaseUrl)) {
  throw new Error(
    'DATABASE_URL must be a Postgres connection string starting with postgres:// or postgresql:// ' +
      `(it currently starts with "${config.databaseUrl.slice(0, 8)}...").`,
  );
}
if (config.dataKey !== undefined && !/^[0-9a-f]{64}$/i.test(config.dataKey)) {
  throw new Error('DATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes). See server/.env.example.');
}
if (config.isProd && !config.dataKey) {
  throw new Error('DATA_ENCRYPTION_KEY is required in production - PAN numbers are encrypted with it.');
}
