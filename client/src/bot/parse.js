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

/**
 * What a resident typed or said at the main menu: 'register' | 'notices' | 'schemes' | 'certificate' |
 * 'contact' | 'greet' | null. Village speech mixes Marathi, Hindi and English ("लाईट कधी येणार?").
 */
export function detectIntent(input, { staff = false } = {}) {
  const s = clean(input);
  if (!s) return null;
  const has = (...words) => words.some((w) => s.includes(w));
  // Staff-only requests read collected data; they are never offered to a signed-out visitor (and the
  // server refuses the underlying calls without a staff session anyway).
  if (staff) {
    if (has('वाढदिवस', 'birthday', 'anniversary', 'शुभेच्छा')) return 'birthdays';
    if (has('शोध', 'शोधा', 'search', 'find', 'कुठे')) return 'search';
    if (has('सारांश', 'आकडे', 'डॅशबोर्ड', 'dashboard', 'summary', 'आज किती')) return 'summary';
  }
  if (has('दाखला', 'दाखले', 'प्रमाणपत्र', 'सर्टिफिकेट', 'certificate', 'जन्म', 'मृत्यू')) return 'certificate';
  if (has('लाईट', 'लाइट', 'वीज', 'बिजली', 'पाणी', 'पानी', 'नळ', 'light', 'power', 'water', 'electric')) return 'notices';
  if (has('योजना', 'स्कीम', 'scheme', 'yojana', 'अनुदान', 'घरकुल', 'पेन्शन')) return 'schemes';
  if (has('नोंद', 'register', 'सर्वे', 'survey', 'कुटुंब', 'family')) return 'register';
  if (has('संपर्क', 'फोन', 'पत्ता', 'कार्यालय', 'ऑफिस', 'contact', 'phone', 'office', 'address')) return 'contact';
  if (has('नमस्कार', 'राम राम', 'नमस्ते', 'हॅलो', 'hello', 'hi', 'जय')) return 'greet';
  return null;
}

// Words that say nothing about *which* scheme ("योजना" alone would match every scheme).
const SCHEME_STOPWORDS = new Set(['योजना', 'योजनेची', 'योजनेचा', 'योजनेबद्दल', 'योजनांची', 'काही', 'आहे', 'आहेत', 'का', 'साठी', 'माहिती',
  'हवी', 'हवा', 'सांगा', 'मला', 'आम्हाला', 'कोणती', 'scheme', 'schemes', 'yojana', 'for', 'any', 'about', 'is', 'there']);

/**
 * Schemes matching the words of a query (title, category, summary). Marathi adds endings to words
 * ("शेतीसाठी", "महिलांसाठी"), so a query word also matches when it starts with a word of the scheme.
 */
export function searchSchemes(query, schemes) {
  const words = clean(query).split(' ').filter((w) => w.length > 1 && !SCHEME_STOPWORDS.has(w));
  if (!words.length) return [];
  return schemes
    .map((s) => {
      const hay = clean(`${s.title} ${s.category} ${s.summary}`);
      const hayWords = hay.split(' ').filter((h) => h.length >= 3);
      const hits = words.filter((w) => hay.includes(w) || hayWords.some((h) => w.startsWith(h))).length;
      return { s, score: hits + (clean(s.category) === clean(query) ? 2 : 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
}

/**
 * Long text (a scheme's details) is spoken in pieces of at most `max` characters - the server takes up to
 * 600. Pieces end at sentence ends where possible, else between words; nothing is dropped.
 */
export function splitForSpeech(text, max = 450) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const units = [];
  for (const sentence of clean.split(/(?<=[.?!।])\s+/)) {
    if (sentence.length <= max) { units.push(sentence); continue; }
    for (const word of sentence.split(' ')) {
      for (let i = 0; i < word.length; i += max) units.push(word.slice(i, i + max));
    }
  }
  const chunks = [];
  let cur = '';
  for (const unit of units) {
    if (cur && cur.length + 1 + unit.length > max) {
      chunks.push(cur);
      cur = unit;
    } else {
      cur = cur ? `${cur} ${unit}` : unit;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
