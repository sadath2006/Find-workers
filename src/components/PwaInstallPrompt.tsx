import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('PWA install outcome:', outcome);
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 max-w-md mx-auto z-50 p-4 bg-slate-900/95 text-white border border-red-500/40 rounded-2xl shadow-2xl backdrop-blur-md flex items-center justify-between animate-slideUp">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 shrink-0 bg-white/10 rounded-xl p-1 border border-white/20 flex items-center justify-center overflow-hidden">
          <img src="/Logo.png" onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }} alt="Logo" className="w-full h-full object-contain" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-white">Install Find My Workers</h4>
          <p className="text-[10px] text-slate-300">Fast access from your home screen</p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={handleInstallClick}
          className="py-2 px-3.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer flex items-center space-x-1.5 active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
        <button
          onClick={() => setShowPrompt(false)}
          className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
