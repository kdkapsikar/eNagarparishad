import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { offlineQueue } from '../api/offlineQueue.js';
import { useT } from '../i18n/LanguageContext.jsx';
import { formatDate } from '../lib/format.js';
import { todayIso } from '../lib/validation.js';
import { matchOption, parseYesNo } from './parse.js';
import {
  OPTIONS, STEPS, applyAnswer, emptyData, inputType, isActive, isOptional, nextPosition, positionForField,
  questionText, quickReplies, sequence, skipAnswer, toPayload,
} from './script.js';
import { canListen, canSpeak, listen, speak, stopSpeaking, voiceLanguage } from './speech.js';

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

let messageId = 0;
const msg = (from, text, extra = {}) => ({ id: (messageId += 1), from, text, ...extra });

/**
 * Conversational data collection, in Marathi with voice.
 *  mode="staff":  a signed-in volunteer fills a family's details; saved straight away (queued if offline).
 *  mode="public": a resident registers their own family; staff verify it later.
 */
export default function ChatBot({ mode = 'public' }) {
  const { t, lang } = useT();
  const [data, setData] = useState(emptyData);
  const [pos, setPos] = useState({ step: 'consent' });
  const [history, setHistory] = useState([]);
  const [returnToSummary, setReturnToSummary] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [voiceOn, setVoiceOn] = useState(() => {
    try { return canSpeak && localStorage.getItem(VOICE_KEY) !== 'off'; } catch { return canSpeak; }
  });
  const [listening, setListening] = useState(null); // { stop } while the mic is open
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resumable, setResumable] = useState(() => loadDraft(mode));
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const say = useCallback((text, extra) => {
    setMessages((list) => [...list, msg('bot', text, extra)]);
    if (voiceOn) speak(text, { lang });
  }, [voiceOn, lang]);

  // Greeting + first question (or an offer to continue an unfinished draft).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (resumable) {
      setMessages([msg('bot', t('bot.resumeOffer'))]);
      return;
    }
    const intro = mode === 'staff' ? t('bot.introStaff') : t('bot.intro');
    setMessages([msg('bot', intro)]);
    setTimeout(() => say(questionText({ step: 'consent' }, data, mode)), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pos]);

  useEffect(() => {
    if (pos.step !== 'consent' && pos.step !== 'done' && pos.step !== 'declined') saveDraft(mode, { data, pos, history });
  }, [data, pos, history, mode]);

  useEffect(() => () => stopSpeaking(), []);

  const goTo = (next, nextData, { pushHistory = true } = {}) => {
    if (pushHistory) setHistory((h) => [...h, pos]);
    setPos(next);
    setInput('');
    if (next.step === 'summary') say(t('bot.summaryIntro'));
    else say(questionText(next, nextData, mode));
  };

  const answer = (raw, shown) => {
    if (!STEPS[pos.step] || busy) return;
    const text = String(raw ?? '').trim();
    if (!text) return;
    const next = structuredClone(data);
    const result = applyAnswer(pos, next, mode, text);
    setMessages((list) => [...list, msg('user', shown ?? text)]);
    if (result.error) {
      say(result.error, { error: true });
      return;
    }
    setData(next);
    if (pos.step === 'consent' && result.value === false) {
      setPos({ step: 'declined' });
      say(t('bot.declined'));
      clearDraft(mode);
      return;
    }
    if (returnToSummary) {
      setReturnToSummary(false);
      goTo({ step: 'summary' }, next);
      return;
    }
    goTo(nextPosition(pos, next, mode), next);
  };

  const skip = () => {
    const next = structuredClone(data);
    skipAnswer(pos, next);
    setData(next);
    setMessages((list) => [...list, msg('user', t('bot.skipped'))]);
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
    setMessages((list) => [...list, msg('user', t('bot.back'))]);
    goTo(prev, data, { pushHistory: false });
  };

  const submitInput = (e) => {
    e?.preventDefault();
    answer(input);
  };

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
      // Choices and yes/no answers are sent straight away; free text waits for the Send tap so the
      // person can see (and fix) what was heard.
      const replies = quickReplies(pos, data, mode);
      const isChoice = replies.length > 0 && (parseYesNo(heard) !== null || matchOption(heard, replies.map((r) => ({ value: r.answer, labels: [r.label] }))) !== null);
      if (isChoice || STEPS[pos.step]?.options === 'yesno') answer(heard);
      else inputRef.current?.focus();
    } catch (err) {
      say(t(err.message === 'not-allowed' ? 'bot.micBlocked' : 'bot.micError'), { error: true });
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

  const resume = (yes) => {
    if (yes && resumable) {
      setData(resumable.data);
      setHistory(resumable.history ?? []);
      setPos(resumable.pos);
      setMessages((list) => [...list, msg('user', t('common.yes'))]);
      say(resumable.pos.step === 'summary' ? t('bot.summaryIntro') : questionText(resumable.pos, resumable.data, mode));
    } else {
      clearDraft(mode);
      setMessages([msg('bot', mode === 'staff' ? t('bot.introStaff') : t('bot.intro'))]);
      setTimeout(() => say(questionText({ step: 'consent' }, emptyData(), mode)), 200);
    }
    setResumable(null);
  };

  const restart = () => {
    clearDraft(mode);
    const fresh = emptyData();
    setData(fresh);
    setHistory([]);
    setEditing(false);
    setReturnToSummary(false);
    setPos({ step: 'consent' });
    setMessages([msg('bot', mode === 'staff' ? t('bot.introStaff') : t('bot.intro'))]);
    setTimeout(() => say(questionText({ step: 'consent' }, fresh, mode)), 200);
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
      say(mode === 'staff' ? t('bot.savedStaff') : t('bot.savedPublic'));
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
        say(message ?? err.message, { error: true });
        setReturnToSummary(true);
        setPos(p);
        say(questionText(p, data, mode));
      } else {
        say(err.message, { error: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const replies = STEPS[pos.step] ? quickReplies(pos, data, mode) : [];
  const type = STEPS[pos.step] ? inputType(pos) : 'text';
  const asking = Boolean(STEPS[pos.step]);
  const voiceNote = canSpeak && voiceOn && lang === 'mr' && voiceLanguage() !== 'mr'
    ? (voiceLanguage() === 'hi' ? t('bot.voiceHindi') : t('bot.voiceMissing'))
    : null;

  return (
    <div className="card flex h-[calc(100dvh-16rem)] min-h-[26rem] flex-col overflow-hidden sm:h-[calc(100dvh-15rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-stone-200 bg-brand-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-lg text-white" aria-hidden="true">🙏</span>
          <div>
            <p className="font-semibold text-stone-900">{t('bot.name')}</p>
            <p className="text-xs text-stone-500">{mode === 'staff' ? t('bot.subtitleStaff') : t('bot.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canSpeak && (
            <button type="button" onClick={toggleVoice} className="btn btn-secondary px-3" aria-pressed={voiceOn} title={t(voiceOn ? 'bot.voiceOff' : 'bot.voiceOn')}>
              <span aria-hidden="true">{voiceOn ? '🔊' : '🔇'}</span>
              <span className="sr-only">{t(voiceOn ? 'bot.voiceOff' : 'bot.voiceOn')}</span>
            </button>
          )}
          <button type="button" onClick={restart} className="btn btn-secondary px-3 text-xs">{t('bot.restart')}</button>
        </div>
      </div>
      {voiceNote && <p className="bg-amber-50 px-4 py-1 text-xs text-amber-900">{voiceNote}</p>}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2 text-[15px] leading-relaxed shadow-sm ${
              m.from === 'user' ? 'rounded-br-sm bg-brand-600 text-white'
                : m.error ? 'rounded-bl-sm border border-red-200 bg-red-50 text-red-800'
                  : 'rounded-bl-sm border border-stone-200 bg-white text-stone-800'}`}
            >
              {m.text}
              {m.from === 'bot' && canSpeak && (
                <button type="button" onClick={() => speak(m.text, { lang })} className="ml-2 align-middle text-stone-400 hover:text-brand-600" title={t('bot.replay')}>
                  <span aria-hidden="true">🔈</span><span className="sr-only">{t('bot.replay')}</span>
                </button>
              )}
            </div>
          </div>
        ))}

        {resumable && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => resume(true)}>{t('bot.resumeYes')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => resume(false)}>{t('bot.resumeNo')}</button>
          </div>
        )}

        {pos.step === 'summary' && !editing && <Summary data={data} />}
        {pos.step === 'summary' && editing && <EditPicker data={data} mode={mode} onPick={editField} onCancel={() => setEditing(false)} />}
      </div>

      {/* answer area */}
      <div className="border-t border-stone-200 bg-stone-50 px-3 py-3">
        {asking && replies.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {replies.map((r) => (
              <button key={r.label} type="button" onClick={() => answer(r.answer, r.label)} className="rounded-full border border-brand-600 bg-white px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 active:bg-brand-100">
                {r.label}
              </button>
            ))}
          </div>
        )}

        {asking && (
          <form onSubmit={submitInput} className="flex items-center gap-2">
            <button type="button" onClick={back} disabled={!history.length} className="btn btn-secondary px-3" title={t('bot.back')}>
              <span aria-hidden="true">↩</span><span className="sr-only">{t('bot.back')}</span>
            </button>
            <input
              ref={inputRef}
              className="input flex-1 py-2.5 text-base"
              type={type === 'tel' ? 'tel' : 'text'}
              inputMode={type === 'tel' ? 'tel' : undefined}
              autoCapitalize={type === 'code' ? 'characters' : undefined}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? t('bot.listening') : type === 'date' ? t('bot.datePlaceholder') : t('bot.placeholder')}
              aria-label={t('bot.placeholder')}
            />
            {/* Dates are typed or spoken ("१५ जून १९८०") in the text box; this calendar is the tap-only route. */}
            {type === 'date' && (
              <label className="btn btn-secondary relative cursor-pointer px-3" title={t('bot.pickDate')}>
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
              <button type="button" onClick={mic} className={`btn px-3 ${listening ? 'animate-pulse bg-red-600 text-white' : 'btn-secondary'}`} title={t('bot.speak')}>
                <span aria-hidden="true">🎤</span><span className="sr-only">{t('bot.speak')}</span>
              </button>
            )}
            <button type="submit" className="btn btn-primary px-4" disabled={!input.trim()}>{t('bot.send')}</button>
          </form>
        )}
        {asking && isOptional(pos, data, mode) && (
          <button type="button" onClick={skip} className="mt-2 text-sm font-medium text-stone-500 underline">{t('bot.skip')}</button>
        )}

        {pos.step === 'summary' && !editing && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary flex-1 py-3 text-base" onClick={save} disabled={busy}>
              {busy ? t('common.saving') : t('bot.confirmSave')}
            </button>
            <button type="button" className="btn btn-secondary py-3" onClick={() => setEditing(true)}>{t('bot.edit')}</button>
          </div>
        )}
        {(pos.step === 'done' || pos.step === 'declined') && (
          <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={restart}>
            {mode === 'staff' ? t('bot.nextFamily') : t('bot.startAgain')}
          </button>
        )}
      </div>
    </div>
  );
}

const yesNoText = (t, v) => (v === true ? t('common.yes') : v === false ? t('common.no') : '—');

function Summary({ data }) {
  const { t } = useT();
  const h = data.household;
  const optionLabel = (name, value) => {
    const o = OPTIONS[name]().find((x) => x.value === value);
    return o ? t(o.key) : value ?? '—';
  };
  const rows = [
    [t('field.headName'), h.head_name], [t('field.mobile'), h.mobile], [t('field.whatsapp'), h.whatsapp],
    [t('field.address'), h.address], [t('field.area'), h.area], [t('field.category'), h.category && optionLabel('category', h.category)],
    [t('field.caste'), h.caste], [t('field.farm'), h.has_farm ? h.farm_details || t('common.yes') : yesNoText(t, h.has_farm)],
    [t('field.disability'), h.has_disability ? h.disability || t('common.yes') : yesNoText(t, h.has_disability)],
    [t('field.internet'), yesNoText(t, h.has_internet)], [t('field.waterFilter'), yesNoText(t, h.has_water_filter)],
    [t('field.anganwadi'), yesNoText(t, h.has_anganwadi)], [t('field.gharkul'), yesNoText(t, h.gharkul_benefit)],
    [t('field.otherIssues'), h.other_issues],
  ];
  return (
    <div className="rounded-xl border border-brand-100 bg-white p-4 text-sm shadow-sm">
      <h3 className="mb-2 font-semibold text-brand-800">{t('form.familySection')}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-stone-500">{k}</dt>
            <dd className="text-stone-900">{v || '—'}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mb-2 mt-4 font-semibold text-brand-800">{t('form.membersSection')} ({data.members.filter((m) => m.name).length})</h3>
      <ol className="space-y-2">
        {data.members.filter((m) => m.name).map((m, i) => (
          <li key={i} className="rounded-lg bg-stone-50 px-3 py-2">
            <p className="font-medium text-stone-900">{i + 1}. {m.name} {m.relation && <span className="text-stone-500">({m.relation})</span>}</p>
            <p className="text-stone-600">
              {[m.gender && optionLabel('gender', m.gender), m.dob && `${t('field.dob')}: ${formatDate(m.dob)}`,
                m.anniversary && `${t('field.anniversary')}: ${formatDate(m.anniversary)}`, m.education, m.occupation, m.mobile,
                m.aadhaar && `${t('field.aadhaar')}: XXXX ${m.aadhaar}`, m.voter_id && `${t('field.voterId')}: ${m.voter_id}`,
                m.pan && `${t('field.pan')}: ${m.pan}`].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** "Edit" from the summary: every answered question as a button that asks it again. */
function EditPicker({ data, mode, onPick, onCancel }) {
  const { t } = useT();
  const positions = sequence(data).filter((p) => p.step !== 'consent' && p.step !== 'more' && isActive(p, data, mode));
  const label = (p) => {
    const text = questionText(p, data, mode);
    const short = text.split('\n')[0];
    return short.length > 70 ? `${short.slice(0, 67)}…` : short;
  };
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-sm font-medium text-stone-700">{t('bot.editPick')}</p>
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {positions.map((p) => (
          <button key={`${p.step}-${p.member ?? ''}`} type="button" onClick={() => onPick(p)} className="rounded-md px-2 py-1.5 text-left text-sm text-brand-700 hover:bg-brand-50">
            {label(p)}
          </button>
        ))}
      </div>
      <button type="button" onClick={onCancel} className="btn btn-secondary mt-2">{t('common.cancel')}</button>
    </div>
  );
}
