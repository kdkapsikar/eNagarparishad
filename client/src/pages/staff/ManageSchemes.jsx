import { useState } from 'react';
import { api } from '../../api/client.js';
import Alert from '../../components/ui/Alert.jsx';
import Field from '../../components/ui/Field.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { useApi } from '../../lib/useApi.js';

const EMPTY = {
  title: '', level: 'state', category: '', summary: '', benefits: '', eligibility: '', documents: '', how_to_apply: '', link: '', is_new: true, is_active: true,
};

export default function ManageSchemes() {
  const { t } = useT();
  const { data, error, loading, reload } = useApi(() => api.adminSchemes());
  const [form, setForm] = useState(null); // null = list view
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    try {
      const { id, ...body } = form;
      await api.saveScheme(id, body);
      setForm(null);
      setMsg(t('schemesAdmin.saved'));
      reload();
    } catch (err) {
      setMsg(null);
      setErrors({ _: err.message, ...err.fields });
    }
  };
  const remove = async (s) => {
    if (!window.confirm(t('schemesAdmin.deleteConfirm', { title: s.title }))) return;
    await api.deleteScheme(s.id);
    reload();
  };

  if (form) {
    const area = (k, label, optional = true) => (
      <Field label={label} error={errors[k]} optional={optional} hint={optional ? t('schemesAdmin.listHint') : undefined}>
        {(p) => <textarea {...p} rows={3} value={form[k] ?? ''} onChange={set(k)} />}
      </Field>
    );
    return (
      <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
        <h1 className="page-title">{form.id ? t('schemesAdmin.edit') : t('schemesAdmin.add')}</h1>
        <Alert kind="error">{errors._}</Alert>
        <Field label={t('schemesAdmin.titleField')} error={errors.title}>{(p) => <input {...p} value={form.title} onChange={set('title')} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('schemesAdmin.level')}>
            {(p) => (
              <select {...p} value={form.level} onChange={set('level')}>
                {['central', 'state', 'local'].map((l) => <option key={l} value={l}>{t(`scheme.level.${l}`)}</option>)}
              </select>
            )}
          </Field>
          <Field label={t('schemesAdmin.category')} error={errors.category}>{(p) => <input {...p} value={form.category} onChange={set('category')} />}</Field>
        </div>
        <Field label={t('schemesAdmin.summary')} error={errors.summary}>{(p) => <textarea {...p} rows={2} value={form.summary} onChange={set('summary')} />}</Field>
        {area('benefits', t('scheme.benefits'))}
        {area('eligibility', t('scheme.eligibility'))}
        {area('documents', t('scheme.documents'))}
        {area('how_to_apply', t('scheme.howToApply'))}
        <Field label={t('schemesAdmin.link')} error={errors.link} optional>{(p) => <input {...p} type="url" value={form.link ?? ''} onChange={set('link')} />}</Field>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_new} onChange={set('is_new')} /> {t('schemesAdmin.isNew')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> {t('schemesAdmin.isActive')}</label>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary">{t('common.save')}</button>
          <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>{t('common.cancel')}</button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">{t('schemesAdmin.title')}</h1>
        <button type="button" className="btn btn-primary" onClick={() => { setErrors({}); setForm(EMPTY); }}>+ {t('schemesAdmin.add')}</button>
      </div>
      <Alert kind="info">{t('schemesAdmin.reviewNote')}</Alert>
      {msg && <Alert kind="success">{msg}</Alert>}
      {loading && <Spinner />}
      {error && <Alert kind="error">{error.message}</Alert>}
      <ul className="card divide-y divide-stone-100">
        {data?.schemes.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className={s.is_active ? '' : 'opacity-50'}>
              <span className="font-semibold">{s.title}</span>
              <span className="block text-xs text-stone-500">{t(`scheme.level.${s.level}`)} · {s.category}{s.is_new && ` · ${t('scheme.new')}`}{!s.is_active && ` · ${t('schemesAdmin.hidden')}`}</span>
            </span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary px-3 py-1 text-xs" onClick={() => { setErrors({}); setForm(s); }}>{t('common.edit')}</button>
              <button type="button" className="btn btn-danger px-3 py-1 text-xs" onClick={() => remove(s)}>{t('common.delete')}</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
