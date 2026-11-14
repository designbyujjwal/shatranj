import type { Square, PieceSymbol, Color } from 'chess.js';

export type PieceColor = 'w' | 'b';
export type PieceType = PieceSymbol; // 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

export interface ChessPieceData {
  id: string;
  type: PieceType;
  color: PieceColor;
  square: Square;
  hasMoved?: boolean;
}

export type GameMode = 'vs-bot' | 'two-player' | 'online';
export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'master';

export interface OnlineOpponent {
  id: string;
  name: string;
  side: PieceColor;
  connected: boolean;
  micMuted?: boolean;
  videoOff?: boolean;
}

export interface MultiplayerState {
  roomId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  mySide: PieceColor | 'spectator' | null;
  opponent: OnlineOpponent | null;
  matchStatus: 'idle' | 'waiting' | 'active' | 'ended';
  isCameraEnabled: boolean;
  isMicEnabled: boolean;
  pendingUndoFromMe: boolean;
  pendingUndoFromOpponent: boolean;
  pendingDrawFromMe: boolean;
  pendingDrawFromOpponent: boolean;
  error: string | null;
}

export interface MoveRecord {
  san: string;
  from: Square;
  to: Square;
  color: PieceColor;
  piece: PieceType;
  captured?: PieceType;
  flags: string;
  timestamp: number;
}

export interface HandLandmarkPoint {
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
  z: number;
}

export interface OneEuroFilterParams {
  minCutoff: number; // Minimum cutoff frequency in Hz (f_c_min). Controls jitter at rest. (e.g. 0.1 - 4.0)
  beta: number;      // Speed coefficient (beta). Controls responsiveness / lag reduction at speed. (e.g. 0.001 - 0.2)
  dCutoff: number;   // Cutoff frequency for derivative (f_c_d). (e.g. 0.5 - 2.0)
}

export interface HandTrackingState {
  isSupported: boolean;
  isLoading: boolean;
  isEnabled: boolean;
  isHandDetected: boolean;
  isPinching: boolean;
  isOpenHand: boolean;
  handOpenness: number; // 0 (closed/fist/pinch) to 1 (wide open hand)
  gesture: 'open' | 'pinching' | 'pointing';
  pinchDistance: number; // Scale-invariant pinch ratio
  pinchProgress: number; // 0..1 representation for UX meter
  cursorPosition2D: { x: number; y: number }; // Screen-normalized (0..1)
  cursorPosition3D: { x: number; y: number; z: number } | null;
  landmarks: HandLandmarkPoint[] | null;
  cameraDeviceId?: string;
  fps: number;
  filterParams: OneEuroFilterParams;
  error?: string | null;
}

export type CameraPreset = 'white' | 'black' | 'overhead' | 'isometric' | 'free';

export interface CapturedPieces {
  w: PieceType[]; // Pieces captured by White (Black pieces that are captured)
  b: PieceType[]; // Pieces captured by Black (White pieces that are captured)
}

export interface HoverTileInfo {
  square: Square;
  isLegal: boolean;
  fileIndex: number;
  rankIndex: number;
}

export interface PlayerProfile {
  name: string;
  side: PieceColor;
  difficulty: BotDifficulty;
  controlMode?: ControlMode;
}

export type ControlMode = 'virtual' | 'voice' | 'mouse';

export interface VoiceControlState {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  lastCommand: string | null;
  lastFeedback: string | null;
  feedbackType: 'success' | 'warning' | 'error' | 'info' | 'question' | null;
  voiceFeedbackEnabled: boolean;
}
