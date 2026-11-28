import React, { useEffect, useRef, useState } from 'react';
import { Video, VideoOff, Mic, MicOff, User, Volume2, VolumeX, RotateCcw, Check, X, ShieldAlert } from 'lucide-react';
import type { OnlineOpponent, PieceColor } from '../types';
import { multiplayer } from '../services/multiplayer';

interface OpponentVideoCardProps {
  opponent: OnlineOpponent | null;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  mySide: PieceColor | 'spectator' | null;
  showCameras?: boolean;   // false in a voice duel: names, turn and actions only, no webcams
  currentTurn: PieceColor;
  isMyTurn: boolean;
  isInCheck: boolean;
  matchStatus: 'idle' | 'waiting' | 'active' | 'ended';
  pendingUndoFromOpponent: boolean;
  pendingDrawFromOpponent: boolean;
  onAcceptUndo: () => void;
  onDeclineUndo: () => void;
  onAcceptDraw: () => void;
  onDeclineDraw: () => void;
  onResign: () => void;
  onOfferDraw: () => void;
  onRequestUndo: () => void;
}

// The parchment controls of the Player Vision card (HandCameraPIP), so both webcams read as part of the same HUD
const ICON_BUTTON =
  'p-1 rounded bg-[#f4ece1] border border-[#7d481b]/20 text-[#7d481b] hover:bg-[#ede3d2] hover:text-[#821e25] transition-colors cursor-pointer';
const ICON_BUTTON_OFF =
  'p-1 rounded bg-[#821e25]/10 border border-[#821e25]/40 text-[#821e25] hover:bg-[#821e25]/15 transition-colors cursor-pointer';
const ACTION_BUTTON =
  'flex items-center gap-1 px-2 py-1 rounded font-cinzel font-bold text-[10px] uppercase tracking-wider bg-[#f4ece1] border border-[#7d481b]/25 text-[#7d481b] hover:bg-[#ede3d2] hover:text-[#821e25] transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none';
/** The rival's card while it is their move: a crimson edge and a warm glow, over the usual paper shadow. */
const RIVAL_TURN_GLOW =
  'inset 0 1px 0 rgba(255, 255, 255, .6), 0 0 0 1.5px rgba(130, 30, 37, .55), 0 0 22px rgba(201, 154, 75, .35), 0 6px 18px rgba(30, 14, 4, .32)';

