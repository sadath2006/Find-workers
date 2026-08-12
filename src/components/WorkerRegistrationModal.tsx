import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, EntityRecord, WorkerRecord } from '../types';
import { addWorker, updateWorker, getAllWorkers, getOwnerEntities, getAllEntities, getStaffEntitiesForMobile } from '../firebase';
import { extractFaceVector, calculateFaceSimilarity, verifyDuplicateFaceBatch } from '../utils/faceMatching';
import { 
  X, 
  Camera, 
  Upload, 
  Scan, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  Home, 
  UserCheck, 
  Loader2, 
  ShieldCheck, 
  Phone, 
  CreditCard, 
  User, 
  RefreshCw,
  Link as LinkIcon
} from 'lucide-react';

interface WorkerRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  preSelectedEntity?: EntityRecord | null;
  onWorkerAdded?: () => void;
}

export const WorkerRegistrationModal: React.FC<WorkerRegistrationModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  preSelectedEntity,
  onWorkerAdded
}) => {
  // Navigation / Camera states
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [useCamera, setUseCamera] = useState<boolean>(false);
  const [scanningFace, setScanningFace] = useState<boolean>(false);
  const [faceVector, setFaceVector] = useState<number[]>([]);
  
  // Duplicate Detection Result
  const [duplicateMatch, setDuplicateMatch] = useState<{
    worker: WorkerRecord;
    similarityScore: number;
  } | null>(null);

  // Entities owned or assigned to current user
  const [userEntities, setUserEntities] = useState<EntityRecord[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<EntityRecord | null>(null);

  // Form Fields
  const [workerName, setWorkerName] = useState<string>('');
  const [residentType, setResidentType] = useState<'Company' | 'Outliving' | 'Room'>('Company');
  const [mobileNumber, setMobileNumber] = useState<string>('');
  const [aadharNumber, setAadharNumber] = useState<string>('');
  const [skill, setSkill] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Camera video ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Load user entities on open
  useEffect(() => {
    if (isOpen) {
      resetForm();
      loadEntities();
    } else {
      stopCamera();
    }
  }, [isOpen]);

  const resetForm = () => {
    setPhotoDataUrl('');
    setUseCamera(false);
    setScanningFace(false);
    setFaceVector([]);
    setDuplicateMatch(null);
    setWorkerName('');
    setResidentType('Company');
    setMobileNumber('');
    setAadharNumber('');
    setSkill('');
    setMsg(null);
  };

  const loadEntities = async () => {
    try {
      let list: EntityRecord[] = [];
      if (['Founder', 'Super Admin', 'Committee'].includes(currentUser.role)) {
        list = await getAllEntities();
      } else if (currentUser.role === 'Staff') {
        if (currentUser.mobileNumber) {
          list = await getStaffEntitiesForMobile(currentUser.mobileNumber);
        }
      } else {
        list = await getOwnerEntities(currentUser.uid);
        if (currentUser.mobileNumber) {
          const staffList = await getStaffEntitiesForMobile(currentUser.mobileNumber);
          const existingIds = new Set(list.map(e => e.id));
          staffList.forEach(se => {
            if (!existingIds.has(se.id)) list.push(se);
          });
        }
      }
      setUserEntities(list);

      if (preSelectedEntity) {
        setSelectedEntity(preSelectedEntity);
      } else if (list.length > 0) {
        setSelectedEntity(list[0]);
      }
    } catch (err) {
      console.error('Error loading entities for registration:', err);
    }
  };

  // Determine active company and room names based on user role & selected entity
  const activeEntity = selectedEntity || (userEntities.length > 0 ? userEntities[0] : null);
  const isCompanyContext = activeEntity?.type === 'Company';
  const isRoomContext = activeEntity?.type === 'Room';

  // Company Name Logic:
  // If registered by Company Owner or Staff, company name is locked to active company.
  // If Room Owner or Staff, company name is default "Not Assigned".
  const companyNameDisplay = isCompanyContext ? (activeEntity?.name || 'Not Assigned') : 'Not Assigned';

  // Resident Entity Logic:
  // If Company context & residentType == 'Company', residence is Company Name.
  // If Company context & residentType == 'Outliving', residence is "Not Assigned".
  // If Room context, residence is Room Name (and residentType forced to 'Room').
  const residenceNameDisplay = isRoomContext 
    ? (activeEntity?.name || 'Not Assigned') 
    : (residentType === 'Company' ? companyNameDisplay : 'Not Assigned');

  // Start Camera
  const startCamera = async () => {
    setUseCamera(true);
    setMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err?.message?.includes('Permission denied')) {
        setMsg({ type: 'error', text: 'Camera permission was denied. Please allow camera access in browser site settings or use "Upload Photo".' });
      } else {
        setMsg({ type: 'error', text: 'Could not access camera. Please upload a photo instead.' });
      }
      setUseCamera(false);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    setUseCamera(false);
  };

  // Capture Photo from Camera
  const capturePhotoFromCamera = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 400;
    canvas.height = videoRef.current.videoHeight || 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      stopCamera();
      processImageForFaceMatch(dataUrl);
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        processImageForFaceMatch(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // Process image & match face against database
  const processImageForFaceMatch = async (dataUrl: string) => {
    setPhotoDataUrl(dataUrl);
    setScanningFace(true);
    setDuplicateMatch(null);
    setMsg(null);

    try {
      // 1. Extract Face Vector
      const vector = await extractFaceVector(dataUrl);
      setFaceVector(vector);

      // 2. Fast Scan via Python FastAPI / Vector Math Engine
      const allWorkers = await getAllWorkers();
      const matchResult = await verifyDuplicateFaceBatch(dataUrl, vector, allWorkers);

      if (matchResult.duplicateFound && matchResult.matchedWorkerId) {
        const matchedWorker = allWorkers.find(w => w.id === matchResult.matchedWorkerId);
        if (matchedWorker) {
          setDuplicateMatch({
            worker: matchedWorker,
            similarityScore: matchResult.similarityScore
          });
          setWorkerName(matchedWorker.name);
          setMobileNumber(matchedWorker.mobile || '');
          setAadharNumber(matchedWorker.aadhar || '');
        }
      }
    } catch (err) {
      console.error('Face scanning error:', err);
    } finally {
      setScanningFace(false);
    }
  };

  // Handle Link Entity to Existing Duplicate Worker
  const handleLinkExistingWorker = async () => {
    if (!duplicateMatch || !activeEntity) {
      setMsg({ type: 'error', text: 'Please select an entity to link.' });
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const existing = duplicateMatch.worker;
      const updates: Partial<WorkerRecord> = {};

      if (isCompanyContext) {
        updates.companyEntityId = activeEntity.id;
        updates.companyEntityName = activeEntity.name;
        updates.residentType = residentType;
      } else if (isRoomContext) {
        updates.roomEntityId = activeEntity.id;
        updates.roomEntityName = activeEntity.name;
        updates.residentType = 'Room';
      }

      // Preserve primary entityId if empty
      if (!existing.entityId) {
        updates.entityId = activeEntity.id;
        updates.entityName = activeEntity.name;
      }

      await updateWorker(existing.id, updates);

      setMsg({ 
        type: 'success', 
        text: `Successfully linked ${existing.name} to ${activeEntity.name}!` 
      });

      setTimeout(() => {
        if (onWorkerAdded) onWorkerAdded();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error linking worker:', err);
      setMsg({ type: 'error', text: err?.message || 'Failed to link worker.' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Save New Worker
  const handleSaveNewWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoDataUrl) {
      setMsg({ type: 'error', text: 'Please capture or upload a worker photo first.' });
      return;
    }
    if (!workerName.trim()) {
      setMsg({ type: 'error', text: 'Please enter worker name.' });
      return;
    }
    if (!activeEntity) {
      setMsg({ type: 'error', text: 'Please select an entity for registration.' });
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const payload: Omit<WorkerRecord, 'id' | 'createdAt'> = {
        entityId: activeEntity.id,
        entityName: activeEntity.name,
        name: workerName.trim(),
        photoURL: photoDataUrl,
        faceEmbedding: faceVector,
        companyEntityId: isCompanyContext ? activeEntity.id : '',
        companyEntityName: companyNameDisplay,
        residentType: isRoomContext ? 'Room' : residentType,
        roomEntityId: isRoomContext ? activeEntity.id : '',
        roomEntityName: isRoomContext ? activeEntity.name : 'Not Assigned',
        mobile: mobileNumber.trim(),
        aadhar: aadharNumber.trim(),
        skill: skill.trim() || 'General Worker',
        registeredByUid: currentUser.uid,
        registeredByName: currentUser.displayName,
        registeredByRole: currentUser.role
      };

      await addWorker(payload);
      setMsg({ type: 'success', text: `Worker "${workerName}" registered successfully!` });

      setTimeout(() => {
        if (onWorkerAdded) onWorkerAdded();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Worker save error:', err);
      setMsg({ type: 'error', text: err?.message || 'Failed to register worker.' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-lg w-full my-auto p-5 sm:p-6 shadow-2xl relative overflow-hidden space-y-4 animate-scaleUp">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-red-600/20 text-red-500 border border-red-500/30">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white leading-tight">Worker Registration</h3>
              <p className="text-[10px] text-slate-400">Biometric Face Matching & Entity Mapping</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/60 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Banner */}
        {msg && (
          <div className={`p-3 rounded-2xl text-xs font-bold flex items-center space-x-2 border ${
            msg.type === 'success' 
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60' 
              : 'bg-rose-950/80 text-rose-300 border-rose-800/60'
          }`}>
            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        {/* Entity Selector (If multiple available) */}
        {userEntities.length > 1 && (
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
              <Building2 className="w-3 h-3 text-red-500" />
              <span>Select Registration Entity Context:</span>
            </label>
            <select
              value={activeEntity?.id || ''}
              onChange={(e) => {
                const ent = userEntities.find(x => x.id === e.target.value);
                if (ent) setSelectedEntity(ent);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-red-500"
            >
              {userEntities.map(e => (
                <option key={e.id} value={e.id}>
                  {e.type === 'Company' ? '🏢 Company: ' : '🏠 Room: '}{e.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Step 1: Photo Capture or File Upload */}
        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center space-x-1.5">
              <Camera className="w-4 h-4 text-cyan-400" />
              <span>Step 1: Capture / Upload Worker Photo</span>
            </span>
            {photoDataUrl && (
              <button
                type="button"
                onClick={() => {
                  setPhotoDataUrl('');
                  setDuplicateMatch(null);
                }}
                className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retake</span>
              </button>
            )}
          </div>

          {/* Camera Viewfinder / Photo Preview */}
          {useCamera ? (
            <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-slate-800 flex flex-col items-center justify-center">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={capturePhotoFromCamera}
                className="absolute bottom-3 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 shadow-lg cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Take Snap</span>
              </button>
            </div>
          ) : photoDataUrl ? (
            <div className="relative flex items-center space-x-3 p-2 bg-slate-900 rounded-xl border border-slate-800">
              <img
                src={photoDataUrl}
                alt="Worker Snap"
                className="w-20 h-20 rounded-xl object-cover border border-slate-700 shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center space-x-1 text-emerald-400 text-xs font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Biometric Photo Ready</span>
                </div>
                {scanningFace ? (
                  <p className="text-[11px] text-cyan-400 flex items-center space-x-1 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Searching Duplicate Faces...</span>
                  </p>
                ) : duplicateMatch ? (
                  <p className="text-[11px] text-amber-400 font-bold flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Duplicate Face Found ({duplicateMatch.similarityScore}% match)!</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    No duplicate found in database. Ready for new registration.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={startCamera}
                className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl flex flex-col items-center justify-center space-y-1 transition-colors cursor-pointer"
              >
                <Camera className="w-5 h-5 text-red-500" />
                <span className="text-xs font-bold text-white">Live Camera</span>
              </button>

              <label className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl flex flex-col items-center justify-center space-y-1 transition-colors cursor-pointer">
                <Upload className="w-5 h-5 text-indigo-400" />
                <span className="text-xs font-bold text-white">Upload Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {/* DUPLICATE FACE MATCH BANNER & LINKING ACTION */}
        {duplicateMatch && (
          <div className="p-4 bg-amber-950/40 border border-amber-500/50 rounded-2xl space-y-3 animate-fadeIn">
            <div className="flex items-center space-x-2 text-amber-400 font-extrabold text-xs">
              <Scan className="w-4 h-4 shrink-0" />
              <span>DUPLICATE FACE DETECTED IN DATABASE ({duplicateMatch.similarityScore}% Match)</span>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <p className="text-white font-bold flex items-center justify-between">
                <span>Existing Worker: {duplicateMatch.worker.name}</span>
                <span className="text-[10px] text-amber-400 font-mono">ID: {duplicateMatch.worker.id.slice(0, 6)}</span>
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1">
                <div>
                  <span className="text-slate-500">Company: </span>
                  <span className="font-semibold text-indigo-300">{duplicateMatch.worker.companyEntityName || 'Not Assigned'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Residence: </span>
                  <span className="font-semibold text-emerald-300">{duplicateMatch.worker.roomEntityName || duplicateMatch.worker.residentType || 'Not Assigned'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] text-amber-200">
                This worker is already registered in Find Worker network. Would you like to link <span className="font-bold text-white">{activeEntity?.name}</span> to this worker profile?
              </p>

              <button
                type="button"
                onClick={handleLinkExistingWorker}
                disabled={loading}
                className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-md cursor-pointer transition-all"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <LinkIcon className="w-4 h-4" />
                    <span>Update & Link Worker to {activeEntity?.name}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: New Worker Registration Form (If no duplicate match OR overriding) */}
        {!duplicateMatch && (
          <form onSubmit={handleSaveNewWorker} className="space-y-3">
            {/* Worker Name */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                <User className="w-3 h-3 text-red-500" />
                <span>Worker Full Name *</span>
              </label>
              <input
                type="text"
                required
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder="Enter worker full name"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
              />
            </div>

            {/* Entity Mapping Displays (Auto-filled & Read-only) */}
            <div className="grid grid-cols-2 gap-2">
              {/* Company Field */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                  <Building2 className="w-3 h-3 text-indigo-400" />
                  <span>Company</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={companyNameDisplay}
                  className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl px-3 py-2 text-xs font-semibold text-indigo-300 cursor-not-allowed"
                />
              </div>

              {/* Resident Type Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                  <Home className="w-3 h-3 text-emerald-400" />
                  <span>Resident Type</span>
                </label>
                {isRoomContext ? (
                  <input
                    type="text"
                    readOnly
                    value="Room"
                    className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl px-3 py-2 text-xs font-semibold text-emerald-300 cursor-not-allowed"
                  />
                ) : (
                  <select
                    value={residentType}
                    onChange={(e) => setResidentType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Company">Company</option>
                    <option value="Outliving">Outliving</option>
                  </select>
                )}
              </div>
            </div>

            {/* Resident (Residence Entity) Field */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                <Home className="w-3 h-3 text-emerald-400" />
                <span>Residence Entity</span>
              </label>
              <input
                type="text"
                readOnly
                value={residenceNameDisplay}
                className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl px-3 py-2 text-xs font-semibold text-emerald-300 cursor-not-allowed"
              />
            </div>

            {/* Mobile & Aadhar (Optional) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                  <Phone className="w-3 h-3 text-indigo-400" />
                  <span>Mobile No (Optional)</span>
                </label>
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="10-digit Mobile"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                  <CreditCard className="w-3 h-3 text-emerald-400" />
                  <span>Aadhar No (Optional)</span>
                </label>
                <input
                  type="text"
                  value={aadharNumber}
                  onChange={(e) => setAadharNumber(e.target.value)}
                  placeholder="12-digit Aadhar"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !photoDataUrl}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all cursor-pointer text-xs shadow-md flex items-center justify-center space-x-2 mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Complete Worker Registration</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
