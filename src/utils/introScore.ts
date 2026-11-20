/**
 * The intro's score, synthesised live with Web Audio and timed to the sword's shot.
 * Under the close-up the strings climb Dm - Bb - Gm - A with a low horn line, far-off heartbeats and bells
 * on the glints; a wordless choir joins as it builds. The pull-out is a riser over gathering war drums; the
 * sword locks into the T on a deep boom, a cymbal wash and full brass and choir in D major, held under the letters.
 * Original sound, nothing sampled, so there is nothing to license.
 *
 * Create it inside the click (browsers only allow sound after one), then call start() when the shot begins.
 */

export interface IntroScoreTimes { close: number; settled: number }  // seconds from the start of the shot

const D1 = 36.71, G1 = 49, A1 = 55, Bb1 = 58.27, D2 = 73.42, G2 = 98, A2 = 110, Bb2 = 116.54,
  D3 = 146.83, E3 = 164.81, F3 = 174.61, Fs3 = 185, G3 = 196, A3 = 220, Bb3 = 233.08,
  Cs4 = 277.18, D4 = 293.66, E4 = 329.63, F4 = 349.23, Fs4 = 369.99, A4 = 440;

export function createIntroScore(volume = .4) {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  ctx.resume().catch(() => {});

  // master -> compressor -> out, with a long generated reverb on a send
  const master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.ratio.value = 4; comp.attack.value = .02; comp.release.value = .5;
  // A fast limiter last, so the impact can hit hard without clipping
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -4; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = .002; limit.release.value = .25;
  master.connect(comp).connect(limit).connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 6);   // a cathedral-sized hall
  const wet = ctx.createGain(); wet.gain.value = .6;
  verb.connect(wet).connect(master);
  const dry = ctx.createGain(); dry.gain.value = .8;
  dry.connect(master);
  const bus = (sendLevel: number) => {
    const g = ctx.createGain();
    g.connect(dry);
    const s = ctx.createGain(); s.gain.value = sendLevel; g.connect(s).connect(verb);
    return g;
  };

  const nodes: AudioScheduledSourceNode[] = [];
  const osc = (type: OscillatorType, freq: number, at: number, end: number, out: AudioNode, detune = 0) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    o.connect(out); o.start(at); o.stop(end); nodes.push(o);
    return o;
  };
  const env = (g: GainNode, at: number, points: [number, number][]) => {
    g.gain.setValueAtTime(0, at);
    points.forEach(([dt, v]) => g.gain.linearRampToValueAtTime(v, at + dt));
  };

  /** A held, slowly breathing chord of detuned saws through a low-pass: the string section */
  const pad = (freqs: number[], at: number, end: number, level: number, cutoff: [number, number], send = .7, swell: [number, number][] = []) => {
    const out = bus(send);
    const g = ctx.createGain(); g.connect(out);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = .7;
    lp.frequency.setValueAtTime(cutoff[0], at); lp.frequency.linearRampToValueAtTime(cutoff[1], end - .5);
    lp.connect(g);
    // A slow tremble in the filter, like bows moving
    const lfo = osc('sine', .18, at, end, ctx.createGain());
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = cutoff[0] * .15; lfo.disconnect(); lfo.connect(lfoAmt).connect(lp.frequency);
    freqs.forEach((f) => [-9, 0, 8].forEach((d) => osc('sawtooth', f, at, end, lp, d)));
    env(g, at, swell.length ? swell : [[3, level], [end - at - 1.5, level], [end - at, 0]]);
  };

  /** A low drum: a sine that drops in pitch, with a puff of filtered noise */
  const drum = (at: number, level: number, freq = 58, len = 1.6) => {
    const out = bus(.5);
    const g = ctx.createGain(); g.connect(out);
    const o = osc('sine', freq, at, at + len, g);
    o.frequency.setValueAtTime(freq * 1.6, at); o.frequency.exponentialRampToValueAtTime(freq * .62, at + len * .7);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(level, at + .012); g.gain.exponentialRampToValueAtTime(.0008, at + len);
    noise(at, .25, level * .35, 900, out);
  };

  const noiseBuf = (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
  const noise = (at: number, len: number, level: number, cutoff: number, out: AudioNode, sweepTo?: number) => {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = sweepTo ? 'bandpass' : 'lowpass'; f.Q.value = sweepTo ? 2.5 : .7;
    f.frequency.setValueAtTime(cutoff, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + len);
    const g = ctx.createGain(); n.connect(f).connect(g).connect(out);
    if (sweepTo) { g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(level, at + len * .92); g.gain.linearRampToValueAtTime(0, at + len); }
    else { g.gain.setValueAtTime(level, at); g.gain.exponentialRampToValueAtTime(.0008, at + len); }
    n.start(at); n.stop(at + len + .05); nodes.push(n);
  };

  /** A struck bell: a few inharmonic partials ringing out into the reverb */
  const bell = (at: number, freq: number, level: number) => {
    const out = bus(1.1);
    [1, 2.76, 5.4, 8.93].forEach((p, i) => {
      const g = ctx.createGain(); g.connect(out);
      osc('sine', freq * p, at, at + 4, g);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(level / (i + 1), at + .005);
      g.gain.exponentialRampToValueAtTime(.0005, at + 3.5 / (i * .6 + 1));
    });
  };

  /** A slow vibrato for held voices, ready to wire into oscillators' detune */
  const vibrato = (at: number, end: number, rate: number, cents: number) => {
    const amt = ctx.createGain();
    amt.gain.setValueAtTime(0, at); amt.gain.linearRampToValueAtTime(cents, at + .8);
    osc('sine', rate, at, end, amt);
    return amt;
  };

  /** A french-horn line: warm saws through a dark filter, slow bloom, vibrato once the note settles */
  const horn = (freq: number, at: number, len: number, level: number) => {
    const out = bus(.9);
    const g = ctx.createGain(); g.connect(out);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = .9;
    lp.frequency.setValueAtTime(300, at); lp.frequency.linearRampToValueAtTime(1300, at + .7); lp.frequency.linearRampToValueAtTime(800, at + len);
    lp.connect(g);
    const vib = vibrato(at, at + len + .3, 4.6, 7);
    [-4, 4].forEach((d) => vib.connect(osc('sawtooth', freq, at, at + len + .3, lp, d).detune));
    vib.connect(osc('triangle', freq / 2, at, at + len + .3, lp).detune);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(level, at + .6);
    g.gain.linearRampToValueAtTime(level * .85, at + len - .4); g.gain.linearRampToValueAtTime(0, at + len + .3);
  };

  /** A wordless choir on "ah": a crowd of detuned saws shaped by two vowel formants */
  const choir = (freqs: number[], at: number, end: number, points: [number, number][]) => {
    const out = bus(1.3);
    const g = ctx.createGain(); g.connect(out);
    const mix = ctx.createGain(); mix.gain.value = 2.2;
    [[720, 5], [1150, 6], [2600, 8]].forEach(([f, q], i) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const lvl = ctx.createGain(); lvl.gain.value = [1, .7, .25][i];
      mix.connect(bp).connect(lvl).connect(g);
    });
    const vib = vibrato(at, end, 5.1, 9);
    freqs.forEach((f) => [-14, -5, 6, 13].forEach((d) => vib.connect(osc('sawtooth', f, at, end, mix, d).detune)));
    env(g, at, points);
  };

  /** A war drum: a heavy low hit with a skin slap on top */
  const warDrum = (at: number, level: number) => {
    drum(at, level, 50, 1.4);
    noise(at, .12, level * .5, 2600, bus(.7));
  };

  /** Brass-like chord: saws through a filter that opens on the attack */
  const brass = (freqs: number[], at: number, len: number, level: number) => {
    const out = bus(.6);
    const g = ctx.createGain(); g.connect(out);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(200, at); lp.frequency.linearRampToValueAtTime(1500, at + .35); lp.frequency.linearRampToValueAtTime(600, at + len);
    lp.connect(g);
    freqs.forEach((f) => [-6, 5].forEach((d) => osc('sawtooth', f, at, at + len + .1, lp, d)));
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(level, at + .09);
    g.gain.linearRampToValueAtTime(level * .6, at + 1.2); g.gain.linearRampToValueAtTime(0, at + len);
  };

  let started = false;
  return {
    /** Lay the whole cue out on the audio clock, starting now */
    start({ close, settled }: IntroScoreTimes) {
      if (started) return;
      started = true;
      const t = ctx.currentTime + .05;
      const end = settled + 7;
      master.gain.setValueAtTime(0, t); master.gain.linearRampToValueAtTime(volume, t + 1.5);

      // The close-up climbs through four chords: Dm, Bb, Gm, then A, which pulls hard towards the D of the impact
      const c1 = close * .4, c2 = close * .7, x = 1.2;   // chord changes, and the crossfade between them
      const seg = (at: number, to: number, level: number, fadeIn = x): [number, number][] =>
        [[fadeIn, level], [to - at, level], [to - at + x, 0]];
      // The bass walks with the chords, with a low D drone under the opening
      pad([D1, D2], t, t + c1 + x, .32, [140, 240], .3, seg(0, c1, .32, 2.5));
      pad([Bb1, Bb2], t + c1, t + c2 + x, .42, [140, 260], .3, seg(c1, c2, .42));
      pad([G1, G2], t + c2, t + close + x, .44, [150, 280], .3, seg(c2, close, .44));
      pad([A1, A2], t + close, t + settled + .3, .5, [160, 340], .3, [[x, .5], [settled - close, .55], [settled - close + .3, 0]]);
      // Strings, a little fuller with each chord
      pad([D3, F3, A3], t + 1.5, t + c1 + x, .11, [500, 900], .8, seg(1.5, c1, .11, 2.5));
      pad([D3, F3, Bb3, D4], t + c1, t + c2 + x, .17, [700, 1200], .8, seg(c1, c2, .17));
      pad([D3, G3, Bb3, D4], t + c2, t + close + x, .2, [900, 1500], .9, seg(c2, close, .2));
      pad([E3, A3, Cs4, E4], t + close, t + settled + .2, .24, [1100, 2600], 1, [[x, .24], [settled - close - .1, .3], [settled - close + .2, 0]]);
      // A high string line that only arrives once the build begins
      pad([F4, A4], t + c1, t + c2 + x, .05, [1400, 2200], 1.1, seg(c1, c2, .05, 2));
      pad([D4 * 2, G3 * 4], t + c2, t + settled + .2, .06, [1600, 3200], 1.1, [[x, .06], [settled - c2 - .2, .09], [settled - c2 + .2, 0]]);

      // A low horn line over the climb, rising to the leading note before the impact
      horn(D4, t + c1 + .2, c2 - c1 - .3, .09);
      horn(Bb3, t + c2 + .1, close - c2 - .2, .1);
      horn(A3, t + close, (settled - close) * .5, .11);
      horn(Cs4, t + close + (settled - close) * .5, (settled - close) * .5, .13);
      // The choir joins in Gm and swells through the pull-out
      choir([G3, Bb3, D4], t + c2, t + close + x, seg(c2, close, .05, 2.4));
      choir([A3, Cs4, E4], t + close, t + settled + .15, [[x, .08], [settled - close - .1, .14], [settled - close + .15, 0]]);

      // Heartbeats, far away, then war drums gathering as the chords climb
      for (let s = .8; s < c2; s += 2.4) drum(t + s, .32, 52, 1.8);
      for (let s = c2; s < close - .3; s += 1.2) warDrum(t + s, .3);
      // Bells with the glints on the blade
      for (let s = .98; s < close; s += 2.8) bell(t + s, [A4 * 2, D4 * 4, F4 * 2][Math.round(s) % 3], .05);

      // Pull-out: a riser and quickening war drums
      noise(t + close - 1.2, settled - close + 1.2, .24, 300, bus(.9), 5000);
      [0, .9, 1.6, 2.1, 2.5, 2.8, 3.0].forEach((d) => { if (close + d < settled - .05) warDrum(t + close + d, .3 + d * .1); });

      // The sword locks in: a deep boom with a sub drop, a cymbal wash, a metallic ring, and full brass and choir in D major
      drum(t + settled, 1, 46, 3.2);
      warDrum(t + settled, .7);
      const sub = ctx.createGain(); sub.connect(bus(.3));
      const so = osc('sine', 52, t + settled, t + settled + 4, sub);
      so.frequency.setValueAtTime(52, t + settled); so.frequency.exponentialRampToValueAtTime(30, t + settled + 3.5);
      sub.gain.setValueAtTime(0, t + settled); sub.gain.linearRampToValueAtTime(.55, t + settled + .02); sub.gain.exponentialRampToValueAtTime(.0008, t + settled + 4);
      noise(t + settled, 1.4, .45, 2400, bus(1));
      noise(t + settled, 4, .12, 9000, bus(1.4));   // the cymbal's long shimmer
      bell(t + settled + .02, D3, .22);
      brass([D2, A2, D3, Fs3, A3, D4], t + settled + .04, 5, .26);
      choir([D3, Fs3, A3, D4], t + settled + .04, t + end, [[.25, .16], [2.5, .12], [end - settled - .6, 0]]);
      // Under the letters: the horns climb the D major chord, the strings return warmer, and everything fades
      horn(D4, t + settled + .3, 2.2, .1);
      horn(Fs4, t + settled + 2.3, 1.6, .09);
      horn(A4, t + settled + 3.7, 2.4, .08);
      pad([D2, A2], t + settled, t + end, .4, [160, 300], .3, [[.1, .45], [end - settled - 2, .35], [end - settled - .3, 0]]);
      pad([D3, Fs3, A3, D4], t + settled + .6, t + end, .2, [900, 1800], 1, [[2.5, .2], [end - settled - 3, .16], [end - settled - .6, 0]]);
      bell(t + settled + 3.4, A4 * 2, .04);
      bell(t + settled + 4.6, D4 * 2, .035);
    },
    /** Fade out and let go of the audio */
    stop(fadeMs = 1200) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
      window.setTimeout(() => { nodes.forEach((n) => { try { n.stop(); } catch { /* already done */ } }); ctx.close().catch(() => {}); }, fadeMs + 100);
    },
  };
}

/** A decaying burst of stereo noise: a large, dark hall */
function impulse(ctx: AudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp = lp * .55 + (Math.random() * 2 - 1) * .45;   // darker tail
      d[i] = lp * Math.pow(1 - i / len, 2.6);
    }
  }
  return b;
}
