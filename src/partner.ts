/**
 * Practice partner (dev only, not in the published build): a second player for testing a peer-to-peer duel
 * alone. Open /partner.html?room=CODE in another tab or on another computer. It joins the room as the other
 * player through the same multiplayer service the game uses, sends a drawn stand-in face and a hummed
 * "voice" (or this computer's real camera and mic), plays its own moves, and answers takebacks and draws.
 */
import { Chess, type Square } from 'chess.js';
import { multiplayer } from './services/multiplayer';
import { calculateBotMove } from './services/aiBot';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $('log'), stateEl = $('state');
const log = (...parts: unknown[]) => {
  const line = `${new Date().toLocaleTimeString()}  ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}`;
  logEl.textContent += line + '\n';
  logEl.scrollTop = logEl.scrollHeight;
  console.log('[Partner]', ...parts);
};

const params = new URLSearchParams(location.search);
$<HTMLInputElement>('room').value = params.get('room') || '';
if (params.get('name')) $<HTMLInputElement>('name').value = params.get('name')!;

// ---- The stand-in face and voice ------------------------------------------------------------------------

let audio: AudioContext | null = null;
let voiceGain: GainNode | null = null;
let talkUntil = 0;

const makeVoice = () => {
  audio = new AudioContext();
  const out = audio.createMediaStreamDestination();
  const src = audio.createOscillator();
  src.type = 'sawtooth';
  src.frequency.value = 130;
  const vibrato = audio.createOscillator(), vibDepth = audio.createGain();
  vibrato.frequency.value = 5; vibDepth.gain.value = 6;
  vibrato.connect(vibDepth).connect(src.frequency);
  voiceGain = audio.createGain();
  voiceGain.gain.value = 0;
  // Two formant bands make the buzz sound like a muffled voice
  const f1 = audio.createBiquadFilter(), f2 = audio.createBiquadFilter();
  f1.type = f2.type = 'bandpass'; f1.frequency.value = 700; f2.frequency.value = 1200; f1.Q.value = f2.Q.value = 6;
  src.connect(f1).connect(voiceGain); src.connect(f2).connect(voiceGain);
  voiceGain.connect(out);
  src.start(); vibrato.start();
  return out.stream.getAudioTracks()[0];
};

/** A few "syllables" of hummed speech */
const talk = (seconds = 1.6) => {
  if (!audio || !voiceGain) return;
  if (audio.state === 'suspended') audio.resume();
  const t = audio.currentTime, g = voiceGain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0, t);
  for (let s = 0; s < seconds; s += 0.22) {
    g.linearRampToValueAtTime(0.5 + Math.random() * 0.4, t + s + 0.06);
    g.linearRampToValueAtTime(0.04, t + s + 0.19);
  }
  g.linearRampToValueAtTime(0, t + seconds + 0.1);
  talkUntil = performance.now() + seconds * 1000;
};

