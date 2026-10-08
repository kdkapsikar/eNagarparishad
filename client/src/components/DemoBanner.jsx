import { resetDemo } from '../api/demoServer.js';
import { useT } from '../i18n/LanguageContext.jsx';

/** Shown on every page of the demo build (see lib/config.js DEMO). */
export default function DemoBanner() {
  const { t } = useT();
  return (
    <div className="bg-amber-300 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
      🧪 {t('demo.banner')}{' '}
      <button
        type="button"
        className="underline"
        onClick={() => {
          resetDemo();
          try { localStorage.removeItem('enp_token'); } catch { /* ignore */ }
          window.location.reload();
        }}
      >
        {t('demo.reset')}
      </button>
    </div>
  );
}
