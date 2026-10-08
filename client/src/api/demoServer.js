// DEMO MODE ONLY (build with VITE_DEMO=true - the GitHub Pages copy when no API is configured).
// Answers the same /api calls as the real server, from data kept in this browser's localStorage, so the
// whole app can be tried without a backend. Nothing leaves the browser; each visitor has their own copy.
// The real rules (validation, privacy, permissions) live in server/ - this is a stand-in, not a substitute.
import { DEMO_SCHEMES } from './demoSchemes.js';
import { normalizeAadhaar, normalizeMobile, normalizePan, normalizeVoterId, isValidPastDate } from '../lib/validation.js';

const KEY = 'enp_demo_db_v1';
const TOKEN_PREFIX = 'demo-';

export const DEMO_LOGINS = [
  { username: 'admin', password: 'admin12345', role: 'admin', name: 'कार्यालय प्रमुख' },
  { username: 'volunteer1', password: 'volunteer123', role: 'volunteer', name: 'स्वयंसेवक १' },
];

class DemoError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
const fail = (status, message, fields) => { throw new DemoError(status, message, fields); };
const invalid = (fields) => fail(400, 'Please fix the highlighted fields', fields);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const now = () => new Date().toISOString();
const inDays = (n, hours = 0) => new Date(Date.now() + n * 86400000 + hours * 3600000).toISOString();

function seed() {
  const md = today().slice(4); // "-MM-DD": today's birthday / anniversary in the sample data
  const db = {
    seq: 100,
    users: DEMO_LOGINS.map((u, i) => ({ id: i + 1, ...u, is_active: true, created_at: now() })),
    sessions: {},
    households: [],
    notices: [
      { id: 1, kind: 'electricity', title: 'उद्या सकाळी वीजपुरवठा बंद', body: 'देखभाल कामासाठी उद्या सकाळी ९ ते दुपारी १ वीजपुरवठा बंद राहील.', area: 'टिळक वार्ड', starts_at: inDays(1), ends_at: inDays(1, 4), created_at: now() },
      { id: 2, kind: 'water', title: 'पाणीपुरवठा वेळेत बदल', body: 'जलवाहिनी दुरुस्तीमुळे पुढील दोन दिवस पाणीपुरवठा सायंकाळी ६ वाजता होईल.', area: null, starts_at: now(), ends_at: inDays(2), created_at: now() },
    ],
    schemes: DEMO_SCHEMES.map((s) => ({ ...s, created_at: now(), updated_at: now() })),
    certificates: [],
    messages: [],
    settings: {
      office_name: 'नगरसेवक कार्यालय (डेमो)', ward_label: 'प्रभाग क्र. —, नगर परिषद', office_address: 'जनसंपर्क कार्यालय, मुख्य चौक',
      office_phone: '', sender_name: 'आपला नगरसेवक',
      template_birthday: '{name}, वाढदिवसाच्या हार्दिक शुभेच्छा! 🎂 आपणास उत्तम आरोग्य व दीर्घायुष्य लाभो. — {sender}',
      template_anniversary: '{name}, लग्नाच्या वाढदिवसाच्या हार्दिक शुभेच्छा! 💐 आपले सहजीवन सुखाचे जावो. — {sender}',
      template_notice: '📢 {title}\n{body}\n— {sender}',
    },
  };
  const add = (h, members) => {
    const id = (db.seq += 1);
    db.households.push({
      id, consent: true, consent_at: now(), source: 'form', verified: true, created_by: 1, created_at: now(), updated_at: now(),
      caste: null, farm_details: null, disability: null, other_issues: null, whatsapp: null, ...h,
      members: members.map((m, i) => ({ id: (db.seq += 1), position: i + 1, relation: null, dob: null, anniversary: null, gender: null, education: null, occupation: null, mobile: null, aadhaar_last4: null, pan_last4: null, voter_id: null, ...m })),
    });
  };
  add({ head_name: 'रामराव पाटील', mobile: '9800000001', whatsapp: '9800000001', address: 'घर क्र. १२, लोकमान्य टिळक वार्ड', area: 'टिळक वार्ड', category: 'open', farm_details: '२ एकर कोरडवाहू', has_internet: true, has_water_filter: false, has_anganwadi: false, gharkul_benefit: false, other_issues: 'गल्लीतील पथदिवे बंद आहेत' }, [
    { name: 'रामराव पाटील', relation: 'स्वतः', dob: `1972${md}`, anniversary: '1995-05-10', gender: 'male', education: '१२ वी', occupation: 'शेती', mobile: '9800000001', aadhaar_last4: '1234', voter_id: 'ABC1234567' },
    { name: 'सुनीता पाटील', relation: 'पत्नी', dob: '1978-03-02', anniversary: '1995-05-10', gender: 'female', education: '१० वी', occupation: 'गृहिणी' },
    { name: 'अमोल पाटील', relation: 'मुलगा', dob: '2001-11-20', gender: 'male', education: 'बी.कॉम', occupation: 'विद्यार्थी', mobile: '9800000002', pan_last4: '234F' },
  ]);
  add({ head_name: 'शबाना शेख', mobile: '9800000011', address: 'हुतात्मा चौक जवळ', area: 'हुतात्मा चौक', category: 'obc', has_internet: false, has_water_filter: false, has_anganwadi: true, gharkul_benefit: true }, [
    { name: 'शबाना शेख', relation: 'स्वतः', dob: '1985-08-15', anniversary: `2005${md}`, gender: 'female', occupation: 'शिवणकाम', mobile: '9800000011' },
    { name: 'आयान शेख', relation: 'मुलगा', dob: '2012-01-26', gender: 'male', education: '८ वी' },
  ]);
  add({ head_name: 'गणपत जाधव', mobile: '9800000021', address: 'शिवाजी नगर', area: 'शिवाजी नगर', category: 'sc', disability: 'होय - पायाचे अपंगत्व', has_internet: false, has_water_filter: true, has_anganwadi: false, gharkul_benefit: false }, [
    { name: 'गणपत जाधव', relation: 'स्वतः', dob: '1950-12-01', gender: 'male', occupation: 'निवृत्त' },
  ]);
  return db;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to a fresh copy */ }
  const db = seed();
  save(db);
  return db;
}
function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked: demo keeps working in memory */ }
}
export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// ---- helpers mirroring the server ---------------------------------------------------------------
const blank = (v) => v === undefined || v === null || String(v).trim() === '';
const text = (v) => (blank(v) ? null : String(v).trim());

