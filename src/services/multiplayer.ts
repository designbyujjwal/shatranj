import type { Square } from 'chess.js';
import type { PieceColor, MoveRecord, OnlineOpponent } from '../types';
import { duelSocketUrl } from './duelServer';

export interface MultiplayerCallbacks {
  onRoomJoined?: (data: {
    roomId: string;
    side: PieceColor | 'spectator';
    hostName?: string;
    hostSide?: PieceColor;
    controlMode?: string;
    status: 'waiting' | 'active' | 'ended';
    fen: string;
    turn: 'w' | 'b';
    moves: MoveRecord[];
    opponent: OnlineOpponent | null;
  }) => void;
  onPlayerJoined?: (opponent: OnlineOpponent, status: 'waiting' | 'active' | 'ended') => void;
  onPlayerLeft?: (side: 'w' | 'b') => void;
  onMoveMade?: (data: {
    move: MoveRecord;
    fen: string;
    turn: 'w' | 'b';
    inCheck: boolean;
    isGameOver: boolean;
    result?: string;
    moves: MoveRecord[];
  }) => void;
  onUndoRequested?: (requestedBy: 'w' | 'b') => void;
  onUndoExecuted?: (data: { fen: string; turn: 'w' | 'b'; moves: MoveRecord[]; inCheck: boolean }) => void;
  onUndoDeclined?: () => void;
  onDrawOffered?: (offeredBy: 'w' | 'b') => void;
  onDrawDeclined?: () => void;
  onGameEnded?: (result: string) => void;
  onRematchStarted?: (data: { fen: string; turn: 'w' | 'b' }) => void;
  onRemoteStream?: (stream: MediaStream | null) => void;
  onLocalStream?: (stream: MediaStream | null) => void;
  onOpponentMediaState?: (data: { side: 'w' | 'b'; micMuted?: boolean; videoOff?: boolean }) => void;
  onError?: (message: string, recoveryData?: { fen?: string; turn?: 'w' | 'b'; moves?: MoveRecord[] }) => void;
  onConnectionChange?: (connected: boolean) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
  ],
  iceCandidatePoolSize: 10,
};

class MultiplayerService {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentRoomId: string | null = null;
  private mySide: PieceColor | 'spectator' | null = null;
  private isConnected = false;
  private callbacks: MultiplayerCallbacks = {};

  // Heartbeat & Auto-reconnect
  private pingInterval: any = null;
  private reconnectTimer: any = null;
  private isIntentionalDisconnect = false;
  private lastJoinParams: { roomId: string; playerName: string; preferredSide: string; controlMode: string } | null = null;

  // WebRTC Perfect Negotiation State
  private makingOffer = false;
  private ignoreOffer = false;
  private isPolite = false;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private mediaPromise: Promise<MediaStream | null> | null = null;

