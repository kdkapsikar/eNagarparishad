import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import NoticeCard from '../../components/NoticeCard.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { useApi } from '../../lib/useApi.js';

export default function Home() {
  const { t } = useT();
  const notices = useApi(() => api.notices());
  const schemes = useApi(() => api.schemes());
  const tiles = [
    ['/register', '📝', t('home.tile.register'), t('home.tile.registerText')],
    ['/notices', '⚡💧', t('home.tile.notices'), t('home.tile.noticesText')],
    ['/schemes', '🏛️', t('home.tile.schemes'), t('home.tile.schemesText')],
    ['/certificates', '📜', t('home.tile.certificates'), t('home.tile.certificatesText')],
  ];
  const latest = notices.data?.notices.slice(0, 3) ?? [];
  const newSchemes = schemes.data?.schemes.filter((s) => s.is_new).slice(0, 3) ?? [];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-8 text-white shadow">
        <h1 className="text-3xl font-bold">{t('home.title')}</h1>
        <p className="mt-2 max-w-2xl text-orange-50">{t('home.subtitle')}</p>
        <Link to="/register" className="btn mt-5 bg-white text-base text-brand-700 hover:bg-orange-50">🎤 {t('home.cta')}</Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {tiles.map(([to, icon, title, text]) => (
          <Link key={to} to={to} className="card flex items-start gap-4 p-5 hover:border-brand-600">
            <span className="text-3xl" aria-hidden="true">{icon}</span>
            <span>
              <span className="block text-lg font-semibold text-stone-900">{title}</span>
              <span className="text-sm text-stone-600">{text}</span>
            </span>
          </Link>
        ))}
      </section>

      {latest.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xl font-bold">{t('home.latestNotices')}</h2>
            <Link to="/notices" className="text-sm font-medium text-brand-700">{t('common.seeAll')} →</Link>
          </div>
          <div className="space-y-3">{latest.map((n) => <NoticeCard key={n.id} notice={n} />)}</div>
        </section>
      )}

      {newSchemes.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xl font-bold">{t('home.newSchemes')}</h2>
            <Link to="/schemes" className="text-sm font-medium text-brand-700">{t('common.seeAll')} →</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {newSchemes.map((s) => (
              <Link key={s.id} to={`/schemes/${s.id}`} className="card p-4 hover:border-brand-600">
                <span className="chip bg-emerald-100 text-emerald-800">{t('scheme.new')}</span>
                <p className="mt-2 font-semibold">{s.title}</p>
                <p className="mt-1 line-clamp-3 text-sm text-stone-600">{s.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
