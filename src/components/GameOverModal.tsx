import React, { useEffect, useRef, useState } from 'react';
import { Eye, Award, X } from 'lucide-react';
import { soundEffects } from '../utils/audio';
import { assetUrl } from '../utils/assetUrl';

interface GameOverModalProps {
  winner: 'w' | 'b' | 'draw' | null;
  reason: string;
  onRestart: () => void;
  onClose?: () => void;
}

// Load the badge layers with the app, so the entrance never starts before its images are ready
const BADGE_LAYERS = ['victory-shield.png', 'victory-shield-lit.png', 'victory-sword.png'].map(assetUrl);
if (typeof window !== 'undefined') BADGE_LAYERS.forEach((src) => { new Image().src = src; });
if (typeof window !== 'undefined') soundEffects.preloadVictoryMusic();

// When the sword strikes the shield (ms after open); kept in step with the timeline in index.css
const STRIKE_MS = 2000;
// When the entrance has settled and the badge starts following the pointer
const SETTLED_MS = 3100;

type OrbitRefs = { orbit: React.RefObject<HTMLDivElement>; sword: React.RefObject<HTMLDivElement> };

// After the entrance, the badge tilts toward the pointer (and sways gently on its own when the pointer
// rests or on touch screens), with the sword drifting a little in front of the shield. Everything
// else on the page stays still.
function useOrbitParallax(refs: OrbitRefs, introPlayed: boolean) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let px = 0, py = 0, x = 0, y = 0, lastMove = -Infinity, raf = 0;
    const start = performance.now() - (introPlayed ? SETTLED_MS : 0);
    const onMove = (e: PointerEvent) => {
      px = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth - .5) * 2));
      py = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight - .5) * 2));
      lastMove = performance.now();
    };
    window.addEventListener('pointermove', onMove);
    const tick = (now: number) => {
      const since = now - start - SETTLED_MS;
      const k = since <= 0 ? 0 : Math.min(1, since / 1200);              // ease the effect in after the entrance
      const idle = Math.min(1, Math.max(0, (now - lastMove - 2000) / 1500));   // the pointer has rested: drift on our own
      const t = now / 1000;
      const tx = (px * (1 - idle) + Math.sin(t * .55) * .6 * idle) * k;
      const ty = (py * (1 - idle) + Math.sin(t * .4 + 1) * .4 * idle) * k;
      x += (tx - x) * .06; y += (ty - y) * .06;                         // smooth follow
      const set = (r: React.RefObject<HTMLElement>, v: string) => { if (r.current) r.current.style.transform = v; };
      set(refs.orbit, `perspective(900px) rotateY(${x * 9}deg) rotateX(${-y * 7}deg)`);
      set(refs.sword, `translate3d(${x * 9}px, ${y * 6}px, 0)`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); };
  }, [introPlayed]);
}

