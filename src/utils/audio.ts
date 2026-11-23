/**
 * Procedural audio synthesizer using Web Audio API.
 * Provides realistic physical chess piece sounds, tactile gestures, and game alerts.
 */
import { assetUrl } from './assetUrl';

class ChessAudioEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;

  private getContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playLiftSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Audio error suppressed
    }
  }

  public playPinchEngage() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch {
      // Audio error suppressed
    }
  }

  public playPinchRelease() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.06);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Audio error suppressed
    }
  }

  public playMoveSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // Deep wood strike body
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.08);

      oscGain.gain.setValueAtTime(0.25, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      // Wooden impact noise burst
      const bufferSize = ctx.sampleRate * 0.06;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(850, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.06);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.18, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      osc.start(now);
      noise.start(now);
      osc.stop(now + 0.14);
      noise.stop(now + 0.08);
    } catch {
      // Audio error suppressed
    }
  }

  public playCaptureSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.value = 0.9;
      out.connect(ctx.destination);

      // A short burst of noise, shaped by a filter: the building block of the crack and the falling grit
      const burst = (at: number, length: number, type: BiquadFilterType, freq: number, q: number, level: number) => {
        const frames = Math.max(1, Math.floor(ctx.sampleRate * length));
        const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        filter.Q.value = q;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(level, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + length);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(out);
        src.start(at);
        src.stop(at + length + 0.01);
      };

      // 1. The blow: a dull knock of stone on stone
      const knock = ctx.createOscillator();
      const knockGain = ctx.createGain();
      knock.type = 'triangle';
      knock.frequency.setValueAtTime(190, now);
      knock.frequency.exponentialRampToValueAtTime(60, now + 0.12);
      knockGain.gain.setValueAtTime(0.32, now);
      knockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      knock.connect(knockGain);
      knockGain.connect(out);
      knock.start(now);
      knock.stop(now + 0.18);

      // 2. The crack: a bright, sharp split
      burst(now, 0.07, 'bandpass', 2400, 1.2, 0.38);
      burst(now + 0.004, 0.16, 'lowpass', 700, 0.7, 0.22);

      // 3. The grit: small chips landing just after
      const chips = 5;
      for (let i = 0; i < chips; i++) {
        const at = now + 0.06 + i * 0.035 + Math.random() * 0.03;
        burst(at, 0.018 + Math.random() * 0.012, 'highpass', 2800 + Math.random() * 2500, 0.8, 0.12 * (1 - i / (chips + 1)));
      }
    } catch {
      // Audio error suppressed
    }
  }

  public playCheckSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [440, 660].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.07);

        gain.gain.setValueAtTime(0.001, now + i * 0.07);
        gain.gain.linearRampToValueAtTime(0.12, now + i * 0.07 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.28);
      });
    } catch {
      // Audio error suppressed
    }
  }

  public playInvalidSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.15);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      // Audio error suppressed
    }
  }

  public playWinFanfare() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const chords = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      chords.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.09;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.65);
      });
    } catch {
      // Audio error suppressed
    }
  }

  // ---------- Victory screen: sound design timed to its entrance (see index.css) ----------
  private noise: AudioBuffer | null = null;
  private hall: { input: GainNode; out: GainNode } | null = null;

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
    }
    return this.noise;
  }

  // A stone hall: dry sound plus a generated reverb tail, through a gentle limiter
  private victoryBus(ctx: AudioContext) {
    if (!this.hall) {
      const input = ctx.createGain(), out = ctx.createGain(), wet = ctx.createGain(), comp = ctx.createDynamicsCompressor();
      const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 400 ? i / 400 : 1); } }
      const verb = ctx.createConvolver(); verb.buffer = ir;
      wet.gain.value = .32; out.gain.value = .55;
      comp.threshold.value = -6; comp.knee.value = 4; comp.ratio.value = 12; comp.attack.value = .002; comp.release.value = .2;   // a limiter, not a squash
      input.connect(out); input.connect(verb); verb.connect(wet); wet.connect(out); out.connect(comp); comp.connect(ctx.destination);
      this.hall = { input, out };
    }
    return this.hall.input;
  }

  private noiseSource(ctx: AudioContext, at: number, dur: number) {
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer(ctx);
    src.loop = true; src.start(at, Math.random() * 2); src.stop(at + dur + .05);
    return src;
  }

  private env(ctx: AudioContext, at: number, peak: number, attack: number, decay: number, dest: AudioNode) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + attack); g.gain.exponentialRampToValueAtTime(.0001, at + attack + decay);
    g.connect(dest); return g;
  }

  private tone(ctx: AudioContext, at: number, f0: number, f1: number, glide: number, peak: number, decay: number, dest: AudioNode, type: OscillatorType = 'sine') {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + glide);
    o.connect(this.env(ctx, at, peak, .004, decay, dest)); o.start(at); o.stop(at + decay + .1);
  }

  // The sword landing as a slash: the blade swishing through the air, a bright ringing "shing" as it
  // bites, a little weight under it, and sparks
  private swordSlash(ctx: AudioContext, at: number, out: AudioNode) {
    const swish = ctx.createBiquadFilter(); swish.type = 'bandpass'; swish.Q.value = 1.8;
    swish.frequency.setValueAtTime(6500, at - .16); swish.frequency.exponentialRampToValueAtTime(900, at);
    const sg = ctx.createGain(); sg.gain.setValueAtTime(.0001, at - .16); sg.gain.exponentialRampToValueAtTime(1.4, at - .02); sg.gain.exponentialRampToValueAtTime(.0001, at + .05);
    this.noiseSource(ctx, at - .16, .22).connect(swish); swish.connect(sg); sg.connect(out);

    const f = 1320;   // the ring: high, bright steel, with near twins so it shimmers
    [[1, .11, 1.6], [1.51, .07, 1.2], [2.13, .055, .9], [2.76, .04, .7], [3.92, .025, .45]].forEach(([r, p, d]) => {
      this.tone(ctx, at, f * r * .985, f * r, .05, p, d, out);
      this.tone(ctx, at, f * r * 1.006, f * r * 1.004, .05, p * .6, d * .85, out);
    });
    const scrape = ctx.createBiquadFilter(); scrape.type = 'bandpass'; scrape.Q.value = 6;   // the edge sliding as it bites
    scrape.frequency.setValueAtTime(2200, at); scrape.frequency.exponentialRampToValueAtTime(7500, at + .3);
    this.noiseSource(ctx, at, .35).connect(scrape); scrape.connect(this.env(ctx, at, .25, .004, .3, out));

    this.tone(ctx, at, 82, 40, .3, .55, .45, out);
    for (let i = 0; i < 14; i++) {
      const t = at + .02 + Math.pow(Math.random(), 1.6) * .5, sp = ctx.createBiquadFilter();
      sp.type = 'highpass'; sp.frequency.value = 3500 + Math.random() * 4000;
      this.noiseSource(ctx, t, .01).connect(sp); sp.connect(this.env(ctx, t, .03 + Math.random() * .05, .0005, .006 + Math.random() * .008, out));
    }
  }

  // One brass note: three detuned saws through a filter that opens as the note speaks, with a late vibrato
  private brass(ctx: AudioContext, at: number, freq: number, dur: number, level: number, out: AudioNode) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(freq * 1.5, at); lp.frequency.exponentialRampToValueAtTime(freq * 6, at + .07); lp.frequency.exponentialRampToValueAtTime(freq * 3.6, at + .3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(level, at + .045); g.gain.setTargetAtTime(level * .75, at + .08, .15);
    g.gain.setTargetAtTime(.0001, at + dur, .12);
    lp.connect(g); g.connect(out);
    const vib = ctx.createOscillator(), vd = ctx.createGain(); vib.frequency.value = 5.2;
    vd.gain.setValueAtTime(0, at); vd.gain.linearRampToValueAtTime(freq * .006, at + Math.min(dur, .6));
    vib.connect(vd); vib.start(at); vib.stop(at + dur + .6);
    for (const det of [-6, 0, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      vd.connect(o.frequency); o.connect(lp); o.start(at); o.stop(at + dur + .6);
    }
  }

  private timpani(ctx: AudioContext, at: number, freq: number, level: number, out: AudioNode) {
    this.tone(ctx, at, freq * 1.08, freq, .08, level, 1.4, out);
    this.tone(ctx, at, freq * 1.5 * 1.05, freq * 1.5, .08, level * .35, .8, out);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 220; bp.Q.value = .9;
    this.noiseSource(ctx, at, .12).connect(bp); bp.connect(this.env(ctx, at, level * .5, .002, .1, out));
  }

  // A short heroic fanfare in D: a triplet call to the tonic, a lift through C major, home to D
  private victoryFanfare(ctx: AudioContext, at: number, out: AudioNode) {
    const N = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    const D3 = 50, A3 = 57, C3 = 48, G3 = 55;
    const melody: [number, number, number][] = [   // [midi, start, length]
      [69, 0, .1], [69, .13, .1], [69, .26, .1], [74, .39, .95],
      [72, 1.4, .22], [76, 1.66, .5], [78, 2.2, 1.7],
    ];
    melody.forEach(([m, t, d]) => this.brass(ctx, at + t, N(m), d, .07, out));
    const chords: [number[], number, number][] = [   // [voicing, start, length]
      [[D3, A3, 62, 66], .39, .95], [[C3, G3, 60, 64], 1.4, .75], [[D3, A3, 62, 66, 69], 2.2, 1.7],
    ];
    chords.forEach(([notes, t, d]) => notes.forEach((m) => this.brass(ctx, at + t, N(m), d, .028, out)));
    this.timpani(ctx, at + .39, N(38), .5, out);
    this.timpani(ctx, at + 1.4, N(36), .4, out);
    [2.2, 2.32, 2.44].forEach((t, i) => this.timpani(ctx, at + t, N(38), .3 + i * .1, out));
  }

  // The recorded victory fanfare ("Victory Fanfare #1" by PhatPhrogStudio, Pixabay Content License),
  // trimmed to the part that fits the winner screen. Until the file is present, the synthesized fanfare plays.
  private static FANFARE_URL = assetUrl('sounds/victory-fanfare.mp3');
  private static FANFARE_FROM = 2.42;   // the music starts as the screen opens, 2 s before the strike, so the recording's
                                        // first full-brass hit (at 4.42 s) lands with the sword
  private static FANFARE_LENGTH = 12.6; // through the peak and the natural wind-down to its last note
  private fanfareBytes: Promise<ArrayBuffer | null> | null = null;
  private fanfare: Promise<AudioBuffer | null> | null = null;

  /** Fetch the fanfare early (no audio context needed), so it is ready when the game is won */
  public preloadVictoryMusic() {
    if (!this.fanfareBytes) {
      this.fanfareBytes = fetch(ChessAudioEngine.FANFARE_URL)
        .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('audio') ? r.arrayBuffer() : null))
        .catch(() => null);
    }
  }

  private fanfareBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
    this.preloadVictoryMusic();
    if (!this.fanfare) this.fanfare = this.fanfareBytes!.then((b) => (b ? ctx.decodeAudioData(b.slice(0)) : null)).catch(() => null);
    return this.fanfare;
  }

  /** The winner screen's entrance, scheduled on the audio clock; times are seconds from now. Returns a cancel function. */
  public playVictorySequence({ strike = 2.0, music = 2.15 } = {}): () => void {
    const ctx = this.getContext();
    if (!ctx || ctx.state !== 'running') return () => {};   // no user gesture yet: stay silent rather than play late
    const out = ctx.createGain(), music$ = ctx.createGain();
    let cancelled = false;
    try {
      out.connect(this.victoryBus(ctx));
      music$.connect(ctx.destination);   // the recording is already mixed: no hall on it
      const now = ctx.currentTime + .02;
      this.swordSlash(ctx, now + strike, out);
      this.fanfareBuffer(ctx).then((buf) => {
        if (cancelled) return;
        if (!buf) { this.victoryFanfare(ctx, Math.max(ctx.currentTime, now + music), out); return; }
        const at = Math.max(ctx.currentTime + .01, now + music), late = at - (now + music);
        const from = ChessAudioEngine.FANFARE_FROM + Math.max(0, late), len = Math.min(ChessAudioEngine.FANFARE_LENGTH, buf.duration - from);
        const g = ctx.createGain(), fade = Math.min(.8, len * .3);
        g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.85, at + .35);   // eases in, as it starts mid-phrase
        g.gain.setValueAtTime(.85, at + len - fade); g.gain.exponentialRampToValueAtTime(.0001, at + len);
        const src = ctx.createBufferSource(); src.buffer = buf;
        src.connect(g); g.connect(music$); src.start(at, from, len); src.stop(at + len + .05);
      });
    } catch {
      // Audio error suppressed
    }
    return () => {
      cancelled = true;
      const t = ctx.currentTime;   // a quick fade rather than a click
      music$.gain.setValueAtTime(music$.gain.value, t); music$.gain.linearRampToValueAtTime(0, t + .15);
      window.setTimeout(() => { try { out.disconnect(); music$.disconnect(); } catch { /* already gone */ } }, 200);
    };
  }
}

export const soundEffects = new ChessAudioEngine();