export const OpponentVideoCard: React.FC<OpponentVideoCardProps> = ({
  opponent,
  remoteStream,
  localStream,
  mySide,
  showCameras = true,
  currentTurn,
  isMyTurn,
  isInCheck,
  matchStatus,
  pendingUndoFromOpponent,
  pendingDrawFromOpponent,
  onAcceptUndo,
  onDeclineUndo,
  onAcceptDraw,
  onDeclineDraw,
  onResign,
  onOfferDraw,
  onRequestUndo,
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isOpponentMuted, setIsOpponentMuted] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Attach and play remote video stream with autoplay policy recovery
  useEffect(() => {
    const videoEl = remoteVideoRef.current;
    if (!videoEl) return;

    if (remoteStream) {
      videoEl.srcObject = remoteStream;

      const checkActiveVideoTracks = () => {
        const videoTracks = remoteStream.getVideoTracks();
        const hasLive = videoTracks.length > 0 && videoTracks.some((t) => t.enabled && t.readyState !== 'ended');
        setHasRemoteVideo(hasLive);
      };

      checkActiveVideoTracks();

      remoteStream.onaddtrack = checkActiveVideoTracks;
      remoteStream.onremovetrack = checkActiveVideoTracks;
      remoteStream.getVideoTracks().forEach((t) => {
        t.onunmute = checkActiveVideoTracks;
        t.onmute = checkActiveVideoTracks;
        t.onended = checkActiveVideoTracks;
      });

      // Attempt to play remote media
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setAutoplayBlocked(false);
          })
          .catch((err) => {
            console.warn('[OpponentVideoCard] Video autoplay blocked by browser policy:', err);
            // Mute video element temporarily so video plays immediately, then prompt user to unmute
            videoEl.muted = true;
            setIsOpponentMuted(true);
            setAutoplayBlocked(true);
            videoEl.play().catch(() => {});
          });
      }
    } else {
      videoEl.srcObject = null;
      setHasRemoteVideo(false);
      setAutoplayBlocked(false);
    }
  }, [remoteStream]);

  // Attach local video stream
  useEffect(() => {
    const localVideo = localVideoRef.current;
    if (!localVideo) return;

    if (localStream) {
      localVideo.srcObject = localStream;
      localVideo.play().catch(() => {});
    } else {
      localVideo.srcObject = null;
    }
  }, [localStream]);

  const toggleLocalMic = () => {
    const active = multiplayer.toggleMic();
    setIsMicMuted(!active);
  };

  const toggleLocalVideo = () => {
    const active = multiplayer.toggleCamera();
    setIsVideoOff(!active);
  };

  const toggleOpponentAudio = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
      setIsOpponentMuted(remoteVideoRef.current.muted);
      if (!remoteVideoRef.current.muted) {
        setAutoplayBlocked(false);
        remoteVideoRef.current.play().catch(() => {});
      }
    }
  };

  const handleUnmuteClick = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = false;
      setIsOpponentMuted(false);
      setAutoplayBlocked(false);
      remoteVideoRef.current.play().catch(() => {});
    }
  };

  const opponentSide = mySide === 'w' ? 'b' : 'w';
  const isOpponentTurn = currentTurn === opponentSide && matchStatus === 'active';

  return (
    <>
      {/* 1. Opponent Video Card - Positioned at Top Right across the board, in the same parchment as the rest of the HUD */}
      <div className="absolute top-20 right-4 sm:right-6 z-30 flex flex-col items-end pointer-events-auto select-none">
        <div
          id="opponent-video-card"
          className="hud-paper relative w-52 sm:w-60 md:w-68 rounded-xl p-2.5 sm:p-3 transition-shadow duration-300"
          style={isOpponentTurn ? { boxShadow: RIVAL_TURN_GLOW } : undefined}
        >
          {/* Header: status dot, name and side, as on the Player Vision card */}
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#7d481b]/20">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  opponent?.connected
                    ? isOpponentTurn
                      ? 'bg-[#821e25] animate-pulse shadow-[0_0_6px_rgba(130,30,37,0.6)]'
                      : 'bg-[#b4893a]'
                    : 'bg-[#7d481b]/40'
                }`}
              />
              <span className="font-cinzel font-bold text-[11px] tracking-wider uppercase text-[#1f0d04] truncate">
                {opponent ? opponent.name : 'Awaiting Rival'}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-cinzel uppercase tracking-wider text-[#821e25] bg-[#821e25]/10 border border-[#7d481b]/40 px-2 py-0.5 rounded font-bold">
                {opponentSide === 'w' ? 'White' : 'Black'}
              </span>
              {showCameras && hasRemoteVideo && (
                <button
                  type="button"
                  onClick={toggleOpponentAudio}
                  className={isOpponentMuted ? ICON_BUTTON_OFF : ICON_BUTTON}
                  title={isOpponentMuted ? 'Unmute Opponent Audio' : 'Mute Opponent Audio'}
                >
                  {isOpponentMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>

          {/* Video / Placeholder Area */}
          <div className={`relative w-full aspect-4/3 ${showCameras ? '' : 'hidden'} bg-[#26150b] rounded-lg flex items-center justify-center overflow-hidden border border-[#7d481b]/30 shadow-inner`}>
            {/* Live Remote WebRTC Video (Natural perspective, not mirrored) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              onLoadedMetadata={() => {
                setHasRemoteVideo(true);
                remoteVideoRef.current?.play().catch(() => {});
              }}
              onCanPlay={() => {
                setHasRemoteVideo(true);
              }}
              onPlaying={() => {
                setHasRemoteVideo(true);
              }}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                hasRemoteVideo && !opponent?.videoOff ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
              }`}
            />

            {/* Placeholder when camera is off or player is waiting */}
            {(!hasRemoteVideo || opponent?.videoOff) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center bg-[#f4ece1] text-[#3d1d07]">
                <User className="w-5 h-5 text-[#7d481b] mb-0.5" />
                <span className="text-sm text-[#5c3010] font-cormorant italic leading-tight">
                  {opponent ? (opponent.videoOff ? 'Camera turned off' : 'Rival connected') : 'Awaiting your rival'}
                </span>
                <span className="text-[10px] text-[#7d481b] font-cinzel font-semibold uppercase tracking-wider">
                  {opponent
                    ? hasRemoteVideo
                      ? 'Live feed active'
                      : 'Connecting video...'
                    : 'Share the courier link'}
                </span>
              </div>
            )}

            {/* Browser Autoplay Blocked Tap-to-Unmute Banner */}
            {autoplayBlocked && (
              <button
                type="button"
                onClick={handleUnmuteClick}
                className="absolute inset-x-2 bottom-2 py-1 px-2 rounded-lg bg-[#821e25] hover:bg-[#9a242c] text-[#f7f2e7] font-cinzel font-bold text-[11px] shadow-md flex items-center justify-center gap-1.5 animate-bounce cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Enable Audio
              </button>
            )}

            {/* Turn Indicator Overlay */}
            {isOpponentTurn && (
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#821e25] text-[#f7f2e7] font-cinzel font-bold text-[9px] uppercase tracking-wider shadow-md animate-pulse">
                Thinking...
              </div>
            )}

            {/* Check Warning Overlay */}
            {isInCheck && isOpponentTurn && (
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#f4ece1] text-[#821e25] border border-[#821e25]/50 font-cinzel font-bold text-[9px] uppercase tracking-wider shadow-md">
                In Check!
              </div>
            )}

            {/* Opponent Mic Muted Overlay */}
            {opponent?.micMuted && (
              <div className="absolute bottom-2 right-2 p-1 rounded-full bg-[#f4ece1]/90 text-[#821e25] border border-[#7d481b]/30" title="Opponent Mic Muted">
                <MicOff className="w-3 h-3" />
              </div>
            )}
          </div>

        </div>
      </div>

      {/* 2. Your own camera: the same parchment card, in your corner at bottom left */}
      <div className={`absolute ${showCameras ? 'bottom-4' : 'bottom-20 xl:bottom-4'} left-4 sm:left-6 z-30 pointer-events-auto select-none`}>
        <div id="self-video-card" className="hud-paper relative w-52 sm:w-60 md:w-68 rounded-xl p-2.5 sm:p-3">
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#7d481b]/20">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`h-2 w-2 shrink-0 rounded-full ${localStream ? 'bg-[#b4893a]' : 'bg-[#7d481b]/40'}`} />
              <span className="font-cinzel font-bold text-[11px] tracking-wider uppercase text-[#1f0d04] truncate">You</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-cinzel uppercase tracking-wider text-[#821e25] bg-[#821e25]/10 border border-[#7d481b]/40 px-2 py-0.5 rounded font-bold">
                {mySide === 'w' ? 'White' : 'Black'}
              </span>
              {showCameras && <>
              <button
                type="button"
                onClick={toggleLocalMic}
                className={isMicMuted ? ICON_BUTTON_OFF : ICON_BUTTON}
                title={isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={toggleLocalVideo}
                className={isVideoOff ? ICON_BUTTON_OFF : ICON_BUTTON}
                title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {isVideoOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
              </button>
              </>}
            </div>
          </div>

          <div className={`relative w-full aspect-4/3 bg-[#26150b] rounded-lg flex items-center justify-center overflow-hidden border border-[#7d481b]/30 shadow-inner ${showCameras ? '' : 'hidden'}`}>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 ${
                isVideoOff || !localStream ? 'opacity-0' : 'opacity-100'
              }`}
            />
            {(isVideoOff || !localStream) && <VideoOff className="w-6 h-6 text-[#d9b98a]/70" />}
          </div>

          {/* Online Match Quick In-Game Actions */}
          <div className="mt-2 pt-2 border-t border-[#7d481b]/20 flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={onRequestUndo}
              disabled={!opponent || isOpponentTurn}
              className={ACTION_BUTTON}
              title="Request Takeback"
            >
              <RotateCcw className="w-3 h-3" />
              Takeback
            </button>
            <button type="button" onClick={onOfferDraw} disabled={!opponent} className={ACTION_BUTTON} title="Offer Draw">
              Draw
            </button>
            <button
              type="button"
              onClick={onResign}
              disabled={!opponent}
              className="px-2.5 py-1 rounded font-cinzel font-bold text-[10px] uppercase tracking-wider bg-[#821e25] hover:bg-[#9a242c] text-[#f7f2e7] shadow-sm transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              title="Resign Match"
            >
              Resign
            </button>
          </div>
        </div>
      </div>

      {/* 3. Incoming Takeback Request Banner */}
      {pendingUndoFromOpponent && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 border border-amber-400/60 rounded-xl p-3 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <RotateCcw className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-neutral-200 font-medium">Opponent requested a move takeback.</span>
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={onAcceptUndo}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <Check className="w-3 h-3" />
              Accept
            </button>
            <button
              onClick={onDeclineUndo}
              className="px-2.5 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" />
              Decline
            </button>
          </div>
        </div>
      )}

      {/* 4. Incoming Draw Offer Banner */}
      {pendingDrawFromOpponent && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 border border-blue-400/60 rounded-xl p-3 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <ShieldAlert className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-neutral-200 font-medium">Opponent offered a draw.</span>
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={onAcceptDraw}
              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <Check className="w-3 h-3" />
              Agree
            </button>
            <button
              onClick={onDeclineDraw}
              className="px-2.5 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" />
              Decline
            </button>
          </div>
        </div>
      )}
    </>
  );
};
