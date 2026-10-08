import { useT } from '../i18n/LanguageContext.jsx';
import { formatDate } from '../lib/format.js';
import { OPTIONS, isActive, questionText, sequence } from './script.js';

// The bot's check-before-saving card, and the "correct something" picker.

const yesNoText = (t, v) => (v === true ? t('common.yes') : v === false ? t('common.no') : '—');

export function Summary({ data }) {
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
export function EditPicker({ data, mode, onPick, onCancel }) {
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
