import { Link } from 'react-router-dom';
import { useT } from '../../i18n/LanguageContext.jsx';

export default function NotFound() {
  const { t } = useT();
  return (
    <div className="card p-8 text-center">
      <h1 className="page-title">{t('notFound.title')}</h1>
      <Link to="/" className="btn btn-primary mt-4">{t('notFound.home')}</Link>
    </div>
  );
}
