// Records one spoken answer from the microphone as 16 kHz mono WAV - the format Bhashini's speech
// recognition expects - and stops by itself after the person goes quiet (or after maxSeconds).
// MediaRecorder would give webm/opus, which Bhashini does not reliably accept, so raw samples are taken
// with the Web Audio API and encoded here.

const TARGET_RATE = 16000;

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Average blocks of samples down to 16 kHz (enough for speech). */
function downsample(chunks, fromRate) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  if (fromRate === TARGET_RATE) return all;
  const ratio = fromRate / TARGET_RATE;
  const out = new Float32Array(Math.floor(total / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(total, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += all[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export const canRecord = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  && typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);

/**
 * Start recording. Returns { promise, stop }: the promise resolves with a WAV Blob, or null when nothing
 * was said. onLevel(0..1) can drive a level meter.
 */
export function recordAnswer({ maxSeconds = 12, silenceMs = 1300, onLevel } = {}) {
  let stopFn = () => {};
  const promise = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    let heardSpeech = false;
    let lastLoud = performance.now();
    const started = performance.now();

    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        node.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
        resolve(heardSpeech ? encodeWav(downsample(chunks, ctx.sampleRate), TARGET_RATE) : null);
      };
      stopFn = finish;
      node.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(data));
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        onLevel?.(Math.min(1, rms * 8));
        const now = performance.now();
        if (rms > 0.02) { heardSpeech = true; lastLoud = now; }
        const quietTooLong = heardSpeech && now - lastLoud > silenceMs;
        const nothingSaid = !heardSpeech && now - started > 6000;
        if (quietTooLong || nothingSaid || now - started > maxSeconds * 1000) finish();
      };
      source.connect(node);
      node.connect(ctx.destination);
    });
  })();
  return { promise, stop: () => stopFn() };
}
