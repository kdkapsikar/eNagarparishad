import { useEffect, useState } from 'react';
import { canSpeak, onSpeakingChange, speak, speechStatus, stopSpeaking } from '../bot/speech.js';
import { useT } from '../i18n/LanguageContext.jsx';

/** Reads a block of text aloud - for residents who find reading hard. */
export default function ListenButton({ text }) {
  const { t, lang } = useT();
  const [on, setOn] = useState(false);
  useEffect(() => () => stopSpeaking(), []);
  // Back to "Listen" once the reading finishes.
  useEffect(() => onSpeakingChange((speaking) => !speaking && setOn(false)), []);
  if (!canSpeak && !speechStatus().tts) return null;
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
