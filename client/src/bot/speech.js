// Voice for the bot.
//  1. Server voice (preferred): when the API has Bhashini configured (GET /api/speech/status), every line
//     is spoken by Bhashini's male Marathi voice and the mic is recognised by Bhashini - the same on every
//     phone, nothing to install.
//  2. Device voice (fallback): the browser's built-in Web Speech API - used when the server voice is not
//     configured, in the demo build, or if a server request fails. Voice quality depends on the phone.
// Everything degrades quietly: the bot always works by tapping and typing too.
import { API_URL, DEMO } from '../lib/config.js';
import { splitForSpeech } from './parse.js';
import { canRecord, recordAnswer } from './recorder.js';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

export const canSpeak = Boolean(synth);
// Device recognition only; see listenAvailable() for the full answer once the server status is known.
export const canListen = Boolean(Recognition);

// The mascot is a man, so the voice should be too. Browsers do not say which voices are male, so known
// voice names decide; when only a female voice exists, its pitch is lowered (see voicePitch) and the person
// can pick another voice in the chat (voice chooser). Names come from Windows/Edge (Microsoft Manohar,
// Madhur, Hemant...), macOS (Rishi, Lekha) and Android, which sometimes adds "male" / "female" to the name.
const MALE_NAMES = /\b(manohar|madhur|hemant|prabhat|ravi|rishi|aarav|kunal)\b|(^|[^e])male/i;
const FEMALE_NAMES = /\b(aarohi|swara|kalpana|lekha|heera|neerja|veena|ananya|aditi|sangeeta)\b|female/i;
const VOICE_KEY = 'enp_bot_voice_name';

const langOf = (v) => v.lang?.toLowerCase().replace('_', '-') ?? '';
const isMale = (v) => MALE_NAMES.test(v.name) && !FEMALE_NAMES.test(v.name);

/** Voices that can read Marathi text: Marathi ones first, then Hindi (also Devanagari); men first within each. */
export function availableVoices() {
  const voices = synth?.getVoices() ?? [];
  const rank = (v) => (langOf(v).startsWith('mr') ? 0 : 2) + (isMale(v) ? 0 : 1);
  return voices.filter((v) => /^(mr|hi)/.test(langOf(v))).sort((a, b) => rank(a) - rank(b));
}

let voice = null;
function pickVoice() {
  let saved = null;
  try { saved = localStorage.getItem(VOICE_KEY); } catch { /* ignore */ }
  const list = availableVoices();
  voice = list.find((v) => v.name === saved) ?? list[0] ?? null;
}
if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
}

export const currentVoiceName = () => voice?.name ?? null;

/** Use a voice the person picked in the chat, and remember it on this device. */
export function chooseVoice(name) {
  try { localStorage.setItem(VOICE_KEY, name); } catch { /* ignore */ }
  pickVoice();
}

// A known male voice speaks at its natural pitch; any other voice is lowered towards a man's.
const voicePitch = () => (voice && isMale(voice) ? 1 : 0.7);

/** 'mr' when a Marathi voice is installed, 'hi' for the Hindi fallback, null for none. */
export const voiceLanguage = () => (voice ? langOf(voice).slice(0, 2) : null);

