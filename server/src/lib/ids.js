import { randomInt } from 'node:crypto';

// No 0/O/1/I/L: the ID is read out over the phone and copied from paper.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Certificate request ID: JN-26-4F7K2Q (जन्म, birth) or MR-26-... (मृत्यू, death). */
export function certificateId(kind, year = new Date().getFullYear()) {
  const prefix = kind === 'birth' ? 'JN' : 'MR';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${String(year).slice(-2)}-${suffix}`;
}

export const normalizeCertificateId = (input) => String(input ?? '').trim().toUpperCase().replace(/\s+/g, '');
