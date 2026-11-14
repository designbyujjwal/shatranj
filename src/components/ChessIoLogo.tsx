import React from 'react';
import { assetUrl } from '../utils/assetUrl';

interface ChessIoLogoProps {
  className?: string;
  imageClassName?: string;
  pawnClassName?: string;
  textColor?: string;
  id?: string;
  onClick?: () => void;
  /** Custom spacing kept for backwards compatibility */
  oSpacingClassName?: string;
  badgeSize?: number;
  enableDownloadModal?: boolean;
}

export const ChessIoLogo: React.FC<ChessIoLogoProps> = ({
  className = '',
  imageClassName,
  id = 'shatranj-logo',
  onClick,
}) => {
  return (
    <div
      id={id}
      onClick={onClick}
      className={`inline-flex items-center justify-center select-none cursor-default ${className}`}
      title="Shatranj"
    >
      <img
        src={assetUrl('shatranj-logo-compact.png')}
        alt="Shatranj, the royal game"
        className={imageClassName || "h-7 sm:h-8 md:h-9 w-auto max-w-[220px] object-contain filter drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] pointer-events-none"}
      />
    </div>
  );
};

export const ChaalLogo = ChessIoLogo;
export const ShatranjLogo = ChessIoLogo;
export default ChessIoLogo;
