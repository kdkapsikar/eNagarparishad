import { useState } from 'react';
import { api } from '../../api/client.js';
import Alert from '../../components/ui/Alert.jsx';
import Field from '../../components/ui/Field.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { formatDate, formatDateTime } from '../../lib/format.js';
import { todayIso } from '../../lib/validation.js';

export const STATUS_TONE = {
  submitted: 'bg-sky-100 text-sky-800',
  documents_needed: 'bg-amber-100 text-amber-900',
  forwarded: 'bg-violet-100 text-violet-800',
  ready: 'bg-emerald-100 text-emerald-800',
  delivered: 'bg-stone-200 text-stone-700',
  rejected: 'bg-red-100 text-red-800',
};

export default function Certificates() {
  const { t } = useT();
  const [tab, setTab] = useState('apply');
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t('cert.title')}</h1>
      <p className="text-stone-600">{t('cert.intro')}</p>
      <div className="flex gap-2" role="tablist">
        {['apply', 'track'].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`btn ${tab === k ? 'btn-primary' : 'btn-secondary'}`}>
            {t(`cert.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'apply' ? <ApplyForm /> : <TrackForm />}
    </div>
  );
}

const EMPTY = {
  kind: 'birth', person_name: '', event_date: '', event_place: '', gender: '', father_name: '', mother_name: '',
  address: '', applicant_name: '', applicant_phone: '', relation: '', copies: 1,
};

function ApplyForm() {
  const { t } = useT();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const { id } = await api.applyCertificate({ ...form, copies: Number(form.copies) });
      setDone({ id, kind: form.kind });
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
      setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="card space-y-3 p-6">
        <Alert kind="success">{t('cert.submitted')}</Alert>
        <p className="text-stone-600">{t('cert.yourNumber')}</p>
        <p className="select-all text-3xl font-bold tracking-wider text-brand-700">{done.id}</p>
        <p className="text-sm text-stone-600">{t('cert.keepNumber')}</p>
        <h2 className="pt-2 font-semibold">{t('cert.docsTitle')}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
          {t(done.kind === 'birth' ? 'cert.docsBirth' : 'cert.docsDeath').split('|').map((d) => <li key={d}>{d}</li>)}
        </ul>
        <button type="button" className="btn btn-secondary" onClick={() => setDone(null)}>{t('cert.another')}</button>
      </div>
    );
  }

  const birth = form.kind === 'birth';
  return (
    <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
      <Alert kind="info">{t('cert.note')}</Alert>
      <fieldset>
        <legend className="label">{t('cert.kind')}</legend>
        <div className="flex gap-2">
          {['birth', 'death'].map((k) => (
            <label key={k} className={`btn cursor-pointer ${form.kind === k ? 'btn-primary' : 'btn-secondary'}`}>
              <input type="radio" name="kind" value={k} checked={form.kind === k} onChange={set('kind')} className="sr-only" />
              {t(`cert.kind.${k}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t(birth ? 'cert.childName' : 'cert.deceasedName')} error={errors.person_name}>
          {(p) => <input {...p} value={form.person_name} onChange={set('person_name')} />}
        </Field>
        <Field label={t(birth ? 'cert.birthDate' : 'cert.deathDate')} error={errors.event_date}>
          {(p) => <input {...p} type="date" max={todayIso()} value={form.event_date} onChange={set('event_date')} />}
        </Field>
        <Field label={t(birth ? 'cert.birthPlace' : 'cert.deathPlace')} error={errors.event_place} hint={t('cert.placeHint')}>
          {(p) => <input {...p} value={form.event_place} onChange={set('event_place')} />}
        </Field>
        <Field label={t('field.gender')} error={errors.gender} optional>
          {(p) => (
            <select {...p} value={form.gender} onChange={set('gender')}>
              <option value="">—</option>
              {['male', 'female', 'other'].map((g) => <option key={g} value={g}>{t(`gender.${g}`)}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('cert.fatherName')} error={errors.father_name} optional>
          {(p) => <input {...p} value={form.father_name} onChange={set('father_name')} />}
        </Field>
        <Field label={t('cert.motherName')} error={errors.mother_name} optional>
          {(p) => <input {...p} value={form.mother_name} onChange={set('mother_name')} />}
        </Field>
        <Field label={t('field.address')} error={errors.address} className="sm:col-span-2">
          {(p) => <input {...p} value={form.address} onChange={set('address')} />}
        </Field>
        <Field label={t('cert.applicantName')} error={errors.applicant_name}>
          {(p) => <input {...p} value={form.applicant_name} onChange={set('applicant_name')} />}
        </Field>
        <Field label={t('cert.applicantPhone')} error={errors.applicant_phone}>
          {(p) => <input {...p} type="tel" inputMode="tel" value={form.applicant_phone} onChange={set('applicant_phone')} />}
        </Field>
        <Field label={t('cert.relation')} error={errors.relation} optional>
          {(p) => <input {...p} value={form.relation} onChange={set('relation')} />}
        </Field>
        <Field label={t('cert.copies')} error={errors.copies}>
          {(p) => <input {...p} type="number" min="1" max="10" value={form.copies} onChange={set('copies')} />}
        </Field>
      </div>
      <Alert kind="error">{error}</Alert>
      <button className="btn btn-primary" disabled={busy}>{busy ? t('common.saving') : t('cert.submit')}</button>
    </form>
  );
}

function TrackForm() {
  const { t } = useT();
  const [id, setId] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.trackCertificate(id, phone));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label={t('cert.requestNo')}>
          {(p) => <input {...p} value={id} onChange={(e) => setId(e.target.value)} placeholder="JN-26-XXXXXX" autoCapitalize="characters" />}
        </Field>
        <Field label={t('cert.applicantPhone')}>
          {(p) => <input {...p} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </Field>
        <button className="btn btn-primary" disabled={busy || !id || !phone}>{t('cert.track')}</button>
      </form>
      <Alert kind="error">{error}</Alert>
      {result && (
        <div className="card space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-semibold">{result.request.id} · {t(`cert.kind.${result.request.kind}`)}</p>
            <span className={`chip ${STATUS_TONE[result.request.status]}`}>{t(`cert.status.${result.request.status}`)}</span>
          </div>
          <p className="text-stone-700">{result.request.person_name} · {formatDate(result.request.event_date)}</p>
          {result.request.registration_no && <p className="text-sm">{t('cert.registrationNo')}: <b>{result.request.registration_no}</b></p>}
          <ol className="space-y-2 border-l-2 border-brand-100 pl-4">
            {result.updates.map((u, i) => (
              <li key={i}>
                <p className="font-medium">{t(`cert.status.${u.status}`)}</p>
                {u.remark && <p className="text-sm text-stone-700">{u.remark}</p>}
                <p className="text-xs text-stone-500">{formatDateTime(u.created_at)}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
