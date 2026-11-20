import React, { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../utils/assetUrl';
import { royalBattleMusic } from '../utils/music';

/**
 * The opening title: SHATRANJ lights up letter by letter on black, THE ROYAL GAME is written in,
 * and the sword falls last into the gap where the T stands. It covers the study while the 3D room
 * loads ("Lighting the lamp"), so it adds no waiting of its own. A click or a key skips it.
 *
 * The pieces are crops of the one logo image (shatranj-logo-full.png, 1476×433), so the logo stays a single asset.
 */

const LOGO = assetUrl('shatranj-logo-full.png');
const W = 1476, H = 433;
const SEEN_KEY = 'shatranj_intro_seen';

type Box = [left: number, top: number, right: number, bottom: number];

// Letter columns measured on the image: S H A | sword | R A N J
const LETTERS: Box[] = [
  [0, 110, 144, H], [144, 110, 360, H], [360, 110, 618, H],
  [662, 110, 911, H], [911, 110, 1129, H], [1129, 110, 1345, H], [1345, 110, W, H],
];
const TAGLINE: Box = [0, 60, 440, 110];
const GLINT: Box = [360, 0, 590, 67];          // the light streak running into the hilt
const SWORD: Box = [545, 0, 740, H];
// Inside the sword's box: the cross-guard and pommel on top, the blade down through the gap
const SWORD_SHAPE = [[590, 0], [740, 0], [740, 98], [662, 98], [662, H], [618, H], [618, 98], [545, 98], [545, 67], [590, 67]]
  .map(([x, y]) => `${((x - SWORD[0]) / (SWORD[2] - SWORD[0])) * 100}% ${(y / H) * 100}%`).join(', ');
const HILT = { x: (640 / W) * 100, y: (80 / H) * 100 };

// Timeline (ms)
const LETTER_START = 250, LETTER_STEP = 120;
const SWORD_START = 1350, SWORD_FALL = 650;
const IMPACT = SWORD_START + SWORD_FALL * 0.78;
const HOLD_UNTIL = 3300, EXIT = 700, GIVE_UP = 12000;

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

/** One rectangle of the logo, as its own box so it can move and fade by itself */
const Crop: React.FC<{ box: Box; className?: string; style?: React.CSSProperties; children?: React.ReactNode }> = ({ box, className = '', style, children }) => {
  const [l, t, r, b] = box, w = r - l, h = b - t;
  return (
    <div className={`intro-crop ${className}`} style={{ left: pct(l, W), top: pct(t, H), width: pct(w, W), height: pct(h, H), ...style }}>
      <img src={LOGO} alt="" draggable={false} style={{ width: pct(W, w), height: pct(H, h), left: pct(-l, w), top: pct(-t, h) }} />
      {children}
    </div>
  );
};

const isInvite = () => /[?&]room=/.test(window.location.search);
const seenThisSession = () => { try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };

export const IntroSplash: React.FC = () => {
  const [show] = useState(() => !isInvite() && !seenThisSession());
  const [ready, setReady] = useState(false);     // the logo image has decoded: start the clock
  const [entered, setEntered] = useState(false); // the visitor clicked in: browsers allow sound only after that
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(!show);
  const leaveRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!show) return;
    let alive = true;
    const img = new Image();
    // Start once the logo has loaded. decode() alone can hang in Chrome (the title stayed black), so a timer backs it up
    const go = () => { if (alive) setReady(true); };
    img.onload = go;
    img.onerror = go;
    img.src = LOGO;
    if (img.complete) go();
    const backup = window.setTimeout(go, 2500);
    return () => { alive = false; window.clearTimeout(backup); };
  }, [show]);

  // The gate: one click or key starts the title and the music together
  const enter = () => {
    if (entered) return;
    setEntered(true);
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
    royalBattleMusic.start();
  };
  useEffect(() => {
    if (!show || entered) return;
    const onKey = (e: KeyboardEvent) => { if (!e.repeat) enter(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!show || !ready || !entered) return;
    const started = performance.now();
    let done = false;
    const leave = () => {
      if (done) return;
      done = true;
      setLeaving(true);
      window.setTimeout(() => setGone(true), EXIT);
    };
    leaveRef.current = leave;
    // Hold the title until the room behind it is lit (the study's veil lifts), so the reveal lands on the scene
    const roomReady = () => { const v = document.getElementById('veil'); return !v || v.classList.contains('gone'); };
    const timer = window.setInterval(() => {
      const t = performance.now() - started;
      if ((t >= HOLD_UNTIL && roomReady()) || t >= GIVE_UP) leave();
    }, 100);
    const skip = () => leave();
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [show, ready, entered]);

  if (gone) return null;

  return (
    <div className={`intro-splash ${entered ? 'is-entered' : ''} ${ready && entered ? 'is-playing' : ''} ${leaving ? 'is-leaving' : ''}`} aria-hidden="true" onClick={() => (entered ? leaveRef.current() : enter())}>
      <div className="intro-gate">
        <span className="intro-gate-rule" />
        <span className="intro-gate-label">Click to enter</span>
        <span className="intro-gate-rule" />
        <span className="intro-gate-note">Sound on</span>
      </div>
      <div className="intro-haze" />
      <div className="intro-stage">
        <div className="intro-logo">
          <div className="intro-letters" style={{ animationDelay: `${IMPACT}ms` }}>
            {LETTERS.map((box, i) => (
              <Crop key={i} box={box} className="intro-letter" style={{ animationDelay: `${LETTER_START + i * LETTER_STEP}ms` }} />
            ))}
            <Crop box={TAGLINE} className="intro-tagline" style={{ animationDelay: '1050ms' }} />
          </div>
          <Crop box={GLINT} className="intro-glint" style={{ animationDelay: `${IMPACT + 40}ms` }} />
          <Crop box={SWORD} className="intro-sword" style={{ clipPath: `polygon(${SWORD_SHAPE})`, animationDelay: `${SWORD_START}ms`, animationDuration: `${SWORD_FALL}ms` }} />
          <div className="intro-flash" style={{ left: `${HILT.x}%`, top: `${HILT.y}%`, animationDelay: `${IMPACT}ms` }} />
          <div className="intro-sheen" style={{ maskImage: `url(${LOGO})`, WebkitMaskImage: `url(${LOGO})`, animationDelay: `${IMPACT + 250}ms` }} />
        </div>
      </div>
    </div>
  );
};
