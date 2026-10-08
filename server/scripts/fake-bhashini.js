// A stand-in for Bhashini for local development before real keys exist. It answers the pipeline config
// and compute calls in Bhashini's documented format: TTS returns a short tone (not speech) whose length
// follows the text, ASR always "hears" होय. Start it, then point the API at it in server/.env:
//   BHASHINI_USER_ID=dev  BHASHINI_API_KEY=dev  BHASHINI_CONFIG_URL=http://localhost:3099/config
//   npm run bhashini:fake -w server
import express from 'express';

const PORT = Number(process.env.FAKE_BHASHINI_PORT) || 3099;
const app = express();
app.use(express.json({ limit: '10mb' }));

function toneWav(seconds, rate = 22050) {
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    const envelope = Math.min(1, i / 2000, (n - i) / 2000);
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 180 * i) / rate) * 6000 * envelope), 44 + i * 2);
  }
  return buf;
}

app.post('/config', (req, res) => {
  const task = req.body.pipelineTasks?.[0]?.taskType;
  const lang = req.body.pipelineTasks?.[0]?.config?.language?.sourceLanguage ?? 'mr';
  console.log(`[fake bhashini] config ${task}/${lang}`);
  res.json({
    pipelineResponseConfig: [{ taskType: task, config: [{ serviceId: `fake-${task}-${lang}`, language: { sourceLanguage: lang }, supportedVoices: ['male', 'female'] }] }],
    pipelineInferenceAPIEndPoint: { callbackUrl: `http://localhost:${PORT}/compute`, inferenceApiKey: { name: 'Authorization', value: 'fake' } },
  });
});

app.post('/compute', (req, res) => {
  const task = req.body.pipelineTasks?.[0];
  if (task?.taskType === 'tts') {
    const text = req.body.inputData.input[0].source;
    console.log(`[fake bhashini] tts (${task.config.gender}): ${text.slice(0, 60)}`);
    const wav = toneWav(Math.min(6, 0.4 + text.length * 0.03));
    return res.json({ pipelineResponse: [{ taskType: 'tts', config: { audioFormat: 'wav' }, audio: [{ audioContent: wav.toString('base64') }] }] });
  }
  const bytes = Buffer.from(req.body.inputData?.audio?.[0]?.audioContent ?? '', 'base64').length;
  console.log(`[fake bhashini] asr ${bytes} bytes`);
  return res.json({ pipelineResponse: [{ taskType: 'asr', output: [{ source: 'होय' }] }] });
});

app.listen(PORT, () => console.log(`Fake Bhashini on http://localhost:${PORT} (config URL: http://localhost:${PORT}/config)`));
