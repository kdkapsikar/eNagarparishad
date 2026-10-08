import { useSettings } from '../../context/SettingsContext.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';

export default function Footer() {
  const { t } = useT();
  const s = useSettings();
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto max-w-5xl space-y-1 px-4 py-5 text-sm text-stone-600">
        {s.office_address && <p>📍 {t('footer.office')}: {s.office_address}</p>}
        {s.office_phone && <p>📞 {t('footer.phone')}: <a className="font-semibold text-brand-700" href={`tel:${s.office_phone}`}>{s.office_phone}</a></p>}
        <p className="text-xs text-stone-400">{t('footer.privacy')}</p>
      </div>
    </footer>
  );
}
