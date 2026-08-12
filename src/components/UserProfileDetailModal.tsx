import React from 'react';
import { UserProfile, UserRole, EntityRecord, WorkerRecord } from '../types';
import { RoleBadge } from './RoleBadge';
import { 
  X, 
  Building2, 
  Briefcase, 
  Users, 
  Wrench, 
  Phone, 
  Mail, 
  MapPin, 
  Hash, 
  ShieldCheck, 
  UserCheck, 
  Calendar,
  Eye,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface UserProfileDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: UserProfile;
  currentUserRole: UserRole;
  allUsers: UserProfile[];
  allEntities: EntityRecord[];
  allWorkers: WorkerRecord[];
}

export const UserProfileDetailModal: React.FC<UserProfileDetailModalProps> = ({
  isOpen,
  onClose,
  targetUser,
  currentUserRole,
  allUsers,
  allEntities,
  allWorkers
}) => {
  if (!isOpen) return null;

  const isSuperOrFounder = currentUserRole === 'Founder' || currentUserRole === 'Super Admin';
  const cleanUserMobile = (targetUser.mobileNumber || '').replace(/\D/g, '');

  // Find entities owned by this user
  const ownedEntities = allEntities.filter(e => e.ownerUid === targetUser.uid);

  // Find entities where this user is assigned as staff
  const staffEntities = cleanUserMobile 
    ? allEntities.filter(e => e.staffMobiles?.includes(cleanUserMobile))
    : [];

  // Total entity count
  const totalOwned = ownedEntities.length;
  const totalStaffAt = staffEntities.length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-lg w-full h-[85vh] flex flex-col shadow-2xl relative overflow-hidden animate-scaleUp">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">User Profile & Entity Inspector</h2>
              <p className="text-[10px] text-slate-400 font-medium">
                Detailed Entity, Staff & Worker Breakdown
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* User Info Header Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950/40 border border-slate-800 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                {targetUser.photoURL ? (
                  <img
                    src={targetUser.photoURL}
                    alt={targetUser.displayName}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-2xl border-2 border-purple-500/40 object-cover shrink-0 shadow-md"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-purple-900/50 text-purple-300 border-2 border-purple-500/40 flex items-center justify-center font-black text-lg shrink-0 shadow-md">
                    {targetUser.displayName ? targetUser.displayName.charAt(0) : 'U'}
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-extrabold text-white">{targetUser.displayName}</h3>
                  <p className="text-xs text-slate-400 font-mono flex items-center space-x-1">
                    <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>{targetUser.email}</span>
                  </p>
                  <p className="text-xs text-slate-400 font-mono flex items-center space-x-1 mt-0.5">
                    <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>Mobile: {targetUser.mobileNumber || 'Not set'}</span>
                  </p>
                </div>
              </div>

              <RoleBadge role={targetUser.role || 'Public Member'} size="sm" />
            </div>

            {/* Status Badges */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 ${
                  targetUser.isApproved 
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' 
                    : 'bg-amber-950 text-amber-400 border border-amber-800/50'
                }`}>
                  {targetUser.isApproved ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  <span>{targetUser.isApproved ? 'Approved Member' : 'Pending Approval'}</span>
                </span>
              </div>

              {isSuperOrFounder && (
                <span className="text-purple-400 font-semibold bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-800/50 flex items-center space-x-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Full Roster Unlocked</span>
                </span>
              )}
            </div>
          </div>

          {/* Summary Stats Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-0.5">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Owned Entities</p>
              <p className="text-xl font-black text-purple-400">{totalOwned}</p>
              <p className="text-[9px] text-slate-500">Companies / Rooms</p>
            </div>

            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-0.5">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Assigned Staff At</p>
              <p className="text-xl font-black text-indigo-400">{totalStaffAt}</p>
              <p className="text-[9px] text-slate-500">Entities as Staff</p>
            </div>
          </div>

          {/* Owned Entities Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-purple-400" />
              <span>Owned Companies & Rooms ({ownedEntities.length})</span>
            </h4>

            {ownedEntities.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 text-center text-slate-500 text-xs italic">
                No owned entities registered for this user profile.
              </div>
            ) : (
              ownedEntities.map(ent => {
                const entStaffCount = ent.staffMobiles?.length || 0;
                const entWorkers = allWorkers.filter(w => w.entityId === ent.id);
                const entWorkerCount = entWorkers.length;

                return (
                  <div key={ent.id} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                          ent.type === 'Room' 
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800/50' 
                            : 'bg-purple-950 text-purple-300 border-purple-800/50'
                        }`}>
                          {ent.type} Entity
                        </span>
                        <h5 className="text-sm font-extrabold text-white mt-1">{ent.name}</h5>
                        {ent.registrationNumber && (
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center space-x-1">
                            <Hash className="w-3 h-3 text-purple-400" />
                            <span>Reg: {ent.registrationNumber}</span>
                          </p>
                        )}
                        {ent.address && (
                          <p className="text-[10px] text-slate-400 mt-0.5 flex items-center space-x-1">
                            <MapPin className="w-3 h-3 text-purple-400" />
                            <span>{ent.address}</span>
                          </p>
                        )}
                      </div>

                      {/* Stat Pills */}
                      <div className="flex flex-col items-end space-y-1">
                        <span className="text-[10px] font-bold bg-indigo-950/80 text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-800/60 flex items-center space-x-1">
                          <Users className="w-3 h-3 text-indigo-400" />
                          <span>{entStaffCount} Staff</span>
                        </span>
                        <span className="text-[10px] font-bold bg-amber-950/80 text-amber-300 px-2.5 py-1 rounded-lg border border-amber-800/60 flex items-center space-x-1">
                          <Wrench className="w-3 h-3 text-amber-400" />
                          <span>{entWorkerCount} Workers</span>
                        </span>
                      </div>
                    </div>

                    {/* Detailed Staff & Worker Roster for Super Admin & Founder */}
                    {isSuperOrFounder && (
                      <div className="pt-3 border-t border-slate-900 space-y-3">
                        {/* Staff Roster */}
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider flex items-center space-x-1">
                            <Users className="w-3 h-3" />
                            <span>Staff Mobile Numbers ({entStaffCount})</span>
                          </p>
                          {entStaffCount > 0 ? (
                            <div className="grid grid-cols-1 gap-1.5">
                              {ent.staffMobiles.map(mob => {
                                const matchedUser = allUsers.find(u => u.mobileNumber?.replace(/\D/g, '') === mob);
                                return (
                                  <div key={mob} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center justify-between">
                                    <div className="flex items-center space-x-2 font-mono text-slate-200">
                                      <Phone className="w-3 h-3 text-indigo-400" />
                                      <span>{mob}</span>
                                    </div>
                                    {matchedUser ? (
                                      <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                                        {matchedUser.displayName} ({matchedUser.role})
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-amber-400 font-extrabold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                                        Unregistered Staff
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-500 italic">No staff assigned to this entity.</p>
                          )}
                        </div>

                        {/* Workers Roster */}
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider flex items-center space-x-1">
                            <Wrench className="w-3 h-3" />
                            <span>Registered Workers List ({entWorkerCount})</span>
                          </p>
                          {entWorkerCount > 0 ? (
                            <div className="grid grid-cols-1 gap-1.5">
                              {entWorkers.map(w => (
                                <div key={w.id} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center justify-between">
                                  <div>
                                    <p className="font-bold text-white">{w.name}</p>
                                    <p className="text-[10px] text-amber-400 font-semibold">{w.skill}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">{w.mobile}</p>
                                  </div>
                                  <span className="text-[9px] text-slate-500 font-mono text-right">
                                    By {w.registeredByName || 'Owner'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-500 italic">No workers added under this entity.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Assigned Entities (if user is Staff) */}
          {staffEntities.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-indigo-400" />
                <span>Assigned Entities as Staff ({staffEntities.length})</span>
              </h4>

              {staffEntities.map(ent => {
                const entWorkers = allWorkers.filter(w => w.entityId === ent.id);
                return (
                  <div key={ent.id} className="p-4 rounded-2xl bg-slate-950 border border-indigo-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800">
                        {ent.type} Staff
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Owner: {ent.ownerName}</span>
                    </div>

                    <h5 className="text-sm font-extrabold text-white">{ent.name}</h5>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                      <span>Owner Contact: {ent.ownerMobile || 'N/A'}</span>
                      <span className="text-amber-400 font-bold">{entWorkers.length} Workers</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <p className="text-[10px] text-slate-500">
            Inspector View for {currentUserRole}
          </p>
          <button
            onClick={onClose}
            className="py-1.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Close Inspector
          </button>
        </div>

      </div>
    </div>
  );
};
