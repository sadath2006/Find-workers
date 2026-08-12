import React, { useState, useEffect } from 'react';
import { UserProfile, EntityRecord, WorkerRecord } from '../types';
import { WorkerRegistrationModal } from './WorkerRegistrationModal';
import { 
  createOrUpdateEntity, 
  getOwnerEntities, 
  getAllEntities, 
  getAllUsers,
  addStaffToEntity, 
  removeStaffFromEntity, 
  addWorker, 
  getWorkersForEntity,
  getStaffEntitiesForMobile
} from '../firebase';
import { 
  Building2, 
  Briefcase, 
  Plus, 
  UserPlus, 
  Users, 
  Trash2, 
  Wrench, 
  CheckCircle2, 
  Phone, 
  MapPin, 
  Hash, 
  Loader2, 
  X,
  AlertCircle
} from 'lucide-react';

interface EntityManagementPanelProps {
  currentUser: UserProfile;
  onClose?: () => void;
}

export const EntityManagementPanel: React.FC<EntityManagementPanelProps> = ({ currentUser, onClose }) => {
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<EntityRecord | null>(null);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form States for Entity Creation / Edit
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [entityType, setEntityType] = useState<'Company' | 'Room'>('Company');
  const [entityName, setEntityName] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [address, setAddress] = useState('');

  // Form States for Staff Assignment
  const [newStaffMobile, setNewStaffMobile] = useState('');

  // Form States for Worker Registration
  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [workerName, setWorkerName] = useState('');
  const [workerMobile, setWorkerMobile] = useState('');
  const [workerSkill, setWorkerSkill] = useState('General Worker');

  useEffect(() => {
    loadEntities();
  }, [currentUser]);

  const loadEntities = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const [allUserList, list] = await Promise.all([
        getAllUsers(),
        fetchCurrentRoleEntities()
      ]);
      setUsers(allUserList);
      setEntities(list);
      if (list.length > 0 && !selectedEntity) {
        setSelectedEntity(list[0]);
        loadWorkers(list[0].id);
      }
    } catch (err: any) {
      console.error('Error loading entities:', err);
      setMsg({ type: 'error', text: 'Failed to load entities.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentRoleEntities = async (): Promise<EntityRecord[]> => {
    if (['Founder', 'Super Admin', 'Committee'].includes(currentUser.role)) {
      return await getAllEntities();
    }
    if (currentUser.role === 'Staff') {
      return await getStaffEntitiesForMobile(currentUser.mobileNumber);
    }
    const list = await getOwnerEntities(currentUser.uid);
    if (currentUser.mobileNumber) {
      const staffList = await getStaffEntitiesForMobile(currentUser.mobileNumber);
      const existingIds = new Set(list.map(e => e.id));
      staffList.forEach(se => {
        if (!existingIds.has(se.id)) list.push(se);
      });
    }
    return list;
  };

  const loadWorkers = async (entityId: string) => {
    try {
      const list = await getWorkersForEntity(entityId);
      setWorkers(list);
    } catch (err) {
      console.error('Error loading workers:', err);
    }
  };

  const handleSelectEntity = (ent: EntityRecord) => {
    setSelectedEntity(ent);
    loadWorkers(ent.id);
  };

  const handleSaveEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityName.trim()) {
      setMsg({ type: 'error', text: 'Entity name is required.' });
      return;
    }

    setActionLoading(true);
    setMsg(null);
    try {
      const saved = await createOrUpdateEntity({
        type: entityType,
        name: entityName,
        registrationNumber: regNumber,
        address: address,
        ownerUid: currentUser.uid,
        ownerName: currentUser.displayName,
        ownerEmail: currentUser.email,
        ownerMobile: currentUser.mobileNumber
      });

      setMsg({ type: 'success', text: `${entityType} registered successfully!` });
      setShowEntityForm(false);
      setEntityName('');
      setRegNumber('');
      setAddress('');
      await loadEntities();
      setSelectedEntity(saved);
    } catch (err: any) {
      setMsg({ type: 'error', text: 'Failed to save entity details.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntity) return;
    const cleanMobile = newStaffMobile.replace(/\D/g, '');
    if (cleanMobile.length < 10) {
      setMsg({ type: 'error', text: 'Please enter a valid 10-digit mobile number.' });
      return;
    }

    // Check 1: Own Mobile Number
    const cleanUserMobile = (currentUser.mobileNumber || '').replace(/\D/g, '');
    const cleanOwnerMobile = (selectedEntity.ownerMobile || '').replace(/\D/g, '');
    if ((cleanUserMobile && cleanMobile === cleanUserMobile) || (cleanOwnerMobile && cleanMobile === cleanOwnerMobile)) {
      setMsg({ type: 'error', text: 'You cannot assign your own mobile number as staff.' });
      return;
    }

    // Check 2: Restricted Roles (Founder, Super Admin, Committee, Room Owner, Company Owner)
    const matchedUser = users.find(u => (u.mobileNumber || '').replace(/\D/g, '') === cleanMobile);
    const restrictedRoles = ['Founder', 'Super Admin', 'Committee', 'Room Owner', 'Company Owner'];
    if (matchedUser && restrictedRoles.includes(matchedUser.role)) {
      setMsg({ 
        type: 'error', 
        text: `Cannot add staff: ${matchedUser.displayName || 'This user'} is already registered with the position "${matchedUser.role}".` 
      });
      return;
    }

    setActionLoading(true);
    setMsg(null);
    try {
      await addStaffToEntity(selectedEntity.id, cleanMobile);
      setMsg({ type: 'success', text: `Staff mobile ${cleanMobile} assigned!` });
      setNewStaffMobile('');
      const [allUserList, updatedList] = await Promise.all([
        getAllUsers(),
        fetchCurrentRoleEntities()
      ]);
      setUsers(allUserList);
      setEntities(updatedList);
      const updated = updatedList.find(e => e.id === selectedEntity.id);
      if (updated) setSelectedEntity(updated);
    } catch (err: any) {
      setMsg({ type: 'error', text: 'Failed to add staff member.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveStaff = async (mobile: string) => {
    if (!selectedEntity) return;
    setActionLoading(true);
    setMsg(null);
    try {
      await removeStaffFromEntity(selectedEntity.id, mobile);
      setMsg({ type: 'success', text: `Staff mobile ${mobile} removed.` });
      const updatedList = await fetchCurrentRoleEntities();
      setEntities(updatedList);
      const updated = updatedList.find(e => e.id === selectedEntity.id);
      if (updated) setSelectedEntity(updated);
    } catch (err: any) {
      setMsg({ type: 'error', text: 'Failed to remove staff member.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntity) return;
    if (!workerName.trim() || !workerMobile.trim()) {
      setMsg({ type: 'error', text: 'Worker name and mobile number are required.' });
      return;
    }

    setActionLoading(true);
    setMsg(null);
    try {
      await addWorker({
        entityId: selectedEntity.id,
        entityName: selectedEntity.name,
        name: workerName,
        mobile: workerMobile,
        skill: workerSkill,
        registeredByUid: currentUser.uid,
        registeredByName: currentUser.displayName
      });

      setMsg({ type: 'success', text: `Worker ${workerName} registered!` });
      setShowWorkerForm(false);
      setWorkerName('');
      setWorkerMobile('');
      await loadWorkers(selectedEntity.id);
    } catch (err: any) {
      setMsg({ type: 'error', text: 'Failed to register worker.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl p-5 space-y-5 shadow-xl relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
            {currentUser.role === 'Room Owner' ? <Building2 className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-sm font-black text-white">
              {currentUser.role === 'Staff' ? 'Assigned Entity & Worker Hub' : 'Entity & Staff Hub'}
            </h3>
            <p className="text-[10px] text-slate-400">
              {currentUser.role === 'Staff' 
                ? 'Manage Workers & View Assigned Companies/Rooms' 
                : 'Register Rooms/Companies, Assign Staff & Workers'}
            </p>
          </div>
        </div>

        {onClose && (
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-full">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {msg && (
        <div className={`p-3 rounded-xl text-xs flex items-center space-x-2 border ${
          msg.type === 'success'
            ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
            : 'bg-rose-950/50 border-rose-800 text-rose-300'
        }`}>
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Entity Selector & Add Button */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {currentUser.role === 'Staff' ? 'Assigned Entities' : 'Your Entities'} ({entities.length})
          </h4>

          {currentUser.role !== 'Staff' && (
            <button
              onClick={() => setShowEntityForm(!showEntityForm)}
              className="py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1 transition-all cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Entity</span>
            </button>
          )}
        </div>

        {/* Entity Cards */}
        {loading ? (
          <div className="p-6 text-center text-slate-500 text-xs flex items-center justify-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-red-500" />
            <span>Loading entity list...</span>
          </div>
        ) : entities.length === 0 ? (
          <div className="p-5 text-center bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 text-xs space-y-2">
            <p className="font-semibold">
              {currentUser.role === 'Staff' ? 'No assigned entities found for your mobile number.' : 'No registered entities yet.'}
            </p>
            <p className="text-[10px] text-slate-500">
              {currentUser.role === 'Staff'
                ? 'Ask your Room or Company Owner to add your mobile number as staff.'
                : 'Click "Add Entity" above to register your Room or Company.'}
            </p>
          </div>
        ) : (
          <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
            {entities.map(ent => (
              <button
                key={ent.id}
                onClick={() => handleSelectEntity(ent)}
                className={`py-2 px-3.5 rounded-xl text-xs font-bold shrink-0 flex items-center space-x-2 transition-all cursor-pointer border ${
                  selectedEntity?.id === ent.id
                    ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                {ent.type === 'Room' ? <Building2 className="w-3.5 h-3.5" /> : <Briefcase className="w-3.5 h-3.5" />}
                <span>{ent.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add Entity Form Modal/Drawer */}
      {showEntityForm && (
        <form onSubmit={handleSaveEntity} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h5 className="text-xs font-extrabold text-white">Register New Entity</h5>
            <button type="button" onClick={() => setShowEntityForm(false)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEntityType('Company')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer ${
                entityType === 'Company'
                  ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              Company Owner
            </button>
            <button
              type="button"
              onClick={() => setEntityType('Room')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer ${
                entityType === 'Room'
                  ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              Room Owner
            </button>
          </div>

          <input
            type="text"
            value={entityName}
            onChange={e => setEntityName(e.target.value)}
            placeholder={`${entityType} Name *`}
            required
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />

          <input
            type="text"
            value={regNumber}
            onChange={e => setRegNumber(e.target.value)}
            placeholder="Reg/License Number (Optional)"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />

          <input
            type="text"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Address / Location"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />

          <button
            type="submit"
            disabled={actionLoading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center space-x-2 cursor-pointer shadow-md"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Save Entity Details</span>}
          </button>
        </form>
      )}

      {/* Selected Entity Dashboard */}
      {selectedEntity && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          <div className="p-4 bg-slate-950 rounded-2xl border border-purple-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-md border border-purple-700/50">
                {selectedEntity.type} Entity
              </span>
              <span className="text-[10px] text-slate-500 font-mono">ID: {selectedEntity.id.slice(0, 8)}</span>
            </div>

            <h4 className="text-base font-extrabold text-white">{selectedEntity.name}</h4>

            {selectedEntity.registrationNumber && (
              <p className="text-xs text-slate-400 flex items-center space-x-1.5 font-mono">
                <Hash className="w-3.5 h-3.5 text-purple-400" />
                <span>Reg: {selectedEntity.registrationNumber}</span>
              </p>
            )}

            {selectedEntity.address && (
              <p className="text-xs text-slate-400 flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">{selectedEntity.address}</span>
              </p>
            )}
          </div>

          {/* Assign Staff Section (By Mobile Number) - ONLY for Owners and Admins */}
          {currentUser.role !== 'Staff' && (
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <UserPlus className="w-4 h-4 text-indigo-400" />
                  <span>Staff Management (Assign by Mobile)</span>
                </h5>
                <span className="text-[10px] text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-800/40 font-bold">
                  {selectedEntity.staffMobiles?.length || 0} Staff
                </span>
              </div>

              <form onSubmit={handleAddStaff} className="flex space-x-2">
                <input
                  type="tel"
                  value={newStaffMobile}
                  onChange={e => setNewStaffMobile(e.target.value)}
                  placeholder="Enter 10-digit Staff Mobile No"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shrink-0 cursor-pointer flex items-center space-x-1"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Assign</span>}
                </button>
              </form>

              {/* Staff List */}
              {selectedEntity.staffMobiles && selectedEntity.staffMobiles.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  {selectedEntity.staffMobiles.map(m => {
                    const matchedUser = users.find(u => (u.mobileNumber || '').replace(/\D/g, '') === m);
                    return (
                      <div
                        key={m}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800/80 text-xs"
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          {matchedUser ? (
                            <div className="flex items-center space-x-2">
                              <span className="font-extrabold text-white truncate text-xs">{matchedUser.displayName}</span>
                              <span className="text-[9px] text-emerald-400 font-extrabold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/50 shrink-0">
                                {matchedUser.role}
                              </span>
                            </div>
                          ) : (
                            <span className="text-amber-400 font-extrabold text-[10px] bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50 w-fit">
                              Unregistered Staff
                            </span>
                          )}
                          <span className="font-mono text-slate-400 text-[10px] mt-0.5 flex items-center space-x-1">
                            <Phone className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span>{m}</span>
                          </span>
                        </div>

                        <button
                          onClick={() => handleRemoveStaff(m)}
                          disabled={actionLoading}
                          className="text-rose-400 hover:text-white hover:bg-rose-600/30 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Remove Staff"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic">
                  No staff mobile numbers assigned to this entity yet.
                </p>
              )}
            </div>
          )}

          {/* Workers Section */}
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-white flex items-center space-x-1.5">
                <Wrench className="w-4 h-4 text-amber-400" />
                <span>Workers under {selectedEntity.name} ({workers.length})</span>
              </h5>

              <button
                onClick={() => setShowWorkerForm(true)}
                className="py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white border border-red-500/30 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center space-x-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Worker</span>
              </button>
            </div>

            {/* Worker Modal */}
            {showWorkerForm && (
              <WorkerRegistrationModal
                isOpen={showWorkerForm}
                onClose={() => setShowWorkerForm(false)}
                currentUser={currentUser}
                preSelectedEntity={selectedEntity}
                onWorkerAdded={async () => {
                  if (selectedEntity) {
                    const updated = await getWorkersForEntity(selectedEntity.id);
                    setWorkers(updated);
                  }
                }}
              />
            )}

            {/* Worker List */}
            {workers.length > 0 ? (
              <div className="space-y-2">
                {workers.map(w => (
                  <div key={w.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800/90 text-xs flex items-center justify-between space-x-3">
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      {w.photoURL ? (
                        <img
                          src={w.photoURL}
                          alt={w.name}
                          className="w-11 h-11 rounded-xl object-cover border border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-400 font-black flex items-center justify-center shrink-0 border border-amber-500/30 text-base">
                          {w.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <h6 className="font-extrabold text-white text-xs truncate">{w.name}</h6>
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
                        </div>
                        {w.mobile && (
                          <p className="text-[10px] text-slate-400 font-mono">📱 {w.mobile}</p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[9px] text-slate-500 font-mono block">By {w.registeredByName}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">No workers registered under this entity yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
