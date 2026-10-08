import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useT } from '../i18n/LanguageContext.jsx';
import ChatBot from './ChatBot.jsx';
import Mascot from './Mascot.jsx';

const TEASER_KEY = 'enp_bhau_teaser_closed';

/** Open the floating सेवा भाऊ from anywhere, optionally straight into a flow: openBhau('register'). */
export const openBhau = (intent) => window.dispatchEvent(new CustomEvent('seva-bhau:open', { detail: { intent } }));

/**
 * सेवा भाऊ floating at the bottom-right of the public pages. A "राम राम!" bubble calls people over;
 * tapping him opens the chat, which he then holds up with one hand. Not shown on staff pages or on
 * /register (that page has the chat inline).
 */
export default function BotWidget() {
  const { t } = useT();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // keep the conversation after closing the panel
  const [teaser, setTeaser] = useState(false);
  const [command, setCommand] = useState(null);
  const hidden = pathname.startsWith('/staff') || pathname === '/register' || pathname === '/login';

  useEffect(() => {
    let closed = false;
    try { closed = sessionStorage.getItem(TEASER_KEY) === '1'; } catch { /* ignore */ }
    if (closed) return undefined;
    const timer = setTimeout(() => setTeaser(true), 1800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true);
      setMounted(true);
      setTeaser(false);
      if (e.detail?.intent) setCommand({ intent: e.detail.intent, n: Date.now() });
    };
    window.addEventListener('seva-bhau:open', onOpen);
    return () => window.removeEventListener('seva-bhau:open', onOpen);
  }, []);

  if (hidden) return null;

  const closeTeaser = () => {
    setTeaser(false);
    try { sessionStorage.setItem(TEASER_KEY, '1'); } catch { /* ignore */ }
  };
  const toggle = () => {
    setOpen((o) => !o);
    setMounted(true);
    closeTeaser();
  };

  return (
    <>
      {teaser && !open && (
        <div className="bot-pop fixed bottom-[calc(var(--bhau)*0.55+16px)] right-[calc(var(--bhau)+20px)] z-40 flex max-w-[min(15rem,calc(100vw-var(--bhau)-36px))] items-start gap-1 rounded-2xl rounded-br-sm border border-brand-600 bg-white py-2 pl-3 pr-1 text-sm shadow-lg [--bhau:clamp(84px,9vw,112px)]">
          <button type="button" onClick={toggle} className="text-left leading-snug text-stone-800">
            <b className="text-brand-700">{t('bot.teaserTitle')}</b><br />{t('bot.teaser')}
          </button>
          <button type="button" onClick={closeTeaser} className="px-1.5 text-stone-400 hover:text-stone-700" aria-label={t('bot.close')}>×</button>
        </div>
      )}

      {mounted && (
        <div
          role="dialog"
          aria-label={t('bot.name')}
          className={`fixed bottom-[calc(var(--bhau)*0.93+16px)] left-3 right-3 z-40 h-[min(620px,calc(100dvh-var(--bhau)-40px))] overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-2xl [--bhau:clamp(84px,9vw,112px)] sm:left-auto sm:right-5 sm:w-[400px] ${open ? 'bot-pop' : 'hidden'}`}
        >
          <ChatBot mode="public" fill command={command} onClose={() => setOpen(false)} />
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? t('bot.close') : t('bot.openLabel')}
        className="group fixed bottom-4 right-3 z-40 h-[var(--bhau)] w-[var(--bhau)] [--bhau:clamp(84px,9vw,112px)] sm:right-5"
      >
        <Mascot pose={open ? 'hold' : teaser ? 'wave' : 'namaste'} className="h-full w-full drop-shadow-md transition-transform group-hover:-translate-y-0.5" />
      </button>
    </>
  );
}
