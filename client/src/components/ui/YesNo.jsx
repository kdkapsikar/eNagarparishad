import { useT } from '../../i18n/LanguageContext.jsx';

/** होय / नाही / (unanswered) as three big buttons - easier on a phone than a select. */
export default function YesNo({ label, value, onChange }) {
  const { t } = useT();
  const choice = (v, text) => (
    <button
      type="button"
      aria-pressed={value === v}
      onClick={() => onChange(value === v ? null : v)}
      className={`rounded-lg border px-4 py-1.5 text-sm font-medium ${value === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
    >
      {text}
    </button>
  );
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
      <legend className="sr-only">{label}</legend>
      <span className="text-sm text-stone-700" aria-hidden="true">{label}</span>
      <span className="flex gap-2">
        {choice(true, t('common.yes'))}
        {choice(false, t('common.no'))}
      </span>
    </fieldset>
  );
}
