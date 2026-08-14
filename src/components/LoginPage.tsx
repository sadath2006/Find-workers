import React, { useState } from 'react';
import { Logo } from './Logo';
import { loginWithGoogle } from '../firebase';
import { ShieldCheck, Users, MapPin, AlertCircle, Loader2 } from 'lucide-react';

interface LoginPageProps {
  onSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; isInfo?: boolean } | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
      onSuccess();
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError({
          message: 'Sign-in cancelled. Click "Sign in with Google" to try again.',
          isInfo: true,
        });
      } else if (err?.code === 'auth/popup-blocked') {
        setError({
          message: 'Popup was blocked by your browser. Please allow popups for this site.',
          isInfo: false,
        });
      } else {
        console.error('Google Sign-In Error:', err);
        setError({
          message: err?.message || 'Failed to sign in with Google. Please try again.',
          isInfo: false,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between max-w-md mx-auto relative overflow-hidden">
      {/* Red Header Banner with Transparent Logo */}
      <div className="bg-gradient-to-b from-red-600 via-red-700 to-red-800 text-white pt-10 pb-12 px-6 rounded-b-[2.5rem] shadow-xl flex flex-col items-center text-center space-y-4">
        <Logo size="lg" />

        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-sm">
            Find My Workers
          </h1>
          <p className="text-xs font-medium text-red-100 tracking-wide">
            Verified Local Worker & Entity Portal
          </p>
        </div>

        <p className="text-xs text-red-100 max-w-xs leading-relaxed opacity-90">
          Sign in to access your role dashboard, register entities, assign staff, and find skilled workers.
        </p>
      </div>

      {/* Feature Highlights */}
      <div className="px-6 my-auto py-6 space-y-3">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center space-x-3 text-xs text-slate-700 font-medium">
            <div className="p-2 rounded-xl bg-red-50 text-red-600 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <span>Role-Based Portal & Committee Verification</span>
          </div>

          <div className="flex items-center space-x-3 text-xs text-slate-700 font-medium">
            <div className="p-2 rounded-xl bg-red-50 text-red-600 shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <span>Room & Company Entity Management</span>
          </div>

          <div className="flex items-center space-x-3 text-xs text-slate-700 font-medium">
            <div className="p-2 rounded-xl bg-red-50 text-red-600 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span>Biometric Verification & Google Auth</span>
          </div>
        </div>

        {error && (
          <div
            className={`p-3 rounded-xl text-xs flex items-start space-x-2 animate-fadeIn border ${
              error.isInfo
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            <AlertCircle
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                error.isInfo ? 'text-amber-600' : 'text-rose-500'
              }`}
            />
            <div className="flex-1">
              <span>{error.message}</span>
            </div>
          </div>
        )}
      </div>

      {/* Login Action Footer */}
      <div className="p-6 pt-2 pb-8 space-y-3">
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-white text-slate-800 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-3 shadow-md hover:bg-slate-50 border border-slate-200 transition-all disabled:opacity-60 cursor-pointer active:scale-[0.98]"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-red-600" />
              <span className="text-sm font-semibold">Connecting to Google...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span className="text-sm font-bold text-slate-800">Sign in with Google</span>
            </>
          )}
        </button>

        <p className="text-[11px] text-center text-slate-400">
          Fast and secure account access
        </p>
      </div>
    </div>
  );
};
