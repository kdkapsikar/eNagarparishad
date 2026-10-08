// Integration tests against a real Postgres. Requires TEST_DATABASE_URL and TRUNCATES every table in
// it - use a dedicated database.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is not set. Point it at a throwaway database (see server/.env.example).');
  process.exit(1);
}
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.MESSAGE_CHANNEL = 'manual';

const { default: bcrypt } = await import('bcryptjs');
const { default: ExcelJS } = await import('exceljs');
const { createApp } = await import('../src/app.js');
const { pool, query } = await import('../src/db/pool.js');
const { migrate } = await import('../src/db/migrate.js');
const { monthDayKeys, prepareDailyMessages, todayInWard } = await import('../src/services/messaging.js');
const { decrypt } = await import('../src/lib/crypto.js');

let server;
let base;

/** Tiny API client that keeps the session token from login. */
function client() {
  let token = '';
  return async (method, url, { json, form } = {}) => {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    let body;
    if (json) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const res = await fetch(base + url, { method, headers, body });
    const type = res.headers.get('content-type') ?? '';
    const parsed = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    if (url === '/api/auth/login' && parsed?.token) token = parsed.token;
    return { status: res.status, body: parsed, headers: res.headers };
  };
}

async function signedIn(username, password) {
  const api = client();
  const res = await api('POST', '/api/auth/login', { json: { username, password } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return api;
}

const family = (overrides = {}) => ({
  head_name: 'रामराव पाटील', mobile: '+91 98000 00001', whatsapp: '', address: 'टिळक वार्ड', area: 'टिळक वार्ड',
  category: 'obc', has_internet: true, has_water_filter: false, consent: true,
  members: [
    { name: 'रामराव पाटील', relation: 'स्वतः', dob: '1972-06-15', gender: 'male', aadhaar: '1234 5678 9012', pan: 'abcpe1234f', voter_id: 'abc1234567' },
    { name: 'सुनीता पाटील', relation: 'पत्नी', dob: '१९७८-०३-०२', gender: 'female' },
  ],
  ...overrides,
});

let admin;
let volunteer;

before(async () => {
  await migrate({ log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await pool.end();
});

beforeEach(async () => {
  await query(`TRUNCATE users, sessions, households, members, notices, certificate_requests, certificate_updates,
               messages, import_batches RESTART IDENTITY CASCADE`);
  const hash = await bcrypt.hash('secret123', 4);
  await query(`INSERT INTO users (name, username, password_hash, role) VALUES ('Admin', 'admin', $1, 'admin'), ('Vol', 'vol', $1, 'volunteer')`, [hash]);
  admin = await signedIn('admin', 'secret123');
  volunteer = await signedIn('vol', 'secret123');
});

describe('auth and access', () => {
  test('wrong password is rejected with a generic message', async () => {
    const res = await client()('POST', '/api/auth/login', { json: { username: 'admin', password: 'nope' } });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.message, 'Invalid username or password');
  });

  test('staff routes need a session; admin routes need the admin role', async () => {
    assert.equal((await client()('GET', '/api/households')).status, 401);
    assert.equal((await volunteer('GET', '/api/households')).status, 200);
    assert.equal((await volunteer('GET', '/api/admin/users')).status, 403);
    assert.equal((await volunteer('GET', '/api/households/export')).status, 403);
    assert.equal((await admin('GET', '/api/admin/users')).status, 200);
  });

  test('deactivating a user ends their session', async () => {
    const { rows } = await query(`SELECT id FROM users WHERE username = 'vol'`);
    await admin('PUT', `/api/admin/users/${rows[0].id}`, { json: { is_active: false } });
    assert.equal((await volunteer('GET', '/api/households')).status, 401);
  });
});

describe('families', () => {
  test('create stores only the Aadhaar last 4, encrypts PAN and normalises numbers', async () => {
    const res = await volunteer('POST', '/api/households', { json: family() });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const h = res.body.household;
    assert.equal(h.mobile, '9800000001');
    assert.equal(h.members[0].aadhaar_last4, '9012');
    assert.equal(h.members[0].pan_masked, 'XXXXXX234F');
    assert.equal(h.members[0].voter_id, 'ABC1234567');
    assert.equal(h.members[1].dob, '1978-03-02'); // Devanagari digits accepted
    assert.equal(h.source, 'form');

    const { rows } = await query('SELECT * FROM members WHERE household_id = $1 ORDER BY position', [h.id]);
    assert.ok(!JSON.stringify(rows).includes('123456789012'), 'full Aadhaar must never be stored');
    assert.ok(!rows[0].pan_enc.includes('ABCPE1234F'));
    assert.equal(decrypt(rows[0].pan_enc), 'ABCPE1234F');
  });

  test('validation errors are reported per field', async () => {
    const bad = family({ mobile: '12345', consent: false });
    bad.members[0].aadhaar = '1234';
    bad.members[0].aadhaar = '12345';
    bad.members[0].pan = 'XYZ';
    bad.members[1].dob = '2999-01-01';
    const res = await volunteer('POST', '/api/households', { json: bad });
    assert.equal(res.status, 400);
    const f = res.body.error.fields;
    assert.ok(f.mobile && f.consent && f['members.0.aadhaar'] && f['members.0.pan'] && f['members.1.dob'], JSON.stringify(f));
  });

  test('editing keeps the stored PAN unless a new one is typed or it is cleared', async () => {
    const { body } = await volunteer('POST', '/api/households', { json: family() });
    const h = body.household;
    const edited = {
      ...family({ head_name: 'रामराव बा. पाटील' }),
      members: [{ ...family().members[0], id: h.members[0].id, pan: '' }, { name: 'नवीन सदस्य' }],
    };
    let res = await volunteer('PUT', `/api/households/${h.id}`, { json: edited });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.household.head_name, 'रामराव बा. पाटील');
    assert.equal(res.body.household.members.length, 2);
    assert.equal(res.body.household.members[0].id, h.members[0].id);
    assert.equal(res.body.household.members[0].pan_masked, 'XXXXXX234F');
    assert.equal(res.body.household.members[1].name, 'नवीन सदस्य');

    edited.members[0].pan_clear = true;
    res = await volunteer('PUT', `/api/households/${h.id}`, { json: edited });
    assert.equal(res.body.household.members[0].pan_masked, null);
  });

  test('search finds a family by member name and voter ID', async () => {
    await volunteer('POST', '/api/households', { json: family() });
    await volunteer('POST', '/api/households', { json: family({ head_name: 'दुसरे कुटुंब', mobile: '9800000002', members: [{ name: 'दुसरे कुटुंब' }] }) });
    let res = await volunteer('GET', `/api/households?q=${encodeURIComponent('सुनीता')}`);
    assert.equal(res.body.total, 1);
    res = await volunteer('GET', '/api/households?q=abc1234');
    assert.equal(res.body.households[0].head_name, 'रामराव पाटील');
  });

  test('self-registration is unverified until staff check it, and gets no broadcasts before that', async () => {
    const res = await client()('POST', '/api/public/self-register', { json: family() });
    assert.equal(res.status, 201);
    let list = await volunteer('GET', '/api/households?verified=false');
    assert.equal(list.body.total, 1);
    assert.equal(list.body.households[0].source, 'self');

    let sent = await admin('POST', '/api/messages/broadcast', { json: { body: 'उद्या पाणी बंद' } });
    assert.equal(sent.body.count, 0);
    await volunteer('POST', `/api/households/${list.body.households[0].id}/verify`);
    sent = await admin('POST', '/api/messages/broadcast', { json: { body: 'उद्या पाणी बंद' } });
    assert.equal(sent.body.count, 1);
    list = await volunteer('GET', '/api/households?verified=false');
    assert.equal(list.body.total, 0);
  });

  test('self-registration needs a phone number', async () => {
    const res = await client()('POST', '/api/public/self-register', { json: family({ mobile: '', whatsapp: '' }) });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.fields.mobile);
  });
});

describe('daily wishes and broadcasts', () => {
  test('birthday and anniversary wishes are prepared once per day', async () => {
    const today = todayInWard();
    const md = today.slice(5);
    await volunteer('POST', '/api/households', {
      json: family({
        members: [
          { name: 'वाढदिवस व्यक्ती', dob: `1980-${md}`, mobile: '9800000009' },
          { name: 'लग्न वाढदिवस', anniversary: `2000-${md}` }, // no own mobile: goes to the family number
          { name: 'फोन नाही' },
        ],
      }),
    });
    assert.equal(await prepareDailyMessages(today), 2);
    assert.equal(await prepareDailyMessages(today), 0);

    const res = await volunteer('GET', '/api/messages');
    assert.equal(res.body.messages.length, 2);
    const birthday = res.body.messages.find((m) => m.kind === 'birthday');
    assert.equal(birthday.phone, '9800000009');
    assert.match(birthday.body, /वाढदिवस व्यक्ती, वाढदिवसाच्या हार्दिक शुभेच्छा/);
    assert.equal(res.body.messages.find((m) => m.kind === 'anniversary').phone, '9800000001');

    const mark = await volunteer('POST', `/api/messages/${birthday.id}/status`, { json: { status: 'sent' } });
    assert.equal(mark.status, 200);
    const sent = await volunteer('GET', '/api/messages?status=sent');
    assert.equal(sent.body.messages.length, 1);
  });

  test('29 February birthdays are wished on 28 February in other years', () => {
    assert.deepEqual(monthDayKeys('2027-02-28'), ['02-28', '02-29']);
    assert.deepEqual(monthDayKeys('2028-02-28'), ['02-28']);
    assert.deepEqual(monthDayKeys('2028-02-29'), ['02-29']);
  });

  test('a notice broadcast goes to one number per family in the area', async () => {
    await volunteer('POST', '/api/households', { json: family() });
    await volunteer('POST', '/api/households', { json: family({ head_name: 'B', mobile: '9800000002', whatsapp: '9800000003', area: 'शिवाजी नगर', members: [] }) });
    const notice = await admin('POST', '/api/content/notices', {
      json: { kind: 'water', title: 'पाणी बंद', body: 'उद्या सकाळी पाणीपुरवठा बंद', area: 'शिवाजी नगर' },
    });
    assert.equal(notice.status, 201, JSON.stringify(notice.body));
    const res = await admin('POST', '/api/messages/broadcast', { json: { notice_id: notice.body.notice.id } });
    assert.equal(res.body.count, 1);
    const { rows } = await query(`SELECT phone, body FROM messages WHERE kind = 'notice'`);
    assert.equal(rows[0].phone, '9800000003'); // WhatsApp preferred
    assert.match(rows[0].body, /पाणी बंद/);

    const pub = await client()('GET', '/api/public/notices');
    assert.equal(pub.body.notices.length, 1);
  });
});

describe('certificates', () => {
  const request = {
    kind: 'birth', person_name: 'बाळ जाधव', event_date: '2026-09-01', event_place: 'उपजिल्हा रुग्णालय',
    father_name: 'गणेश जाधव', mother_name: 'सीमा जाधव', address: 'शिवाजी नगर', applicant_name: 'गणेश जाधव', applicant_phone: '9800000044',
  };

  test('apply, track with the matching phone only, and update status', async () => {
    const res = await client()('POST', '/api/public/certificates', { json: request });
    assert.equal(res.status, 201);
    const id = res.body.id;
    assert.match(id, /^JN-\d{2}-[2-9A-Z]{6}$/);

    const wrong = await client()('POST', '/api/public/certificates/track', { json: { id, phone: '9800000045' } });
    assert.equal(wrong.status, 404);

    assert.equal((await volunteer('POST', `/api/certificates/${id}/status`, { json: { status: 'forwarded' } })).status, 403);
    const rejected = await admin('POST', `/api/certificates/${id}/status`, { json: { status: 'rejected' } });
    assert.equal(rejected.status, 400); // a reason is required
    await admin('POST', `/api/certificates/${id}/status`, { json: { status: 'ready', remark: 'कार्यालयातून घ्या', registration_no: 'B-2026-0042' } });

    const track = await client()('POST', '/api/public/certificates/track', { json: { id: id.toLowerCase(), phone: '+91 98000 00044' } });
    assert.equal(track.status, 200);
    assert.equal(track.body.request.status, 'ready');
    assert.equal(track.body.request.registration_no, 'B-2026-0042');
    assert.deepEqual(track.body.updates.map((u) => u.status), ['submitted', 'ready']);
  });

  test('future dates are rejected', async () => {
    const res = await client()('POST', '/api/public/certificates', { json: { ...request, event_date: '2999-01-01' } });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.fields.event_date);
  });
});

