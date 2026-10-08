import { config } from './config.js';
import { createApp } from './app.js';
import { pool } from './db/pool.js';
import { purgeExpiredSessions } from './services/sessions.js';
import { startReminderScheduler } from './services/messaging.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`e-nagarparishad API listening on http://localhost:${config.port} (${config.env}, messages: ${config.messageChannel})`);
});

// Hourly housekeeping; unref() so neither timer keeps the process alive on shutdown.
setInterval(() => purgeExpiredSessions().catch((e) => console.error('Session purge failed:', e.message)), 3600_000).unref();
startReminderScheduler();

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
