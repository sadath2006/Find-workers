import React from 'react';

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
        src="/Logo.png"
        alt="Find My Workers Logo"
        onError={(e) => {
          const img = e.target as HTMLImageElement;
          if (img.src.includes('Logo.png')) {
            img.src = '/logo.png';
          }
        }}
        className={`w-full h-full object-contain ${
          animate ? 'animate-pulse' : ''
        }`}
      />
    </div>
  );
};




