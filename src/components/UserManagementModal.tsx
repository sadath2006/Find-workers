import React, { useEffect, useState } from 'react';
import { UserProfile, UserRole, EntityRecord, WorkerRecord } from '../types';
import { RoleBadge } from './RoleBadge';
import { UserProfileDetailModal } from './UserProfileDetailModal';
import { WorkerDetailModal } from './WorkerDetailModal';
import { 
  getAllUsers, 
  updateUserRole, 
  approveUser, 
  deleteUserDocument,
  getAllEntities,
  getAllWorkers,
  deleteWorker
} from '../firebase';
import { 
  X, 
  Users, 
  CheckCircle2, 
  Trash2, 
  ShieldAlert, 
  Search, 
  Loader2, 
  Lock, 
  AlertCircle,
  Building2,
  Briefcase,
  Eye,
  UserCheck,
  RefreshCw
} from 'lucide-react';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onUserRoleUpdated?: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserRoleUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'workers'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [entitiesHasUpdated, setEntitiesHasUpdated] = useState<Record<string, boolean>>({});
  const [inspectedUser, setInspectedUser] = useState<UserProfile | null>(null);
  const [inspectedWorker, setInspectedWorker] = useState<WorkerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [workerToDelete, setWorkerToDelete] = useState<WorkerRecord | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [allUsersList, allEntitiesList, allWorkersList] = await Promise.all([
        getAllUsers(),
        getAllEntities(),
        getAllWorkers()
      ]);

      setUsers(allUsersList);
      setEntities(allEntitiesList);
      setWorkers(allWorkersList);

      // Map owner UIDs who have updated entity details
      const ownerHasUpdatedMap: Record<string, boolean> = {};
      allEntitiesList.forEach(ent => {
        if (ent.hasUpdatedDetails) {
          ownerHasUpdatedMap[ent.ownerUid] = true;
        }
      });
      setEntitiesHasUpdated(ownerHasUpdatedMap);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setErrorMsg('Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = users.filter(u =>
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.mobileNumber?.includes(searchTerm) ||
    u.role?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredWorkers = workers.filter(w =>
    w.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.mobile?.includes(searchTerm) ||
    w.aadhar?.includes(searchTerm) ||
    w.skill?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.entityName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.companyEntityName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.roomEntityName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availableRolesForRequester = (): UserRole[] => {
    if (currentUser.role === 'Founder') {
      return ['Founder', 'Super Admin', 'Committee', 'Room Owner', 'Company Owner', 'Staff', 'Public Member'];
    }
    if (currentUser.role === 'Super Admin') {
      return ['Committee', 'Room Owner', 'Company Owner', 'Staff', 'Public Member'];
    }
    if (currentUser.role === 'Committee') {
      return ['Room Owner', 'Company Owner', 'Public Member'];
    }
    return [];
  };

  const canChangeRole = (targetUser: UserProfile): boolean => {
    if (targetUser.uid === currentUser.uid) return false; // Cannot demote self
    if (targetUser.role === 'Founder') return false; // Nobody can touch Founder

    // Committee specific restriction: If owner updated entity details, committee cannot demote
    if (currentUser.role === 'Committee') {
      if (
        (targetUser.role === 'Room Owner' || targetUser.role === 'Company Owner') &&
        entitiesHasUpdated[targetUser.uid]
      ) {
        return false; // Committee cannot demote room/company owner once entity details updated
      }
    }

    if (currentUser.role === 'Super Admin') {
      if (targetUser.role === 'Super Admin') return false; // Super admin cannot demote another super admin
    }

    return true;
  };

  const handleRoleChange = async (targetUser: UserProfile, newRole: UserRole) => {
    if (!canChangeRole(targetUser)) {
      setErrorMsg('You do not have permission to modify this user role.');
      return;
    }

    setUpdatingUid(targetUser.uid);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateUserRole(targetUser.uid, newRole, currentUser.role);
      setUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, role: newRole } : u));
      setSuccessMsg(`Role updated to ${newRole} for ${targetUser.displayName}`);
      if (onUserRoleUpdated) onUserRoleUpdated();
    } catch (err: any) {
      console.error('Error updating role:', err);
      setErrorMsg(err.message || 'Failed to update user role.');
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleApprove = async (targetUid: string) => {
    setUpdatingUid(targetUid);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await approveUser(targetUid);
      setUsers(prev => prev.map(u => u.uid === targetUid ? { ...u, isApproved: true } : u));
      setSuccessMsg('User approved successfully!');
    } catch (err: any) {
      setErrorMsg('Failed to approve user.');
    } finally {
      setUpdatingUid(null);
    }
  };

  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);

  const handleDeleteUser = (targetUser: UserProfile) => {
    if (targetUser.role === 'Founder') {
      setErrorMsg('Founder account cannot be deleted!');
      return;
    }
    setUserToDelete(targetUser);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    setUpdatingUid(userToDelete.uid);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await deleteUserDocument(userToDelete.uid, currentUser.role);
      setUsers(prev => prev.filter(u => u.uid !== userToDelete.uid));
      setSuccessMsg(`User ${userToDelete.displayName} deleted.`);
      setUserToDelete(null);
    } catch (err: any) {
      setErrorMsg('Failed to delete user.');
    } finally {
      setUpdatingUid(null);
    }
  };

  const confirmDeleteWorker = async () => {
    if (!workerToDelete) return;
    setUpdatingUid(workerToDelete.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await deleteWorker(workerToDelete.id, currentUser);
      setWorkers(prev => prev.filter(w => w.id !== workerToDelete.id));
      setSuccessMsg(`Worker "${workerToDelete.name}" deleted successfully.`);
      setWorkerToDelete(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete worker.');
    } finally {
      setUpdatingUid(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-lg w-full h-[85vh] flex flex-col shadow-2xl relative overflow-hidden animate-scaleUp">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-red-600/20 text-red-500 border border-red-500/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">Administration & Directory</h2>
              <p className="text-[10px] text-slate-400 font-medium">
                Users • Workers • Biometrics • Role Assignment
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadData}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/80 rounded-full transition-colors cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-red-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/80 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher: Users vs Workers */}
        <div className="flex border-b border-slate-800 bg-slate-950/70 p-1.5 gap-1.5">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Users ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('workers')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'workers'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>All Workers ({workers.length})</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/50">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={activeTab === 'users' ? "Search by name, email, mobile or role..." : "Search by worker name, mobile, aadhar, entity, or ID..."}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mx-4 mt-3 p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-4 mt-3 p-3 bg-emerald-950/50 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              <p className="text-xs font-semibold">Loading data from Firestore...</p>
            </div>
          ) : activeTab === 'users' ? (
            // USERS LIST
            filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No users found matching "{searchTerm}".
              </div>
            ) : (
              filteredUsers.map(u => {
                const isSelf = u.uid === currentUser.uid;
                const editable = canChangeRole(u);
                const isUpdating = updatingUid === u.uid;
                const hasUpdatedEntity = entitiesHasUpdated[u.uid];

                const userOwnedEntities = entities.filter(e => e.ownerUid === u.uid);
                const userCleanMobile = u.mobileNumber?.replace(/\D/g, '') || '';
                const userStaffEntities = userCleanMobile 
                  ? entities.filter(e => e.staffMobiles?.includes(userCleanMobile)) 
                  : [];

                return (
                  <div
                    key={u.uid}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-3 hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-start justify-between space-x-3">
                      <div 
                        onClick={() => setInspectedUser(u)}
                        className="flex items-center space-x-3 min-w-0 cursor-pointer group"
                        title="Click to view detailed profile inspector"
                      >
                        {u.photoURL ? (
                          <img
                            src={u.photoURL}
                            alt={u.displayName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0 group-hover:border-purple-500 transition-colors"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-sm shrink-0 border border-slate-700 group-hover:border-purple-500 group-hover:text-purple-300 transition-colors">
                            {u.displayName ? u.displayName.charAt(0) : 'U'}
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-xs font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                              {u.displayName}
                            </h4>
                            {isSelf && (
                              <span className="text-[9px] bg-slate-800 text-slate-400 font-bold px-1.5 py-0.5 rounded">
                                YOU
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate font-mono">
                            {u.email}
                          </p>

                          {/* Registered Entity Display */}
                          {userOwnedEntities.length > 0 ? (
                            <p className="text-[10px] text-purple-400 font-extrabold truncate flex items-center space-x-1 mt-0.5">
                              <Building2 className="w-3 h-3 text-purple-400 shrink-0" />
                              <span>
                                Entity: {userOwnedEntities[0].name}
                                {userOwnedEntities.length > 1 ? ` (+${userOwnedEntities.length - 1})` : ''}
                              </span>
                            </p>
                          ) : userStaffEntities.length > 0 ? (
                            <p className="text-[10px] text-indigo-400 font-extrabold truncate flex items-center space-x-1 mt-0.5">
                              <Briefcase className="w-3 h-3 text-indigo-400 shrink-0" />
                              <span>
                                Staff at: {userStaffEntities[0].name}
                                {userStaffEntities.length > 1 ? ` (+${userStaffEntities.length - 1})` : ''}
                              </span>
                            </p>
                          ) : null}

                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Mobile: {u.mobileNumber || 'Not set'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end space-y-1.5 shrink-0">
                        <RoleBadge role={u.role || 'Public Member'} size="sm" />
                        <button
                          onClick={() => setInspectedUser(u)}
                          className="py-1 px-2 bg-purple-950/80 hover:bg-purple-900 text-purple-300 hover:text-white border border-purple-800/60 rounded-lg text-[9px] font-bold flex items-center space-x-1 transition-all cursor-pointer"
                          title="View Profile Details"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Profile</span>
                        </button>
                      </div>
                    </div>

                    {/* Controls Bar */}
                    <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs">
                      {/* Role Selection Dropdown */}
                      {editable ? (
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-slate-500 font-bold uppercase">Role:</span>
                          <select
                            value={u.role || 'Public Member'}
                            disabled={isUpdating}
                            onChange={e => handleRoleChange(u, e.target.value as UserRole)}
                            className="bg-slate-900 border border-slate-700 text-xs font-semibold text-red-400 rounded-lg px-2 py-1 focus:outline-none focus:border-red-500 cursor-pointer"
                          >
                            {availableRolesForRequester().map(r => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1 text-[10px] text-slate-500 font-medium">
                          <Lock className="w-3 h-3 text-slate-600" />
                          <span>
                            {hasUpdatedEntity && currentUser.role === 'Committee'
                              ? 'Role locked (Entity Registered)'
                              : 'Protected Role'}
                          </span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center space-x-2">
                        {/* Approval Toggle for Founder, Super Admin, Committee */}
                        {['Founder', 'Super Admin', 'Committee'].includes(currentUser.role) && !u.isApproved && u.role !== 'Founder' && (
                          <button
                            onClick={() => handleApprove(u.uid)}
                            disabled={isUpdating}
                            className="py-1 px-2.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/40 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center space-x-1"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Approve</span>
                          </button>
                        )}

                        {/* Delete User */}
                        {u.role !== 'Founder' && !isSelf && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            disabled={isUpdating}
                            className="p-1.5 text-rose-400 hover:text-white hover:bg-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Delete User"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            // ALL WORKERS LIST
            filteredWorkers.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs space-y-2">
                <UserCheck className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="font-semibold text-slate-400">No registered workers found.</p>
                <p className="text-[10px] text-slate-500">Database has no workers matching query.</p>
              </div>
            ) : (
              filteredWorkers.map(w => {
                const isUpdating = updatingUid === w.id;

                return (
                  <div
                    key={w.id}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2.5 hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-start justify-between space-x-3">
                      <div 
                        onClick={() => setInspectedWorker(w)}
                        className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer group"
                        title="Click to view worker movement & scan logs"
                      >
                        {w.photoURL ? (
                          <img
                            src={w.photoURL}
                            alt={w.name}
                            className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0 group-hover:border-amber-500 transition-colors"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 font-black flex items-center justify-center shrink-0 border border-amber-500/30 text-base group-hover:border-amber-400 transition-colors">
                            {w.name ? w.name.charAt(0) : 'W'}
                          </div>
                        )}

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors">
                              {w.name}
                            </h4>
                            {w.skill && (
                              <span className="text-[9px] text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/50 shrink-0 font-semibold">
                                {w.skill}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-300">
                            {w.companyEntityName && (
                              <span className="text-indigo-300 font-medium">🏢 {w.companyEntityName}</span>
                            )}
                            {w.roomEntityName && (
                              <span className="text-emerald-300 font-medium">🏠 {w.roomEntityName}</span>
                            )}
                            {!w.companyEntityName && !w.roomEntityName && w.entityName && (
                              <span className="text-purple-300 font-medium">📍 {w.entityName}</span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-x-3 text-[10px] text-slate-400 font-mono">
                            {w.mobile && <span>📱 {w.mobile}</span>}
                            {w.aadhar && <span>🪪 Aadhar: {w.aadhar}</span>}
                          </div>

                          <p className="text-[9px] text-slate-500 font-mono">
                            ID: {w.id} • By: {w.registeredByName || 'Unknown'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          onClick={() => setInspectedWorker(w)}
                          className="p-2 text-amber-400 hover:text-white bg-amber-950/50 hover:bg-amber-600 border border-amber-800/50 rounded-xl transition-all cursor-pointer"
                          title="View Profile & Logs"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setWorkerToDelete(w)}
                          disabled={isUpdating}
                          className="p-2 text-rose-400 hover:text-white bg-rose-950/50 hover:bg-rose-600 border border-rose-800/50 rounded-xl transition-all cursor-pointer"
                          title="Delete Worker Permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 text-center text-[10px] text-slate-500">
          {activeTab === 'users' 
            ? `Showing ${filteredUsers.length} total registered accounts in Firestore`
            : `Showing ${filteredWorkers.length} registered workers across all entities`}
        </div>
      </div>

      {/* Profile Detail Inspector Modal */}
      {inspectedUser && (
        <UserProfileDetailModal
          isOpen={!!inspectedUser}
          onClose={() => setInspectedUser(null)}
          targetUser={inspectedUser}
          currentUserRole={currentUser.role}
          allUsers={users}
          allEntities={entities}
          allWorkers={workers}
        />
      )}

      {/* Worker Detail Inspector Modal */}
      {inspectedWorker && (
        <WorkerDetailModal
          isOpen={!!inspectedWorker}
          onClose={() => setInspectedWorker(null)}
          worker={inspectedWorker}
          currentUser={currentUser}
          onWorkerUpdated={updated => {
            setInspectedWorker(updated);
            setWorkers(prev => prev.map(w => w.id === updated.id ? updated : w));
          }}
        />
      )}

      {/* In-App Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative overflow-hidden text-center border-t-4 border-t-rose-500">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">Delete User Account?</h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Are you sure you want to delete <span className="text-white font-bold">{userToDelete.displayName}</span> ({userToDelete.email})?
              </p>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={!!updatingUid}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                disabled={!!updatingUid}
                className="flex-1 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black rounded-xl text-xs transition-all shadow-lg flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                {updatingUid ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto text-white" />
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Delete Worker Confirmation Modal */}
      {workerToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative overflow-hidden text-center border-t-4 border-t-rose-500">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">Delete Worker Registration?</h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Permanently delete <span className="text-white font-bold">{workerToDelete.name}</span> (ID: {workerToDelete.id}) from Firestore database and Biometric FAISS Index?
              </p>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setWorkerToDelete(null)}
                disabled={!!updatingUid}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteWorker}
                disabled={!!updatingUid}
                className="flex-1 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black rounded-xl text-xs transition-all shadow-lg flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                {updatingUid ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto text-white" />
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
