// The bot's conversation: the same questions as the paper forms (docs/FORMS.md), one at a time.
//
// A "position" is { step, member } (member = index into data.members for per-person steps). sequence()
// lists every position for the current answers; a step whose `when` is false is skipped. Answers live
// in `data` = { household: {...}, members: [{...}] } and become the API payload via toPayload().
import { translate as t } from '../i18n/index.js';
import { ageFrom } from '../lib/format.js';
import { isValidPastDate, normalizeAadhaar, normalizeMobile, normalizePan, normalizeVoterId } from '../lib/validation.js';
import { compactCode, matchOption, parseDate, parseYesNo } from './parse.js';

// ---- answer options ----------------------------------------------------------------------------
// value = what is stored. Free-text columns (relation, education, occupation) store the Marathi word,
// so the data reads the same whichever language the bot was used in.
const opt = (value, key, ...synonyms) => ({ value, key, labels: [t(key), ...synonyms, value] });

export const OPTIONS = {
  yesno: () => [opt(true, 'common.yes', 'होय', 'हो', 'yes'), opt(false, 'common.no', 'नाही', 'no')],
  gender: () => [
    opt('male', 'gender.male', 'पुरुष', 'पुरूष', 'male', 'man'),
    opt('female', 'gender.female', 'स्त्री', 'महिला', 'female', 'woman'),
    opt('other', 'gender.other', 'इतर', 'other'),
  ],
  category: () => [
    opt('open', 'category.open', 'खुला', 'open', 'general'), opt('obc', 'category.obc', 'ओबीसी', 'इमाव', 'obc'),
    opt('sc', 'category.sc', 'अनुसूचित जाती', 'एससी', 'sc'), opt('st', 'category.st', 'अनुसूचित जमाती', 'एसटी', 'st'),
    opt('vjnt', 'category.vjnt', 'भटक्या', 'विमुक्त', 'vjnt', 'nt'), opt('sbc', 'category.sbc', 'विशेष मागास', 'sbc'),
    opt('sebc', 'category.sebc', 'मराठा', 'sebc'), opt('ews', 'category.ews', 'आर्थिक दुर्बल', 'ews'),
    opt('other', 'category.other', 'इतर', 'other'),
  ],
  relation: () => [
    opt('पत्नी', 'relation.wife', 'बायको', 'wife'), opt('पती', 'relation.husband', 'नवरा', 'husband'),
    opt('मुलगा', 'relation.son', 'son'), opt('मुलगी', 'relation.daughter', 'daughter'),
    opt('आई', 'relation.mother', 'mother'), opt('वडील', 'relation.father', 'बाबा', 'father'),
    opt('सून', 'relation.daughterInLaw', 'daughter in law'), opt('जावई', 'relation.sonInLaw', 'son in law'),
    opt('नातू', 'relation.grandson', 'grandson'), opt('नात', 'relation.granddaughter', 'granddaughter'),
    opt('भाऊ', 'relation.brother', 'brother'), opt('बहीण', 'relation.sister', 'sister'),
    opt('इतर', 'relation.other', 'other'),
  ],
  education: () => [
    opt('अशिक्षित', 'education.none', 'शिक्षण नाही', 'none'), opt('प्राथमिक (१-७)', 'education.primary', 'प्राथमिक', 'primary'),
    opt('माध्यमिक (८-१०)', 'education.secondary', 'दहावी', '१० वी', 'secondary', '10th'),
    opt('उच्च माध्यमिक (१२ वी)', 'education.higherSecondary', 'बारावी', '१२ वी', '12th'),
    opt('आयटीआय / डिप्लोमा', 'education.diploma', 'आयटीआय', 'डिप्लोमा', 'iti', 'diploma'),
    opt('पदवीधर', 'education.graduate', 'पदवी', 'graduate', 'degree'), opt('पदव्युत्तर', 'education.postGraduate', 'post graduate'),
    opt('शाळेत शिकत आहे', 'education.studying', 'शाळा', 'school'),
  ],
  occupation: () => [
    opt('शेती', 'occupation.farming', 'शेतकरी', 'farming', 'farmer'), opt('शेतमजूर', 'occupation.farmLabour', 'farm labour'),
    opt('मजुरी', 'occupation.labour', 'मजूर', 'labour'), opt('खासगी नोकरी', 'occupation.privateJob', 'नोकरी', 'job', 'private job'),
    opt('शासकीय नोकरी', 'occupation.govtJob', 'सरकारी नोकरी', 'government job'),
    opt('व्यवसाय / दुकान', 'occupation.business', 'व्यवसाय', 'दुकान', 'business', 'shop'),
    opt('गृहिणी', 'occupation.homemaker', 'housewife', 'homemaker'), opt('विद्यार्थी', 'occupation.student', 'student'),
    opt('निवृत्त', 'occupation.retired', 'retired'), opt('बेरोजगार', 'occupation.unemployed', 'unemployed'),
  ],
};

