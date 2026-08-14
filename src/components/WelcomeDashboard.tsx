import React, { useState } from 'react';
import { UserProfile } from '../types';
import { Logo } from './Logo';
import { RoleBadge } from './RoleBadge';
import { UserManagementModal } from './UserManagementModal';
import { EntityManagementPanel } from './EntityManagementPanel';
import { WorkerRegistrationModal } from './WorkerRegistrationModal';
import { FaceScannerModal } from './FaceScannerModal';
import { CommentsSection } from './CommentsSection';
import { logoutUser } from '../firebase';
import { 
  LogOut, 
  Phone, 
  Edit2, 
  Search, 
  Briefcase, 
  Wrench, 
  MapPin, 
  Users, 
  Building2, 
  Scan,
  Sparkles,
  ChevronRight,
  UserCheck,
  Clock
} from 'lucide-react';

interface WelcomeDashboardProps {
  user: UserProfile;
  onEditMobile: () => void;
  onLogout: () => void;
  onUserRefresh?: () => void;
}

export const WelcomeDashboard: React.FC<WelcomeDashboardProps> = ({ 
  user, 
  onEditMobile, 
  onLogout,
  onUserRefresh 
}) => {
  const [loggingOut, setLoggingOut] = useState(false);
  const [showUserMgmtModal, setShowUserMgmtModal] = useState(false);
  const [showEntityPanel, setShowEntityPanel] = useState(false);
  const [showWorkerRegModal, setShowWorkerRegModal] = useState(false);
  const [showFaceScanModal, setShowFaceScanModal] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logoutUser();
      onLogout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLoggingOut(false);
    }
  };

  const isRoleAdmin = ['Founder', 'Super Admin', 'Committee'].includes(user.role);
  const canAccessEntityHub = ['Room Owner', 'Company Owner', 'Staff', 'Founder', 'Super Admin', 'Committee'].includes(user.role);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between max-w-md mx-auto relative overflow-hidden pb-10">
      {/* Header Bar */}
      <header className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-200 sticky top-0 bg-white/95 backdrop-blur-md z-30 shadow-xs">
        <div className="flex items-center space-x-3">
          <Logo size="sm" />
          <div>
            <h1 className="text-base font-black text-slate-900 tracking-tight leading-none">Find My Workers</h1>
            <p className="text-[10px] text-red-600 font-bold uppercase tracking-wider mt-0.5">Role Portal</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center space-x-1 py-1.5 px-3 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout</span>
        </button>
      </header>

      {/* Main Content Body */}
      <main className="px-5 py-5 space-y-5 flex-1">
        {/* Profile Card with Dynamic Role Badge */}
        <div className="relative p-5 rounded-3xl bg-gradient-to-b from-red-600 via-red-700 to-red-800 text-white shadow-xl shadow-red-700/20 overflow-hidden space-y-4">
          <div className="flex items-center justify-between">
            <RoleBadge role={user.role || 'Public Member'} size="md" />

            {/* Quick Action Button for non-Public roles in header box */}
            {user.role !== 'Public Member' && (
              <button
                onClick={() => setShowFaceScanModal(true)}
                className="py-1.5 px-3 bg-white/20 hover:bg-white/30 text-white rounded-full text-xs font-bold border border-white/30 backdrop-blur-md flex items-center space-x-1.5 cursor-pointer transition-all shadow-sm active:scale-95"
                title="Biometric Face Scanner"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>Face Scan</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3.5">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-2xl border-2 border-white object-cover shadow-md shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-white text-red-600 border-2 border-white flex items-center justify-center font-black text-xl shrink-0 shadow-md">
                {user.displayName ? user.displayName.charAt(0) : 'U'}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-red-100 font-bold uppercase tracking-wider">Welcome back</p>
              <h2 className="text-lg font-extrabold text-white truncate">
                {user.displayName}
              </h2>
              <p className="text-xs text-red-100 truncate font-mono">
                {user.email}
              </p>
            </div>
          </div>

          {/* Stored Mobile Number Display */}
          <div className="pt-3 border-t border-white/20 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs">
              <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-white">
                <Phone className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[9px] text-red-100 uppercase font-bold tracking-wider">Mobile Number</p>
                <p className="text-xs font-black font-mono text-white">{user.mobileNumber || 'Not set'}</p>
              </div>
            </div>

            <button
              onClick={onEditMobile}
              className="py-1 px-2.5 bg-white text-red-600 hover:bg-red-50 font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1 text-xs shadow-sm"
            >
              <Edit2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>
        </div>

        {/* Public Member - Pending Activation Notice */}
        {user.role === 'Public Member' && !user.isApproved && (
          <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-slate-900 border-2 border-amber-500/40 text-slate-800 space-y-3 shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-500 border border-amber-500/40 shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-amber-500 uppercase tracking-tight">
                  Account Activation Pending
                </h3>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  Approval required by Administrator
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-white/60 p-3 rounded-2xl border border-slate-200">
              Welcome to the Find My Workers Network. Your public member registration is currently awaiting verification and approval by a Founder, Super Admin, or Committee member.
            </p>

            <div className="text-[11px] text-slate-500 flex items-center space-x-2 pt-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
              <span>Features, live scanning, and verification tools will activate automatically once approved.</span>
            </div>
          </div>
        )}

        {/* Role Action Dashboards */}
        <div className="space-y-3">
          {/* Admin Management Button for Founder / Super Admin / Committee */}
          {isRoleAdmin && (
            <button
              onClick={() => setShowUserMgmtModal(true)}
              className="w-full p-4 rounded-2xl bg-slate-900 hover:bg-slate-950 text-white border border-slate-800 shadow-md flex items-center justify-between transition-all cursor-pointer group"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-red-600/20 text-red-500 border border-red-500/30">
                  <Users className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h4 className="text-xs font-black text-white group-hover:text-red-400 transition-colors">
                    User & Role Management
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Assign roles, approve members & delete accounts
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </button>
          )}

          {/* Dedicated Worker Registration Portal Button */}
          {canAccessEntityHub && (
            <button
              onClick={() => setShowWorkerRegModal(true)}
              className="w-full p-4 rounded-2xl bg-gradient-to-r from-red-950 via-slate-900 to-amber-950 text-white border border-red-500/40 shadow-lg flex items-center justify-between transition-all cursor-pointer group hover:border-red-400/60"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-red-600/30 text-red-400 border border-red-500/40 shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h4 className="text-xs font-black text-white group-hover:text-red-400 transition-colors flex items-center space-x-1.5">
                    <span>Worker Registration Portal</span>
                    <span className="text-[9px] bg-red-600 text-white font-extrabold px-1.5 py-0.5 rounded-full uppercase">Biometric</span>
                  </h4>
                  <p className="text-[10px] text-red-200/80">
                    Snap worker photo & instant face matching with auto entity sync
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-red-400 group-hover:text-white transition-colors" />
            </button>
          )}

          {/* Entity & Staff Hub Toggle Button */}
          {canAccessEntityHub && (
            <button
              onClick={() => setShowEntityPanel(!showEntityPanel)}
              className="w-full p-4 rounded-2xl bg-gradient-to-r from-purple-900 via-slate-900 to-indigo-950 text-white border border-purple-500/30 shadow-md flex items-center justify-between transition-all cursor-pointer group"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-purple-600/30 text-purple-300 border border-purple-500/40">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h4 className="text-xs font-black text-white group-hover:text-purple-300 transition-colors">
                    Entity & Staff Hub
                  </h4>
                  <p className="text-[10px] text-purple-200/70">
                    {user.role === 'Staff' 
                      ? 'View assigned entities & register workers' 
                      : 'Register Rooms/Companies & assign staff by mobile'}
                  </p>
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 text-purple-400 transition-transform ${showEntityPanel ? 'rotate-90' : ''}`} />
            </button>
          )}

          {/* Render Entity Management Panel when toggled */}
          {showEntityPanel && canAccessEntityHub && (
            <EntityManagementPanel currentUser={user} />
          )}
        </div>

        {/* Public Member - Big Main Face Scan Action Button Placed Above Chat */}
        {user.role === 'Public Member' && user.isApproved && (
          <div className="pt-1">
            <button
              onClick={() => setShowFaceScanModal(true)}
              className="w-full p-5 rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-xl shadow-red-600/30 flex items-center justify-between transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer border-2 border-red-400/50 group"
            >
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md text-white border border-white/40 flex items-center justify-center shrink-0 shadow-lg group-hover:scale-105 transition-transform">
                  <Scan className="w-8 h-8 animate-pulse text-white" />
                </div>
                <div className="text-left">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-black text-white tracking-wide">
                      BIOMETRIC FACE SCAN
                    </h3>
                    <span className="text-[9px] bg-white text-red-700 font-extrabold px-2 py-0.5 rounded-full uppercase shadow-sm">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-red-100 font-medium mt-1">
                    ഫേസ് സ്കാൻ ചെയ്യുക • Live Camera & Gallery Matcher
                  </p>
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white group-hover:bg-white group-hover:text-red-600 transition-colors shrink-0">
                <ChevronRight className="w-6 h-6" />
              </div>
            </button>
          </div>
        )}

        {/* Member Forum & Comments Section (Only for approved or non-public roles) */}
        {(user.role !== 'Public Member' || user.isApproved) && (
          <CommentsSection currentUser={user} />
        )}
      </main>

      {/* User Management Modal */}
      {showUserMgmtModal && (
        <UserManagementModal
          isOpen={showUserMgmtModal}
          onClose={() => setShowUserMgmtModal(false)}
          currentUser={user}
          onUserRoleUpdated={onUserRefresh}
        />
      )}

      {/* Worker Registration Modal */}
      {showWorkerRegModal && (
        <WorkerRegistrationModal
          isOpen={showWorkerRegModal}
          onClose={() => setShowWorkerRegModal(false)}
          currentUser={user}
        />
      )}

      {/* Face Scanner Modal */}
      {showFaceScanModal && (
        <FaceScannerModal
          isOpen={showFaceScanModal}
          onClose={() => setShowFaceScanModal(false)}
          currentUser={user}
        />
      )}

      {/* Footer */}
      <footer className="px-5 pt-2 text-center">
        <p className="text-[11px] text-slate-400 font-medium">
          Find My Workers Network • Role Portal
        </p>
      </footer>
    </div>
  );
};
