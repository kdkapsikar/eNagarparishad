// Bulk upload of survey data already collected on paper / in Excel.
//
// One spreadsheet row per PERSON. Rows sharing a "कुटुंब क्र." (family number) form one family; the
// family-level columns (address, caste, survey answers...) are read from the first row of the family
// that fills them in, so they need only be typed once. A row without a family number is a family of one.
// The same columns are used by the downloadable template and by the export, so an export can be edited
// and re-uploaded.
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { withTransaction } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { householdSchema, normalizeIndianMobile, toLatinDigits } from '../lib/validation.js';
import { createHousehold, findDuplicate } from './households.js';
import { config } from '../config.js';

// [key, Marathi header, English header, extra aliases]
export const COLUMNS = [
  ['household_no', 'कुटुंब क्र.', 'Family No', ['family', 'household', 'household no', 'कुटुंब क्रमांक']],
  ['head_name', 'कुटुंब प्रमुखाचे नाव', 'Head of family', ['head', 'कुटुंब प्रमुख']],
  ['h_mobile', 'कुटुंब मोबाईल क्र.', 'Family mobile', []],
  ['whatsapp', 'व्हॉट्सॲप क्र.', 'WhatsApp', ['व्हॉटसॲप क्र', 'व्हॉट्सअॅप क्र', 'whatsapp no']],
  ['address', 'पत्ता', 'Address', []],
  ['area', 'परिसर / वस्ती', 'Area', ['परिसर', 'वस्ती', 'locality']],
  ['caste', 'जात', 'Caste', []],
  ['category', 'प्रवर्ग', 'Category', []],
  ['farm_details', 'शेती तपशील', 'Farm details', ['शेती असल्यास तपशील', 'शेती']],
  ['disability', 'अपंगत्व', 'Disability', ['अपंगत्व आहे का']],
  ['has_internet', 'इंटरनेट सुविधा', 'Internet', ['इंटरनेट']],
  ['has_water_filter', 'वॉटर फिल्टर', 'Water filter', []],
  ['has_anganwadi', 'अंगणवाडी', 'Anganwadi', ['अंगणवाडी आहे का']],
  ['gharkul_benefit', 'घरकुल योजनेचा लाभ', 'Gharkul benefit', ['घरकुल']],
  ['other_issues', 'इतर समस्या', 'Other issues', ['समस्या']],
  ['name', 'नाव', 'Name', ['सदस्याचे नाव', 'member name']],
  ['relation', 'नाते', 'Relation', ['relationship']],
  ['dob', 'जन्म तारीख', 'Date of birth', ['dob', 'birth date', 'जन्मतारीख']],
  ['anniversary', 'लग्नाचा वाढदिवस', 'Anniversary', ['marriage anniversary', 'विवाह दिनांक']],
  ['gender', 'लिंग', 'Gender', ['sex']],
  ['education', 'शिक्षण', 'Education', []],
  ['occupation', 'व्यवसाय', 'Occupation', []],
  ['mobile', 'मोबाईल क्र.', 'Mobile', ['mobile no', 'phone']],
  ['aadhaar', 'आधार कार्ड क्र.', 'Aadhaar', ['आधार', 'aadhar', 'aadhaar no', 'aadhaar last 4']],
  ['pan', 'पॅन कार्ड क्र.', 'PAN', ['पॅन', 'pan no']],
  ['voter_id', 'मतदान कार्ड क्र.', 'Voter ID', ['मतदान कार्ड', 'epic', 'epic no', 'voter id no']],
];

const HOUSEHOLD_KEYS = ['head_name', 'h_mobile', 'whatsapp', 'address', 'area', 'caste', 'category', 'farm_details',
  'disability', 'has_internet', 'has_water_filter', 'has_anganwadi', 'gharkul_benefit', 'other_issues'];
const MEMBER_KEYS = ['name', 'relation', 'dob', 'anniversary', 'gender', 'education', 'occupation', 'mobile', 'aadhaar', 'pan', 'voter_id'];

export const headerFor = ([, mr, en]) => `${mr} (${en})`;

// "नाव (Name)", "Name", " नाव." all normalise to comparable strings.
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s.:_/\\-]+/g, '').trim();
const HEADER_INDEX = new Map();
for (const col of COLUMNS) {
  const [key, mr, en, extra] = col;
  for (const alias of [key, mr, en, headerFor(col), ...extra]) HEADER_INDEX.set(norm(alias), key);
}
function headerKey(header) {
  const h = String(header ?? '');
  return HEADER_INDEX.get(norm(h)) ?? HEADER_INDEX.get(norm(h.replace(/\(.*?\)/g, ''))) ?? HEADER_INDEX.get(norm(h.match(/\((.*?)\)/)?.[1]));
}

