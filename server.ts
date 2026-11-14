import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';
import { createServer as createViteServer } from 'vite';

interface PlayerConnection {
  id: string;
  name: string;
  side: 'w' | 'b';
  ws: WebSocket;
  cameraReady: boolean;
  micMuted: boolean;
  videoOff: boolean;
}

interface RoomState {
  roomId: string;
  white?: PlayerConnection;
  black?: PlayerConnection;
  spectators: Map<string, { id: string; name: string; ws: WebSocket }>;
  chess: Chess;
  moves: Array<{
    san: string;
    from: string;
    to: string;
    color: string;
    piece: string;
    captured?: string;
    flags: string;
    timestamp: number;
  }>;
  status: 'waiting' | 'active' | 'ended';
  result?: string;
  hostSide?: 'w' | 'b';
  hostName?: string;
  controlMode?: 'virtual' | 'mouse' | 'voice';
  pendingUndo?: {
    requestedBy: 'w' | 'b';
  };
  pendingDraw?: {
    offeredBy: 'w' | 'b';
  };
  lastActivity: number;
}

const rooms = new Map<string, RoomState>();

// Periodic cleanup of stale rooms (inactive for > 4 hours)
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > 4 * 60 * 60 * 1000) {
      rooms.delete(roomId);
    }
  }
}, 10 * 60 * 1000);

function getRoom(roomId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      spectators: new Map(),
      chess: new Chess(),
      moves: [],
      status: 'waiting',
      lastActivity: Date.now(),
    };
    rooms.set(roomId, room);
  }
  room.lastActivity = Date.now();
  return room;
}