describe('spreadsheet import', () => {
  async function workbook(rows, headers) {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('data');
    sheet.addRow(['कुटुंब सर्वेक्षण - प्रभाग १०']); // a title row above the headings is allowed
    sheet.addRow(headers);
    rows.forEach((r) => sheet.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const upload = (api, buffer, name, fields = {}) => {
    const form = new FormData();
    form.append('file', new Blob([buffer]), name);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return api('POST', '/api/imports', { form });
  };

  const HEADERS = ['कुटुंब क्र.', 'नाव', 'नाते', 'जन्म तारीख', 'लिंग', 'मोबाईल क्र.', 'आधार कार्ड क्र.', 'मतदान कार्ड क्र.', 'पत्ता', 'प्रवर्ग', 'इंटरनेट सुविधा'];
  const ROWS = [
    ['1', 'गणपत जाधव', 'स्वतः', '01/12/1950', 'पुरुष', '9800000021', '123412341234', 'MH/12/345/678901', 'शिवाजी नगर', 'अजा', 'नाही'],
    ['1', 'कमल जाधव', 'पत्नी', new Date(Date.UTC(1955, 4, 5)), 'स्त्री', '', '', '', '', '', ''],
    ['2', 'रमेश शिंदे', 'स्वतः', '३१/०२/१९८०', 'X', '12345', '', '', 'गांधी चौक', 'खुला', 'होय'],
    ['', 'एकटे व्यक्ती', '', '5-6-90', 'female', '9800000031', '', '', 'स्टेशन रोड', '', 'हो'],
  ];

  test('preview reports row errors; commit saves the valid families and skips duplicates', async () => {
    const buffer = await workbook(ROWS, HEADERS);
    const preview = await upload(volunteer, buffer, 'survey.xlsx');
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.rows, 4);
    assert.equal(preview.body.households, 2); // family 1 + the single person; family 2 has errors
    assert.equal(preview.body.members, 3);
    const rows = preview.body.errors.map((e) => `${e.row}:${e.column}`).sort();
    assert.deepEqual(rows, ['5:dob', '5:gender', '5:mobile'].sort(), JSON.stringify(preview.body.errors));

    const noConsent = await upload(volunteer, buffer, 'survey.xlsx', { commit: 'true' });
    assert.equal(noConsent.status, 400);

    const saved = await upload(volunteer, buffer, 'survey.xlsx', { commit: 'true', consent: 'true' });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.saved.households, 2);

    const { rows: members } = await query(`SELECT m.name, m.dob, m.aadhaar_last4, m.voter_id, h.category, h.has_internet, h.source
                                             FROM members m JOIN households h ON h.id = m.household_id ORDER BY m.id`);
    assert.deepEqual(members[0], { name: 'गणपत जाधव', dob: '1950-12-01', aadhaar_last4: '1234', voter_id: 'MH/12/345/678901', category: 'sc', has_internet: false, source: 'import' });
    assert.equal(members[1].dob, '1955-05-05');
    assert.equal(members[2].dob, '1990-06-05');
    assert.equal(members[2].has_internet, true);

    const again = await upload(volunteer, buffer, 'survey.xlsx', { commit: 'true', consent: 'true' });
    assert.equal(again.body.saved.households, 0);
    assert.equal(again.body.saved.duplicates.length, 2);
  });

  test('CSV with a BOM and English headings works', async () => {
    const csv = '﻿Family No,Name,Date of birth,Mobile,Gender\n7,Asha Pawar,1990-01-02,9800000077,F\n7,Ravi Pawar,1988-11-30,,male\n';
    const res = await upload(volunteer, Buffer.from(csv), 'old.csv', { commit: 'true', consent: 'true' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.saved.households, 1);
    assert.equal(res.body.saved.members, 2);
  });

  test('the export can be re-imported (round trip)', async () => {
    await volunteer('POST', '/api/households', { json: family() });
    const exported = await admin('GET', '/api/households/export');
    assert.equal(exported.status, 200);
    await query('TRUNCATE households RESTART IDENTITY CASCADE');
    const res = await upload(volunteer, exported.body, 'families.xlsx', { commit: 'true', consent: 'true' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.errorCount, 0, JSON.stringify(res.body.errors));
    const h = (await volunteer('GET', '/api/households/1')).body.household;
    assert.equal(h.members.length, 2);
    assert.equal(h.members[0].pan_masked, 'XXXXXX234F');
    assert.equal(h.category, 'obc');
  });

  test('the template downloads and passes its own check', async () => {
    const template = await volunteer('GET', '/api/imports/template');
    assert.equal(template.status, 200);
    const res = await upload(volunteer, template.body, 'template.xlsx');
    assert.equal(res.body.errorCount, 0, JSON.stringify(res.body.errors));
    assert.equal(res.body.households, 1);
  });

  test('unknown files are refused', async () => {
    const res = await upload(volunteer, Buffer.from('hello'), 'notes.txt');
    assert.equal(res.status, 400);
  });
});