// ---- value conversion ---------------------------------------------------------------------------

const YES = new Set(['होय', 'हो', 'आहे', 'yes', 'y', 'true', '1', '✓', 'हाँ']);
const NO = new Set(['नाही', 'नाहि', 'no', 'n', 'false', '0', '✗', 'x']);
function toBool(v) {
  const s = norm(v);
  if (s === '') return null;
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  return v; // left as-is so validation reports it
}

const GENDER = { पुरुष: 'male', पु: 'male', male: 'male', m: 'male', पुरूष: 'male', स्त्री: 'female', स्री: 'female', महिला: 'female', female: 'female', f: 'female', स्त्रि: 'female', इतर: 'other', other: 'other', तृतीयपंथी: 'other' };
const CATEGORY = {
  open: 'open', general: 'open', खुला: 'open', खुल: 'open', सर्वसाधारण: 'open',
  obc: 'obc', इमाव: 'obc', ओबीसी: 'obc', इतरमागासवर्ग: 'obc',
  sc: 'sc', अजा: 'sc', अनुसूचितजाती: 'sc', एससी: 'sc',
  st: 'st', अज: 'st', अनुसूचितजमाती: 'st', एसटी: 'st',
  vjnt: 'vjnt', vj: 'vjnt', nt: 'vjnt', 'vj/nt': 'vjnt', विजाभज: 'vjnt', 'विजा/भज': 'vjnt', भज: 'vjnt', विजा: 'vjnt',
  sbc: 'sbc', विमाप्र: 'sbc', विशेषमागासप्रवर्ग: 'sbc',
  sebc: 'sebc', सामाजिकवशैक्षणिकमागासप्रवर्ग: 'sebc', एसईबीसी: 'sebc',
  ews: 'ews', आदुघ: 'ews', आर्थिकदृष्ट्यादुर्बलघटक: 'ews', ईडब्ल्यूएस: 'ews',
  other: 'other', इतर: 'other',
};
const pick = (map) => (v) => (norm(v) === '' ? null : map[norm(v)] ?? map[norm(v).replace(/[/]/g, '')] ?? v);

const pad = (n) => String(n).padStart(2, '0');
/** dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy, yyyy-mm-dd (Marathi digits too) or an Excel date -> YYYY-MM-DD. */
export function toIsoDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? String(v) : v.toISOString().slice(0, 10);
  const s = toLatinDigits(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    let year = Number(m[3]);
    if (m[3].length === 2) year += year > new Date().getFullYear() % 100 ? 1900 : 2000;
    return `${year}-${pad(m[2])}-${pad(m[1])}`;
  }
  return s; // validation reports it
}

const CONVERT = {
  has_internet: toBool, has_water_filter: toBool, has_anganwadi: toBool, gharkul_benefit: toBool,
  gender: pick(GENDER), category: pick(CATEGORY), dob: toIsoDate, anniversary: toIsoDate,
};

// ---- reading files ------------------------------------------------------------------------------

function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map((r) => r.text).join('');
    if ('result' in value) return cellValue(value.result);
    if ('text' in value) return String(value.text);
    return '';
  }
  return typeof value === 'number' ? String(value) : String(value).trim();
}

async function readRows(buffer, filename) {
  let table;
  if (/\.csv$/i.test(filename)) {
    // Excel saves Marathi CSVs with a BOM; csv-parse strips it with `bom: true`.
    table = parseCsv(buffer, { bom: true, relax_column_count: true, skip_empty_lines: false });
  } else if (/\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch {
      throw new HttpError(400, 'invalid_file', 'Could not read the Excel file. Save it as .xlsx and try again.');
    }
    const sheet = wb.worksheets[0];
    table = [];
    sheet?.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      table[rowNumber - 1] = row.values.slice(1).map(cellValue);
    });
    for (let i = 0; i < table.length; i += 1) table[i] ??= [];
  } else {
    throw new HttpError(400, 'invalid_file', 'Upload an Excel (.xlsx) or CSV file');
  }

  // The header row is the first row in which at least two cells are known column names (a title row
  // above it is allowed).
  const headerIndex = table.findIndex((r) => r.filter((c) => headerKey(c)).length >= 2);
  if (headerIndex === -1) throw new HttpError(400, 'invalid_file', 'No known column headings found. Use the template.');
  const keys = table[headerIndex].map(headerKey);
  if (!keys.includes('name')) throw new HttpError(400, 'invalid_file', 'The "Name" column is missing');

  const rows = [];
  for (let i = headerIndex + 1; i < table.length; i += 1) {
    const values = {};
    keys.forEach((key, c) => {
      if (!key) return;
      const v = table[i][c];
      values[key] = v instanceof Date ? v : String(v ?? '').trim();
    });
    if (Object.values(values).every((v) => v === '')) continue;
    rows.push({ rowNumber: i + 1, values });
  }
  if (rows.length > config.maxImportRows) {
    throw new HttpError(400, 'too_many_rows', `At most ${config.maxImportRows} rows can be uploaded at once`);
  }
  return rows;
}

