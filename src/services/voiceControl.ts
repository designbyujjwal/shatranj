import type { Square, PieceSymbol } from 'chess.js';
import { Chess } from 'chess.js';
import { soundEffects } from '../utils/audio';

export interface VoiceMoveMatch {
  from: Square;
  to: Square;
  san: string;
  piece: PieceSymbol;
  color: 'w' | 'b';
}

export type VoiceCommandHandler = (cmd: string, param?: string) => void;
export type VoiceMoveHandler = (from: Square, to: Square, san: string, description?: string) => void;
export type VoiceFeedbackType = 'success' | 'warning' | 'error' | 'info' | 'question';
export type VoiceFeedbackHandler = (message: string, type: VoiceFeedbackType) => void;
export type VoiceTranscriptHandler = (interim: string, final: string) => void;

// SpeechRecognition type declarations for browser environments
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

/** A repeat of the phrase just played within this window is taken as "you didn't hear me", not a new move. */
const QUEUE_REPEAT_WINDOW_MS = 8000;
/** The player's own move animates for up to ~0.6 s before the turn passes. */
const MOVE_IN_FLIGHT_MS = 900;
/** How long a half-heard command ("Bishop…", "…to F3", "which knight?") waits for the missing part. */
const PIECE_FRAGMENT_MS = 12000;   // long enough to hear the spoken question, think, and answer it

/** The player's own English (en-IN, en-GB…) is recognised better than a fixed en-US. */
const speechLang = () => {
  const langs = typeof navigator !== 'undefined' ? [...(navigator.languages || []), navigator.language] : [];
  return langs.find((l) => /^en(-|$)/i.test(l || '')) || 'en-US';
};

class VoiceControlService {
  private recognition: any | null = null;
  private isListening = false;
  private isStarting = false;
  private isSupported = false;
  private voiceFeedbackEnabled = true;
  private shouldBeActive = false;
  private isFirstActivation = true;
  private restartTimer: any = null;
  private watchdogTimer: any = null;
  private startRequestedAt = 0;
  private consecutiveErrors = 0;
  private lastAudioEventTime = 0;
  private isSelfSpeaking = false;
  private selfSpeakSafetyTimer: any = null;
  private boundGetLegalMoves: (() => ReturnType<Chess['moves']> | null) | null = null;

  private onMoveCallback: VoiceMoveHandler | null = null;
  private onCommandCallback: VoiceCommandHandler | null = null;
  private onFeedbackCallback: VoiceFeedbackHandler | null = null;
  private onTranscriptCallback: VoiceTranscriptHandler | null = null;
  private onListeningChangeCallback: ((isListening: boolean) => void) | null = null;

  public lastSpokenText = '';
  private lastExecutedMoveTime = 0;
  private lastExecutedMoveSan = '';
  private lastExecutedText = '';

  // Acting on interim speech: Chrome can take a second or more to mark a phrase final, so a move
  // that has resolved and stayed unchanged for INTERIM_SETTLE_MS is played without waiting.
  private static readonly INTERIM_SETTLE_MS = 400;
  private handledResultIndex = -1;   // utterances before this index (in the current session) have been acted on
  private handledText = '';          // …and this much of the utterance at handledResultIndex
  private interimTimer: any = null;
  private interimCandidate: { index: number; san: string } | null = null;

  // A move spoken during the opponent's turn waits here and is played once it is the player's turn
  private static readonly QUEUE_TTL_MS = 10000;
  private pendingCommand: { text: string; alternatives: string[]; at: number } | null = null;
  private pendingTimer: any = null;
  private moveInFlightUntil = 0;   // the player's own move is animating; ignore repeats of it

  private lastSpokenFeedback = '';
  private isInCheck: () => boolean = () => false;
  private pieceFragment: { text: string; at: number } | null = null;   // "Bishop" said on its own, waiting for its square
  private squareFragment: { square: string; at: number } | null = null; // asked "Which piece to F3?", waiting for the piece
  private choiceFragment: { moves: any[]; at: number } | null = null;   // asked "Which knight: B1 or F3?", waiting for one of them
  private proposal: { move: any; at: number } | null = null;           // asked "Did you mean King to E2?", waiting for yes or no
  private speakToken = 0;

