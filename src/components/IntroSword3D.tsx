import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * The intro's sword as a real 3D model: polished steel blade with engraved, gold-lit glyphs,
 * engraved in Hindi and English ("wars are won by strategy"),
 * a forked gold cross-guard set with rubies, a red leather grip wrapped in gold wire, a faceted pommel, and a gold flare
 * with drifting dust where the blade leaves the guard.
 *
 * Units are logo pixels (the logo is 1476 x 433). World x = logoX - 640 (the T's centre),
 * world y = GUARD_LOGO_Y - logoY, so the guard lies on the T's bar and the blade fills its stem.
 */
const GUARD_LOGO_Y = 86;

// The shot (ms from the click): a close look along the blade, then the camera pulls back until the sword stands in the T
export const CLOSE_MS = 12000;
export const PULL_MS = 3200;
export const SETTLED_MS = CLOSE_MS + PULL_MS;
const FOV = 30;

const BLADE_HALF = 15;          // half width incl. the bevelled edge
const BEVEL = 5.5;
const BLADE_TOP = -4, BLADE_POINT_START = -300, BLADE_TIP = -344;

// Small deterministic random, so the engraving is the same every time
const rand = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** Engraving for the blade: colour, bump and glow maps drawn on canvases */
function bladeMaps() {
  const W = 256, H = 2304;
  const RES = 2;   // drawn at twice the size: the camera reads the engraving up close
  const mk = () => { const c = document.createElement('canvas'); c.width = W * RES; c.height = H * RES; const x = c.getContext('2d')!; x.scale(RES, RES); return [c, x] as const; };
  const [colC, col] = mk(), [bumpC, bump] = mk(), [glowC, glow] = mk();

  // Base metal: warm gold near the guard, cooling to bright steel towards the point
  const g = col.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f0c060'); g.addColorStop(.22, '#e0aa50'); g.addColorStop(.42, '#bfa77c');
  g.addColorStop(.62, '#aeb4bc'); g.addColorStop(1, '#e6eaee');
  col.fillStyle = g; col.fillRect(0, 0, W, H);
  bump.fillStyle = '#808080'; bump.fillRect(0, 0, W, H);
  glow.fillStyle = '#000'; glow.fillRect(0, 0, W, H);

  // Fine brushed lines along the blade
  const r = rand(7);
  for (let i = 0; i < 260; i++) {
    const x = r() * W;
    col.strokeStyle = `rgba(${r() < .5 ? '255,255,255' : '40,30,20'}, ${.04 + r() * .05})`;
    col.lineWidth = .6; col.beginPath(); col.moveTo(x, 0); col.lineTo(x + (r() - .5) * 6, H); col.stroke();
  }

  // Everything engraved is drawn three times: dark in colour, deep in bump, bright in glow
  const cut = (draw: (c: CanvasRenderingContext2D) => void, glowAlpha: number) => {
    col.save(); col.strokeStyle = col.fillStyle = 'rgba(28, 18, 6, .95)'; draw(col); col.restore();
    bump.save(); bump.strokeStyle = bump.fillStyle = '#1a1a1a'; draw(bump); bump.restore();
    if (glowAlpha > .02) { glow.save(); glow.strokeStyle = glow.fillStyle = `rgba(255, 196, 92, ${glowAlpha})`; draw(glow); glow.restore(); }
  };
  // Glow fades from the guard down the blade, like the reference
  const glowAt = (y: number) => Math.max(0, 1 - y / (H * .5)) ** 1.1;

  // Inner border lines down both sides
  const IN = 46, cx = W / 2;
  // They run straight down to where the blade starts to narrow (canvas y ~2010), then follow the taper
  // inwards and meet in a point well inside the edges, so nothing runs off the cut
  const border = (inset: number, top: number, meet: number, width: number, glowA: number) => cut((c) => {
    c.lineWidth = width; c.lineJoin = 'round'; c.beginPath();
    c.moveTo(inset, top); c.lineTo(inset, 1985);
    c.quadraticCurveTo(inset + 6, meet - 90, cx, meet);
    c.quadraticCurveTo(W - inset - 6, meet - 90, W - inset, 1985);
    c.lineTo(W - inset, top); c.stroke();
  }, glowA);
  border(IN, 40, 2200, 3, .5);
  border(IN + 10, 60, 2165, 1.4, .35);

  // Panels between the borders: runes, the inscription and knot work, separated by bars
  const rune = (c: CanvasRenderingContext2D, x: number, y: number, s: number, rr: () => number) => {
    c.lineWidth = s * .13; c.lineCap = 'round';
    const k = Math.floor(rr() * 6);
    c.beginPath();
    if (k === 0) { c.moveTo(x - s * .3, y - s * .5); c.lineTo(x - s * .3, y + s * .5); c.arc(x, y + s * .1, s * .3, Math.PI, 0); }
    else if (k === 1) { c.arc(x, y, s * .38, 0, Math.PI * 2); c.moveTo(x, y - s * .55); c.lineTo(x, y + s * .55); }
    else if (k === 2) { c.moveTo(x - s * .4, y - s * .4); c.quadraticCurveTo(x + s * .5, y - s * .1, x - s * .2, y + s * .5); c.moveTo(x + s * .25, y - s * .5); c.lineTo(x + s * .25, y + s * .2); }
    else if (k === 3) { c.moveTo(x - s * .4, y + s * .4); c.lineTo(x, y - s * .5); c.lineTo(x + s * .4, y + s * .4); c.moveTo(x - s * .2, y + s * .05); c.lineTo(x + s * .2, y + s * .05); }
    else if (k === 4) { c.arc(x - s * .12, y - s * .15, s * .22, Math.PI * .5, Math.PI * 2.2); c.moveTo(x + s * .1, y + s * .1); c.bezierCurveTo(x + s * .5, y + s * .3, x - s * .3, y + s * .6, x - s * .35, y + s * .35); }
    else { c.moveTo(x, y - s * .5); c.lineTo(x, y + s * .5); c.moveTo(x - s * .35, y - s * .2); c.lineTo(x + s * .35, y - s * .35); c.moveTo(x - s * .35, y + s * .25); c.lineTo(x + s * .35, y + s * .1); }
    c.stroke();
    if (rr() < .4) { c.beginPath(); c.arc(x + s * .38, y - s * .4, s * .07, 0, Math.PI * 2); c.fill(); }
  };
  const rr = rand(31);
  const bar = (y: number, ga: number) => cut((c) => { c.fillRect(IN + 14, y, W - 2 * IN - 28, 4); c.fillRect(IN + 22, y + 9, W - 2 * IN - 44, 2); }, ga * .7);
  const runeRows = (y: number, rows: number) => {
    for (let i = 0; i < rows; i++) {
      const sa = rr(), sb = rr(), sc = rr();
      cut((c) => { rune(c, cx - 36, y + 22 + i * 40, 34, rand(Math.floor(sa * 1e6) + 1)); rune(c, cx, y + 22 + i * 40, 34, rand(Math.floor(sb * 1e6) + 1)); rune(c, cx + 36, y + 22 + i * 40, 34, rand(Math.floor(sc * 1e6) + 1)); }, glowAt(y));
    }
  };
  // Two lines written down the blade. Rotated a quarter turn, so the first line sits on the +x side:
  // the close-up turns the camera the same way, and the words read left to right on screen
  const inscribe = (top: number, len: number, lines: string[], font: string, spacing: string) => {
    const ga = Math.max(.6, glowAt(top + len / 2));
    lines.forEach((line, i) => cut((c) => {
      c.save(); c.translate(lines.length === 1 ? cx + 4 : i === 0 ? cx + 31 : cx - 31, top + len / 2); c.rotate(Math.PI / 2);
      c.font = font; c.letterSpacing = spacing; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(line, 0, 0, len - 20); c.restore();
    }, ga));
  };

  bar(48, glowAt(48)); runeRows(62, 2);
  bar(158, glowAt(158));
  inscribe(176, 730, ['युद्ध रणनीति से जीते जाते हैं'], "400 68px 'Tiro Devanagari Hindi', 'Noto Serif Devanagari', 'Kohinoor Devanagari', serif", '2px');
  bar(912, .6);
  inscribe(932, 990, ['WARS ARE WON BY STRATEGY'], "700 50px 'Cinzel', serif", '6px');
  bar(1930, .3);   // the taper below stays clean, so the point reads as one smooth sweep
  // A small diamond where the borders meet
  cut((c) => { c.beginPath(); c.moveTo(cx, 2080); c.lineTo(cx + 9, 2100); c.lineTo(cx, 2120); c.lineTo(cx - 9, 2100); c.closePath(); c.fill(); }, .3);

  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: tex(colC, true), bumpMap: tex(bumpC, false), emissiveMap: tex(glowC, true) };
}

