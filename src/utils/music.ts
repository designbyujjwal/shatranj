/**
 * Background Music Service — "Background Documentary" by leberch (Pixabay Content License)
 *
 * A quiet ambient bed under the landing page, the book and the invite: low enough to be hardly noticed.
 * It fades in slowly, fades at each loop so the restart is not heard, and is silent on the board.
 */
import { assetUrl } from './assetUrl';

const TRACK_URL = assetUrl('music/background-documentary.mp3');

const STORAGE_KEY_VOLUME = 'shatranj_bg_music_user_volume';
const STORAGE_KEY_MUTED = 'shatranj_ambient_music_is_muted';

// Ambient level: in the background, hardly noticeable
const LANDING_VOLUME = 0.06;
const LANDING_PLAYBACK_RATE = 1.0;

// Chessboard Scene Settings: 20% overall reduction (0.078 -> 0.062, ~61% lower than landing)
const BOARD_VOLUME = 0.062;
const BOARD_PLAYBACK_RATE = 0.93;

const TRANSITION_DURATION_MS = 1200; // Smooth 1.2s ramp between landing and board
const FADE_IN_MS = 4500;             // the first start creeps in
const LOOP_FADE_S = 3;               // fade out the last and in the first seconds of each loop

export interface MusicState {
  isPlaying: boolean;
  isMuted: boolean;
  userVolume: number; // 0.0 to 1.0
  effectiveVolume: number;
  isOnBoard: boolean;
}

type MusicStateCallback = (state: MusicState) => void;

class RoyalBattleMusic {
  private audio: HTMLAudioElement | null = null;
  public isMuted: boolean = false;
  private userVolume: number = 0.8; // Default 80%
  private isOnBoard: boolean = false;
  private animationFrameId: number | null = null;
  private subscribers: Set<MusicStateCallback> = new Set();
  private unlockCleanup: (() => void) | null = null;
  private sounding = false;  // play() has resolved: the track is really playing (paused turns false before that)
  private fadeInEnds = 0;   // while the first fade-in runs, other ramps must not cut it short

