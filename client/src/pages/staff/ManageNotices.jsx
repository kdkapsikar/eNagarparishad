import { useState } from 'react';
import { api } from '../../api/client.js';
import NoticeCard from '../../components/NoticeCard.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Field from '../../components/ui/Field.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { useApi } from '../../lib/useApi.js';

const EMPTY = { kind: 'electricity', title: '', body: '', area: '', starts_at: '', ends_at: '' };
// <input type="datetime-local"> <-> ISO with the browser's offset.
const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export default function ManageNotices() {
  const { t } = useT();
  const { data, error, loading, reload } = useApi(() => api.adminNotices());
  const areas = useApi(() => api.areas());
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    try {
      await api.saveNotice(editId, { ...form, starts_at: fromLocalInput(form.starts_at), ends_at: fromLocalInput(form.ends_at) });
      setMsg({ ok: true, text: t('noticesAdmin.saved') });
      setForm(EMPTY);
      setEditId(null);
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
      setErrors(err.fields);
    }
  };
  const edit = (n) => {
    setEditId(n.id);
    setForm({ kind: n.kind, title: n.title, body: n.body, area: n.area ?? '', starts_at: toLocalInput(n.starts_at), ends_at: toLocalInput(n.ends_at) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const remove = async (n) => {
    if (!window.confirm(t('noticesAdmin.deleteConfirm'))) return;
    await api.deleteNotice(n.id);
    reload();
  };

  return (
    <div className="space-y-5">
      <h1 className="page-title">{t('noticesAdmin.title')}</h1>
      <form onSubmit={submit} className="card grid gap-4 p-5 sm:grid-cols-2" noValidate>
        <Field label={t('noticesAdmin.kind')}>
          {(p) => (
            <select {...p} value={form.kind} onChange={set('kind')}>
              {['electricity', 'water', 'general'].map((k) => <option key={k} value={k}>{t(`notice.kind.${k}`)}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('field.area')} optional hint={t('noticesAdmin.areaHint')}>
          {(p) => (
            <>
              <input {...p} list="notice-areas" value={form.area} onChange={set('area')} />
              <datalist id="notice-areas">{areas.data?.areas.map((a) => <option key={a.area} value={a.area} />)}</datalist>
            </>
          )}
        </Field>
        <Field label={t('noticesAdmin.titleField')} error={errors.title} className="sm:col-span-2">
          {(p) => <input {...p} value={form.title} onChange={set('title')} />}
        </Field>
        <Field label={t('noticesAdmin.body')} error={errors.body} className="sm:col-span-2">
          {(p) => <textarea {...p} rows={3} value={form.body} onChange={set('body')} />}
        </Field>
        <Field label={t('noticesAdmin.from')} error={errors.starts_at} optional>
          {(p) => <input {...p} type="datetime-local" value={form.starts_at} onChange={set('starts_at')} />}
        </Field>
        <Field label={t('noticesAdmin.to')} error={errors.ends_at} optional>
          {(p) => <input {...p} type="datetime-local" value={form.ends_at} onChange={set('ends_at')} />}
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button className="btn btn-primary">{editId ? t('common.save') : t('noticesAdmin.publish')}</button>
          {editId && <button type="button" className="btn btn-secondary" onClick={() => { setEditId(null); setForm(EMPTY); }}>{t('common.cancel')}</button>}
          <p className="text-sm text-stone-500">{t('noticesAdmin.sendHint')}</p>
        </div>
        {msg && <div className="sm:col-span-2"><Alert kind={msg.ok ? 'success' : 'error'}>{msg.text}</Alert></div>}
      </form>

      {loading && <Spinner />}
      {error && <Alert kind="error">{error.message}</Alert>}
      <div className="space-y-3">
        {data?.notices.map((n) => (
          <div key={n.id} className="space-y-1">
            <NoticeCard notice={n} />
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary px-3 py-1 text-xs" onClick={() => edit(n)}>{t('common.edit')}</button>
              <button type="button" className="btn btn-danger px-3 py-1 text-xs" onClick={() => remove(n)}>{t('common.delete')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
