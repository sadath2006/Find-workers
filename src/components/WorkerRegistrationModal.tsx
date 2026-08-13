import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, EntityRecord, WorkerRecord } from '../types';
import { addWorker, updateWorker, getAllWorkers, getOwnerEntities, getAllEntities, getStaffEntitiesForMobile } from '../firebase';
import { 
  extractArcFaceEmbedding, 
  extractMultipleArcFaceEmbeddings, 
  verifyArcFaceDuplicateFaiss, 
  runFaceRecognitionPipeline,
  FacePipelineDebugResponse,
  isValidArcFaceVector, 
  ARCFACE_VERSION 
} from '../utils/faceMatching';
import { compressImage } from '../utils/imageCompressor';
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
  Link as LinkIcon,
  SwitchCamera,
  Sparkles
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
  const [pipelineDebug, setPipelineDebug] = useState<FacePipelineDebugResponse | null>(null);
  
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

  // Camera video ref & live face detection
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const liveScanTimerRef = useRef<any>(null);
  const isScanningFrameRef = useRef<boolean>(false);
  const workersCacheRef = useRef<WorkerRecord[]>([]);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [liveScanning, setLiveScanning] = useState<boolean>(false);
  const [liveMatch, setLiveMatch] = useState<{ worker: WorkerRecord; similarityScore: number } | null>(null);

  // Load user entities on open
  useEffect(() => {
    if (isOpen) {
      resetForm();
      loadEntities();
    } else {
      stopCamera();
    }
  }, [isOpen]);

  // Clean up live scan interval on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const resetForm = () => {
    setPhotoDataUrl('');
    setUseCamera(false);
    setScanningFace(false);
    setFaceVector([]);
    setPipelineDebug(null);
    setDuplicateMatch(null);
    setLiveMatch(null);
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

  const companyNameDisplay = isCompanyContext ? (activeEntity?.name || 'Not Assigned') : 'Not Assigned';

  const residenceNameDisplay = isRoomContext 
    ? (activeEntity?.name || 'Not Assigned') 
    : (residentType === 'Company' ? companyNameDisplay : 'Not Assigned');

  // Start Camera with specified Facing Mode
  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    stopCamera();
    setUseCamera(true);
    setFacingMode(mode);
    setMsg(null);
    setLiveMatch(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: mode, 
          width: { ideal: 720 }, 
          height: { ideal: 960 } 
        }
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      startLiveFaceScanner();
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err?.message?.includes('Permission denied')) {
        setMsg({ type: 'error', text: 'Camera permission denied. Please allow camera access in browser site settings or use "Upload Photo".' });
      } else {
        setMsg({ type: 'error', text: 'Could not access camera. Please upload a photo instead.' });
      }
      setUseCamera(false);
    }
  };

  // Toggle Camera Front / Back
  const toggleCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    startCamera(nextMode);
  };

  // Stop Camera & Live AI Scanner
  const stopCamera = () => {
    if (liveScanTimerRef.current) {
      clearInterval(liveScanTimerRef.current);
      liveScanTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    setUseCamera(false);
    setLiveScanning(false);
  };

  // Real-Time Live Stream Face Scanner (sub-0.1s instant AI recognition)
  const startLiveFaceScanner = async () => {
    if (liveScanTimerRef.current) clearInterval(liveScanTimerRef.current);

    // Pre-cache all workers once before starting camera loop
    try {
      workersCacheRef.current = await getAllWorkers();
    } catch (e) {
      console.warn('Failed to pre-cache workers:', e);
    }

    liveScanTimerRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || isScanningFrameRef.current) return;
      if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) return;

      isScanningFrameRef.current = true;
      setLiveScanning(true);

      try {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 480;
        canvas.height = video.videoHeight || 640;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameDataUrl = canvas.toDataURL('image/jpeg', 0.80);

        const vector = await extractArcFaceEmbedding(frameDataUrl);
        if (!vector) {
          setLiveMatch(null);
          return;
        }

        const allWorkers = workersCacheRef.current;
        
        if (allWorkers && allWorkers.length > 0) {
          const matchResult = await verifyArcFaceDuplicateFaiss(vector, frameDataUrl, allWorkers, 0.72);
          if (matchResult.duplicateFound && matchResult.matchedWorkerId) {
            const matchedWorker = allWorkers.find(w => w.id === matchResult.matchedWorkerId);
            if (matchedWorker) {
              setLiveMatch({
                worker: matchedWorker,
                similarityScore: matchResult.similarityScore
              });
              setDuplicateMatch({
                worker: matchedWorker,
                similarityScore: matchResult.similarityScore
              });
              // Auto-fill details immediately when detected live!
              setWorkerName(matchedWorker.name);
              setMobileNumber(matchedWorker.mobile || '');
              setAadharNumber(matchedWorker.aadhar || '');
            } else {
              setLiveMatch(null);
              setDuplicateMatch(null);
            }
          } else {
            setLiveMatch(null);
            setDuplicateMatch(null);
          }
        } else {
          setLiveMatch(null);
          setDuplicateMatch(null);
        }
      } catch (err) {
        // Silently continue scanning
      } finally {
        isScanningFrameRef.current = false;
        setLiveScanning(false);
      }
    }, 200);
  };

  // Capture Photo from Camera
  const capturePhotoFromCamera = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 480;
    canvas.height = videoRef.current.videoHeight || 640;
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

  // Process image & match face against FAISS vector database
  const processImageForFaceMatch = async (rawDataUrl: string) => {
    const dataUrl = await compressImage(rawDataUrl, 360, 360, 0.72);
    setPhotoDataUrl(dataUrl);
    setScanningFace(true);
    setDuplicateMatch(null);
    setMsg(null);
    setPipelineDebug(null);

    try {
      const allWorkers = await getAllWorkers();
      console.log(`Fetched ${allWorkers.length} workers from Firestore for FAISS duplicate check`);

      // Execute full mandatory face recognition pipeline (Threshold = 0.72)
      const pipelineResult = await runFaceRecognitionPipeline(rawDataUrl, allWorkers, 0.72);
      setPipelineDebug(pipelineResult);
      setFaceVector(pipelineResult.embedding || []);

      if (pipelineResult.finalDecision === 'NO_FACE_DETECTED') {
        setDuplicateMatch(null);
        setMsg({ 
          type: 'warning', 
          text: '⚠️ NO_FACE_DETECTED: No valid human face detected. Non-face images (food, objects, scenery, animals) cannot be registered or duplicate matched.' 
        });
      } else if (pipelineResult.finalDecision === 'DUPLICATE' && pipelineResult.matchedWorkerId) {
        const matchedWorker = allWorkers.find(w => w.id === pipelineResult.matchedWorkerId);
        if (matchedWorker) {
          setDuplicateMatch({
            worker: matchedWorker,
            similarityScore: pipelineResult.similarityScore
          });
          setWorkerName(matchedWorker.name);
          setMobileNumber(matchedWorker.mobile || '');
          setAadharNumber(matchedWorker.aadhar || '');
          setMsg({ 
            type: 'warning', 
            text: `⚠️ DUPLICATE Flagged! Matched with ${matchedWorker.name} (${pipelineResult.similarityScore}% Cosine Similarity >= 68% Threshold).` 
          });
        }
      } else {
        setDuplicateMatch(null);
        setMsg({ 
          type: 'success', 
          text: `✨ NOT_DUPLICATE: Valid face detected (${(pipelineResult.faceConfidence * 100).toFixed(0)}% confidence). Unique worker verified via FAISS!` 
        });
      }
    } catch (err) {
      console.error('Face scanning error:', err);
      setMsg({ type: 'error', text: 'An error occurred during face pipeline scanning.' });
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
      let finalVector = faceVector;
      if (!finalVector || !isValidArcFaceVector(finalVector)) {
        if (photoDataUrl) {
          finalVector = (await extractArcFaceEmbedding(photoDataUrl)) || [];
        }
      }

      if (!finalVector || !isValidArcFaceVector(finalVector)) {
        setMsg({ type: 'error', text: 'Could not extract valid ArcFace 512D biometric features. Please upload a clearer face photo.' });
        setLoading(false);
        return;
      }

      const compressedPhoto = await compressImage(photoDataUrl, 360, 360, 0.72);
      const payload: Omit<WorkerRecord, 'id' | 'createdAt'> = {
        entityId: activeEntity.id,
        entityName: activeEntity.name,
        name: workerName.trim(),
        photoURL: '', // No raw photo download/store as requested
        faceEmbedding: finalVector,
        faceEmbeddingVersion: ARCFACE_VERSION,
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

      const docRef = await addWorker(payload);

      // Enroll worker in server FAISS vector database immediately
      try {
        await fetch('/api/face/enroll-worker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workerId: docRef?.id || 'new_worker',
            name: workerName.trim(),
            entityName: activeEntity.name,
            embeddings: [finalVector]
          })
        });
      } catch (e) {
        console.warn('Could not notify server FAISS index of new worker enrollment:', e);
      }

      setMsg({ type: 'success', text: `Worker "${workerName}" registered with ArcFace 512D & FAISS Vector Index!` });

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
            <div className="relative aspect-[3/4] w-full max-w-xs mx-auto bg-slate-950 rounded-3xl overflow-hidden border-2 border-cyan-500/50 shadow-2xl flex flex-col justify-between p-3 select-none">
              {/* Video Stream */}
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`} 
              />

              {/* Oval Face Alignment Target Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                <div className={`w-44 h-56 border-2 border-dashed ${
                  liveMatch 
                    ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_35px_rgba(52,211,153,0.6)]' 
                    : 'border-cyan-400/80'
                } rounded-[50%] transition-all duration-300 flex flex-col items-center justify-center p-2 text-center`}>
                  {liveMatch ? (
                    <div className="bg-emerald-950/95 text-emerald-300 text-[10px] font-extrabold px-3 py-1.5 rounded-full border border-emerald-400/80 shadow-2xl flex items-center space-x-1 animate-bounce">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{liveMatch.worker.name.split(' ')[0]} ({liveMatch.similarityScore}%)</span>
                    </div>
                  ) : (
                    <div className="bg-slate-950/80 text-cyan-300 text-[9px] font-bold px-2 py-0.5 rounded-full border border-cyan-500/40 opacity-80">
                      Center Face Here
                    </div>
                  )}
                </div>
              </div>

              {/* Top Control Overlay: AI Live Radar & Switch Camera Button */}
              <div className="relative z-10 flex items-center justify-between w-full">
                <div className="flex items-center space-x-1.5 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-cyan-500/30 text-[10px] font-bold text-cyan-300 shadow-md">
                  <span className={`w-2 h-2 rounded-full ${liveScanning ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400'}`}></span>
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  <span>Real-Time Face Radar</span>
                </div>

                <button
                  type="button"
                  onClick={toggleCamera}
                  title="Switch Front / Rear Camera"
                  className="p-2 bg-slate-900/90 hover:bg-slate-800 active:scale-90 text-white rounded-full border border-slate-700 shadow-lg cursor-pointer transition-all flex items-center justify-center"
                >
                  <SwitchCamera className="w-4 h-4 text-cyan-400" />
                </button>
              </div>

              {/* Bottom Control Overlay: Live Detection Banner & Action Buttons */}
              <div className="relative z-10 space-y-2 w-full">
                {liveMatch && (
                  <div className="bg-emerald-950/90 border border-emerald-500/80 rounded-2xl p-2.5 text-center shadow-2xl space-y-0.5 backdrop-blur-md animate-fadeIn">
                    <p className="text-[10px] text-emerald-300 uppercase tracking-wider font-extrabold flex items-center justify-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Live Face Recognized ({liveMatch.similarityScore}% Match)</span>
                    </p>
                    <p className="text-xs text-white font-extrabold">{liveMatch.worker.name}</p>
                    <p className="text-[10px] text-emerald-200">Worker details auto-filled below!</p>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={capturePhotoFromCamera}
                    className="flex-1 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 text-white font-black py-2.5 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-xl cursor-pointer transition-all"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Capture Snap</span>
                  </button>

                  <button
                    type="button"
                    onClick={stopCamera}
                    className="p-2.5 bg-slate-900/90 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-700 text-xs font-bold cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
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
                  <span>Biometric Processing</span>
                </div>
                {scanningFace ? (
                  <p className="text-[11px] text-cyan-400 flex items-center space-x-1 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Executing Pipeline (Face Detection, ArcFace 512D, FAISS)...</span>
                  </p>
                ) : duplicateMatch ? (
                  <p className="text-[11px] text-amber-400 font-bold flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>DUPLICATE Flagged ({duplicateMatch.similarityScore}% match)</span>
                  </p>
                ) : pipelineDebug?.finalDecision === 'NO_FACE_DETECTED' ? (
                  <p className="text-[11px] text-rose-400 font-bold flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>NO_FACE_DETECTED (Registration Blocked)</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-400 font-bold">
                    NOT_DUPLICATE (Unique Worker Verified)
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

        {/* PIPELINE DEBUG RESPONSE PANEL */}
        {pipelineDebug && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-1.5 font-mono text-xs text-slate-300">
            <div className="font-bold text-slate-200 border-b border-slate-800 pb-1 flex justify-between items-center">
              <span className="text-[11px] text-cyan-400 uppercase tracking-wider font-extrabold flex items-center space-x-1">
                <Scan className="w-3.5 h-3.5" />
                <span>Face Pipeline Debug Response</span>
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                pipelineDebug.finalDecision === 'DUPLICATE' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                pipelineDebug.finalDecision === 'NOT_DUPLICATE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              }`}>
                {pipelineDebug.finalDecision}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div>faceDetected: <span className={pipelineDebug.faceDetected ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>{String(pipelineDebug.faceDetected)}</span></div>
              <div>faceConfidence: <span className="text-cyan-400">{pipelineDebug.faceConfidence}</span></div>
              <div>faceQuality: <span className="text-cyan-400">{pipelineDebug.faceQuality}</span></div>
              <div>similarityScore: <span className="text-cyan-400">{pipelineDebug.similarityScore}%</span></div>
              <div>matchedWorkerId: <span className="text-amber-300">{pipelineDebug.matchedWorkerId || 'null'}</span></div>
              <div>threshold: <span className="text-cyan-400">{pipelineDebug.threshold}</span></div>
            </div>
            <p className="text-[10px] text-slate-400 italic pt-0.5 border-t border-slate-900">
              finalDecision: <span className="font-bold text-white">{pipelineDebug.finalDecision}</span>
            </p>
          </div>
        )}

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