/** Engraved scrollwork for the gold parts */
function filigreeMap() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#202020'; x.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    x.beginPath();
    for (let t = 0; t <= 256; t += 4) x.lineTo(t, 32 + i * 64 + Math.sin(t / 20) * 14);
    x.stroke();
    for (let t = 0; t < 256; t += 40) { x.beginPath(); x.arc(t + 10, 32 + i * 64 + Math.sin((t + 10) / 20) * 14, 7, 0, Math.PI * 1.6); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Give an extruded shape UVs that run 0..1 across its outline */
function planarUV(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox();
  const b = geo.boundingBox!, pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - b.min.x) / (b.max.x - b.min.x);
    uv[i * 2 + 1] = (pos.getY(i) - b.min.y) / (b.max.y - b.min.y);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** A four-pointed star of light, for the glint on the edge: a pin-point core, a soft halo, and hair-thin rays
 *  that fade fast from the centre, like light catching a polished edge through a camera lens */
function starTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  x.translate(S / 2, S / 2);
  x.globalCompositeOperation = 'lighter';
  const halo = x.createRadialGradient(0, 0, 0, 0, 0, 46);
  halo.addColorStop(0, 'rgba(255,230,180,.55)'); halo.addColorStop(.35, 'rgba(255,200,120,.16)'); halo.addColorStop(1, 'rgba(255,170,80,0)');
  x.fillStyle = halo; x.fillRect(-S / 2, -S / 2, S, S);
  const core = x.createRadialGradient(0, 0, 0, 0, 0, 9);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(.5, 'rgba(255,248,225,.7)'); core.addColorStop(1, 'rgba(255,225,170,0)');
  x.fillStyle = core; x.fillRect(-12, -12, 24, 24);
  // Rays: a hot hairline with a faint wider glow around it, both dying away quickly from the centre
  const ray = (len: number, a: number, strength: number) => {
    x.save(); x.rotate(a);
    for (const [w, k] of [[5, .18], [1.1, 1]] as const) {
      const g = x.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, `rgba(255,252,240,${strength * k})`); g.addColorStop(.12, `rgba(255,236,200,${strength * k * .55})`);
      g.addColorStop(.4, `rgba(255,214,150,${strength * k * .18})`); g.addColorStop(1, 'rgba(255,200,130,0)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(0, -w); x.lineTo(len, 0); x.lineTo(0, w); x.closePath(); x.fill();
    }
    x.restore();
  };
  for (let i = 0; i < 4; i++) ray(126, i * Math.PI / 2, 1);
  for (let i = 0; i < 4; i++) ray(58, Math.PI / 4 + i * Math.PI / 2, .45);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** An anamorphic streak: a thin, hot horizontal line with a soft falloff above and below */
function streakTexture() {
  const W = 512, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const img = x.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = Math.abs(i / (W - 1) * 2 - 1), v = Math.abs(j / (H - 1) * 2 - 1);
    const along = Math.pow(1 - u, 2.2) * .7 + Math.exp(-u * 9) * .3;
    const across = Math.exp(-v * v * 60) + Math.exp(-v * v * 8) * .18;
    const a = Math.min(1, along * across), o = (j * W + i) * 4;
    // white-hot in the middle, warming to gold towards the ends
    img.data[o] = 255; img.data[o + 1] = 205 + 45 * (1 - u); img.data[o + 2] = 130 + 110 * (1 - u) ** 3; img.data[o + 3] = a * 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Embers for the close-up, like sparks drifting off a forge past the camera. They live in a box of air that
 *  follows the reading point (uCenter) but stay fixed in the world, so the camera tracks past them with real
 *  parallax; they rise towards the top of the screen (uUp), flare in white-hot, cool through gold and orange to
 *  red, flicker, and smear into a short streak the way sparks do on film. Near the lens they go soft and big */
const EMBER_VERT = `
  attribute float seed;
  uniform float uTime, uScale;
  uniform vec2 uPx;
  uniform vec3 uCenter, uUp;
  varying float vLife, vFlick, vSoft, vR, vHalf;
  varying vec2 vDir;
  const float SPAN = 150.;   // how much blade the box of air covers, along the blade
  vec3 emberPos(float s, float time, out float life) {
    life = fract(time * (.1 + fract(s * 3.7) * .1) + s * 7.31);
    vec3 side = normalize(cross(uUp, vec3(0., 0., 1.)));
    float along = (fract(s * 12.9) - .5) * SPAN;
    float start = -50. + fract(s * 13.7) * 30.;                 // below the frame, so they rise into it
    float z = -30. + pow(fract(s * 77.1), .8) * 100.;            // behind the blade to right up at the lens
    float rise = life * (55. + fract(s * 5.3) * 60.);
    float drift = (fract(s * 2.9) - .5) * 24. * life + sin(time * 1.6 + s * 9. + life * 9.) * 4. * life;
    vec3 p = uUp * (start + rise) + side * (along + drift) + vec3(0., 0., z + cos(time * 1.2 + s * 5.) * 3. * life);
    // keep the box centred on the reading point along the blade, wrapping embers that fall far behind
    float a = dot(p, side) - dot(uCenter, side);
    p += side * (mod(a + SPAN * .5, SPAN) - SPAN * .5 - a);
    return p;
  }
  vec2 toPx(vec3 p) { vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.); return c.xy / c.w * uPx; }
  void main() {
    float s = seed, life, lifeBefore;
    vec3 p = emberPos(s, uTime, life);
    vec3 before = emberPos(s, uTime - .035, lifeBefore);   // about a film shutter's worth of motion
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    gl_Position = projectionMatrix * mv;
    float big = step(.93, fract(s * 17.3));
    float size = mix(mix(.24, .6, fract(s * 5.1)), 1.4, big) * (1. - life * .35);
    float px = clamp(size * uScale / max(1., -mv.z), 3.5, 90.);
    vec2 d = toPx(p) - toPx(before);
    float len = lifeBefore < life ? min(length(d), 50.) : 0.;
    vDir = len > .01 ? normalize(d) : vec2(0., 1.);
    gl_PointSize = px + len;
    vR = .5 * px / gl_PointSize;
    vHalf = .5 * len / gl_PointSize;
    vSoft = clamp((px - 18.) / 30., 0., 1.) * .9 + big * .1;
    vLife = life;
    vFlick = .6 + .4 * sin(uTime * (10. + fract(s * 11.) * 16.) + s * 50.) * sin(uTime * 3.3 + s * 20.);
  }`;
const EMBER_FRAG = `
  uniform float uOpacity;
  varying float vLife, vFlick, vSoft, vR, vHalf;
  varying vec2 vDir;
  void main() {
    vec2 q = gl_PointCoord - .5; q.y = -q.y;
    float along = dot(q, vDir), across = dot(q, vec2(-vDir.y, vDir.x));
    // distance from the streak's centre line, in units of the spark's radius
    float d = length(vec2(max(abs(along) - vHalf, 0.), across)) / vR;
    if (d > 1.6) discard;
    float sharp = exp(-d * d * 5.) * 1.7 + exp(-d * d * 1.2) * .5;
    float soft = (1. - smoothstep(.6, 1., d)) * .3;   // out of focus near the lens
    float shape = mix(sharp, soft, vSoft);
    vec3 hot = vec3(1., .97, .85), gold = vec3(1., .72, .3), orange = vec3(1., .42, .1), red = vec3(.7, .14, .04);
    vec3 col = vLife < .25 ? mix(hot, gold, vLife / .25) : vLife < .6 ? mix(gold, orange, (vLife - .25) / .35) : mix(orange, red, (vLife - .6) / .4);
    float a = smoothstep(0., .06, vLife) * (1. - smoothstep(.6, 1., vLife)) * vFlick * shape * uOpacity;
    gl_FragColor = vec4(col * a, min(1., a));
  }`;

function glowTexture(stops: [number, string][]) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, s]) => g.addColorStop(o, s));
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Red leather: deep crimson with grain and the dark seams of a diagonal wrap */
function leatherMap() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, '#3e0408'); g.addColorStop(.5, '#6e0a10'); g.addColorStop(1, '#3e0408');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const r = rand(5);
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = r() < .5 ? `rgba(0,0,0,${r() * .18})` : `rgba(255,120,110,${r() * .07})`;
    x.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  // Wrap seams: slanted dark grooves with a lit edge
  for (let k = -8; k < 16; k++) {
    const y = k * 24;
    x.strokeStyle = 'rgba(20,0,2,.85)'; x.lineWidth = 3.5;
    x.beginPath(); x.moveTo(0, y); x.lineTo(256, y + 64); x.stroke();
    x.strokeStyle = 'rgba(255,140,130,.1)'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(0, y + 4); x.lineTo(256, y + 68); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function buildSword() {
  const sword = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T) => { disposables.push(d); return d; };

  // ---- Blade: a flat shape with chamfered edges, engraved and lit from within near the guard
  const inner = BLADE_HALF - BEVEL;
  const s = new THREE.Shape();
  s.moveTo(-inner, BLADE_TOP); s.lineTo(inner, BLADE_TOP); s.lineTo(inner - .6, BLADE_POINT_START);
  // The point: one smooth sweep from each edge, easing in to a fine rounded tip (a sharp corner here makes the
  // bevelled edge fold and facet)
  const tipY = BLADE_TIP + BEVEL;
  s.bezierCurveTo(inner - .6, BLADE_POINT_START - 20, 2.4, tipY + 10, 0, tipY);
  s.bezierCurveTo(-2.4, tipY + 10, -inner + .6, BLADE_POINT_START - 20, -inner + .6, BLADE_POINT_START); s.closePath();
  const bladeGeo = keep(new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: true, bevelThickness: 2.6, bevelSize: BEVEL, bevelSegments: 1, curveSegments: 48 }));
  bladeGeo.translate(0, 0, -.5);
  planarUV(bladeGeo);
  const maps = bladeMaps();
  Object.values(maps).forEach((t) => keep(t));
  const bladeMat = keep(new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 1, roughness: .2, ...maps, bumpScale: 2.6,
    emissive: new THREE.Color('#ffae40'), emissiveIntensity: 2.4, clearcoat: .45, clearcoatRoughness: .12, envMapIntensity: 1.25,
    anisotropy: .35, anisotropyRotation: Math.PI / 2,   // brushed along the blade: highlights stretch into long streaks
  }));
  sword.add(new THREE.Mesh(bladeGeo, bladeMat));

  // ---- Gold
  const fil = keep(filigreeMap());
  const gold = keep(new THREE.MeshPhysicalMaterial({ color: '#d9b066', metalness: 1, roughness: .24, bumpMap: fil, bumpScale: 1.1, clearcoat: .5, clearcoatRoughness: .2, envMapIntensity: 1.5 }));
  const goldPlain = keep(new THREE.MeshPhysicalMaterial({ color: '#e2bb72', metalness: 1, roughness: .18, clearcoat: .6, envMapIntensity: 1.6 }));
  const guardFil = keep(fil.clone()); guardFil.repeat.set(5, 1); guardFil.needsUpdate = true;
  const guardGold = keep(gold.clone()); guardGold.bumpMap = guardFil; guardGold.bumpScale = 1.6;
  const ruby = keep(new THREE.MeshPhysicalMaterial({ color: '#b0101c', metalness: 0, roughness: .06, clearcoat: 1, clearcoatRoughness: .03,
    emissive: new THREE.Color('#5a0006'), emissiveIntensity: .6, envMapIntensity: 2.2, iridescence: .15 }));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(keep(geo), mat); m.position.set(x, y, z); sword.add(m); return m;
  };

  // Cross-guard: arms that slim from the centre, then flare into forked, curling ends
  const gs = new THREE.Shape();
  const A = 98, T0 = 5.2, T1 = 3.4;
  gs.moveTo(-18, T0);
  gs.lineTo(18, T0); gs.quadraticCurveTo(50, T1, A - 14, T1);
  gs.quadraticCurveTo(A - 6, T1 + .5, A + 1, T1 + 7.5); gs.quadraticCurveTo(A - 3, T1 + 2, A - 6, 0);
  gs.quadraticCurveTo(A - 3, -T1 - 2, A + 1, -T1 - 7.5); gs.quadraticCurveTo(A - 6, -T1 - .5, A - 14, -T1);
  gs.quadraticCurveTo(50, -T1, 18, -T0); gs.lineTo(-18, -T0); gs.quadraticCurveTo(-50, -T1, -A + 14, -T1);
  gs.quadraticCurveTo(-A + 6, -T1 - .5, -A - 1, -T1 - 7.5); gs.quadraticCurveTo(-A + 3, -T1 - 2, -A + 6, 0);
  gs.quadraticCurveTo(-A + 3, T1 + 2, -A - 1, T1 + 7.5); gs.quadraticCurveTo(-A + 6, T1 + .5, -A + 14, T1);
  gs.quadraticCurveTo(-50, T1, -18, T0);
  const guardGeo = new THREE.ExtrudeGeometry(gs, { depth: 5, bevelEnabled: true, bevelThickness: 1.8, bevelSize: 1.5, bevelSegments: 5, curveSegments: 24 });
  guardGeo.translate(0, 0, -2.5);
  planarUV(guardGeo);
  add(guardGeo, guardGold);
  for (const sx of [-1, 1]) {
    // A polished rib down the face of each arm, front and back
    for (const sz of [-1, 1]) {
      const rib = add(new THREE.CapsuleGeometry(.9, 52, 4, 12), goldPlain, sx * 52, 0, sz * 4.4);
      rib.rotation.z = Math.PI / 2;
    }
    // Moulded collars where the arm meets the forks, and beads leading out from the centre
    for (const off of [78, 82.5]) {
      const ring = add(new THREE.CylinderGeometry(5.6, 5.6, 2, 20), goldPlain, sx * off, 0, 0);
      ring.rotation.z = Math.PI / 2; ring.scale.set(1, 1, 1.25);
    }
    for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(1.5 - i * .25, 14, 10), goldPlain, sx * (24 + i * 5), 0, 4.6);
    // Ball finials on the fork tips
    for (const sy of [-1, 1]) add(new THREE.SphereGeometry(1.9, 14, 10), goldPlain, sx * (A + .5), sy * (T1 + 7.2), 0);
  }

  // Centre block, with a langet running down onto the blade, set with a ruby on each face
  const cs = new THREE.Shape();
  cs.moveTo(-15, 10); cs.quadraticCurveTo(0, 13, 15, 10); cs.quadraticCurveTo(21, 6, 21, 0); cs.quadraticCurveTo(20, -7, 15, -9);
  cs.lineTo(7, -12); cs.quadraticCurveTo(3, -18, 0, -26); cs.quadraticCurveTo(-3, -18, -7, -12); cs.lineTo(-15, -9);
  cs.quadraticCurveTo(-20, -7, -21, 0); cs.quadraticCurveTo(-21, 6, -15, 10);
  const centreGeo = new THREE.ExtrudeGeometry(cs, { depth: 9, bevelEnabled: true, bevelThickness: 2.2, bevelSize: 1.8, bevelSegments: 5, curveSegments: 20 });
  centreGeo.translate(0, 0, -4.5);
  planarUV(centreGeo);
  add(centreGeo, gold);
  for (const sz of [-1, 1]) {
    const bezel = add(new THREE.TorusGeometry(5.4, 1.1, 10, 32), goldPlain, 0, 0, sz * 6.9);
    bezel.scale.set(1, 1.15, 1);
    const stone = add(new THREE.SphereGeometry(5, 32, 20), ruby, 0, 0, sz * 6.6);
    stone.scale.set(.95, 1.1, .5);
    const drop = add(new THREE.SphereGeometry(2.2, 20, 14), ruby, 0, -16, sz * 6.2);
    drop.scale.set(.8, 1.2, .45);
    // Tiny gold beads round the main stone
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      add(new THREE.SphereGeometry(.7, 8, 6), goldPlain, Math.cos(a) * 8, Math.sin(a) * 9, sz * 6.4);
    }
  }

  // ---- Grip: red leather, cord-wrapped, between gold fittings
  const P = (r: number, y: number) => new THREE.Vector2(r, y);
  const lathe = (pts: THREE.Vector2[], mat: THREE.Material, seg = 32) => add(new THREE.LatheGeometry(pts, seg), mat);
  const leatherTex = keep(leatherMap());
  leatherTex.repeat.set(2, 1);
  const leather = keep(new THREE.MeshPhysicalMaterial({
    color: '#ffffff', map: leatherTex, bumpMap: leatherTex, bumpScale: 1.8, metalness: 0, roughness: .55,
    sheen: .35, sheenColor: new THREE.Color('#b8342c'), sheenRoughness: .5, clearcoat: .25, clearcoatRoughness: .5,
  }));
  // Leather, swelling slightly in each half of the grip
  lathe([P(5.9, 17), P(6.4, 26), P(6.6, 38), P(6.4, 50), P(5.9, 59)], leather);
  lathe([P(5.9, 73), P(6.4, 82), P(6.6, 94), P(6.4, 105), P(5.9, 113)], leather);
  // Fine gold wire spiralling round the leather
  for (const [y0, y1] of [[17, 59], [73, 113]]) {
    const pts: THREE.Vector3[] = [];
    const turns = (y1 - y0) / 10;
    for (let i = 0; i <= 240; i++) {
      const t = i / 240, a = t * turns * Math.PI * 2, y = y0 + t * (y1 - y0);
      const r = 6.25 + Math.sin(t * Math.PI) * .55;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 480, .42, 6), goldPlain);
  }
  // Gold fittings: the lower collar, the middle ring, the upper collar, each with beaded mouldings
  lathe([P(0, 8), P(9.5, 8), P(10, 10), P(9, 11.5), P(9.6, 13), P(8, 15.5), P(7, 16.5), P(6.6, 18), P(0, 18)], gold);
  lathe([P(0, 58), P(6.6, 58), P(7.6, 59.5), P(9.4, 61), P(9.8, 62.5), P(9, 63.5), P(10.8, 66), P(9, 68.5), P(9.8, 69.5), P(9.4, 71), P(7.6, 72.5), P(6.6, 74), P(0, 74)], gold);
  lathe([P(0, 112), P(6.6, 112), P(8, 114), P(9.2, 116), P(8.6, 118), P(9.4, 120), P(7.4, 123), P(0, 123)], gold);
  // Studs on the middle ring, four round it
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const stud = add(new THREE.ConeGeometry(2.1, 6.5, 12), goldPlain, Math.cos(a) * 12.5, 66, Math.sin(a) * 12.5);
    stud.lookAt(new THREE.Vector3(Math.cos(a) * 40, 66, Math.sin(a) * 40)); stud.rotateX(Math.PI / 2);
  }

  // ---- Pommel: a faceted gold head on a moulded neck, a small ruby on each face, a bead on top
  lathe([P(0, 122), P(7.6, 122), P(8.6, 124), P(6.4, 126.5), P(7.2, 128), P(0, 128)], goldPlain);
  const pommelGeo = new THREE.LatheGeometry([
    P(0, 127.5), P(6.5, 127.5), P(9.5, 131), P(13.4, 143), P(13.8, 151), P(9.5, 161), P(6, 165), P(0, 166),
  ], 8);
  pommelGeo.rotateY(Math.PI / 8);
  const pommelMat = keep(goldPlain.clone()); pommelMat.flatShading = true;   // crisp facets, like a cut stone
  add(pommelGeo, pommelMat);
  for (const sz of [-1, 1]) {
    const gem = add(new THREE.SphereGeometry(3.2, 24, 16), ruby, 0, 147, sz * 12.4);
    gem.scale.set(.85, 1.15, .45);
    const ring = add(new THREE.TorusGeometry(3.6, .6, 8, 24), goldPlain, 0, 147, sz * 12.6);
    ring.scale.set(.9, 1.25, 1);
  }
  add(new THREE.SphereGeometry(2.6, 18, 12), goldPlain, 0, 167.5, 0);
  add(new THREE.ConeGeometry(1.3, 4.5, 12), goldPlain, 0, 171.5, 0);

  return { sword, bladeMat, disposables };
}