// ---- grouping + validation ----------------------------------------------------------------------

function groupFamilies(rows) {
  const families = new Map();
  rows.forEach((row, i) => {
    const no = norm(row.values.household_no);
    const key = no ? `no:${no}` : `row:${i}`;
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(row);
  });
  return [...families.values()];
}

function buildFamily(rows) {
  const first = (key) => rows.map((r) => r.values[key]).find((v) => v !== undefined && v !== '') ?? '';
  const conv = (key, v) => (CONVERT[key] ? CONVERT[key](v) : v);
  const data = { consent: true };
  for (const key of HOUSEHOLD_KEYS) data[key === 'h_mobile' ? 'mobile' : key] = conv(key, first(key));
  data.members = rows.map((r) => Object.fromEntries(MEMBER_KEYS.map((k) => [k, conv(k, r.values[k] ?? '')])));
  if (!data.head_name) data.head_name = data.members[0]?.name ?? '';
  // Sheets with only a per-person mobile column: the head's number is the family's contact number
  // (used for notices and to recognise a family that was already uploaded).
  if (!data.mobile && normalizeIndianMobile(data.members[0]?.mobile)) data.mobile = data.members[0].mobile;
  return data;
}

/** Parse, group and validate. Returns valid families plus per-row errors (row = spreadsheet row number). */
export async function analyse(buffer, filename) {
  const rows = await readRows(buffer, filename);
  const valid = [];
  const errors = [];
  for (const familyRows of groupFamilies(rows)) {
    const result = householdSchema.safeParse(buildFamily(familyRows));
    if (result.success) {
      valid.push({ rows: familyRows.map((r) => r.rowNumber), data: result.data });
      continue;
    }
    for (const issue of result.error.issues) {
      const [first, index, field] = issue.path;
      const row = first === 'members' ? familyRows[index]?.rowNumber ?? familyRows[0].rowNumber : familyRows[0].rowNumber;
      const column = first === 'members' ? field : first === 'mobile' ? 'h_mobile' : first;
      errors.push({ row, column: column ?? null, message: issue.message });
    }
  }
  errors.sort((a, b) => a.row - b.row);
  return { rowCount: rows.length, valid, errors };
}

/** Save the valid families from `analyse`. Families already in the system (same head + mobile) are skipped. */
export async function commit({ valid }, { filename, userId }) {
  return withTransaction(async (client) => {
    const batch = await client.query(
      `INSERT INTO import_batches (filename, rows_total, households, members, created_by) VALUES ($1, 0, 0, 0, $2) RETURNING id`,
      [filename, userId],
    );
    const batchId = batch.rows[0].id;
    const duplicates = [];
    let households = 0;
    let members = 0;
    for (const family of valid) {
      if (await findDuplicate(client, family.data)) {
        duplicates.push({ row: family.rows[0], head_name: family.data.head_name });
        continue;
      }
      await createHousehold(family.data, { source: 'import', userId, batchId, client });
      households += 1;
      members += family.data.members.length;
    }
    const rowsTotal = valid.reduce((n, f) => n + f.rows.length, 0);
    await client.query('UPDATE import_batches SET rows_total = $2, households = $3, members = $4 WHERE id = $1', [batchId, rowsTotal, households, members]);
    return { batchId, households, members, duplicates };
  });
}

// ---- template + export --------------------------------------------------------------------------

const yesNo = (v) => (v === true ? 'होय' : v === false ? 'नाही' : '');
const CATEGORY_LABEL = { open: 'खुला', obc: 'इमाव', sc: 'अजा', st: 'अज', vjnt: 'विजा/भज', sbc: 'विमाप्र', sebc: 'SEBC', ews: 'आदुघ', other: 'इतर' };
const GENDER_LABEL = { male: 'पुरुष', female: 'स्त्री', other: 'इतर' };
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

