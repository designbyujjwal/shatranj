import React, { useEffect, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';

/** The round parchment button that takes the whole game in and out of full screen */
export const FullscreenButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);

  // Esc or the browser's own controls can leave full screen too, so follow the document
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      className={`hud-paper w-10 h-10 rounded-full flex items-center justify-center ${className}`}
      title={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
      aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
    >
      {isFullscreen
        ? <Minimize className="w-[18px] h-[18px] stroke-[1.8] text-current" />
        : <Maximize className="w-[18px] h-[18px] stroke-[1.8] text-current" />}
    </button>
  );
};
