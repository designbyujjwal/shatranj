import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { MoveRecord, HandTrackingState } from '../types';

interface MoveHistoryProps {
  moves: MoveRecord[];
  trackingState?: HandTrackingState;
  onJumpToMove?: (moveIndex: number) => void;
  placement?: 'left' | 'right';
}

// A quiet running feed of the game: each move arrives at the bottom and the older ones drift up, like a chat
export const MoveHistory: React.FC<MoveHistoryProps> = ({ moves, onJumpToMove, placement = 'right' }) => {
  const [isOpen, setIsOpen] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Follow the newest move
  useEffect(() => {
    const el = listRef.current;
    if (isOpen && el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [isOpen, moves.length]);

  const last = moves.length - 1;

  return (
    <div
      id="move-history-container"
      className={`fixed top-20 sm:top-22 ${placement === 'left' ? 'left-6 sm:left-10' : 'right-6 sm:right-10'} z-30 w-52 select-none text-[#f4ece1] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]`}
    >
      {/* Soft dark haze behind the text: feathered on every side, so no box edge shows */}
      <div className="chronicle-haze absolute -inset-5 -z-10 pointer-events-none" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 cursor-pointer text-[#f4ece1]/80 hover:text-[#f1d48d] transition-colors"
        aria-expanded={isOpen}
      >
        <span className="font-cinzel text-[10px] font-bold uppercase tracking-[0.16em]">Move Chronicle</span>
        <span className="flex items-center gap-1.5">
          <span className="font-cinzel text-[10px] font-bold tabular-nums opacity-70">{moves.length}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {isOpen && (
        <div
          ref={listRef}
          className="chronicle-feed max-h-[9.25rem] overflow-y-auto px-1.5 pb-1.5 border-t border-[#f4ece1]/20"
        >
          {moves.length === 0 ? (
            <p className="text-[#f4ece1]/80 text-center py-3 text-sm font-cormorant italic">Awaiting the first move</p>
          ) : (
            moves.map((move, idx) => {
              const isWhite = idx % 2 === 0;
              const isLast = idx === last;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onJumpToMove?.(idx)}
                  title={onJumpToMove ? `Rewind to ${move.san}` : undefined}
                  className={`chronicle-row w-full flex items-center gap-2 px-1.5 py-1 rounded-md text-left transition-colors ${
                    onJumpToMove ? 'cursor-pointer hover:bg-white/10' : 'cursor-default'
                  } ${isLast ? 'text-[#f1d48d]' : 'text-[#f4ece1]/85'}`}
                >
                  <span className="w-6 font-cinzel text-[10px] font-bold tabular-nums text-[#f4ece1]/60">
                    {isWhite ? `${idx / 2 + 1}.` : ''}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isWhite ? 'bg-white' : 'bg-[#1f0d04] ring-1 ring-[#f4ece1]/60'
                    }`}
                  />
                  <span className={`font-cinzel text-xs ${isLast ? 'font-bold' : 'font-semibold'}`}>{move.san}</span>
                  <span className="ml-auto font-cormorant italic text-xs text-[#f4ece1]/65">
                    {move.from} → {move.to}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