// Faint embers drifting up through the dark, and a brief spray of sparks where the sword strikes
const Embers: React.FC<{ strikeRef: React.RefObject<HTMLDivElement>; burst: boolean }> = ({ strikeRef, burst }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    type P = { x: number; y: number; vx: number; vy: number; life: number; age: number; r: number; hue: number; spark: boolean; seed: number };
    const parts: P[] = [];
    let w = 0, h = 0, raf = 0, last = performance.now();
    const start = last;
    let burstDone = !burst;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const ember = (initial = false): P => ({
      x: Math.random() * w,
      y: initial ? Math.random() * h : h + 10,
      vx: (Math.random() - .5) * 8,
      vy: -(14 + Math.random() * 30),
      life: 5 + Math.random() * 5,
      age: initial ? Math.random() * 4 : 0,
      r: .6 + Math.random() * 1.5,
      hue: 18 + Math.random() * 22,
      spark: false,
      seed: Math.random() * 100,
    });
    const target = Math.round(Math.min(46, (w * h) / 26000));
    for (let i = 0; i < target; i++) parts.push(ember(true));

    const tick = (now: number) => {
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;

      if (!burstDone && now - start >= STRIKE_MS) {
        burstDone = true;
        const rect = strikeRef.current?.getBoundingClientRect();
        const box = canvas.getBoundingClientRect();
        if (rect) {
          const cx = rect.left - box.left + rect.width / 2, cy = rect.top - box.top + rect.height * .27;
          for (let i = 0; i < 34; i++) {
            const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 320;
            parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .7 - 60, life: .5 + Math.random() * .7, age: 0, r: .7 + Math.random() * 1.2, hue: 30 + Math.random() * 20, spark: true, seed: 0 });
          }
        }
      }

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life || p.y < -20) {
          if (p.spark) parts.splice(i, 1); else parts[i] = ember();
          continue;
        }
        if (p.spark) {
          p.vy += 260 * dt; p.vx *= 1 - 1.8 * dt; p.vy *= 1 - 1.2 * dt;
        } else {
          p.vx += Math.sin(now / 900 + p.seed) * 6 * dt;
        }
        p.x += p.vx * dt; p.y += p.vy * dt;

        const t = p.age / p.life;
        const fade = p.spark ? 1 - t : Math.min(1, t * 4) * (1 - t);
        const flicker = p.spark ? 1 : .7 + .3 * Math.sin(now / 120 + p.seed * 7);
        const a = (p.spark ? .9 : .4) * fade * flicker;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        glow.addColorStop(0, `hsla(${p.hue + 15}, 100%, 75%, ${a})`);
        glow.addColorStop(.3, `hsla(${p.hue}, 100%, 55%, ${a * .5})`);
        glow.addColorStop(1, `hsla(${p.hue}, 100%, 45%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2); ctx.fill();
        if (p.spark) {   // a short streak behind each spark
          ctx.strokeStyle = `hsla(${p.hue + 10}, 100%, 70%, ${a * .6})`;
          ctx.lineWidth = p.r;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .03, p.y - p.vy * .03); ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [strikeRef, burst]);

  return <canvas ref={canvasRef} className="victory-embers" aria-hidden="true" />;
};

export const GameOverModal: React.FC<GameOverModalProps> = ({ winner, onRestart, onClose }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  // Once the entrance has played, reopening from "Inspect board" shows the screen at rest
  const [introPlayed, setIntroPlayed] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const swordRef = useRef<HTMLDivElement>(null);
  useOrbitParallax({ orbit: orbitRef, sword: swordRef }, introPlayed);

  // Sound: the victory music from the moment the screen opens, and the sword's slash as it lands on the music's first full hit
  useEffect(() => {
    if (!winner || introPlayed) return;
    return soundEffects.playVictorySequence({ strike: STRIKE_MS / 1000, music: 0 });
  }, [winner, introPlayed]);

  const title =
    winner === 'w'
      ? 'White Delivers Checkmate'
      : winner === 'b'
      ? 'Black Delivers Checkmate'
      : 'Equilibrium & Truce';

  const subtitle =
    winner === 'w'
      ? 'The White Sovereign Claims Imperial Supremacy'
      : winner === 'b'
      ? 'The Black Monarch Triumphs in Sovereign Glory'
      : 'Neither Army Yields; Honor is Preserved in Stasis';

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-in fade-in">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-[#f7f2e7] border-2 border-[#7d481b]/50 shadow-[0_8px_24px_rgba(61,29,7,0.45)] text-[#1f0d04] font-cinzel text-xs font-bold uppercase tracking-wider hover:bg-[#ede1cb] cursor-pointer"
        >
          <Award className="w-4 h-4 text-[#821e25]" />
          <span>View Reckoning Codex</span>
        </button>
      </div>
    );
  }

  const rise = (ms: number) => ({ animationDelay: `${ms}ms` });

  return (
    <div
      id="game-over-overlay"
      className={`fixed inset-0 z-50 flex flex-col items-center px-4 py-6 overflow-y-auto overflow-x-hidden select-none animate-in fade-in duration-300 ${introPlayed ? 'victory-static' : ''}`}
      style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 42%, rgba(60, 34, 14, .55), rgba(5, 4, 3, .9) 70%)', backdropFilter: 'blur(3px)' }}
    >
      <Embers strikeRef={badgeRef} burst={!introPlayed} />

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full text-[#e9dcc0]/70 hover:text-[#ecd29a] hover:bg-white/5 transition-colors cursor-pointer"
          title="Close"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="victory-shake victory-stage relative z-10 my-auto flex flex-col items-center text-center max-w-xl w-full" onClick={(e) => e.stopPropagation()}>
        {/* The shield spins in and lands, then the sword falls onto it */}
        <div ref={badgeRef} className={`victory-medallion relative h-[min(19.5rem,40vh)] aspect-[2/3] ${winner === 'draw' ? 'saturate-[.35]' : ''}`}>
          <div className="absolute -inset-10 rounded-full pointer-events-none victory-medallion-halo" aria-hidden="true" />
          <div className="pointer-events-none victory-shockwave" aria-hidden="true" />
          <div className="pointer-events-none victory-shockwave is-strike" aria-hidden="true" />
          <div ref={orbitRef} className="absolute inset-0 will-change-transform">
            <img src={BADGE_LAYERS[0]} alt="" className="victory-medallion-img absolute inset-0 w-full h-full object-contain pointer-events-none" draggable={false} />
            {/* the shield as the sword leaves it: lit by the sword's glow and carrying its shadow */}
            <img
              src={BADGE_LAYERS[1]}
              alt="Victory badge: a worn red shield with a gold emblem and a glowing sword"
              className="victory-lit absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
            <div ref={swordRef} className="absolute inset-0 will-change-transform">
              <img src={BADGE_LAYERS[2]} alt="" className="victory-sword absolute inset-0 w-full h-full object-contain pointer-events-none" draggable={false} />
            </div>
          </div>
        </div>

        <h2 className="victory-title mt-4 font-cinzel text-2xl sm:text-3xl font-bold tracking-[0.14em] uppercase text-[#f3e3bf]" style={{ textShadow: '0 2px 18px rgba(0,0,0,.7)' }}>
          {title}
        </h2>
        <p className="victory-rise mt-1 font-cormorant italic text-base sm:text-lg text-[#e9dcc0]/80" style={rise(2400)}>{subtitle}</p>

        {/* Sovereign decree */}
        <div className="victory-rise mt-5 px-5 py-3 border-y border-[#c99a4b]/35" style={rise(2600)}>
          <span className="block font-cinzel text-[10px] tracking-[0.3em] uppercase text-[#c99a4b]">~ Sovereign Decree ~</span>
          <span className="mt-1.5 block whitespace-nowrap font-cinzel text-[11px] tracking-[0.16em] uppercase text-[#e9cf96]">&#10022; Registered in the Royal Annals of Chess &bull; Anno Domini MMXXVI &#10022;</span>
        </div>

        {/* Actions: the same gold cartouche as the landing page and the book */}
        <div className="mt-6 flex flex-col items-center gap-3" style={{ ['--col' as any]: 'min(340px, 86vw)' }}>
          <button type="button" className="join victory-rise" style={rise(2850)} onClick={onRestart}>CONTINUE</button>
          <button
            type="button"
            onClick={() => { setIntroPlayed(true); setIsMinimized(true); }}
            className="victory-rise inline-flex items-center gap-2 font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#e9dcc0]/75 hover:text-[#ecd29a] transition-colors cursor-pointer"
            style={rise(3000)}
          >
            <Eye className="w-4 h-4" /> Inspect Board
          </button>
        </div>
      </div>
    </div>
  );
};
