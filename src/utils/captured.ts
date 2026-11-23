import type { Chess } from 'chess.js';
import type { PieceType } from '../types';

const START: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const ORDER: PieceType[] = ['p', 'n', 'b', 'r', 'q'];

/**
 * The pieces each side has lost, in the order they fell.
 * The move history gives the order, but an online game reloads the position from the server
 * (rejoin, takeback, a resync) and that clears the history. So the board itself decides what
 * is gone: anything missing that the history does not explain goes in front, in a fixed order.
 */
export function lostPieces(chess: Chess): { w: PieceType[]; b: PieceType[] } {
  const fromHistory: { w: PieceType[]; b: PieceType[] } = { w: [], b: [] };
  for (const m of chess.history({ verbose: true })) {
    if (m.captured) fromHistory[m.color === 'w' ? 'b' : 'w'].push(m.captured as PieceType);
  }

  const onBoard = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 } as Record<string, number>, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } as Record<string, number> };
  for (const row of chess.board()) for (const sq of row) if (sq && sq.type !== 'k') onBoard[sq.color][sq.type]++;

  const result = { w: [] as PieceType[], b: [] as PieceType[] };
  for (const side of ['w', 'b'] as const) {
    const count = onBoard[side];
    const missing: Record<string, number> = {};
    let promoted = 0;
    for (const t of ['n', 'b', 'r', 'q']) {
      promoted += Math.max(0, count[t] - START[t]);
      missing[t] = Math.max(0, START[t] - count[t]);
    }
    missing.p = Math.max(0, 8 - count.p - promoted);

    const explained: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    for (const t of fromHistory[side]) explained[t]++;
    const front: PieceType[] = [];
    for (const t of ORDER) for (let i = explained[t]; i < missing[t]; i++) front.push(t);
    result[side] = [...front, ...fromHistory[side]];
  }
  return result;
}
