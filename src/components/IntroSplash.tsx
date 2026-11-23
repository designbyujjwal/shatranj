import React, { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../utils/assetUrl';
import { royalBattleMusic } from '../utils/music';
import { createIntroScore } from '../utils/introScore';
import { holdSceneRender } from '../three/renderHold';
import { IntroSword3D, SETTLED_MS, CLOSE_MS } from './IntroSword3D';

/**
 * The opening title: SHATRANJ lights up letter by letter on black, THE ROYAL GAME is written in,
 * and the sword falls last into the gap where the T stands. It covers the study while the 3D room
 * loads ("Lighting the lamp"), so it adds no waiting of its own. A click or a key skips it.
 *
 * The pieces are crops of the one logo image (shatranj-logo-full.png, 1476×433), so the logo stays a single asset.
 */

const LOGO = assetUrl('shatranj-logo-full.png');
const W = 1476, H = 433;

type Box = [left: number, top: number, right: number, bottom: number];

// Letter columns measured on the image: S H A | sword | R A N J
const LETTERS: Box[] = [
  [0, 110, 144, H], [144, 110, 360, H], [360, 110, 618, H],
  [662, 110, 911, H], [911, 110, 1129, H], [1129, 110, 1345, H], [1345, 110, W, H],
];
const TAGLINE: Box = [0, 60, 440, 110];
// The sheen lights the logo's shape, minus the old 2D light streak along the top that the 3D sword replaced
const SHEEN_MASK = `url(${LOGO}), linear-gradient(transparent ${(67 / H) * 100}%, #000 ${(67 / H) * 100}%)`;
const HILT = { x: (640 / W) * 100, y: (80 / H) * 100 };

// Timeline (ms from the click). The sword's shot runs first (see IntroSword3D); the letters come out from behind it as it settles
const LETTER_START = SETTLED_MS - 200, LETTER_STEP = 280;
const IMPACT = SETTLED_MS;                     // the sword locks into the T
const HOLD_UNTIL = SETTLED_MS + 6000, EXIT = 700, GIVE_UP = SETTLED_MS + 9000;
// Letters nearest the sword come first, each sliding out from behind it
const LETTER_IN = LETTERS.map(([l, , r], i) => {
  const centre = (l + r) / 2, from = ((640 - centre) * .38) / (r - l) * 100;
  return { i, from, dist: Math.abs(640 - centre) };
}).sort((a, b) => a.dist - b.dist).reduce<Record<number, { from: number; order: number }>>((m, x, order) => ({ ...m, [x.i]: { from: x.from, order } }), {});

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

/**
 * The landing page keeps the 3D sword: the letters and tagline from the logo image, with the settled
 * frame of the sword laid over them in place of the old drawn one, swapped into the landing logo.
 */
const keepSword = (logoImg: HTMLImageElement, logo: HTMLElement, frame: HTMLCanvasElement, layer: DOMRect) => {
  const target = document.querySelector<HTMLImageElement>('#landing img');
  if (!target || !logoImg.naturalWidth) return;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return;
  for (const [l, t, r, b] of [...LETTERS, TAGLINE]) g.drawImage(logoImg, l, t, r - l, b - t, l, t, r - l, b - t);
  const box = logo.getBoundingClientRect(), sx = frame.width / layer.width, sy = frame.height / layer.height;
  g.drawImage(frame, (box.left - layer.left) * sx, (box.top - layer.top) * sy, box.width * sx, box.height * sy, 0, 0, W, H);
  try { target.src = c.toDataURL('image/png'); } catch { /* a tainted canvas keeps the flat logo */ }
};

const isInvite = () => /[?&]room=/.test(window.location.search);

export const IntroSplash: React.FC<{ hold?: boolean }> = ({ hold = false }) => {   // hold: the lab keeps the last frame
  const [show] = useState(() => !isInvite())   // every load, except an invite link;
  const [ready, setReady] = useState(false);     // the logo image has decoded: start the clock
  const [entered, setEntered] = useState(false); // the visitor clicked in: browsers allow sound only after that
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(!show);
  const leaveRef = useRef<() => void>(() => {});
  const logoRef = useRef<HTMLDivElement>(null);
  const logoImgRef = useRef<HTMLImageElement>(null);
  const scoreRef = useRef<ReturnType<typeof createIntroScore>>(null);

  // The intro has its own score: the ambient bed waits until the title has gone
  useEffect(() => {
    if (!show) return;
    royalBattleMusic.holdForIntro(true);
    return () => { scoreRef.current?.stop(600); scoreRef.current = null; };
  }, [show]);

  useEffect(() => {
    if (!show) return;
    let alive = true;
    const img = new Image();
    logoImgRef.current = img;
    // Start once the logo has loaded. decode() alone can hang in Chrome (the title stayed black), so a timer backs it up
    const go = () => { if (alive) setReady(true); };
    img.onload = go;
    img.onerror = go;
    img.src = LOGO;
    if (img.complete) go();
    const backup = window.setTimeout(go, 2500);
    return () => { alive = false; window.clearTimeout(backup); };
  }, [show]);

  // The gate: one click or key starts the title and its score together (browsers allow sound only after it)
  const enter = () => {
    if (entered) return;
    setEntered(true);
    if (!royalBattleMusic.getState().isMuted) scoreRef.current = createIntroScore();
  };
  const startScore = () => scoreRef.current?.start({ close: CLOSE_MS / 1000, settled: SETTLED_MS / 1000 });
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
    // The study behind stops drawing while the shot, the flash and the sheen run, so they get every frame; it comes
    // back just before the title hands over, in time to lift its veil (the hand-over waits for that)
    const release = holdSceneRender();
    const resume = window.setTimeout(release, HOLD_UNTIL - 500);
    const leave = () => {
      if (done) return;
      done = true;
      release();
      setLeaving(true);
      // The intro music plays on to its last chord over the study, then the ambient bed creeps in
      scoreRef.current?.finish();
      scoreRef.current = null;
      window.setTimeout(() => {
        royalBattleMusic.holdForIntro(false);
        royalBattleMusic.start();
      }, 9000);
      window.setTimeout(() => setGone(true), EXIT);
    };
    leaveRef.current = leave;
    // Hold the title until the room behind it is lit (the study's veil lifts), so the reveal lands on the scene
    const roomReady = () => { const v = document.getElementById('veil'); return !v || v.classList.contains('gone'); };
    const timer = window.setInterval(() => {
      const t = performance.now() - started;
      if (!hold && ((t >= HOLD_UNTIL && roomReady()) || t >= GIVE_UP)) leave();
    }, 100);
    const skip = () => { if (!hold) leave(); };
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(resume);
      release();
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [show, ready, entered]);

  if (gone) return null;

  return (
    <div className={`intro-splash ${entered ? 'is-entered' : ''} ${ready && entered ? 'is-playing' : ''} ${leaving ? 'is-leaving' : ''}`} aria-hidden="true" onClick={() => (entered ? (!hold && leaveRef.current()) : enter())}>
      <div className="intro-gate">
        <span className="intro-gate-rule" />
        <span className="intro-gate-label">Click to enter</span>
        <span className="intro-gate-rule" />
        <span className="intro-gate-note">Sound on</span>
      </div>
      <div className="intro-haze" />
      <div className="intro-stage">
        <div className="intro-logo" ref={logoRef}>
          <div className="intro-letters">
            {LETTERS.map((box, i) => (
              <Crop key={i} box={box} className="intro-letter"
                style={{ animationDelay: `${LETTER_START + LETTER_IN[i].order * LETTER_STEP}ms`, ['--from' as string]: `${LETTER_IN[i].from}%` }} />
            ))}
            <Crop box={TAGLINE} className="intro-tagline" style={{ animationDelay: `${LETTER_START + 2300}ms` }} />
          </div>
        </div>
      </div>
      <IntroSword3D className="intro-sword3d" playing={ready && entered} logoRef={logoRef} onStart={startScore}
        onSettled={(frame, layer) => { if (logoImgRef.current && logoRef.current) keepSword(logoImgRef.current, logoRef.current, frame, layer); }} />
      {/* The flash and the sheen sit over the 3D sword (the stage above sits under it), lined up with the logo */}
      <div className="intro-stage intro-stage-over">
        <div className="intro-logo">
          <div className="intro-flash" style={{ left: `${HILT.x}%`, top: `${HILT.y}%`, animationDelay: `${IMPACT}ms` }} />
          <div className="intro-sheen" style={{ maskImage: SHEEN_MASK, WebkitMaskImage: SHEEN_MASK, maskComposite: 'intersect', WebkitMaskComposite: 'source-in', animationDelay: `${LETTER_START + 3800}ms` }} />
        </div>
      </div>
      <div className="intro-grain" />
      <div className="intro-vignette" />
    </div>
  );
};