const FEMALE = ['पत्नी', 'मुलगी', 'आई', 'सून', 'नात', 'बहीण'];
const MALE = ['पती', 'मुलगा', 'वडील', 'जावई', 'नातू', 'भाऊ'];
const impliedGender = (relation) => (FEMALE.includes(relation) ? 'female' : MALE.includes(relation) ? 'male' : null);
const isAdult = (m) => (m.dob ? ageFrom(m.dob) >= 18 : true);

// ---- parsers -----------------------------------------------------------------------------------
// Each returns { value } or { error: '<string key>' }.
const textParser = (max) => (input) => {
  const v = input.trim();
  if (!v) return { error: 'bot.err.empty' };
  return v.length > max ? { error: 'bot.err.tooLong' } : { value: v };
};
const optionParser = (name, { free = false } = {}) => (input) => {
  const value = matchOption(input, OPTIONS[name]());
  if (value !== null) return { value };
  return free && input.trim() ? { value: input.trim().slice(0, 80) } : { error: 'bot.err.choose' };
};
const yesNoParser = (input) => {
  const value = parseYesNo(input);
  return value === null ? { error: 'bot.err.yesNo' } : { value };
};
const codeParser = (normalize, error) => (input) => {
  const value = normalize(compactCode(input)) ?? normalize(input);
  return value ? { value } : { error };
};
const dateParser = (input) => {
  const value = parseDate(input);
  if (!value) return { error: 'bot.err.date' };
  return isValidPastDate(value) ? { value } : { error: 'bot.err.dateRange' };
};

