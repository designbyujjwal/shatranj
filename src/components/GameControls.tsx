import { CommanderPortrait } from './FlowingPaper';
import React, { useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  Swords,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { GameMode, BotDifficulty, CameraPreset, CapturedPieces, PieceColor, ControlMode, MoveRecord } from '../types';
import { ChessIoLogo } from './ChessIoLogo';
import { CommanderProfileModal } from './CommanderProfileModal';
import { FullscreenButton } from './FullscreenButton';

interface GameControlsProps {
  gameMode: GameMode;
  botDifficulty: BotDifficulty;
  currentTurn: 'w' | 'b';
  isInCheck: boolean;
  isBotThinking?: boolean;
  isBotMoving?: boolean;
  onlineSide?: 'w' | 'b' | null;   // online duel: your side, for the turn chip
  cameraPreset: CameraPreset;
  isMuted: boolean;
  capturedPieces: CapturedPieces;
  moves?: MoveRecord[];
  isCameraActive?: boolean;
  isTrackingActive?: boolean;
  playerName?: string;
  playerColor?: PieceColor;
  controlMode?: ControlMode;
  autoRotatePassAndPlay?: boolean;
  onToggleAutoRotatePassAndPlay?: () => void;
  onFlipPassAndPlaySide?: () => void;
  onSetControlMode?: (mode: ControlMode) => void;
  onSetGameMode: (mode: GameMode) => void;
  onOpenMultiplayer?: () => void;
  onStartOnlineMatch?: (roomId: string, playerName: string, preferredSide: 'w' | 'b' | 'random', controlMode?: any) => void;
  onSetBotDifficulty: (diff: BotDifficulty) => void;
  onSetCameraPreset: (preset: CameraPreset) => void;
  onToggleMute: () => void;
  onUndoMove: () => void;
  onResetGame: () => void;
  onOpenHowToPlay: () => void;
  onOpenSettings: () => void;
  onOpenOnboarding?: () => void;
  onSignOut?: () => void;
  /** Opens the profile in the 3D book; returns false when the book cannot open, and the folio modal is used instead. */
  onOpenProfile?: () => boolean;
}

export const GameControls: React.FC<GameControlsProps> = ({
  gameMode,
  botDifficulty,
  currentTurn,
  isInCheck,
  isBotThinking = false,
  isBotMoving = false,
  onlineSide = null,
  cameraPreset,
  isMuted,
  capturedPieces,
  moves = [],
  isCameraActive = false,
  isTrackingActive = false,
  playerName = 'Grandmaster',
  playerColor = 'w',
  controlMode = 'mouse',
  autoRotatePassAndPlay = true,
  onToggleAutoRotatePassAndPlay,
  onFlipPassAndPlaySide,
  onSetControlMode,
  onSetGameMode,
  onOpenMultiplayer,
  onStartOnlineMatch,
  onSetBotDifficulty,
  onSetCameraPreset,
  onToggleMute,
  onUndoMove,
  onResetGame,
  onOpenHowToPlay,
  onOpenSettings,
  onOpenOnboarding,
  onSignOut,
  onOpenProfile,
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Derive latest real-time move information
  const latestMove = moves.length > 0 ? moves[moves.length - 1] : null;
  const turnNumber = moves.length > 0 ? Math.floor((moves.length - 1) / 2) + 1 : 1;
  const isWhiteMove = latestMove?.color === 'w';
  const previousMove = isWhiteMove ? null : moves.length >= 2 ? moves[moves.length - 2] : null;

  // Real-time formatted notation (e.g., "1. e4", "1. e4 e5", "2. Nf3", etc.)
  const formattedNotation = latestMove
    ? isWhiteMove
      ? `${turnNumber}. ${latestMove.san}`
      : `${turnNumber}. ${previousMove?.san ?? '...'} ${latestMove.san}`
    : '';

  return (
    <>
      {/* Top Header Bar strictly matching the codex folio aesthetic */}
      <header
        id="chess-top-header"
        className="fixed top-0 left-0 right-0 h-16 sm:h-18 px-6 sm:px-10 flex items-center justify-between bg-transparent z-40 select-none pointer-events-none"
      >
        {/* Left: Official Brand Logo without any bounding box & Pass and Play mode badge */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <ChessIoLogo
            id="header-brand-logo"
            className="cursor-default select-none pointer-events-none"
            imageClassName="h-12 sm:h-14 md:h-16 w-auto max-w-[200px] object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.7)]"
          />

          {/* Pass & Play Active Battle Badge */}
          {gameMode === 'two-player' && (
            <div
              id="header-pass-and-play-badge"
              className="hud-paper hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full"
            >
              <Swords className="w-3.5 h-3.5 text-[#821e25]" />
              <span className="font-cinzel text-xs font-bold tracking-wider">
                Pass &bull; Play
              </span>
              <span className="text-[#7d481b]/40 text-xs">&bull;</span>
              <span
                className={`font-cinzel text-xs font-bold px-1.5 py-0.2 rounded ${
                  currentTurn === 'w'
                    ? 'text-[#633510] bg-[#eedec8]'
                    : 'text-[#1f0d04] bg-[#22150c]/10'
                }`}
              >
                {currentTurn === 'w' ? 'White Turn' : 'Black Turn'}
              </span>
            </div>
          )}
        </div>

        {/* Center: Live Move Readout (clean without any black box container) */}
        {latestMove && (
          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none max-w-[55vw] sm:max-w-none">
            <div
              id="live-moves-badge"
              className="hud-paper flex items-center gap-2 px-3.5 py-1 rounded-full"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#821e25] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#821e25]"></span>
              </span>
              <span className="font-cormorant italic text-xs sm:text-sm text-[#7d481b]">
                Turn {turnNumber}:
              </span>
              <span className="font-cinzel font-bold text-xs sm:text-sm text-[#1f0d04] tracking-wider">
                {formattedNotation}
              </span>
              <span className="text-[10px] font-cinzel text-[#821e25] bg-[#821e25]/10 px-2 py-0.5 rounded border border-[#821e25]/20 hidden sm:inline-block font-semibold">
                {latestMove.from.toUpperCase()} &rarr; {latestMove.to.toUpperCase()}
                {latestMove.captured ? ` (×${latestMove.captured.toUpperCase()})` : ''}
              </span>
              {isInCheck && (
                <span className="ml-1 text-[10px] font-cinzel font-bold px-1.5 py-0.5 bg-[#821e25] text-[#f7f2e7] border border-[#821e25] rounded uppercase animate-pulse">
                  Check
                </span>
              )}
              {onlineSide && <TurnChip currentTurn={currentTurn} mySide={onlineSide} />}
              {isBotThinking && (
                <span className="ml-1 flex items-center gap-1 text-[10px] font-cinzel text-[#821e25] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#821e25] animate-ping" />
                  <span className="hidden md:inline">Bot Calculating</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Right: Actions, Pass & Play Camera Flip, Sound, and Profile Button */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 pointer-events-auto">
          {/* Quick Flip Perspective in Pass & Play */}
          {gameMode === 'two-player' && onFlipPassAndPlaySide && (
            <button
              type="button"
              onClick={onFlipPassAndPlaySide}
              className="hud-paper h-10 flex items-center gap-1.5 px-3.5 rounded-full"
              title={`Switch camera to ${cameraPreset === 'black' ? 'White' : 'Black'} side`}
              aria-label="Flip camera view"
            >
              <RotateCw className="w-4 h-4 stroke-[1.8]" />
              <span className="hidden md:inline hud-paper-label">
                {cameraPreset === 'black' ? 'To White' : 'To Black'}
              </span>
            </button>
          )}

          {/* Undo Action */}
          <button
            type="button"
            onClick={onUndoMove}
            className="hud-paper w-10 h-10 rounded-full flex items-center justify-center"
            title="Undo Last Move"
            aria-label="Undo move"
          >
            <RotateCcw className="w-[18px] h-[18px] stroke-[1.8] text-current" />
          </button>

          {/* Full Screen */}
          <FullscreenButton />

          {/* Profile Button in paper style (no black box) */}
          <button
            type="button"
            onClick={() => { if (!onOpenProfile?.()) setIsProfileOpen(true); }}
            className="hud-paper h-10 flex items-center gap-2 pl-1 pr-4 rounded-full"
            title="Open Profile & Settings"
          >
            <CommanderPortrait color={playerColor} className="w-8 h-8 rounded-full shrink-0 ring-1 ring-[#7d481b]/40" />
            <span className="hud-paper-label">
              Profile
            </span>
          </button>
        </div>
      </header>

      {/* Commander Profile Codex Folio Modal */}
      <CommanderProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        playerName={playerName}
        playerColor={playerColor}
        gameMode={gameMode}
        onSetGameMode={onSetGameMode}
        botDifficulty={botDifficulty}
        onSetBotDifficulty={onSetBotDifficulty}
        cameraPreset={cameraPreset}
        onSetCameraPreset={onSetCameraPreset}
        autoRotatePassAndPlay={autoRotatePassAndPlay}
        onToggleAutoRotatePassAndPlay={onToggleAutoRotatePassAndPlay}
        controlMode={controlMode}
        onSetControlMode={onSetControlMode}
        onOpenMultiplayer={onOpenMultiplayer}
        onStartOnlineMatch={onStartOnlineMatch}
        onResetGame={onResetGame}
        onOpenHowToPlay={onOpenHowToPlay}
        onSignOut={onSignOut}
      />
    </>
  );
};

// Online duel: whose move it is, gold when it is yours
export const TurnChip: React.FC<{ currentTurn: 'w' | 'b'; mySide: 'w' | 'b' }> = ({ currentTurn, mySide }) =>
  currentTurn === mySide ? (
    <span className="ml-1 text-[10px] font-cinzel font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-[#c99a4b] text-[#1f0d04] border border-[#8a6428] shadow-[0_0_10px_rgba(201,154,75,0.6)]">
      Your move
    </span>
  ) : (
    <span className="ml-1 text-[10px] font-cinzel font-semibold px-2 py-0.5 rounded uppercase tracking-wider text-[#7d481b] border border-[#7d481b]/30">
      {currentTurn === 'w' ? 'White' : 'Black'} to move
    </span>
  );
