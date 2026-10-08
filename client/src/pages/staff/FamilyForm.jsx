import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { offlineQueue } from '../../api/offlineQueue.js';
import Alert from '../../components/ui/Alert.jsx';
import Field from '../../components/ui/Field.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import YesNo from '../../components/ui/YesNo.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { useApi } from '../../lib/useApi.js';
import { CATEGORIES, GENDERS, todayIso } from '../../lib/validation.js';

// The digital version of the two paper forms: the family sheet on top, the members table below.
const EMPTY_MEMBER = {
  name: '', relation: '', dob: '', anniversary: '', gender: '', education: '', occupation: '', mobile: '', aadhaar: '', pan: '', voter_id: '',
};
const EMPTY = {
  head_name: '', mobile: '', whatsapp: '', address: '', area: '', caste: '', category: '', farm_details: '', disability: '',
  has_internet: null, has_water_filter: null, has_anganwadi: null, gharkul_benefit: null, other_issues: '', consent: false,
  members: [{ ...EMPTY_MEMBER, relation: 'स्वतः' }],
};

/** API household -> form state. Aadhaar comes back as its last 4 digits, PAN only masked. */
function fromApi(h) {
  const s = (v) => v ?? '';
  return {
    ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, typeof EMPTY[k] === 'string' ? s(h[k]) : h[k]])),
    consent: true,
    members: h.members.map((m) => ({
      id: m.id, name: m.name, relation: s(m.relation), dob: s(m.dob), anniversary: s(m.anniversary), gender: s(m.gender),
      education: s(m.education), occupation: s(m.occupation), mobile: s(m.mobile), aadhaar: s(m.aadhaar_last4), pan: '',
      pan_masked: m.pan_masked, pan_clear: false, voter_id: s(m.voter_id),
    })),
  };
}

