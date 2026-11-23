import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Chess, Square, PieceSymbol } from 'chess.js';
import type {
  GameMode,
  BotDifficulty,
  CameraPreset,
  CapturedPieces,
  HandTrackingState,
  HoverTileInfo,
  MoveRecord,
  PieceType,
} from './types';
import { ChessSceneManager } from './three/ChessScene';
import type { StudySelection, StudyOrder } from './three/study/studyWorld';
import { handTracker } from './services/handTracking';
import { calculateBotMove } from './services/aiBot';
import { soundEffects } from './utils/audio';
import { royalBattleMusic } from './utils/music';
import { HandCameraPIP } from './components/HandCameraPIP';
import { MoveHistory } from './components/MoveHistory';
import { GameControls, TurnChip } from './components/GameControls';
import { FullscreenButton } from './components/FullscreenButton';
import { IntroSplash } from './components/IntroSplash';
import { SpatialPointer } from './components/SpatialPointer';
import { PromotionModal } from './components/PromotionModal';
import { GameOverModal } from './components/GameOverModal';
import { HowToPlayModal } from './components/HowToPlayModal';
import { SettingsModal } from './components/SettingsModal';
import { VideoTutorialModal } from './components/VideoTutorialModal';
import { VoiceControlHUD } from './components/VoiceControlHUD';
import { voiceControl } from './services/voiceControl';
import { multiplayer } from './services/multiplayer';
import { MultiplayerModal } from './components/MultiplayerModal';
import { CourierInviteScreen } from './components/CourierInviteScreen';
import { OpponentVideoCard } from './components/OpponentVideoCard';
import { duelApiUrl } from './services/duelServer';
import type {
  OneEuroFilterParams,
  PlayerProfile,
  PieceColor,
  ControlMode,
  VoiceControlState,
  MultiplayerState,
} from './types';

/** The courier invite carried by the link (?room=…), if any. */
const readCourierInvite = () => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('room');
  if (!roomCode) return null;
  return {
    roomCode,
    hostSide: ((params.get('hostSide') as PieceColor) || 'w') as PieceColor | null,
    hostMode: (params.get('mode') as ControlMode) || 'virtual',
    hostName: params.get('host') || 'Rival Commander',
  };
};

