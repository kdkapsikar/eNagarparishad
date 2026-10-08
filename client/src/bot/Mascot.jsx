import { useEffect, useState } from 'react';
import { onSpeakingChange } from './speech.js';

// मदतनीस - the bot's face: a village elder in a saffron फेटा (with its शेमला tail and तुरा), गंध on
// the forehead, a proper handlebar मिशी, white kurta and an उपरणं over the shoulder.
//
// pose:  'rest' | 'wave' (calling you over) | 'namaste' (greeting) | 'hold' (both fists gripping a bamboo
//        pole over his head, the chat window resting on it - with a comic sweat drop)
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

          {/* the load is heavy: a sweat drop while he holds the chat up */}
          <path className="bhau-sweat" d="M24 30 C22.4 33 22 34.6 24 35.6 C26 34.6 25.6 33 24 30 Z" fill="#7dd3fc" stroke="#0369a1" strokeWidth="0.6" />
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
          <circle className="bhau-cheek" cx="27.5" cy="43" r="2.4" fill="#e0664b" opacity="0.28" />
          <circle className="bhau-cheek" cx="52.5" cy="43" r="2.4" fill="#e0664b" opacity="0.28" />
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
          <Arm shoulder={[60, 64]} elbow={[70, 58]} wrist={[73.5, 45]} tilt={14} forearmClass="bhau-forearm" />
        </g>
        <g className="bhau-arm arm-hold">
          <HoldingPole />
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

/**
 * A working man's arm: kurta sleeve rolled up to the elbow, bare forearm, a red दोरा (sacred thread) at the
 * wrist and an open palm with fingers. Points are in the 80x80 viewBox; the palm points the way the forearm
 * does, turned a further `tilt` degrees.
 */
function Arm({ shoulder, elbow, wrist, tilt = 0, forearmClass }) {
  const [sx, sy] = shoulder;
  const [ex, ey] = elbow;
  const [wx, wy] = wrist;
  const angle = (Math.atan2(wx - ex, ey - wy) * 180) / Math.PI + tilt;
  const side = ex < sx ? -1 : 1; // left arm curves and mirrors the other way
  const forearm = `M${ex} ${ey} Q${(ex + wx) / 2 + side * 2.2} ${(ey + wy) / 2} ${wx} ${wy}`;
  return (
    <>
      <g className={forearmClass}>
        {/* a slight outward curve, so it reads as an arm and not a stick */}
        <path d={forearm} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
        <path d={forearm} fill="none" stroke={SKIN} strokeWidth="4.8" strokeLinecap="round" />
        <g transform={`translate(${wx} ${wy}) rotate(${angle}) scale(${side * 1.18} 1.18)`}>
          <Palm />
        </g>
      </g>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={INK} strokeWidth="9.4" strokeLinecap="round" />
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={KURTA} strokeWidth="7.2" strokeLinecap="round" />
      {/* the rolled-up cuff */}
      <ellipse cx={ex} cy={ey} rx="4.1" ry="2.8" transform={`rotate(${(Math.atan2(ey - sy, ex - sx) * 180) / Math.PI + 90} ${ex} ${ey})`} fill={KURTA} stroke={INK} strokeWidth="1.1" />
    </>
  );
}

/** Open palm, fingers up, wrist at (0, 0). */
function Palm() {
  const finger = (x, top, w = 1.75) => <rect x={x} y={top} width={w} height={-top - 5} rx="0.88" fill={SKIN} stroke={INK} strokeWidth="0.8" />;
  return (
    <>
      {finger(-3.7, -11.2)}
      {finger(-1.75, -12.2)}
      {finger(0.2, -11.7)}
      {finger(2.1, -10.2, 1.6)}
      <ellipse cx="-4.4" cy="-4.6" rx="1.2" ry="2.7" transform="rotate(-32 -4.4 -4.6)" fill={SKIN} stroke={INK} strokeWidth="0.8" />
      <path d="M-3.9 -7 C-4.1 -2 -2.5 0.2 0 0.2 C2.5 0.2 4 -2 3.8 -7 Z" fill={SKIN} stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M-2.4 -4.4 C-1 -3.6 1 -3.6 2.2 -4.6" fill="none" stroke={SKIN_DARK} strokeWidth="0.6" strokeLinecap="round" />
      {/* दोरा */}
      <rect x="-3.3" y="-0.4" width="6.6" height="1.5" rx="0.6" fill="#d6281f" stroke={INK} strokeWidth="0.5" />
      <circle cx="0" cy="0.35" r="0.55" fill="#f5c518" />
    </>
  );
}

