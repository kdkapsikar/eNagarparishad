import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { offlineQueue } from '../api/offlineQueue.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useT } from '../i18n/LanguageContext.jsx';
import { formatDate, formatDateTime } from '../lib/format.js';
import { normalizeMobile, todayIso } from '../lib/validation.js';
import Mascot from './Mascot.jsx';
import { detectIntent, matchOption, parseYesNo, searchSchemes } from './parse.js';
import {
  STEPS, applyAnswer, emptyData, inputType, isActive, isOptional, nextPosition, positionForField,
  questionText, quickReplies, skipAnswer, toPayload,
} from './script.js';
import {
  availableVoices, canListen, canSpeak, chooseVoice, currentVoiceName, listen, speak, stopSpeaking, voiceLanguage,
} from './speech.js';
import { EditPicker, Summary } from './SurveySummary.jsx';

const DRAFT_KEY = (mode) => `enp_bot_draft_${mode}`;
const VOICE_KEY = 'enp_bot_voice';

function loadDraft(mode) {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY(mode)) ?? 'null');
    return draft?.data && draft?.pos ? draft : null;
  } catch {
    return null;
  }
}
const saveDraft = (mode, draft) => {
  try { localStorage.setItem(DRAFT_KEY(mode), JSON.stringify(draft)); } catch { /* ignore */ }
};
const clearDraft = (mode) => {
  try { localStorage.removeItem(DRAFT_KEY(mode)); } catch { /* ignore */ }
};

// Unique even across hot reloads / remounts, which reset the counter.
let messageId = 0;
const msg = (from, text, extra = {}) => ({ ...extra, id: `${Date.now().toString(36)}-${(messageId += 1)}`, from, text });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const MENU = [
  ['register', '📝', 'bot.menu.register'],
  ['notices', '💡', 'bot.menu.notices'],
  ['schemes', '🏛️', 'bot.menu.schemes'],
  ['certificate', '📜', 'bot.menu.certificate'],
  ['contact', '📞', 'bot.menu.contact'],
];
const NOTICE_ICON = { electricity: '⚡', water: '💧', general: '📢' };

/**
 * मदतनीस - the ward's assistant, in Marathi with voice.
 *
 * mode="public": a resident's helper. Starts at a menu (register the family, power / water notices,
 *   schemes, certificate status, office contact); `start="register"` jumps straight into registration.
 *   Registrations are saved unverified for staff to check.
 * mode="staff":  a volunteer surveys a family; goes straight into the survey, saved at once (queued offline).
 *
 * `command` ({ intent, n }) lets the floating widget start a flow from outside, e.g. the home page button.
 * `onClose` adds a close button (widget). `fill` makes the chat take its parent's height.
 */
