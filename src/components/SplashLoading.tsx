import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { Loader2, ArrowRight } from 'lucide-react';

interface SplashLoadingProps {
  message?: string;
  onSkip?: () => void;
}

export const SplashLoading: React.FC<SplashLoadingProps> = ({ 
  message = 'Loading Find My Workers...', 
  onSkip 
}) => {
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSkip(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-red-600 via-red-700 to-red-800 p-8 text-white select-none">
      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        {/* Transparent Logo */}
        <Logo size="xl" animate />

        {/* Title */}
        <div className="text-center space-y-1.5">
          <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-md">
            Find My Workers
          </h1>
          <p className="text-sm text-red-100 font-medium tracking-wide">
            Biometric Local Worker Network
          </p>
        </div>
      </div>

      {/* Progress & Spinner */}
      <div className="w-full max-w-xs space-y-4 text-center pb-8">
        <div className="flex items-center justify-center space-x-2 text-white">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
          <span className="text-xs font-semibold tracking-wider uppercase text-red-100">{message}</span>
        </div>

        <div className="w-full h-1.5 bg-red-900/40 rounded-full overflow-hidden backdrop-blur-sm">
          <div className="h-full bg-white rounded-full animate-pulse w-3/4" />
        </div>

        {showSkip && onSkip && (
          <div className="pt-2">
            <button
              onClick={onSkip}
              className="py-2 px-4 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl backdrop-blur-md inline-flex items-center space-x-1.5 transition-all cursor-pointer border border-white/20 shadow-sm"
            >
              <span>Continue to Login</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

