import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

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
    <div className="fixed bottom-4 inset-x-4 max-w-md mx-auto z-50 p-4 bg-slate-900 text-white border border-red-500/30 rounded-2xl shadow-2xl backdrop-blur-md flex items-center justify-between animate-slideUp">
      <div className="flex items-center space-x-3">
        <div className="p-2.5 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-xs font-bold">Install Find Worker App</h4>
          <p className="text-[10px] text-slate-300">Quick home screen access</p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={handleInstallClick}
          className="py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-md transition-all cursor-pointer flex items-center space-x-1"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install</span>
        </button>
        <button
          onClick={() => setShowPrompt(false)}
          className="p-1.5 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
