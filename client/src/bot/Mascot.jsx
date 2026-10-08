import { useEffect, useState } from 'react';
import { onSpeakingChange } from './speech.js';

// मदतनीस - the bot's face: a village elder in a saffron फेटा (with its शेमला tail and तुरा), गंध on
// the forehead, a proper handlebar मिशी, white kurta and an उपरणं over the shoulder.
//
// pose:  'rest' | 'wave' (calling you over) | 'namaste' (greeting) | 'hold' (holding the chat panel up)
// While the voice is speaking his mouth moves; `listening` turns his head to listen.
// All motion is CSS (see .bhau-* in index.css) and stops under prefers-reduced-motion.

const INK = '#3b2314';
const SKIN = '#c98b5a';
const SKIN_DARK = '#a86e43';
const SAFFRON = '#f08a24';
const SAFFRON_DARK = '#c7600f';
const KURTA = '#fffaf2';

export default function Mascot({ pose = 'rest', listening = false, size, className = '' }) {
  const [talking, setTalking] = useState(false);
  useEffect(() => onSpeakingChange(setTalking), []);

  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`bhau bhau-${pose} ${talking ? 'bhau-talking' : ''} ${listening ? 'bhau-listening' : ''} ${className}`}
    >
      <ellipse className="bhau-shadow" cx="40" cy="78" rx="19" ry="2.6" fill={INK} opacity="0.2" />
      <g className="bhau-body">
        {/* कुर्ता + उपरणं */}
        <path d="M13 79 C13 64 23 57 40 57 C57 57 67 64 67 79 Z" fill={KURTA} stroke={INK} strokeWidth="1.6" />
        <path d="M35 57 L40 64 L45 57" fill="none" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
        <circle cx="40" cy="68" r="0.9" fill={INK} />
        <circle cx="40" cy="73" r="0.9" fill={INK} />
        <path d="M19 61 C25 66 29 72 30 79 L24 79 C23 73 19 67 15 64 Z" fill={SAFFRON} stroke={INK} strokeWidth="1.1" />

        <g className="bhau-head">
          {/* शेमला - the फेटा's tail, behind the head */}
          <path className="bhau-tail" d="M55 27 C65 31 68 43 64 55 C61 46 59 37 53 31 Z" fill={SAFFRON_DARK} stroke={INK} strokeWidth="1.1" />
          <rect x="35" y="48" width="10" height="9" fill={SKIN_DARK} />
          <circle cx="22.5" cy="38" r="4" fill={SKIN} stroke={INK} strokeWidth="1.2" />
          <circle cx="57.5" cy="38" r="4" fill={SKIN} stroke={INK} strokeWidth="1.2" />
          <ellipse cx="40" cy="38" rx="17" ry="17.5" fill={SKIN} stroke={INK} strokeWidth="1.6" />

          {/* फेटा + तुरा */}
          <path d="M21.5 33 C19 17 29 9 40 9 C51 9 61 17 58.5 33 C51 28 29 28 21.5 33 Z" fill={SAFFRON} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M23 27 C31 22.5 49 22.5 57 27" fill="none" stroke={SAFFRON_DARK} strokeWidth="1.4" />
          <path d="M25.5 20.5 C33 16.5 47 16.5 54.5 20.5" fill="none" stroke={SAFFRON_DARK} strokeWidth="1.4" />
          <path d="M31 14 C36 12 44 12 49 14" fill="none" stroke={SAFFRON_DARK} strokeWidth="1.2" />
          <path className="bhau-tura" d="M51 13 C53 5 60 2 63 6 C59 7 56.5 9 55 14 Z" fill="#ffb15c" stroke={INK} strokeWidth="1.1" />

          {/* गंध */}
          <rect x="38.9" y="29.5" width="2.2" height="5" rx="1.1" fill="#d6281f" />

          <path d="M29 33 C31 32 33.5 32 35.5 33" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M44.5 33 C46.5 32 49 32 51 33" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          <g className="bhau-eyes">
            <ellipse cx="32.5" cy="37" rx="2.1" ry="2.5" fill={INK} />
            <ellipse cx="47.5" cy="37" rx="2.1" ry="2.5" fill={INK} />
            <circle cx="33.3" cy="36.1" r="0.7" fill="#fff" />
            <circle cx="48.3" cy="36.1" r="0.7" fill="#fff" />
          </g>
          <circle cx="27.5" cy="43" r="2.4" fill="#e0664b" opacity="0.28" />
          <circle cx="52.5" cy="43" r="2.4" fill="#e0664b" opacity="0.28" />
          <path d="M40 38 C38.8 41.5 38.8 43 41 43.2" fill="none" stroke={SKIN_DARK} strokeWidth="1.3" strokeLinecap="round" />

          {/* तोंड (moves while speaking) under the मिशी */}
          <ellipse className="bhau-mouth" cx="40" cy="49.6" rx="3.2" ry="1.1" fill="#6e2416" />
          <path
            className="bhau-mustache"
            d="M40 45.4 C36.5 43.4 31.5 43.2 28.2 45.4 C26.6 46.4 25.1 45 24.6 42.6 C23.8 46.6 26.6 49.6 31 48.8 C35 48 38 47.4 40 46.8 C42 47.4 45 48 49 48.8 C53.4 49.6 56.2 46.6 55.4 42.6 C54.9 45 53.4 46.4 51.8 45.4 C48.5 43.2 43.5 43.4 40 45.4 Z"
            fill="#1f140c"
          />
        </g>
        {/* hands - drawn after the head so a raised hand is in front of the शेमला */}
        <g className="bhau-arm arm-wave">
          <path d="M60 63 C68 61 73 54 74 46" fill="none" stroke={INK} strokeWidth="6.4" strokeLinecap="round" />
          <path d="M60 63 C68 61 73 54 74 46" fill="none" stroke={KURTA} strokeWidth="4" strokeLinecap="round" />
          <circle cx="74.5" cy="42" r="4.3" fill={SKIN} stroke={INK} strokeWidth="1.2" />
        </g>
        <g className="bhau-arm arm-hold">
          <path d="M61 63 C67 52 70 30 70 9" fill="none" stroke={INK} strokeWidth="6.4" strokeLinecap="round" />
          <path d="M61 63 C67 52 70 30 70 9" fill="none" stroke={KURTA} strokeWidth="4" strokeLinecap="round" />
          <circle cx="70" cy="5.5" r="4" fill={SKIN} stroke={INK} strokeWidth="1.2" />
        </g>
        <g className="bhau-arm arm-namaste">
          <path d="M22 66 C27 71 31 72.5 35.5 71" fill="none" stroke={INK} strokeWidth="6.4" strokeLinecap="round" />
          <path d="M22 66 C27 71 31 72.5 35.5 71" fill="none" stroke={KURTA} strokeWidth="4" strokeLinecap="round" />
          <path d="M58 66 C53 71 49 72.5 44.5 71" fill="none" stroke={INK} strokeWidth="6.4" strokeLinecap="round" />
          <path d="M58 66 C53 71 49 72.5 44.5 71" fill="none" stroke={KURTA} strokeWidth="4" strokeLinecap="round" />
          <path d="M35.5 73 C35.5 66 38 60 40 57.5 C42 60 44.5 66 44.5 73 Z" fill={SKIN} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
          <line x1="40" y1="59" x2="40" y2="72.5" stroke={INK} strokeWidth="0.8" />
        </g>

      </g>
    </svg>
  );
}
