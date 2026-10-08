// Client-side mirrors of the server's normalisers (server/src/lib/validation.js), so the form and the bot
// can say what is wrong before anything is sent. The server re-checks everything.

export const toLatinDigits = (input) => String(input ?? '').replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));

export function normalizeMobile(input) {
  const compact = toLatinDigits(input).replace(/[\s()-]/g, '');
  const match = compact.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return match ? match[1] : null;
}

/** 12 digits (or already just the last 4) -> the last 4 digits that are stored. */
export function normalizeAadhaar(input) {
  const digits = toLatinDigits(input).replace(/[\s-]/g, '');
  return /^\d{12}$/.test(digits) || /^\d{4}$/.test(digits) ? digits.slice(-4) : null;
}

export function normalizePan(input) {
  const pan = String(input ?? '').replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? pan : null;
}

export function normalizeVoterId(input) {
  const id = toLatinDigits(input).replace(/\s/g, '').toUpperCase();
  return /^[A-Z0-9/\\-]{6,20}$/.test(id) ? id : null;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A real calendar date, not in the future, not before 1900. */
export function isValidPastDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(iso) && iso <= todayIso() && iso >= '1900-01-01';
}

export const CATEGORIES = ['open', 'obc', 'sc', 'st', 'vjnt', 'sbc', 'sebc', 'ews', 'other'];
export const GENDERS = ['male', 'female', 'other'];
