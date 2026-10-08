import { useState } from 'react';
import { api } from '../../api/client.js';
import NoticeCard from '../../components/NoticeCard.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { useApi } from '../../lib/useApi.js';

export default function Notices() {
  const { t } = useT();
  const { data, error, loading } = useApi(() => api.notices());
  const [kind, setKind] = useState('');
  const list = (data?.notices ?? []).filter((n) => !kind || n.kind === kind);
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t('notices.title')}</h1>
      <p className="text-stone-600">{t('notices.intro')}</p>
      <div className="flex flex-wrap gap-2">
        {['', 'electricity', 'water', 'general'].map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`btn ${kind === k ? 'btn-primary' : 'btn-secondary'}`}>
            {k ? t(`notice.kind.${k}`) : t('common.all')}
          </button>
        ))}
      </div>
      {loading && <Spinner />}
      {error && <Alert kind="error">{error.message}</Alert>}
      {!loading && !error && list.length === 0 && <p className="card p-6 text-center text-stone-500">{t('notices.none')}</p>}
      <div className="space-y-3">{list.map((n) => <NoticeCard key={n.id} notice={n} />)}</div>
    </div>
  );
}
