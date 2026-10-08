import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Alert from '../../components/ui/Alert.jsx';
import Field from '../../components/ui/Field.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { useApi } from '../../lib/useApi.js';

const OFFICE_KEYS = ['office_name', 'ward_label', 'office_address', 'office_phone', 'sender_name'];
const TEMPLATE_KEYS = ['template_birthday', 'template_anniversary', 'template_notice'];

export default function Settings() {
  const { t } = useT();
  return (
    <div className="space-y-6">
      <h1 className="page-title">{t('settings.title')}</h1>
      <OfficeSettings />
      <Users />
    </div>
  );
}

function OfficeSettings() {
  const { t } = useT();
  const [values, setValues] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { api.adminSettings().then((d) => setValues(d.settings)).catch((e) => setMsg({ ok: false, text: e.message })); }, []);
  if (!values) return msg ? <Alert kind="error">{msg.text}</Alert> : <Spinner />;

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { settings } = await api.saveSettings(Object.fromEntries([...OFFICE_KEYS, ...TEMPLATE_KEYS].map((k) => [k, values[k] ?? ''])));
      setValues(settings);
      setMsg({ ok: true, text: t('settings.saved') });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };
  const set = (k) => (e) => setValues({ ...values, [k]: e.target.value });

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">{t('settings.office')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {OFFICE_KEYS.map((k) => (
          <Field key={k} label={t(`settings.${k}`)}>{(p) => <input {...p} value={values[k] ?? ''} onChange={set(k)} />}</Field>
        ))}
      </div>
      <h2 className="pt-2 text-lg font-semibold">{t('settings.templates')}</h2>
      <p className="text-sm text-stone-600">{t('settings.templatesHint')}</p>
      {TEMPLATE_KEYS.map((k) => (
        <Field key={k} label={t(`settings.${k}`)}>{(p) => <textarea {...p} rows={2} value={values[k] ?? ''} onChange={set(k)} />}</Field>
      ))}
      {msg && <Alert kind={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
      <button className="btn btn-primary">{t('common.save')}</button>
    </form>
  );
}

function Users() {
  const { t } = useT();
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useApi(() => api.users());
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'volunteer' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    setErrors({});
    try {
      await api.createUser(form);
      setForm({ name: '', username: '', password: '', role: 'volunteer' });
      setMsg({ ok: true, text: t('settings.userCreated') });
      reload();
    } catch (err) {
      setErrors(err.fields);
      setMsg({ ok: false, text: err.message });
    }
  };
  const toggle = async (u) => {
    try {
      await api.updateUser(u.id, { is_active: !u.is_active });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };
  const resetPassword = async (u) => {
    const password = window.prompt(t('settings.newPasswordPrompt', { name: u.name }));
    if (!password) return;
    try {
      await api.updateUser(u.id, { password });
      setMsg({ ok: true, text: t('settings.passwordChanged') });
    } catch (err) {
      setMsg({ ok: false, text: err.fields?.password ?? err.message });
    }
  };

  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">{t('settings.users')}</h2>
      {loading && <Spinner />}
      {error && <Alert kind="error">{error.message}</Alert>}
      <ul className="divide-y divide-stone-100">
        {data?.users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className={u.is_active ? '' : 'opacity-50'}>
              <b>{u.name}</b> <span className="text-sm text-stone-500">@{u.username} · {t(`role.${u.role}`)}{!u.is_active && ` · ${t('settings.inactive')}`}</span>
            </span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary px-3 py-1 text-xs" onClick={() => resetPassword(u)}>{t('settings.resetPassword')}</button>
              {u.id !== me.id && (
                <button type="button" className="btn btn-secondary px-3 py-1 text-xs" onClick={() => toggle(u)}>
                  {u.is_active ? t('settings.deactivate') : t('settings.activate')}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={create} className="grid gap-3 rounded-lg bg-stone-50 p-4 sm:grid-cols-2" noValidate>
        <h3 className="font-semibold sm:col-span-2">{t('settings.addUser')}</h3>
        <Field label={t('settings.fullName')} error={errors.name}>{(p) => <input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label={t('login.username')} error={errors.username}>{(p) => <input {...p} autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />}</Field>
        <Field label={t('login.password')} error={errors.password}>{(p) => <input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}</Field>
        <Field label={t('settings.role')}>
          {(p) => (
            <select {...p} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="volunteer">{t('role.volunteer')}</option>
              <option value="admin">{t('role.admin')}</option>
            </select>
          )}
        </Field>
        <div className="sm:col-span-2">
          {msg && <div className="mb-2"><Alert kind={msg.ok ? 'success' : 'error'}>{msg.text}</Alert></div>}
          <button className="btn btn-primary">{t('settings.create')}</button>
        </div>
      </form>
    </section>
  );
}
