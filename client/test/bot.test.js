// The bot's conversation engine and answer parsing (no browser needed): node --test client/test
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { compactCode, matchOption, parseDate, parseYesNo } from '../src/bot/parse.js';
import { applyAnswer, emptyData, nextPosition, positionForField, skipAnswer, toPayload } from '../src/bot/script.js';
import STRINGS from '../src/i18n/strings.js';

describe('parsing answers', () => {
  test('yes / no in Marathi and English, "no" winning over mixed answers', () => {
    for (const s of ['होय', 'हो', 'हो आहे', 'yes', 'आहे']) assert.equal(parseYesNo(s), true, s);
    for (const s of ['नाही', 'नको', 'no', 'नाही आहे']) assert.equal(parseYesNo(s), false, s);
    assert.equal(parseYesNo('माहीत नाही'), false);
    assert.equal(parseYesNo('कदाचित'), null);
  });

  test('dates: numeric, Marathi digits and spoken month names', () => {
    assert.equal(parseDate('15/06/1975'), '1975-06-15');
    assert.equal(parseDate('१५ जून १९७५'), '1975-06-15');
    assert.equal(parseDate('2 march 1980'), '1980-03-02');
    assert.equal(parseDate('1980-03-02'), '1980-03-02');
    assert.equal(parseDate('5.6.90'), '1990-06-05');
    assert.equal(parseDate('जून'), null);
  });

  test('spoken digits become a number', () => {
    assert.equal(compactCode('नऊ आठ सात six 5 4 3 2 1 0'), '9876543210');
    assert.equal(compactCode('ABC 123 4567'), 'abc1234567');
  });

  test('options match inside a spoken sentence', () => {
    const options = [{ value: 'पत्नी', labels: ['पत्नी', 'बायको'] }, { value: 'मुलगा', labels: ['मुलगा'] }];
    assert.equal(matchOption('ती माझी बायको आहे', options), 'पत्नी');
    assert.equal(matchOption('मुलगा', options), 'मुलगा');
    assert.equal(matchOption('काका', options), null);
  });
});

/** Answer questions in order, starting after consent; returns the data and the final position. */
function run(answers, mode = 'public') {
  const data = emptyData();
  let pos = { step: 'consent' };
  const asked = [];
  for (const a of answers) {
    asked.push(pos.member === undefined ? pos.step : `${pos.step}#${pos.member}`);
    if (a === null) skipAnswer(pos, data);
    else {
      const r = applyAnswer(pos, data, mode, a);
      if (r.error) throw new Error(`${pos.step}: "${a}" -> ${r.error}`);
    }
    pos = nextPosition(pos, data, mode);
  }
  return { data, pos, asked };
}

describe('conversation', () => {
  const household = ['होय', 'सुरेश कदम', '9876543210', '9876543210', 'शिवाजी नगर', null, null, null, 'नाही', 'नाही', 'होय', 'नाही', null, null, null];

  test('skips follow-ups that do not apply and infers gender from the relation', () => {
    const { data, pos, asked } = run([
      ...household,
      // head: gender, dob, anniversary, education, occupation, aadhaar, voter id, pan
      'पुरुष', '15/06/1975', null, null, 'शेती', '1234 5678 9012', null, null, 'होय',
      // member 2: name, relation (gender skipped), dob, anniversary skipped for a child, education, occupation, mobile, aadhaar
      'आर्या कदम', 'मुलगी', '2015-01-01', null, 'विद्यार्थी', null, null, 'नाही',
    ]);
    assert.equal(pos.step, 'summary');
    assert.ok(!asked.includes('farm_details') && !asked.includes('disability'));
    assert.ok(!asked.includes('gender#1'), 'gender is implied by "मुलगी"');
    assert.ok(!asked.includes('anniversary#1') && !asked.includes('voter_id#1') && !asked.includes('pan#1'), 'not asked of a child');
    assert.ok(!asked.includes('name#0'), 'the head is not asked their name twice');

    const payload = toPayload(data);
    assert.equal(payload.consent, true);
    assert.equal(payload.whatsapp, '9876543210');
    assert.equal(payload.members.length, 2);
    assert.deepEqual(
      { name: payload.members[0].name, relation: payload.members[0].relation, mobile: payload.members[0].mobile, aadhaar: payload.members[0].aadhaar },
      { name: 'सुरेश कदम', relation: 'स्वतः', mobile: '9876543210', aadhaar: '9012' },
    );
    assert.equal(payload.members[1].gender, 'female');
    assert.equal(payload.members[1].dob, '2015-01-01');
  });

  test('invalid answers are refused with a message; valid ones are normalised', () => {
    const data = emptyData();
    assert.ok(applyAnswer({ step: 'mobile' }, data, 'public', '12345').error);
    assert.ok(applyAnswer({ step: 'aadhaar', member: 0 }, data, 'public', '1234 5678').error);
    assert.ok(applyAnswer({ step: 'dob', member: 0 }, data, 'public', '01/01/2999').error);
    assert.equal(applyAnswer({ step: 'pan', member: 0 }, data, 'public', 'abcde 1234 f').value, 'ABCDE1234F');
  });

  test('server field errors map back to the question', () => {
    assert.deepEqual(positionForField('members.1.pan'), { step: 'pan', member: 1 });
    assert.deepEqual(positionForField('members.0.mobile'), { step: 'member_mobile', member: 0 });
    assert.deepEqual(positionForField('mobile'), { step: 'mobile' });
  });
});

test('every string has Marathi and English with the same placeholders', () => {
  for (const [key, value] of Object.entries(STRINGS)) {
    assert.equal(value.length, 2, key);
    const holes = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    assert.equal(holes(value[0]), holes(value[1]), key);
  }
});

describe('assistant menu', async () => {
  const { detectIntent, searchSchemes } = await import('../src/bot/parse.js');
  test('understands everyday requests', () => {
    assert.equal(detectIntent('लाईट कधी येणार?'), 'notices');
    assert.equal(detectIntent('नळाला पाणी नाही'), 'notices');
    assert.equal(detectIntent('शेतीसाठी काही योजना आहे का?'), 'schemes');
    assert.equal(detectIntent('मुलाचा जन्म दाखला हवा'), 'certificate');
    assert.equal(detectIntent('कार्यालयाचा फोन नंबर'), 'contact');
    assert.equal(detectIntent('राम राम'), 'greet');
    assert.equal(detectIntent('कुटुंबाची नोंदणी करायची आहे'), 'register');
    assert.equal(detectIntent('क्रिकेट'), null);
  });

  test('scheme search copes with Marathi word endings and ignores filler words', () => {
    const schemes = [
      { title: 'पीएम किसान', category: 'शेती', summary: 'शेतकरी कुटुंबांना मदत' },
      { title: 'लाडकी बहीण योजना', category: 'महिला', summary: 'महिलांना मासिक मदत' },
    ];
    assert.deepEqual(searchSchemes('शेतीसाठी काही योजना आहे का?', schemes).map((s) => s.category), ['शेती']);
    assert.deepEqual(searchSchemes('महिलांसाठी', schemes).map((s) => s.category), ['महिला']);
    assert.deepEqual(searchSchemes('योजना', schemes), []);
  });
});
