import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Alert from '../../components/ui/Alert.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { formatDate } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';

export default function Families() {
  const { t } = useT();
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const area = params.get('area') ?? '';
  const verified = params.get('verified') ?? '';
  const page = Number(params.get('page') ?? 1);
  const [search, setSearch] = useState(q);
  const [exportError, setExportError] = useState(null);
  const { data, error, loading } = useApi(() => api.households({ q, area, verified, page }), [q, area, verified, page]);
  const areas = useApi(() => api.areas());

  const update = (patch) => {
    const next = { q, area, verified, page: 1, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'page' && v === 1))));
  };
  const pages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">{t('families.title')}</h1>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button type="button" className="btn btn-secondary" onClick={() => api.exportHouseholds().catch((e) => setExportError(e.message))}>
              ⬇ {t('families.export')}
            </button>
          )}
          <Link to="/staff/families/new" className="btn btn-primary">+ {t('families.add')}</Link>
        </div>
      </div>
      <Alert kind="error">{exportError}</Alert>
      <form onSubmit={(e) => { e.preventDefault(); update({ q: search.trim() }); }} className="flex flex-col gap-2 sm:flex-row">
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('families.search')} aria-label={t('families.search')} />
        <select className="input sm:max-w-48" value={area} onChange={(e) => update({ area: e.target.value })} aria-label={t('field.area')}>
          <option value="">{t('families.allAreas')}</option>
          {areas.data?.areas.map((a) => <option key={a.area} value={a.area}>{a.area} ({a.households})</option>)}
        </select>
        <select className="input sm:max-w-48" value={verified} onChange={(e) => update({ verified: e.target.value })} aria-label={t('families.filterVerified')}>
          <option value="">{t('families.allEntries')}</option>
          <option value="false">{t('families.unverifiedOnly')}</option>
        </select>
        <button className="btn btn-primary">{t('common.search')}</button>
      </form>

      {loading && <Spinner />}
      {error && <Alert kind="error">{error.message}</Alert>}
      {data && (
        <>
          <p className="text-sm text-stone-500">{t('families.count', { n: data.total })}</p>
          {data.households.length === 0 ? (
            <p className="card p-6 text-center text-stone-500">{t('families.none')}</p>
          ) : (
            <ul className="card divide-y divide-stone-100">
              {data.households.map((h) => (
                <li key={h.id}>
                  <Link to={`/staff/families/${h.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50">
                    <span>
                      <span className="font-semibold text-stone-900">{h.head_name}</span>
                      {!h.verified && <span className="chip ml-2 bg-amber-100 text-amber-900">{t('families.unverified')}</span>}
                      <span className="block text-sm text-stone-500">{[h.area, h.mobile, h.address].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-right text-sm text-stone-500">
                      {t('families.members', { n: h.member_count })}
                      <span className="block text-xs">{t(`source.${h.source}`)} · {formatDate(h.created_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>←</button>
              <span className="text-sm">{page} / {pages}</span>
              <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => update({ page: page + 1 })}>→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
