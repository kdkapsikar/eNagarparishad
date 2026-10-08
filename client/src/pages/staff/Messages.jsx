import { useState } from 'react';
import { api } from '../../api/client.js';
import Alert from '../../components/ui/Alert.jsx';
import Field from '../../components/ui/Field.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { formatDate, smsLink, whatsappLink } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';

const ICON = { birthday: '🎂', anniversary: '💐', notice: '📢', custom: '✉️' };
const TABS = ['pending', 'sent', 'skipped', 'failed'];

export default function Messages() {
  const { t } = useT();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('pending');
  const { data, error, loading, reload } = useApi(() => api.messages(tab), [tab]);
  const [actionError, setActionError] = useState(null);

  const mark = async (id, status) => {
    try {
      await api.setMessageStatus(id, status);
      reload();
    } catch (e) {
      setActionError(e.message);
    }
  };
  // Opening WhatsApp is the "send" in manual mode, so the message moves to Sent (with Undo there).
  const sendVia = (m, link) => {
    window.open(link, '_blank', 'noopener');
    mark(m.id, 'sent');
  };

  return (
    <div className="space-y-5">
      <h1 className="page-title">{t('messages.title')}</h1>
      {data?.manual && <Alert kind="info">{t('messages.manualNote')}</Alert>}
      {isAdmin && <Broadcast onSent={() => { setTab('pending'); reload(); }} />}

      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`btn ${tab === k ? 'btn-primary' : 'btn-secondary'}`}>
            {t(`messages.tab.${k}`)} {data?.counts?.[k] ? `(${data.counts[k]})` : ''}
          </button>
        ))}
      </div>
      <Alert kind="error">{actionError}</Alert>
      {loading && <Spinner />}
      {error && <Alert kind="error">{error.message}</Alert>}
      {data && data.messages.length === 0 && <p className="card p-6 text-center text-stone-500">{t('messages.none')}</p>}
      <ul className="space-y-3">
        {data?.messages.map((m) => (
          <li key={m.id} className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">{ICON[m.kind]} {m.recipient} <span className="text-sm font-normal text-stone-500">{m.phone}</span></p>
              <p className="text-xs text-stone-500">{t(`messages.kind.${m.kind}`)} · {formatDate(m.for_date)}</p>
            </div>
            <p className="mt-2 whitespace-pre-line rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-800">{m.body}</p>
            {m.error && <p className="mt-1 text-xs text-red-600">{m.error}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {tab === 'pending' || tab === 'failed' ? (
                <>
                  <button type="button" className="btn bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => sendVia(m, whatsappLink(m.phone, m.body))}>WhatsApp</button>
                  <button type="button" className="btn btn-secondary" onClick={() => sendVia(m, smsLink(m.phone, m.body))}>SMS</button>
                  <button type="button" className="btn btn-secondary" onClick={() => mark(m.id, 'skipped')}>{t('messages.skip')}</button>
                </>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={() => mark(m.id, 'pending')}>{t('messages.undo')}</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Broadcast({ onSent }) {
  const { t } = useT();
  const notices = useApi(() => api.adminNotices());
  const areas = useApi(() => api.areas());
  const [form, setForm] = useState({ notice_id: '', body: '', area: '' });
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setErrors({});
    try {
      const { count } = await api.broadcast({ notice_id: form.notice_id ? Number(form.notice_id) : null, body: form.body, area: form.area });
      setResult({ ok: true, text: t('messages.broadcastDone', { n: count }) });
      setForm({ notice_id: '', body: '', area: '' });
      onSent();
    } catch (err) {
      setResult({ ok: false, text: err.message });
      setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="card p-4">
      <summary className="cursor-pointer font-semibold text-brand-800">📢 {t('messages.broadcast')}</summary>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <p className="text-sm text-stone-600">{t('messages.broadcastIntro')}</p>
        <Field label={t('messages.useNotice')} optional>
          {(p) => (
            <select {...p} value={form.notice_id} onChange={(e) => setForm({ ...form, notice_id: e.target.value })}>
              <option value="">{t('messages.customText')}</option>
              {notices.data?.notices.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
          )}
        </Field>
        {!form.notice_id && (
          <Field label={t('messages.text')} error={errors.body}>
            {(p) => <textarea {...p} rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />}
          </Field>
        )}
        <Field label={t('field.area')} optional hint={t('messages.areaHint')}>
          {(p) => (
            <select {...p} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
              <option value="">{t('notice.wholeWard')}</option>
              {areas.data?.areas.map((a) => <option key={a.area} value={a.area}>{a.area} ({a.households})</option>)}
            </select>
          )}
        </Field>
        {result && <Alert kind={result.ok ? 'success' : 'error'}>{result.text}</Alert>}
        <button className="btn btn-primary" disabled={busy}>{t('messages.prepare')}</button>
      </form>
    </details>
  );
}
