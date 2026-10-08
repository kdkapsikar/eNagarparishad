// Create a staff account (works in production).
//   npm run user:create -- <username> <role: admin|volunteer> "<Full name>"
// The password is read from the PASSWORD environment variable, or a random one is generated and printed.
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, query } from '../src/db/pool.js';
import { BCRYPT_ROUNDS } from '../src/lib/constants.js';
import { userSchema } from '../src/lib/validation.js';

const [username, role, name] = process.argv.slice(2);
const generated = !process.env.PASSWORD;
const password = process.env.PASSWORD || randomBytes(9).toString('base64url');

const result = userSchema.safeParse({ username, role, name, password });
if (!result.success) {
  console.error('Usage: npm run user:create -- <username> <admin|volunteer> "<Full name>"');
  for (const issue of result.error.issues) console.error(` - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

try {
  await query('INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4)', [
    name, username, await bcrypt.hash(password, BCRYPT_ROUNDS), role,
  ]);
  console.log(`Created ${role} "${username}".${generated ? ` Password: ${password}  (change it after first sign-in)` : ''}`);
} catch (err) {
  console.error(err.code === '23505' ? `Username "${username}" already exists.` : err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
