import { z } from 'zod';
import { HttpError } from './httpError.js';

/** Validate `data` with a zod schema; throw a 400 with per-field messages on failure. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new HttpError(400, 'validation_error', 'Please fix the highlighted fields', fields);
}

// ---- normalisers (shared with the spreadsheet importer) -------------------------------------------

// Devanagari digits (०-९) are accepted anywhere a number is typed: a Marathi keyboard types them.
export const toLatinDigits = (input) => String(input ?? '').replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));

const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** 10-digit Indian mobile, dropping spaces/dashes and a leading +91 / 91 / 0. null when invalid. */
export function normalizeIndianMobile(input) {
  const compact = toLatinDigits(input).replace(/[\s()-]/g, '');
  const match = compact.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return match ? match[1] : null;
}

/**
 * Aadhaar is never stored in full: a 12-digit number (or just its last 4 digits) becomes its last 4.
 * Returns null for anything else.
 */
export function aadhaarLast4(input) {
  const digits = toLatinDigits(input).replace(/[\s-]/g, '');
  if (/^\d{12}$/.test(digits) || /^\d{4}$/.test(digits)) return digits.slice(-4);
  const masked = digits.match(/^[xX*]{8}(\d{4})$/); // "XXXXXXXX1234" from an earlier export
  return masked ? masked[1] : null;
}

export function normalizePan(input) {
  const pan = String(input ?? '').replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? pan : null;
}

/** EPIC (voter ID) numbers are usually ABC1234567, but older cards use other shapes - accept those too. */
export function normalizeVoterId(input) {
  const id = toLatinDigits(input).replace(/\s/g, '').toUpperCase();
  return /^[A-Z0-9/\\-]{6,20}$/.test(id) ? id : null;
}

// ---- zod building blocks --------------------------------------------------------------------------

const text = (label, max) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : ''),
    z.string().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`),
  );

const optionalText = (label, max) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null),
    z.string().max(max, `${label} must be at most ${max} characters`).nullable(),
  );

const normalized = (fn, message) =>
  z.preprocess((v) => (blank(v) ? null : fn(v) ?? '__invalid__'), z.string().refine((v) => v !== '__invalid__', message).nullable());

export const phone = z.preprocess(
  (v) => normalizeIndianMobile(v) ?? '',
  z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
);
const optionalPhone = normalized(normalizeIndianMobile, 'Enter a valid 10-digit Indian mobile number');

const isoDate = (label) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date`)
    .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v), `${label} must be a valid date`)
    .refine((v) => v <= new Date().toISOString().slice(0, 10), `${label} cannot be in the future`)
    .refine((v) => v >= '1900-01-01', `${label} must be a valid date`);
const optionalDate = (label) => z.preprocess((v) => (blank(v) ? null : toLatinDigits(v).trim()), isoDate(label).nullable());

const optionalBool = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.boolean().nullable());

export const GENDERS = ['male', 'female', 'other'];
export const CATEGORIES = ['open', 'obc', 'sc', 'st', 'vjnt', 'sbc', 'sebc', 'ews', 'other'];
const optionalEnum = (values) => z.preprocess((v) => (blank(v) ? null : v), z.enum(values).nullable());

export const memberSchema = z.object({
  id: z.number().int().positive().optional(), // set when editing an existing member
  pan_clear: z.boolean().optional(), // editing: remove the stored PAN (a blank PAN keeps it)
  name: text('Name', 120),
  relation: optionalText('Relation', 40),
  dob: optionalDate('Date of birth'),
  anniversary: optionalDate('Anniversary'),
  gender: optionalEnum(GENDERS),
  education: optionalText('Education', 80),
  occupation: optionalText('Occupation', 80),
  mobile: optionalPhone,
  aadhaar: normalized(aadhaarLast4, 'Enter the 12-digit Aadhaar number (only its last 4 digits are kept)'),
  pan: normalized(normalizePan, 'Enter a valid PAN, e.g. ABCDE1234F'),
  voter_id: normalized(normalizeVoterId, 'Enter a valid voter ID (EPIC) number'),
});

export const householdSchema = z.object({
  head_name: text('Head of family', 120),
  mobile: optionalPhone,
  whatsapp: optionalPhone,
  address: optionalText('Address', 300),
  area: optionalText('Area', 80),
  caste: optionalText('Caste', 60),
  category: optionalEnum(CATEGORIES),
  farm_details: optionalText('Farm details', 300),
  disability: optionalText('Disability', 200),
  has_internet: optionalBool,
  has_water_filter: optionalBool,
  has_anganwadi: optionalBool,
  gharkul_benefit: optionalBool,
  other_issues: optionalText('Other issues', 1000),
  consent: z.literal(true, { error: 'Consent of the family is required' }),
  members: z.array(memberSchema).max(30, 'At most 30 members per family').default([]),
});

export const loginSchema = z.object({
  username: text('Username', 60),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
});

export const userSchema = z.object({
  name: text('Full name', 80),
  username: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : ''),
    z.string().regex(/^[a-zA-Z0-9._-]{3,40}$/, 'Username must be 3-40 letters, digits, dots, dashes or underscores'),
  ),
  password: z.string({ error: 'Password is required' }).min(8, 'Password must be at least 8 characters').max(200),
  role: z.enum(['admin', 'volunteer']),
});

export const noticeSchema = z.object({
  kind: z.enum(['electricity', 'water', 'general']),
  title: text('Title', 150),
  body: text('Message', 1000),
  area: optionalText('Area', 80),
  starts_at: z.preprocess((v) => (blank(v) ? null : v), z.iso.datetime({ offset: true, local: true }).nullable()),
  ends_at: z.preprocess((v) => (blank(v) ? null : v), z.iso.datetime({ offset: true, local: true }).nullable()),
});

export const schemeSchema = z.object({
  title: text('Title', 200),
  level: z.enum(['central', 'state', 'local']),
  category: text('Category', 60),
  summary: text('Summary', 1000),
  benefits: optionalText('Benefits', 2000),
  eligibility: optionalText('Eligibility', 2000),
  documents: optionalText('Documents', 2000),
  how_to_apply: optionalText('How to apply', 2000),
  link: z.preprocess((v) => (blank(v) ? null : String(v).trim()), z.url({ protocol: /^https?$/, error: 'Enter a valid web link' }).nullable()),
  is_new: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export const certificateRequestSchema = z.object({
  kind: z.enum(['birth', 'death']),
  person_name: text('Name on certificate', 120),
  event_date: z.preprocess((v) => toLatinDigits(v).trim(), isoDate('Date')),
  event_place: text('Place', 200),
  gender: optionalEnum(GENDERS),
  father_name: optionalText("Father's name", 120),
  mother_name: optionalText("Mother's name", 120),
  address: text('Address', 300),
  applicant_name: text('Applicant name', 120),
  applicant_phone: phone,
  relation: optionalText('Relation', 40),
  copies: z.coerce.number().int().min(1).max(10).default(1),
});

export const CERTIFICATE_STATUSES = ['submitted', 'documents_needed', 'forwarded', 'ready', 'delivered', 'rejected'];

export const certificateUpdateSchema = z.object({
  status: z.enum(CERTIFICATE_STATUSES),
  remark: optionalText('Remark', 500),
  registration_no: optionalText('Registration number', 60),
});

export const broadcastSchema = z.object({
  notice_id: z.number().int().positive().nullable().default(null),
  body: optionalText('Message', 1000),
  area: optionalText('Area', 80),
}).refine((v) => v.notice_id || v.body, { message: 'Message is required', path: ['body'] });

export const settingsSchema = z.record(z.string(), z.string().max(1000));
