// Minimal forward-only SQL migration runner.
//   npm run migrate
// Applies db/migrations/*.sql in filename order, each inside its own
// transaction, and records them in schema_migrations. Safe to run repeatedly
// and on every deploy; a Postgres advisory lock prevents concurrent runs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');
const LOCK_ID = 727_101; // arbitrary constant shared by all e-nagarparishad migrators

export async function migrate({ log = console.log } = {}) {
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      log(`Applying ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
    log(count ? `Applied ${count} migration(s).` : 'Database is up to date.');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

/** Connection failures surface as an AggregateError with an EMPTY message, so unpack them. */
function describeError(err) {
  const inner = (err.errors ?? []).map((e) => e.message || e.code || String(e));
  const parts = [err.message || err.name, err.code && `code=${err.code}`, ...inner].filter(Boolean);
  return parts.join(' | ');
}

// Run directly: `node src/db/migrate.js`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(`Migration failed: ${describeError(err)}`);
      await pool.end();
      process.exit(1);
    });
}
