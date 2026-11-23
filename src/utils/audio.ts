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
        this.decodeCaptureSound(this.ctx);   // ready by the first capture
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** A burst of filtered noise with a soft attack: the felt, wood and air textures below are built from it */
  private noiseBurst(ctx: AudioContext, at: number, length: number, type: BiquadFilterType, freq: number, q: number, level: number, attack = 0.004) {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * length));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(at);
    src.stop(at + length + 0.01);
  }

  /** A struck resonance of the board or the piece: a sine that rings briefly and dies */
  private ring(ctx: AudioContext, at: number, freq: number, length: number, level: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.04, at);
    osc.frequency.exponentialRampToValueAtTime(freq, at + 0.02);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + length + 0.01);
  }

  /** Picking a piece up: the felt base slides off the board with a faint wooden tick */
  public playLiftSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      this.noiseBurst(ctx, now, 0.11, 'bandpass', 1100 + Math.random() * 300, 0.9, 0.05, 0.03);
      this.noiseBurst(ctx, now + 0.005, 0.025, 'bandpass', 2600, 1.5, 0.025);
    } catch {
      // Audio error suppressed
    }
  }

  /** The hand closing on a piece: a soft touch, barely there */
  public playPinchEngage() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      this.noiseBurst(ctx, ctx.currentTime, 0.03, 'bandpass', 1800, 1.2, 0.03, 0.006);
    } catch {
      // Audio error suppressed
    }
  }

  /** The hand letting go: a short breath of air */
  public playPinchRelease() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      this.noiseBurst(ctx, ctx.currentTime, 0.05, 'lowpass', 900, 0.6, 0.025, 0.012);
    } catch {
      // Audio error suppressed
    }
  }

  /** Setting a piece down: a weighted, felt-muffled knock on a wooden board, slightly different every time */
  public playMoveSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const v = 0.94 + Math.random() * 0.12;   // no two pieces land quite alike
      this.noiseBurst(ctx, now, 0.04, 'lowpass', 1600 * v, 0.7, 0.16, 0.002);   // the contact
      this.ring(ctx, now, 170 * v, 0.13, 0.16);   // the board's body
      this.ring(ctx, now, 410 * v, 0.07, 0.06);   // the piece itself
      this.noiseBurst(ctx, now + 0.045, 0.03, 'lowpass', 900 * v, 0.7, 0.03, 0.002);   // a tiny settle
    } catch {
      // Audio error suppressed
    }
  }

  // The capture sound: the "small rock break" recording (lordsonny), played a little low and cut after the rubble settles.
  // Until it has loaded, the synthesized crack below plays instead.
  private static ROCK_URL = assetUrl('sounds/rock-break.mp3');
  private static ROCK_VOLUME = 0.18;  // the recording is mastered loud
  private static ROCK_LENGTH = 2.6;   // the last 1.5 s is near silence
  private rockBytes: Promise<ArrayBuffer | null> | null = null;
  private rock: AudioBuffer | null = null;
  private rockDecoding = false;

  /** Fetch the rock-break recording early (no audio context needed) */
  public preloadCaptureSound() {
    if (!this.rockBytes) {
      this.rockBytes = fetch(ChessAudioEngine.ROCK_URL)
        .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('audio') ? r.arrayBuffer() : null))
        .catch(() => null);
    }
  }

  private decodeCaptureSound(ctx: AudioContext) {
    if (this.rock || this.rockDecoding) return;
    this.rockDecoding = true;
    this.preloadCaptureSound();
    this.rockBytes!
      .then((b) => (b ? ctx.decodeAudioData(b.slice(0)) : null))
      .then((buf) => { this.rock = buf; })
      .catch(() => {});
  }

  public playCaptureSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    this.decodeCaptureSound(ctx);
    if (this.rock) {
      try {
        const now = ctx.currentTime;
        const len = Math.min(ChessAudioEngine.ROCK_LENGTH, this.rock.duration);
        const src = ctx.createBufferSource();
        src.buffer = this.rock;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(ChessAudioEngine.ROCK_VOLUME, now + 0.02);   // eases in, so the hit isn't sharp
        g.gain.setValueAtTime(ChessAudioEngine.ROCK_VOLUME, now + len - 0.9);
        g.gain.exponentialRampToValueAtTime(0.001, now + len);
        const soften = ctx.createBiquadFilter();   // rounds off the harsh top end
        soften.type = 'lowpass';
        soften.frequency.value = 3200;
        soften.Q.value = 0.5;
        src.connect(soften);
        soften.connect(g);
        g.connect(ctx.destination);
        src.start(now);
        src.stop(now + len + 0.02);
        return;
      } catch {
        // fall through to the synthesized crack
      }
    }
    this.playSynthCaptureSound(ctx);
  }

  private playSynthCaptureSound(ctx: AudioContext) {
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

      // 1. The blow: a dry, unpitched thud, so it doesn't sound like an ordinary move
      burst(now, 0.09, 'lowpass', 380, 0.6, 0.5);

      // 2. The crack: two sharp splits, a hair apart, like stone giving way
      burst(now + 0.01, 0.05, 'bandpass', 3200, 2.5, 0.55);
      burst(now + 0.035, 0.08, 'bandpass', 1700, 1.8, 0.42);

      // 3. The crumble: rubble falling and settling while the shards drop
      const chunks = 12;
      for (let i = 0; i < chunks; i++) {
        const at = now + 0.12 + i * 0.055 + Math.random() * 0.04;
        const fade = 1 - i / (chunks + 2);
        burst(at, 0.025 + Math.random() * 0.03, 'bandpass', 700 + Math.random() * 1300, 1.4, 0.26 * fade);
        if (i % 2 === 0) burst(at + 0.01, 0.015, 'highpass', 3500 + Math.random() * 2500, 0.8, 0.1 * fade);
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
if (typeof window !== 'undefined') soundEffects.preloadCaptureSound();