function broadcastToRoom(room: RoomState, msg: any, excludeWs?: WebSocket) {
  const data = JSON.stringify(msg);
  if (room.white && room.white.ws !== excludeWs && room.white.ws.readyState === WebSocket.OPEN) {
    room.white.ws.send(data);
  }
  if (room.black && room.black.ws !== excludeWs && room.black.ws.readyState === WebSocket.OPEN) {
    room.black.ws.send(data);
  }
  for (const spectator of room.spectators.values()) {
    if (spectator.ws !== excludeWs && spectator.ws.readyState === WebSocket.OPEN) {
      spectator.ws.send(data);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;   // hosts such as Render set PORT; 3000 locally
  const server = http.createServer(app);

  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'autoplay=*');
    // The game can be served from elsewhere (GitHub Pages) and still ask about rooms
    if (req.path.startsWith('/api/')) res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });

  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', activeRooms: rooms.size });
  });

  // Room metadata query
  app.get('/api/room/:roomId', (req, res) => {
    const { roomId } = req.params;
    const room = rooms.get(roomId);
    if (!room) {
      return res.json({ exists: false });
    }
    return res.json({
      exists: true,
      hasWhite: !!room.white,
      hasBlack: !!room.black,
      hostName: room.hostName,
      hostSide: room.hostSide,
      controlMode: room.controlMode || 'virtual',
      status: room.status,
      moveCount: room.moves.length,
      currentTurn: room.chess.turn(),
    });
  });

  // Attach WebSocket Server with dedicated path and clean upgrade handling
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const pathname = request.url ? new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname : '';
      const secProtocol = request.headers['sec-websocket-protocol'] || '';
      // Let Vite HMR handle its own upgrade traffic
      if (typeof secProtocol === 'string' && secProtocol.includes('vite-hmr')) {
        return;
      }
      if (pathname.startsWith('/@vite') || pathname.startsWith('/@fs')) {
        return;
      }

      if (pathname === '/api/ws' || pathname === '/ws' || pathname === '/') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch (err) {
      console.error('[WS Upgrade Error]:', err);
    }
  });

  // Keep-alive heartbeat interval to prevent Cloud Run / browser idle timeouts
  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    }
  }, 15000);

  wss.on('connection', (ws: WebSocket) => {
    let clientRoomId: string | null = null;
    let clientId: string = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let clientSide: 'w' | 'b' | 'spectator' | null = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { type, roomId } = msg;

        // Heartbeat response
        if (type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }

        if (type === 'join_room') {
          const { playerName = 'Player', preferredSide = 'random', controlMode = 'virtual' } = msg;
          clientRoomId = roomId;
          const room = getRoom(roomId);

          const whiteConnected = !!(room.white && room.white.ws.readyState === WebSocket.OPEN);
          const blackConnected = !!(room.black && room.black.ws.readyState === WebSocket.OPEN);

          // Assign color side with robust reconnection handling
          let assignedSide: 'w' | 'b' | 'spectator' = 'spectator';

          if (room.white && (room.white.id === clientId || room.white.name === playerName || !whiteConnected) && preferredSide !== 'b') {
            assignedSide = 'w';
          } else if (room.black && (room.black.id === clientId || room.black.name === playerName || !blackConnected) && preferredSide !== 'w') {
            assignedSide = 'b';
          } else if (!whiteConnected && !blackConnected) {
            // First player to join (Host)
            if (preferredSide === 'b') {
              assignedSide = 'b';
            } else if (preferredSide === 'w') {
              assignedSide = 'w';
            } else {
              assignedSide = Math.random() < 0.5 ? 'w' : 'b';
            }
            room.hostName = playerName;
            room.hostSide = assignedSide;
            room.controlMode = controlMode;
          } else if (!whiteConnected && blackConnected) {
            assignedSide = 'w';
          } else if (whiteConnected && !blackConnected) {
            assignedSide = 'b';
          } else if (preferredSide === 'w' && !whiteConnected) {
            assignedSide = 'w';
          } else if (preferredSide === 'b' && !blackConnected) {
            assignedSide = 'b';
          } else {
            assignedSide = 'spectator';
          }

          clientSide = assignedSide;

          if (assignedSide === 'w') {
            room.white = {
              id: clientId,
              name: playerName,
              side: 'w',
              ws,
              cameraReady: false,
              micMuted: false,
              videoOff: false,
            };
          } else if (assignedSide === 'b') {
            room.black = {
              id: clientId,
              name: playerName,
              side: 'b',
              ws,
              cameraReady: false,
              micMuted: false,
              videoOff: false,
            };
          } else {
            room.spectators.set(clientId, { id: clientId, name: playerName, ws });
          }

          // Check if match is now active (both players present)
          if (room.white && room.black && room.status === 'waiting') {
            room.status = 'active';
          }

          const opponent =
            assignedSide === 'w'
              ? room.black
              : assignedSide === 'b'
              ? room.white
              : undefined;

          // Send confirmation to joining player
          ws.send(
            JSON.stringify({
              type: 'room_joined',
              roomId,
              playerId: clientId,
              side: assignedSide,
              hostName: room.hostName,
              hostSide: room.hostSide,
              controlMode: room.controlMode,
              status: room.status,
              fen: room.chess.fen(),
              turn: room.chess.turn(),
              moves: room.moves,
              opponent: opponent
                ? {
                    id: opponent.id,
                    name: opponent.name,
                    side: opponent.side,
                    connected: true,
                    micMuted: opponent.micMuted,
                    videoOff: opponent.videoOff,
                  }
                : null,
            })
          );

          // Notify existing opponent that player joined
          if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
            opponent.ws.send(
              JSON.stringify({
                type: 'player_joined',
                opponent: {
                  id: clientId,
                  name: playerName,
                  side: assignedSide,
                  connected: true,
                  micMuted: false,
                  videoOff: false,
                },
                status: room.status,
              })
            );
          }

          return;
        }

        if (!clientRoomId) return;
        const room = rooms.get(clientRoomId);
        if (!room) return;
        room.lastActivity = Date.now();

        // 1. Move Execution
        if (type === 'make_move') {
          const { from, to, promotion = 'q' } = msg;
          const currentTurn = room.chess.turn();

          // Enforce side turn permissions
          if (clientSide !== currentTurn) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: "It is not your turn to play.",
                fen: room.chess.fen(),
                turn: room.chess.turn(),
                moves: room.moves,
              })
            );
            return;
          }

          try {
            const moveResult = room.chess.move({
              from,
              to,
              promotion,
            });

            if (moveResult) {
              const record = {
                san: moveResult.san,
                from: moveResult.from,
                to: moveResult.to,
                color: moveResult.color,
                piece: moveResult.piece,
                captured: moveResult.captured,
                flags: moveResult.flags,
                timestamp: Date.now(),
              };
              room.moves.push(record);

              let gameOverReason: string | undefined;
              if (room.chess.isCheckmate()) {
                gameOverReason = `Checkmate! ${moveResult.color === 'w' ? 'White' : 'Black'} wins!`;
                room.status = 'ended';
                room.result = gameOverReason;
              } else if (room.chess.isDraw()) {
                gameOverReason = 'Match drawn.';
                room.status = 'ended';
                room.result = gameOverReason;
              }

              broadcastToRoom(room, {
                type: 'move_made',
                move: record,
                fen: room.chess.fen(),
                turn: room.chess.turn(),
                inCheck: room.chess.inCheck(),
                isGameOver: room.chess.isGameOver(),
                result: gameOverReason,
                moves: room.moves,
              });
            } else {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Illegal move.',
                fen: room.chess.fen(),
                turn: room.chess.turn(),
                moves: room.moves,
              }));
            }
          } catch (err: any) {
            ws.send(JSON.stringify({
              type: 'error',
              message: err?.message || 'Invalid move.',
              fen: room.chess.fen(),
              turn: room.chess.turn(),
              moves: room.moves,
            }));
          }
          return;
        }

        // 2. Undo Request & Response
        if (type === 'request_undo') {
          if (clientSide === 'spectator') return;
          const opponent = clientSide === 'w' ? room.black : room.white;
          if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
            room.pendingUndo = { requestedBy: clientSide! };
            opponent.ws.send(
              JSON.stringify({
                type: 'undo_requested',
                requestedBy: clientSide,
              })
            );
          }
          return;
        }

        if (type === 'respond_undo') {
          const { accept } = msg;
          if (room.pendingUndo) {
            const requester = room.pendingUndo.requestedBy === 'w' ? room.white : room.black;
            if (accept) {
              // Undo move(s) on server state
              room.chess.undo();
              room.moves.pop();

              broadcastToRoom(room, {
                type: 'undo_executed',
                fen: room.chess.fen(),
                turn: room.chess.turn(),
                moves: room.moves,
                inCheck: room.chess.inCheck(),
              });
            } else {
              if (requester && requester.ws.readyState === WebSocket.OPEN) {
                requester.ws.send(
                  JSON.stringify({
                    type: 'undo_declined',
                  })
                );
              }
            }
            room.pendingUndo = undefined;
          }
          return;
        }

        // 3. Draw Offer & Response
        if (type === 'offer_draw') {
          if (clientSide === 'spectator') return;
          const opponent = clientSide === 'w' ? room.black : room.white;
          if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
            room.pendingDraw = { offeredBy: clientSide! };
            opponent.ws.send(
              JSON.stringify({
                type: 'draw_offered',
                offeredBy: clientSide,
              })
            );
          }
          return;
        }

        if (type === 'respond_draw') {
          const { accept } = msg;
          if (room.pendingDraw) {
            if (accept) {
              room.status = 'ended';
              room.result = 'Draw agreed by both players.';
              broadcastToRoom(room, {
                type: 'game_ended',
                result: room.result,
              });
            } else {
              const offerer = room.pendingDraw.offeredBy === 'w' ? room.white : room.black;
              if (offerer && offerer.ws.readyState === WebSocket.OPEN) {
                offerer.ws.send(JSON.stringify({ type: 'draw_declined' }));
              }
            }
            room.pendingDraw = undefined;
          }
          return;
        }

        // 4. Resignation
        if (type === 'resign') {
          if (clientSide === 'spectator') return;
          const winner = clientSide === 'w' ? 'Black' : 'White';
          room.status = 'ended';
          room.result = `${clientSide === 'w' ? 'White' : 'Black'} resigned. ${winner} wins!`;
          broadcastToRoom(room, {
            type: 'game_ended',
            result: room.result,
          });
          return;
        }

        // 5. WebRTC Peer-to-Peer Signaling (Video & Audio exchange)
        if (type === 'signal_offer' || type === 'signal_answer' || type === 'signal_ice') {
          const targetOpponent = clientSide === 'w' ? room.black : clientSide === 'b' ? room.white : null;
          if (targetOpponent && targetOpponent.ws.readyState === WebSocket.OPEN) {
            targetOpponent.ws.send(
              JSON.stringify({
                type,
                sender: clientSide,
                data: msg.data,
              })
            );
          } else {
            console.log(`[Signaling] ${type} from ${clientSide} waiting for opponent in room ${clientRoomId}`);
          }
          return;
        }

        // 6. Media State (Mute/Video toggle notifications)
        if (type === 'media_state') {
          const { micMuted, videoOff } = msg;
          if (clientSide === 'w' && room.white) {
            room.white.micMuted = !!micMuted;
            room.white.videoOff = !!videoOff;
          } else if (clientSide === 'b' && room.black) {
            room.black.micMuted = !!micMuted;
            room.black.videoOff = !!videoOff;
          }
          const opponent = clientSide === 'w' ? room.black : room.white;
          if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
            opponent.ws.send(
              JSON.stringify({
                type: 'opponent_media_state',
                side: clientSide,
                micMuted,
                videoOff,
              })
            );
          }
          return;
        }

        // 7. Restart / Rematch Request
        if (type === 'request_rematch') {
          room.chess.reset();
          room.moves = [];
          room.status = 'active';
          room.result = undefined;
          broadcastToRoom(room, {
            type: 'rematch_started',
            fen: room.chess.fen(),
            turn: room.chess.turn(),
          });
          return;
        }
      } catch (err) {
        console.error('[Server WS Error]:', err);
      }
    });

    ws.on('close', () => {
      if (!clientRoomId) return;
      const room = rooms.get(clientRoomId);
      if (!room) return;

      if (clientSide === 'w' && room.white?.id === clientId) {
        room.white = undefined;
        if (room.black && room.black.ws.readyState === WebSocket.OPEN) {
          room.black.ws.send(
            JSON.stringify({
              type: 'player_left',
              side: 'w',
            })
          );
        }
      } else if (clientSide === 'b' && room.black?.id === clientId) {
        room.black = undefined;
        if (room.white && room.white.ws.readyState === WebSocket.OPEN) {
          room.white.ws.send(
            JSON.stringify({
              type: 'player_left',
              side: 'b',
            })
          );
        }
      } else {
        room.spectators.delete(clientId);
      }

      if (!room.white && !room.black && room.spectators.size === 0) {
        room.status = 'waiting';
      }
    });
  });

  // Logo download route with attachment header
  app.get('/api/download-logo', (req, res) => {
    const variant = (req.query.variant as string) || 'standard';
    let file = 'shatranj-logo.png';
    if (variant === '4k') file = 'shatranj-logo-4k.png';
    else if (variant === 'dark') file = 'shatranj-logo-dark.png';
    else if (variant === 'crest') file = 'shatranj-crest.png';
    else if (variant === 'crest1024') file = 'shatranj-crest-1024.png';
    else if (variant === 'svg') file = 'shatranj-logo.svg';
    else if (variant === 'page-svg' || variant === 'page') file = 'shatranj-match-setup-page.svg';
    else if (variant === 'folio-svg' || variant === 'folio') file = 'shatranj-codex-folio.svg';
    else if (variant === 'page-png') file = 'shatranj-match-setup-page.png';
    else if (variant === 'folio-png') file = 'shatranj-codex-folio.png';

    const filePath = path.join(process.cwd(), 'public', file);
    res.download(filePath, file);
  });

  app.get('/api/download-page-svg', (req, res) => {
    const type = (req.query.type as string) || 'page';
    const file = type === 'folio' ? 'shatranj-codex-folio.svg' : 'shatranj-match-setup-page.svg';
    const filePath = path.join(process.cwd(), 'public', file);
    res.download(filePath, file);
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Spatial 3D Chess server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
