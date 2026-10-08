// Development data: two staff accounts, a few families (with today's birthday so reminders show up),
// a notice and a certificate request.   npm run seed
// Refuses to run in production - create real accounts with `npm run user:create`.
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { pool, query } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { BCRYPT_ROUNDS } from '../src/lib/constants.js';
import { householdSchema } from '../src/lib/validation.js';
import { createHousehold } from '../src/services/households.js';
import { todayInWard } from '../src/services/messaging.js';

if (config.isProd) {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

await migrate({ log: () => {} });

const users = [
  { name: 'कार्यालय प्रमुख', username: 'admin', password: 'admin12345', role: 'admin' },
  { name: 'स्वयंसेवक १', username: 'volunteer1', password: 'volunteer123', role: 'volunteer' },
];
for (const u of users) {
  await query(
    `INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT (lower(username)) DO NOTHING`,
    [u.name, u.username, await bcrypt.hash(u.password, BCRYPT_ROUNDS), u.role],
  );
}

const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM households');
if (n === 0) {
  const today = todayInWard();
  const birthdayThisDay = (year) => `${year}${today.slice(4)}`;
  const families = [
    {
      head_name: 'रामराव पाटील', mobile: '9800000001', whatsapp: '9800000001', address: 'घर क्र. १२, लोकमान्य टिळक वार्ड',
      area: 'टिळक वार्ड', category: 'open', farm_details: '२ एकर कोरडवाहू', has_internet: true, has_water_filter: false,
      has_anganwadi: false, gharkul_benefit: false, other_issues: 'गल्लीतील पथदिवे बंद आहेत', consent: true,
      members: [
        { name: 'रामराव पाटील', relation: 'स्वतः', dob: birthdayThisDay(1972), anniversary: '1995-05-10', gender: 'male', education: '१२ वी', occupation: 'शेती', mobile: '9800000001', aadhaar: '123456781234', voter_id: 'ABC1234567' },
        { name: 'सुनीता पाटील', relation: 'पत्नी', dob: '1978-03-02', anniversary: '1995-05-10', gender: 'female', education: '१० वी', occupation: 'गृहिणी' },
        { name: 'अमोल पाटील', relation: 'मुलगा', dob: '2001-11-20', gender: 'male', education: 'बी.कॉम', occupation: 'विद्यार्थी', mobile: '9800000002', pan: 'ABCPE1234F' },
      ],
    },
    {
      head_name: 'शबाना शेख', mobile: '9800000011', address: 'हुतात्मा चौक जवळ', area: 'हुतात्मा चौक', category: 'obc',
      has_internet: false, has_water_filter: false, has_anganwadi: true, gharkul_benefit: true, consent: true,
      members: [
        { name: 'शबाना शेख', relation: 'स्वतः', dob: '1985-08-15', anniversary: `2005${today.slice(4)}`, gender: 'female', occupation: 'शिवणकाम', mobile: '9800000011' },
        { name: 'आयान शेख', relation: 'मुलगा', dob: '2012-01-26', gender: 'male', education: '८ वी' },
      ],
    },
    {
      head_name: 'गणपत जाधव', mobile: '9800000021', address: 'शिवाजी नगर', area: 'शिवाजी नगर', category: 'sc', disability: 'होय - पायाचे अपंगत्व',
      has_internet: false, has_water_filter: true, has_anganwadi: false, gharkul_benefit: false, consent: true,
      members: [{ name: 'गणपत जाधव', relation: 'स्वतः', dob: '1950-12-01', gender: 'male', occupation: 'निवृत्त' }],
    },
  ];
  const admin = await query(`SELECT id FROM users WHERE username = 'admin'`);
  for (const f of families) await createHousehold(householdSchema.parse(f), { source: 'form', userId: admin.rows[0].id });

  await query(
    `INSERT INTO notices (kind, title, body, area, starts_at, ends_at) VALUES
     ('electricity', 'उद्या सकाळी वीजपुरवठा बंद', 'देखभाल कामासाठी उद्या सकाळी ९ ते दुपारी १ वीजपुरवठा बंद राहील.', 'टिळक वार्ड', now() + interval '1 day', now() + interval '1 day 4 hours'),
     ('water', 'पाणीपुरवठा वेळेत बदल', 'जलवाहिनी दुरुस्तीमुळे पुढील दोन दिवस पाणीपुरवठा सायंकाळी ६ वाजता होईल.', NULL, now(), now() + interval '2 days')`,
  );
  console.log('Seeded 3 families and 2 notices.');
}

console.log('Logins: admin / admin12345 (office), volunteer1 / volunteer123 (field volunteer)');
await pool.end();