// ---- steps -------------------------------------------------------------------------------------
// scope: where the answer is stored. input: how the answer box looks ('text' | 'tel' | 'date' | 'code').
// options: quick-reply buttons. optional: offers "Skip".
export const STEPS = {
  consent: {
    scope: 'flow', options: 'yesno', parse: yesNoParser,
    ask: () => t('bot.q.consent'),
  },
  head_name: { scope: 'household', parse: textParser(120), ask: () => t('bot.q.headName') },
  mobile: {
    scope: 'household', input: 'tel', parse: codeParser(normalizeMobile, 'bot.err.mobile'),
    optional: ({ mode }) => mode === 'staff', ask: () => t('bot.q.mobile'),
  },
  whatsapp: {
    scope: 'household', input: 'tel', optional: () => true,
    ask: ({ data }) => (data.household.mobile ? t('bot.q.whatsappSame', { mobile: data.household.mobile }) : t('bot.q.whatsapp')),
    options: ({ data }) => (data.household.mobile ? 'sameNumber' : null),
    parse: (input, { data }) => {
      if (data.household.mobile && (parseYesNo(input) === true || /same|हाच|तोच|सेम/i.test(input))) return { value: data.household.mobile };
      return codeParser(normalizeMobile, 'bot.err.mobile')(input);
    },
  },
  address: { scope: 'household', parse: textParser(300), ask: () => t('bot.q.address') },
  area: { scope: 'household', optional: () => true, parse: textParser(80), ask: () => t('bot.q.area') },
  category: {
    scope: 'household', options: 'category', optional: () => true, parse: optionParser('category'),
    ask: () => t('bot.q.category'),
  },
  caste: { scope: 'household', optional: () => true, parse: textParser(60), ask: () => t('bot.q.caste') },
  has_farm: { scope: 'household', options: 'yesno', parse: yesNoParser, ask: () => t('bot.q.hasFarm') },
  farm_details: {
    scope: 'household', when: ({ data }) => data.household.has_farm === true, optional: () => true,
    parse: textParser(300), ask: () => t('bot.q.farmDetails'),
  },
  has_disability: { scope: 'household', options: 'yesno', parse: yesNoParser, ask: () => t('bot.q.hasDisability') },
  disability: {
    scope: 'household', when: ({ data }) => data.household.has_disability === true, optional: () => true,
    parse: textParser(200), ask: () => t('bot.q.disability'),
  },
  has_internet: { scope: 'household', options: 'yesno', optional: () => true, parse: yesNoParser, ask: () => t('bot.q.internet') },
  has_water_filter: { scope: 'household', options: 'yesno', optional: () => true, parse: yesNoParser, ask: () => t('bot.q.waterFilter') },
  has_anganwadi: { scope: 'household', options: 'yesno', optional: () => true, parse: yesNoParser, ask: () => t('bot.q.anganwadi') },
  gharkul_benefit: { scope: 'household', options: 'yesno', optional: () => true, parse: yesNoParser, ask: () => t('bot.q.gharkul') },
  other_issues: { scope: 'household', optional: () => true, parse: textParser(1000), ask: () => t('bot.q.otherIssues') },

  // per person; member 0 is the head of the family
  name: {
    scope: 'member', when: ({ member }) => member > 0, parse: textParser(120),
    ask: ({ member }) => t('bot.q.memberName', { n: member + 1 }),
  },
  relation: {
    scope: 'member', when: ({ member }) => member > 0, options: 'relation', parse: optionParser('relation', { free: true }),
    ask: ({ m }) => t('bot.q.relation', { name: m.name }),
  },
  gender: {
    scope: 'member', when: ({ m }) => !impliedGender(m.relation), options: 'gender', parse: optionParser('gender'),
    ask: ({ m }) => t('bot.q.gender', { name: m.name }),
  },
  dob: {
    scope: 'member', input: 'date', optional: () => true, parse: dateParser,
    ask: ({ m }) => t('bot.q.dob', { name: m.name }),
  },
  anniversary: {
    scope: 'member', input: 'date', optional: () => true, parse: dateParser,
    when: ({ m }) => isAdult(m) && !['मुलगा', 'मुलगी', 'नातू', 'नात'].includes(m.relation),
    ask: ({ m }) => t('bot.q.anniversary', { name: m.name }),
  },
  education: {
    scope: 'member', options: 'education', optional: () => true, parse: optionParser('education', { free: true }),
    ask: ({ m }) => t('bot.q.education', { name: m.name }),
  },
  occupation: {
    scope: 'member', options: 'occupation', optional: () => true, parse: optionParser('occupation', { free: true }),
    ask: ({ m }) => t('bot.q.occupation', { name: m.name }),
  },
  member_mobile: {
    scope: 'member', field: 'mobile', input: 'tel', optional: () => true, when: ({ member }) => member > 0,
    parse: codeParser(normalizeMobile, 'bot.err.mobile'), ask: ({ m }) => t('bot.q.memberMobile', { name: m.name }),
  },
  aadhaar: {
    scope: 'member', input: 'code', optional: () => true, parse: codeParser(normalizeAadhaar, 'bot.err.aadhaar'),
    ask: ({ m }) => t('bot.q.aadhaar', { name: m.name }),
  },
  voter_id: {
    scope: 'member', input: 'code', optional: () => true, when: ({ m }) => isAdult(m),
    parse: codeParser(normalizeVoterId, 'bot.err.voterId'), ask: ({ m }) => t('bot.q.voterId', { name: m.name }),
  },
  pan: {
    scope: 'member', input: 'code', optional: () => true, when: ({ m }) => isAdult(m),
    parse: codeParser(normalizePan, 'bot.err.pan'), ask: ({ m }) => t('bot.q.pan', { name: m.name }),
  },
  more: {
    scope: 'flow', options: 'yesno', parse: yesNoParser,
    ask: ({ data }) => t('bot.q.more', { n: data.members.length }),
  },
};

const HOUSEHOLD_ORDER = ['head_name', 'mobile', 'whatsapp', 'address', 'area', 'category', 'caste', 'has_farm', 'farm_details',
  'has_disability', 'disability', 'has_internet', 'has_water_filter', 'has_anganwadi', 'gharkul_benefit', 'other_issues'];
const MEMBER_ORDER = ['name', 'relation', 'gender', 'dob', 'anniversary', 'education', 'occupation', 'member_mobile', 'aadhaar', 'voter_id', 'pan'];

export const emptyData = () => ({ household: {}, members: [{}], consent: null });

const ctxFor = (pos, data, mode) => ({ ...pos, data, mode, m: data.members[pos.member ?? 0] ?? {} });

export function isActive(pos, data, mode) {
  const step = STEPS[pos.step];
  return !step.when || step.when(ctxFor(pos, data, mode));
}