function cleanHousehold(body) {
  const fields = {};
  const phone = (key, v) => {
    if (blank(v)) return null;
    const p = normalizeMobile(v);
    if (!p) fields[key] = 'Enter a valid 10-digit Indian mobile number';
    return p;
  };
  const date = (key, v, label) => {
    if (blank(v)) return null;
    if (!isValidPastDate(v)) fields[key] = `${label} must be a valid date`;
    return v;
  };
  if (blank(body.head_name)) fields.head_name = 'Head of family is required';
  if (body.consent !== true) fields.consent = 'Consent of the family is required';
  const h = {
    head_name: text(body.head_name), mobile: phone('mobile', body.mobile), whatsapp: phone('whatsapp', body.whatsapp),
    address: text(body.address), area: text(body.area), caste: text(body.caste), category: text(body.category),
    farm_details: text(body.farm_details), disability: text(body.disability), other_issues: text(body.other_issues),
    has_internet: body.has_internet ?? null, has_water_filter: body.has_water_filter ?? null,
    has_anganwadi: body.has_anganwadi ?? null, gharkul_benefit: body.gharkul_benefit ?? null,
  };
  const members = (body.members ?? []).map((m, i) => {
    const k = (f) => `members.${i}.${f}`;
    if (blank(m.name)) fields[k('name')] = 'Name is required';
    let aadhaar = null;
    if (!blank(m.aadhaar)) {
      aadhaar = normalizeAadhaar(m.aadhaar);
      if (!aadhaar) fields[k('aadhaar')] = 'Enter the 12-digit Aadhaar number (only its last 4 digits are kept)';
    }
    let pan = null;
    if (!blank(m.pan)) {
      pan = normalizePan(m.pan);
      if (!pan) fields[k('pan')] = 'Enter a valid PAN, e.g. ABCDE1234F';
    }
    let voter = null;
    if (!blank(m.voter_id)) {
      voter = normalizeVoterId(m.voter_id);
      if (!voter) fields[k('voter_id')] = 'Enter a valid voter ID (EPIC) number';
    }
    return {
      id: m.id, pan_clear: m.pan_clear, name: text(m.name), relation: text(m.relation),
      dob: date(k('dob'), m.dob, 'Date of birth'), anniversary: date(k('anniversary'), m.anniversary, 'Anniversary'),
      gender: text(m.gender), education: text(m.education), occupation: text(m.occupation),
      mobile: phone(k('mobile'), m.mobile), aadhaar_last4: aadhaar, pan_last4: pan ? pan.slice(-4) : null, voter_id: voter,
    };
  });
  if (Object.keys(fields).length) invalid(fields);
  return { h, members };
}

