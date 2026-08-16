import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  Camera, 
  Scan, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Sparkles, 
  Layers, 
  ShieldCheck, 
  ArrowRightLeft,
  RotateCcw,
  Sliders
} from 'lucide-react';
import { 
  compareTwoFaces, 
  DEFAULT_DUPLICATE_THRESHOLD, 
  DEFAULT_RECOGNITION_THRESHOLD,
  FaceComparisonResult,
  ARCFACE_VERSION,
  BIOMETRIC_MODEL_NAME
} from '../utils/faceMatching';
import { WorkerRecord } from '../types';

interface BiometricTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  workers: WorkerRecord[];
}

export function BiometricTesterModal({ isOpen, onClose, workers }: BiometricTesterModalProps) {
  const [imageA, setImageA] = useState<string>('');
  const [imageB, setImageB] = useState<string>('');
  const [imageAName, setImageAName] = useState<string>('Image A');
  const [imageBName, setImageBName] = useState<string>('Image B');
  const [threshold, setThreshold] = useState<number>(DEFAULT_DUPLICATE_THRESHOLD);
  const [testing, setTesting] = useState<boolean>(false);
  const [result, setResult] = useState<FaceComparisonResult | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, slot: 'A' | 'B') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (slot === 'A') {
        setImageA(dataUrl);
        setImageAName(file.name);
      } else {
        setImageB(dataUrl);
        setImageBName(file.name);
      }
      setResult(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSelectExistingWorker = (workerId: string, slot: 'A' | 'B') => {
    const w = workers.find(item => item.id === workerId);
    if (!w) return;
    if (w.photoURL) {
      if (slot === 'A') {
        setImageA(w.photoURL);
        setImageAName(`Worker: ${w.name}`);
      } else {
        setImageB(w.photoURL);
        setImageBName(`Worker: ${w.name}`);
      }
      setResult(null);
    }
  };

  const runTest = async () => {
    if (!imageA || !imageB) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await compareTwoFaces(imageA, imageB, threshold);
      setResult(res);
    } catch (err: any) {
      console.error('Biometric test failure:', err);
    } finally {
      setTesting(false);
    }
  };

  const loadPresetTest = (type: 'same' | 'food') => {
    if (type === 'same' && imageA) {
      setImageB(imageA);
      setImageBName(`${imageAName} (Duplicate)`);
      setResult(null);
    } else if (type === 'food') {
      // Generate a canvas with a non-face apple / object
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 400, 400);
        ctx.beginPath();
        ctx.arc(200, 220, 100, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(190, 100, 20, 40);
        const foodUrl = canvas.toDataURL('image/jpeg');
        setImageB(foodUrl);
        setImageBName('Non-Face Object (Fruit/Graphic)');
        setResult(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center space-x-2">
                <span>Biometric Accuracy & Decision Tester</span>
                <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full font-mono font-bold">
                  {ARCFACE_VERSION}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Direct Image A vs Image B verification (MATCH vs NOT_MATCH vs NO_FACE)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          
          {/* Comparison Matrix Slots */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Slot A */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>Image A (Target Profile)</span>
                </span>
                <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{imageAName}</span>
              </div>

              <div className="aspect-square bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center relative">
                {imageA ? (
                  <img src={imageA} alt="Image A" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-4 text-slate-500 space-y-1">
                    <Scan className="w-8 h-8 mx-auto text-slate-600" />
                    <p className="text-xs font-bold">No Image Loaded</p>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <label className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold text-center cursor-pointer transition-colors flex items-center justify-center space-x-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload A</span>
                  <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'A')} className="hidden" />
                </label>

                {imageA && (
                  <button
                    onClick={() => { setImageA(''); setImageAName('Image A'); setResult(null); }}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                    title="Clear Image A"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Slot B */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Image B (Candidate)</span>
                </span>
                <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{imageBName}</span>
              </div>

              <div className="aspect-square bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center relative">
                {imageB ? (
                  <img src={imageB} alt="Image B" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-4 text-slate-500 space-y-1">
                    <Scan className="w-8 h-8 mx-auto text-slate-600" />
                    <p className="text-xs font-bold">No Image Loaded</p>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <label className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold text-center cursor-pointer transition-colors flex items-center justify-center space-x-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload B</span>
                  <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'B')} className="hidden" />
                </label>

                {imageB && (
                  <button
                    onClick={() => { setImageB(''); setImageBName('Image B'); setResult(null); }}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                    title="Clear Image B"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Preset Quick Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-[11px] font-bold text-slate-400 self-center">Quick Tests:</span>
            <button
              onClick={() => loadPresetTest('same')}
              disabled={!imageA}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-[11px] font-semibold flex items-center space-x-1"
            >
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>A vs A (Identity Match)</span>
            </button>

            <button
              onClick={() => loadPresetTest('food')}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-semibold flex items-center space-x-1"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Non-Face Object</span>
            </button>
          </div>

          {/* Threshold Control */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 flex items-center space-x-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>Calibrated Cosine Match Threshold</span>
              </span>
              <span className="font-mono font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800 text-[11px]">
                {threshold.toFixed(3)}
              </span>
            </div>
            <input
              type="range"
              min="0.70"
              max="0.95"
              step="0.005"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0.700 (Loose)</span>
              <span className="text-indigo-400 font-bold">0.860 (Scan Recognition)</span>
              <span className="text-cyan-400 font-bold">0.885 (Enroll Duplicate)</span>
              <span>0.950 (Strict)</span>
            </div>
          </div>

          {/* Run Test Button */}
          <button
            onClick={runTest}
            disabled={!imageA || !imageB || testing}
            className="w-full py-3 bg-gradient-to-r from-red-600 via-indigo-600 to-emerald-600 hover:opacity-90 disabled:opacity-40 text-white font-extrabold rounded-2xl text-xs flex items-center justify-center space-x-2 shadow-lg cursor-pointer transition-all"
          >
            {testing ? (
              <>
                <Scan className="w-4 h-4 animate-spin" />
                <span>Extracting 512D Embeddings & Running Neural Comparison...</span>
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4" />
                <span>Run Biometric Comparison (Image A vs Image B)</span>
              </>
            )}
          </button>

          {/* Test Results Output */}
          {result && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 font-mono text-xs animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-black uppercase text-slate-300 flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <span>Pipeline Comparison Decision</span>
                </span>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase flex items-center space-x-1 ${
                  result.decision === 'MATCH' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                  result.decision === 'NOT_MATCH' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40' :
                  'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                }`}>
                  {result.decision === 'MATCH' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {result.decision === 'NOT_MATCH' && <XCircle className="w-3.5 h-3.5" />}
                  {result.decision === 'NO_FACE_DETECTED' && <AlertTriangle className="w-3.5 h-3.5" />}
                  <span>{result.decision}</span>
                </span>
              </div>

              {/* Exact Biometric Telemetry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px] text-slate-300">
                <div className="p-2 bg-slate-900 rounded-xl">
                  <span className="text-slate-500 block text-[10px]">faceDetected (A / B)</span>
                  <span className="font-bold text-white">
                    {String(result.faceDetectedA)} / {String(result.faceDetectedB)}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded-xl">
                  <span className="text-slate-500 block text-[10px]">faceCount (A / B)</span>
                  <span className="font-bold text-white">
                    {result.faceCountA} / {result.faceCountB}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded-xl">
                  <span className="text-slate-500 block text-[10px]">embeddingDimension</span>
                  <span className="font-bold text-cyan-400">
                    {result.embeddingDimensionA}D × {result.embeddingDimensionB}D
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded-xl">
                  <span className="text-slate-500 block text-[10px]">cosineSimilarity</span>
                  <span className={`font-bold ${result.cosineSimilarity >= threshold ? 'text-emerald-400' : 'text-slate-200'}`}>
                    {result.cosineSimilarity.toFixed(4)}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded-xl">
                  <span className="text-slate-500 block text-[10px]">euclideanDistance</span>
                  <span className="font-bold text-cyan-400">
                    {result.euclideanDistance.toFixed(4)}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded-xl">
                  <span className="text-slate-500 block text-[10px]">similarityScore</span>
                  <span className={`font-bold ${result.similarityScore >= 82 ? 'text-emerald-400' : 'text-slate-200'}`}>
                    {result.similarityScore}%
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-900 rounded-xl text-xs space-y-1 text-slate-300">
                <p className="text-[11px] font-bold text-white">Verification Summary:</p>
                <p className="text-[11px] leading-relaxed text-slate-300">{result.details}</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
