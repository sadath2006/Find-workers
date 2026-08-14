import React, { useState } from 'react';
import { WorkerRecord, UserProfile, EntityRecord, WorkerComment, WorkerTransferLog, WorkerScanLog } from '../types';
import { 
  addWorkerComment, 
  deleteWorkerComment, 
  transferWorkerEntity,
  getAllEntities,
  getOwnerEntities
} from '../firebase';
import { 
  X, 
  UserCheck, 
  Building2, 
  Home, 
  Phone, 
  CreditCard, 
  Briefcase, 
  Calendar, 
  Clock, 
  History, 
  Scan, 
  MessageSquare, 
  Send, 
  Trash2, 
  ArrowRightLeft, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  ArrowRight,
  Info
} from 'lucide-react';

interface WorkerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  worker: WorkerRecord;
  currentUser: UserProfile;
  onWorkerUpdated?: (updatedWorker: WorkerRecord) => void;
}

export const WorkerDetailModal: React.FC<WorkerDetailModalProps> = ({
  isOpen,
  onClose,
  worker: initialWorker,
  currentUser,
  onWorkerUpdated
}) => {
  const [worker, setWorker] = useState<WorkerRecord>(initialWorker);
  const [activeTab, setActiveTab] = useState<'details' | 'transfers' | 'scans' | 'comments'>('details');

  // Comment state
  const [newCommentText, setNewCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // Transfer modal state
  const [showTransferPanel, setShowTransferPanel] = useState(false);
  const [availableEntities, setAvailableEntities] = useState<EntityRecord[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [transferResidentType, setTransferResidentType] = useState<'Company' | 'Outliving' | 'Room'>('Company');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const isOwnerOrAdmin = ['Founder', 'Super Admin', 'Committee', 'Room Owner', 'Company Owner'].includes(currentUser.role);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    setCommentLoading(true);
    setStatusMsg(null);
    try {
      const added = await addWorkerComment(worker.id, newCommentText, currentUser);
      const updatedComments = [added, ...(worker.comments || [])];
      const updated = { ...worker, comments: updatedComments };
      setWorker(updated);
      setNewCommentText('');
      if (onWorkerUpdated) onWorkerUpdated(updated);
      setStatusMsg({ type: 'success', text: 'Comment added to worker profile!' });
    } catch (err: any) {
      console.error('Error posting comment:', err);
      setStatusMsg({ type: 'error', text: 'Failed to post comment.' });
    } finally {
      setCommentLoading(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;
    setStatusMsg(null);
    try {
      await deleteWorkerComment(worker.id, commentId);
      const updatedComments = (worker.comments || []).filter(c => c.id !== commentId);
      const updated = { ...worker, comments: updatedComments };
      setWorker(updated);
      if (onWorkerUpdated) onWorkerUpdated(updated);
      setStatusMsg({ type: 'success', text: 'Comment deleted.' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Failed to delete comment.' });
    }
  };

  const openTransferPanel = async () => {
    setShowTransferPanel(true);
    setStatusMsg(null);
    try {
      let entities: EntityRecord[] = [];
      if (['Founder', 'Super Admin', 'Committee'].includes(currentUser.role)) {
        entities = await getAllEntities();
      } else {
        entities = await getOwnerEntities(currentUser.uid);
      }
      setAvailableEntities(entities);
      if (entities.length > 0) {
        setSelectedEntityId(entities[0].id);
      }
    } catch (err) {
      console.error('Error loading entities for transfer:', err);
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntityId) {
      setStatusMsg({ type: 'error', text: 'Please select an entity for transfer.' });
      return;
    }

    const targetEntity = availableEntities.find(e => e.id === selectedEntityId);
    if (!targetEntity) {
      setStatusMsg({ type: 'error', text: 'Target entity not found.' });
      return;
    }

    const roomEntity = selectedRoomId ? (availableEntities.find(e => e.id === selectedRoomId) || null) : null;

    setTransferLoading(true);
    setStatusMsg(null);
    try {
      const updated = await transferWorkerEntity(
        worker.id,
        targetEntity,
        transferResidentType,
        roomEntity,
        currentUser,
        transferNotes.trim() || undefined
      );

      setWorker(updated);
      setShowTransferPanel(false);
      setTransferNotes('');
      if (onWorkerUpdated) onWorkerUpdated(updated);
      setStatusMsg({ 
        type: 'success', 
        text: `Worker successfully transferred to ${targetEntity.name} (${targetEntity.type})!` 
      });
    } catch (err: any) {
      console.error('Error transferring worker:', err);
      setStatusMsg({ type: 'error', text: err.message || 'Failed to transfer worker.' });
    } finally {
      setTransferLoading(false);
    }
  };

  const transferLogs = worker.transferLogs || [];
  const scanLogs = worker.scanLogs || [];
  const comments = worker.comments || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-lg w-full h-[90vh] flex flex-col shadow-2xl relative overflow-hidden animate-scaleUp">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 sticky top-0 z-20">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-red-600/20 text-red-400 border border-red-500/30">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center space-x-2">
                <span>Worker Profile Dossier</span>
                <span className="text-[10px] bg-red-600 text-white font-extrabold px-1.5 py-0.5 rounded-full uppercase">
                  Verified
                </span>
              </h2>
              <p className="text-[10px] text-slate-400 font-medium">
                Biometric ID: <span className="font-mono text-slate-300">{worker.id.substring(0, 10)}...</span>
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

        {/* Status Notification Message */}
        {statusMsg && (
          <div className={`px-4 py-2.5 text-xs font-semibold flex items-center justify-between border-b ${
            statusMsg.type === 'success' 
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300' 
              : 'bg-rose-950/80 border-rose-800 text-rose-300'
          }`}>
            <span>{statusMsg.text}</span>
            <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Worker Hero Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-red-950/40 border border-slate-800 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3.5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 text-white border-2 border-red-500/40 flex items-center justify-center font-black text-2xl shadow-lg shrink-0">
                  {worker.name ? worker.name.charAt(0).toUpperCase() : 'W'}
                </div>

                <div>
                  <h3 className="text-base font-black text-white">{worker.name}</h3>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="text-[11px] font-bold text-red-400 bg-red-950/60 px-2 py-0.5 rounded-md border border-red-800/50">
                      {worker.skill || 'General Worker'}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {worker.mobile || 'No mobile'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transfer Worker Trigger */}
              {isOwnerOrAdmin && (
                <button
                  onClick={openTransferPanel}
                  className="px-2.5 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white text-xs font-extrabold rounded-xl shadow-md flex items-center space-x-1.5 cursor-pointer transition-all border border-amber-400/40"
                  title="Transfer worker to your Company or Room"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Transfer</span>
                </button>
              )}
            </div>

            {/* Quick Entity Details Pills */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
              <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex items-center space-x-1">
                  <Building2 className="w-3 h-3 text-red-400" />
                  <span>Assigned Company</span>
                </p>
                <p className="text-xs font-extrabold text-slate-200 truncate mt-0.5">
                  {worker.companyEntityName || worker.entityName || 'Not Assigned'}
                </p>
              </div>

              <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex items-center space-x-1">
                  <Home className="w-3 h-3 text-indigo-400" />
                  <span>Residence / Room</span>
                </p>
                <p className="text-xs font-extrabold text-slate-200 truncate mt-0.5">
                  {worker.roomEntityName || 'Not Assigned'}
                </p>
              </div>
            </div>
          </div>

          {/* In-Modal Transfer Form Panel */}
          {showTransferPanel && (
            <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-700/50 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-amber-700/40 pb-2">
                <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                  <span>Transfer / Update Worker Entity</span>
                </h4>
                <button 
                  onClick={() => setShowTransferPanel(false)}
                  className="text-amber-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {availableEntities.length === 0 ? (
                <p className="text-xs text-amber-200/80 italic">
                  No owned entities found. You need to create a Company or Room first.
                </p>
              ) : (
                <form onSubmit={handleExecuteTransfer} className="space-y-3">
                  <div>
                    <label className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block mb-1">
                      Select Target Entity (Company / Room)
                    </label>
                    <select
                      value={selectedEntityId}
                      onChange={e => setSelectedEntityId(e.target.value)}
                      className="w-full bg-slate-950 border border-amber-700/60 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      {availableEntities.map(ent => (
                        <option key={ent.id} value={ent.id}>
                          {ent.name} ({ent.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block mb-1">
                        Resident Type
                      </label>
                      <select
                        value={transferResidentType}
                        onChange={e => setTransferResidentType(e.target.value as any)}
                        className="w-full bg-slate-950 border border-amber-700/60 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      >
                        <option value="Company">Company</option>
                        <option value="Room">Room</option>
                        <option value="Outliving">Outliving</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block mb-1">
                        Room (Optional)
                      </label>
                      <select
                        value={selectedRoomId}
                        onChange={e => setSelectedRoomId(e.target.value)}
                        className="w-full bg-slate-950 border border-amber-700/60 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      >
                        <option value="">None / Auto</option>
                        {availableEntities.filter(e => e.type === 'Room').map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block mb-1">
                      Transfer Reason / Remarks (Optional)
                    </label>
                    <input
                      type="text"
                      value={transferNotes}
                      onChange={e => setTransferNotes(e.target.value)}
                      placeholder="e.g. Scanned at site duplicate, new contract..."
                      className="w-full bg-slate-950 border border-amber-700/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      type="submit"
                      disabled={transferLoading}
                      className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-xl text-xs transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-1.5"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>{transferLoading ? 'Updating...' : 'Confirm Transfer & Update Log'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTransferPanel(false)}
                      className="px-3 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all cursor-pointer text-center truncate ${
                activeTab === 'details'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('transfers')}
              className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all cursor-pointer text-center truncate ${
                activeTab === 'transfers'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Movements ({transferLogs.length})
            </button>
            <button
              onClick={() => setActiveTab('scans')}
              className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all cursor-pointer text-center truncate ${
                activeTab === 'scans'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Scan Logs ({scanLogs.length})
            </button>
            <button
              onClick={() => setActiveTab('comments')}
              className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all cursor-pointer text-center truncate ${
                activeTab === 'comments'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Notes ({comments.length})
            </button>
          </div>

          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-900">
                  <span className="text-slate-400 flex items-center space-x-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                    <span>Aadhar / Identity No.</span>
                  </span>
                  <span className="font-mono font-bold text-slate-200">
                    {worker.aadhar || 'Not recorded'}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-slate-900">
                  <span className="text-slate-400 flex items-center space-x-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    <span>Contact Mobile</span>
                  </span>
                  <span className="font-mono font-bold text-slate-200">
                    {worker.mobile || 'Not recorded'}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-slate-900">
                  <span className="text-slate-400 flex items-center space-x-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                    <span>Resident Category</span>
                  </span>
                  <span className="font-bold text-slate-200">
                    {worker.residentType || 'Company'}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-slate-900">
                  <span className="text-slate-400 flex items-center space-x-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                    <span>Registered By</span>
                  </span>
                  <span className="font-bold text-slate-200">
                    {worker.registeredByName} ({worker.registeredByRole || 'Owner'})
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>Registration Date</span>
                  </span>
                  <span className="font-mono text-slate-300">
                    {worker.createdAt ? new Date(worker.createdAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Biometric Verification Status Box */}
              <div className="p-3.5 bg-emerald-950/30 border border-emerald-800/50 rounded-2xl flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-300">
                    ArcFace 512D Biometric Registered
                  </h4>
                  <p className="text-[10px] text-emerald-400/80">
                    Facial geometry indexed in FAISS vector engine for instant verification.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPANY & ROOM TRANSFERS LOG */}
          {activeTab === 'transfers' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <History className="w-4 h-4 text-purple-400" />
                  <span>Company & Room Movement Logs</span>
                </h4>
                <span className="text-[10px] text-slate-400">{transferLogs.length} events</span>
              </div>

              {transferLogs.length === 0 ? (
                <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 text-center text-xs text-slate-400 italic">
                  No transfer logs recorded yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {transferLogs.map((log, index) => (
                    <div
                      key={log.id || index}
                      className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800/90 space-y-2 text-xs hover:border-purple-500/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-md font-extrabold text-[10px] uppercase ${
                          log.actionType === 'created'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                            : 'bg-purple-950 text-purple-300 border border-purple-800/50'
                        }`}>
                          {log.actionType === 'created' ? 'Initial Registration' : 'Entity Transfer'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                        <div className="p-2 bg-slate-900 rounded-xl">
                          <p className="text-[9px] text-slate-500 font-bold uppercase">To Company</p>
                          <p className="font-bold text-slate-200 truncate">{log.toCompany || 'Not Assigned'}</p>
                        </div>
                        <div className="p-2 bg-slate-900 rounded-xl">
                          <p className="text-[9px] text-slate-500 font-bold uppercase">To Room</p>
                          <p className="font-bold text-slate-200 truncate">{log.toRoom || 'Not Assigned'}</p>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-900">
                        <span>By: <span className="text-slate-200 font-semibold">{log.transferredByName}</span> ({log.transferredByRole})</span>
                        {log.notes && <span className="italic text-slate-500">{log.notes}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SCAN LOGS */}
          {activeTab === 'scans' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <Scan className="w-4 h-4 text-cyan-400" />
                  <span>Biometric Verification Logs</span>
                </h4>
                <span className="text-[10px] text-slate-400">{scanLogs.length} scans</span>
              </div>

              {scanLogs.length === 0 ? (
                <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 text-center text-xs text-slate-400 italic">
                  No public or owner face scans recorded for this worker yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {scanLogs.map((scan, index) => (
                    <div
                      key={scan.id || index}
                      className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5 text-xs hover:border-cyan-500/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="p-1 rounded-md bg-cyan-950 text-cyan-400 border border-cyan-800/50">
                            <Scan className="w-3 h-3" />
                          </span>
                          <span className="font-bold text-white">{scan.scannedByName}</span>
                          <span className="text-[10px] text-slate-400">({scan.scannedByRole})</span>
                        </div>
                        <span className="text-[10px] text-cyan-400 font-bold bg-cyan-950 px-2 py-0.5 rounded-md border border-cyan-800/50">
                          {scan.confidence}% Match
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                        <span>Method: <span className="capitalize text-slate-300">{scan.method}</span></span>
                        <span className="font-mono">
                          {scan.timestamp ? new Date(scan.timestamp).toLocaleString() : 'N/A'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: COMMENTS & NOTES */}
          {activeTab === 'comments' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <MessageSquare className="w-4 h-4 text-red-400" />
                  <span>Profile Notes & Remarks</span>
                </h4>
                <span className="text-[10px] text-slate-400">{comments.length} notes</span>
              </div>

              {/* Add Comment Form */}
              <form onSubmit={handlePostComment} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newCommentText}
                  onChange={e => setNewCommentText(e.target.value)}
                  placeholder="Add feedback, police check remarks, or review..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                />
                <button
                  type="submit"
                  disabled={commentLoading || !newCommentText.trim()}
                  className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-md"
                  title="Post Note"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              {/* Comments List */}
              {comments.length === 0 ? (
                <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 text-center text-xs text-slate-400 italic">
                  No notes or comments on this worker profile yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {comments.map((c, index) => {
                    const isAuthor = c.authorUid === currentUser.uid;
                    const canDelete = isAuthor || isOwnerOrAdmin;

                    return (
                      <div
                        key={c.id || index}
                        className="p-3 bg-slate-950 rounded-2xl border border-slate-800/90 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-5 h-5 rounded-full bg-red-900 text-red-200 font-bold text-[9px] flex items-center justify-center">
                              {c.authorName ? c.authorName.charAt(0) : 'U'}
                            </div>
                            <span className="font-bold text-white text-xs">{c.authorName}</span>
                            {c.authorRole && (
                              <span className="text-[9px] text-slate-400">({c.authorRole})</span>
                            )}
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <span className="text-[9px] text-slate-500 font-mono">
                              {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}
                            </span>
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteComment(c.id)}
                                className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed pl-7">
                          {c.content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500">
            Find My Workers • Biometric Network
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