const serializeMember = (m) => ({ ...m, pan_masked: m.pan_last4 ? `XXXXXX${m.pan_last4}` : null, pan_last4: undefined });
const serializeHousehold = (db, h) => ({
  ...h, created_by_name: db.users.find((u) => u.id === h.created_by)?.name ?? null, members: h.members.map(serializeMember),
});

const monthDayKeys = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const keys = [iso.slice(5)];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (m === 2 && d === 28 && !leap) keys.push('02-29');
  return keys;
};
function occasions(db) {
  const keys = monthDayKeys(today());
  const out = [];
  for (const h of db.households) {
    for (const m of h.members) {
      const phone = m.mobile ?? h.whatsapp ?? h.mobile;
      if (m.dob && keys.includes(m.dob.slice(5))) out.push({ kind: 'birthday', m, h, phone });
      if (m.anniversary && keys.includes(m.anniversary.slice(5))) out.push({ kind: 'anniversary', m, h, phone });
    }
  }
  return out;
}
const render = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (w, k) => vars[k] ?? w);
function prepareDaily(db) {
  const date = today();
  for (const o of occasions(db)) {
    if (!o.phone) continue;
    if (db.messages.some((x) => x.kind === o.kind && x.member_id === o.m.id && x.for_date === date)) continue;
    const tpl = o.kind === 'birthday' ? db.settings.template_birthday : db.settings.template_anniversary;
    db.messages.push({ id: (db.seq += 1), kind: o.kind, member_id: o.m.id, household_id: o.h.id, recipient: o.m.name, phone: o.phone,
      body: render(tpl, { name: o.m.name, sender: db.settings.sender_name }), for_date: date, status: 'pending', created_at: now() });
  }
}

const CERT_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const certId = (kind) => `${kind === 'birth' ? 'JN' : 'MR'}-${String(new Date().getFullYear()).slice(-2)}-${
  Array.from({ length: 6 }, () => CERT_ALPHABET[Math.floor(Math.random() * CERT_ALPHABET.length)]).join('')}`;