  constructor() {
    this.checkSupport();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.shouldBeActive) {
          if (!this.recognition && !this.isStarting) {
            this.createAndStartRecognition();
          }
        }
      });
    }
  }

  public checkSupport(): boolean {
    if (typeof window !== 'undefined') {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.isSupported = !!SpeechRec;
    }
    return this.isSupported;
  }

  public getIsSupported(): boolean {
    return this.isSupported;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public setVoiceFeedbackEnabled(enabled: boolean) {
    this.voiceFeedbackEnabled = enabled;
  }

  public getVoiceFeedbackEnabled(): boolean {
    return this.voiceFeedbackEnabled;
  }

  public setLegalMovesProvider(provider: () => ReturnType<Chess['moves']> | null) {
    this.boundGetLegalMoves = provider;
  }

  /** Lets refusals explain themselves when the player is in check. */
  public setInCheckProvider(provider: () => boolean) {
    this.isInCheck = provider;
  }

  public setCallbacks(handlers: {
    onMove?: VoiceMoveHandler;
    onCommand?: VoiceCommandHandler;
    onFeedback?: VoiceFeedbackHandler;
    onTranscript?: VoiceTranscriptHandler;
    onListeningChange?: (isListening: boolean) => void;
  }) {
    if (handlers.onMove) this.onMoveCallback = handlers.onMove;
    if (handlers.onCommand) this.onCommandCallback = handlers.onCommand;
    if (handlers.onFeedback) this.onFeedbackCallback = handlers.onFeedback;
    if (handlers.onTranscript) this.onTranscriptCallback = handlers.onTranscript;
    if (handlers.onListeningChange) this.onListeningChangeCallback = handlers.onListeningChange;
  }

  public startListening(getLegalChessMoves?: () => ReturnType<Chess['moves']> | null): boolean {
    if (!this.checkSupport()) {
      this.triggerFeedback('Speech Recognition is not supported in this browser.', 'error');
      return false;
    }

    this.shouldBeActive = true;
    if (getLegalChessMoves) {
      this.boundGetLegalMoves = getLegalChessMoves;
    }

    if (this.isFirstActivation) {
      this.triggerFeedback('Microphone listening. Say your move (e.g. "Bishop to C4" or "Queen to F4")', 'info');
      this.isFirstActivation = false;
    }

    this.startWatchdog();
    this.createAndStartRecognition();
    return true;
  }

  /**
   * Watchdog verifies that speech recognition stays online.
   * Crucially, it does NOT abort an active session during moments of user contemplation.
   */
  private startWatchdog() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);

    this.watchdogTimer = setInterval(() => {
      if (!this.shouldBeActive) return;

      // A start that never confirmed (Chrome occasionally drops it): clear it so a fresh one can begin
      if (this.isStarting && Date.now() - this.startRequestedAt > 5000) {
        this.isStarting = false;
        this.recycleRecognition();
        return;
      }

      // A session that has gone silent for long may have died without telling us: recycle it (a ~0.1 s gap)
      if (this.isListening && this.recognition && Date.now() - this.lastAudioEventTime > 30000) {
        this.recycleRecognition();
        return;
      }

      // Only attempt to start if not currently running and no restart is pending
      if (!this.recognition && !this.restartTimer && !this.isStarting) {
        this.createAndStartRecognition();
      }
    }, 2000);
  }

  /** Ends the current session; its onend handler starts a fresh one. */
  private recycleRecognition() {
    const rec = this.recognition;
    if (!rec) return;
    try { rec.abort(); } catch {
      this.recognition = null;
      this.isListening = false;
    }
  }

  private async micPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
    try {
      const status = await (navigator as any).permissions?.query({ name: 'microphone' });
      return status?.state ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private createAndStartRecognition() {
    if (!this.shouldBeActive || this.isStarting) return;
    // Starting while the page is in the background fails; the visibility handler resumes on return
    if (typeof document !== 'undefined' && document.hidden) return;

    // If an instance is already alive and running, do not tear it down
    if (this.recognition && this.isListening) {
      return;
    }

    // Safely cleanup old dead reference if any
    if (this.recognition) {
      try {
        const oldRec = this.recognition;
        this.recognition = null;
        oldRec.onstart = null;
        oldRec.onaudiostart = null;
        oldRec.onsoundstart = null;
        oldRec.onspeechstart = null;
        oldRec.onspeechend = null;
        oldRec.onaudioend = null;
        oldRec.onresult = null;
        oldRec.onerror = null;
        oldRec.onend = null;
        oldRec.abort();
      } catch {}
    }

    try {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) return;

      this.isStarting = true;
      this.startRequestedAt = Date.now();
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = speechLang();
      rec.maxAlternatives = 5;

      const recordActivity = () => {
        this.lastAudioEventTime = Date.now();
      };

      rec.onstart = () => {
        recordActivity();
        this.handledResultIndex = -1;   // result indices restart with every session
        this.handledText = '';
        this.interimCandidate = null;
        this.clearInterimTimer();
        this.isStarting = false;
        this.consecutiveErrors = 0;
        this.isListening = true;
        this.onListeningChangeCallback?.(true);
      };

      rec.onaudiostart = recordActivity;
      rec.onsoundstart = recordActivity;
      rec.onspeechstart = recordActivity;
      rec.onspeechend = recordActivity;
      rec.onaudioend = recordActivity;

      rec.onresult = (event: any) => {
        recordActivity();
        this.consecutiveErrors = 0;

        let interim = '';
        let finalStr = '';

        // Each result is one utterance. Results stay in event.results for the whole session,
        // so an utterance already acted on (from its interim text) is skipped when its final arrives.
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (!res) continue;
          const text: string = (res[0]?.transcript || '').trim();
          const alternatives: string[] = [];
          for (let k = 0; k < res.length; k++) {
            const altText = res[k]?.transcript?.trim();
            if (altText && !alternatives.includes(altText)) alternatives.push(altText);
          }

          if (res.isFinal) finalStr += text + ' ';
          else interim += text + ' ';

          if (!text || i < this.handledResultIndex) continue;

          // An utterance already acted on can keep growing when the player says a second command
          // without pausing; only the new words after the handled part count
          let command = text;
          let commandAlternatives = alternatives;
          if (i === this.handledResultIndex) {
            const done = this.speechKey(this.handledText);
            const now = this.speechKey(text);
            if (!now.startsWith(done)) continue;   // the same words, revised by the recognizer
            command = this.textAfterKey(text, done);
            commandAlternatives = [];
            if (!command) continue;
          }

          // Echo protection: drop only what sounds like the herald's own words, so the player can talk over it
          if (this.isSelfSpeaking && this.isEchoOfFeedback(command)) continue;
          if (this.isSelfSpeaking && typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
            window.speechSynthesis.cancel();   // barge-in: the player is speaking, stop talking
            this.isSelfSpeaking = false;
          }

          this.rememberHeardPiece(command);

          if (res.isFinal) {
            this.markHandled(i, text);
            this.clearInterimTimer();
            this.processSpokenText(command, this.boundGetLegalMoves || (() => null), commandAlternatives);
          } else {
            this.considerInterim(i, text, command, commandAlternatives);
          }
        }

        // Live visual transcript preview in the HUD
        this.onTranscriptCallback?.(interim.trim(), finalStr.trim());
      };

      rec.onerror = (event: any) => {
        recordActivity();
        this.isStarting = false;

        // Normal browser timeouts: no-speech and aborted are expected, non-fatal events
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }

        // Chrome also reports "not-allowed" when a restart happens while the page is in the background.
        // Only give up when the permission itself is denied; otherwise keep retrying (and resume on return).
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.consecutiveErrors = Math.min(10, this.consecutiveErrors + 1);
          this.micPermissionState().then((state) => {
            if (state === 'denied' || (state === 'unknown' && this.consecutiveErrors >= 3 && !document.hidden)) {
              this.triggerFeedback('Microphone permission denied. Please allow microphone access in browser settings.', 'error');
              this.stopListening();
            }
          });
          return;
        }

        // The mic can be busy for a moment (a call, another app): retry, and only stop if it never comes back
        if (event.error === 'audio-capture') {
          this.consecutiveErrors = Math.min(10, this.consecutiveErrors + 1);
          if (this.consecutiveErrors === 3) {
            this.triggerFeedback('Microphone unavailable. Check that it is connected and not used by another app.', 'error');
          }
          if (this.consecutiveErrors >= 10) this.stopListening();
          return;
        }
        if (event.error === 'network') {
          this.consecutiveErrors = Math.min(10, this.consecutiveErrors + 1);
          if (this.consecutiveErrors === 3) {
            this.triggerFeedback("This browser can't reach its speech service. Voice works best in Google Chrome.", 'error');
          }
          return;
        }

        this.consecutiveErrors = Math.min(10, this.consecutiveErrors + 1);
      };

      rec.onend = () => {
        recordActivity();
        this.recognition = null;
        this.isListening = false;
        this.isStarting = false;

        if (!this.shouldBeActive) {
          this.onListeningChangeCallback?.(false);
          return;
        }

        // When the browser engine ends continuous recognition (e.g. after long silence),
        // restart smoothly after a short breather
        clearTimeout(this.restartTimer);
        const delay = this.consecutiveErrors > 3 ? Math.min(1000, 200 + this.consecutiveErrors * 100) : 100;

        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          if (this.shouldBeActive) {
            this.createAndStartRecognition();
          }
        }, delay);
      };

      this.recognition = rec;
      this.lastAudioEventTime = Date.now();
      rec.start();
    } catch (err) {
      this.recognition = null;
      this.isListening = false;
      this.isStarting = false;
      if (this.shouldBeActive) {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          if (this.shouldBeActive) {
            this.createAndStartRecognition();
          }
        }, 300);
      }
    }
  }

  /**
   * An unfinished (interim) phrase that already names a legal move is played once it has stayed
   * the same for INTERIM_SETTLE_MS, instead of waiting for the browser to mark it final.
   * Every newer interim re-arms the wait, so a phrase still being spoken is never acted on.
   */
  private considerInterim(index: number, fullText: string, command: string, alternatives: string[]) {
    this.clearInterimTimer();
    this.interimCandidate = null;
    const legalMoves = this.boundGetLegalMoves?.();
    if (!legalMoves || legalMoves.length === 0) return;   // not our turn: the final result gets queued
    if (Date.now() < this.moveInFlightUntil) return;
    if (this.choiceFragment) return;   // the answer to "which one?" waits for the final words
    if (this.isSystemCommand(command.toLowerCase())) return;  // undo/restart/camera wait for the final result

    const joined = this.withPieceFragment(command, alternatives, false);
    const resolution = this.tryResolveMoveFromCandidates([joined.text, ...joined.alternatives], legalMoves);
    if (!resolution.move) return;
    const san = resolution.move.san;
    const handledBefore = this.handledText;
    this.interimCandidate = { index, san };
    this.interimTimer = setTimeout(() => {
      this.interimTimer = null;
      const c = this.interimCandidate;
      // skip if a newer interim replaced it, or the utterance was acted on meanwhile
      if (!c || c.index !== index || c.san !== san) return;
      if (index < this.handledResultIndex || (index === this.handledResultIndex && this.handledText !== handledBefore)) return;
      this.markHandled(index, fullText);
      this.interimCandidate = null;
      this.processSpokenText(command, this.boundGetLegalMoves || (() => null), alternatives);
    }, VoiceControlService.INTERIM_SETTLE_MS);
  }

  /** A piece heard on its own, even in unfinished speech, is kept for the square that follows. */
  private rememberHeardPiece(text: string) {
    const p = this.extractMoveTokens(this.normalizeChessSpeech(text));
    if (p.piece && !p.targetSquare && !p.fromSquare) {
      this.pieceFragment = { text: this.pieceFullName(p.piece), at: Date.now() };
    }
  }

  private markHandled(index: number, fullText: string) {
    if (index !== this.handledResultIndex) this.handledText = '';
    this.handledResultIndex = index;
    this.handledText = fullText;
  }

  /** Letters and digits only, for comparing a transcript with its later revisions. */
  private speechKey(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /** The part of `text` after its first `key.length` letters and digits ("e 4" and "e4" both count as two). */
  private textAfterKey(text: string, key: string): string {
    let seen = 0;
    for (let i = 0; i < text.length; i++) {
      if (seen >= key.length) return text.slice(i).trim();
      if (/[a-z0-9]/i.test(text[i])) seen++;
    }
    return '';
  }

  private clearInterimTimer() {
    if (this.interimTimer) {
      clearTimeout(this.interimTimer);
      this.interimTimer = null;
    }
  }

  private isSystemCommand(text: string): boolean {
    return /\b(undo|take ?back|go back|step back|previous move|restart|new game|reset game|start over|play again|camera|view)\b/.test(text);
  }

  /** Holds a move spoken during the opponent's turn and plays it as soon as the turn comes back. */
  private queueCommand(text: string, alternatives: string[]) {
    this.pendingCommand = { text, alternatives, at: Date.now() };
    this.triggerFeedback(`Got it: "${text}". Playing it on your turn.`, 'info', false);
    if (this.pendingTimer) return;
    this.pendingTimer = setInterval(() => {
      const p = this.pendingCommand;
      if (!p || Date.now() - p.at > VoiceControlService.QUEUE_TTL_MS || !this.shouldBeActive) {
        this.pendingCommand = null;
        clearInterval(this.pendingTimer);
        this.pendingTimer = null;
        return;
      }
      const legal = this.boundGetLegalMoves?.();
      if (!legal || legal.length === 0 || Date.now() < this.moveInFlightUntil) return;
      this.pendingCommand = null;
      clearInterval(this.pendingTimer);
      this.pendingTimer = null;
      this.processSpokenText(p.text, this.boundGetLegalMoves || (() => null), p.alternatives);
    }, 150);
  }

  /** True when a transcript is mostly the words the herald just said aloud (the mic hearing the speakers). */
  private isEchoOfFeedback(text: string): boolean {
    const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const heard = words(text);
    if (!heard.length || !this.lastSpokenFeedback) return false;
    const said = new Set(words(this.lastSpokenFeedback));
    const overlap = heard.filter((w) => said.has(w)).length;
    return overlap / heard.length >= 0.6;
  }

  public stopListening() {
    this.clearInterimTimer();
    this.interimCandidate = null;
    this.pendingCommand = null;
    this.proposal = null;
    if (this.pendingTimer) {
      clearInterval(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.shouldBeActive = false;
    this.isListening = false;
    this.isStarting = false;
    this.isFirstActivation = true;
    this.consecutiveErrors = 0;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.selfSpeakSafetyTimer) {
      clearTimeout(this.selfSpeakSafetyTimer);
      this.selfSpeakSafetyTimer = null;
    }

    if (this.recognition) {
      try {
        const oldRec = this.recognition;
        this.recognition = null;
        oldRec.onstart = null;
        oldRec.onaudiostart = null;
        oldRec.onsoundstart = null;
        oldRec.onspeechstart = null;
        oldRec.onspeechend = null;
        oldRec.onaudioend = null;
        oldRec.onresult = null;
        oldRec.onerror = null;
        oldRec.onend = null;
        oldRec.abort();
      } catch {}
    }

    this.onListeningChangeCallback?.(false);
  }

  public toggleListening(getLegalChessMoves?: () => ReturnType<Chess['moves']> | null): boolean {
    if (this.isListening || this.shouldBeActive) {
      this.stopListening();
      this.triggerFeedback('Voice control paused.', 'info');
      return false;
    } else {
      return this.startListening(getLegalChessMoves);
    }
  }

  /**
   * Process and resolve spoken phrase with multi-candidate homophone and fuzzy matching
   */
  public processSpokenText(
    spokenText: string,
    getLegalChessMoves: () => ReturnType<Chess['moves']> | null,
    spokenAlternatives: string[] = []
  ) {
    // A yes or no to the question just asked ("Did you mean King to E2?")
    const reply = this.hasOpenQuestion() ? this.yesOrNo(spokenText) : null;
    if (reply) {
      const proposal = this.proposal;
      this.proposal = null;
      if (reply.answer === 'yes') {
        const legalMoves = getLegalChessMoves ? getLegalChessMoves() : null;
        const move = proposal && legalMoves?.find((m: any) => m.from === proposal.move.from && m.to === proposal.move.to && m.promotion === proposal.move.promotion);
        if (move) {
          this.playResolvedMove(move, this.formatMoveDescription(move), spokenText.toLowerCase().trim());
        } else if (!proposal) {
          // "Yes" to a question that needs a square or a piece: ask it again
          this.triggerFeedback(this.lastSpokenFeedback || 'Which piece, and to which square?', 'question', true);
        } else {
          this.triggerFeedback('That move is not possible any more. Say your move again.', 'warning', true);
        }
        return;
      }
      this.pieceFragment = null;
      this.squareFragment = null;
      this.choiceFragment = null;
      // "No, knight to F3": the rest is the move they meant
      if (reply.rest) {
        this.processSpokenText(reply.rest, getLegalChessMoves);
        return;
      }
      this.triggerFeedback('All right. Say your move again.', 'question', true);
      return;
    }
    this.proposal = null;   // any new command replaces the move that was offered

    // "Bishop" … "to C4" can arrive as two results; join a square-only phrase to the piece just named
    const { text: rawText, alternatives: extraCandidates } = this.withPieceFragment(spokenText, spokenAlternatives);
    this.lastSpokenText = rawText;
    const cleanPrimary = rawText.toLowerCase().trim();

    // 1. Check system commands (undo, restart, camera views)
    if (
      cleanPrimary.includes('undo') ||
      cleanPrimary.includes('take back') ||
      cleanPrimary.includes('takeback') ||
      cleanPrimary.includes('go back') ||
      cleanPrimary.includes('step back') ||
      cleanPrimary.includes('previous move')
    ) {
      this.choiceFragment = null;
      this.onCommandCallback?.('undo');
      this.triggerFeedback('Undoing last move', 'info', true);
      return;
    }

    if (
      cleanPrimary.includes('restart') ||
      cleanPrimary.includes('new game') ||
      cleanPrimary.includes('reset game') ||
      cleanPrimary.includes('start over') ||
      cleanPrimary.includes('play again')
    ) {
      this.onCommandCallback?.('restart');
      this.triggerFeedback('Starting a new game', 'info', true);
      return;
    }

    if (cleanPrimary.includes('camera') || cleanPrimary.includes('view')) {
      if (cleanPrimary.includes('top') || cleanPrimary.includes('overhead') || cleanPrimary.includes('bird')) {
        this.onCommandCallback?.('camera', 'overhead');
        this.triggerFeedback('Camera switched to Top-Down view', 'info', true);
        return;
      }
      if (cleanPrimary.includes('white')) {
        this.onCommandCallback?.('camera', 'white');
        this.triggerFeedback('Camera switched to White perspective', 'info', true);
        return;
      }
      if (cleanPrimary.includes('black')) {
        this.onCommandCallback?.('camera', 'black');
        this.triggerFeedback('Camera switched to Black perspective', 'info', true);
        return;
      }
      if (cleanPrimary.includes('cinematic') || cleanPrimary.includes('isometric') || cleanPrimary.includes('3d')) {
        this.onCommandCallback?.('camera', 'isometric');
        this.triggerFeedback('Camera switched to 3D perspective', 'info', true);
        return;
      }
    }

    // 2. Repeats of the move just played (the player thought it was not heard) are ignored
    const now = Date.now();
    if (this.choiceFragment && now - this.choiceFragment.at > PIECE_FRAGMENT_MS) this.choiceFragment = null;
    if (cleanPrimary === this.lastExecutedText && now - this.lastExecutedMoveTime < QUEUE_REPEAT_WINDOW_MS) {
      return;
    }
    // 3. Fetch legal moves in current board position
    const legalMoves = getLegalChessMoves ? getLegalChessMoves() : null;
    if (!legalMoves || legalMoves.length === 0 || now < this.moveInFlightUntil) {
      // Not the player's turn (opponent thinking or moving): keep the move and play it as soon as the turn comes back
      this.queueCommand(rawText, extraCandidates);
      return;
    }

    // 4. The answer to "Which knight: B1 or F3?" ("B1", "the one on F3", "F")
    const chosen = this.answerToChoice([rawText, ...extraCandidates], legalMoves);
    if (chosen) {
      this.playResolvedMove(chosen, this.formatMoveDescription(chosen), cleanPrimary);
      return;
    }

    // 5. Assemble all candidate variations (raw phrase, alternatives, and phonetic homophones)
    const candidates = [rawText, ...extraCandidates];
    const resolution = this.tryResolveMoveFromCandidates(candidates, legalMoves);

    if (resolution.move) {
      this.playResolvedMove(resolution.move, resolution.description, cleanPrimary);
      return;
    }

    // Two or more pieces of the same kind can make the move: ask which one, never guess
    if (resolution.choices) {
      this.choiceFragment = { moves: resolution.choices, at: Date.now() };
      this.pieceFragment = null;
      this.squareFragment = null;
      this.triggerFeedback(this.whichOneQuestion(resolution.choices), 'question', true);
      return;
    }

    // The square was clear but not the piece: ask which piece (naming the ones that can go), and let a one-word answer finish the move
    const askPiece = resolution.error?.match(/^Which piece to ([A-H][1-8])\?/);
    if (askPiece) {
      const square = askPiece[1].toLowerCase();
      const movesTo = legalMoves.filter((m: any) => m.to === square);
      const kinds = [...new Set(movesTo.map((m: any) => m.piece))];
      if (!movesTo.length) {
        this.askNothingReaches(askPiece[1], legalMoves);
        return;
      }
      if (kinds.length === 1) {
        const only = this.oneOrChoice(movesTo);
        // Only one kind of piece can move at all (a lone king): the square is enough, play it
        if (only.move && this.movableKinds(legalMoves).length === 1) {
          this.playResolvedMove(only.move, only.description, cleanPrimary);
          return;
        }
        // Only one move goes there: offer it, and a yes plays it
        if (only.move) {
          this.squareFragment = { square, at: Date.now() };
          this.pieceFragment = null;
          this.askToConfirm(only.move);
          return;
        }
        this.choiceFragment = { moves: only.choices!, at: Date.now() };
        this.pieceFragment = null;
        this.squareFragment = null;
        this.triggerFeedback(this.whichOneQuestion(only.choices!), 'question', true);
        return;
      }
      this.squareFragment = { square, at: Date.now() };
      this.pieceFragment = null;
      const names = [...new Set(movesTo.map((m: any) => this.pieceFullName(m.piece).toLowerCase()))];
      const options = names.length >= 2 && names.length <= 3 ? `: the ${this.orList(names)}` : '';
      this.triggerFeedback(`Which piece to ${askPiece[1]}${options}?`, 'question', true);
      return;
    }

    // A piece was named but it cannot go to the square heard: say where it can go, and let the answer finish the move
    if (resolution.badPiece && resolution.badTarget) {
      soundEffects.playInvalidSound();
      const name = this.pieceFullName(resolution.badPiece);
      const targets = this.targetsFor(resolution.badPiece, legalMoves);
      const dest = resolution.badTarget.toUpperCase();
      const lead = !targets.length
        ? `Your ${name.toLowerCase()} can't move right now.`
        : this.isInCheck() ? `You are in check, so the ${name.toLowerCase()} can't go to ${dest}.` : `${name} can't go to ${dest}.`;
      // Another piece can make that move (most likely a misheard name, like "Queen" for "King"): offer it
      const other = this.oneOrChoice(legalMoves.filter((m: any) => m.to === resolution.badTarget));
      const sole = this.movableKinds(legalMoves);
      if (other.move && sole.length === 1) {
        this.playResolvedMove(other.move, other.description, cleanPrimary);   // a lone king: it is the only piece that can go
        return;
      }
      if (other.move) {
        this.pieceFragment = targets.length ? { text: name, at: Date.now() } : null;
        this.squareFragment = null;
        this.askToConfirm(other.move, `${lead} `);
        return;
      }
      if (!targets.length) {
        if (sole.length === 1) {
          this.askSquareFor(sole[0], legalMoves, `${lead} `);
          return;
        }
        if (this.isInCheck()) {
          this.triggerFeedback(`${lead} You are in check: move your king out, block the check, or capture the attacker.`, 'warning', true);
          return;
        }
        this.pieceFragment = null;
        this.squareFragment = null;
        this.triggerFeedback(`${lead} Which piece, and to which square?`, 'question', true);
        return;
      }
      this.askSquareFor(resolution.badPiece, legalMoves, `${lead} `);
      return;
    }

    const unreachable = resolution.error?.match(/^None of your pieces can move to ([A-H][1-8])/);
    if (unreachable) {
      soundEffects.playInvalidSound();
      this.askNothingReaches(unreachable[1], legalMoves);
      return;
    }

    if (resolution.error) {
      // In check, a piece that could otherwise move there is refused because the king must be saved first
      const message = this.isInCheck() && /cannot move to/.test(resolution.error)
        ? resolution.error.replace(/Move is illegal or path is blocked\./, "You are in check: move your king out, block the check, or capture the attacker.")
        : resolution.error;
      this.triggerFeedback(message, 'warning', true);
      soundEffects.playInvalidSound();
      return;
    }

    // The piece was clear but not the square: ask for the square (naming where it can go), and let the answer finish the move
    const parsed = this.extractMoveTokens(this.normalizeChessSpeech(rawText));
    if (parsed.piece && !parsed.targetSquare && !parsed.fromSquare) {
      const name = this.pieceFullName(parsed.piece);
      if (!this.targetsFor(parsed.piece, legalMoves).length) {
        const sole = this.movableKinds(legalMoves);
        if (sole.length === 1) {
          this.askSquareFor(sole[0], legalMoves, `Your ${name.toLowerCase()} can't move right now. `);
          return;
        }
        this.triggerFeedback(`Your ${name.toLowerCase()} can't move right now.`, 'warning', true);
        return;
      }
      this.askSquareFor(parsed.piece, legalMoves);
      return;
    }

    // Something chess-like was said but not caught: ask again rather than stay silent. Plain conversation is left alone.
    if (/\b(pawn|knight|bishop|rook|queen|king|takes|castle)\b|\b[a-h][1-8]\b/.test(this.normalizeChessSpeech(rawText))) {
      const sole = this.movableKinds(legalMoves);
      if (sole.length === 1) {
        this.askSquareFor(sole[0], legalMoves, "Sorry, I didn't catch that. ");   // a lone king: only the square is needed
        return;
      }
      this.triggerFeedback("Sorry, I didn't catch that. Which piece, and to which square?", 'question', true);
      return;
    }

    // Fallback: Show helpful guidance
    this.triggerFeedback(`Heard: "${rawText}". Say e.g. "Bishop to C4" or "Queen to F4"`, 'info', false);
  }

  /** Plays a move the player asked for, and closes any question that was waiting. */
  private playResolvedMove(move: any, description: string, spokenKey: string) {
    this.lastExecutedMoveTime = Date.now();
    this.lastExecutedMoveSan = move.san;
    this.lastExecutedText = spokenKey;
    this.moveInFlightUntil = Date.now() + MOVE_IN_FLIGHT_MS;
    this.pendingCommand = null;
    this.pieceFragment = null;   // a half-heard command is finished once a move plays
    this.squareFragment = null;
    this.choiceFragment = null;
    this.proposal = null;
    this.triggerFeedback(description, 'success', true);
    this.onMoveCallback?.(move.from, move.to, move.san, description);
  }

  /**
   * The answer to "Which knight: B1 or F3?": the square the piece stands on ("B1", "the one on B1", "from B1"),
   * or just its file or rank ("B", "1") when that picks out one of them. Still legal in the current position.
   */
  private answerToChoice(phrases: string[], legalMoves: any[]): any | null {
    const pending = this.choiceFragment;
    if (!pending) return null;
    const stillLegal = (m: any) => legalMoves.find((l: any) => l.from === m.from && l.to === m.to) || null;
    for (const phrase of phrases) {
      if (!phrase) continue;
      const text = this.normalizeChessSpeech(phrase);
      for (const sq of text.match(/\b[a-h][1-8]\b/g) || []) {
        const hit = pending.moves.find((m: any) => m.from === sq);
        if (hit) return stillLegal(hit);
      }
      for (const token of text.split(' ')) {
        if (!/^([a-h]|[1-8])$/.test(token)) continue;
        const hits = pending.moves.filter((m: any) => m.from.includes(token));
        if (hits.length === 1) return stillLegal(hits[0]);
      }
    }
    return null;
  }

  /** "Which knight goes to D2: the one on B1, or the one on F3?" */
  private whichOneQuestion(choices: any[]): string {
    const piece = this.pieceFullName(choices[0].piece).toLowerCase();
    const to = choices[0].to.toUpperCase();
    const from = choices.map((m: any) => m.from.toUpperCase());
    return from.length === 2
      ? `Which ${piece} goes to ${to}: the one on ${from[0]}, or the one on ${from[1]}?`
      : `Which ${piece} goes to ${to}: the one on ${this.orList(from)}?`;
  }

  /** "Knight to which square: F3 or H3?", naming the squares when there are only a few. */
  private whichSquareQuestion(name: string, targets: string[]): string {
    const up = targets.map((t) => t.toUpperCase());
    return up.length <= 3 ? `${name} to which square: ${this.orList(up)}?` : `${name} to which square?`;
  }

  /** The squares a kind of piece can move to now. */
  private targetsFor(piece: PieceSymbol, legalMoves: any[]): string[] {
    return [...new Set(legalMoves.filter((m: any) => m.piece === piece).map((m: any) => m.to as string))];
  }

  /** "F3", "F3 or H3", "C4, D3 or E2" */
  private orList(items: string[]): string {
    return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
  }

  /** One move, or the pieces the player must choose between when several of the same kind can make it. */
  private oneOrChoice(moves: any[]): { move: any | null; description: string; choices?: any[] } {
    const byFrom = moves.filter((m: any, i: number) => moves.findIndex((o: any) => o.from === m.from) === i);
    if (byFrom.length === 1) return { move: byFrom[0], description: this.formatMoveDescription(byFrom[0]) };
    return { move: null, description: '', choices: byFrom };
  }

  /** The kinds of piece that have a legal move now (just the king when it stands alone). */
  private movableKinds(legalMoves: any[]): PieceSymbol[] {
    return [...new Set(legalMoves.map((m: any) => m.piece as PieceSymbol))];
  }

  /** Asks "Did you mean King to E2?"; a yes plays it. */
  private askToConfirm(move: any, lead = '') {
    this.proposal = { move, at: Date.now() };
    this.choiceFragment = null;
    this.triggerFeedback(`${lead}Did you mean ${this.formatMoveDescription(move)}?`, 'question', true);
  }

  /** "King to which square: E2 or F2?", or "Did you mean King to E2?" when it has only one move. */
  private askSquareFor(piece: PieceSymbol, legalMoves: any[], lead = '') {
    const name = this.pieceFullName(piece);
    const moves = legalMoves.filter((m: any) => m.piece === piece);
    this.pieceFragment = { text: name, at: Date.now() };
    this.squareFragment = null;
    this.choiceFragment = null;
    if (moves.length === 1) {
      this.askToConfirm(moves[0], lead);
      return;
    }
    this.triggerFeedback(`${lead}${this.whichSquareQuestion(name, this.targetsFor(piece, legalMoves))}`, 'question', true);
  }

  /** No piece can reach the square heard. With one kind of piece left, ask only for its square. */
  private askNothingReaches(square: string, legalMoves: any[]) {
    const sole = this.movableKinds(legalMoves);
    const sq = square.toUpperCase();
    if (sole.length === 1) {
      this.askSquareFor(sole[0], legalMoves, `Your ${this.pieceFullName(sole[0]).toLowerCase()} can't go to ${sq}. `);
      return;
    }
    this.pieceFragment = null;
    this.squareFragment = null;
    this.triggerFeedback(`None of your pieces can move to ${sq}. Which piece, and to which square?`, 'question', true);
  }

  /** True while a question is waiting for its answer. */
  private hasOpenQuestion(): boolean {
    const now = Date.now();
    const fresh = (f: { at: number } | null) => !!f && now - f.at <= PIECE_FRAGMENT_MS;
    return fresh(this.proposal) || fresh(this.choiceFragment) || fresh(this.pieceFragment) || fresh(this.squareFragment);
  }

  /**
   * "Yes", "yeah, play it", "haan" / "No", "nope", "no, knight to F3".
   * A no can carry the move the player meant; it comes back as `rest`.
   */
  private yesOrNo(text: string): { answer: 'yes' | 'no'; rest: string } | null {
    const words = text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const YES = new Set(['yes', 'yeah', 'yea', 'yep', 'yup', 'ya', 'yah', 'yess', 'sure', 'correct', 'right', 'ok', 'okay', 'confirm', 'confirmed', 'exactly', 'absolutely', 'affirmative', 'haan', 'han', 'haa', 'ha', 'ji']);
    const YES_FILLER = new Set(['please', 'it', 'is', 'that', "that's", 'thats', 'do', 'play', 'go', 'ahead', 'move', 'one', 'sir', 'yes', 'i', 'did', 'mean', 'meant']);
    if (words.some((w) => YES.has(w)) && words.every((w) => YES.has(w) || YES_FILLER.has(w))) return { answer: 'yes', rest: '' };
    if (/^(do it|play it|go ahead|that one)$/.test(words.join(' '))) return { answer: 'yes', rest: '' };
    const NO = new Set(['no', 'nope', 'nah', 'nahi', 'nahin', 'na', 'cancel', 'wrong', 'negative', 'not']);
    if (!NO.has(words[0])) return null;
    const NO_FILLER = new Set(['no', 'nope', 'nah', 'nahi', 'nahin', 'na', 'cancel', 'wrong', 'not', 'that', "that's", 'thats', 'it', 'one', 'sorry', 'i', 'said', 'mean', 'meant', 'wanted', 'want', 'please', 'is']);
    let i = 0;
    while (i < words.length && NO_FILLER.has(words[i])) i++;
    return { answer: 'no', rest: words.slice(i).join(' ') };
  }

  /**
   * If the player just named a piece on its own and this phrase is only a square ("to C4", "C4"),
   * the two belong together: "Bishop" + "to C4" means Bishop to C4, never the pawn.
   */
  private withPieceFragment(text: string, alternatives: string[], consume = true): { text: string; alternatives: string[] } {
    // Answer to "Which piece to F3?": a piece on its own ("Knight") completes the move
    const sf = this.squareFragment;
    if (sf && Date.now() - sf.at <= PIECE_FRAGMENT_MS) {
      const p = this.extractMoveTokens(this.normalizeChessSpeech(text));
      if (p.piece && !p.targetSquare && !p.fromSquare) {
        if (consume) this.squareFragment = null;
        return { text: `${text} to ${sf.square}`, alternatives: alternatives.map((a) => `${a} to ${sf.square}`) };
      }
    }
    const f = this.pieceFragment;
    if (!f || Date.now() - f.at > PIECE_FRAGMENT_MS) return { text, alternatives };
    const parsed = this.extractMoveTokens(this.normalizeChessSpeech(text));
    if (parsed.piece || !parsed.targetSquare) return { text, alternatives };
    if (consume) this.pieceFragment = null;
    return { text: `${f.text} ${text}`, alternatives: alternatives.map((a) => `${f.text} ${a}`) };
  }

  /**
   * Tests multiple candidates and phonetically generated variations against legal moves.
   * Features a context-aware fuzzy matching layer that maps common misinterpretations
   * (like Pawn for Bishop or Queen) to the intended chess piece based on valid move calculation context.
   */
  public tryResolveMoveFromCandidates(
    inputPhrases: string[],
    legalMoves: any[]
  ): { move: any | null; description: string; error?: string; choices?: any[]; badPiece?: PieceSymbol; badTarget?: Square } {
    // Generate all acoustic variants for all phrases
    const allNormalizedVariants: string[] = [];

    for (const phrase of inputPhrases) {
      if (!phrase) continue;
      const variants = this.generateCandidateVariations(phrase);
      for (const v of variants) {
        if (v && !allNormalizedVariants.includes(v)) {
          allNormalizedVariants.push(v);
        }
      }
    }

    // =========================================================================
    // PASS 1: Castling Checks across all variants
    // =========================================================================
    for (const text of allNormalizedVariants) {
      if (text.includes('castle') || text.includes('castling') || text === 'o-o' || text === 'o-o-o') {
        const isQueenside = text.includes('queen') || text.includes('long') || text === 'o-o-o';
        const castleMove = legalMoves.find((m: any) => {
          if (typeof m === 'object') {
            return isQueenside ? m.flags.includes('q') : m.flags.includes('k');
          }
          return false;
        });

        if (castleMove) {
          const desc = isQueenside ? 'Castled Queenside' : 'Castled Kingside';
          return { move: castleMove, description: desc };
        }

        // Try any castle available
        const anyCastle = legalMoves.find(
          (m: any) => typeof m === 'object' && (m.flags.includes('k') || m.flags.includes('q'))
        );
        if (anyCastle) {
          const isQueen = anyCastle.flags.includes('q');
          return { move: anyCastle, description: isQueen ? 'Castled Queenside' : 'Castled Kingside' };
        }

        return { move: null, description: '', error: 'Castling is not legal right now.' };
      }
    }

    // =========================================================================
    // PASS 2: Explicit From-Square -> To-Square (e.g. "e2 to e4", "e2 e4", "d2 d4", "g1 to f3")
    // =========================================================================
    for (const text of allNormalizedVariants) {
      const parsed = this.extractMoveTokens(text);
      if (parsed.fromSquare && parsed.targetSquare && parsed.fromSquare !== parsed.targetSquare) {
        const match = legalMoves.find(
          (m: any) => m.from === parsed.fromSquare && m.to === parsed.targetSquare
        );
        if (match) {
          return { move: match, description: this.formatMoveDescription(match) };
        }
      }
    }

    // =========================================================================
    // PASS 3: Explicit Major/Minor Piece + Target Square Exact Match
    // (Bishop, Queen, Knight, Rook, King) - Evaluated first to ensure
    // speech recognition hypotheses with pieces always supersede pawn defaults!
    // Examples: "bishop to c4", "queen to f4", "knight to f3", "rook to d1"
    // =========================================================================
    let explicitPieceAttempted: PieceSymbol | null = null;
    let explicitTargetAttempted: Square | null = null;

    for (const text of allNormalizedVariants) {
      const parsed = this.extractMoveTokens(text);

      if (parsed.piece && parsed.piece !== 'p' && parsed.targetSquare) {
        explicitPieceAttempted = parsed.piece;
        explicitTargetAttempted = parsed.targetSquare;

        const matches = legalMoves.filter(
          (m: any) => m.piece === parsed.piece && m.to === parsed.targetSquare
        );

        if (matches.length === 1) {
          return { move: matches[0], description: this.formatMoveDescription(matches[0]) };
        }

        if (matches.length > 1) {
          if (parsed.disambiguator) {
            const refined = matches.filter((m: any) => m.from.includes(parsed.disambiguator!));
            if (refined.length) return this.oneOrChoice(refined);
          }
          // Two of the same piece can go there: ask which one rather than pick one
          return this.oneOrChoice(matches);
        }
      }
    }

    // =========================================================================
    // PASS 4: CONTEXT-AWARE FUZZY MATCHING LAYER (Maps misinterpretations like Pawn -> Bishop/Queen)
    // =========================================================================
    // When the speech recognizer mistranscribes "Bishop to C4" as "Pawn to C4", or
    // "Queen to F4" as "Pawn to F4", or when the user commands a move with acoustic ambiguity:
    // We inspect the valid move calculation context for candidate target squares.
    for (const text of allNormalizedVariants) {
      const parsed = this.extractMoveTokens(text);
      if (!parsed.targetSquare) continue;

      const target = parsed.targetSquare;
      const movesToTarget = legalMoves.filter((m: any) => m.to === target);
      if (movesToTarget.length === 0) continue;

      const pawnMovesToTarget = movesToTarget.filter((m: any) => m.piece === 'p');
      const nonPawnMovesToTarget = movesToTarget.filter((m: any) => m.piece !== 'p');

      // Check acoustic piece evidence in raw inputs and variants
      const hasBishopAcoustics = allNormalizedVariants.some((t) =>
        /\b(bishop|bish|shop|fish|dish|be\s*shop|b\s*shop|b|bee|bea)\b/.test(t)
      );
      const hasQueenAcoustics = allNormalizedVariants.some((t) =>
        /\b(queen|clean|green|keen|quinn|kween|queue|cue|q|gwen)\b/.test(t)
      );
      const hasKnightAcoustics = allNormalizedVariants.some((t) =>
        /\b(knight|night|nite|horse|horsey|n|en)\b/.test(t)
      );
      const hasRookAcoustics = allNormalizedVariants.some((t) =>
        /\b(rook|rock|brook|crook|tower|r|are)\b/.test(t)
      );

      // Sub-case 4A: Spoken text has Bishop acoustic marker -> find Bishop move to target!
      if (hasBishopAcoustics) {
        const bishopMoves = nonPawnMovesToTarget.filter((m: any) => m.piece === 'b');
        if (bishopMoves.length) return this.oneOrChoice(bishopMoves);
      }

      // Sub-case 4B: Spoken text has Queen acoustic marker -> find Queen move to target!
      if (hasQueenAcoustics) {
        const queenMoves = nonPawnMovesToTarget.filter((m: any) => m.piece === 'q');
        if (queenMoves.length) return this.oneOrChoice(queenMoves);
      }

      // Sub-case 4C: Spoken text has Knight acoustic marker -> find Knight move to target!
      if (hasKnightAcoustics) {
        const knightMoves = nonPawnMovesToTarget.filter((m: any) => m.piece === 'n');
        if (knightMoves.length) return this.oneOrChoice(knightMoves);
      }

      // Sub-case 4D: Spoken text has Rook acoustic marker -> find Rook move to target!
      if (hasRookAcoustics) {
        const rookMoves = nonPawnMovesToTarget.filter((m: any) => m.piece === 'r');
        if (rookMoves.length) return this.oneOrChoice(rookMoves);
      }

      // Sub-case 4E: The recognized text said "pawn to [target]" (or piece is 'p'), BUT NO PAWN CAN MOVE THERE!
      // In chess, saying "pawn to c4" or "pawn to f4" when no pawn can reach that square is a classic
      // speech-to-text misinterpretation for Bishop, Queen, or Knight.
      // Rather than guess which piece was meant, ask.
      if (parsed.piece === 'p' && pawnMovesToTarget.length === 0 && nonPawnMovesToTarget.length > 0) {
        const sq = target.toUpperCase();
        return { move: null, description: '', error: `Which piece to ${sq}? Say it with the piece, like "Knight to ${sq}".` };
      }
    }

    // =========================================================================
    // CRITICAL ANTI-FALLTHROUGH GUARD:
    // If the user explicitly requested a piece (e.g. "Bishop to C4" or "Queen to F4"),
    // but no legal move was found for that piece:
    // NEVER EVER FALL THROUGH TO MOVE A PAWN OR ANY OTHER PIECE!
    // =========================================================================
    if (explicitPieceAttempted && explicitTargetAttempted) {
      const pieceName = this.pieceFullName(explicitPieceAttempted);
      const dest = explicitTargetAttempted.toUpperCase();
      return {
        move: null,
        description: '',
        error: `${pieceName} cannot move to ${dest}. Move is illegal or path is blocked.`,
        badPiece: explicitPieceAttempted,
        badTarget: explicitTargetAttempted,
      };
    }

    // =========================================================================
    // PASS 4B: Explicit Pawn + Target Square (e.g. "pawn to e4", "pawn to d4")
    // (Only reached if no major/minor piece was attempted)
    // =========================================================================
    let pawnTargetAttempted: Square | null = null;
    for (const text of allNormalizedVariants) {
      const parsed = this.extractMoveTokens(text);
      if (parsed.piece === 'p' && parsed.targetSquare) {
        pawnTargetAttempted = pawnTargetAttempted || parsed.targetSquare;
        const pawnMatches = legalMoves.filter(
          (m: any) => m.piece === 'p' && m.to === parsed.targetSquare
        );
        if (pawnMatches.length) return this.oneOrChoice(pawnMatches);   // two pawns that can take there: ask which
      }
    }

    // =========================================================================
    // PASS 5: Direct Standard Algebraic Notation (SAN) match (e.g. "Nf3", "e4", "Bc4", "Qf4")
    // =========================================================================
    for (const text of allNormalizedVariants) {
      const sanClean = text.replace(/[\s+#]/g, '').toUpperCase();
      // A plain square ("c3") is left to the bare-square check below, which asks when a piece could go there too
      if (/^[A-H][1-8]$/.test(sanClean)) continue;
      const sanMatch = legalMoves.find(
        (m: any) => m.san.replace(/[\s+#]/g, '').toUpperCase() === sanClean
      );
      if (sanMatch) {
        return { move: sanMatch, description: this.formatMoveDescription(sanMatch) };
      }
    }

    // =========================================================================
    // PASS 6: Bare Target Square (e.g. "to e4", "e4", "d4")
    // ONLY check bare square if NO major or minor piece was mentioned anywhere!
    // =========================================================================
    const anyMajorOrMinorPieceNamed = allNormalizedVariants.some((t) =>
      /\b(bishop|queen|rook|knight|king|bish|clean|quinn|kween|horse)\b/.test(t)
    );

    // A bare square means a pawn move only when nothing else was said ("e4", "to e4", "pawn e4").
    // Any other word in front ("9 to F3", "Nike to F3", "I to F3") is most likely a misheard piece name,
    // so ask which piece rather than moving a pawn the player never meant.
    let unclearTarget: Square | null = null;
    let unreachableTarget: Square | null = null;   // a square on its own that none of the player's pieces can reach
    if (!anyMajorOrMinorPieceNamed) {
      for (const text of allNormalizedVariants) {
        const parsed = this.extractMoveTokens(text);
        if (parsed.targetSquare && !parsed.piece) {
          const leftover = text
            .replace(/\b[a-h]\s*[1-8]\b/g, ' ')
            .replace(/\b(to|too|two|2|the|square|move|moves|go|goes|pawn|pawns|play|on|onto|at|please|and|a)\b/g, ' ')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
          if (leftover) {
            unclearTarget = parsed.targetSquare;
            continue;
          }
          // A square on its own plays a move only when exactly one move goes there ("e4" in the opening).
          // If a pawn and a piece could both go there, a dropped piece name is likely: ask instead of guessing.
          const anyMatches = legalMoves.filter((m: any) => m.to === parsed.targetSquare);
          if (anyMatches.length && anyMatches.every((m: any) => m.piece === anyMatches[0].piece)) {
            return this.oneOrChoice(anyMatches);   // one kind of piece: play it, or ask which of them
          }
          if (anyMatches.length > 1) unclearTarget = parsed.targetSquare;
          if (!anyMatches.length) unreachableTarget = unreachableTarget || parsed.targetSquare;
        }
      }
    }

    if (unclearTarget) {
      const sq = unclearTarget.toUpperCase();
      return { move: null, description: '', error: `Which piece to ${sq}? Say it with the piece, like "Knight to ${sq}".` };
    }

    // A pawn was named for a square no pawn can reach (and nothing else could either)
    if (pawnTargetAttempted) {
      return { move: null, description: '', error: `Pawn cannot move to ${pawnTargetAttempted.toUpperCase()}.`, badPiece: 'p', badTarget: pawnTargetAttempted };
    }

    if (unreachableTarget) {
      return { move: null, description: '', error: `None of your pieces can move to ${unreachableTarget.toUpperCase()}. Which piece, and to which square?` };
    }

    return { move: null, description: '' };
  }

  /**
   * Generates multiple phonetic variants for a given spoken phrase, handling common homophones
   */
  private generateCandidateVariations(input: string): string[] {
    const raw = input.toLowerCase().trim();
    const candidates: string[] = [];

    // Base normalized variant
    const base = this.normalizeChessSpeech(raw);
    candidates.push(base);

    // If phrase has repetitions (e.g. "bishop to c4 bishop to c4"), extract first segment
    const repeatedMatch = base.match(/(pawn|knight|bishop|rook|queen|king|castle|[a-h][1-8]).*?\1/);
    if (repeatedMatch && repeatedMatch.index !== undefined) {
      const half = base.slice(0, base.indexOf(repeatedMatch[1], repeatedMatch.index + 1)).trim();
      if (half && !candidates.includes(half)) candidates.push(half);
    }

    // Homophone: "before" -> both "e4" and "b4"
    if (raw.includes('before')) {
      candidates.push(this.normalizeChessSpeech(raw.replace(/\bbefore\b/g, 'e4')));
      candidates.push(this.normalizeChessSpeech(raw.replace(/\bbefore\b/g, 'b4')));
      candidates.push('e4');
      candidates.push('b4');
    }

    // Homophone: "see 4", "sea 4", "seafood" -> "c4"
    if (/\b(see|sea)\s+[1-8]\b/.test(raw) || /\bseafood\b/.test(raw)) {
      candidates.push(this.normalizeChessSpeech(raw.replace(/\bseafood\b/g, 'c4').replace(/\b(see|sea)\s+/g, 'c')));
    }

    // Homophone: "eff 4", "f four", "for" -> "f4"
    if (/\b(eff|ef|fox)\s*[1-8]\b/.test(raw) || /\b(eff|ef)\s*(four|4)\b/.test(raw) || /\b(?:to\s+)?for\b/.test(raw)) {
      candidates.push(this.normalizeChessSpeech(raw.replace(/\b(eff|ef|fox)\s*/g, 'f').replace(/\bto\s+for\b/g, 'to f4')));
    }

    // Homophone: "the [1-8]" or "to the [1-8]" -> "d[1-8]"
    if (/\b(?:to\s+)?the\s+[1-8]\b/.test(raw) || /\b(?:to\s+)?the\s+(one|two|three|four|five|six|seven|eight)\b/.test(raw)) {
      candidates.push(this.normalizeChessSpeech(raw.replace(/\bthe\s+/g, 'd')));
    }

    // Homophone: "default" / "the four" -> "d4"
    if (raw.includes('default') || raw.includes('dee four') || raw.includes('dee 4')) {
      candidates.push(this.normalizeChessSpeech(raw.replace(/\bdefault\b/g, 'd4').replace(/\bdee\s*(four|4)\b/g, 'd4')));
    }

    // Homophone: "key four" / "he four" -> "e4"
    if (/\b(key|he)\s*(four|4)\b/.test(raw)) {
      candidates.push(this.normalizeChessSpeech(raw.replace(/\b(key|he)\s*(four|4)\b/g, 'e4')));
    }

    // Homophone: "night" / "knight" + number variations: "night to f3" -> "knight to f3"
    if (/\b(?:night|nite|nine)\s*(?:to|2)?\s*f\s*3\b/.test(raw)) {
      candidates.push('knight to f3');
      candidates.push('nf3');
    }

    // Homophone: "night to c3" -> "knight to c3"
    if (/\b(?:night|nite|nine)\s*(?:to|2)?\s*c\s*3\b/.test(raw)) {
      candidates.push('knight to c3');
      candidates.push('nc3');
    }

    // Homophone: "shop to c4", "be shop to c4", "fish up to c4" -> "bishop to c4"
    if (/\b(?:shop|be\s*shop|bee\s*shop|fish\s*up|dish\s*up)\s*(?:to|2)?\s*c\s*4\b/.test(raw)) {
      candidates.push('bishop to c4');
      candidates.push('bc4');
    }

    // Homophone: "clean to f4", "queen to for", "queen to four" -> "queen to f4"
    if (/\b(?:clean|green|keen|quinn|kween|queen)\s*(?:to|2)?\s*(?:for|four|f\s*4)\b/.test(raw)) {
      candidates.push('queen to f4');
      candidates.push('qf4');
    }

    return candidates;
  }

  /**
   * Normalizes spoken speech, converting phonetic numbers, letters, homophones,
   * single-letter piece designations ("b to c4", "q to f4"), and accommodating natural phrasing.
   */
  public normalizeChessSpeech(input: string): string {
    let s = input.toLowerCase().trim();

    // 1. Remove commas, periods, hyphens, and question marks
    s = s.replace(/[,;!?\-_:\/]/g, ' ');

    // 2. Pre-handle speech recognition hearing "to for" or "to four" -> "to f4"
    s = s.replace(/\b(to|into|on|onto)\s+(?:for|four)\b/g, '$1 f4');
    s = s.replace(/\b(queen|bishop|knight|rook|king|pawn)\s+(?:for|four)\b/g, '$1 f4');

    // 2a. "Pawn" is often heard as "porn" (or "pond", "prawn", "pon", "paun"); in this game it always means pawn
    s = s.replace(/\b(porn|porns|pawns|pond|prawn|pon|paun)\b/g, 'pawn');

    // 2b. Common mishearings of "knight" when a square follows ("9 to F3", "Nike to F3", "nights to f3")
    s = s.replace(/\b(9|nine|nike|nikes|nights|knights|nite|nites|night)\s+(?=(?:to\s+|2\s+)?[a-h]\s*[1-8]\b)/g, 'knight ');
    // …and of "queen" ("Quinto F3" = "queen to", "Que to F3", "Kean to F3")
    s = s.replace(/\b(quinto|queento|queen2)\b/g, 'queen to');
    s = s.replace(/\b(que|kean|quean|queene|queens)\s+(?=(?:to\s+|2\s+)?[a-h]\s*[1-8]\b)/g, 'queen ');
    // Run-together forms: "Q2 F3", "q2f3", "Queen 2F3", "queen tf3"
    s = s.replace(/\b([qnrk])2\s*([a-h][1-8])\b/g, '$1 to $2');   // not "b": "b2 b4" is a pawn move from b2
    s = s.replace(/\b(queen|knight|bishop|rook|king|pawn)\s+(?:2|t)([a-h][1-8])\b/g, '$1 to $2');

    // 3. Single-letter piece spoken notation (e.g. "b to c4", "q to f4", "n to f3", "r to d1")
    s = s.replace(/\b(bee|bea|b)\s+(?:to\s+|2\s+)?([a-h][1-8])\b/g, 'bishop to $2');
    s = s.replace(/\b(cue|queue|q)\s+(?:to\s+|2\s+)?([a-h][1-8])\b/g, 'queen to $2');
    s = s.replace(/\b(en|n)\s+(?:to\s+|2\s+)?([a-h][1-8])\b/g, 'knight to $2');
    s = s.replace(/\b(are|arr|r)\s+(?:to\s+|2\s+)?([a-h][1-8])\b/g, 'rook to $2');
    s = s.replace(/\b(kay|k)\s+(?:to\s+|2\s+)?([a-h][1-8])\b/g, 'king to $2');
    s = s.replace(/\b(pea|p)\s+(?:to\s+|2\s+)?([a-h][1-8])\b/g, 'pawn to $2');

    // 4. Handle "before" as e4
    s = s.replace(/\bbefore\b/g, 'e4');

    // 5. Handle speech recognition transcribing "to" as number 2
    // e.g. "bishop 2 c4" -> "bishop to c4", "queen 2 f4" -> "queen to f4"
    s = s.replace(/\b2\s+([a-h])/g, 'to $1');
    s = s.replace(/\b2\s+(delta|david|dee|alpha|bravo|charlie|echo|foxtrot|golf|hotel)/g, 'to $1');

    // 6. Handle common speech recognition mishearing: "to the 4" -> "to d4"
    s = s.replace(/\b(to|into|on|onto)\s+the\s+([1-8]|one|two|three|four|five|six|seven|eight)\b/g, '$1 d $2');
    s = s.replace(/\b(move|play)\s+the\s+([1-8])\b/g, '$1 d $2');

    // 7. File phonetic replacements & NATO alphabet
    s = s.replace(/\b(alpha|able|ay|aye|apple)\b/g, 'a');
    s = s.replace(/\b(bravo|boy)\b/g, 'b');
    s = s.replace(/\b(charlie|see|sea|si|cat)\b/g, 'c');
    s = s.replace(/\b(delta|david|dee|de|dog)\b/g, 'd');
    s = s.replace(/\b(echo|edward|ee|easy)\b/g, 'e');
    s = s.replace(/\b(foxtrot|frank|eff|ef|fox)\b/g, 'f');
    s = s.replace(/\b(golf|george|gee|ji|girl)\b/g, 'g');
    s = s.replace(/\b(hotel|henry|aitch|age|hat)\b/g, 'h');

    // 8. Spoken numbers with digits
    s = s.replace(/\b(one|won|first|1st)\b/g, '1');
    s = s.replace(/\b(two|too|second|2nd)\b/g, '2');
    s = s.replace(/\b(three|tree|third|3rd)\b/g, '3');
    s = s.replace(/\b(four|for|fore|fourth|4th)\b/g, '4');
    s = s.replace(/\b(five|fifth|5th)\b/g, '5');
    s = s.replace(/\b(six|sixth|6th)\b/g, '6');
    s = s.replace(/\b(seven|seventh|7th)\b/g, '7');
    s = s.replace(/\b(eight|ate|eighth|8th)\b/g, '8');

    // 9. Coordinate spacing: "c 4" -> "c4", "f 4" -> "f4"
    s = s.replace(/\b([a-h])\s+([1-8])\b/g, '$1$2');

    // 10. Normalize piece names and slang
    s = s.replace(/\b(bishops?|shops?|the\s+shop|b\s*shop|be\s*shop|bee\s*shop|big\s*shop|fish\s*up|fishop|dish\s*up|be\s*sharp|mishap|vicious|pickup)\b/g, 'bishop');
    s = s.replace(/\b(queens?|clean|green|keen|quinn|kween|quean|gwen)\b/g, 'queen');
    s = s.replace(/\b(night|knights|nights|nite|nites|horses?|horsey|steed|knife|nice|tonight)\b/g, 'knight');
    s = s.replace(/\b(rocks?|rooks?|brook|crook|towers?|route|root)\b/g, 'rook');
    s = s.replace(/\b(kings?|kin|kong)\b/g, 'king');
    s = s.replace(/\b(pawns?|pons?|ponds?|palm|spawn|bone|fond)\b/g, 'pawn');

    // 11. Normalize capture verbs
    s = s.replace(/\b(captures|takes on|takes|take|kills|destroys|eats|cuts|attacks)\b/g, 'takes');

    // 12. Clean multiple whitespace
    s = s.replace(/\s+/g, ' ').trim();

    return s;
  }

  /**
   * Extracts piece symbol and target square from normalized text
   */
  public extractMoveTokens(text: string): {
    piece: PieceSymbol | null;
    targetSquare: Square | null;
    fromSquare: Square | null;
    disambiguator: string | null;
  } {
    let piece: PieceSymbol | null = null;
    if (/\b(bishop)\b/.test(text)) piece = 'b';
    else if (/\b(queen)\b/.test(text)) piece = 'q';
    else if (/\b(knight)\b/.test(text)) piece = 'n';
    else if (/\b(rook)\b/.test(text)) piece = 'r';
    else if (/\b(king)\b/.test(text)) piece = 'k';
    else if (/\b(pawn)\b/.test(text)) piece = 'p';

    // Search for coordinate squares (e.g. a1..h8)
    const squareMatches = text.match(/\b([a-h][1-8])\b/g);

    let targetSquare: Square | null = null;
    let fromSquare: Square | null = null;

    if (squareMatches && squareMatches.length >= 2) {
      if (squareMatches[0] !== squareMatches[1]) {
        fromSquare = squareMatches[0] as Square;
        targetSquare = squareMatches[squareMatches.length - 1] as Square;
      } else {
        targetSquare = squareMatches[0] as Square;
      }
    } else if (squareMatches && squareMatches.length === 1) {
      targetSquare = squareMatches[0] as Square;
    }

    // Check for disambiguation letter or number (e.g. "c pawn to d3", "rook a to b3")
    let disambiguator: string | null = null;
    const disambigMatch =
      text.match(/\b([a-h]|[1-8])\s+(?:pawn|rook|knight|bishop|takes|to|on|at)\s+([a-h][1-8])/) ||
      text.match(/\b([a-h])\s+pawn\b/);
    if (disambigMatch) {
      disambiguator = disambigMatch[1];
    }

    return { piece, targetSquare, fromSquare, disambiguator };
  }

  public pieceFullName(p: PieceSymbol): string {
    switch (p) {
      case 'p': return 'Pawn';
      case 'n': return 'Knight';
      case 'b': return 'Bishop';
      case 'r': return 'Rook';
      case 'q': return 'Queen';
      case 'k': return 'King';
      default: return 'Piece';
    }
  }

  public formatMoveDescription(m: {
    piece: PieceSymbol;
    from: Square;
    to: Square;
    san: string;
    flags?: string;
    captured?: string;
  }): string {
    if (m.flags && m.flags.includes('k')) return 'Castled Kingside';
    if (m.flags && m.flags.includes('q')) return 'Castled Queenside';

    const pieceName = this.pieceFullName(m.piece);
    const dest = m.to.toUpperCase();
    const isCapture = !!m.captured || (m.flags && (m.flags.includes('c') || m.flags.includes('e')));

    if (isCapture) {
      return `${pieceName} takes ${dest}`;
    }
    return `${pieceName} to ${dest}`;
  }

  private triggerFeedback(
    message: string,
    type: VoiceFeedbackType,
    speak = false
  ) {
    this.onFeedbackCallback?.(message, type);

    if (speak && this.voiceFeedbackEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.lastSpokenFeedback = message;
      try {
        window.speechSynthesis.cancel();
        this.isSelfSpeaking = true;

        if (this.selfSpeakSafetyTimer) clearTimeout(this.selfSpeakSafetyTimer);
        // Until the herald has finished (and its last words have reached the mic), what sounds like its own words is
        // ignored, so the end of a question is never taken as the answer. A safety limit, sized to the message,
        // keeps the mic from staying deaf if the browser never reports the end.
        const token = ++this.speakToken;
        const done = () => setTimeout(() => { if (this.speakToken === token) this.isSelfSpeaking = false; }, 350);
        this.selfSpeakSafetyTimer = setTimeout(() => {
          this.isSelfSpeaking = false;
        }, Math.min(9000, 1500 + message.length * 75));

        setTimeout(() => {
          try {
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 1.2; // Slightly faster, crisp vocal feedback
            utterance.pitch = 1.0;
            utterance.volume = 0.9;
            utterance.onend = done;
            utterance.onerror = done;
            window.speechSynthesis.speak(utterance);
          } catch {
            this.isSelfSpeaking = false;
          }
        }, 30);
      } catch (err) {
        this.isSelfSpeaking = false;
      }
    }
  }
}

// During development a code update loads a new copy of this module while the old copy's recognizer
// keeps listening (and moving pieces with outdated rules). Only one copy may ever be live.
const previousVoiceControl = (globalThis as any).__shatranjVoiceControl as any;
const previousWasListening = !!previousVoiceControl?.shouldBeActive;
previousVoiceControl?.stopListening();

export const voiceControl = new VoiceControlService();
(globalThis as any).__shatranjVoiceControl = voiceControl;

// The new copy takes over: same game callbacks, and it keeps listening if the old one was
if (previousVoiceControl) {
  const v = voiceControl as any;
  for (const key of ['onMoveCallback', 'onCommandCallback', 'onFeedbackCallback', 'onTranscriptCallback', 'onListeningChangeCallback', 'boundGetLegalMoves', 'isInCheck', 'voiceFeedbackEnabled']) {
    v[key] = previousVoiceControl[key];
  }
  if (previousWasListening) voiceControl.startListening();
}
