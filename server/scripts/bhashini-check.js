// Check the Bhashini keys in server/.env end to end: finds the Marathi services, speaks a test sentence
// in the configured voice and saves it, so you can listen to it.
//   npm run bhashini:check -w server
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { speechEnabled, synthesize } from '../src/services/speech.js';

if (!speechEnabled()) {
  console.error('BHASHINI_USER_ID and BHASHINI_API_KEY are not set in server/.env (copy them from "My Profile" on the Bhashini dashboard).');
  process.exit(1);
}

try {
  await migrate({ log: () => {} });
  const sentence = 'राम राम मंडळी! मी मदतनीस. आपल्या प्रभागाच्या सेवेसाठी.';
  const { audio, mime, cached } = await synthesize(sentence, 'mr');
  const file = path.join(os.tmpdir(), `madatnees-test.${mime.split('/')[1] || 'wav'}`);
  fs.writeFileSync(file, audio);
  console.log(`OK - Bhashini spoke ${audio.length} bytes of ${mime} (${config.bhashini.voice} voice${cached ? ', from cache' : ''}).`);
  console.log(`Listen: open "${file}"`);
} catch (err) {
  console.error(`Bhashini check failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
