// The assistant's voice (text-to-speech) and ears (speech recognition) via Bhashini, the Government of
// India's language platform - so every resident hears the same male Marathi voice on any phone.
//
// Bhashini works in two steps (https://dibd-bhashini.gitbook.io/bhashini-apis):
//  1. Pipeline config call (userID + ulcaApiKey) -> the serviceId for each task/language, plus the
//     inference endpoint and its own auth header. Cached here for a few hours.
//  2. Pipeline compute call to that endpoint -> base64 audio (TTS) or recognised text (ASR).
// Synthesised audio is stored in tts_cache, so each sentence is generated once.
// Without BHASHINI_USER_ID / BHASHINI_API_KEY nothing here is used and the web app keeps using each
// phone's own speech engine.
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';

const PIPELINE_TTL_MS = 6 * 60 * 60 * 1000;
// IIT Madras answers a sentence in about a second; a stuck service should hand over to the next quickly.
const TIMEOUT_MS = 15_000;

export const speechEnabled = () => Boolean(config.bhashini.userId && config.bhashini.apiKey);
/** Server voice: credentials present and not switched off. */
export const ttsEnabled = () => speechEnabled() && config.bhashini.tts;
/** Server speech recognition: credentials present. */
export const asrEnabled = speechEnabled;

class BhashiniError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function postJson(url, headers, body) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new BhashiniError(`Bhashini unreachable: ${err.message}`, 0);
  }
  const text = await res.text();
  if (!res.ok) throw new BhashiniError(`Bhashini ${res.status}: ${text.slice(0, 200)}`, res.status);
  try {
    return JSON.parse(text);
  } catch {
    throw new BhashiniError('Bhashini returned invalid JSON', res.status);
  }
}

// task|lang -> { serviceId, callbackUrl, authName, authValue, voices, expires }
const pipelines = new Map();
// task|lang|pipelineId -> time until which that pipeline is skipped after it failed (outage, timeout).
const resting = new Map();
const REST_MS = 10 * 60 * 1000;

/** Step 1: find the service for a task ('tts' | 'asr') and language in one pipeline, plus where/how to call it. */
async function pipelineFor(task, lang, pipelineId) {
  const key = `${task}|${lang}|${pipelineId}`;
  const cached = pipelines.get(key);
  if (cached && cached.expires > Date.now()) return cached;

  const { userId, apiKey, configUrl } = config.bhashini;
  const data = await postJson(
    configUrl,
    { userID: userId, ulcaApiKey: apiKey },
    {
      pipelineTasks: [{ taskType: task, config: { language: { sourceLanguage: lang } } }],
      pipelineRequestConfig: { pipelineId },
    },
  );
  const taskConfig = data.pipelineResponseConfig?.find((c) => c.taskType === task)?.config ?? [];
  const service = taskConfig.find((c) => c.language?.sourceLanguage === lang) ?? taskConfig[0];
  const endpoint = data.pipelineInferenceAPIEndPoint;
  if (!service?.serviceId || !endpoint?.callbackUrl || !endpoint?.inferenceApiKey?.value) {
    throw new BhashiniError(`Bhashini has no ${task} service for "${lang}" in pipeline ${pipelineId}`, 404);
  }
  const entry = {
    pipelineId,
    serviceId: service.serviceId,
    voices: service.supportedVoices ?? [],
    callbackUrl: endpoint.callbackUrl,
    authName: endpoint.inferenceApiKey.name || 'Authorization',
    authValue: endpoint.inferenceApiKey.value,
    expires: Date.now() + PIPELINE_TTL_MS,
  };
  pipelines.set(key, entry);
  return entry;
}

/** Step 2 in one pipeline, retrying once with a fresh config if the inference key was rotated. */
async function computeIn(pipelineId, task, lang, buildBody) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const p = await pipelineFor(task, lang, pipelineId);
    try {
      return await postJson(p.callbackUrl, { [p.authName]: p.authValue }, buildBody(p));
    } catch (err) {
      if (attempt === 0 && (err.status === 401 || err.status === 403)) {
        pipelines.delete(`${task}|${lang}|${pipelineId}`);
        continue;
      }
      throw err;
    }
  }
  throw new BhashiniError('Bhashini rejected the request', 401);
}

/**
 * Step 2 with fallback: Bhashini's model services go down independently (in October 2026 the ai4bharat
 * Marathi voice timed out while IIT Madras' worked), so the configured pipelines are tried in order and
 * one that fails is skipped for 10 minutes. Bad keys (401/403) are not a reason to try another pipeline.
 */
async function compute(task, lang, buildBody) {
  const ids = config.bhashini.pipelineIds;
  const now = Date.now();
  const usable = ids.filter((id) => !(resting.get(`${task}|${lang}|${id}`) > now));
  let lastError;
  for (const id of usable.length ? usable : ids) {
    try {
      return await computeIn(id, task, lang, buildBody);
    } catch (err) {
      lastError = err;
      if (err.status === 401 || err.status === 403) throw err;
      console.warn(`Bhashini ${task} via pipeline ${id} failed (${err.message}); trying the next one`);
      resting.set(`${task}|${lang}|${id}`, Date.now() + REST_MS);
    }
  }
  throw lastError ?? new BhashiniError('No Bhashini pipeline configured', 0);
}

