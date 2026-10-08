// Voice for the bot, using the browser's built-in Web Speech API (no server, no cost):
//  - speak():  text-to-speech. Uses a Marathi (mr-IN) voice when the device has one - Android phones with
//              Google's speech services do - else a Hindi voice, which reads Devanagari acceptably.
//  - listen(): speech-to-text in Marathi. Works in Chrome / Edge on Android and desktop (it is sent to the
//              browser vendor's speech service); not available in Firefox, and limited on iPhone.
// Both degrade quietly: the bot always works by tapping and typing too.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

export const canSpeak = Boolean(synth);
export const canListen = Boolean(Recognition);

let voice = null;
function pickVoice() {
  const voices = synth?.getVoices() ?? [];
  const by = (prefix) => voices.find((v) => v.lang?.toLowerCase().replace('_', '-').startsWith(prefix));
  voice = by('mr-in') ?? by('mr') ?? by('hi-in') ?? by('hi') ?? null;
}
if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
}

/** 'mr' when a Marathi voice is installed, 'hi' for the Hindi fallback, null for none. */
export const voiceLanguage = () => (voice ? voice.lang.slice(0, 2).toLowerCase() : null);

// Emoji and symbols are read out literally ("folded hands"), so they are dropped from what is spoken.
const speakable = (text) => text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/[*_#]/g, '').trim();

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

export function speak(text, { lang = 'mr' } = {}) {
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
  // A cancelled utterance also fires end/error, possibly after its replacement started - so only the
  // latest utterance may clear the flag.
  current = u;
  u.onstart = () => setSpeaking(true);
  u.onend = () => current === u && setSpeaking(false);
  u.onerror = () => current === u && setSpeaking(false);
  synth.speak(u);
}

export function stopSpeaking() {
  synth?.cancel();
  setSpeaking(false);
}

/**
 * Start listening. onInterim(text) gets live partial text; resolves with the final transcript
 * ('' if nothing was heard). Call the returned stop() to end early.
 */
export function listen({ lang = 'mr', onInterim } = {}) {
  if (!Recognition) return { promise: Promise.reject(new Error('unsupported')), stop() {} };
  stopSpeaking(); // otherwise the bot's own voice is transcribed
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