  constructor() {
    if (typeof window !== 'undefined') {
      // Load persisted settings
      try {
        const savedVol = localStorage.getItem(STORAGE_KEY_VOLUME);
        if (savedVol !== null) {
          const parsed = parseFloat(savedVol);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            this.userVolume = parsed;
          }
        }
        const savedMuted = localStorage.getItem(STORAGE_KEY_MUTED);
        if (savedMuted !== null) {
          this.isMuted = savedMuted === 'true';
        }
      } catch {}

      this.initAudioElement();
      this.setupActivationListeners();
    }
  }

  private initAudioElement(): HTMLAudioElement {
    if (this.audio) return this.audio;

    const existing = document.getElementById('shatranj-bg-music') as HTMLAudioElement | null;
    this.audio = existing || new Audio(TRACK_URL);
    this.audio.id = 'shatranj-bg-music';
    this.audio.src = TRACK_URL;
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.audio.volume = this.targetVolume;
    this.audio.playbackRate = this.targetRate;
    this.audio.muted = this.isMuted;

    // Attach lifecycle listeners to notify subscribers
    this.audio.addEventListener('play', () => this.notifySubscribers());
    this.audio.addEventListener('pause', () => { this.sounding = false; this.notifySubscribers(); });
    this.audio.addEventListener('volumechange', () => this.notifySubscribers());
    this.audio.addEventListener('playing', () => this.notifySubscribers());
    this.audio.addEventListener('timeupdate', () => this.fadeAtLoopEdges());

    // Immediate playback attempt on creation
    this.tryPlay();

    return this.audio;
  }

  private get targetVolume(): number {
    if (this.isMuted || this.userVolume === 0 || this.isOnBoard) return 0;   // no music on the board
    const base = this.isOnBoard ? BOARD_VOLUME : LANDING_VOLUME;
    // Scale calibrated base volume by user volume slider (0.8 = 1.0x calibrated level)
    const scaled = base * (this.userVolume / 0.8);
    return Math.max(0, Math.min(1, scaled));
  }

  private fadeIn() {
    this.fadeInEnds = performance.now() + FADE_IN_MS;
    this.rampToTargets(FADE_IN_MS);
  }

  /** Soften the end and the start of the track so the loop point is not heard */
  private fadeAtLoopEdges() {
    const a = this.audio;
    if (!a || a.paused || this.animationFrameId !== null || !isFinite(a.duration)) return;
    const edge = Math.min(a.currentTime, a.duration - a.currentTime);
    a.volume = this.targetVolume * Math.max(0, Math.min(1, edge / LOOP_FADE_S));
  }

  private get targetRate(): number {
    return this.isOnBoard ? BOARD_PLAYBACK_RATE : LANDING_PLAYBACK_RATE;
  }

  public getState(): MusicState {
    const isPlaying = !this.isMuted && this.userVolume > 0 && !!this.audio && !this.audio.paused && (this.audio.volume > 0);
    return {
      isPlaying,
      isMuted: this.isMuted || this.userVolume === 0,
      userVolume: this.userVolume,
      effectiveVolume: this.audio ? this.audio.volume : this.targetVolume,
      isOnBoard: this.isOnBoard,
    };
  }

  public isPlaying(): boolean {
    return this.getState().isPlaying;
  }

  public getUserVolume(): number {
    return this.userVolume;
  }

  public setUserVolume(vol: number) {
    const clamped = Math.max(0, Math.min(1, vol));
    this.userVolume = clamped;

    try {
      localStorage.setItem(STORAGE_KEY_VOLUME, clamped.toFixed(3));
    } catch {}

    if (clamped === 0) {
      this.isMuted = true;
    } else if (this.isMuted) {
      this.isMuted = false;
      if (this.audio) {
        this.audio.muted = false;
        this.audio.play().catch(() => {});
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY_MUTED, this.isMuted ? 'true' : 'false');
    } catch {}

    if (this.audio) {
      this.audio.volume = this.targetVolume;
    }

    this.notifySubscribers();
  }

  public subscribe(cb: MusicStateCallback): () => void {
    this.subscribers.add(cb);
    cb(this.getState());
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notifySubscribers() {
    const state = this.getState();
    this.subscribers.forEach((cb) => cb(state));
  }

  /**
   * Listen for user activation events (pointerdown, keydown, touchstart, click)
   * to immediately start/unmute playback if browser security blocked autoplay on load.
   */
  private setupActivationListeners() {
    const activationEvents = [
      'pointerdown',
      'keydown',
      'touchstart',
      'click',
    ] as const;

    const onActivation = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('#onboarding-music-toggle-btn') ||
        target?.closest('#header-mute-button') ||
        target?.closest('.music-volume-control')
      ) {
        return;
      }

      if (this.isMuted || this.userVolume === 0 || this.isOnBoard) return;

      if (this.audio && (this.audio.paused || this.audio.volume === 0)) {
        this.audio.muted = false;
        this.audio.volume = 0;
        this.audio.playbackRate = this.targetRate;
        this.audio.play().then(() => {
          if (!this.sounding) { this.sounding = true; this.fadeIn(); }
          this.removeActivationListeners();
          this.notifySubscribers();
        }).catch(() => {});
      }
    };

    activationEvents.forEach((evt) => {
      window.addEventListener(evt, onActivation, { passive: true, capture: true });
    });

    this.unlockCleanup = () => {
      activationEvents.forEach((evt) => {
        window.removeEventListener(evt, onActivation, true);
      });
      this.unlockCleanup = null;
    };
  }

  private removeActivationListeners() {
    if (this.unlockCleanup) {
      this.unlockCleanup();
    }
  }

  private tryPlay() {
    if (!this.audio) return;
    if (this.isMuted || this.userVolume === 0 || this.isOnBoard) return;

    this.audio.muted = false;
    const wasSilent = !this.sounding;
    if (wasSilent) this.audio.volume = 0;
    this.audio.playbackRate = this.targetRate;

    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          if (wasSilent && !this.sounding) { this.sounding = true; this.fadeIn(); }
          this.notifySubscribers();
        })
        .catch(() => {
          this.notifySubscribers();
        });
    }
  }

  /**
   * Smoothly interpolate audio volume and playback rate towards their target values.
   */
  private rampToTargets(durationMs = TRANSITION_DURATION_MS) {
    if (!this.audio) return;
    // Not playing yet (the track is still loading): stay silent so the first start can fade in
    if (!this.sounding && this.targetVolume > 0) return;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const startVolume = this.audio.volume;
    const endVolume = this.targetVolume;
    const startRate = this.audio.playbackRate;
    const endRate = this.targetRate;

    const startTime = performance.now();

    const step = (now: number) => {
      if (!this.audio) return;
      const elapsed = now - startTime;
      const progress = Math.max(0, Math.min(1.0, elapsed / durationMs));   // a frame stamped before the ramp began must not overshoot

      // Smooth ease-in-out curve
      const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      this.audio.volume = Math.max(0, Math.min(1, startVolume + (endVolume - startVolume) * ease));
      this.audio.playbackRate = Math.max(0.25, Math.min(2.0, startRate + (endRate - startRate) * ease));

      if (progress < 1.0) {
        this.animationFrameId = requestAnimationFrame(step);
      } else {
        this.audio.volume = endVolume;
        this.audio.playbackRate = endRate;
        this.animationFrameId = null;
        if (endVolume === 0) {
          this.audio.pause();
        }
        this.notifySubscribers();
      }
    };

    this.animationFrameId = requestAnimationFrame(step);
  }

  /**
   * Start music immediately upon landing page mount.
   */
  public start() {
    this.initAudioElement();
    if (this.audio) {
      if (this.userVolume === 0) {
        this.userVolume = 0.8;
      }
      this.isMuted = false;
      this.audio.muted = false;
      this.audio.volume = this.targetVolume;
      this.audio.playbackRate = this.targetRate;
    }
    this.tryPlay();
  }

  /**
   * Update active scene: landing/menu vs chessboard.
   * Smoothly transitions playbackRate and volume.
   */
  public setInBoardScene(inBoard: boolean) {
    this.isOnBoard = inBoard;
    this.initAudioElement();
    if (!this.isMuted && this.userVolume > 0) {
      this.tryPlay();
    }
    // Leaving for the board fades out at once; otherwise let a running fade-in finish at its own pace
    const fadeInLeft = this.fadeInEnds - performance.now();
    this.rampToTargets(!inBoard && fadeInLeft > 0 ? fadeInLeft : TRANSITION_DURATION_MS);
  }

  /**
   * Mute or unmute the background music in sync with the global sound toggle.
   */
  public setMuted(muted: boolean) {
    this.isMuted = muted;
    try {
      localStorage.setItem(STORAGE_KEY_MUTED, muted ? 'true' : 'false');
    } catch {}

    this.initAudioElement();

    if (muted) {
      this.rampToTargets(250);
    } else {
      if (this.userVolume === 0) {
        this.userVolume = 0.8;
      }
      if (this.audio) this.audio.muted = false;
      if (this.sounding) this.rampToTargets(350);
      else this.tryPlay();   // fades in once it really plays
    }
  }

  /**
   * Toggle playback state directly as a true latching toggle.
   */
  public toggle(): boolean {
    this.initAudioElement();

    if (this.isPlaying()) {
      this.setMuted(true);
      return false;
    } else {
      this.setMuted(false);
      if (this.audio) {
        this.audio.muted = false;
        this.audio.volume = this.targetVolume;
        this.audio.playbackRate = this.targetRate;
        this.audio.play().catch(() => {});
      }
      this.rampToTargets(300);
      this.removeActivationListeners();
      return true;
    }
  }
}

export const royalBattleMusic = new RoyalBattleMusic();
