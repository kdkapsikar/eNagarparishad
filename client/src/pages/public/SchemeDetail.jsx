import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import ListenButton from '../../components/ListenButton.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { useApi } from '../../lib/useApi.js';

export default function SchemeDetail() {
  const { t } = useT();
  const { id } = useParams();
  const { data, error, loading } = useApi(() => api.scheme(id), [id]);
  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error.message}</Alert>;
  const s = data.scheme;
  const sections = [
    ['scheme.benefits', s.benefits], ['scheme.eligibility', s.eligibility],
    ['scheme.documents', s.documents], ['scheme.howToApply', s.how_to_apply],
  ].filter(([, v]) => v);
  const spoken = [s.title, s.summary, ...sections.map(([k, v]) => `${t(k)}. ${v}`)].join('. ');

  return (
    <article className="space-y-4">
      <Link to="/schemes" className="text-sm font-medium text-brand-700">← {t('schemes.title')}</Link>
      <div className="flex flex-wrap gap-2">
        {s.is_new && <span className="chip bg-emerald-100 text-emerald-800">{t('scheme.new')}</span>}
        <span className="chip bg-stone-100 text-stone-700">{t(`scheme.level.${s.level}`)}</span>
        <span className="chip bg-brand-50 text-brand-800">{s.category}</span>
      </div>
      <h1 className="page-title">{s.title}</h1>
      <p className="text-lg text-stone-700">{s.summary}</p>
      <ListenButton text={spoken} />
      <div className="space-y-3">
        {sections.map(([k, v]) => (
          <section key={k} className="card p-4">
            <h2 className="mb-1 font-semibold text-brand-800">{t(k)}</h2>
            {v.includes('; ') ? (
              <ul className="list-disc space-y-0.5 pl-5 text-stone-700">{v.split('; ').map((item) => <li key={item}>{item}</li>)}</ul>
            ) : (
              <p className="whitespace-pre-line text-stone-700">{v}</p>
            )}
          </section>
        ))}
      </div>
      {s.link && (
        <a href={s.link} target="_blank" rel="noopener noreferrer" className="btn btn-primary">{t('scheme.officialSite')} ↗</a>
      )}
      <Alert kind="info">{t('scheme.help')}</Alert>
    </article>
  );
}