// The pull-out: leaves rest at once (no dead start), peaks a third of the way, then a long soft landing in the T
const pullEase = (p: number) => 1 - Math.pow(1 - p, 3) * (1 + 3 * p);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
// The close-up: up the blade from near the point, past the ruby, to the grip. Camera positions and where it looks
// The close-up reads the inscription: the camera is turned a quarter so the blade lies across the screen,
// and it tracks from the guard towards the point, Hindi first, then English
const READ_FROM = -14, READ_TO = -290;
// Past CLOSE_MS the track glides on from the speed it ended on and coasts to rest (DRIFT_MS), so the pull-out
// takes over a moving camera instead of one that stops dead or snaps back
const DRIFT_MS = 900;
const READ_CURVE = 1.35;   // >1: slow at the start, quicker by the end
const closePose = (ms: number, pos: THREE.Vector3, aim: THREE.Vector3) => {
  // An unhurried start that lets the Hindi be read (about 5 s on it), gathering speed through the English
  const k = ms / CLOSE_MS;
  const u = k < 1 ? Math.pow(k, READ_CURVE) : 1 + READ_CURVE * (DRIFT_MS / CLOSE_MS) * (1 - Math.exp(-(ms - CLOSE_MS) / DRIFT_MS));
  const y = READ_FROM + (READ_TO - READ_FROM) * u;
  aim.set(0, y, 0);
  pos.set(Math.sin(ms / 2900) * 16, y + 26, 104 + Math.sin(ms / 3700) * 8);
};
const closeTurn = (ms: number) => Math.sin(ms / 1000 * .45) * .14;
const closeRoll = (ms: number) => Math.PI / 2 + Math.sin(ms / 3100) * .04;
const sway = (ms: number) => Math.sin(((ms - SETTLED_MS) / 1000) * .42) * .3;   // the slow turn once it stands in the T