export default function FamilyForm() {
  const { t } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(id ? null : EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const areas = useApi(() => api.areas());

  useEffect(() => {
    if (id) api.household(id).then((d) => setForm(fromApi(d.household))).catch((e) => setError(e.message));
  }, [id]);

  if (!form) return error ? <Alert kind="error">{error}</Alert> : <Spinner />;

  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e });
  const setMember = (i, k) => (e) => {
    const members = form.members.map((m, j) => (j === i ? { ...m, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } : m));
    setForm({ ...form, members });
  };
  // Member 1 is the head: their name follows the family head field until it is changed separately.
  const setHeadName = (e) => {
    const value = e.target.value;
    const members = form.members.map((m, j) => (j === 0 && (m.name === form.head_name || !m.name) ? { ...m, name: value } : m));
    setForm({ ...form, head_name: value, members });
  };
  const addMember = () => setForm({ ...form, members: [...form.members, { ...EMPTY_MEMBER }] });
  const removeMember = (i) => setForm({ ...form, members: form.members.filter((_, j) => j !== i) });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const payload = { ...form, members: form.members.map(({ pan_masked: _masked, ...m }) => m) };
    try {
      const { household } = id ? await api.updateHousehold(id, payload) : await api.createHousehold(payload);
      navigate(`/staff/families/${household.id}`, { replace: true, state: { saved: true } });
    } catch (err) {
      if (err.offline && !id) {
        offlineQueue.add(payload);
        navigate('/staff/families', { state: { queued: true } });
        return;
      }
      setError(err.message);
      setErrors(err.fields);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  const text = (k, label, props = {}) => (
    <Field label={label} error={errors[k]} optional={props.optional} className={props.className}>
      {(p) => <input {...p} {...props.input} value={form[k]} onChange={k === 'head_name' ? setHeadName : set(k)} />}
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="flex items-center justify-between">
        <h1 className="page-title">{id ? t('form.editTitle') : t('form.newTitle')}</h1>
        <Link to={id ? `/staff/families/${id}` : '/staff/families'} className="btn btn-secondary">{t('common.cancel')}</Link>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <datalist id="area-options">{areas.data?.areas.map((a) => <option key={a.area} value={a.area} />)}</datalist>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold text-brand-800">{t('form.familySection')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {text('head_name', t('field.headName'), { className: 'sm:col-span-2' })}
          {text('mobile', t('field.mobile'), { optional: true, input: { type: 'tel', inputMode: 'tel' } })}
          {text('whatsapp', t('field.whatsapp'), { optional: true, input: { type: 'tel', inputMode: 'tel' } })}
          {text('address', t('field.address'), { optional: true, className: 'sm:col-span-2' })}
          {text('area', t('field.area'), { optional: true, input: { list: 'area-options' } })}
          <Field label={t('field.category')} error={errors.category} optional>
            {(p) => (
              <select {...p} value={form.category} onChange={set('category')}>
                <option value="">—</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`category.${c}`)}</option>)}
              </select>
            )}
          </Field>
          {text('caste', t('field.caste'), { optional: true })}
          {text('farm_details', t('field.farmDetails'), { optional: true })}
          {text('disability', t('field.disabilityDetails'), { optional: true })}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <YesNo label={t('field.internet')} value={form.has_internet} onChange={set('has_internet')} />
          <YesNo label={t('field.waterFilter')} value={form.has_water_filter} onChange={set('has_water_filter')} />
          <YesNo label={t('field.anganwadi')} value={form.has_anganwadi} onChange={set('has_anganwadi')} />
          <YesNo label={t('field.gharkul')} value={form.gharkul_benefit} onChange={set('gharkul_benefit')} />
        </div>
        <Field label={t('field.otherIssues')} error={errors.other_issues} optional>
          {(p) => <textarea {...p} rows={3} value={form.other_issues} onChange={set('other_issues')} />}
        </Field>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-brand-800">{t('form.membersSection')}</h2>
        {form.members.map((m, i) => {
          const err = (k) => errors[`members.${i}.${k}`];
          const input = (k, label, extra = {}) => (
            <Field label={label} error={err(k)} optional={k !== 'name'} hint={extra.hint}>
              {(p) => <input {...p} {...extra.input} value={m[k]} onChange={setMember(i, k)} />}
            </Field>
          );
          return (
            <div key={m.id ?? `new-${i}`} className="card space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{i + 1}. {m.name || t('form.member')}</p>
                {form.members.length > 1 && (
                  <button type="button" className="btn btn-danger px-3 py-1 text-xs" onClick={() => removeMember(i)}>{t('form.removeMember')}</button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {input('name', t('field.name'))}
                {input('relation', t('field.relation'))}
                <Field label={t('field.gender')} error={err('gender')} optional>
                  {(p) => (
                    <select {...p} value={m.gender} onChange={setMember(i, 'gender')}>
                      <option value="">—</option>
                      {GENDERS.map((g) => <option key={g} value={g}>{t(`gender.${g}`)}</option>)}
                    </select>
                  )}
                </Field>
                {input('dob', t('field.dob'), { input: { type: 'date', max: todayIso() } })}
                {input('anniversary', t('field.anniversary'), { input: { type: 'date', max: todayIso() } })}
                {input('education', t('field.education'))}
                {input('occupation', t('field.occupation'))}
                {input('mobile', t('field.mobile'), { input: { type: 'tel', inputMode: 'tel' } })}
                {input('voter_id', t('field.voterId'), { input: { autoCapitalize: 'characters' } })}
                {input('aadhaar', t('field.aadhaar'), { input: { inputMode: 'numeric' }, hint: t('form.aadhaarHint') })}
                {input('pan', t('field.pan'), {
                  input: { autoCapitalize: 'characters', placeholder: m.pan_masked && !m.pan_clear ? m.pan_masked : '' },
                  hint: m.pan_masked ? t('form.panKeep') : undefined,
                })}
                {m.pan_masked && (
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-stone-600">
                    <input type="checkbox" checked={m.pan_clear} onChange={setMember(i, 'pan_clear')} /> {t('form.panRemove')}
                  </label>
                )}
              </div>
            </div>
          );
        })}
        <button type="button" className="btn btn-secondary w-full border-dashed" onClick={addMember}>+ {t('form.addMember')}</button>
      </section>

      {!id && (
        <label className={`card flex items-start gap-3 p-4 ${errors.consent ? 'border-red-400' : ''}`}>
          <input type="checkbox" className="mt-1 h-5 w-5" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
          <span className="text-sm text-stone-700">{t('form.consent')}</span>
        </label>
      )}
      {errors.consent && <p className="text-sm text-red-600">{errors.consent}</p>}

      <button className="btn btn-primary w-full py-3 text-base" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
    </form>
  );
}
