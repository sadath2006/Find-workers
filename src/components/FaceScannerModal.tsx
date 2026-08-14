import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UserProfile, WorkerRecord, EntityRecord } from '../types';
import { 
  getAllWorkers, 
  getAllEntities, 
  getOwnerEntities, 
  logWorkerScan, 
  transferWorkerEntity 
} from '../firebase';
import { 
  runFaceRecognitionPipeline, 
  DEFAULT_BIOMETRIC_THRESHOLD, 
  loadFaceApiModels,
  FacePipelineDebugResponse,
  extractArcFaceEmbedding,
  verifyArcFaceDuplicateFaiss
} from '../utils/faceMatching';
import { compressImage } from '../utils/imageCompressor';
import { WorkerDetailModal } from './WorkerDetailModal';
import { 
  X, 
  Camera, 
  Upload, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle, 
  UserCheck, 
  ArrowRightLeft, 
  CheckCircle2, 
  Sparkles,
  SwitchCamera,
  Eye
} from 'lucide-react';

interface FaceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
}

export const FaceScannerModal: React.FC<FaceScannerModalProps> = ({ 
  isOpen, 
  onClose, 
  currentUser 
}) => {
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraLoading, setCameraLoading] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [scanning, setScanning] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Align face inside frame and tap Scan');
  
  const [allWorkers, setAllWorkers] = useState<WorkerRecord[]>([]);
  const [matchedWorker, setMatchedWorker] = useState<WorkerRecord | null>(null);
  const [pipelineResult, setPipelineResult] = useState<FacePipelineDebugResponse | null>(null);
  const [selectedWorkerForDetail, setSelectedWorkerForDetail] = useState<WorkerRecord | null>(null);

  // Live stream detection state
  const [liveMatch, setLiveMatch] = useState<{ worker: WorkerRecord; similarityScore: number } | null>(null);

  // Transfer state
  const [showTransferQuick, setShowTransferQuick] = useState<boolean>(false);
  const [userEntities, setUserEntities] = useState<EntityRecord[]>([]);
  const [transferEntityId, setTransferEntityId] = useState<string>('');
  const [transferLoading, setTransferLoading] = useState<boolean>(false);
  const [transferMsg, setTransferMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const liveScanTimerRef = useRef<any>(null);
  const isScanningFrameRef = useRef<boolean>(false);
  const workersCacheRef = useRef<WorkerRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load models and workers data
  const loadWorkersAndModels = useCallback(async () => {
    try {
      loadFaceApiModels().catch(() => {});
      const [workers, ents] = await Promise.all([
        getAllWorkers(),
        currentUser.role === 'Company Owner' || currentUser.role === 'Room Owner'
          ? getOwnerEntities(currentUser.uid)
          : getAllEntities()
      ]);
      setAllWorkers(workers);
      workersCacheRef.current = workers;
      setUserEntities(ents);
      if (ents.length > 0) setTransferEntityId(ents[0].id);
    } catch (err) {
      console.error('Error initializing scanner data:', err);
    }
  }, [currentUser]);

  // Clean stop of camera tracks
  const stopCamera = useCallback(() => {
    if (liveScanTimerRef.current) {
      clearInterval(liveScanTimerRef.current);
      liveScanTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (_) {}
      });
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
    setLiveMatch(null);
  }, []);

  // Robust camera starter with multiple constraint fallbacks
  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    stopCamera();
    setCameraLoading(true);
    setCameraError(null);
    setFacingMode(facing);

    const constraintAttempts: MediaStreamConstraints[] = [
      { 
        video: { 
          facingMode: { ideal: facing }, 
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        }, 
        audio: false 
      },
      { 
        video: { 
          facingMode: facing 
        }, 
        audio: false 
      },
      { 
        video: true, 
        audio: false 
      }
    ];

    let stream: MediaStream | null = null;
    let lastError: any = null;

    for (const constraints of constraintAttempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!stream) {
      console.warn('Camera failed to start with all constraints:', lastError);
      setCameraLoading(false);
      setCameraActive(false);
      if (lastError?.name === 'NotAllowedError' || lastError?.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in browser settings or use Gallery Upload.');
      } else {
        setCameraError('Unable to access camera on this device. Please use Gallery Upload.');
      }
      return;
    }

    mediaStreamRef.current = stream;
    setCameraActive(true);
    setCameraLoading(false);

    // Attach stream to video element
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute('playsinline', 'true');
      videoRef.current.muted = true;
      videoRef.current.play().catch(e => console.log('Video play catch:', e));
    }

    // Start background live stream face recognition
    startLiveFaceScanner();
  }, [stopCamera]);

  // Video Ref Callback to guarantee attaching stream when video mounts
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && mediaStreamRef.current) {
      node.srcObject = mediaStreamRef.current;
      node.setAttribute('playsinline', 'true');
      node.muted = true;
      node.play().catch(e => console.log('Video play error on ref mount:', e));
    }
  }, []);

  // Real-Time Live Stream Face Scanner (auto-detects face in view)
  const startLiveFaceScanner = () => {
    if (liveScanTimerRef.current) clearInterval(liveScanTimerRef.current);

    liveScanTimerRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || isScanningFrameRef.current) return;
      if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) return;

      isScanningFrameRef.current = true;
      try {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = Math.round((320 * (video.videoHeight || 640)) / (video.videoWidth || 480));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameDataUrl = canvas.toDataURL('image/jpeg', 0.65);

        const vector = await extractArcFaceEmbedding(frameDataUrl);
        if (!vector) {
          setLiveMatch(null);
          return;
        }

        const workers = workersCacheRef.current;
        if (workers && workers.length > 0) {
          const matchResult = await verifyArcFaceDuplicateFaiss(vector, undefined, workers, DEFAULT_BIOMETRIC_THRESHOLD);
          if (matchResult.duplicateFound && matchResult.matchedWorkerId) {
            const matched = workers.find(w => w.id === matchResult.matchedWorkerId);
            if (matched) {
              setLiveMatch({
                worker: matched,
                similarityScore: matchResult.similarityScore
              });
            }
          } else {
            setLiveMatch(null);
          }
        }
      } catch (_) {
        // silent frame scan error
      } finally {
        isScanningFrameRef.current = false;
      }
    }, 750);
  };

  // Toggle Camera Front / Back
  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    startCamera(nextMode);
  };

  // Modal open / close lifecycle
  useEffect(() => {
    if (isOpen) {
      loadWorkersAndModels();
      if (mode === 'camera') {
        startCamera(facingMode);
      }
    } else {
      stopCamera();
      resetScan();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, mode]);

  const resetScan = () => {
    setPhotoDataUrl('');
    setScanning(false);
    setMatchedWorker(null);
    setPipelineResult(null);
    setShowTransferQuick(false);
    setTransferMsg(null);
    setLiveMatch(null);
    setStatusText('Align face inside frame and tap Scan');
  };

  // Shutter capture from live camera
  const capturePhotoFromCamera = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    
    stopCamera();
    setPhotoDataUrl(rawDataUrl);
    await processFaceImage(rawDataUrl, 'camera');
  };

  // Gallery file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setStatusText('Loading gallery image...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target?.result as string;
      if (rawDataUrl) {
        try {
          const compressed = await compressImage(rawDataUrl, 640, 640, 0.88);
          setPhotoDataUrl(compressed);
          await processFaceImage(compressed, 'upload');
        } catch (err) {
          console.error('File compression error:', err);
          setPhotoDataUrl(rawDataUrl);
          await processFaceImage(rawDataUrl, 'upload');
        }
      }
    };
    reader.onerror = () => {
      setStatusText('Failed to read image file.');
      setScanning(false);
    };
    reader.readAsDataURL(file);
  };

  // ArcFace 512D Biometric Matching Engine
  const processFaceImage = async (imageDataUrl: string, method: 'camera' | 'upload') => {
    setScanning(true);
    setMatchedWorker(null);
    setPipelineResult(null);
    setStatusText('Extracting ArcFace 512D Biometrics...');

    try {
      const result = await runFaceRecognitionPipeline(
        imageDataUrl,
        allWorkers,
        DEFAULT_BIOMETRIC_THRESHOLD
      );

      setPipelineResult(result);

      if (result.finalDecision === 'DUPLICATE' && result.matchedWorkerId) {
        const found = allWorkers.find(w => w.id === result.matchedWorkerId);
        if (found) {
          setMatchedWorker(found);
          setStatusText(`Biometric Match Verified! (${result.similarityScore}% Confidence)`);
          
          // Log scan to Firestore
          logWorkerScan(found.id, {
            scannedByUid: currentUser.uid,
            scannedByName: currentUser.displayName,
            scannedByRole: currentUser.role,
            scannedByMobile: currentUser.mobileNumber,
            method,
            similarityScore: result.similarityScore,
            confidence: result.similarityScore
          }).catch(e => console.warn('Scan logging error:', e));

          return;
        }
      }

      if (result.finalDecision === 'NO_FACE_DETECTED') {
        setStatusText('No human face detected. Please ensure good lighting and clear face angle.');
      } else {
        setStatusText('No matching registered worker found in database (NOT_DUPLICATE).');
      }
    } catch (err) {
      console.error('Pipeline error:', err);
      setStatusText('Biometric processing failed. Please retry.');
    } finally {
      setScanning(false);
    }
  };

  // Handle Quick Claim / Transfer for Owners
  const handleExecuteTransfer = async () => {
    if (!matchedWorker || !transferEntityId) return;
    const targetEntity = userEntities.find(e => e.id === transferEntityId);
    if (!targetEntity) return;

    setTransferLoading(true);
    setTransferMsg(null);
    try {
      const updated = await transferWorkerEntity(
        matchedWorker.id,
        targetEntity,
        'Company',
        null,
        currentUser,
        `Transferred after Face Scan match by ${currentUser.displayName}`
      );
      setMatchedWorker(updated);
      setTransferMsg(`Worker successfully transferred to ${targetEntity.name}!`);
      setShowTransferQuick(false);
      setAllWorkers(prev => prev.map(w => w.id === updated.id ? updated : w));
      workersCacheRef.current = workersCacheRef.current.map(w => w.id === updated.id ? updated : w);
    } catch (err: any) {
      setTransferMsg(err.message || 'Transfer failed.');
    } finally {
      setTransferLoading(false);
    }
  };

  if (!isOpen) return null;

  const isOwnerOrAdmin = ['Founder', 'Super Admin', 'Committee', 'Room Owner', 'Company Owner'].includes(currentUser.role);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full h-[90vh] flex flex-col shadow-2xl relative overflow-hidden animate-scaleUp">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 sticky top-0 z-20">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-red-600/20 text-red-400 border border-red-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Biometric Face Scanner</h2>
              <p className="text-[10px] text-slate-400 font-medium">
                Live Camera & Gallery Verification
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

        {/* Mode Selector Tabs (Camera vs Gallery Upload) */}
        {!photoDataUrl && (
          <div className="px-4 pt-3 flex space-x-2">
            <button
              onClick={() => { setMode('camera'); startCamera(facingMode); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                mode === 'camera' 
                  ? 'bg-red-600 text-white shadow-md' 
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Live Camera</span>
            </button>
            <button
              onClick={() => { setMode('upload'); stopCamera(); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                mode === 'upload' 
                  ? 'bg-red-600 text-white shadow-md' 
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload from Gallery</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Main Visual Viewfinder */}
          {!photoDataUrl ? (
            mode === 'camera' ? (
              <div className="relative aspect-[3/4] w-full bg-black rounded-2xl overflow-hidden border-2 border-slate-800 shadow-inner flex flex-col justify-between">
                
                {/* Video Element */}
                <video
                  ref={setVideoRef}
                  playsInline
                  muted
                  autoPlay
                  className="absolute inset-0 w-full h-full object-cover"
                />

                {/* Loading / Starting Camera Overlay */}
                {cameraLoading && (
                  <div className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col items-center justify-center space-y-3 p-4 text-center">
                    <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
                    <p className="text-xs font-bold text-white">Opening Camera Stream...</p>
                    <p className="text-[10px] text-slate-400">Please allow camera permissions if prompted</p>
                  </div>
                )}

                {/* Camera Error / Permission Notice */}
                {cameraError && !cameraLoading && (
                  <div className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center space-y-3 p-6 text-center">
                    <div className="p-3 bg-red-600/20 text-red-400 rounded-full border border-red-500/30">
                      <AlertTriangle className="w-8 h-8" />
                    </div>
                    <h3 className="text-sm font-black text-white">Camera Access Notice</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>
                    <div className="flex flex-col w-full space-y-2 pt-2">
                      <button
                        onClick={() => startCamera(facingMode)}
                        className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md"
                      >
                        Retry Camera
                      </button>
                      <button
                        onClick={() => { setMode('upload'); stopCamera(); }}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Switch to Gallery Upload
                      </button>
                    </div>
                  </div>
                )}

                {/* Grid / Frame Guides */}
                <div className="absolute inset-0 border-2 border-red-500/30 rounded-2xl pointer-events-none" />
                <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-cyan-400 pointer-events-none" />
                <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-cyan-400 pointer-events-none" />
                <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-cyan-400 pointer-events-none" />
                <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-cyan-400 pointer-events-none" />

                {/* Top Controls: Flip Camera & Live Status */}
                <div className="relative z-10 p-3 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-[10px] font-bold text-white">Live AI Scanner</span>
                  </div>

                  <button
                    onClick={toggleCameraFacing}
                    className="p-2.5 rounded-full bg-slate-900/80 backdrop-blur-md text-white border border-slate-700 hover:bg-slate-800 transition-all cursor-pointer shadow-md"
                    title="Flip camera"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                </div>

                {/* Live Match Notification Pill (Instant Face Detection in frame) */}
                {liveMatch && (
                  <div className="relative z-10 mx-3 p-3 rounded-2xl bg-emerald-950/90 border border-emerald-500/80 text-white backdrop-blur-md shadow-2xl flex items-center justify-between animate-bounce">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center shrink-0 shadow-md">
                        {liveMatch.worker.name ? liveMatch.worker.name.charAt(0) : 'W'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] text-emerald-400 font-bold uppercase">Live Biometric Match!</p>
                        <h4 className="text-xs font-black truncate">{liveMatch.worker.name}</h4>
                        <p className="text-[10px] text-emerald-200">{liveMatch.similarityScore}% Match</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        stopCamera();
                        setSelectedWorkerForDetail(liveMatch.worker);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center space-x-1 shrink-0 cursor-pointer shadow-md"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                  </div>
                )}

                {/* Shutter Action Bar */}
                <div className="relative z-10 p-4 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent flex flex-col items-center space-y-2">
                  <button
                    onClick={capturePhotoFromCamera}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 border-4 border-white text-white flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                    title="Capture photo and match biometrics"
                  >
                    <Camera className="w-7 h-7" />
                  </button>
                  <p className="text-[11px] text-slate-300 font-bold">Tap button to capture & verify face</p>
                </div>
              </div>
            ) : (
              /* Upload from Gallery View */
              <div
                onClick={() => fileInputRef.current?.click()}
                className="aspect-[3/4] w-full bg-slate-950 border-2 border-dashed border-slate-700 hover:border-red-500 rounded-2xl flex flex-col items-center justify-center p-6 text-center space-y-3 cursor-pointer transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="p-4 bg-red-600/20 text-red-400 border border-red-500/30 rounded-2xl">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Choose Photo from Gallery</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Select a clear portrait photo of the worker
                  </p>
                </div>
                <span className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md">
                  Browse Files
                </span>
              </div>
            )
          ) : (
            /* Scanned Image Preview & Result Card */
            <div className="space-y-4 animate-fadeIn">
              <div className="relative aspect-square max-w-[240px] mx-auto rounded-2xl overflow-hidden border-2 border-slate-700 shadow-md">
                <img
                  src={photoDataUrl}
                  alt="Scanned Face"
                  className="w-full h-full object-cover"
                />
                {scanning && (
                  <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center space-y-2">
                    <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                    <p className="text-xs font-bold text-cyan-300 animate-pulse">
                      Analyzing ArcFace Mesh...
                    </p>
                  </div>
                )}
              </div>

              {/* Status Banner */}
              <div className={`p-3.5 rounded-2xl border text-xs flex items-center space-x-2.5 ${
                matchedWorker 
                  ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300' 
                  : pipelineResult?.finalDecision === 'NO_FACE_DETECTED'
                    ? 'bg-amber-950/50 border-amber-800 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                {matchedWorker ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : pipelineResult?.finalDecision === 'NO_FACE_DETECTED' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{statusText}</p>
                </div>
              </div>

              {/* MATCHED WORKER FOUND CARD */}
              {matchedWorker && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 to-emerald-950/40 border border-emerald-700/60 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      {matchedWorker.photoURL ? (
                        <img 
                          src={matchedWorker.photoURL} 
                          alt={matchedWorker.name}
                          className="w-12 h-12 rounded-2xl object-cover border border-emerald-600 shrink-0 shadow-md"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-black text-xl flex items-center justify-center shadow-md shrink-0">
                          {matchedWorker.name ? matchedWorker.name.charAt(0).toUpperCase() : 'W'}
                        </div>
                      )}
                      <div>
                        <h3 className="text-sm font-extrabold text-white">{matchedWorker.name}</h3>
                        <p className="text-xs text-emerald-300 font-medium">{matchedWorker.skill || 'General Worker'}</p>
                        <p className="text-[10px] text-slate-400 font-mono">Mobile: {matchedWorker.mobile}</p>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-900 text-emerald-200 border border-emerald-700">
                      {pipelineResult?.similarityScore}% Match
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800">
                    <div className="p-2 bg-slate-900 rounded-xl">
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Company</p>
                      <p className="font-bold text-slate-200 truncate">{matchedWorker.companyEntityName || matchedWorker.entityName || 'None'}</p>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl">
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Room</p>
                      <p className="font-bold text-slate-200 truncate">{matchedWorker.roomEntityName || 'None'}</p>
                    </div>
                  </div>

                  {/* Transfer Message */}
                  {transferMsg && (
                    <div className="p-2 bg-emerald-900/60 border border-emerald-700 rounded-xl text-xs text-emerald-200 text-center">
                      {transferMsg}
                    </div>
                  )}

                  {/* Quick Transfer Option for Owners */}
                  {showTransferQuick && (
                    <div className="p-3 bg-amber-950/40 border border-amber-700/60 rounded-xl space-y-2">
                      <p className="text-[10px] text-amber-300 font-bold uppercase">Select Your Entity to Claim/Transfer</p>
                      <select
                        value={transferEntityId}
                        onChange={e => setTransferEntityId(e.target.value)}
                        className="w-full bg-slate-950 border border-amber-700/60 rounded-xl p-2 text-xs text-white"
                      >
                        {userEntities.map(ent => (
                          <option key={ent.id} value={ent.id}>{ent.name} ({ent.type})</option>
                        ))}
                      </select>
                      <div className="flex items-center space-x-2 pt-1">
                        <button
                          onClick={handleExecuteTransfer}
                          disabled={transferLoading}
                          className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-1.5 rounded-lg text-xs"
                        >
                          {transferLoading ? 'Transferring...' : 'Confirm Transfer'}
                        </button>
                        <button
                          onClick={() => setShowTransferQuick(false)}
                          className="px-2.5 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      onClick={() => setSelectedWorkerForDetail(matchedWorker)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-md cursor-pointer transition-all"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>View Full Profile & Logs</span>
                    </button>

                    {isOwnerOrAdmin && !showTransferQuick && (
                      <button
                        onClick={() => setShowTransferQuick(true)}
                        className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs flex items-center space-x-1 shadow-md cursor-pointer transition-all"
                        title="Transfer worker to my Company/Room"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Transfer</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Retry / Another Photo Button */}
              <button
                onClick={() => {
                  resetScan();
                  if (mode === 'camera') startCamera(facingMode);
                }}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center space-x-2 cursor-pointer transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Scan Another Photo</span>
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900 flex items-center justify-between text-[11px] text-slate-500">
          <span>Find My Workers Biometrics</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-bold cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>

      {/* Render WorkerDetailModal when user clicks View Full Profile */}
      {selectedWorkerForDetail && (
        <WorkerDetailModal
          isOpen={!!selectedWorkerForDetail}
          onClose={() => setSelectedWorkerForDetail(null)}
          worker={selectedWorkerForDetail}
          currentUser={currentUser}
          onWorkerUpdated={updated => {
            setSelectedWorkerForDetail(updated);
            setMatchedWorker(updated);
            setAllWorkers(prev => prev.map(w => w.id === updated.id ? updated : w));
            workersCacheRef.current = workersCacheRef.current.map(w => w.id === updated.id ? updated : w);
          }}
        />
      )}
    </div>
  );
};

