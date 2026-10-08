// Bhashini voice + speech recognition, against a fake Bhashini that follows the documented contract
// (https://dibd-bhashini.gitbook.io/bhashini-apis): pipeline config call, then pipeline compute call.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is not set.');
  process.exit(1);
}
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// ---- fake Bhashini ---------------------------------------------------------------------------------
const fake = { configCalls: 0, computeCalls: [], inferenceKey: 'inference-key-1', rejectNextCompute: false };
const fakeApp = express();
fakeApp.use(express.json({ limit: '10mb' }));
fakeApp.post('/config', (req, res) => {
  fake.configCalls += 1;
  if (req.get('userID') !== 'test-user' || req.get('ulcaApiKey') !== 'test-key') return res.status(401).json({ message: 'bad key' });
  const task = req.body.pipelineTasks[0].taskType;
  const lang = req.body.pipelineTasks[0].config.language.sourceLanguage;
  res.json({
    pipelineResponseConfig: [{
      taskType: task,
      config: [
        { serviceId: `${task}-hi-service`, language: { sourceLanguage: 'hi' }, supportedVoices: ['male', 'female'] },
        { serviceId: `${task}-${lang}-service`, language: { sourceLanguage: lang }, supportedVoices: ['male', 'female'] },
      ],
    }],
    pipelineInferenceAPIEndPoint: {
      callbackUrl: `${fake.base}/compute`,
      inferenceApiKey: { name: 'Authorization', value: fake.inferenceKey },
    },
  });
});
fakeApp.post('/compute', (req, res) => {
  fake.computeCalls.push({ auth: req.get('Authorization'), body: req.body });
  if (fake.rejectNextCompute || req.get('Authorization') !== fake.inferenceKey) {
    fake.rejectNextCompute = false;
    return res.status(401).json({ detail: 'expired' });
  }
  const task = req.body.pipelineTasks[0];
  if (task.taskType === 'tts') {
    const text = req.body.inputData.input[0].source;
    return res.json({
      pipelineResponse: [{ taskType: 'tts', config: { audioFormat: 'wav' }, audio: [{ audioContent: Buffer.from(`RIFF:${task.config.gender}:${text}`).toString('base64') }] }],
    });
  }
  const bytes = Buffer.from(req.body.inputData.audio[0].audioContent, 'base64').length;
  return res.json({ pipelineResponse: [{ taskType: 'asr', output: [{ source: ` गणपत शिंदे (${bytes}) ` }] }] });
});

let fakeServer;
let server;
let base;
let config;
let query;
let pool;
let resetPipelines;

before(async () => {
  fakeServer = fakeApp.listen(0);
  await new Promise((r) => fakeServer.once('listening', r));
  fake.base = `http://127.0.0.1:${fakeServer.address().port}`;
  process.env.BHASHINI_CONFIG_URL = `${fake.base}/config`;
  ({ config } = await import('../src/config.js'));
  ({ query, pool } = await import('../src/db/pool.js'));
  ({ resetPipelines } = await import('../src/services/speech.js'));
  const { migrate } = await import('../src/db/migrate.js');
  const { createApp } = await import('../src/app.js');
  await migrate({ log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  fakeServer.close();
  await pool.end();
});

beforeEach(async () => {
  Object.assign(config.bhashini, { userId: 'test-user', apiKey: 'test-key', voice: 'male' });
  Object.assign(fake, { configCalls: 0, computeCalls: [], inferenceKey: 'inference-key-1', rejectNextCompute: false });
  resetPipelines();
  await query('TRUNCATE tts_cache');
});

const tts = (text, lang = 'mr') => fetch(`${base}/api/speech/tts`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }),
});

describe('speech via Bhashini', () => {
  test('status says whether the server voice is available', async () => {
    let res = await (await fetch(`${base}/api/speech/status`)).json();
    assert.deepEqual(res, { tts: true, asr: true, provider: 'bhashini' });
    config.bhashini.apiKey = '';
    res = await (await fetch(`${base}/api/speech/status`)).json();
    assert.equal(res.tts, false);
    assert.equal((await tts('राम राम')).status, 503);
  });

  test('speaks Marathi in a male voice, with emoji and empty brackets removed', async () => {
    const res = await tts('राम राम मंडळी! 🙏 माइकचे चिन्ह (🎤) दाबून बोला.');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/wav');
    assert.equal(res.headers.get('x-speech-cache'), 'miss');
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), 'RIFF:male:राम राम मंडळी! माइकचे चिन्ह दाबून बोला.');
    const call = fake.computeCalls[0];
    assert.equal(call.auth, 'inference-key-1');
    assert.equal(call.body.pipelineTasks[0].config.serviceId, 'tts-mr-service'); // the Marathi service, not the first listed
    assert.equal(call.body.pipelineTasks[0].config.language.sourceLanguage, 'mr');
  });

  test('each sentence is generated once, then served from the cache', async () => {
    await tts('शेतीवाडी आहे का?');
    const again = await tts('शेतीवाडी आहे का? ');
    assert.equal(again.headers.get('x-speech-cache'), 'hit');
    await tts('घरात कुणाला अपंगत्व आहे का?');
    assert.equal(fake.computeCalls.length, 2);
    assert.equal(fake.configCalls, 1, 'the pipeline config is reused');
    const { rows } = await query('SELECT text, hits FROM tts_cache ORDER BY text');
    assert.equal(rows.length, 2);
  });

  test('a rotated inference key is fetched again and the request retried', async () => {
    await tts('पहिलं वाक्य');
    fake.inferenceKey = 'inference-key-2';
    const res = await tts('दुसरं वाक्य');
    assert.equal(res.status, 200);
    assert.equal(fake.configCalls, 2);
    assert.equal(fake.computeCalls.at(-1).auth, 'inference-key-2');
  });

  test('wrong keys or a Bhashini outage give a clean error the app can fall back from', async () => {
    config.bhashini.apiKey = 'wrong';
    const res = await tts('राम राम');
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, 'speech_failed');
  });

  test('over-long or empty text is refused', async () => {
    assert.equal((await tts('अ'.repeat(700))).status, 400);
    assert.equal((await tts('🙏')).status, 400);
  });

  test('recognises speech from a WAV upload', async () => {
    const wav = Buffer.alloc(3200, 1);
    const res = await fetch(`${base}/api/speech/asr?lang=mr&rate=16000`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { text: 'गणपत शिंदे (3200)' });
    const cfg = fake.computeCalls[0].body.pipelineTasks[0].config;
    assert.deepEqual([cfg.serviceId, cfg.audioFormat, cfg.samplingRate], ['asr-mr-service', 'wav', 16000]);
  });

  test('a recording that is too large is refused', async () => {
    const res = await fetch(`${base}/api/speech/asr`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: Buffer.alloc(4 * 1024 * 1024) });
    assert.equal(res.status, 413);
  });
});

test('audio unused for 30 days is purged; recently used audio stays', async () => {
  const { purgeOldSpeech } = await import('../src/services/speech.js');
  await tts('जुनं वाक्य');
  await tts('नवीन वाक्य');
  await query(`UPDATE tts_cache SET used_at = now() - interval '31 days' WHERE text = 'जुनं वाक्य'`);
  await purgeOldSpeech();
  const { rows } = await query('SELECT text FROM tts_cache');
  assert.deepEqual(rows.map((r) => r.text), ['नवीन वाक्य']);
});
