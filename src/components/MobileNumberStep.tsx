import React, { useState } from 'react';
import { UserProfile } from '../types';
import { saveUserProfile } from '../firebase';
import { Phone, CheckCircle2, Loader2, AlertCircle, Shield, User as UserIcon } from 'lucide-react';

interface MobileNumberStepProps {
  user: UserProfile;
  onComplete: (updatedProfile: UserProfile) => void;
  onLogout: () => void;
  onCancel?: () => void;
}

export const MobileNumberStep: React.FC<MobileNumberStepProps> = ({ user, onComplete, onLogout, onCancel }) => {
  const [mobileNumber, setMobileNumber] = useState((user.mobileNumber || '').replace(/\D/g, ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNumber = mobileNumber.replace(/\D/g, '');

    if (cleanNumber.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const savedProfile = await saveUserProfile(user.uid, {
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        mobileNumber: cleanNumber
      });

      onComplete(savedProfile);
    } catch (err: any) {
      console.error('Firestore save error:', err);
      setError(err?.message || 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between p-6 max-w-md mx-auto relative">
      {/* Top Bar */}
      <div className="pt-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-red-100 text-red-600">
            <Shield className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">
            Account Setup
          </span>
        </div>
        <button
          onClick={onLogout}
          className="text-xs font-bold text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
        >
          Logout
        </button>
      </div>

      {/* Main Content */}
      <div className="my-auto py-6 space-y-6">
        {/* User Google Card */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 flex items-center space-x-4 shadow-sm">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full border-2 border-red-600 object-cover shadow-sm shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-red-100 border-2 border-red-600 flex items-center justify-center text-red-600 font-bold shrink-0">
              <UserIcon className="w-6 h-6" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Welcome back</p>
            <h2 className="text-sm font-bold text-slate-800 truncate">
              {user.displayName}
            </h2>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-slate-900">
            Verify Mobile
          </h1>
          <p className="text-xs text-slate-500">
            Please enter your mobile number so workers and clients can reach you directly.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">
              Mobile Number
            </label>

            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Phone className="w-5 h-5 text-slate-400" />
              </div>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 10-digit mobile number"
                maxLength={10}
                required
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 pl-12 pr-4 focus:border-red-600 focus:bg-white focus:outline-none transition-all text-slate-800 font-semibold text-base shadow-inner"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-4 rounded-2xl shadow-lg shadow-red-200 transition-all transform active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-60 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Save Mobile</span>
                </>
              )}
            </button>

            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="py-4 px-6 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-2xl transition-all cursor-pointer text-center"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Clean Footer */}
      <div className="pb-4 pt-2 text-center text-xs text-slate-400 font-medium">
        Find My Workers Account Setup
      </div>
    </div>
  );
};
