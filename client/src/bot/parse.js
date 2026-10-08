// Understanding typed or spoken answers (Marathi or English).
import { toLatinDigits } from '../lib/validation.js';

const clean = (s) => toLatinDigits(s).toLowerCase().replace(/[.,!?।'"]/g, ' ').replace(/\s+/g, ' ').trim();

const YES = ['होय', 'हो', 'हो ना', 'हाँ', 'हां', 'आहे', 'आहेत', 'बरोबर', 'चालेल', 'हवा', 'हवे', 'हवी', 'yes', 'y', 'ok', 'okay', 'हो आहे'];
const NO = ['नाही', 'नाहि', 'नाय', 'नको', 'नाहीत', 'नाही आहे', 'no', 'n', 'nahi', 'nako'];

/** true / false / null (not understood). "नाही" is checked first: "होय नाही" style mixes count as no. */
export function parseYesNo(input) {
  const s = clean(input);
  if (!s) return null;
  if (NO.some((w) => s === w || s.startsWith(`${w} `) || s.endsWith(` ${w}`))) return false;
  if (YES.some((w) => s === w || s.startsWith(`${w} `) || s.endsWith(` ${w}`))) return true;
  return null;
}

/**
 * Match an answer to one of `options` ([{ value, labels: [..] }]). Exact label first, then a label that
 * the answer contains (speech often adds words: "ती मुलगी आहे").
 */
export function matchOption(input, options) {
  const s = clean(input);
  if (!s) return null;
  for (const o of options) if (o.labels.some((l) => clean(l) === s)) return o.value;
  const words = s.split(' ');
  for (const o of options) if (o.labels.some((l) => words.includes(clean(l)))) return o.value;
  for (const o of options) if (o.labels.some((l) => clean(l).length > 2 && s.includes(clean(l)))) return o.value;
  return null;
}

// Spoken digits: speech recognisers usually return numerals, but some say the words.
const DIGIT_WORDS = {
  शून्य: '0', एक: '1', दोन: '2', तीन: '3', चार: '4', पाच: '5', सहा: '6', सात: '7', आठ: '8', नऊ: '9',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

/** Digits and letters only, with spoken digit words turned into numerals: for phone, Aadhaar, PAN... */
export function compactCode(input) {
  return clean(input)
    .split(' ')
    .map((w) => DIGIT_WORDS[w] ?? w)
    .join('')
    .replace(/[^0-9a-z/\\-]/gi, '');
}

const MONTHS = [
  ['जानेवारी', 'जानेवरी', 'january', 'jan'], ['फेब्रुवारी', 'फेब्रुवरी', 'february', 'feb'], ['मार्च', 'march', 'mar'],
  ['एप्रिल', 'april', 'apr'], ['मे', 'may'], ['जून', 'june', 'jun'], ['जुलै', 'जुलाई', 'july', 'jul'],
  ['ऑगस्ट', 'आगस्ट', 'august', 'aug'], ['सप्टेंबर', 'सप्टेम्बर', 'september', 'sep', 'sept'],
  ['ऑक्टोबर', 'आक्टोबर', 'october', 'oct'], ['नोव्हेंबर', 'नोवेंबर', 'november', 'nov'], ['डिसेंबर', 'december', 'dec'],
];

const pad = (n) => String(n).padStart(2, '0');
const fullYear = (y) => (y.length === 2 ? (Number(y) > new Date().getFullYear() % 100 ? 1900 : 2000) + Number(y) : Number(y));

/**
 * "15/06/1972", "15-6-72", "1972-06-15", "१५ जून १९७२", "15 june 1972" -> "1972-06-15".
 * Returns null when it cannot be read as a date.
 */
export function parseDate(input) {
  const s = clean(input);
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/);
  if (m) return `${fullYear(m[3])}-${pad(m[2])}-${pad(m[1])}`;
  // day month-name year, in any order the recogniser produces ("१५ जून १९७२", "जून 15 1972")
  const monthIndex = MONTHS.findIndex((names) => names.some((n) => s.split(' ').includes(n)));
  if (monthIndex >= 0) {
    const numbers = s.match(/\d+/g) ?? [];
    const year = numbers.find((n) => n.length === 4);
    const day = numbers.find((n) => n.length <= 2);
    if (year && day) return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
  }
  return null;
}
