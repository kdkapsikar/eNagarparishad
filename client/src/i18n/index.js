// Tiny i18n layer, Marathi first. Every string lives in strings.js as { key: [मराठी, English] }, so a
// translation can never be missing. The current language lives in this module (set by LanguageProvider)
// so non-React code - the API client, the bot - can use it; components call useT() to re-render on change.
import STRINGS, { FIELD_LABELS, SERVER_MESSAGES } from './strings.js';

export const LANGS = [
  // -u-nu-latn keeps 0-9 digits so numbers match phone numbers and IDs typed elsewhere.
  { code: 'mr', label: 'मराठी', intl: 'mr-IN-u-nu-latn', index: 0 },
  { code: 'en', label: 'English', intl: 'en-IN', index: 1 },
];
const STORAGE_KEY = 'enp_lang';

let current = 'mr';
export const getLang = () => current;
export const intlLocale = () => LANGS.find((l) => l.code === current).intl;
const langIndex = () => LANGS.find((l) => l.code === current).index;

export function setLang(code) {
  if (LANGS.some((l) => l.code === code)) current = code;
}

/** Marathi unless the visitor picked English before. */
export function detectInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.some((l) => l.code === saved)) return saved;
  } catch { /* storage blocked */ }
  return 'mr';
}

export function persistLang(code) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
}

/** t('key', { name }) fills {name}. Unknown keys come back as the key, which makes them easy to spot. */
export function translate(key, params = {}) {
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[langIndex()].replace(/\{(\w+)\}/g, (whole, name) => (params[name] !== undefined ? String(params[name]) : whole));
}

// ---- server messages -------------------------------------------------------------------------
// The API answers in English. Exact messages are looked up in SERVER_MESSAGES; the ones the validation
// helper builds from a field label ("<Label> is required") are matched by pattern.
const label = (name) => (FIELD_LABELS[name] ? FIELD_LABELS[name][langIndex()] : name);

export function translateServerMessage(message) {
  if (current === 'en' || typeof message !== 'string') return message;
  if (SERVER_MESSAGES[message]) return SERVER_MESSAGES[message];
  let m = message.match(/^(.+) is required$/);
  if (m) return translate('srv.required', { field: label(m[1]) });
  m = message.match(/^(.+) must be at most (\d+) characters$/);
  if (m) return translate('srv.max', { field: label(m[1]), n: m[2] });
  m = message.match(/^(.+) must be a valid date$/);
  if (m) return translate('srv.date', { field: label(m[1]) });
  m = message.match(/^(.+) cannot be in the future$/);
  if (m) return translate('srv.future', { field: label(m[1]) });
  m = message.match(/^At most (\d+) rows can be uploaded at once$/);
  if (m) return translate('srv.maxRows', { n: m[1] });
  m = message.match(/^The file must be smaller than (\d+) MB$/);
  if (m) return translate('srv.fileSize', { n: m[1] });
  // zod's own wording for a value outside a list / of the wrong type (e.g. gender "M" in an upload)
  if (/^(Invalid option|Invalid input|Too small|Too big)/.test(message)) return translate('srv.invalidValue');
  return message;
}
