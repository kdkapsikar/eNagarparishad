import { Outlet } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import BotWidget from '../../bot/BotWidget.jsx';
import { DEMO } from '../../lib/config.js';
import { useT } from '../../i18n/LanguageContext.jsx';
import Footer from './Footer.jsx';
import Header from './Header.jsx';

// Only the demo build loads the banner (and with it the in-browser demo server).
const DemoBanner = DEMO ? lazy(() => import('../DemoBanner.jsx')) : null;

export default function Layout() {
  const { t } = useT();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        {t('a11y.skip')}
      </a>
      {DemoBanner && <Suspense fallback={null}><DemoBanner /></Suspense>}
      <Header />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>
      <Footer />
      <BotWidget />
    </div>
  );
}
