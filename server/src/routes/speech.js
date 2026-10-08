import express, { Router } from 'express';
import { config } from '../config.js';
import { speechLimiter } from '../middleware/rateLimit.js';
import { recognize, speechEnabled, synthesize } from '../services/speech.js';

const router = Router();
const LANGS = new Set(['mr', 'hi', 'en']);
const langOf = (v) => (LANGS.has(v) ? v : 'mr');

/** What the web app can use: server voice/recognition when Bhashini is configured, else the phone's own. */
router.get('/status', (_req, res) => {
  const on = speechEnabled();
  res.json({ tts: on, asr: on, provider: on ? 'bhashini' : null });
});

/** POST { text, lang } -> audio (wav). Cached by text, and the browser may cache it too. */
router.post('/tts', speechLimiter, async (req, res) => {
  const { audio, mime, cached } = await synthesize(req.body?.text, langOf(req.body?.lang));
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Speech-Cache', cached ? 'hit' : 'miss');
  res.send(audio);
});

/** POST raw WAV (16 kHz mono) as the body, ?lang=mr -> { text } */
router.post(
  '/asr',
  speechLimiter,
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: config.maxAudioBytes }),
  async (req, res) => {
    const rate = Number(req.query.rate) || 16000;
    res.json(await recognize(req.body, { lang: langOf(req.query.lang), samplingRate: rate }));
  },
);

export default router;