/**
 * Full-screen 3D layer. Starts its shot when `playing` turns true and ends with the sword drawn
 * exactly over the T of `logoRef` (measured every frame, so it follows any resize).
 */
export const IntroSword3D: React.FC<{
  playing: boolean; logoRef: React.RefObject<HTMLDivElement | null>; onStart?: () => void;
  onSettled?: (frame: HTMLCanvasElement, layer: DOMRect) => void;   // called once, just after a frame of the sword at rest in the T is drawn
  className?: string;
}> = ({ playing, logoRef, onStart, onSettled, className }) => {
  const mount = useRef<HTMLDivElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
    host.appendChild(renderer.domElement);
    host.style.opacity = '0';

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, .04).texture;
    scene.environment = env;

    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 6000);
    const aim = new THREE.Vector3();

    // Warm key from the upper left, a cool rim from the right, and a low raking light that travels with the camera
    scene.add(new THREE.AmbientLight('#3a2a18', .6));
    const key = new THREE.DirectionalLight('#ffe2b0', 2.2); key.position.set(-120, 160, 220); scene.add(key);
    const rim = new THREE.DirectionalLight('#b8c8ff', 1.1); rim.position.set(160, -40, 120); scene.add(rim);
    const sweep = new THREE.PointLight('#ffe6b8', 900, 160, 1.6); scene.add(sweep);
    // The shine: a hot, close light that slides along the blade, with a star of light where it catches the edge
    const glint = new THREE.PointLight('#fff4dc', 0, 70, 2); scene.add(glint);
    const starTex = starTexture();
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    scene.add(star);

    // Build once the inscription's fonts have loaded, or the canvas would engrave a fallback face
    let built: ReturnType<typeof buildSword> | null = null;
    let alive = true;
    const fonts = ["400 68px 'Tiro Devanagari Hindi'", "700 50px 'Cinzel'"].map((f) => document.fonts?.load(f, 'युद्ध WARS').catch(() => []));
    Promise.race([Promise.all(fonts), new Promise((r) => setTimeout(r, 2500))]).then(() => {
      if (!alive) return;
      built = buildSword();
      scene.add(built.sword);
    });

    // Flare where the blade meets the guard, a horizontal streak through it, and gold dust
    const flareTex = glowTexture([[0, 'rgba(255,248,225,1)'], [.12, 'rgba(255,214,130,.9)'], [.35, 'rgba(240,160,60,.32)'], [1, 'rgba(200,110,30,0)']]);
    const sprite = (opacity: number) => new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    const streakTex = streakTexture();
    const streakSprite = (opacity: number) => new THREE.Sprite(new THREE.SpriteMaterial({ map: streakTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    const flare = sprite(1), streak = streakSprite(.85), flare2 = sprite(.55), streak2 = streakSprite(.5);
    flare.position.set(2, -26, 20); streak.position.copy(flare.position);
    flare2.position.set(-2, -70, 20); flare2.scale.set(34, 34, 1);
    streak2.position.copy(flare2.position); streak2.scale.set(110, 8, 1);
    scene.add(flare, streak, flare2, streak2);

    const EMBERS = 110;
    const emberSeed = new Float32Array(EMBERS);
    const rr = rand(99);
    for (let i = 0; i < EMBERS; i++) emberSeed[i] = rr();
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3));   // placed in the shader
    dustGeo.setAttribute('seed', new THREE.BufferAttribute(emberSeed, 1));
    const dustMat = new THREE.ShaderMaterial({
      vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uPx: { value: new THREE.Vector2(1, 1) }, uOpacity: { value: 1 },
        uCenter: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3(0, 1, 0) } },
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    const embers = new THREE.Points(dustGeo, dustMat);
    embers.frustumCulled = false;
    scene.add(embers);

    let W = 1, H = 1;
    const resize = () => {
      W = host.clientWidth || 1; H = host.clientHeight || 1;
      renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();

    // Where the camera must stand for the sword to cover the T exactly
    const finalPose = () => {
      const logo = logoRef.current;
      if (!logo) return { pos: V(0, -60, 1600), aim: V(0, -60, 0) };
      const r = logo.getBoundingClientRect(), h = host.getBoundingClientRect();
      const k = r.width / 1476;                         // screen px per logo px
      const gx = r.left - h.left + 640 * k, gy = r.top - h.top + GUARD_LOGO_Y * k;
      const dist = (H / k) / (2 * Math.tan((FOV / 2) * Math.PI / 180));
      const cx = (W / 2 - gx) / k, cy = (gy - H / 2) / k;
      return { pos: V(cx, cy, dist), aim: V(cx, cy, 0) };
    };
    const closePos = new THREE.Vector3(), closeAim = new THREE.Vector3();
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let raf = 0, started = 0, settled = false;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!playingRef.current || !built) return;
      if (!started) { started = now; onStartRef.current?.(); }   // the score starts with the shot
      const { sword, bladeMat } = built;
      const ms = still ? SETTLED_MS : now - started;
      const t = (now - t0) / 1000;

      // Fade up from black
      host.style.opacity = String(Math.min(1, ms / 900));

      const end = finalPose();
      let turn: number, roll: number, glintOn = 0;
      if (ms < CLOSE_MS) {
        // A slow climb up the engraved blade, the sword turning gently so reflections drift across it
        closePose(ms, camera.position, aim);
        turn = closeTurn(ms);
        roll = closeRoll(ms);
        sweep.position.set(aim.x + Math.sin(ms / 1400) * 60, aim.y + 40, 34);
        sweep.intensity = 260;
        renderer.toneMappingExposure = .74;
        bladeMat.envMapIntensity = .55;   // darker reflections up close, so the steel keeps its contrast
        glintOn = 1;
      } else {
        const p = Math.min(1, (ms - CLOSE_MS) / PULL_MS), e = pullEase(p);
        // The close-up's drift keeps running underneath and is blended away, so the hand-off has no pause
        closePose(ms, closePos, closeAim);
        camera.position.copy(closePos).lerp(end.pos, e);
        // The gaze lags the dolly: the camera backs away still reading the blade, then lifts to the T
        aim.copy(closeAim).lerp(end.aim, pullEase(Math.max(0, (p - .15) / .85)));
        turn = closeTurn(ms) * (1 - e) + sway(ms) * e;
        // Turns upright a beat after the camera starts back, so the moves overlap instead of all firing at once
        roll = closeRoll(ms) * (1 - pullEase(Math.max(0, (p - .1) / .9)));
        // Once it stands in the T, the light keeps sliding down the blade so the metal stays alive
        const s = ms - SETTLED_MS;
        sweep.position.set(30, s > 0 ? 20 - ((s / 1000 * 70) % 420) : 20, 40)
          .lerp(V(closeAim.x + Math.sin(ms / 1400) * 60, closeAim.y + 40, 34), 1 - e);
        sweep.intensity = 900 - 380 * (1 - e);
        renderer.toneMappingExposure = .74 + .41 * e;
        bladeMat.envMapIntensity = .55 + .7 * e;
        glintOn = Math.max(0, 1 - p * 2);
      }
      sword.rotation.y = turn;
      // A breath of movement in the hand, never enough to leave the T
      sword.rotation.z = ms > CLOSE_MS ? Math.sin(t * .37) * .006 * pullEase(Math.min(1, (ms - CLOSE_MS) / PULL_MS)) : 0;
      camera.up.set(Math.sin(roll), Math.cos(roll), 0);

      // The shine runs up the blade every few seconds, ahead of the camera
      const g = ((ms / 2800) % 1);
      const gy = aim.y - 60 + g * 130;
      glint.position.set(Math.sin(ms / 900) * 26, gy, 26);
      glint.intensity = glintOn * 520 * Math.sin(g * Math.PI);
      const side = Math.sin(ms / 900) > 0 ? 1 : -1;
      star.position.set(side * (BLADE_HALF - 1) * Math.cos(turn), gy, 6);
      const twinkle = glintOn * Math.max(0, Math.sin(g * Math.PI * 2 - .6)) ** 7;
      (star.material as THREE.SpriteMaterial).opacity = Math.min(1, twinkle * 1.3);
      star.scale.setScalar(10 + twinkle * 38);
      (star.material as THREE.SpriteMaterial).rotation = .12 + Math.sin(ms / 2600) * .06;
      camera.lookAt(aim);

      bladeMat.emissiveIntensity = 2.2 + Math.sin(t * 2.1) * .35;
      const pulse = 1 + Math.sin(t * 3.3) * .045 + Math.sin(t * 7.7 + 1.3) * .025 + Math.sin(t * 13.1) * .012;
      // The guard's flare waits for the pull-out, so it does not flood the close-up
      const flareOn = ms < CLOSE_MS ? .12 : Math.min(1, .12 + (ms - CLOSE_MS) / PULL_MS);
      [flare, streak, flare2, streak2].forEach((sp, i) => { sp.material.opacity = flareOn * [1, .85, .55, .5][i]; });
      flare.scale.set(70 * pulse, 70 * pulse, 1);
      streak.scale.set(190 * pulse, 12, 1);
      // Embers belong to the close-up only: they drift past while it reads the blade and clear as it pulls out
      const emberOn = ms < CLOSE_MS ? Math.min(1, ms / 1500) : 1 - Math.min(1, (ms - CLOSE_MS) / (PULL_MS * .4));
      embers.visible = emberOn > 0;
      if (ms < CLOSE_MS) { closePose(ms, closePos, closeAim); dustMat.uniforms.uCenter.value.copy(closeAim); }
      dustMat.uniforms.uUp.value.set(Math.sin(closeRoll(Math.min(ms, CLOSE_MS))), Math.cos(closeRoll(Math.min(ms, CLOSE_MS))), 0);
      dustMat.uniforms.uTime.value = t;
      dustMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      dustMat.uniforms.uPx.value.set(renderer.domElement.width / 2, renderer.domElement.height / 2);
      dustMat.uniforms.uOpacity.value = 1.6 * emberOn;

      renderer.render(scene, camera);
      // Read in the same frame it was drawn, before the browser clears the buffer
      if (!settled && ms >= SETTLED_MS + 800) { settled = true; onSettledRef.current?.(renderer.domElement, host.getBoundingClientRect()); }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      alive = false;
      built?.disposables.forEach((d) => d.dispose());
      [flare, streak, flare2, streak2].forEach((sp) => sp.material.dispose());
      flareTex.dispose(); streakTex.dispose(); starTex.dispose(); star.material.dispose(); dustGeo.dispose(); dustMat.dispose();
      env.dispose(); pmrem.dispose(); room.dispose?.();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [logoRef]);

  return <div ref={mount} className={className} aria-hidden="true" />;
};
