import { useT } from '../../i18n/LanguageContext.jsx';

export default function Spinner({ label }) {
  const { t } = useT();
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-stone-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600" aria-hidden="true" />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}