export default function App() {
  const threeContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sceneManagerRef = useRef<ChessSceneManager | null>(null);
  const chessRef = useRef<Chess>(new Chess());

  // Player Onboarding & Profile State
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile>(() => {
    const savedName = localStorage.getItem('spatial_chess_player_name') || 'Grandmaster';
    const savedSide = (localStorage.getItem('spatial_chess_player_side') as PieceColor) || 'w';
    const savedDiff = (localStorage.getItem('spatial_chess_player_diff') as BotDifficulty) || 'medium';
    const savedMode = (localStorage.getItem('spatial_chess_control_mode') as ControlMode) || 'voice';
    return { name: savedName, side: savedSide, difficulty: savedDiff, controlMode: savedMode };
  });
  // An invite link opens straight onto the sealed envelope, from the very first render, so nothing else shows before it
  const [inviteOnLoad] = useState(readCourierInvite);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(
    () => !inviteOnLoad && !sessionStorage.getItem('spatial_chess_onboarded')
  );
  const [showControlModeModal, setShowControlModeModal] = useState<boolean>(false);
  const [showMatchSetupModal, setShowMatchSetupModal] = useState<boolean>(false);
  const [controlMode, setControlMode] = useState<ControlMode>(() => {
    return (localStorage.getItem('spatial_chess_control_mode') as ControlMode) || 'mouse';
  });

  // Online Multiplayer & Video State
  const [multiplayerState, setMultiplayerState] = useState<MultiplayerState>({
    roomId: null,
    isConnected: false,
    isConnecting: false,
    mySide: null,
    opponent: null,
    matchStatus: 'idle',
    isCameraEnabled: true,
    isMicEnabled: true,
    pendingUndoFromMe: false,
    pendingUndoFromOpponent: false,
    pendingDrawFromMe: false,
    pendingDrawFromOpponent: false,
    error: null,
  });
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [showMultiplayerModal, setShowMultiplayerModal] = useState(false);
  const [initialInviteRoom, setInitialInviteRoom] = useState<string | null>(() => inviteOnLoad?.roomCode ?? null);
  const [showCourierInvite, setShowCourierInvite] = useState(() => !!inviteOnLoad);
  const [courierInviteData, setCourierInviteData] = useState<{
    roomCode: string;
    hostSide: PieceColor | null;
    hostMode: ControlMode;
    hostName: string;
  }>(() => inviteOnLoad ?? {
    roomCode: '',
    hostSide: 'w',
    hostMode: 'virtual',
    hostName: 'Rival Commander',
  });

  // Voice Control State
  const [voiceState, setVoiceState] = useState<VoiceControlState>({
    isSupported: voiceControl.getIsSupported(),
    isListening: false,
    transcript: '',
    interimTranscript: '',
    lastCommand: null,
    lastFeedback: null,
    feedbackType: null,
    voiceFeedbackEnabled: true,
  });

  // App & Game State
  const [chessInstance, setChessInstance] = useState<Chess>(chessRef.current);
  const [gameMode, setGameMode] = useState<GameMode>('vs-bot');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(playerProfile.difficulty);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>(playerProfile.side === 'b' ? 'black' : 'white');
  const [isMuted, setIsMuted] = useState(false);

  // Ambient music: very low under the landing page, the book and the invite; silent on the board
  // The profile button opens the book on the desk; the board HUD steps aside while it is read
  const [profileBookOpen, setProfileBookOpen] = useState(false);
  const boardUiHidden = showOnboarding || profileBookOpen;
  // Music is silent only while a game is being played: the profile book read over the board brings it back
  const isInBoardScene = !showOnboarding && !showControlModeModal && !showMatchSetupModal && !showCourierInvite && !profileBookOpen;

  useEffect(() => {
    return royalBattleMusic.subscribe((state) => {
      setIsMuted(state.isMuted);
    });
  }, []);

  useEffect(() => {
    royalBattleMusic.setInBoardScene(isInBoardScene);
  }, [isInBoardScene]);

  // Join Battle opens the book: that click is the sure moment browsers allow sound, so the music starts there at the latest
  useEffect(() => {
    const onJoin = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('#join')) royalBattleMusic.start();
    };
    document.addEventListener('click', onJoin, true);
    return () => document.removeEventListener('click', onJoin, true);
  }, []);

  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [capturedPieces, setCapturedPieces] = useState<CapturedPieces>({ w: [], b: [] });
  const [currentTurn, setCurrentTurn] = useState<'w' | 'b'>('w');
  const [isInCheck, setIsInCheck] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<HoverTileInfo | null>(null);

  // Pass and Play (Two-Player) Side Switching & Banner
  const [autoRotatePassAndPlay, setAutoRotatePassAndPlay] = useState<boolean>(() => {
    const saved = localStorage.getItem('spatial_chess_auto_rotate_pass_play');
    return saved !== null ? saved === 'true' : true;
  });
  const [passAndPlayBanner, setPassAndPlayBanner] = useState<{
    color: PieceColor;
    text: string;
  } | null>(null);
  const bannerTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Modals
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [gameOver, setGameOver] = useState<{ winner: 'w' | 'b' | 'draw' | null; reason: string } | null>(null);
  // Dev preview of the winner screen (?preview=victory): waits for the loading veil to clear so the
  // entrance is visible, and Continue replays it
  const [previewRun, setPreviewRun] = useState(0);
  useEffect(() => {
    if (!(import.meta as any).env?.DEV || !new URLSearchParams(window.location.search).get('preview')) return;
    const id = window.setInterval(() => {
      const veil = document.getElementById('veil');
      if (!veil || veil.classList.contains('gone')) { window.clearInterval(id); window.setTimeout(() => setPreviewRun(1), 1700); }
    }, 200);
    return () => window.clearInterval(id);
  }, []);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVideoTutorial, setShowVideoTutorial] = useState(false);

  // Vision & Hand Tracking State
  const [trackingState, setTrackingState] = useState<HandTrackingState>(handTracker.state);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // AI Bot Lifecycle States
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [isBotMoving, setIsBotMoving] = useState(false);

  // Keep handlePlayerMove & hover callback refs synchronized across renders
  const handlePlayerMoveRef = useRef<(from: Square, to: Square) => boolean>(() => false);
  const handleStudyCompleteRef = useRef<(sel: StudySelection) => void>(() => {});
  const handleProfileApplyRef = useRef<(sel: StudySelection) => void>(() => {});
  const handleProfileClosedRef = useRef<(order: StudyOrder | null) => void>(() => {});
  const setHoverInfoRef = useRef(setHoverInfo);
  useEffect(() => {
    setHoverInfoRef.current = setHoverInfo;
  });

  // Initialize Three.js 3D Chess Scene
  useEffect(() => {
    if (!threeContainerRef.current) return;

    const manager = new ChessSceneManager(threeContainerRef.current, { startInGame: !showOnboarding });
    sceneManagerRef.current = manager;
    manager.setOnStudyComplete((sel) => handleStudyCompleteRef.current(sel));
    manager.setOnProfileBook((sel) => handleProfileApplyRef.current(sel), (order) => handleProfileClosedRef.current(order));
    // Start the mic inside the Confirm click: browsers (Safari especially) only allow it during a user gesture
    manager.setOnStudyConfirm((sel) => {
      if (sel.control === 'voice') voiceControl.startListening();
    });
    if ((import.meta as any).env?.DEV) (window as any).__shatranjScene = manager;   // dev-only handle for debugging the scene

    manager.syncWithChess(chessRef.current);
    if (cameraPreset !== 'white') {
      manager.setCameraPreset(cameraPreset);
    }

    manager.setOnPieceDropped((from: Square, to: Square) => {
      return handlePlayerMoveRef.current(from, to);
    });

    manager.setOnHoverChange((hover) => {
      if (hover) {
        setHoverInfoRef.current({
          square: hover.square,
          isLegal: hover.isLegal,
          fileIndex: hover.square.charCodeAt(0) - 97,
          rankIndex: parseInt(hover.square[1], 10) - 1,
        });
      } else {
        setHoverInfoRef.current(null);
      }
    });

    return () => {
      manager.dispose();
      sceneManagerRef.current = null;
    };
  }, []);

  // Initialize MediaPipe Hand Tracker
  useEffect(() => {
    let isMounted = true;
    const unsub = handTracker.subscribe((state) => {
      if (isMounted) {
        setTrackingState(state);
      }
    });

    if (isCameraActive && videoRef.current) {
      handTracker
        .initialize(videoRef.current)
        .then((success) => {
          if (!success && isMounted) {
            setIsCameraActive(false);
          }
        })
        .catch((err) => {
          console.warn('Camera initialization notice:', err);
          if (isMounted) {
            setIsCameraActive(false);
          }
        });
    }

    return () => {
      isMounted = false;
      unsub();
      handTracker.stop();
    };
  }, [isCameraActive]);

  // Keep the camera stream on whichever <video> is currently mounted (preview card or hidden fallback)
  useEffect(() => {
    handTracker.attachVideoElement(videoRef.current);
  });

  // Spatial hand tracking loop to update Three.js scene pointer
  useEffect(() => {
    let animId: number;

    const loop = () => {
      const scene = sceneManagerRef.current;
      if (scene) {
        // Disallow spatial dragging while bot is in active transit
        if (!isBotMoving) {
          if (trackingState.isEnabled && trackingState.isHandDetected) {
            scene.handleSpatialPointer(
              trackingState.cursorPosition2D.x,
              trackingState.cursorPosition2D.y,
              trackingState.isPinching,
              chessRef.current
            );
          } else {
            // Fallback to mouse pointer if hand is not in view
            scene.handleMouseFallback(chessRef.current);
          }
        }
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [trackingState, isBotMoving]);

  // Compute captured pieces from chess history
  const updateCapturedPieces = useCallback(() => {
    const history = chessRef.current.history({ verbose: true });
    const captured: CapturedPieces = { w: [], b: [] };
    history.forEach((m) => {
      if (m.captured) {
        if (m.color === 'w') {
          // White captured a black piece
          captured.w.push(m.captured as PieceType);
        } else {
          // Black captured a white piece
          captured.b.push(m.captured as PieceType);
        }
      }
    });
    setCapturedPieces(captured);
  }, []);

  // Online duel: the server's result text names the winner ("Checkmate! Black wins!", "White resigned. Black wins!", "Match drawn.")
  const winnerFromResult = (result: string): 'w' | 'b' | 'draw' =>
    /white wins/i.test(result) ? 'w' : /black wins/i.test(result) ? 'b' : 'draw';

  // Check Game Over Conditions
  const checkGameOverStatus = useCallback(() => {
    const chess = chessRef.current;
    if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? 'b' : 'w';
      setGameOver({
        winner,
        reason: `${winner === 'w' ? 'White' : 'Black'} delivered checkmate!`,
      });
    } else if (chess.isDraw()) {
      let reason = 'Game ended in a draw.';
      if (chess.isStalemate()) reason = 'Draw by Stalemate (no legal moves).';
      else if (chess.isThreefoldRepetition()) reason = 'Draw by Threefold Repetition.';
      else if (chess.isInsufficientMaterial()) reason = 'Draw by Insufficient Material.';
      setGameOver({ winner: 'draw', reason });
    }
  }, []);

  // Imperial Courier duel invite link: the invite is already open from the first render (inviteOnLoad);
  // here the host's latest details are fetched from the server, if the host has already connected
  useEffect(() => {
    if (!inviteOnLoad) return;
    sessionStorage.setItem('spatial_chess_onboarded', 'true');
    fetch(duelApiUrl(`/api/room/${encodeURIComponent(inviteOnLoad.roomCode)}`))
      .then((res) => res.json())
      .then((data) => {
        if (data && data.exists) {
          setCourierInviteData((prev) => ({
            ...prev,
            hostSide: data.hostSide || prev.hostSide,
            hostMode: data.controlMode || prev.hostMode,
            hostName: data.hostName || prev.hostName,
          }));
        }
      })
      .catch(() => {});
  }, []);

  // Synchronize Multiplayer Peer Events, Moves, WebRTC Stream & In-Game Actions
  useEffect(() => {
    multiplayer.setCallbacks({
      onRoomJoined: (data) => {
        setMultiplayerState((prev) => ({
          ...prev,
          roomId: data.roomId,
          mySide: data.side,
          matchStatus: data.status,
          opponent: data.opponent,
          isConnecting: false,
          isConnected: true,
        }));

        const targetPreset: CameraPreset = data.side === 'b' ? 'black' : 'white';
        setCameraPreset(targetPreset);
        if (sceneManagerRef.current) {
          sceneManagerRef.current.setCameraPreset(targetPreset);
        }

        const chess = chessRef.current;
        chess.load(data.fen);
        setCurrentTurn(chess.turn());
        setIsInCheck(chess.inCheck());
        setMoves(data.moves);
        updateCapturedPieces();

        if (sceneManagerRef.current) {
          sceneManagerRef.current.cancelOngoingAnimations(true);
          sceneManagerRef.current.syncWithChess(chess, false);
        }
      },
      onPlayerJoined: (opponent, status) => {
        setMultiplayerState((prev) => ({
          ...prev,
          opponent,
          matchStatus: status,
        }));
        soundEffects.playMoveSound();
      },
      onPlayerLeft: () => {
        setMultiplayerState((prev) => ({
          ...prev,
          opponent: prev.opponent ? { ...prev.opponent, connected: false } : null,
        }));
      },
      onMoveMade: (data) => {
        const chess = chessRef.current;
        const mySide = multiplayer.getMySide() || multiplayerState.mySide;
        const history = chess.history({ verbose: true });
        const lastMove = history[history.length - 1];
        const isAlreadyApplied =
          lastMove && lastMove.from === data.move.from && lastMove.to === data.move.to;

        const promotion = (data.move as any).promotion || (data.move.flags?.includes('p') ? 'q' : undefined);

        if (data.move.color !== mySide && !isAlreadyApplied) {
          try {
            const moveRes = chess.move({
              from: data.move.from as Square,
              to: data.move.to as Square,
              promotion: promotion as any,
            });

            if (moveRes) {
              if (moveRes.captured) soundEffects.playCaptureSound();
              else soundEffects.playMoveSound();

              if (chess.inCheck()) soundEffects.playCheckSound();

              setCurrentTurn(chess.turn());
              setIsInCheck(chess.inCheck());
              setMoves(data.moves);
              updateCapturedPieces();

              if (sceneManagerRef.current) {
                sceneManagerRef.current.animateAutonomousMove(
                  data.move.from as Square,
                  data.move.to as Square,
                  (promotion ? 'q' : undefined) as PieceType,
                  () => {
                    if (data.fen && chess.fen() !== data.fen) {
                      chess.load(data.fen);
                    }
                    sceneManagerRef.current?.syncWithChess(chess);
                    sceneManagerRef.current?.highlightLastMove(
                      data.move.from as Square,
                      data.move.to as Square
                    );
                  }
                );
              }

              if (data.isGameOver && data.result) {
                setGameOver({ winner: winnerFromResult(data.result), reason: data.result });
              }
            } else {
              throw new Error('Local chess.move returned null');
            }
          } catch (err) {
            console.warn('[Online Move Sync notice - recovering with authoritative FEN]', err);
            // RECOVERY: Authoritative server FEN synchronization
            if (data.fen) {
              chess.load(data.fen);
            }
            setCurrentTurn(data.turn || chess.turn());
            setIsInCheck(data.inCheck ?? chess.inCheck());
            setMoves(data.moves);
            updateCapturedPieces();
            soundEffects.playMoveSound();

            if (sceneManagerRef.current) {
              sceneManagerRef.current.cancelOngoingAnimations(true);
              sceneManagerRef.current.syncWithChess(chess, false);
              sceneManagerRef.current.highlightLastMove(
                data.move.from as Square,
                data.move.to as Square
              );
            }

            if (data.isGameOver && data.result) {
              setGameOver({ winner: winnerFromResult(data.result), reason: data.result });
            }
          }
        } else {
          setMoves(data.moves);
          setCurrentTurn(data.turn || chess.turn());
          setIsInCheck(data.inCheck ?? chess.inCheck());
          // Ensure local engine matches authoritative server state
          if (data.fen && chess.fen() !== data.fen) {
            chess.load(data.fen);
            updateCapturedPieces();
            sceneManagerRef.current?.syncWithChess(chess, false);
          }
          if (data.isGameOver && data.result) {
            setGameOver({ winner: winnerFromResult(data.result), reason: data.result });
          }
        }
      },
      onUndoRequested: (requestedBy) => {
        const mySide = multiplayer.getMySide() || multiplayerState.mySide;
        if (requestedBy !== mySide) {
          setMultiplayerState((prev) => ({ ...prev, pendingUndoFromOpponent: true }));
        }
      },
      onUndoExecuted: (data) => {
        const chess = chessRef.current;
        chess.load(data.fen);
        setCurrentTurn(data.turn);
        setIsInCheck(data.inCheck);
        setMoves(data.moves);
        updateCapturedPieces();

        if (sceneManagerRef.current) {
          sceneManagerRef.current.cancelOngoingAnimations(true);
          sceneManagerRef.current.syncWithChess(chess, false);
        }
        soundEffects.playMoveSound();
        setMultiplayerState((prev) => ({
          ...prev,
          pendingUndoFromMe: false,
          pendingUndoFromOpponent: false,
        }));
      },
      onUndoDeclined: () => {
        setMultiplayerState((prev) => ({ ...prev, pendingUndoFromMe: false }));
      },
      onDrawOffered: (offeredBy) => {
        const mySide = multiplayer.getMySide() || multiplayerState.mySide;
        if (offeredBy !== mySide) {
          setMultiplayerState((prev) => ({ ...prev, pendingDrawFromOpponent: true }));
        }
      },
      onDrawDeclined: () => {
        setMultiplayerState((prev) => ({ ...prev, pendingDrawFromMe: false }));
      },
      onGameEnded: (result) => {
        setGameOver({ winner: winnerFromResult(result), reason: result });
      },
      onRematchStarted: (data) => {
        const chess = chessRef.current;
        chess.load(data.fen);
        setCurrentTurn(data.turn);
        setMoves([]);
        setIsInCheck(false);
        setGameOver(null);
        updateCapturedPieces();
        if (sceneManagerRef.current) {
          sceneManagerRef.current.cancelOngoingAnimations(true);
          sceneManagerRef.current.syncWithChess(chess, false);
        }
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
      },
      onLocalStream: (stream) => {
        setLocalStream(stream);
      },
      onOpponentMediaState: (data) => {
        setMultiplayerState((prev) => ({
          ...prev,
          opponent: prev.opponent
            ? { ...prev.opponent, micMuted: data.micMuted, videoOff: data.videoOff }
            : null,
        }));
      },
      onError: (err, recoveryData) => {
        setMultiplayerState((prev) => ({ ...prev, error: err, isConnecting: false }));
        // If server sent authoritative recovery state after rejecting an invalid move:
        if (recoveryData?.fen) {
          const chess = chessRef.current;
          chess.load(recoveryData.fen);
          setCurrentTurn(recoveryData.turn || chess.turn());
          setIsInCheck(chess.inCheck());
          if (recoveryData.moves) setMoves(recoveryData.moves);
          updateCapturedPieces();
          if (sceneManagerRef.current) {
            sceneManagerRef.current.cancelOngoingAnimations(true);
            sceneManagerRef.current.syncWithChess(chess, false);
          }
        }
      },
    });
  }, [multiplayerState.mySide, updateCapturedPieces]);

  // Launch online match & join room
  const handleStartOnlineMatch = (
    roomId: string,
    playerName: string,
    preferredSide: 'w' | 'b' | 'random',
    chosenControlMode?: ControlMode
  ) => {
    setGameMode('online');
    setShowMultiplayerModal(false);
    setShowCourierInvite(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', `?room=${roomId}`);
    }
    setMultiplayerState((prev) => ({
      ...prev,
      roomId,
      isConnecting: true,
      error: null,
    }));

    const effectiveMode = chosenControlMode || controlMode;
    setControlMode(effectiveMode);

    const targetPreset: CameraPreset = preferredSide === 'b' ? 'black' : 'white';
    setCameraPreset(targetPreset);
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setCameraPreset(targetPreset);
    }

    // If hand tracking mode ('virtual'), initialize camera for spatial gesture control
    if (effectiveMode === 'virtual') {
      setIsCameraActive(true);
      if (videoRef.current) {
        handTracker.initialize(videoRef.current).then((success) => {
          if (success) {
            const stream = handTracker.getVideoStream();
            if (stream) {
              multiplayer.setLocalStream(stream);
            }
          }
        });
      }
    } else if (effectiveMode === 'voice') {
      voiceControl.startListening(getLegalMoves);
    }

    multiplayer.joinRoom(roomId, playerName, preferredSide, effectiveMode);
  };

  const handleCourierEnterBattle = (
    roomCode: string,
    invitedPlayerName: string,
    assignedSide: PieceColor,
    decreedMode: ControlMode
  ) => {
    // 1. Update player profile and persistence
    setPlayerProfile((prev) => ({
      ...prev,
      name: invitedPlayerName,
      side: assignedSide,
      controlMode: decreedMode,
    }));
    localStorage.setItem('spatial_chess_player_name', invitedPlayerName);
    localStorage.setItem('spatial_chess_player_side', assignedSide);
    localStorage.setItem('spatial_chess_control_mode', decreedMode);

    // 2. Set control mode
    setControlMode(decreedMode);

    // 3. Set camera preset: perspective from assigned side (e.g. if Black, camera looks from Black side)
    const targetPreset: CameraPreset = assignedSide === 'b' ? 'black' : 'white';
    setCameraPreset(targetPreset);
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setCameraPreset(targetPreset);
    }

    // 4. Close courier invite modal
    setShowCourierInvite(false);

    // 5. Start online match
    handleStartOnlineMatch(roomCode, invitedPlayerName, assignedSide, decreedMode);
  };

  // Safe game mode changer (leaves online match if exiting)
  const handleSetGameMode = (mode: GameMode) => {
    if (mode !== 'online' && gameMode === 'online') {
      multiplayer.leaveRoom();
      setMultiplayerState((prev) => ({
        ...prev,
        roomId: null,
        opponent: null,
        matchStatus: 'idle',
        isConnected: false,
      }));
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
    setGameMode(mode);
    if (mode === 'two-player' && autoRotatePassAndPlay) {
      const activeSidePreset: CameraPreset = chessRef.current.turn() === 'b' ? 'black' : 'white';
      setCameraPreset(activeSidePreset);
      if (sceneManagerRef.current) {
        sceneManagerRef.current.setCameraPreset(activeSidePreset);
      }
    }
  };

  const handleToggleAutoRotatePassAndPlay = () => {
    setAutoRotatePassAndPlay((prev) => {
      const next = !prev;
      localStorage.setItem('spatial_chess_auto_rotate_pass_play', String(next));
      return next;
    });
  };

  const handleFlipPassAndPlaySide = () => {
    const nextPreset: CameraPreset = cameraPreset === 'black' ? 'white' : 'black';
    handleSetCameraPreset(nextPreset);
  };

  // Execute a Move in Chess Engine & Update Scene
  const executeMove = useCallback(
    (from: Square, to: Square, promotionPiece = 'q', skipSync = false): boolean => {
      const chess = chessRef.current;
      try {
        const moveRes = chess.move({
          from,
          to,
          promotion: promotionPiece as PieceSymbol,
        });

        if (moveRes) {
          if (moveRes.captured) {
            soundEffects.playCaptureSound();
          } else {
            soundEffects.playMoveSound();
          }

          if (chess.inCheck()) {
            soundEffects.playCheckSound();
          }

          // Update UI States
          const nextTurn = chess.turn();
          setCurrentTurn(nextTurn);
          setIsInCheck(chess.inCheck());
          updateCapturedPieces();

          const newMoveRecord: MoveRecord = {
            san: moveRes.san,
            from: moveRes.from,
            to: moveRes.to,
            color: moveRes.color,
            piece: moveRes.piece as PieceType,
            captured: moveRes.captured as PieceType,
            flags: moveRes.flags,
            timestamp: Date.now(),
          };
          setMoves((prev) => [...prev, newMoveRecord]);

          // In Pass and Play (Council Duel), switch the camera to the player whose turn it is now:
          // Once White played, nextTurn is 'b', camera switches to show Black side.
          // Once Black played, nextTurn is 'w', camera switches to show White side.
          if (gameMode === 'two-player' && autoRotatePassAndPlay) {
            const nextSidePreset: CameraPreset = nextTurn === 'b' ? 'black' : 'white';
            setCameraPreset(nextSidePreset);

            if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
            setPassAndPlayBanner({
              color: nextTurn,
              text: nextTurn === 'b' ? "Black Vanguard's Turn" : "White Vanguard's Turn",
            });
            bannerTimerRef.current = setTimeout(() => {
              setPassAndPlayBanner(null);
            }, 2400);

            // 180ms delay allows piece drop animation to land cleanly, then camera smoothly orbits
            setTimeout(() => {
              if (sceneManagerRef.current) {
                sceneManagerRef.current.setCameraPreset(nextSidePreset);
              }
            }, 180);
          }

          // In online multiplayer match, broadcast move to peer via P2P DataChannel + WebSocket
          const isOnline = gameMode === 'online' || !!multiplayer.getCurrentRoomId();
          if (isOnline) {
            multiplayer.makeMove(from, to, promotionPiece, {
              move: newMoveRecord,
              fen: chess.fen(),
              turn: chess.turn(),
              inCheck: chess.inCheck(),
              isGameOver: chess.isGameOver(),
              moves: [...moves, newMoveRecord],
            });
          }

          // Sync Three.js 3D scene (skip full rebuild if smoothly animated, unless piece promoted)
          if (sceneManagerRef.current) {
            const isPromotion = moveRes.flags.includes('p');
            if (!skipSync || isPromotion) {
              sceneManagerRef.current.syncWithChess(chess);
            }
            sceneManagerRef.current.highlightLastMove(from, to);
          }

          checkGameOverStatus();
          return true;
        }
      } catch {
        return false;
      }
      return false;
    },
    [updateCapturedPieces, checkGameOverStatus, gameMode, autoRotatePassAndPlay]
  );

  // Validate and handle player move attempt
  const handlePlayerMove = useCallback(
    (from: Square, to: Square): boolean => {
      const chess = chessRef.current;
      const piece = chess.get(from);

      if (!piece) return false;

      const isOnline = gameMode === 'online' || !!multiplayer.getCurrentRoomId();

      // In online mode, only allow moving pieces of your assigned side on your turn
      if (isOnline) {
        const effectiveSide =
          multiplayer.getMySide() || multiplayerState.mySide || playerProfile.side;

        if (effectiveSide && piece.color !== effectiveSide) {
          soundEffects.playInvalidSound();
          return false;
        }

        if (effectiveSide && chess.turn() !== effectiveSide) {
          soundEffects.playInvalidSound();
          return false;
        }
      } else if (gameMode === 'vs-bot') {
        // In vs-bot mode, only allow the human player to move their selected color pieces on their turn
        if (piece.color !== playerProfile.side || chess.turn() !== playerProfile.side) {
          soundEffects.playInvalidSound();
          return false;
        }
      }

      // Check if pawn promotion
      const isPawnPromotion =
        piece.type === 'p' &&
        ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));

      if (isPawnPromotion) {
        // Verify move validity before triggering promotion modal
        const tempMoves = chess.moves({ square: from, verbose: true });
        const isValid = tempMoves.some((m) => m.to === to);
        if (isValid) {
          setPendingPromotion({ from, to });
          return true; // Smoothly land pawn on promotion square while modal displays upgrade choices
        }
      }

      return executeMove(from, to, 'q', true);
    },
    [executeMove, gameMode, playerProfile.side, multiplayerState.mySide]
  );

  // Keep handlePlayerMoveRef continuously up to date and rebind to active scene manager
  useEffect(() => {
    handlePlayerMoveRef.current = handlePlayerMove;
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setOnPieceDropped((from: Square, to: Square) => {
        return handlePlayerMoveRef.current(from, to);
      });
    }
  }, [handlePlayerMove]);

  // AI Bot Turn Execution with Natural Thinking & Smooth 3D Move Animation
  // Bot plays whichever color the player didn't pick ('w' or 'b')
  const botSide = playerProfile.side === 'w' ? 'b' : 'w';

  useEffect(() => {
    if (
      gameMode !== 'vs-bot' ||
      currentTurn !== botSide ||
      gameOver ||
      isBotMoving ||
      showOnboarding ||
      profileBookOpen ||
      showControlModeModal ||
      showMatchSetupModal
    )
      return;

    setIsBotThinking(true);

    // Realistic human-paced calculation delay
    const thinkDelay =
      botDifficulty === 'easy'
        ? 900
        : botDifficulty === 'medium'
        ? 1300
        : botDifficulty === 'hard'
        ? 1700
        : 2100;

    const timer = setTimeout(() => {
      const chess = chessRef.current;
      if (chess.turn() !== botSide || chess.isGameOver()) {
        setIsBotThinking(false);
        return;
      }

      const botMove = calculateBotMove(chess, botDifficulty);
      setIsBotThinking(false);

      if (botMove && sceneManagerRef.current) {
        setIsBotMoving(true);
        sceneManagerRef.current.animateAutonomousMove(
          botMove.from,
          botMove.to,
          botMove.promotion || 'q',
          () => {
            // Once 3D landing animation finishes, execute move logic in chess state
            executeMove(botMove.from, botMove.to, botMove.promotion || 'q', true);
            setIsBotMoving(false);
          }
        );
      } else if (botMove) {
        executeMove(botMove.from, botMove.to, botMove.promotion || 'q');
      }
    }, thinkDelay);

    return () => clearTimeout(timer);
  }, [
    currentTurn,
    gameMode,
    botDifficulty,
    gameOver,
    executeMove,
    isBotMoving,
    botSide,
    showOnboarding,
    profileBookOpen,
    showControlModeModal,
    showMatchSetupModal,
  ]);

  // Handle Pawn Promotion Choice
  const handlePromotionSelect = (pieceType: PieceType) => {
    if (pendingPromotion) {
      executeMove(pendingPromotion.from, pendingPromotion.to, pieceType);
      setPendingPromotion(null);
    }
  };

  // Reset Game
  const handleResetGame = () => {
    if (gameMode === 'online') {
      multiplayer.requestRematch();
      return;
    }

    setIsBotThinking(false);
    setIsBotMoving(false);
    chessRef.current.reset();
    setMoves([]);
    setCapturedPieces({ w: [], b: [] });
    setCurrentTurn('w');
    setIsInCheck(false);
    setGameOver(null);
    setPendingPromotion(null);

    if (gameMode === 'two-player') {
      setCameraPreset('white');
      if (sceneManagerRef.current) {
        sceneManagerRef.current.setCameraPreset('white');
      }
    }

    if (sceneManagerRef.current) {
      sceneManagerRef.current.cancelOngoingAnimations(true);
      sceneManagerRef.current.syncWithChess(chessRef.current, false);
    }
  };

  // Open Reckoning / Victory Codex Screen Preview for easy review and inspection anytime
  const handleOpenGameOverPreview = () => {
    soundEffects.playPinchRelease();
    setGameOver({
      winner: 'w',
      reason: 'Checkmate achieved by strategic superiority & decisive sovereign gambit',
    });
  };

  // Legal chess moves getter for voice recognition.
  // While a voice move animates the turn has not passed yet, so a second command waits for the next turn.
  const voiceMoveInFlightRef = useRef(false);
  const voiceMoveInFlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getLegalMoves = useCallback(() => {
    if (voiceMoveInFlightRef.current) return null;
    if (gameOver || (gameMode === 'vs-bot' && chessRef.current.turn() !== playerProfile.side)) {
      return null;
    }
    return chessRef.current.moves({ verbose: true });
  }, [gameOver, gameMode, playerProfile.side]);

  // Configure Voice Control Callbacks
  useEffect(() => {
    voiceControl.setLegalMovesProvider(getLegalMoves);
    voiceControl.setInCheckProvider(() => chessRef.current.inCheck());
    voiceControl.setCallbacks({
      onMove: (from: Square, to: Square, san: string, description?: string) => {
        const chess = chessRef.current;
        if (gameOver) {
          setVoiceState((prev) => ({
            ...prev,
            lastFeedback: 'The match has ended.',
            feedbackType: 'info',
          }));
          return;
        }

        if (gameMode === 'vs-bot' && chess.turn() !== playerProfile.side) {
          setVoiceState((prev) => ({
            ...prev,
            lastFeedback: "Opponent's turn to play. Please wait.",
            feedbackType: 'warning',
          }));
          return;
        }

        if (gameMode === 'online' && chess.turn() !== multiplayerState.mySide) {
          setVoiceState((prev) => ({
            ...prev,
            lastFeedback: "Opponent's turn to play. Please wait.",
            feedbackType: 'warning',
          }));
          return;
        }

        // Validate move legality
        const moves = chess.moves({ square: from, verbose: true });
        const validMove = moves.find((m) => m.to === to);
        if (!validMove) {
          setVoiceState((prev) => ({
            ...prev,
            lastFeedback: `Move ${from.toUpperCase()} to ${to.toUpperCase()} is illegal.`,
            feedbackType: 'warning',
          }));
          soundEffects.playInvalidSound();
          return;
        }

        const promoPiece = (validMove.promotion || 'q') as PieceType;

        // Clean natural descriptive label (e.g. "Pawn to D3", "Knight to F3")
        const pieceNames: Record<string, string> = {
          p: 'Pawn',
          n: 'Knight',
          b: 'Bishop',
          r: 'Rook',
          q: 'Queen',
          k: 'King',
        };
        const pieceTitle = pieceNames[validMove.piece] || 'Piece';
        const isCastle = validMove.flags?.includes('k') || validMove.flags?.includes('q');
        const defaultLabel = isCastle
          ? (validMove.flags.includes('q') ? 'Castled Queenside' : 'Castled Kingside')
          : validMove.captured
          ? `${pieceTitle} takes ${to.toUpperCase()}`
          : `${pieceTitle} to ${to.toUpperCase()}`;
        const moveLabel = description || defaultLabel;

        if (sceneManagerRef.current) {
          setVoiceState((prev) => ({
            ...prev,
            lastCommand: moveLabel,
            lastFeedback: `Moving ${moveLabel}...`,
            feedbackType: 'info',
            interimTranscript: '',
          }));

          // Smoothly animate the piece in 3D motion
          voiceMoveInFlightRef.current = true;
          if (voiceMoveInFlightTimerRef.current) clearTimeout(voiceMoveInFlightTimerRef.current);
          voiceMoveInFlightTimerRef.current = setTimeout(() => { voiceMoveInFlightRef.current = false; }, 3000);   // in case the animation is cancelled
          sceneManagerRef.current.animateAutonomousMove(from, to, promoPiece, () => {
            executeMove(from, to, promoPiece, true);
            voiceMoveInFlightRef.current = false;
            setVoiceState((prev) => ({
              ...prev,
              lastFeedback: moveLabel,
              feedbackType: 'success',
            }));
          });
        } else {
          const success = executeMove(from, to, promoPiece, false);
          if (success) {
            setVoiceState((prev) => ({
              ...prev,
              lastCommand: moveLabel,
              lastFeedback: moveLabel,
              feedbackType: 'success',
              interimTranscript: '',
            }));
          }
        }
      },
      onCommand: (cmd: string, param?: string) => {
        if (cmd === 'undo') {
          handleUndoMove();
          setVoiceState((prev) => ({
            ...prev,
            lastFeedback: 'Undid last move',
            feedbackType: 'info',
          }));
        } else if (cmd === 'restart') {
          handleResetGame();
          setVoiceState((prev) => ({
            ...prev,
            lastFeedback: 'Restarted chess match',
            feedbackType: 'info',
          }));
        } else if (cmd === 'camera' && param) {
          handleSetCameraPreset(param as CameraPreset);
        }
      },
      onFeedback: (message, type) => {
        setVoiceState((prev) => ({
          ...prev,
          lastFeedback: message,
          feedbackType: type,
        }));
      },
      onTranscript: (interim, final) => {
        setVoiceState((prev) => ({
          ...prev,
          interimTranscript: interim,
          transcript: final || prev.transcript,
        }));
      },
      onListeningChange: (isListening) => {
        setVoiceState((prev) => ({
          ...prev,
          isListening,
        }));
      },
    });
  }, [executeMove, gameMode, playerProfile.side, multiplayerState.mySide, gameOver, getLegalMoves]);

  const handleToggleVoiceMic = () => {
    voiceControl.toggleListening(getLegalMoves);
  };

  const handleToggleVoiceFeedback = () => {
    const next = !voiceState.voiceFeedbackEnabled;
    voiceControl.setVoiceFeedbackEnabled(next);
    setVoiceState((prev) => ({ ...prev, voiceFeedbackEnabled: next }));
  };

  const handleSimulateVoiceCommand = (cmd: string) => {
    voiceControl.processSpokenText(cmd, getLegalMoves);
  };

  const handleSetControlMode = (mode: ControlMode) => {
    setControlMode(mode);
    setPlayerProfile((prev) => ({ ...prev, controlMode: mode }));
    localStorage.setItem('spatial_chess_control_mode', mode);

    if (mode === 'voice') {
      voiceControl.startListening(getLegalMoves);
    } else {
      voiceControl.stopListening();
      if (!isCameraActive && videoRef.current) {
        setIsCameraActive(true);
        handTracker.initialize(videoRef.current);
      }
    }
  };

  // Onboarding Step 1 -> Opens Step 2 (Control Mode Selection)
  const handleStartFromOnboarding = (profile: PlayerProfile) => {
    setPlayerProfile(profile);
    localStorage.setItem('spatial_chess_player_name', profile.name);
    localStorage.setItem('spatial_chess_player_side', profile.side);
    localStorage.setItem('spatial_chess_player_diff', profile.difficulty);
    setBotDifficulty(profile.difficulty);

    // Transition from Screen 1 to Screen 2
    setShowOnboarding(false);
    setShowControlModeModal(true);
  };

  // Onboarding Step 2: Select Control Mode & Open Step 3 (Match Setup)
  const handleSelectControlMode = (selectedMode: ControlMode) => {
    setControlMode(selectedMode);
    setPlayerProfile((prev) => ({ ...prev, controlMode: selectedMode }));
    localStorage.setItem('spatial_chess_control_mode', selectedMode);
    setShowControlModeModal(false);
    setShowMatchSetupModal(true);
  };

  const handleBackToOnboarding = () => {
    setShowControlModeModal(false);
    setShowOnboarding(true);
  };

  const handleBackToControlMode = () => {
    setShowMatchSetupModal(false);
    setShowControlModeModal(true);
  };

  // Onboarding Step 3: Finalize Side, Game Mode & Difficulty -> Launch Match
  const handleConfirmMatchSetup = (config: {
    side: PieceColor;
    gameMode: GameMode;
    difficulty: BotDifficulty;
    roomId?: string;
    controlMode?: ControlMode;
    name?: string;
  }) => {
    const chosenMode = config.controlMode ?? controlMode;
    const chosenName = config.name ?? playerProfile.name;
    // Save player preferences
    setPlayerProfile((prev) => ({
      ...prev,
      side: config.side,
      difficulty: config.difficulty,
    }));
    localStorage.setItem('spatial_chess_player_side', config.side);
    localStorage.setItem('spatial_chess_player_diff', config.difficulty);
    setBotDifficulty(config.difficulty);
    handleSetGameMode(config.gameMode);

    sessionStorage.setItem('spatial_chess_onboarded', 'true');
    setShowMatchSetupModal(false);

    // Auto-adjust camera view to player's perspective
    const targetCameraPreset: CameraPreset =
      config.gameMode === 'two-player' ? 'white' : config.side === 'b' ? 'black' : 'white';
    setCameraPreset(targetCameraPreset);
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setCameraPreset(targetCameraPreset);
      sceneManagerRef.current.setCoordinatesVisible(true);
    }

    // Launch appropriate control format
    if (chosenMode === 'voice') {
      voiceControl.startListening(getLegalMoves);
    } else {
      voiceControl.stopListening();
      if (!isCameraActive && videoRef.current) {
        setIsCameraActive(true);
        handTracker.initialize(videoRef.current);
      }
    }

    // Handle online multiplayer or reset game to clean starting board
    if (config.gameMode === 'online' && config.roomId) {
      handleStartOnlineMatch(config.roomId, chosenName || 'Player 1', config.side);
    } else {
      handleResetGame();
    }

    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
  };

  // The book was confirmed: name, control style, army, format and engine depth in one go
  const handleStudyComplete = (sel: StudySelection) => {
    const mode: ControlMode = sel.control === 'gesture' ? 'virtual' : 'voice';
    const name = sel.name || 'Grandmaster';
    setPlayerProfile((prev) => ({ ...prev, name, controlMode: mode }));
    localStorage.setItem('spatial_chess_player_name', name);
    setControlMode(mode);
    localStorage.setItem('spatial_chess_control_mode', mode);
    setShowOnboarding(false);
    handleConfirmMatchSetup({
      side: sel.side,
      gameMode: sel.format,
      difficulty: sel.difficulty || botDifficulty,
      roomId: sel.roomId,
      controlMode: mode,
      name,
    });
  };
  handleStudyCompleteRef.current = handleStudyComplete;

  // Profile button: open the book at the profile chapter, written for the match as it stands
  const handleOpenProfileBook = (): boolean => {
    const opened = !!sceneManagerRef.current?.openStudyProfile({
      name: playerProfile.name,
      side: playerProfile.side,
      control: controlMode === 'virtual' ? 'gesture' : controlMode,
      format: gameMode,
      difficulty: botDifficulty,
      moves: moves.length,
    });
    if (opened) setProfileBookOpen(true);
    return opened;
  };
  // "Apply" in the profile chapter: only what changed is touched, so the match on the board carries on
  handleProfileApplyRef.current = (sel) => {
    const mode: ControlMode = sel.control === 'gesture' ? 'virtual' : sel.control;
    if (mode !== controlMode) handleSetControlMode(mode);
    if (sel.side !== playerProfile.side) {   // a new army means a new match
      handleConfirmMatchSetup({ side: sel.side, gameMode: sel.format, difficulty: sel.difficulty || botDifficulty, roomId: sel.roomId, controlMode: mode, name: playerProfile.name });
      return;
    }
    if (sel.difficulty && sel.difficulty !== botDifficulty) {
      setBotDifficulty(sel.difficulty);
      localStorage.setItem('spatial_chess_player_diff', sel.difficulty);
    }
    if (sel.format !== gameMode) {
      handleSetGameMode(sel.format);
      if (sel.format === 'online') handleStartOnlineMatch(sel.roomId, playerProfile.name || 'Player 1', playerProfile.side);
    }
  };
  // The book is shut and the camera is back over the board; carry out a standing order if one was tapped
  handleProfileClosedRef.current = (order) => {
    setProfileBookOpen(false);
    if (order === 'reset') handleResetGame();
    else if (order === 'howto') setShowHowToPlay(true);
    else if (order === 'signout') handleSignOut();
  };

  // Onboarding lives in the 3D study: show its landing page when asked, go to the board when it is skipped
  useEffect(() => {
    const scene = sceneManagerRef.current;
    if (!scene) return;
    if (showOnboarding) {
      const input = document.getElementById('player-name') as HTMLInputElement | null;
      if (input && !input.value && playerProfile.name && playerProfile.name !== 'Grandmaster') input.value = playerProfile.name;
      scene.showStudyLanding();
    } else if (scene.isInStudyOnboarding()) {
      scene.enterStudyGame();
    }
  }, [showOnboarding]);

  // Returning players go straight to the board: turn voice back on if that is their control style.
  // If the browser wants a user gesture first, the first tap or key press starts it.
  useEffect(() => {
    if (showOnboarding || controlMode !== 'voice') return;
    if (!voiceControl.getIsListening()) voiceControl.startListening(getLegalMoves);
    const onFirstGesture = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('button')) return;   // a button (e.g. the mic toggle) handles itself
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      if (!voiceControl.getIsListening()) voiceControl.startListening(getLegalMoves);
    };
    window.addEventListener('pointerdown', onFirstGesture);
    window.addEventListener('keydown', onFirstGesture);
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnboarding, controlMode]);

  const handleSkipOnboarding = () => {
    sessionStorage.setItem('spatial_chess_onboarded', 'true');
    setShowOnboarding(false);
    setShowControlModeModal(false);
    setShowMatchSetupModal(false);
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setCameraPreset(cameraPreset);
      sceneManagerRef.current.syncWithChess(chessRef.current);
      sceneManagerRef.current.setCoordinatesVisible(true);
    }
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
  };

  // Undo Last Move (or request takeback in Online match)
  const handleUndoMove = useCallback(() => {
    if (gameMode === 'online') {
      multiplayer.requestUndo();
      setMultiplayerState((prev) => ({ ...prev, pendingUndoFromMe: true }));
      return;
    }

    const chess = chessRef.current;
    if (chess.history().length === 0) return;

    // Halt any pending bot actions immediately
    setIsBotThinking(false);
    setIsBotMoving(false);

    // Undo the move
    chess.undo();
    // In vs-bot, if it became the bot's turn (we undid bot's move), undo the human move as well
    if (gameMode === 'vs-bot' && chess.turn() === botSide && chess.history().length > 0) {
      chess.undo();
    }

    const currentTurnAfterUndo = chess.turn();
    setCurrentTurn(currentTurnAfterUndo);
    setIsInCheck(chess.inCheck());
    setGameOver(null);
    setPendingPromotion(null);
    updateCapturedPieces();

    if (gameMode === 'two-player' && autoRotatePassAndPlay) {
      const targetSidePreset: CameraPreset = currentTurnAfterUndo === 'b' ? 'black' : 'white';
      setCameraPreset(targetSidePreset);
      if (sceneManagerRef.current) {
        sceneManagerRef.current.setCameraPreset(targetSidePreset);
      }
    }

    // Reconstruct moves list accurately from chess.js engine history
    const historyMoves = chess.history({ verbose: true });
    const reconstructed: MoveRecord[] = historyMoves.map((m) => ({
      san: m.san,
      from: m.from,
      to: m.to,
      color: m.color,
      piece: m.piece as PieceType,
      captured: m.captured as PieceType,
      flags: m.flags,
      timestamp: Date.now(),
    }));
    setMoves(reconstructed);

    if (sceneManagerRef.current) {
      sceneManagerRef.current.cancelOngoingAnimations(true);
      sceneManagerRef.current.syncWithChess(chess, false);
    }
    soundEffects.playMoveSound();
  }, [botSide, gameMode, updateCapturedPieces, autoRotatePassAndPlay]);

  // Rewind / Jump to any past move in the move history
  const handleJumpToMove = useCallback(
    (targetIndex: number) => {
      const chess = chessRef.current;
      const totalHistory = chess.history().length;
      if (targetIndex < -1 || targetIndex >= totalHistory - 1) return;

      setIsBotThinking(false);
      setIsBotMoving(false);

      const movesToUndo = totalHistory - (targetIndex + 1);
      for (let i = 0; i < movesToUndo; i++) {
        chess.undo();
      }

      const currentTurnAfterJump = chess.turn();
      setCurrentTurn(currentTurnAfterJump);
      setIsInCheck(chess.inCheck());
      setGameOver(null);
      setPendingPromotion(null);
      updateCapturedPieces();

      if (gameMode === 'two-player' && autoRotatePassAndPlay) {
        const activeSidePreset: CameraPreset = currentTurnAfterJump === 'b' ? 'black' : 'white';
        setCameraPreset(activeSidePreset);
        if (sceneManagerRef.current) {
          sceneManagerRef.current.setCameraPreset(activeSidePreset);
        }
      }

      const historyMoves = chess.history({ verbose: true });
      const reconstructed: MoveRecord[] = historyMoves.map((m) => ({
        san: m.san,
        from: m.from,
        to: m.to,
        color: m.color,
        piece: m.piece as PieceType,
        captured: m.captured as PieceType,
        flags: m.flags,
        timestamp: Date.now(),
      }));
      setMoves(reconstructed);

      if (sceneManagerRef.current) {
        sceneManagerRef.current.cancelOngoingAnimations(true);
        sceneManagerRef.current.syncWithChess(chess, false);
      }
      soundEffects.playMoveSound();
    },
    [updateCapturedPieces]
  );

  // Camera preset handler
  const handleSetCameraPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setCameraPreset(preset);
    }
  };

  // Toggle Camera
  const handleToggleCamera = () => {
    if (isCameraActive) {
      handTracker.stop();
      setIsCameraActive(false);
    } else {
      setIsCameraActive(true);
      if (videoRef.current) {
        handTracker.initialize(videoRef.current).then((success) => {
          if (!success) {
            setIsCameraActive(false);
          }
        });
      }
    }
  };

  // Restart Camera
  const handleRestartCamera = () => {
    handTracker.stop();
    setIsCameraActive(true);
    if (videoRef.current) {
      handTracker.initialize(videoRef.current).then((success) => {
        if (!success) {
          setIsCameraActive(false);
        }
      });
    }
  };

  // Toggle Sound Mute
  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    soundEffects.isMuted = nextMute;
    royalBattleMusic.setMuted(nextMute);
  };

  // 1€ Filter Configuration Handlers
  const handleUpdateFilterParams = (params: Partial<OneEuroFilterParams>) => {
    handTracker.setFilterParams(params);
  };

  const handleResetFilterParams = () => {
    handTracker.resetFilterParams();
  };

  // Sign Out Handler - clears session/profile and opens onboarding/sign-in view
  const handleSignOut = useCallback(() => {
    sessionStorage.removeItem('spatial_chess_onboarded');
    localStorage.removeItem('spatial_chess_player_name');
    localStorage.removeItem('spatial_chess_player_side');
    localStorage.removeItem('spatial_chess_player_diff');
    setPlayerProfile({
      name: 'Grandmaster',
      side: 'w',
      difficulty: 'medium',
      controlMode: 'mouse',
    });
    setShowControlModeModal(false);
    setShowMatchSetupModal(false);
    setShowOnboarding(true);
    handleResetGame();
  }, [handleResetGame]);

  return (
    <div id="spatial-chess-app" className="relative w-screen h-screen bg-[#050403] overflow-hidden select-none">
      {/* Opening title over the study while it loads */}
      <IntroSplash />

      {/* Three.js 3D WebGL Canvas Viewport (the study: landing page, onboarding book and the board) */}
      <div ref={threeContainerRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing z-10" />

      {/* Full screen on the landing page and the book, where the board's top bar is not shown */}
      {showOnboarding && !profileBookOpen && (
        <FullscreenButton className="fixed top-3 right-6 sm:right-10 z-[60]" />
      )}

      {/* Top HUD Controls & Turn Status */}
      {!boardUiHidden && (
      <GameControls
        gameMode={gameMode}
        botDifficulty={botDifficulty}
        currentTurn={currentTurn}
        isInCheck={isInCheck}
        isBotThinking={isBotThinking}
        isBotMoving={isBotMoving}
        onlineSide={gameMode === 'online' && (multiplayerState.mySide === 'w' || multiplayerState.mySide === 'b') ? multiplayerState.mySide : null}
        cameraPreset={cameraPreset}
        isMuted={isMuted}
        capturedPieces={capturedPieces}
        moves={moves}
        isCameraActive={isCameraActive}
        isTrackingActive={trackingState.isEnabled && trackingState.isHandDetected}
        playerName={playerProfile.name}
        playerColor={playerProfile.side}
        controlMode={controlMode}
        autoRotatePassAndPlay={autoRotatePassAndPlay}
        onToggleAutoRotatePassAndPlay={handleToggleAutoRotatePassAndPlay}
        onFlipPassAndPlaySide={handleFlipPassAndPlaySide}
        onSetControlMode={handleSetControlMode}
        onSetGameMode={handleSetGameMode}
        onOpenMultiplayer={() => setShowMultiplayerModal(true)}
        onStartOnlineMatch={handleStartOnlineMatch}
        onSetBotDifficulty={setBotDifficulty}
        onSetCameraPreset={handleSetCameraPreset}
        onToggleMute={handleToggleMute}
        onUndoMove={handleUndoMove}
        onResetGame={handleResetGame}
        onOpenHowToPlay={() => setShowHowToPlay(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenOnboarding={() => setShowOnboarding(true)}
        onSignOut={handleSignOut}
        onOpenProfile={handleOpenProfileBook}
      />
      )}

      {/* Pass & Play Turn Switch Announcement Banner */}
      {passAndPlayBanner && gameMode === 'two-player' && (
        <div
          id="pass-and-play-turn-banner"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none transition-all duration-300 animate-fadeIn"
        >
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-[#f7f2e7]/95 border border-[#821e25]/40 shadow-[0_4px_20px_rgba(61,29,7,0.35)] backdrop-blur-xs text-[#1f0d04]">
            <div
              className={`w-3 h-3 rounded-full border ${
                passAndPlayBanner.color === 'w'
                  ? 'bg-[#fff6e3] border-[#7d481b]/50 shadow-inner'
                  : 'bg-[#1f0d04] border-[#d4af37]/60 shadow-xs'
              }`}
            />
            <span className="font-cinzel text-xs sm:text-sm font-bold tracking-wider text-[#821e25]">
              {passAndPlayBanner.text}
            </span>
            <span className="text-[10px] font-cormorant italic text-[#5c3010] hidden sm:inline">
              &bull; Rotating battlefield
            </span>
          </div>
        </div>
      )}

      {/* Spatial Pickup Pointer & Reticle Overlay (Only when in Virtual Gestures mode) */}
      {controlMode === 'virtual' && !boardUiHidden && (
        <SpatialPointer
          trackingState={trackingState}
          hoverInfo={hoverInfo}
          isPieceGrabbed={trackingState.isPinching}
        />
      )}

      {/* Player Vision & Camera PIP (Bottom-Left) in Codex Parchment Style */}
      {controlMode === 'virtual' && gameMode !== 'online' && !boardUiHidden && !showControlModeModal && !showMatchSetupModal ? (
        <HandCameraPIP
          trackingState={trackingState}
          videoRef={videoRef}
          onToggleCamera={handleToggleCamera}
          onRestartCamera={handleRestartCamera}
          isCameraActive={isCameraActive}
          onOpenSettings={() => setShowSettings(true)}
        />
      ) : (
        /* Fallback hidden video element for MediaPipe Hand Tracking when PIP is hidden or during online match */
        <video
          ref={videoRef as React.RefObject<HTMLVideoElement>}
          autoPlay
          playsInline
          muted
          className="hidden pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Interactive Move Chronicle & Rewind Panel in Codex Parchment Style */}
      {!boardUiHidden && !showControlModeModal && !showMatchSetupModal && (
        <MoveHistory
          moves={moves}
          trackingState={trackingState}
          onJumpToMove={handleJumpToMove}
          placement={gameMode === 'online' ? 'left' : 'right'}
        />
      )}

      {/* Voice Control Floating HUD (Active only in Voice Control Mode, styled in codex parchment) */}
      {controlMode === 'voice' && !boardUiHidden && !showControlModeModal && !showMatchSetupModal && (
        <VoiceControlHUD
          voiceState={voiceState}
          currentTurn={currentTurn}
          playerColor={playerProfile.side}
          onToggleMic={handleToggleVoiceMic}
          onToggleFeedback={handleToggleVoiceFeedback}
          onSimulateCommand={handleSimulateVoiceCommand}
        />
      )}

      {/* Pawn Promotion Modal */}
      {pendingPromotion && (
        <PromotionModal
          color={currentTurn}
          onSelectPiece={handlePromotionSelect}
        />
      )}

      {/* Dev-only preview of the winner screen: open the game with ?preview=victory (or ?preview=draw) */}
      {(import.meta as any).env?.DEV && !gameOver && previewRun > 0 && ['victory', 'draw'].includes(new URLSearchParams(window.location.search).get('preview') || '') && (
        <GameOverModal
          key={previewRun}
          winner={new URLSearchParams(window.location.search).get('preview') === 'draw' ? 'draw' : 'w'}
          reason={new URLSearchParams(window.location.search).get('preview') === 'draw' ? 'Stalemate: no legal moves remain' : 'White delivered checkmate!'}
          onRestart={() => setPreviewRun((n) => n + 1)}
          onClose={() => setPreviewRun((n) => n + 1)}
        />
      )}

      {/* Game Over Celebration Modal */}
      {gameOver && (
        <GameOverModal
          winner={gameOver.winner}
          reason={gameOver.reason}
          onRestart={handleResetGame}
          onClose={() => setGameOver(null)}
        />
      )}

      {/* How to Play & Rules Guide */}
      {showHowToPlay && (
        <HowToPlayModal
          controlMode={controlMode}
          onClose={() => setShowHowToPlay(false)}
        />
      )}

      {/* 1€ Filter Sensitivity & Tracking Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        filterParams={trackingState.filterParams || handTracker.getFilterParams()}
        trackingState={trackingState}
        onUpdateFilterParams={handleUpdateFilterParams}
        onResetFilterParams={handleResetFilterParams}
      />

      {/* Cinematic Video Tutorial Modal (Created with Google Flow / Nano Banana Engine) */}
      <VideoTutorialModal
        isOpen={showVideoTutorial}
        onClose={() => setShowVideoTutorial(false)}
        onStartMatch={() => setShowVideoTutorial(false)}
        playerName={playerProfile.name}
        playerColor={playerProfile.side}
      />

      {/* Online Match Invitation & Lobby Modal */}
      <MultiplayerModal
        isOpen={showMultiplayerModal}
        onClose={() => setShowMultiplayerModal(false)}
        onStartOnlineMatch={handleStartOnlineMatch}
        initialRoomId={initialInviteRoom}
        controlMode={controlMode}
      />

      {/* Imperial Courier 2-Step Duel Invocation Screen for Opponent */}
      <CourierInviteScreen
        isOpen={showCourierInvite}
        inviteData={courierInviteData}
        onEnterBattle={handleCourierEnterBattle}
        onCancel={() => {
          setShowCourierInvite(false);
          setShowOnboarding(true);
        }}
      />

      {/* Peer-to-Peer Online Real-Time Webcam & Match Control Folio Card */}
      {gameMode === 'online' && (
        <OpponentVideoCard
          opponent={multiplayerState.opponent}
          remoteStream={remoteStream}
          localStream={localStream}
          mySide={multiplayerState.mySide}
          currentTurn={currentTurn}
          isMyTurn={currentTurn === multiplayerState.mySide}
          isInCheck={isInCheck}
          matchStatus={multiplayerState.matchStatus}
          pendingUndoFromOpponent={multiplayerState.pendingUndoFromOpponent}
          pendingDrawFromOpponent={multiplayerState.pendingDrawFromOpponent}
          onAcceptUndo={() => multiplayer.acceptUndo()}
          onDeclineUndo={() => multiplayer.declineUndo()}
          onAcceptDraw={() => multiplayer.acceptDraw()}
          onDeclineDraw={() => multiplayer.declineDraw()}
          onResign={() => multiplayer.resign()}
          onOfferDraw={() => {
            multiplayer.offerDraw();
            setMultiplayerState((prev) => ({ ...prev, pendingDrawFromMe: true }));
          }}
          onRequestUndo={() => {
            multiplayer.requestUndo();
            setMultiplayerState((prev) => ({ ...prev, pendingUndoFromMe: true }));
          }}
        />
      )}

      {/* Online duel status: the same pill as the game's live move readout (GameControls), in the same place.
          It covers the wait for the rival; from the first move on, the move readout itself takes over */}
      {gameMode === 'online' && !boardUiHidden && moves.length === 0 && (
        <div className="fixed top-0 left-0 right-0 h-16 sm:h-18 z-40 flex items-center justify-center pointer-events-none select-none">
          <div id="online-match-top-banner" className="hud-paper flex items-center gap-2 px-3.5 py-1 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#821e25] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#821e25]"></span>
            </span>
            <span className="font-cormorant italic text-xs sm:text-sm text-[#7d481b]">
              {multiplayerState.opponent?.connected ? 'Rival:' : 'Awaiting'}
            </span>
            <span className="font-cinzel font-bold text-xs sm:text-sm text-[#1f0d04] tracking-wider truncate max-w-[40vw]">
              {multiplayerState.opponent?.connected ? multiplayerState.opponent.name : 'Rival'}
            </span>
            {multiplayerState.opponent?.connected && (multiplayerState.mySide === 'w' || multiplayerState.mySide === 'b') && (
              <TurnChip currentTurn={currentTurn} mySide={multiplayerState.mySide} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
