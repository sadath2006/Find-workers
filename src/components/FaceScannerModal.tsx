import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { X, CheckCircle, RefreshCw, Scan, ShieldCheck, Sparkles } from 'lucide-react';

interface FaceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
}

export const FaceScannerModal: React.FC<FaceScannerModalProps> = ({ isOpen, onClose, userName }) => {
  const [scanning, setScanning] = useState(true);
  const [scanned, setScanned] = useState(false);
  const [biometricId, setBiometricId] = useState('');

  useEffect(() => {
    if (isOpen) {
      setScanning(true);
      setScanned(false);
      const timer = setTimeout(() => {
        setScanning(false);
        setScanned(true);
        setBiometricId(`FW-BIO-${Math.floor(100000 + Math.random() * 900000)}`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden space-y-5 animate-scaleUp">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-slate-800/60 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center space-x-2 text-red-500">
          <Scan className="w-5 h-5" />
          <h3 className="text-sm font-extrabold uppercase tracking-wider">
            Biometric Face Scan
          </h3>
        </div>

        {/* Scanner Viewfinder Box */}
        <div className="relative aspect-square w-full bg-slate-950 rounded-2xl border-2 border-slate-800 overflow-hidden flex flex-col items-center justify-center shadow-inner">
          {/* Background Mesh Overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(#06b6d4_1px,transparent_1px)] [background-size:16px_16px] opacity-20" />

          {/* Logo Center */}
          <div className="relative z-10 p-4">
            <Logo size="lg" animate={scanning} />
          </div>

          {/* Scanning Bar Animation */}
          {scanning && (
            <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 shadow-[0_0_15px_#34d399] animate-scanBeam" />
          )}

          {/* Scanning Corner Guides */}
          <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-cyan-400" />
          <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-cyan-400" />
          <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-cyan-400" />
          <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-cyan-400" />

          {/* Status Overlay */}
          <div className="absolute bottom-3 inset-x-3 bg-slate-900/90 backdrop-blur-md p-2.5 rounded-xl border border-slate-800 text-center">
            {scanning ? (
              <p className="text-xs font-semibold text-cyan-400 flex items-center justify-center space-x-2 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Mapping Face Geometry...</span>
              </p>
            ) : (
              <p className="text-xs font-bold text-emerald-400 flex items-center justify-center space-x-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Face Match Verified!</span>
              </p>
            )}
          </div>
        </div>

        {/* Result Info */}
        {scanned ? (
          <div className="p-4 bg-emerald-950/30 border border-emerald-800/50 rounded-2xl space-y-2 text-center">
            <div className="flex items-center justify-center space-x-1.5 text-emerald-400 font-bold text-xs">
              <CheckCircle className="w-4 h-4" />
              <span>Identity Scan Complete</span>
            </div>
            <p className="text-xs text-slate-300">
              Verified for <span className="text-white font-bold">{userName}</span>
            </p>
            <p className="text-[10px] text-slate-400 font-mono bg-slate-950 p-2 rounded-lg border border-slate-800">
              Biometric Hash: {biometricId}
            </p>
          </div>
        ) : (
          <p className="text-xs text-center text-slate-400">
            Keep your face aligned in the frame for biometric mesh validation.
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all cursor-pointer text-xs shadow-md"
        >
          {scanned ? 'Done' : 'Cancel Scan'}
        </button>
      </div>
    </div>
  );
};