// Emoji and symbols are read out literally ("folded hands"), so they are dropped from what is spoken.
// "माइकचे चिन्ह (🎤) दाबून" is then read without the leftover empty brackets.
export const speakable = (text) => text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\(\s*\)/g, '').replace(/[*_#]/g, '').replace(/ {2,}/g, ' ').trim();

// Whether the bot is talking right now - the mascot moves its mouth while it is.
const speakingListeners = new Set();
let speaking = false;
let current = null;
function setSpeaking(value) {
  if (speaking === value) return;
  speaking = value;
  speakingListeners.forEach((fn) => fn(value));
}
export function onSpeakingChange(fn) {
  speakingListeners.add(fn);
  return () => speakingListeners.delete(fn);
}

function speakOnDevice(text, lang) {
  if (!synth || !text) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  if (lang === 'mr' && voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else {
    u.lang = lang === 'en' ? 'en-IN' : 'mr-IN';
  }
  u.rate = 0.92; // a little slower: clearer for older listeners
  u.pitch = lang === 'mr' ? voicePitch() : 0.75;
  // A cancelled utterance also fires end/error, possibly after its replacement started - so only the
  // latest utterance may clear the flag.
  current = u;
  u.onstart = () => setSpeaking(true);
  u.onend = () => current === u && setSpeaking(false);
  u.onerror = () => current === u && setSpeaking(false);
  synth.speak(u);
}

// ---- server voice (Bhashini through our API) -----------------------------------------------------
let serverStatus = { tts: false, asr: false };
const statusListeners = new Set();
export const speechStatus = () => serverStatus;
export function onSpeechStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
// Asked once per page load; the demo build has no server.
if (!DEMO && typeof window !== 'undefined') {
  fetch(`${API_URL}/api/speech/status`)
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => {
      if (!s) return;
      serverStatus = { tts: Boolean(s.tts), asr: Boolean(s.asr) };
      statusListeners.forEach((fn) => fn(serverStatus));
    })
    .catch(() => {});
}

/** True when the assistant speaks with the server (Bhashini) voice rather than the phone's. */
export const usingServerVoice = () => serverStatus.tts;

// text|lang -> Promise<object URL>; small, so a conversation's lines are fetched once.
const audioCache = new Map();
function fetchSpeech(text, lang) {
  const key = `${lang}|${text}`;
  if (!audioCache.has(key)) {
    const p = fetch(`${API_URL}/api/speech/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`tts ${r.status}`);
      return URL.createObjectURL(await r.blob());
    });
    p.catch(() => audioCache.delete(key)); // let a later attempt retry
    audioCache.set(key, p);
    if (audioCache.size > 80) {
      const [oldKey, oldUrl] = audioCache.entries().next().value;
      audioCache.delete(oldKey);
      oldUrl.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    }
  }
  return audioCache.get(key);
}

/** Start generating a line before it is shown (while the typing dots run), so it plays without delay. */
export function prefetchSpeech(text, { lang = 'mr' } = {}) {
  const t = speakable(text ?? '');
  if (serverStatus.tts && t) fetchSpeech(t, lang).catch(() => {});
}

let audio = null;
let speakToken = 0;

export function speak(text, { lang = 'mr' } = {}) {
  const t = speakable(text ?? '');
  if (!t) return;
  stopSpeaking();
  if (!serverStatus.tts) {
    speakOnDevice(t, lang);
    return;
  }
  const token = (speakToken += 1);
  const chunks = splitForSpeech(t);
  chunks.slice(1).forEach((c) => fetchSpeech(c, lang).catch(() => {}));
  const playFrom = (i) => fetchSpeech(chunks[i], lang)
    .then((url) => {
      if (token !== speakToken) return undefined; // something newer started meanwhile
      audio = new Audio(url);
      audio.onplaying = () => token === speakToken && setSpeaking(true);
      audio.onended = () => {
        if (token !== speakToken) return;
        if (i + 1 < chunks.length) playFrom(i + 1);
        else setSpeaking(false);
      };
      audio.onerror = () => token === speakToken && setSpeaking(false);
      return audio.play().catch((err) => {
        // Browsers block sound until the person has tapped the page once; that is not a failure.
        if (err.name !== 'NotAllowedError' && token === speakToken) speakOnDevice(chunks.slice(i).join(' '), lang);
      });
    })
    // Server voice failed: say the rest with the phone's voice.
    .catch(() => token === speakToken && speakOnDevice(chunks.slice(i).join(' '), lang));
  playFrom(0);
}

export function stopSpeaking() {
  speakToken += 1;
  if (audio) {
    audio.pause();
    audio = null;
  }
  synth?.cancel();
  setSpeaking(false);
}

/** Can the mic be used at all (server recognition with a microphone, or the browser's own)? */
export const listenAvailable = () => Boolean(Recognition) || (serverStatus.asr && canRecord());

/**
 * Listen for one answer. Resolves with the recognised text ('' if nothing was heard).
 * Server recognition (Bhashini) when available, else the browser's own. Call stop() to finish early.
 */
export function listen({ lang = 'mr', onInterim } = {}) {
  stopSpeaking(); // otherwise the bot's own voice is transcribed
  if (serverStatus.asr && canRecord()) {
    const rec = recordAnswer();
    const promise = rec.promise.then(async (wav) => {
      if (!wav) return '';
      onInterim?.('…');
      const r = await fetch(`${API_URL}/api/speech/asr?lang=${lang}&rate=16000`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
      if (!r.ok) throw new Error('server-asr');
      return ((await r.json()).text ?? '').trim();
    }, (err) => {
      throw new Error(err?.name === 'NotAllowedError' ? 'not-allowed' : 'mic');
    });
    return { promise, stop: rec.stop };
  }
  return listenOnDevice({ lang, onInterim });
}


/** The browser's own recognition. onInterim(text) gets live partial text. */
function listenOnDevice({ lang, onInterim }) {
  if (!Recognition) return { promise: Promise.reject(new Error('unsupported')), stop() {} };
  const rec = new Recognition();
  rec.lang = lang === 'en' ? 'en-IN' : 'mr-IN';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  let finalText = '';
  const promise = new Promise((resolve, reject) => {
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      onInterim?.(finalText + interim);
    };
    rec.onerror = (e) => (e.error === 'no-speech' || e.error === 'aborted' ? resolve('') : reject(new Error(e.error)));
    rec.onend = () => resolve(finalText.trim());
  });
  rec.start();
  return { promise, stop: () => rec.stop() };
}
