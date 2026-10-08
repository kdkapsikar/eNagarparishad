import pg from 'pg';
import { config } from '../config.js';

// DATE columns stay 'YYYY-MM-DD' strings. The default turns them into a JS Date at local midnight, which
// shifts by a day once serialised to JSON on a server east of UTC (India).
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

pool.on('error', (err) => {
  // Idle-client errors (e.g. DB restart) must not crash the process.
  console.error('Unexpected Postgres pool error:', err.message);
});

export const query = (text, params) => pool.query(text, params);

/** Run `fn(client)` inside BEGIN/COMMIT, rolling back if it throws. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