const makeFace = () => {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 480;
  const g = c.getContext('2d')!;
  const draw = (now: number) => {
    const talking = now < talkUntil, sway = Math.sin(now / 900) * 8;
    g.fillStyle = '#2a1a10'; g.fillRect(0, 0, 640, 480);
    g.fillStyle = '#3d2716'; g.fillRect(0, 300, 640, 180);                 // the room behind
    g.fillStyle = '#5b2b1a';                                               // shoulders
    g.beginPath(); g.ellipse(320 + sway, 500, 210, 150, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#c99a6b';                                               // head
    g.beginPath(); g.ellipse(320 + sway, 220, 92, 112, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b1a0e';                                               // hair, eyes
    g.beginPath(); g.ellipse(320 + sway, 140, 96, 46, 0, Math.PI, 0); g.fill();
    const blink = (now % 4000) < 140 ? 1 : 9;
    g.beginPath(); g.ellipse(288 + sway, 210, 9, blink, 0, 0, Math.PI * 2); g.ellipse(352 + sway, 210, 9, blink, 0, 0, Math.PI * 2); g.fill();
    const mouth = talking ? 4 + Math.abs(Math.sin(now / 70)) * 16 : 3;    // mouth moves while it talks
    g.fillStyle = '#6b2020';
    g.beginPath(); g.ellipse(320 + sway, 280, 26, mouth, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e9dcc0'; g.font = '600 26px Georgia'; g.textAlign = 'center';
    g.fillText($<HTMLInputElement>('name').value || 'Practice Partner', 320, 455);
    g.font = '16px monospace'; g.textAlign = 'right';
    g.fillText(new Date().toLocaleTimeString(), 628, 24);                  // a moving clock proves the video is live
  };
  // A timer, not requestAnimationFrame: a background tab stops animation frames, and the video would freeze
  window.setInterval(() => draw(performance.now()), 1000 / 30);
  return c.captureStream(30).getVideoTracks()[0];
};

// ---- The game --------------------------------------------------------------------------------------------

const chess = new Chess();
let mySide: 'w' | 'b' | 'spectator' | null = null;
let moveTimer = 0;

const maybeMove = () => {
  window.clearTimeout(moveTimer);
  if (!$<HTMLInputElement>('auto').checked || chess.turn() !== mySide || chess.isGameOver()) return;
  moveTimer = window.setTimeout(() => {
    if (chess.turn() !== mySide) return;
    const m = calculateBotMove(chess, 'easy');
    if (!m) return;
    log(`plays ${m.from}-${m.to}`);
    multiplayer.makeMove(m.from as Square, m.to as Square, m.promotion || 'q');
  }, 1400);
};

const showState = () => { stateEl.textContent = `side ${mySide ?? '-'} · turn ${chess.turn()} · ${chess.fen()}`; };
const loadFen = (fen?: string) => { if (fen) { try { chess.load(fen); } catch { /* keep the last good board */ } } showState(); };

const attach = (el: HTMLVideoElement, stream: MediaStream | null) => {
  el.srcObject = stream;
  if (stream) el.play().catch(() => log('the received video needs a click on this page to play with sound'));
};

multiplayer.setCallbacks({
  onConnectionChange: (ok) => log(ok ? 'server connected' : 'server disconnected'),
  onRoomJoined: (d) => { mySide = d.side; log(`joined room ${d.roomId} as ${d.side}, opponent: ${d.opponent?.name ?? 'none yet'}`); loadFen(d.fen); maybeMove(); },
  onPlayerJoined: (o) => { log(`opponent joined: ${o.name}`); talk(); maybeMove(); },
  onPlayerLeft: (s) => log(`opponent (${s}) left`),
  onMoveMade: (d) => { log(`move ${d.move.from}-${d.move.to}${d.isGameOver ? ` · game over: ${d.result}` : ''}`); loadFen(d.fen); maybeMove(); },
  onUndoRequested: (by) => {
    const yes = $<HTMLInputElement>('acceptUndo').checked;
    log(`takeback asked by ${by}: ${yes ? 'accepting' : 'declining'}`);
    window.setTimeout(() => multiplayer.respondUndo(yes), 800);
  },
  onUndoExecuted: (d) => { log('takeback done'); loadFen(d.fen); maybeMove(); },
  onUndoDeclined: () => log('takeback declined'),
  onDrawOffered: (by) => {
    const yes = $<HTMLInputElement>('acceptDraw').checked;
    log(`draw offered by ${by}: ${yes ? 'accepting' : 'declining'}`);
    window.setTimeout(() => multiplayer.respondDraw(yes), 800);
  },
  onDrawDeclined: () => log('draw declined'),
  onGameEnded: (r) => log(`game ended: ${r}`),
  onRematchStarted: (d) => { log('rematch started'); loadFen(d.fen); maybeMove(); },
  onLocalStream: (s) => attach($('mine'), s),
  onRemoteStream: (s) => { log(`receiving ${s ? s.getTracks().map((t) => t.kind).join(' + ') : 'nothing'}`); attach($('theirs'), s); },
  onOpponentMediaState: (d) => log(`opponent mic ${d.micMuted ? 'muted' : 'on'}, camera ${d.videoOff ? 'off' : 'on'}`),
  onError: (m, rec) => { log(`error: ${m}`); if (rec?.fen) loadFen(rec.fen); },
});

// ---- Controls --------------------------------------------------------------------------------------------

$('join').onclick = async () => {
  const room = $<HTMLInputElement>('room').value.trim();
  if (!room) return log('enter the room code from the game first');
  if (!multiplayer.getLocalStream()) {
    if ($<HTMLInputElement>('realcam').checked) {
      log('asking for this computer\'s camera and mic');
      await multiplayer.initLocalMedia();
    } else {
      multiplayer.setLocalStream(new MediaStream([makeFace(), makeVoice()]));
    }
  }
  history.replaceState(null, '', `?room=${encodeURIComponent(room)}`);
  multiplayer.joinRoom(room, $<HTMLInputElement>('name').value || 'Practice Partner', 'random', 'virtual');
};
$('leave').onclick = () => { multiplayer.leaveRoom(); mySide = null; log('left the room'); };
$('mic').onclick = (e) => { const on = multiplayer.toggleMic(); (e.target as HTMLElement).textContent = on ? 'Mute mic' : 'Unmute mic'; log(`mic ${on ? 'on' : 'muted'}`); };
$('cam').onclick = (e) => { const on = multiplayer.toggleCamera(); (e.target as HTMLElement).textContent = on ? 'Camera off' : 'Camera on'; log(`camera ${on ? 'on' : 'off'}`); };
$('hello').onclick = () => talk(2.4);
$('undo').onclick = () => { multiplayer.requestUndo(); log('asked for a takeback'); };
$('draw').onclick = () => { multiplayer.offerDraw(); log('offered a draw'); };
$('resign').onclick = () => { multiplayer.resign(); log('resigned'); };
$('rematch').onclick = () => { multiplayer.requestRematch(); log('asked for a rematch'); };
$<HTMLInputElement>('auto').onchange = maybeMove;

// Talks now and then during the game, so the voice can be checked without pressing anything
window.setInterval(() => { if (mySide && Math.random() < 0.35) talk(); }, 9000);

// Connection health, for testing: what the call is doing and whether media is arriving
let lastIn = 0;
window.setInterval(async () => {
  const pc: RTCPeerConnection | null = (multiplayer as any).pc;
  if (!pc) return;
  let videoIn = 0, audioIn = 0, frames = 0;
  (await pc.getStats()).forEach((r: any) => {
    if (r.type === 'inbound-rtp' && r.kind === 'video') { videoIn += r.bytesReceived || 0; frames = r.framesDecoded || 0; }
    if (r.type === 'inbound-rtp' && r.kind === 'audio') audioIn += r.bytesReceived || 0;
  });
  const flowing = videoIn > lastIn;
  lastIn = videoIn;
  showState();
  stateEl.textContent += `\ncall ${pc.connectionState} · video in ${(videoIn / 1024).toFixed(0)} KB (${frames} frames${flowing ? ', live' : ''}) · audio in ${(audioIn / 1024).toFixed(0)} KB`;
}, 2000);

if (params.get('room') && params.get('autojoin') !== '0') $('join').click();