// Where the pole sits; BotWidget places the chat window just above it (POLE_TOP in the 80x80 viewBox).
const POLE_Y = 8;
export const POLE_TOP = POLE_Y - 2.4;

/**
 * Both arms raised, fists gripping a bamboo pole (with its joints) above the फेटा. The pole reaches past
 * his shoulders (the SVG overflows) so the chat window above it looks carried.
 */
function HoldingPole() {
  const arm = (shoulder, elbow, wrist) => (
    <>
      <line x1={elbow[0]} y1={elbow[1]} x2={wrist[0]} y2={wrist[1]} stroke={INK} strokeWidth="7" strokeLinecap="round" />
      <line x1={elbow[0]} y1={elbow[1]} x2={wrist[0]} y2={wrist[1]} stroke={SKIN} strokeWidth="4.8" strokeLinecap="round" />
      <line x1={shoulder[0]} y1={shoulder[1]} x2={elbow[0]} y2={elbow[1]} stroke={INK} strokeWidth="9.4" strokeLinecap="round" />
      <line x1={shoulder[0]} y1={shoulder[1]} x2={elbow[0]} y2={elbow[1]} stroke={KURTA} strokeWidth="7.2" strokeLinecap="round" />
      <ellipse cx={elbow[0]} cy={elbow[1]} rx="4.1" ry="2.8" transform={`rotate(${(Math.atan2(elbow[1] - shoulder[1], elbow[0] - shoulder[0]) * 180) / Math.PI + 90} ${elbow[0]} ${elbow[1]})`} fill={KURTA} stroke={INK} strokeWidth="1.1" />
      {/* दोरा */}
      <rect x={wrist[0] - 3} y={wrist[1] - 1} width="6" height="1.6" rx="0.6" fill="#d6281f" stroke={INK} strokeWidth="0.5" />
    </>
  );
  // A fist around the pole: knuckles on top, fingers wrapped in front, thumb over them.
  const fist = (x, thumbSide) => (
    <g transform={`translate(${x} ${POLE_Y})`}>
      <rect x="-4.3" y="-4.4" width="8.6" height="8.4" rx="3" fill={SKIN} stroke={INK} strokeWidth="1" />
      <path d="M-4.2 -0.9 H4.2" stroke={INK} strokeWidth="0.7" />
      <path d="M-1.45 -0.9 V3.6 M1.45 -0.9 V3.6" stroke={SKIN_DARK} strokeWidth="0.7" strokeLinecap="round" />
      <ellipse cx={thumbSide * 2.2} cy="-1.8" rx="2.6" ry="1.35" fill={SKIN} stroke={INK} strokeWidth="0.8" />
    </g>
  );
  const BAMBOO = '#c9a253';
  const BAMBOO_DARK = '#8a6a2a';
  return (
    <>
      {arm([20, 64], [6, 41], [16, 12])}
      {arm([60, 64], [74, 41], [64, 12])}
      {/* the bamboo pole: it reaches well to his right (the left of the screen) so it supports the chat
          window across most of a phone's width; on wide screens the window covers the rest */}
      <rect x="-160" y={POLE_Y - 2.4} width="248" height="4.8" rx="2.4" fill={BAMBOO} stroke={INK} strokeWidth="1.1" />
      <path d={`M-158 ${POLE_Y - 0.9} H86`} stroke="#e6c987" strokeWidth="0.9" strokeLinecap="round" />
      {[-140, -95, -50, -12, 30, 50, 76].map((x) => (
        <path key={x} d={`M${x} ${POLE_Y - 2.4} V${POLE_Y + 2.4}`} stroke={BAMBOO_DARK} strokeWidth="1.1" />
      ))}
      {fist(16, 1)}
      {fist(64, -1)}
    </>
  );
}