export default function ChatBot({ mode = 'public', start = mode === 'staff' ? 'register' : 'menu', command, onClose, fill = false }) {
  const { t, lang } = useT();
  const settings = useSettings();
  const [phase, setPhase] = useState('menu'); // menu | survey | schemes | certificate | track-id | track-phone
  const [data, setData] = useState(emptyData);
  const [pos, setPos] = useState({ step: 'consent' });
  const [history, setHistory] = useState([]);
  const [returnToSummary, setReturnToSummary] = useState(false);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [voiceOn, setVoiceOn] = useState(() => {
    try { return canSpeak && localStorage.getItem(VOICE_KEY) !== 'off'; } catch { return canSpeak; }
  });
  const [listening, setListening] = useState(null); // { stop } while the mic is open
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resumable, setResumable] = useState(() => loadDraft(mode));
  const [schemes, setSchemes] = useState(null);
  const [trackId, setTrackId] = useState('');
  const [voices, setVoices] = useState(availableVoices);
  const [voiceName, setVoiceName] = useState(currentVoiceName);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const queue = useRef(Promise.resolve());
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;

  /**
   * The bot "types" (dots), then each bubble appears and the whole turn is read aloud. Calls are queued,
   * so bubbles never overtake each other. A bubble is a string or { text, links }.
   */
  const say = useCallback((...bubbles) => {
    const list = bubbles.flat().filter(Boolean).map((b) => (typeof b === 'string' ? { text: b } : b));
    queue.current = queue.current.then(async () => {
      for (const b of list) {
        setTyping(true);
        await wait(Math.min(1100, 300 + b.text.length * 7));
        setTyping(false);
        setMessages((m) => [...m, msg('bot', b.text, b)]);
      }
      if (voiceRef.current) speak(list.map((b) => b.text).join('. '), { lang });
    });
    return queue.current;
  }, [lang]);

  const userSays = (text) => setMessages((m) => [...m, msg('user', text)]);
  const ack = () => (Math.random() < 0.65 ? `${pick(t('bot.ack').split('|'))} ` : '');

  // ---- opening ---------------------------------------------------------------------------------
  const greeting = () => (mode === 'staff' ? t('bot.introStaff') : t('bot.intro'));

  const startSurvey = useCallback((intro) => {
    const fresh = emptyData();
    setData(fresh);
    setHistory([]);
    setEditing(false);
    setReturnToSummary(false);
    setPos({ step: 'consent' });
    setPhase('survey');
    say(intro, questionText({ step: 'consent' }, fresh, mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say, mode]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (resumable) {
      say(t('bot.resumeOffer'));
    } else if (start === 'register') {
      startSurvey(greeting());
    } else {
      say(t('bot.introMenu'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, pos, editing]);

  useEffect(() => {
    const inProgress = phase === 'survey' && pos.step !== 'consent' && (Boolean(STEPS[pos.step]) || pos.step === 'summary');
    if (inProgress) saveDraft(mode, { data, pos, history });
  }, [data, pos, history, mode, phase]);

  useEffect(() => () => stopSpeaking(), []);

  // Voices load late on some phones.
  useEffect(() => {
    if (!canSpeak) return undefined;
    const update = () => { setVoices(availableVoices()); setVoiceName(currentVoiceName()); };
    window.speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, []);

  const pickVoice = (name) => {
    chooseVoice(name);
    setVoiceName(currentVoiceName());
    speak(t('bot.voiceSample'), { lang });
  };

  // ---- menu flows ------------------------------------------------------------------------------
  const backToMenu = () => {
    setPhase('menu');
    return say(t('bot.anythingElse'));
  };

  const loadSchemes = async () => {
    if (schemes) return schemes;
    const { schemes: list } = await api.schemes();
    setSchemes(list);
    return list;
  };

  const runIntent = async (intent, shown) => {
    if (shown) userSays(shown);
    stopSpeaking();
    try {
      if (intent === 'register') {
        if (resumable) { setResumable(null); clearDraft(mode); }
        startSurvey(t('bot.letsStart'));
      } else if (intent === 'notices') {
        setPhase('menu');
        const { notices } = await api.notices();
        if (!notices.length) {
          await say(t('bot.noNotices'));
        } else {
          await say(
            t('bot.noticesIntro', { n: Math.min(3, notices.length) }),
            ...notices.slice(0, 3).map((n) => [
              `${NOTICE_ICON[n.kind]} ${n.title}${n.area ? ` (${n.area})` : ''}`,
              n.body,
              n.starts_at && `🕒 ${formatDateTime(n.starts_at)}${n.ends_at ? ` — ${formatDateTime(n.ends_at)}` : ''}`,
            ].filter(Boolean).join('\n')),
            { text: t('bot.noticesMore'), links: [{ to: '/notices', label: t('bot.link.notices') }] },
          );
        }
        await backToMenu();
      } else if (intent === 'schemes') {
        await loadSchemes();
        setPhase('schemes');
        say(t('bot.schemesAsk'));
      } else if (intent === 'certificate') {
        setPhase('certificate');
        say({ text: t('bot.certIntro'), links: [{ to: '/certificates', label: t('bot.link.apply') }] });
      } else if (intent === 'contact') {
        setPhase('menu');
        const lines = [t('bot.contactIntro', { office: settings.office_name || t('app.name') })];
        if (settings.office_address) lines.push(`📍 ${settings.office_address}`);
        if (settings.office_phone) lines.push(`📞 ${settings.office_phone}`);
        await say({ text: lines.join('\n'), links: settings.office_phone ? [{ href: `tel:${settings.office_phone}`, label: t('bot.link.call') }] : [] });
        await backToMenu();
      } else if (intent === 'greet') {
        await say(t('bot.greetBack'));
      } else {
        await say(t('bot.notUnderstood'));
      }
    } catch (err) {
      await say({ text: err.message, error: true });
      setPhase('menu');
    }
  };

  // The floating widget can ask for a flow (e.g. "register" from the home page button).
  const lastCommand = useRef(null);
  useEffect(() => {
    if (!command || command.n === lastCommand.current) return;
    lastCommand.current = command.n;
    if (started.current && command.intent) runIntent(command.intent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command]);

  const showSchemes = async (query, shown) => {
    userSays(shown ?? query);
    const list = schemes ?? (await loadSchemes());
    const found = query === '__new__' ? list.filter((s) => s.is_new) : searchSchemes(query, list);
    if (!found.length) {
      await say(t('bot.schemesNone'));
      return;
    }
    await say(
      t('bot.schemesFound', { n: Math.min(4, found.length) }),
      ...found.slice(0, 4).map((s) => ({ text: `🏛️ ${s.title}\n${s.summary}`, links: [{ to: `/schemes/${s.id}`, label: t('bot.link.scheme') }] })),
    );
    await say(t('bot.schemesMore'));
  };

  const trackStep = async (text) => {
    userSays(text);
    if (phase === 'track-id') {
      const id = text.trim().toUpperCase().replace(/\s+/g, '');
      if (!/^(JN|MR)-?\d{2}-?[A-Z0-9]{6}$/.test(id)) {
        await say({ text: t('bot.trackBadId'), error: true });
        return;
      }
      setTrackId(id.replace(/^(JN|MR)-?(\d{2})-?/, '$1-$2-'));
      setPhase('track-phone');
      await say(t('bot.trackAskPhone'));
      return;
    }
    const phone = normalizeMobile(text);
    if (!phone) {
      await say({ text: t('bot.err.mobile'), error: true });
      return;
    }
    try {
      const { request, updates } = await api.trackCertificate(trackId, phone);
      const last = updates[updates.length - 1];
      await say(t('bot.trackResult', {
        id: request.id, name: request.person_name, status: t(`cert.status.${request.status}`),
        date: formatDate(last?.created_at?.slice(0, 10)),
      }) + (last?.remark ? `\n${t('bot.trackRemark')}: ${last.remark}` : ''));
    } catch (err) {
      await say({ text: err.status === 404 ? t('bot.trackNotFound') : err.message, error: true });
    }
    await backToMenu();
  };

  // ---- survey ----------------------------------------------------------------------------------
  const goTo = (next, nextData, { pushHistory = true, prefix = '' } = {}) => {
    if (pushHistory) setHistory((h) => [...h, pos]);
    setPos(next);
    setInput('');
    if (next.step === 'summary') say(t('bot.summaryIntro'));
    else say(prefix + questionText(next, nextData, mode));
  };

  const answer = (raw, shown) => {
    if (busy) return;
    const text = String(raw ?? '').trim();
    if (!text) return;
    if (phase === 'menu') {
      setInput('');
      const intent = detectIntent(text);
      // "शेतीसाठी काही योजना आहे का?" - search right away instead of asking which scheme.
      if (intent === 'schemes') {
        setPhase('schemes');
        loadSchemes().then((list) => (searchSchemes(text, list).length ? showSchemes(text) : runIntent('schemes', text)))
          .catch((err) => say({ text: err.message, error: true }));
      } else {
        runIntent(intent, text);
      }
      return;
    }
    if (phase === 'schemes') {
      setInput('');
      if (detectIntent(text) && !searchSchemes(text, schemes ?? []).length) runIntent(detectIntent(text), text);
      else showSchemes(text);
      return;
    }
    if (phase === 'certificate' || phase === 'track-id' || phase === 'track-phone') {
      setInput('');
      if (phase === 'certificate') {
        userSays(text);
        setPhase('track-id');
        say(t('bot.trackAskId'));
      } else {
        trackStep(text);
      }
      return;
    }
    if (!STEPS[pos.step]) return;
    const next = structuredClone(data);
    const result = applyAnswer(pos, next, mode, text);
    userSays(shown ?? text);
    if (result.error) {
      say({ text: `${t('bot.sorry')} ${result.error}`, error: true });
      return;
    }
    setData(next);
    if (pos.step === 'consent' && result.value === false) {
      setPos({ step: 'declined' });
      clearDraft(mode);
      say(t('bot.declined'));
      if (mode === 'public') backToMenu();
      return;
    }
    if (returnToSummary) {
      setReturnToSummary(false);
      goTo({ step: 'summary' }, next);
      return;
    }
    goTo(nextPosition(pos, next, mode), next, { prefix: pos.step === 'consent' ? '' : ack() });
  };

  const skip = () => {
    const next = structuredClone(data);
    skipAnswer(pos, next);
    setData(next);
    userSays(t('bot.skipped'));
    if (returnToSummary) {
      setReturnToSummary(false);
      goTo({ step: 'summary' }, next);
    } else {
      goTo(nextPosition(pos, next, mode), next);
    }
  };

  const back = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    userSays(t('bot.back'));
    goTo(prev, data, { pushHistory: false });
  };

  const resume = (yes) => {
    const draft = resumable;
    setResumable(null);
    userSays(yes ? t('bot.resumeYes') : t('bot.resumeNo'));
    if (yes && draft) {
      setData(draft.data);
      setHistory(draft.history ?? []);
      setPos(draft.pos);
      setPhase('survey');
      say(draft.pos.step === 'summary' ? t('bot.summaryIntro') : questionText(draft.pos, draft.data, mode));
    } else {
      clearDraft(mode);
      if (start === 'register') startSurvey(greeting());
      else say(t('bot.introMenu'));
    }
  };

  const editField = (p) => {
    setEditing(false);
    setReturnToSummary(true);
    setPos(p);
    say(questionText(p, data, mode));
  };

  const save = async () => {
    setBusy(true);
    const payload = toPayload(data);
    try {
      if (mode === 'staff') await api.createHousehold({ ...payload, source: 'bot' });
      else await api.selfRegister(payload);
      clearDraft(mode);
      setPos({ step: 'done' });
      userSays(t('bot.confirmSave'));
      await say(mode === 'staff' ? t('bot.savedStaff') : t('bot.savedPublic'));
      if (mode === 'public') backToMenu();
    } catch (err) {
      if (err.offline && mode === 'staff') {
        offlineQueue.add({ ...payload, source: 'bot' });
        clearDraft(mode);
        setPos({ step: 'done' });
        say(t('bot.savedOffline'));
        return;
      }
      // Re-ask the first question the server did not accept.
      const [field, message] = Object.entries(err.fields ?? {})[0] ?? [];
      const p = field && positionForField(field);
      if (p && isActive(p, data, mode)) {
        setReturnToSummary(true);
        setPos(p);
        say({ text: message ?? err.message, error: true }, questionText(p, data, mode));
      } else {
        say({ text: err.message, error: true });
      }
    } finally {
      setBusy(false);
    }
  };

  // ---- voice -----------------------------------------------------------------------------------
  const mic = async () => {
    if (listening) {
      listening.stop();
      return;
    }
    const session = listen({ lang, onInterim: setInput });
    setListening(session);
    try {
      const heard = await session.promise;
      if (!heard) return;
      setInput(heard);
      // Menu requests, choices and yes/no answers go straight away; free text (names, addresses) waits
      // for the Send tap so the person can see - and fix - what was heard.
      const surveyChoice = phase === 'survey' && STEPS[pos.step] && (
        STEPS[pos.step].options === 'yesno'
        || parseYesNo(heard) !== null
        || matchOption(heard, quickReplies(pos, data, mode).map((r) => ({ value: r.answer, labels: [r.label] }))) !== null
      );
      if (phase !== 'survey' || surveyChoice) answer(heard);
      else inputRef.current?.focus();
    } catch (err) {
      say({ text: t(err.message === 'not-allowed' ? 'bot.micBlocked' : 'bot.micError'), error: true });
    } finally {
      setListening(null);
    }
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    if (!next) stopSpeaking();
    try { localStorage.setItem(VOICE_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }
  };

  // ---- what the answer area offers right now ----------------------------------------------------
  const inSurveyQuestion = phase === 'survey' && Boolean(STEPS[pos.step]);
  let chips = [];
  if (resumable) {
    chips = [{ label: t('bot.resumeYes'), run: () => resume(true) }, { label: t('bot.resumeNo'), run: () => resume(false) }];
  } else if (inSurveyQuestion) {
    chips = quickReplies(pos, data, mode).map((r) => ({ label: r.label, run: () => answer(r.answer, r.label) }));
  } else if (phase === 'menu' && mode === 'public' && pos.step !== 'summary') {
    chips = MENU.map(([intent, icon, key]) => ({ label: `${icon} ${t(key)}`, run: () => runIntent(intent, t(key)) }));
  } else if (phase === 'schemes') {
    const categories = [...new Set((schemes ?? []).map((s) => s.category))];
    chips = [
      { label: `✨ ${t('bot.schemesNew')}`, run: () => showSchemes('__new__', t('bot.schemesNew')) },
      ...categories.map((c) => ({ label: c, run: () => showSchemes(c) })),
      { label: `↩ ${t('bot.menu.back')}`, run: () => { userSays(t('bot.menu.back')); backToMenu(); } },
    ];
  } else if (phase === 'certificate') {
    chips = [
      { label: `🔍 ${t('bot.certTrack')}`, run: () => { userSays(t('bot.certTrack')); setPhase('track-id'); say(t('bot.trackAskId')); } },
      { label: `↩ ${t('bot.menu.back')}`, run: () => { userSays(t('bot.menu.back')); backToMenu(); } },
    ];
  }
  const type = inSurveyQuestion ? inputType(pos) : 'text';
  const showInput = !resumable && (inSurveyQuestion || (mode === 'public' && phase !== 'survey'));
  const voiceNote = canSpeak && voiceOn && lang === 'mr' && voiceLanguage() !== 'mr'
    ? (voiceLanguage() === 'hi' ? t('bot.voiceHindi') : t('bot.voiceMissing'))
    : null;

  return (
    <div className={`flex flex-col overflow-hidden ${fill ? 'h-full' : 'card h-[calc(100dvh-16rem)] min-h-[26rem] sm:h-[calc(100dvh-15rem)]'}`}>
      <div className="flex items-center gap-3 border-b border-orange-200 bg-gradient-to-r from-brand-50 to-orange-100/60 px-3 py-2">
        <Mascot size={44} pose="rest" listening={Boolean(listening)} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="font-bold text-stone-900">{t('bot.name')}</p>
          <p className="truncate text-xs text-stone-600">{mode === 'staff' ? t('bot.subtitleStaff') : t('bot.subtitle')}</p>
        </div>
        {canSpeak && (
          <button type="button" onClick={toggleVoice} className="btn btn-secondary px-2.5" aria-pressed={voiceOn} title={t(voiceOn ? 'bot.voiceOff' : 'bot.voiceOn')}>
            <span aria-hidden="true">{voiceOn ? '🔊' : '🔇'}</span>
            <span className="sr-only">{t(voiceOn ? 'bot.voiceOff' : 'bot.voiceOn')}</span>
          </button>
        )}
        <button type="button" onClick={() => (mode === 'staff' || start === 'register' ? startSurvey(greeting()) : runIntent('register', t('bot.menu.register')))} className="btn btn-secondary hidden px-2.5 text-xs sm:inline-flex">
          {t('bot.restart')}
        </button>
        {onClose && (
          <button type="button" onClick={onClose} className="btn btn-secondary px-2.5" aria-label={t('bot.close')}>✕</button>
        )}
      </div>
      {voiceNote && <p className="bg-amber-50 px-3 py-1 text-[11px] leading-snug text-amber-900">{voiceNote}</p>}
      {/* Several voices on this phone: let people pick the one that sounds right (a man's, for the मदतनीस). */}
      {voiceOn && lang === 'mr' && voices.length > 1 && (
        <label className="flex items-center gap-2 border-b border-orange-100 bg-orange-50/60 px-3 py-1 text-xs text-stone-600">
          🎙️ {t('bot.voicePick')}
          <select value={voiceName ?? ''} onChange={(e) => pickVoice(e.target.value)} className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-1 py-0.5 text-xs">
            {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </label>
      )}

      <div ref={scrollRef} className="bot-ground flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-4" role="log" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`bot-pop flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[86%] whitespace-pre-line px-3.5 py-2 text-[15px] leading-relaxed shadow-sm ${
              m.from === 'user' ? 'rounded-2xl rounded-br-sm bg-brand-600 text-white'
                : m.error ? 'rounded-2xl rounded-bl-sm border border-red-200 bg-red-50 text-red-800'
                  : 'rounded-2xl rounded-bl-sm border-l-4 border-brand-600 bg-white text-stone-800'}`}
            >
              {m.text}
              {m.links?.length > 0 && (
                <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {m.links.map((l) => (l.to
                    ? <Link key={l.label} to={l.to} className="text-sm font-semibold text-brand-700 underline">{l.label} →</Link>
                    : <a key={l.label} href={l.href} className="text-sm font-semibold text-brand-700 underline">{l.label} →</a>))}
                </span>
              )}
              {m.from === 'bot' && canSpeak && (
                <button type="button" onClick={() => speak(m.text, { lang })} className="ml-1.5 align-middle text-stone-400 hover:text-brand-600" title={t('bot.replay')}>
                  <span aria-hidden="true">🔈</span><span className="sr-only">{t('bot.replay')}</span>
                </button>
              )}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start" aria-label={t('bot.typing')}>
            <div className="bot-typing flex gap-1 rounded-2xl rounded-bl-sm border-l-4 border-brand-600 bg-white px-4 py-3.5 shadow-sm">
              <span /><span /><span />
            </div>
          </div>
        )}
        {pos.step === 'summary' && phase === 'survey' && !editing && <Summary data={data} />}
        {pos.step === 'summary' && phase === 'survey' && editing && <EditPicker data={data} mode={mode} onPick={editField} onCancel={() => setEditing(false)} />}
      </div>

      {/* answer area */}
      <div className="border-t border-orange-200 bg-orange-50/60 px-3 py-2.5">
        {chips.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button key={c.label} type="button" onClick={c.run} className="rounded-full border border-brand-600 bg-white px-3.5 py-1.5 text-sm font-medium text-brand-700 shadow-sm hover:bg-brand-50 active:bg-brand-100">
                {c.label}
              </button>
            ))}
          </div>
        )}

        {showInput && (
          <form onSubmit={(e) => { e.preventDefault(); answer(input); }} className="flex items-center gap-1.5">
            {inSurveyQuestion && (
              <button type="button" onClick={back} disabled={!history.length} className="btn btn-secondary px-2.5" title={t('bot.back')}>
                <span aria-hidden="true">↩</span><span className="sr-only">{t('bot.back')}</span>
              </button>
            )}
            <input
              ref={inputRef}
              className="input min-w-0 flex-1 py-2.5 text-base"
              type={type === 'tel' ? 'tel' : 'text'}
              inputMode={type === 'tel' ? 'tel' : undefined}
              autoCapitalize={type === 'code' ? 'characters' : undefined}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? t('bot.listening') : type === 'date' ? t('bot.datePlaceholder') : inSurveyQuestion ? t('bot.placeholder') : t('bot.placeholderMenu')}
              aria-label={t('bot.placeholder')}
            />
            {/* Dates are typed or spoken ("१५ जून १९८०") in the text box; this calendar is the tap-only route. */}
            {type === 'date' && (
              <label className="btn btn-secondary relative cursor-pointer px-2.5" title={t('bot.pickDate')}>
                <span aria-hidden="true">📅</span><span className="sr-only">{t('bot.pickDate')}</span>
                <input
                  type="date"
                  max={todayIso()}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => e.target.value && answer(e.target.value, formatDate(e.target.value))}
                />
              </label>
            )}
            {canListen && (
              <button type="button" onClick={mic} className={`btn px-2.5 ${listening ? 'animate-pulse bg-red-600 text-white' : 'btn-secondary'}`} title={t('bot.speak')}>
                <span aria-hidden="true">🎤</span><span className="sr-only">{t('bot.speak')}</span>
              </button>
            )}
            <button type="submit" className="btn btn-primary px-3.5" disabled={!input.trim()}>{t('bot.send')}</button>
          </form>
        )}
        {inSurveyQuestion && isOptional(pos, data, mode) && (
          <button type="button" onClick={skip} className="mt-1.5 text-sm font-medium text-stone-500 underline">{t('bot.skip')}</button>
        )}

        {phase === 'survey' && pos.step === 'summary' && !editing && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary flex-1 py-3 text-base" onClick={save} disabled={busy}>
              {busy ? t('common.saving') : t('bot.confirmSave')}
            </button>
            <button type="button" className="btn btn-secondary py-3" onClick={() => setEditing(true)}>{t('bot.edit')}</button>
          </div>
        )}
        {mode === 'staff' && (pos.step === 'done' || pos.step === 'declined') && (
          <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={() => startSurvey(t('bot.letsStart'))}>
            {t('bot.nextFamily')}
          </button>
        )}
      </div>
    </div>
  );
}
