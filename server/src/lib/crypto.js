import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

// Development falls back to a fixed key so `npm run dev` works out of the box; config.js refuses to
// start in production without DATA_ENCRYPTION_KEY, so this key never protects real data.
const KEY = config.dataKey
  ? Buffer.from(config.dataKey, 'hex')
  : createHash('sha256').update('e-nagarparishad-development-only-key').digest();

/** AES-256-GCM. Output: "v1:<iv>:<tag>:<ciphertext>", all base64url. */
export function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join(':');
}

export function decrypt(token) {
  if (!token) return null;
  const [version, iv, tag, data] = token.split(':');
  if (version !== 'v1') throw new Error('Unknown ciphertext version');
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
