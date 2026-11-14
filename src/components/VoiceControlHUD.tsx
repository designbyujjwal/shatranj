import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Minimize2,
  Maximize2,
  EyeOff,
  Eye,
} from 'lucide-react';
import type { VoiceControlState } from '../types';

interface VoiceControlHUDProps {
  voiceState: VoiceControlState;
  onToggleMic: () => void;
  onToggleVoiceFeedback?: () => void;
  onToggleFeedback?: () => void;
  onSimulateCommand?: (cmd: string) => void;
  isPlayerTurn?: boolean;
  currentTurn?: 'w' | 'b';
  playerColor?: 'w' | 'b';
}

export const VoiceControlHUD: React.FC<VoiceControlHUDProps> = ({
  voiceState,
  onToggleMic,
  onToggleVoiceFeedback,
  onToggleFeedback,
  onSimulateCommand,
  isPlayerTurn,
  currentTurn,
  playerColor = 'w',
}) => {
  // Check user preference for minimized or hidden HUD
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    return localStorage.getItem('spatial_chess_voice_hud_minimized') === 'true';
  });
  const [isCompletelyHidden, setIsCompletelyHidden] = useState<boolean>(() => {
    return localStorage.getItem('spatial_chess_voice_hud_hidden') === 'true';
  });
  const [showHelpSheet, setShowHelpSheet] = useState<boolean>(false);

  const toggleFeedback = onToggleFeedback || onToggleVoiceFeedback;
  const isMyTurn = isPlayerTurn !== undefined ? isPlayerTurn : currentTurn === playerColor;

  // Persist minimize state
  const handleToggleMinimize = () => {
    const next = !isMinimized;
    setIsMinimized(next);
    localStorage.setItem('spatial_chess_voice_hud_minimized', String(next));
  };

  const handleToggleHide = () => {
    const next = !isCompletelyHidden;
    setIsCompletelyHidden(next);
    localStorage.setItem('spatial_chess_voice_hud_hidden', String(next));
  };

  const sampleCommands = [
    'Bishop to C4',
    'Queen to F4',
    'Pawn to E4',
    'Knight to F3',
    'Move Pawn to D3',
    'Castle Kingside',
    'Undo Move',
  ];

  // If user opted to completely hide it, show a discreet micro indicator badge in bottom right corner
  if (isCompletelyHidden) {
    return (
      <div
        id="voice-control-hud-hidden-trigger"
        className="fixed bottom-3 right-3 sm:right-6 z-40 pointer-events-auto select-none"
      >
        <button
          type="button"
          onClick={handleToggleHide}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full hud-paper text-[11px] shadow-md transition-all"
          title="Voice listening is active. Click to show voice HUD"
        >
          <span
            className={`w-2 h-2 rounded-full transition-colors duration-200 ${
              voiceState.isListening
                ? 'bg-emerald-600 shadow-[0_0_8px_rgba(5,150,105,0.6)]'
                : 'bg-[#821e25]'
            }`}
          />
          <Mic className="w-3 h-3 text-[#7d481b]" />
          <span className="hidden sm:inline font-cinzel font-semibold">Voice</span>
          <Eye className="w-3 h-3 text-[#7d481b]/70 ml-0.5" />
        </button>
      </div>
    );
  }

  // Minimized pill mode: Ultra-compact, non-intrusive floating pill
  if (isMinimized) {
    return (
      <div
        id="voice-control-hud-minimized"
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 pointer-events-auto select-none max-w-sm w-auto px-2"
      >
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full hud-paper">
          {/* Quick Mic Toggle inside minimized pill */}
          <button
            type="button"
            onClick={onToggleMic}
            className={`p-1 rounded-full transition-all cursor-pointer ${
              voiceState.isListening
                ? 'bg-gradient-to-tr from-[#7d481b] to-[#a35e26] text-[#f7f2e7]'
                : 'bg-[#7d481b]/10 text-[#7d481b]/80 hover:text-[#821e25]'
            }`}
            title={voiceState.isListening ? 'Microphone listening (click to pause)' : 'Microphone paused (click to start)'}
          >
            {voiceState.isListening ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
          </button>

          {/* Spoken Text or Quick Status */}
          <button
            type="button"
            onClick={handleToggleMinimize}
            className="flex items-center gap-1.5 text-left cursor-pointer group"
            title="Click to expand voice listening bar"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-200 ${
                voiceState.isListening
                  ? 'bg-emerald-600'
                  : 'bg-[#821e25]'
              }`}
            />
            <span className="text-[11px] font-medium text-[#3d1d07] group-hover:text-[#821e25] max-w-[170px] sm:max-w-[220px] truncate">
              {voiceState.interimTranscript ? (
                <span className="text-[#821e25] italic">"{voiceState.interimTranscript}"</span>
              ) : voiceState.lastFeedback ? (
                <span>{voiceState.lastFeedback}</span>
              ) : voiceState.isListening ? (
                <span className="text-[#7d481b]/80">Voice listening...</span>
              ) : (
                <span className="text-[#7d481b]/80">Mic paused</span>
              )}
            </span>
          </button>

          {/* Expand Button */}
          <button
            type="button"
            onClick={handleToggleMinimize}
            className="p-1 rounded-full text-[#7d481b]/80 hover:text-[#821e25] hover:bg-[#7d481b]/10 transition-colors"
            title="Expand Voice Bar"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          {/* Hide completely button */}
          <button
            type="button"
            onClick={handleToggleHide}
            className="p-1 rounded-full text-[#7d481b]/80 hover:text-[#821e25] hover:bg-[#7d481b]/10 transition-colors"
            title="Hide Voice HUD completely"
          >
            <EyeOff className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  // Small & Sleek Default Mode
  return (
    <div
      id="voice-control-hud"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-lg pointer-events-auto select-none"
    >
      {/* Expandable Voice Help Cheat Sheet */}
      {showHelpSheet && (
        <div className="mb-2 p-3 rounded-xl hud-paper shadow-xl space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-150 text-xs">
          <div className="flex items-center justify-between border-b border-[#7d481b]/15 pb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-cinzel font-bold text-[#821e25]">
              <Sparkles className="w-3 h-3 text-[#7d481b]" />
              <span>VOICE CHESS COMMANDS</span>
            </div>
            <button
              type="button"
              onClick={() => setShowHelpSheet(false)}
              className="text-[10px] text-[#7d481b] hover:text-[#821e25] px-2 py-0.5 rounded-full bg-[#7d481b]/10 font-cinzel font-bold"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[11px]">
            {sampleCommands.map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => onSimulateCommand?.(cmd)}
                className="text-left px-2 py-1 rounded-lg bg-[#f4ece1] hover:bg-[#ede3d2] border border-[#7d481b]/20 hover:border-[#7d481b]/40 text-[#3d1d07] transition-all font-cinzel text-[10px]"
              >
                "{cmd}"
              </button>
            ))}
          </div>

          <div className="text-[10px] text-[#7d481b] pt-0.5 flex items-center justify-between font-cormorant italic">
            <span>Files <strong className="text-[#821e25]">A–H</strong> • Ranks <strong className="text-[#821e25]">1–8</strong></span>
            <span>Say "Castle", "Undo", or "Camera"</span>
          </div>
        </div>
      )}

      {/* Small Compact Voice Control Bar in Codex Parchment */}
      <div className="relative flex items-center justify-between gap-2 px-2.5 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl hud-paper shadow-lg">
        {/* 1. Microphone Toggle & Indicator */}
        <div className="flex items-center gap-2">
          <button
            id="voice-mic-toggle-btn"
            type="button"
            onClick={onToggleMic}
            className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              voiceState.isListening
                ? 'bg-gradient-to-tr from-[#7d481b] to-[#a35e26] text-[#f7f2e7] shadow-sm'
                : 'bg-[#f4ece1] hover:bg-[#ede3d2] text-[#7d481b] border border-[#7d481b]/30'
            }`}
            title={voiceState.isListening ? 'Microphone active (click to pause)' : 'Microphone paused (click to listen)'}
          >
            {voiceState.isListening ? (
              <Mic className="w-4 h-4" />
            ) : (
              <MicOff className="w-4 h-4" />
            )}
          </button>

          {/* Steady status dot */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                  voiceState.isListening
                    ? 'bg-emerald-600 shadow-[0_0_6px_rgba(5,150,105,0.6)]'
                    : 'bg-[#821e25]'
                }`}
              />
              <span className="text-[10px] font-cinzel uppercase tracking-wider text-[#7d481b] font-bold hidden xs:inline">
                {voiceState.isListening ? 'LISTENING' : 'PAUSED'}
              </span>
            </div>
            <span className={`text-[9px] font-cormorant italic hidden sm:inline ${isMyTurn ? 'text-[#821e25] font-semibold' : 'text-[#7d481b]/70'}`}>
              {isMyTurn ? 'Your turn' : 'Opponent thinking'}
            </span>
          </div>
        </div>

        {/* 2. Central Spoken Text / Feedback Line */}
        <div className="flex-1 min-w-0 px-1.5 flex items-center">
          <div className="text-[11px] sm:text-xs font-medium text-[#3d1d07] truncate w-full">
            {voiceState.interimTranscript ? (
              <span className="text-[#821e25] italic font-cormorant">
                "{voiceState.interimTranscript}..."
              </span>
            ) : voiceState.lastFeedback && voiceState.feedbackType === 'question' ? (
              // A question from the herald: shown whole (up to two lines), so its choices can be read while answering
              <span className="flex items-center gap-1.5 font-cinzel text-xs font-semibold text-[#821e25] whitespace-normal">
                <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="line-clamp-2 leading-tight">{voiceState.lastFeedback}</span>
              </span>
            ) : voiceState.lastFeedback ? (
              <span
                className={`flex items-center gap-1 font-cinzel text-xs ${
                  voiceState.feedbackType === 'success'
                    ? 'text-emerald-700 font-semibold'
                    : voiceState.feedbackType === 'warning'
                    ? 'text-amber-800 font-semibold'
                    : voiceState.feedbackType === 'error'
                    ? 'text-[#821e25] font-semibold'
                    : 'text-[#3d1d07]'
                }`}
              >
                {voiceState.feedbackType === 'success' && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                {voiceState.feedbackType === 'warning' && <AlertCircle className="w-3 h-3 shrink-0" />}
                {voiceState.feedbackType === 'error' && <AlertCircle className="w-3 h-3 shrink-0" />}
                {voiceState.feedbackType === 'info' && <Info className="w-3 h-3 shrink-0 text-[#7d481b]" />}
                <span className="truncate">{voiceState.lastFeedback}</span>
              </span>
            ) : (
              <span className="text-[#7d481b]/80 text-[10px] sm:text-[11px] truncate font-cormorant italic">
                Say <strong className="text-[#821e25]">"Move Pawn to D3"</strong> or <strong className="text-[#821e25]">"Knight to F3"</strong>
              </span>
            )}
          </div>
        </div>

        {/* 3. Action Controls: TTS Voice Audio, Help Guide & Minimize/Hide */}
        <div className="flex items-center gap-1">
          {/* TTS Audio Speech Feedback Toggle */}
          {toggleFeedback && (
            <button
              type="button"
              onClick={toggleFeedback}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                voiceState.voiceFeedbackEnabled
                  ? 'bg-[#821e25]/10 border-[#7d481b]/50 text-[#821e25]'
                  : 'bg-[#f4ece1] border-[#7d481b]/20 text-[#7d481b]/60 hover:text-[#821e25]'
              }`}
              title={voiceState.voiceFeedbackEnabled ? 'Spoken speech feedback active' : 'Spoken speech feedback muted'}
            >
              {voiceState.voiceFeedbackEnabled ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Quick Help Toggle */}
          <button
            type="button"
            onClick={() => setShowHelpSheet(!showHelpSheet)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              showHelpSheet
                ? 'bg-[#7d481b]/20 border-[#7d481b]/40 text-[#3d1d07]'
                : 'bg-[#f4ece1] border-[#7d481b]/20 text-[#7d481b] hover:bg-[#ede3d2]'
            }`}
            title="Voice Commands Guide"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          {/* Minimize into floating pill */}
          <button
            type="button"
            onClick={handleToggleMinimize}
            className="p-1.5 rounded-lg border border-[#7d481b]/20 bg-[#f4ece1] text-[#7d481b] hover:bg-[#ede3d2] transition-colors"
            title="Minimize to small floating pill"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>

          {/* Hide completely */}
          <button
            type="button"
            onClick={handleToggleHide}
            className="p-1.5 rounded-lg border border-[#7d481b]/20 bg-[#f4ece1] text-[#7d481b] hover:bg-[#ede3d2] transition-colors"
            title="Hide voice tab completely"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
