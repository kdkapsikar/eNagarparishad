import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { offlineQueue } from '../../api/offlineQueue.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { LANGS } from '../../i18n/index.js';
import { useT } from '../../i18n/LanguageContext.jsx';

const linkClass = ({ isActive }) =>
  `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-white/20 text-white' : 'text-orange-50 hover:bg-white/10'}`;

export default function Header() {
  const { t, lang, setLang } = useT();
  const { user, isAdmin, logout } = useAuth();
  const settings = useSettings();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const publicLinks = [
    ['/notices', t('nav.notices')], ['/schemes', t('nav.schemes')], ['/certificates', t('nav.certificates')], ['/register', t('nav.register')],
  ];
  const staffLinks = [
    ['/staff', t('nav.dashboard'), true], ['/staff/families', t('nav.families')], ['/staff/bot', t('nav.bot')],
    ['/staff/messages', t('nav.messages')], ['/staff/certificates', t('nav.certificateRequests')], ['/staff/import', t('nav.import')],
    ...(isAdmin ? [['/staff/notices', t('nav.manageNotices')], ['/staff/schemes', t('nav.manageSchemes')], ['/staff/settings', t('nav.settings')]] : []),
  ];
  const links = user ? staffLinks : publicLinks;

  return (
    <header className="bg-brand-700 text-white shadow">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link to={user ? '/staff' : '/'} className="min-w-0">
          <p className="truncate text-lg font-bold leading-tight">{settings.office_name || t('app.name')}</p>
          <p className="truncate text-xs text-orange-100">{settings.ward_label || t('app.tagline')}</p>
        </Link>
        <div className="flex items-center gap-2">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="rounded-md border border-white/30 bg-brand-800 px-2 py-1 text-sm text-white"
            aria-label={t('lang.label')}
          >
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button type="button" className="rounded-md border border-white/30 px-3 py-1 text-sm md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {t('nav.menu')}
          </button>
        </div>
      </div>
      <nav aria-label={t('nav.main')} className={`${open ? 'block' : 'hidden'} border-t border-white/10 md:block`}>
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-2 md:flex-row md:flex-wrap md:items-center">
          {links.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end} className={linkClass} onClick={() => setOpen(false)}>{label}</NavLink>
          ))}
          <span className="md:ml-auto" />
          {user ? (
            <>
              <SyncButton />
              <span className="px-3 text-xs text-orange-100">{user.name}</span>
              <button type="button" className="rounded-md px-3 py-1.5 text-left text-sm text-orange-50 hover:bg-white/10" onClick={async () => { await logout(); navigate('/'); }}>
                {t('nav.signOut')}
              </button>
            </>
          ) : (
            <NavLink to="/login" className={linkClass} onClick={() => setOpen(false)}>{t('nav.staffLogin')}</NavLink>
          )}
        </div>
      </nav>
    </header>
  );
}

/** Families saved while offline wait on this device; this sends them. */
function SyncButton() {
  const { t } = useT();
  const [count, setCount] = useState(offlineQueue.count);
  const [busy, setBusy] = useState(false);
  useEffect(() => offlineQueue.subscribe(setCount), []);
  useEffect(() => {
    const onOnline = () => offlineQueue.count() && offlineQueue.sync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
  if (!count) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => { setBusy(true); await offlineQueue.sync().finally(() => setBusy(false)); }}
      className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-amber-950 hover:bg-amber-300"
    >
      {busy ? t('common.saving') : t('nav.sync', { n: count })}
    </button>
  );
}