// ---- request handler ----------------------------------------------------------------------------
export async function demoRequest(path, { method = 'GET', json } = {}, token) {
  await new Promise((r) => setTimeout(r, 120)); // feel like a network call
  const db = load();
  const [pathname, search = ''] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  const parts = pathname.split('/').filter(Boolean);
  const user = token?.startsWith(TOKEN_PREFIX) ? db.users.find((u) => u.id === db.sessions[token] && u.is_active) ?? null : null;
  const publicUser = user && { id: user.id, name: user.name, username: user.username, role: user.role };
  const staff = () => user || fail(401, 'Please sign in');
  const admin = () => (staff().role === 'admin' ? user : fail(403, 'Only the office admin can do this'));
  const body = json ?? {};
  const done = (result) => { save(db); return result; };
  const route = `${method} /${parts.map((p) => (/^[\w-]*\d[\w-]*$/.test(p) && !['public', 'auth'].includes(p) ? ':id' : p)).join('/')}`;
  const id = parts.find((p, i) => i > 0 && /\d/.test(p));
  const numId = Number(id);

  switch (route) {
    // public
    case 'GET /public/settings':
      return { settings: Object.fromEntries(['office_name', 'ward_label', 'office_address', 'office_phone', 'sender_name'].map((k) => [k, db.settings[k] ?? ''])) };
    case 'GET /public/notices':
      return { notices: db.notices.filter((n) => (n.ends_at ? n.ends_at > now() : n.created_at > inDays(-15))).sort((a, b) => (b.starts_at ?? b.created_at).localeCompare(a.starts_at ?? a.created_at)) };
    case 'GET /public/schemes':
      return { schemes: db.schemes.filter((s) => s.is_active).sort((a, b) => Number(b.is_new) - Number(a.is_new) || a.title.localeCompare(b.title)) };
    case 'GET /public/schemes/:id':
      return { scheme: db.schemes.find((s) => s.id === numId && s.is_active) ?? fail(404, 'Scheme not found') };
    case 'POST /public/self-register': {
      const { h, members } = cleanHousehold(body);
      if (!h.mobile && !h.whatsapp) invalid({ mobile: 'Enter a valid 10-digit Indian mobile number' });
      db.households.push({ id: (db.seq += 1), ...h, consent: true, consent_at: now(), source: 'self', verified: false, created_by: null, created_at: now(), updated_at: now(),
        members: members.map((m, i) => ({ ...m, id: (db.seq += 1), position: i + 1, pan_clear: undefined })) });
      return done({ ok: true });
    }
    case 'POST /public/certificates': {
      const fields = {};
      for (const [k, label] of [['person_name', 'Name on certificate'], ['event_place', 'Place'], ['address', 'Address'], ['applicant_name', 'Applicant name']]) {
        if (blank(body[k])) fields[k] = `${label} is required`;
      }
      if (!isValidPastDate(body.event_date)) fields.event_date = 'Date must be a valid date';
      const phone = normalizeMobile(body.applicant_phone);
      if (!phone) fields.applicant_phone = 'Enter a valid 10-digit Indian mobile number';
      if (Object.keys(fields).length) invalid(fields);
      const cid = certId(body.kind);
      db.certificates.push({ ...body, id: cid, applicant_phone: phone, status: 'submitted', registration_no: null, created_at: now(), updated_at: now(),
        updates: [{ status: 'submitted', remark: null, created_at: now() }] });
      return done({ id: cid });
    }
    case 'POST /public/certificates/track': {
      const c = db.certificates.find((x) => x.id === String(body.id ?? '').trim().toUpperCase() && x.applicant_phone === normalizeMobile(body.phone));
      if (!c) fail(404, 'No request found with this number and mobile');
      return { request: c, updates: c.updates };
    }
    // auth
    case 'POST /auth/login': {
      const u = db.users.find((x) => x.username.toLowerCase() === String(body.username ?? '').trim().toLowerCase() && x.password === body.password && x.is_active);
      if (!u) fail(401, 'Invalid username or password');
      const t = `${TOKEN_PREFIX}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      db.sessions[t] = u.id;
      return done({ token: t, user: { id: u.id, name: u.name, username: u.username, role: u.role } });
    }
    case 'GET /auth/me':
      return { user: publicUser };
    case 'POST /auth/logout':
      delete db.sessions[token];
      return done(null);
    // staff
    case 'GET /dashboard': {
      staff();
      prepareDaily(db);
      const members = db.households.flatMap((h) => h.members);
      const areas = {};
      db.households.forEach((h) => { areas[h.area ?? ''] = (areas[h.area ?? ''] ?? 0) + 1; });
      const count = (f) => db.households.filter(f).length;
      const seniorCutoff = `${new Date().getFullYear() - 60}${today().slice(4)}`;
      return done({
        today: today(),
        totals: {
          households: db.households.length, members: members.length, unverified: count((h) => !h.verified),
          male: members.filter((m) => m.gender === 'male').length, female: members.filter((m) => m.gender === 'female').length,
          with_voter_id: members.filter((m) => m.voter_id).length, seniors: members.filter((m) => m.dob && m.dob <= seniorCutoff).length,
        },
        areas: Object.entries(areas).map(([area, households]) => ({ area, households })).sort((a, b) => b.households - a.households),
        survey: {
          no_internet: count((h) => h.has_internet === false), no_water_filter: count((h) => h.has_water_filter === false),
          no_anganwadi: count((h) => h.has_anganwadi === false), no_gharkul: count((h) => h.gharkul_benefit === false),
          with_disability: count((h) => h.disability && !/^(नाही|no|none|-)$/i.test(h.disability)), with_issues: count((h) => h.other_issues),
        },
        occasions: occasions(db).map((o) => ({ kind: o.kind, name: o.m.name, head_name: o.h.head_name, area: o.h.area, has_phone: Boolean(o.phone) })),
        pendingMessages: db.messages.filter((m) => m.status === 'pending').length,
        openCertificates: db.certificates.filter((c) => !['delivered', 'rejected'].includes(c.status)).length,
      });
    }
    case 'GET /households': {
      staff();
      const q = (query.q ?? '').toLowerCase();
      let list = db.households.filter((h) => (!query.area || h.area === query.area) && (query.verified !== 'false' || !h.verified));
      if (q) {
        list = list.filter((h) => [h.head_name, h.mobile, h.whatsapp, h.address, ...h.members.flatMap((m) => [m.name, m.mobile, m.voter_id])]
          .some((v) => v && String(v).toLowerCase().includes(q)));
      }
      list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
      const page = Math.max(1, Number(query.page) || 1);
      return {
        households: list.slice((page - 1) * 25, page * 25).map((h) => ({ ...h, member_count: h.members.length, members: undefined })),
        total: list.length, page, pageSize: 25,
      };
    }
    case 'GET /households/areas': {
      staff();
      const areas = {};
      db.households.filter((h) => h.area).forEach((h) => { areas[h.area] = (areas[h.area] ?? 0) + 1; });
      return { areas: Object.entries(areas).sort().map(([area, households]) => ({ area, households })) };
    }
    case 'POST /households': {
      staff();
      const { h, members } = cleanHousehold(body);
      const hh = { id: (db.seq += 1), ...h, consent: true, consent_at: now(), source: body.source === 'bot' ? 'bot' : 'form', verified: true,
        created_by: user.id, created_at: now(), updated_at: now(), members: members.map((m, i) => ({ ...m, id: (db.seq += 1), position: i + 1, pan_clear: undefined })) };
      db.households.push(hh);
      return done({ household: serializeHousehold(db, hh) });
    }
    case 'GET /households/:id': {
      staff();
      const h = db.households.find((x) => x.id === numId) ?? fail(404, 'Family not found');
      return { household: serializeHousehold(db, h) };
    }
    case 'PUT /households/:id': {
      staff();
      const h = db.households.find((x) => x.id === numId) ?? fail(404, 'Family not found');
      const { h: fields, members } = cleanHousehold(body);
      Object.assign(h, fields, { updated_at: now() });
      h.members = members.map((m, i) => {
        const old = h.members.find((x) => x.id === m.id);
        const panLast4 = m.pan_last4 ?? (m.pan_clear ? null : old?.pan_last4 ?? null);
        return { ...m, id: old ? old.id : (db.seq += 1), position: i + 1, pan_last4: panLast4, pan_clear: undefined };
      });
      return done({ household: serializeHousehold(db, h) });
    }
    case 'POST /households/:id/verify': {
      staff();
      const h = db.households.find((x) => x.id === numId) ?? fail(404, 'Family not found');
      h.verified = true;
      return done({ ok: true });
    }
    case 'DELETE /households/:id':
      admin();
      db.households = db.households.filter((x) => x.id !== numId);
      return done(null);
    case 'GET /imports/batches':
      staff();
      return { batches: [] };
    case 'POST /imports':
      staff();
      return fail(400, 'Excel upload needs the real server - it is not available in this demo.');
    case 'GET /messages': {
      staff();
      prepareDaily(db);
      const status = ['pending', 'sent', 'failed', 'skipped'].includes(query.status) ? query.status : 'pending';
      const counts = {};
      db.messages.forEach((m) => { counts[m.status] = (counts[m.status] ?? 0) + 1; });
      return done({ messages: db.messages.filter((m) => m.status === status).reverse(), counts, manual: true, today: today() });
    }
    case 'POST /messages/:id/status': {
      staff();
      const m = db.messages.find((x) => x.id === numId) ?? fail(404, 'Message not found');
      m.status = body.status;
      m.sent_at = body.status === 'sent' ? now() : null;
      return done({ ok: true });
    }
    case 'POST /messages/broadcast': {
      admin();
      let textBody = body.body;
      let kind = 'custom';
      let area = body.area || null;
      if (body.notice_id) {
        const n = db.notices.find((x) => x.id === body.notice_id) ?? fail(404, 'Notice not found');
        textBody = render(db.settings.template_notice, { title: n.title, body: n.body, sender: db.settings.sender_name });
        kind = 'notice';
        area = area ?? n.area;
      } else if (blank(textBody)) {
        invalid({ body: 'Message is required' });
      } else {
        textBody = `${textBody}\n— ${db.settings.sender_name}`;
      }
      const targets = db.households.filter((h) => h.verified && (h.whatsapp || h.mobile) && (!area || h.area === area));
      targets.forEach((h) => db.messages.push({ id: (db.seq += 1), kind, household_id: h.id, recipient: h.head_name, phone: h.whatsapp ?? h.mobile, body: textBody, for_date: today(), status: 'pending', created_at: now() }));
      return done({ count: targets.length });
    }
    case 'GET /certificates':
      staff();
      return { requests: db.certificates.filter((c) => !query.status || c.status === query.status).reverse() };
    case 'GET /certificates/:id': {
      staff();
      const c = db.certificates.find((x) => x.id === decodeURIComponent(id)) ?? fail(404, 'Request not found');
      return { request: c, updates: c.updates };
    }
    case 'POST /certificates/:id/status': {
      admin();
      const c = db.certificates.find((x) => x.id === decodeURIComponent(id)) ?? fail(404, 'Request not found');
      if (body.status === 'rejected' && blank(body.remark)) invalid({ remark: 'Give the reason for rejection' });
      Object.assign(c, { status: body.status, registration_no: text(body.registration_no) ?? c.registration_no, updated_at: now() });
      c.updates.push({ status: body.status, remark: text(body.remark), created_at: now(), by_name: user.name });
      return done({ ok: true });
    }
    // admin
    case 'GET /content/notices':
      admin();
      return { notices: [...db.notices].reverse() };
    case 'POST /content/notices':
    case 'PUT /content/notices/:id': {
      admin();
      if (blank(body.title) || blank(body.body)) invalid({ ...(blank(body.title) && { title: 'Title is required' }), ...(blank(body.body) && { body: 'Message is required' }) });
      const n = { kind: body.kind, title: text(body.title), body: text(body.body), area: text(body.area), starts_at: body.starts_at || null, ends_at: body.ends_at || null };
      if (method === 'POST') {
        const created = { id: (db.seq += 1), ...n, created_at: now() };
        db.notices.push(created);
        return done({ notice: created });
      }
      const existing = db.notices.find((x) => x.id === numId) ?? fail(404, 'Notice not found');
      Object.assign(existing, n);
      return done({ notice: existing });
    }
    case 'DELETE /content/notices/:id':
      admin();
      db.notices = db.notices.filter((x) => x.id !== numId);
      return done(null);
    case 'GET /content/schemes':
      admin();
      return { schemes: db.schemes };
    case 'POST /content/schemes':
    case 'PUT /content/schemes/:id': {
      admin();
      const fields = {};
      for (const [k, label] of [['title', 'Title'], ['category', 'Category'], ['summary', 'Summary']]) if (blank(body[k])) fields[k] = `${label} is required`;
      if (Object.keys(fields).length) invalid(fields);
      if (method === 'POST') {
        const created = { ...body, id: (db.seq += 1), created_at: now(), updated_at: now() };
        db.schemes.push(created);
        return done({ scheme: created });
      }
      const s = db.schemes.find((x) => x.id === numId) ?? fail(404, 'Scheme not found');
      Object.assign(s, body, { updated_at: now() });
      return done({ scheme: s });
    }
    case 'DELETE /content/schemes/:id':
      admin();
      db.schemes = db.schemes.filter((x) => x.id !== numId);
      return done(null);
    case 'GET /admin/users':
      admin();
      return { users: db.users.map(({ password: _p, ...u }) => u) };
    case 'POST /admin/users': {
      admin();
      if (db.users.some((u) => u.username.toLowerCase() === String(body.username).toLowerCase())) invalid({ username: 'This username is already taken' });
      if (String(body.password ?? '').length < 8) invalid({ password: 'Password must be at least 8 characters' });
      const u = { id: (db.seq += 1), name: text(body.name), username: text(body.username), password: body.password, role: body.role, is_active: true, created_at: now() };
      db.users.push(u);
      return done({ user: { ...u, password: undefined } });
    }
    case 'PUT /admin/users/:id': {
      admin();
      const u = db.users.find((x) => x.id === numId) ?? fail(404, 'Not found');
      if (typeof body.is_active === 'boolean') {
        if (u.id === user.id && !body.is_active) fail(400, 'You cannot deactivate your own account');
        u.is_active = body.is_active;
      }
      if (body.password !== undefined) {
        if (String(body.password).length < 8) invalid({ password: 'Password must be at least 8 characters' });
        u.password = body.password;
      }
      return done({ ok: true });
    }
    case 'GET /admin/settings':
      admin();
      return { settings: db.settings };
    case 'PUT /admin/settings':
      admin();
      Object.assign(db.settings, body);
      return done({ settings: db.settings });
    default:
      return fail(404, 'Not found');
  }
}
