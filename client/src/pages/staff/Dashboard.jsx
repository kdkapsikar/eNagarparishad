import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Alert from '../../components/ui/Alert.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { formatDate } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';

function Stat({ label, value, to }) {
  const body = (
    <>
      <p className="text-3xl font-bold text-stone-900">{value}</p>
      <p className="text-sm text-stone-600">{label}</p>
    </>
  );
  return to ? <Link to={to} className="card p-4 hover:border-brand-600">{body}</Link> : <div className="card p-4">{body}</div>;
}

export default function Dashboard() {
  const { t } = useT();
  const { data, error, loading } = useApi(() => api.dashboard());
  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error.message}</Alert>;
  const { totals, survey, occasions, areas } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">{t('dash.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Link to="/staff/bot" className="btn btn-primary">🎤 {t('dash.newByBot')}</Link>
          <Link to="/staff/families/new" className="btn btn-secondary">📝 {t('dash.newByForm')}</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('dash.families')} value={totals.households} to="/staff/families" />
        <Stat label={t('dash.people')} value={totals.members} />
        <Stat label={t('dash.pendingMessages')} value={data.pendingMessages} to="/staff/messages" />
        <Stat label={t('dash.openCertificates')} value={data.openCertificates} to="/staff/certificates" />
      </div>

      {totals.unverified > 0 && (
        <Alert kind="info">
          {t('dash.unverified', { n: totals.unverified })} <Link className="font-semibold underline" to="/staff/families?verified=false">{t('dash.review')}</Link>
        </Alert>
      )}

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">🎂 {t('dash.today', { date: formatDate(data.today) })}</h2>
          {occasions.length > 0 && <Link to="/staff/messages" className="btn btn-primary">{t('dash.sendWishes')}</Link>}
        </div>
        {occasions.length === 0 ? (
          <p className="text-stone-500">{t('dash.noOccasions')}</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {occasions.map((o, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{o.kind === 'birthday' ? '🎂' : '💐'} <b>{o.name}</b> <span className="text-sm text-stone-500">{o.area}</span></span>
                <span className="text-sm text-stone-600">{t(`dash.kind.${o.kind}`)}{!o.has_phone && ` · ${t('dash.noPhone')}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-semibold">{t('dash.needs')}</h2>
          <ul className="space-y-1.5 text-sm">
            {[['no_internet', 'dash.need.noInternet'], ['no_water_filter', 'dash.need.noWaterFilter'], ['no_anganwadi', 'dash.need.noAnganwadi'],
              ['no_gharkul', 'dash.need.noGharkul'], ['with_disability', 'dash.need.disability'], ['with_issues', 'dash.need.issues']].map(([k, label]) => (
              <li key={k} className="flex justify-between"><span className="text-stone-700">{t(label)}</span><b>{survey[k]}</b></li>
            ))}
            <li className="flex justify-between"><span className="text-stone-700">{t('dash.seniors')}</span><b>{totals.seniors}</b></li>
            <li className="flex justify-between"><span className="text-stone-700">{t('dash.voters')}</span><b>{totals.with_voter_id}</b></li>
            <li className="flex justify-between"><span className="text-stone-700">{t('dash.gender')}</span><b>{totals.male} / {totals.female}</b></li>
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-semibold">{t('dash.byArea')}</h2>
          {areas.length === 0 ? <p className="text-stone-500">—</p> : (
            <ul className="space-y-2 text-sm">
              {areas.map((a) => {
                const pct = Math.round((a.households / Math.max(1, totals.households)) * 100);
                return (
                  <li key={a.area}>
                    <div className="flex justify-between"><span>{a.area || t('dash.noArea')}</span><b>{a.households}</b></div>
                    <div className="mt-1 h-2 rounded bg-stone-100"><div className="h-2 rounded bg-brand-600" style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
