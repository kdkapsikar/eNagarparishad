import { useState } from 'react';
import { api } from '../../api/client.js';
import Alert from '../../components/ui/Alert.jsx';
import Field from '../../components/ui/Field.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { formatDate, formatDateTime, whatsappLink } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';
import { STATUS_TONE } from '../public/Certificates.jsx';

const STATUSES = ['submitted', 'documents_needed', 'forwarded', 'ready', 'delivered', 'rejected'];

export default function CertificateRequests() {
  const { t } = useT();
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState(null);
  const { data, error, loading, reload } = useApi(() => api.certificates(status), [status]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">{t('certAdmin.title')}</h1>
      <select className="input max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('certAdmin.filter')}>
        <option value="">{t('common.all')}</option>
        {STATUSES.map((s) => <option key={s} value={s}>{t(`cert.status.${s}`)}</option>)}
      </select>
      {loading && <Spinner />}
      {error && <Alert kind="error">{error.message}</Alert>}
      {data && data.requests.length === 0 && <p className="card p-6 text-center text-stone-500">{t('certAdmin.none')}</p>}
      <ul className="space-y-2">
        {data?.requests.map((r) => (
          <li key={r.id} className="card">
            <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left" onClick={() => setOpenId(openId === r.id ? null : r.id)} aria-expanded={openId === r.id}>
              <span>
                <span className="font-semibold">{r.id}</span> · {t(`cert.kind.${r.kind}`)} · {r.person_name}
                <span className="block text-sm text-stone-500">{r.applicant_name} · {r.applicant_phone} · {formatDate(r.created_at)}</span>
              </span>
              <span className={`chip ${STATUS_TONE[r.status]}`}>{t(`cert.status.${r.status}`)}</span>
            </button>
            {openId === r.id && <Detail id={r.id} onChanged={reload} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ id, onChanged }) {
  const { t } = useT();
  const { isAdmin } = useAuth();
  const { data, error, loading, reload } = useApi(() => api.certificate(id), [id]);
  const [form, setForm] = useState({ status: '', remark: '', registration_no: '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error.message}</Alert>;
  const r = data.request;

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    try {
      await api.updateCertificate(id, form);
      setForm({ status: '', remark: '', registration_no: '' });
      setMsg(null);
      reload();
      onChanged();
    } catch (err) {
      setMsg(err.message);
      setErrors(err.fields);
    }
  };
  const statusText = t('certAdmin.whatsappText', { id: r.id, status: t(`cert.status.${r.status}`) });

  return (
    <div className="space-y-4 border-t border-stone-100 px-4 py-4 text-sm">
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {[[t('cert.eventDate'), formatDate(r.event_date)], [t('cert.eventPlace'), r.event_place], [t('field.gender'), r.gender && t(`gender.${r.gender}`)],
          [t('cert.fatherName'), r.father_name], [t('cert.motherName'), r.mother_name], [t('field.address'), r.address],
          [t('cert.relation'), r.relation], [t('cert.copies'), r.copies], [t('cert.registrationNo'), r.registration_no]].map(([k, v]) => (
          <div key={k}><dt className="text-xs text-stone-500">{k}</dt><dd>{v || '—'}</dd></div>
        ))}
      </dl>
      <ol className="space-y-1 border-l-2 border-brand-100 pl-4">
        {data.updates.map((u, i) => (
          <li key={i}>
            <b>{t(`cert.status.${u.status}`)}</b> {u.remark && `— ${u.remark}`}
            <span className="block text-xs text-stone-500">{formatDateTime(u.created_at)}{u.by_name && ` · ${u.by_name}`}</span>
          </li>
        ))}
      </ol>
      <a className="btn btn-secondary" href={whatsappLink(r.applicant_phone, statusText)} target="_blank" rel="noopener noreferrer">{t('certAdmin.notify')}</a>
      {isAdmin && (
        <form onSubmit={submit} className="grid gap-3 rounded-lg bg-stone-50 p-3 sm:grid-cols-3">
          <Field label={t('certAdmin.newStatus')} error={errors.status}>
            {(p) => (
              <select {...p} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="">—</option>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`cert.status.${s}`)}</option>)}
              </select>
            )}
          </Field>
          <Field label={t('certAdmin.remark')} error={errors.remark} optional>
            {(p) => <input {...p} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />}
          </Field>
          <Field label={t('cert.registrationNo')} error={errors.registration_no} optional>
            {(p) => <input {...p} value={form.registration_no} onChange={(e) => setForm({ ...form, registration_no: e.target.value })} />}
          </Field>
          <div className="sm:col-span-3">
            <Alert kind="error">{msg}</Alert>
            <button className="btn btn-primary mt-2" disabled={!form.status}>{t('certAdmin.update')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