function styledSheet(wb, name) {
  const sheet = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS.map((col) => ({ header: headerFor(col), key: col[0], width: Math.max(14, headerFor(col).length + 2) }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE7C8' } };
  // Phone, Aadhaar and date columns as text, so Excel does not turn 9876543210 into 9.88E+09.
  for (const key of ['h_mobile', 'whatsapp', 'mobile', 'aadhaar', 'dob', 'anniversary', 'household_no']) sheet.getColumn(key).numFmt = '@';
  return sheet;
}

export async function templateWorkbook() {
  const wb = new ExcelJS.Workbook();
  const sheet = styledSheet(wb, 'माहिती');
  sheet.addRow({ household_no: '1', head_name: 'रामराव पाटील', h_mobile: '9800000001', whatsapp: '9800000001', address: 'लोकमान्य टिळक वार्ड', area: 'टिळक वार्ड', caste: '', category: 'खुला', farm_details: '२ एकर', disability: 'नाही', has_internet: 'होय', has_water_filter: 'नाही', has_anganwadi: 'नाही', gharkul_benefit: 'नाही', other_issues: 'रस्त्यावरील दिवे बंद', name: 'रामराव पाटील', relation: 'स्वतः', dob: '15/06/1972', anniversary: '10/05/1995', gender: 'पुरुष', education: '१२ वी', occupation: 'शेती', mobile: '9800000001', aadhaar: '1234', pan: '', voter_id: 'ABC1234567' });
  sheet.addRow({ household_no: '1', name: 'सुनीता पाटील', relation: 'पत्नी', dob: '02/03/1978', anniversary: '10/05/1995', gender: 'स्त्री', education: '१० वी', occupation: 'गृहिणी', mobile: '', aadhaar: '', voter_id: '' });

  const help = wb.addWorksheet('सूचना');
  help.columns = [{ width: 110 }];
  [
    'प्रत्येक व्यक्तीसाठी एक ओळ. एकाच कुटुंबातील सर्व व्यक्तींना एकच "कुटुंब क्र." द्या.',
    'कुटुंबाची माहिती (पत्ता, जात, प्रवर्ग, प्रश्न) कुटुंबाच्या पहिल्या ओळीत एकदाच भरा.',
    'तारीख: दिवस/महिना/वर्ष, उदा. 15/06/1972',
    'लिंग: पुरुष / स्त्री / इतर',
    'प्रवर्ग: खुला / इमाव (OBC) / अजा (SC) / अज (ST) / विजा/भज (VJNT) / विमाप्र (SBC) / SEBC / आदुघ (EWS) / इतर',
    'होय/नाही प्रश्न: होय किंवा नाही',
    'आधार: पूर्ण १२ अंक दिले तरी फक्त शेवटचे ४ अंक जतन होतात.',
    'कुटुंबाकडून माहिती वापरण्याची संमती घेतलेली असावी.',
    '',
    'One row per person. Give everyone in a family the same "Family No". Fill family details once, on the family\'s first row.',
    'Dates as DD/MM/YYYY. Only the last 4 digits of Aadhaar are kept.',
  ].forEach((line) => help.addRow([line]));
  return wb.xlsx.writeBuffer();
}

export async function exportWorkbook(rows) {
  const wb = new ExcelJS.Workbook();
  const sheet = styledSheet(wb, 'माहिती');
  let lastHousehold = null;
  for (const r of rows) {
    const firstOfFamily = r.household_id !== lastHousehold;
    lastHousehold = r.household_id;
    sheet.addRow({
      household_no: String(r.household_id),
      ...(firstOfFamily && {
        head_name: r.head_name, h_mobile: r.h_mobile ?? '', whatsapp: r.whatsapp ?? '', address: r.address ?? '', area: r.area ?? '',
        caste: r.caste ?? '', category: CATEGORY_LABEL[r.category] ?? '', farm_details: r.farm_details ?? '', disability: r.disability ?? '',
        has_internet: yesNo(r.has_internet), has_water_filter: yesNo(r.has_water_filter), has_anganwadi: yesNo(r.has_anganwadi),
        gharkul_benefit: yesNo(r.gharkul_benefit), other_issues: r.other_issues ?? '',
      }),
      name: r.name ?? '', relation: r.relation ?? '', dob: dmy(r.dob), anniversary: dmy(r.anniversary), gender: GENDER_LABEL[r.gender] ?? '',
      education: r.education ?? '', occupation: r.occupation ?? '', mobile: r.mobile ?? '', aadhaar: r.aadhaar_last4 ?? '',
      pan: r.pan ?? '', voter_id: r.voter_id ?? '',
    });
  }
  return wb.xlsx.writeBuffer();
}
