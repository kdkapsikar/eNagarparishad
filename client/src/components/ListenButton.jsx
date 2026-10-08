import { useEffect, useState } from 'react';
import { canSpeak, speak, stopSpeaking } from '../bot/speech.js';
import { useT } from '../i18n/LanguageContext.jsx';

/** Reads a block of text aloud - for residents who find reading hard. */
export default function ListenButton({ text }) {
  const { t, lang } = useT();
  const [on, setOn] = useState(false);
  useEffect(() => () => stopSpeaking(), []);
  if (!canSpeak) return null;
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        if (on) stopSpeaking();
        else speak(text, { lang });
        setOn(!on);
      }}
    >
      <span aria-hidden="true">{on ? '⏹' : '🔊'}</span> {on ? t('listen.stop') : t('listen.start')}
    </button>
  );
}
