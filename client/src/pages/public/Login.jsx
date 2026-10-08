import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Alert from '../../components/ui/Alert.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';

export default function Login() {
  const { t } = useT();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/staff" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form);
      navigate(location.state?.from ?? '/staff', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mx-auto max-w-sm space-y-4 p-6">
      <h1 className="page-title">{t('login.title')}</h1>
      <p className="text-sm text-stone-600">{t('login.intro')}</p>
      <Alert kind="error">{error}</Alert>
      <div>
        <label className="label" htmlFor="username">{t('login.username')}</label>
        <input id="username" className="input" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="password">{t('login.password')}</label>
        <input id="password" type="password" className="input" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </div>
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? t('common.loading') : t('login.submit')}</button>
    </form>
  );
}
