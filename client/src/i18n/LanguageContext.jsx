import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { detectInitialLang, persistLang, setLang as setModuleLang, translate } from './index.js';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const initial = detectInitialLang();
    setModuleLang(initial); // module state must be right before the first render
    return initial;
  });

  const setLang = useCallback((next) => {
    setModuleLang(next);
    persistLang(next);
    setLangState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = translate('app.title');
  }, [lang]);

  // A new object per language: every component that called useT() re-renders when it changes.
  const value = useMemo(() => ({ lang, setLang, t: (key, params) => translate(key, params) }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useT = () => useContext(LanguageContext);
