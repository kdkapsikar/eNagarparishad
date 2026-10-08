import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Alert from '../../components/ui/Alert.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { useApi } from '../../lib/useApi.js';

export default function Schemes() {
  const { t } = useT();
  const { data, error, loading } = useApi(() => api.schemes());
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const schemes = data?.schemes ?? [];
  const categories = useMemo(() => [...new Set(schemes.map((s) => s.category))].sort(), [schemes]);
  const list = schemes.filter((s) => (!category || s.category === category)
    && (!q || `${s.title} ${s.summary}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-4">
      <h1 className="page-title">{t('schemes.title')}</h1>
      <p className="text-stone-600">{t('schemes.intro')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className="input sm:max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('schemes.search')} aria-label={t('schemes.search')} />
        <select className="input sm:max-w-xs" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('schemes.category')}>
          <option value="">{t('schemes.allCategories')}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {loading && <Spinner />}
      {error && <Alert kind="error">{error.message}</Alert>}
      {!loading && list.length === 0 && <p className="card p-6 text-center text-stone-500">{t('schemes.none')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((s) => (
          <Link key={s.id} to={`/schemes/${s.id}`} className="card p-4 hover:border-brand-600">
            <div className="flex flex-wrap gap-2">
              {s.is_new && <span className="chip bg-emerald-100 text-emerald-800">{t('scheme.new')}</span>}
              <span className="chip bg-stone-100 text-stone-700">{t(`scheme.level.${s.level}`)}</span>
              <span className="chip bg-brand-50 text-brand-800">{s.category}</span>
            </div>
            <p className="mt-2 text-lg font-semibold">{s.title}</p>
            <p className="mt-1 text-sm text-stone-600">{s.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