/** Every position, in order, for the answers so far. */
export function sequence(data) {
  const list = [{ step: 'consent' }, ...HOUSEHOLD_ORDER.map((step) => ({ step }))];
  data.members.forEach((_, member) => {
    list.push(...MEMBER_ORDER.map((step) => ({ step, member })), { step: 'more', member });
  });
  return list;
}

const same = (a, b) => a.step === b.step && (a.member ?? null) === (b.member ?? null);

/** The position after `pos` (skipping inactive steps), or { step: 'summary' } at the end. */
export function nextPosition(pos, data, mode) {
  const list = sequence(data);
  const i = list.findIndex((p) => same(p, pos));
  for (let j = i + 1; j < list.length; j += 1) if (isActive(list[j], data, mode)) return list[j];
  return { step: 'summary' };
}

export const questionText = (pos, data, mode) => STEPS[pos.step].ask(ctxFor(pos, data, mode));
export const isOptional = (pos, data, mode) => Boolean(STEPS[pos.step].optional?.(ctxFor(pos, data, mode)));
export const inputType = (pos) => STEPS[pos.step].input ?? 'text';

/** Quick-reply buttons for a position: [{ label, answer }]. */
export function quickReplies(pos, data, mode) {
  const step = STEPS[pos.step];
  const name = typeof step.options === 'function' ? step.options(ctxFor(pos, data, mode)) : step.options;
  if (name === 'sameNumber') return [{ label: t('bot.sameNumber'), answer: data.household.mobile }];
  return name ? OPTIONS[name]().map((o) => ({ label: t(o.key), answer: t(o.key) })) : [];
}

/** Parse an answer and store it. Returns { ok: true } or { error: '<message>' }. */
export function applyAnswer(pos, data, mode, input) {
  const step = STEPS[pos.step];
  const parsed = step.parse(String(input ?? ''), ctxFor(pos, data, mode));
  if (parsed.error) return { error: t(parsed.error) };
  store(pos, data, parsed.value);
  return { ok: true, value: parsed.value };
}

/** "Skip" on an optional question. */
export function skipAnswer(pos, data) {
  store(pos, data, null);
}

function store(pos, data, value) {
  const step = STEPS[pos.step];
  const field = step.field ?? pos.step;
  if (pos.step === 'consent') data.consent = value;
  else if (pos.step === 'more') {
    if (value && !data.members[pos.member + 1]) data.members.push({});
    else if (!value) data.members.splice(pos.member + 1); // "no more" after going back: drop people added later
  } else if (step.scope === 'household') {
    data.household[field] = value;
    // The head of the family is member 1; keep their name / mobile in step.
    if (field === 'head_name') Object.assign(data.members[0], { name: value, relation: 'स्वतः' });
    if (field === 'mobile') data.members[0].mobile = value;
  } else {
    const m = data.members[pos.member];
    m[field] = value;
    if (field === 'relation' && impliedGender(value)) m.gender = impliedGender(value);
  }
}

/** The API payload (server householdSchema). */
export function toPayload(data) {
  const h = data.household;
  return {
    head_name: h.head_name, mobile: h.mobile ?? null, whatsapp: h.whatsapp ?? null, address: h.address ?? null,
    area: h.area ?? null, caste: h.caste ?? null, category: h.category ?? null,
    farm_details: h.has_farm ? h.farm_details ?? t('common.yes') : null,
    disability: h.has_disability ? h.disability ?? t('common.yes') : null,
    has_internet: h.has_internet ?? null, has_water_filter: h.has_water_filter ?? null,
    has_anganwadi: h.has_anganwadi ?? null, gharkul_benefit: h.gharkul_benefit ?? null,
    other_issues: h.other_issues ?? null, consent: data.consent === true,
    members: data.members.filter((m) => m.name).map((m) => ({
      name: m.name, relation: m.relation ?? null, dob: m.dob ?? null, anniversary: m.anniversary ?? null,
      gender: m.gender ?? null, education: m.education ?? null, occupation: m.occupation ?? null, mobile: m.mobile ?? null,
      aadhaar: m.aadhaar ?? null, pan: m.pan ?? null, voter_id: m.voter_id ?? null,
    })),
  };
}

/** Map a server field error key ("members.1.pan", "mobile") back to the question that asks it. */
export function positionForField(key) {
  const [first, index, field] = key.split('.');
  if (first === 'members') {
    const step = field === 'mobile' ? 'member_mobile' : field;
    return STEPS[step] ? { step, member: Number(index) } : null;
  }
  if (first === 'farm_details') return { step: 'farm_details' };
  return STEPS[first] ? { step: first } : null;
}