  public setCallbacks(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getMySide(): PieceColor | 'spectator' | null {
    return this.mySide;
  }

  public getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public setLocalStream(stream: MediaStream) {
    this.localStream = stream;
    this.callbacks.onLocalStream?.(stream);
    if (this.pc) {
      this.attachLocalTracksToPC(stream);
    }
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * Request local camera and microphone with fallback
   */
  public async initLocalMedia(): Promise<MediaStream | null> {
    if (this.localStream) return this.localStream;
    if (this.mediaPromise) return this.mediaPromise;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }

    this.mediaPromise = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 30 },
            facingMode: 'user',
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        this.localStream = stream;
        this.callbacks.onLocalStream?.(stream);
        this.attachLocalTracksToPC(stream);
        return stream;
      } catch (err: any) {
        console.warn('[Multiplayer] Full media request failed, attempting audio-only or video-only:', err);
        try {
          const videoOnly = await navigator.mediaDevices.getUserMedia({ video: true });
          this.localStream = videoOnly;
          this.callbacks.onLocalStream?.(videoOnly);
          this.attachLocalTracksToPC(videoOnly);
          return videoOnly;
        } catch {
          try {
            const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.localStream = audioOnly;
            this.callbacks.onLocalStream?.(audioOnly);
            this.attachLocalTracksToPC(audioOnly);
            return audioOnly;
          } catch (audioErr) {
            console.warn('[Multiplayer] No media devices available:', audioErr);
            return null;
          }
        }
      } finally {
        this.mediaPromise = null;
      }
    })();

    return this.mediaPromise;
  }

  public async ensureLocalMedia(): Promise<MediaStream | null> {
    if (this.localStream) return this.localStream;
    if (this.mediaPromise) return this.mediaPromise;
    return this.initLocalMedia();
  }

  /**
   * Safely attach local tracks to the active RTCPeerConnection
   */
  private attachLocalTracksToPC(stream: MediaStream) {
    if (!this.pc) return;
    const senders = this.pc.getSenders();
    stream.getTracks().forEach((track) => {
      const existingSender = senders.find((s) => s.track?.kind === track.kind);
      if (existingSender) {
        existingSender.replaceTrack(track).catch((err) => {
          console.warn('[Multiplayer] replaceTrack error:', err);
        });
      } else {
        try {
          this.pc?.addTrack(track, stream);
        } catch (err) {
          console.warn('[Multiplayer] addTrack error:', err);
        }
      }
    });
  }

  /**
   * Connect to WebSocket server and join room
   */
  public async joinRoom(
    roomId: string,
    playerName: string,
    preferredSide: 'w' | 'b' | 'random' = 'random',
    controlMode: string = 'virtual'
  ) {
    this.currentRoomId = roomId;
    this.isIntentionalDisconnect = false;
    this.lastJoinParams = { roomId, playerName, preferredSide, controlMode };

    // Start local camera media in parallel
    this.initLocalMedia().catch((err) => {
      console.warn('[Multiplayer] Media stream notice:', err);
    });

    this.connectWs(this.lastJoinParams);
  }

  private connectWs(params: { roomId: string; playerName: string; preferredSide: string; controlMode: string }) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    // Dedicated /api/ws endpoint prevents Vite HMR interference; the server may live elsewhere (duelServer)
    const wsUrl = duelSocketUrl();

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.callbacks.onConnectionChange?.(true);

        // Clear any previous ping interval and start a robust 12-second keep-alive heartbeat
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 12000);

        this.ws?.send(
          JSON.stringify({
            type: 'join_room',
            roomId: params.roomId,
            playerName: params.playerName,
            preferredSide: this.mySide || params.preferredSide,
            controlMode: params.controlMode,
          })
        );
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          await this.handleMessage(msg);
        } catch (err) {
          console.error('[Multiplayer] Error processing WS message:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[Multiplayer] WS error:', err);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.callbacks.onConnectionChange?.(false);
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }

        // Automatic seamless reconnection with exponential safety
        if (!this.isIntentionalDisconnect && this.lastJoinParams) {
          if (!this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
              this.reconnectTimer = null;
              if (!this.isIntentionalDisconnect && this.lastJoinParams) {
                console.log('[Multiplayer] Reconnecting to peer match...');
                this.connectWs(this.lastJoinParams);
              }
            }, 1800);
          }
        }
      };
    } catch (err: any) {
      this.callbacks.onError?.(err?.message || 'Failed to connect to multiplayer server.');
    }
  }

  /**
   * Initialize WebRTC Peer Connection with Perfect Negotiation pattern + RTCDataChannel
   */
  private setupPeerConnection() {
    if (this.pc) {
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }

    // Black is the polite peer; White is impolite (breaks symmetry/glare)
    this.isPolite = this.mySide === 'b';
    this.pendingIceCandidates = [];
    this.makingOffer = false;
    this.ignoreOffer = false;

    console.log(`[Multiplayer] Initializing WebRTC Peer Connection (isPolite: ${this.isPolite})`);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;

    // Create low-latency P2P DataChannel for real-time move sync
    if (!this.isPolite) {
      try {
        const dc = pc.createDataChannel('chess_p2p', { ordered: true });
        this.setupDataChannel(dc);
      } catch (err) {
        console.warn('[Multiplayer] DataChannel create notice:', err);
      }
    }

    pc.ondatachannel = (event) => {
      console.log('[Multiplayer] ondatachannel received from peer:', event.channel.label);
      this.setupDataChannel(event.channel);
    };

    // Transceivers guarantee SDP negotiates both video and audio channels from the first offer
    try {
      pc.addTransceiver('video', { direction: 'sendrecv' });
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    } catch (err) {
      console.warn('[Multiplayer] Transceiver notice:', err);
    }

    // Attach existing local tracks
    if (this.localStream) {
      this.attachLocalTracksToPC(this.localStream);
    }

    // Perfect Negotiation onnegotiationneeded handler
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        console.log('[Multiplayer] onnegotiationneeded triggered - creating offer');
        await pc.setLocalDescription();
        if (pc.localDescription) {
          this.sendSignal('signal_offer', pc.localDescription);
        }
      } catch (err) {
        console.error('[Multiplayer] Error in onnegotiationneeded:', err);
      } finally {
        this.makingOffer = false;
      }
    };

    // Receive remote media tracks
    pc.ontrack = (event) => {
      console.log('[Multiplayer] ontrack received:', event.track.kind, event.track.id);

      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }

      if (!this.remoteStream.getTracks().some((t) => t.id === event.track.id)) {
        this.remoteStream.addTrack(event.track);
      }

      // Always pass a new MediaStream instance wrapper so React's setRemoteStream detects reference changes
      const streamWrapper = new MediaStream(this.remoteStream.getTracks());
      this.callbacks.onRemoteStream?.(streamWrapper);

      const notifyChange = () => {
        if (this.remoteStream) {
          this.callbacks.onRemoteStream?.(new MediaStream(this.remoteStream.getTracks()));
        }
      };

      event.track.onunmute = notifyChange;
      event.track.onmute = notifyChange;
      event.track.onended = notifyChange;
    };

    // Gather and send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal('signal_ice', event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Multiplayer] Peer connection state:', pc.connectionState);
      if (pc.connectionState === 'failed') {
        try {
          pc.restartIce();
        } catch {}
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Multiplayer] ICE connection state:', pc.iceConnectionState);
    };
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel;
    channel.onopen = () => {
      console.log('[Multiplayer] P2P WebRTC DataChannel OPEN! Instant peer moves enabled.');
    };
    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'p2p_move' && msg.data) {
          // Direct real-time move event from peer
          this.callbacks.onMoveMade?.(msg.data);
        }
      } catch (err) {
        console.warn('[Multiplayer] DataChannel message error:', err);
      }
    };
    channel.onclose = () => {
      if (this.dataChannel === channel) {
        this.dataChannel = null;
      }
    };
  }

  private sendSignal(type: 'signal_offer' | 'signal_answer' | 'signal_ice', data: any) {
    if (this.ws?.readyState === WebSocket.OPEN && this.currentRoomId) {
      this.ws.send(
        JSON.stringify({
          type,
          roomId: this.currentRoomId,
          data,
        })
      );
    }
  }

  private async flushPendingIceCandidates() {
    if (!this.pc || !this.pc.remoteDescription) return;
    const queued = [...this.pendingIceCandidates];
    this.pendingIceCandidates = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[Multiplayer] Error applying queued ICE candidate:', err);
      }
    }
  }

  /**
   * Handle incoming WebSocket events from server
   */
  private async handleMessage(msg: any) {
    const { type } = msg;

    switch (type) {
      case 'room_joined': {
        this.mySide = msg.side;
        this.callbacks.onRoomJoined?.(msg);

        // Ensure local media is ready before setting up peer connection
        await Promise.race([
          this.ensureLocalMedia(),
          new Promise((r) => setTimeout(r, 1200)),
        ]);

        if (msg.opponent && msg.opponent.connected) {
          this.setupPeerConnection();
        }
        break;
      }

      case 'player_joined': {
        this.callbacks.onPlayerJoined?.(msg.opponent, msg.status);

        // Opponent just joined our room: ensure local media and prepare peer connection
        await Promise.race([
          this.ensureLocalMedia(),
          new Promise((r) => setTimeout(r, 1200)),
        ]);

        this.setupPeerConnection();
        break;
      }

      case 'player_left': {
        this.callbacks.onPlayerLeft?.(msg.side);
        this.remoteStream = null;
        this.callbacks.onRemoteStream?.(null);
        if (this.pc) {
          try {
            this.pc.close();
          } catch {}
          this.pc = null;
        }
        break;
      }

      case 'move_made': {
        this.callbacks.onMoveMade?.(msg);
        break;
      }

      case 'undo_requested': {
        this.callbacks.onUndoRequested?.(msg.requestedBy);
        break;
      }

      case 'undo_executed': {
        this.callbacks.onUndoExecuted?.(msg);
        break;
      }

      case 'undo_declined': {
        this.callbacks.onUndoDeclined?.();
        break;
      }

      case 'draw_offered': {
        this.callbacks.onDrawOffered?.(msg.offeredBy);
        break;
      }

      case 'draw_declined': {
        this.callbacks.onDrawDeclined?.();
        break;
      }

      case 'game_ended': {
        this.callbacks.onGameEnded?.(msg.result);
        break;
      }

      case 'rematch_started': {
        this.callbacks.onRematchStarted?.(msg);
        break;
      }

      // WebRTC SDP Offer
      case 'signal_offer': {
        await Promise.race([
          this.ensureLocalMedia(),
          new Promise((r) => setTimeout(r, 800)),
        ]);

        if (!this.pc) this.setupPeerConnection();

        const offer = msg.data;
        const offerCollision = this.makingOffer || this.pc!.signalingState !== 'stable';
        this.ignoreOffer = !this.isPolite && offerCollision;

        if (this.ignoreOffer) {
          console.log('[Multiplayer] Impolite peer ignoring colliding offer');
          return;
        }

        try {
          await this.pc!.setRemoteDescription(new RTCSessionDescription(offer));
          await this.flushPendingIceCandidates();
          await this.pc!.setLocalDescription();
          if (this.pc!.localDescription) {
            this.sendSignal('signal_answer', this.pc!.localDescription);
          }
        } catch (err) {
          console.error('[Multiplayer] Error handling offer:', err);
        }
        break;
      }

      // WebRTC SDP Answer
      case 'signal_answer': {
        if (this.pc) {
          try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(msg.data));
            await this.flushPendingIceCandidates();
          } catch (err) {
            console.error('[Multiplayer] Error handling answer:', err);
          }
        }
        break;
      }

      // WebRTC ICE Candidate
      case 'signal_ice': {
        if (msg.data) {
          if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
            try {
              await this.pc.addIceCandidate(new RTCIceCandidate(msg.data));
            } catch (err) {
              if (!this.ignoreOffer) {
                console.warn('[Multiplayer] Error adding ICE candidate:', err);
              }
            }
          } else {
            // Queue ICE candidate until remote description is set
            this.pendingIceCandidates.push(msg.data);
          }
        }
        break;
      }

      case 'opponent_media_state': {
        this.callbacks.onOpponentMediaState?.(msg);
        break;
      }

      case 'error': {
        this.callbacks.onError?.(msg.message || 'Error from server', {
          fen: msg.fen,
          turn: msg.turn,
          moves: msg.moves,
        });
        break;
      }
    }
  }

  /**
   * Send a move via both P2P DataChannel (instant peer reflection) and authoritative WebSocket
   */
  public makeMove(from: Square, to: Square, promotion = 'q', optimisticPayload?: any) {
    // 1. Direct WebRTC P2P DataChannel send (sub-millisecond instant local delivery)
    if (this.dataChannel && this.dataChannel.readyState === 'open' && optimisticPayload) {
      try {
        this.dataChannel.send(
          JSON.stringify({
            type: 'p2p_move',
            data: optimisticPayload,
          })
        );
      } catch (err) {
        console.warn('[Multiplayer] P2P DataChannel send notice:', err);
      }
    }

    // 2. Authoritative Server send (validates, updates room FEN & annals, records history)
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.callbacks.onError?.('Not connected to match.');
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'make_move',
        roomId: this.currentRoomId,
        from,
        to,
        promotion,
      })
    );
  }

  /**
   * Request Undo / Takeback
   */
  public requestUndo() {
    this.ws?.send(
      JSON.stringify({
        type: 'request_undo',
        roomId: this.currentRoomId,
      })
    );
  }

  /**
   * Respond to opponent's Undo Request
   */
  public respondUndo(accept: boolean) {
    this.ws?.send(
      JSON.stringify({
        type: 'respond_undo',
        roomId: this.currentRoomId,
        accept,
      })
    );
  }

  public acceptUndo() {
    this.respondUndo(true);
  }

  public declineUndo() {
    this.respondUndo(false);
  }

  /**
   * Offer Draw
   */
  public offerDraw() {
    this.ws?.send(
      JSON.stringify({
        type: 'offer_draw',
        roomId: this.currentRoomId,
      })
    );
  }

  /**
   * Respond to opponent's Draw Offer
   */
  public respondDraw(accept: boolean) {
    this.ws?.send(
      JSON.stringify({
        type: 'respond_draw',
        roomId: this.currentRoomId,
        accept,
      })
    );
  }

  public acceptDraw() {
    this.respondDraw(true);
  }

  public declineDraw() {
    this.respondDraw(false);
  }

  /**
   * Resign match
   */
  public resign() {
    this.ws?.send(
      JSON.stringify({
        type: 'resign',
        roomId: this.currentRoomId,
      })
    );
  }

  /**
   * Request Rematch
   */
  public requestRematch() {
    this.ws?.send(
      JSON.stringify({
        type: 'request_rematch',
        roomId: this.currentRoomId,
      })
    );
  }

  /**
   * Toggle local microphone
   */
  public toggleMic(enabled?: boolean): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = enabled !== undefined ? enabled : !audioTrack.enabled;
      this.broadcastMediaState();
      return audioTrack.enabled;
    }
    return false;
  }

  /**
   * Toggle local camera
   */
  public toggleCamera(enabled?: boolean): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = enabled !== undefined ? enabled : !videoTrack.enabled;
      this.broadcastMediaState();
      return videoTrack.enabled;
    }
    return false;
  }

  private broadcastMediaState() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const audioTrack = this.localStream?.getAudioTracks()[0];
    const videoTrack = this.localStream?.getVideoTracks()[0];

    this.ws.send(
      JSON.stringify({
        type: 'media_state',
        roomId: this.currentRoomId,
        micMuted: audioTrack ? !audioTrack.enabled : true,
        videoOff: videoTrack ? !videoTrack.enabled : true,
      })
    );
  }

  /**
   * Leave room and clean up connections
   */
  public leaveRoom() {
    this.isIntentionalDisconnect = true;
    this.lastJoinParams = null;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    if (this.pc) {
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    this.remoteStream = null;
    this.currentRoomId = null;
    this.mySide = null;
    this.isConnected = false;
    this.pendingIceCandidates = [];
  }
}

export const multiplayer = new MultiplayerService();
