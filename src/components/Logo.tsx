import React from 'react';
import logoSvg from '/logo.svg?url';
import logoPng from '../assets/logo.png';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animate?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', className = '', animate = false }) => {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
    xl: 'w-36 h-36'
  };

  return (
    <div className={`relative flex items-center justify-center shrink-0 ${sizeClasses[size]} ${className}`}>
      <img
        src="/logo.svg"
        alt="Find Worker Shield Logo"
        onError={(e) => {
          (e.target as HTMLImageElement).src = logoPng;
        }}
        className={`w-full h-full object-contain drop-shadow-md ${
          animate ? 'animate-pulse' : ''
        }`}
      />
    </div>
  );
};