// Emoji and markup are not read out; "(🎤)" leaves empty brackets, which are dropped too.
export const speakableText = (text) => String(text ?? '')
  .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
  .replace(/\(\s*\)/g, '')
  .replace(/[*_#]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// The key covers which Bhashini (address + pipelines) made the audio, so a local stand-in's tones or an
// old voice setup are never served as the current voice.
const cacheKey = (lang, voice, text) => createHash('sha256')
  .update(`bhashini|${config.bhashini.configUrl}|${config.bhashini.pipelineIds.join(',')}|${config.bhashini.ttsServiceId}|${lang}|${voice}|${text}`)
  .digest('hex');

/**
 * Some Bhashini voices (IISc Syspin) return 32-bit float WAV, which not every phone browser plays; convert
 * those to ordinary 16-bit PCM. Anything else is returned unchanged.
 */
export function toPcm16Wav(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return buf;
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      if (format === 0xfffe && size >= 26) format = buf.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE
      fmt = { format, channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(buf.length, body + size));
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data || fmt.format !== 3 || fmt.bits !== 32) return buf;
  const samples = Math.floor(data.length / 4);
  const out = Buffer.alloc(44 + samples * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(fmt.channels, 22);
  out.writeUInt32LE(fmt.rate, 24); out.writeUInt32LE(fmt.rate * fmt.channels * 2, 28); out.writeUInt16LE(fmt.channels * 2, 32);
  out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    const v = Math.max(-1, Math.min(1, data.readFloatLE(i * 4)));
    out.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return out;
}

/** Text -> { audio: Buffer, mime } in the configured voice. Served from tts_cache when seen before. */
export async function synthesize(rawText, lang = 'mr') {
  if (!ttsEnabled()) throw new HttpError(503, 'speech_unavailable', 'Server voice is not configured');
  const text = speakableText(rawText);
  if (!text) throw new HttpError(400, 'bad_request', 'Nothing to speak');
  if (text.length > config.maxSpeechChars) throw new HttpError(400, 'bad_request', 'Text is too long to speak');
  const voice = config.bhashini.voice;
  const key = cacheKey(lang, voice, text);

  const hit = await query('UPDATE tts_cache SET hits = hits + 1, used_at = now() WHERE key = $1 RETURNING audio, mime', [key]);
  if (hit.rows[0]) return { audio: hit.rows[0].audio, mime: hit.rows[0].mime, cached: true };

  let data;
  try {
    data = await compute('tts', lang, (p) => ({
      pipelineTasks: [{
        taskType: 'tts',
        config: {
          language: { sourceLanguage: lang },
          // A voice chosen by ear overrides the pipeline's default service; each service picks its own rate.
          serviceId: config.bhashini.ttsServiceId || p.serviceId,
          gender: config.bhashini.ttsServiceId || !p.voices.length || p.voices.includes(voice) ? voice : p.voices[0],
        },
      }],
      inputData: { input: [{ source: text }], audio: [{ audioContent: null }] },
    }));
  } catch (err) {
    console.error('Bhashini TTS failed:', err.message);
    throw new HttpError(502, 'speech_failed', 'Could not generate speech');
  }
  const out = data.pipelineResponse?.find((r) => r.taskType === 'tts') ?? data.pipelineResponse?.[0];
  const content = out?.audio?.[0]?.audioContent;
  if (!content) throw new HttpError(502, 'speech_failed', 'Could not generate speech');
  const audio = toPcm16Wav(Buffer.from(content, 'base64'));
  const mime = `audio/${out.config?.audioFormat || 'wav'}`;
  await query(
    `INSERT INTO tts_cache (key, lang, text, mime, audio) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (key) DO NOTHING`,
    [key, lang, text, mime, audio],
  );
  return { audio, mime, cached: false };
}

/** Recorded speech (WAV, 16 kHz mono from the web app) -> recognised text. The audio is not stored. */
export async function recognize(audio, { lang = 'mr', format = 'wav', samplingRate = 16000 } = {}) {
  if (!asrEnabled()) throw new HttpError(503, 'speech_unavailable', 'Server speech recognition is not configured');
  if (!audio?.length) throw new HttpError(400, 'bad_request', 'No audio received');
  let data;
  try {
    data = await compute('asr', lang, (p) => ({
      pipelineTasks: [{
        taskType: 'asr',
        config: { language: { sourceLanguage: lang }, serviceId: p.serviceId, audioFormat: format, samplingRate },
      }],
      inputData: { audio: [{ audioContent: audio.toString('base64') }] },
    }));
  } catch (err) {
    console.error('Bhashini ASR failed:', err.message);
    throw new HttpError(502, 'speech_failed', 'Could not recognise speech');
  }
  const out = data.pipelineResponse?.find((r) => r.taskType === 'asr') ?? data.pipelineResponse?.[0];
  return { text: (out?.output?.[0]?.source ?? '').trim() };
}

/**
 * Forget audio not played for 30 days. Lines that include a resident's name are used once, so this keeps
 * personal data from piling up; the assistant's everyday lines are played constantly and stay cached.
 */
export async function purgeOldSpeech() {
  await query(`DELETE FROM tts_cache WHERE used_at < now() - interval '30 days'`);
}

/** For tests: forget cached pipeline configs. */
export const resetPipelines = () => {
  pipelines.clear();
  resting.clear();
};
