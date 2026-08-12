import React, { useState } from 'react';
import { UserProfile } from '../types';
import { Logo } from './Logo';
import { RoleBadge } from './RoleBadge';
import { UserManagementModal } from './UserManagementModal';
import { EntityManagementPanel } from './EntityManagementPanel';
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
  ChevronRight
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
            <h1 className="text-base font-black text-slate-900 tracking-tight leading-none">Find Worker</h1>
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

            {/* Quick Action Button depending on Role */}
            {user.role === 'Public Member' && (
              <button
                onClick={() => setShowFaceScanModal(true)}
                className="py-1 px-2.5 bg-white/20 hover:bg-white/30 text-white rounded-full text-[11px] font-bold border border-white/30 backdrop-blur-md flex items-center space-x-1 cursor-pointer transition-all"
              >
                <Scan className="w-3 h-3" />
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

        {/* Member Forum & Comments Section */}
        <CommentsSection currentUser={user} />
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

      {/* Face Scanner Modal */}
      {showFaceScanModal && (
        <FaceScannerModal
          isOpen={showFaceScanModal}
          onClose={() => setShowFaceScanModal(false)}
          userName={user.displayName}
        />
      )}

      {/* Footer */}
      <footer className="px-5 pt-2 text-center">
        <p className="text-[11px] text-slate-400 font-medium">
          Find Worker Network • Role Portal
        </p>
      </footer>
    </div>
  );
};
