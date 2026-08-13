import React, { useState } from 'react';
import logoPng from '../assets/logo.png';
import { LOGO_DATA_URL } from '../assets/logoDataUrl';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animate?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', className = '', animate = false }) => {
  const [imgSrc, setImgSrc] = useState<string>(logoPng || LOGO_DATA_URL);

  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
    xl: 'w-36 h-36'
  };

  return (
    <div className={`relative flex items-center justify-center shrink-0 ${sizeClasses[size]} ${className}`}>
      <img
        src={imgSrc}
        alt="Find Worker Biometric Shield Logo"
        referrerPolicy="no-referrer"
        onError={() => {
          if (imgSrc !== LOGO_DATA_URL) {
            setImgSrc(LOGO_DATA_URL);
          }
        }}
        className={`w-full h-full object-contain drop-shadow-md ${
          animate ? 'animate-pulse' : ''
        }`}
      />
    </div>
  );
};


