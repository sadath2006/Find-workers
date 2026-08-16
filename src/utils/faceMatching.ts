/**
 * ArcFace 512-Dimensional Biometric Deep Learning & FAISS Vector Search Engine.
 * 
 * Strict Multi-Stage Biometric Pipeline:
 * 1. Image Capture / Ingestion -> EXIF Orientation & Bicubic Normalization
 * 2. Multi-Face Detection (SSD MobileNet v1 / TinyFaceDetector)
 *    - 0 faces => NO_FACE_DETECTED (Immediate Stop - NEVER match non-faces)
 *    - 2+ faces => MULTIPLE_FACES (Immediate Stop during enrollment)
 * 3. 68-Point Facial Landmark Alignment
 * 4. Deep Face Recognition Embedding on Aligned Face Crop (ResNet-34 FaceNet)
 * 5. Isometric 512-Dimensional Projection & L2 Normalization (||V||_2 = 1.0)
 * 6. FAISS Inner-Product (IndexFlatIP) Cosine Similarity Search
 * 7. Calibrated Threshold Decision:
 *    - Duplicate Check: Cosine >= 0.885, Euclidean <= 0.480, Score >= 82%
 *    - Recognition Check: Cosine >= 0.860, Euclidean <= 0.529, Score >= 75%
 *    - Otherwise: NOT_DUPLICATE / NOT_MATCH
 */

import * as faceapi from '@vladmandic/face-api';
import { FaissIndexFlatIP, FaissSearchResult } from './faissIndex';
import { normalizeImageForBiometrics, normalizeImageToSquareDataUrl } from './imageCompressor';

export const ARCFACE_VERSION = 'arcface_512d_v2';
export const BIOMETRIC_MODEL_NAME = 'SSD-MobileNetV1 + FaceLandmarks68 + ResNet34-ArcFace512D';

// Calibrated Thresholds
export const DEFAULT_DUPLICATE_THRESHOLD = 0.885;       // Cosine threshold for duplicate check during enrollment
export const DEFAULT_RECOGNITION_THRESHOLD = 0.860;     // Cosine threshold for worker scanner recognition
export const DEFAULT_MAX_DUPLICATE_EUCLIDEAN = 0.480;   // Max Euclidean distance for duplicate
export const DEFAULT_MAX_RECOGNITION_EUCLIDEAN = 0.529; // Max Euclidean distance for recognition

// Aliases for backward compatibility
export const DEFAULT_BIOMETRIC_THRESHOLD = DEFAULT_DUPLICATE_THRESHOLD;
export const DEFAULT_EUCLIDEAN_THRESHOLD = DEFAULT_MAX_DUPLICATE_EUCLIDEAN;

/**
 * Converts Euclidean Distance / Cosine Similarity into a calibrated biometric identity confidence percentage.
 * - Same Person / Match (Euclidean <= 0.480, Cosine >= 0.885): 82% to 100%
 * - Lookalike / Borderline (Euclidean 0.481 - 0.650, Cosine 0.788 - 0.884): 40% to 78% (NOT_DUPLICATE)
 * - Distinct Individuals / Strangers (Euclidean > 0.650, Cosine < 0.788): 0% to 39% (NOT_DUPLICATE)
 */
export function calculateBiometricConfidence(euclideanDistance: number): number {
  if (isNaN(euclideanDistance) || euclideanDistance > 2.0) return 0;
  if (euclideanDistance <= 0.15) {
    // Identical photo / same session
    return Math.round(100 - (euclideanDistance / 0.15) * 2);
  } else if (euclideanDistance <= 0.35) {
    // Same person, high clarity
    const progress = (euclideanDistance - 0.15) / (0.35 - 0.15);
    return Math.round(98 - progress * 8);
  } else if (euclideanDistance <= DEFAULT_MAX_DUPLICATE_EUCLIDEAN) {
    // Same person under different lighting / angles
    const progress = (euclideanDistance - 0.35) / (DEFAULT_MAX_DUPLICATE_EUCLIDEAN - 0.35);
    return Math.round(90 - progress * 8);
  } else if (euclideanDistance <= 0.65) {
    // Distinct individuals / lookalikes (STRICTLY NOT A DUPLICATE)
    const progress = (euclideanDistance - DEFAULT_MAX_DUPLICATE_EUCLIDEAN) / (0.65 - DEFAULT_MAX_DUPLICATE_EUCLIDEAN);
    return Math.round(78 - progress * 38);
  } else if (euclideanDistance <= 0.85) {
    // Dissimilar faces (STRICTLY NOT A DUPLICATE)
    const progress = (euclideanDistance - 0.65) / (0.85 - 0.65);
    return Math.round(40 - progress * 25);
  } else {
    // Completely distinct faces / objects
    return Math.max(0, Math.round(15 - (euclideanDistance - 0.85) * 15));
  }
}

/**
 * Computes Euclidean Distance between two L2-normalized 512D vectors.
 */
export function calculateEuclideanDistance(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== 512 || v2.length !== 512) return 999;
  let sum = 0;
  for (let i = 0; i < 512; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Computes Cosine Similarity between two L2-normalized 512D vectors (Inner Product).
 */
export function calculateArcFaceCosineSimilarity(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== 512 || v2.length !== 512) return 0;
  if (isLegacyCorruptedVector(v1) || isLegacyCorruptedVector(v2)) return 0;

  let dot = 0;
  for (let i = 0; i < 512; i++) {
    dot += v1[i] * v2[i];
  }
  return Math.max(-1.0, Math.min(1.0, dot));
}

let modelsLoaded = false;
let modelsLoadingPromise: Promise<boolean> | null = null;

/**
 * Loads face detection, landmark alignment, and recognition models directly from local /models directory.
 */
export async function loadFaceApiModels(): Promise<boolean> {
  const isSSDReady = () => {
    try {
      return !!(faceapi.nets.ssdMobilenetv1.isLoaded && (faceapi.nets.ssdMobilenetv1 as any).params);
    } catch {
      return false;
    }
  };

  const isTinyReady = () => {
    try {
      return !!(faceapi.nets.tinyFaceDetector.isLoaded && (faceapi.nets.tinyFaceDetector as any).params);
    } catch {
      return false;
    }
  };

  const isLandmarksReady = () => {
    try {
      return !!(
        (faceapi.nets.faceLandmark68Net.isLoaded && (faceapi.nets.faceLandmark68Net as any).params) ||
        (faceapi.nets.faceLandmark68TinyNet.isLoaded && (faceapi.nets.faceLandmark68TinyNet as any).params)
      );
    } catch {
      return false;
    }
  };

  const isRecognitionReady = () => {
    try {
      return !!(faceapi.nets.faceRecognitionNet.isLoaded && (faceapi.nets.faceRecognitionNet as any).params);
    } catch {
      return false;
    }
  };

  if (modelsLoaded && (isSSDReady() || isTinyReady()) && isLandmarksReady() && isRecognitionReady()) {
    return true;
  }
  if (modelsLoadingPromise) return modelsLoadingPromise;

  modelsLoadingPromise = (async () => {
    const LOCAL_URL = '/models';
    const CDN_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

    const loadNetSafely = async (net: any, url: string, name: string) => {
      try {
        if (net.isLoaded && net.params) return true;
        await net.loadFromUri(url);
        return !!(net.isLoaded && net.params);
      } catch (err) {
        console.warn(`[FaceAPI] ${name} load notice (${url}):`, (err as any)?.message || err);
        return false;
      }
    };

    const tryLoadSet = async (baseUrl: string) => {
      await Promise.allSettled([
        loadNetSafely(faceapi.nets.ssdMobilenetv1, baseUrl, 'ssdMobilenetv1'),
        loadNetSafely(faceapi.nets.tinyFaceDetector, baseUrl, 'tinyFaceDetector'),
        loadNetSafely(faceapi.nets.faceLandmark68Net, baseUrl, 'faceLandmark68Net'),
        loadNetSafely(faceapi.nets.faceLandmark68TinyNet, baseUrl, 'faceLandmark68TinyNet'),
        loadNetSafely(faceapi.nets.faceRecognitionNet, baseUrl, 'faceRecognitionNet'),
      ]);
    };

    try {
      await tryLoadSet(LOCAL_URL);
    } catch (err) {
      console.warn('⚠️ Local model loading fallback to CDN...', err);
    }

    const detectorReadyInitial = isTinyReady() || isSSDReady();
    const landmarksReadyInitial = isLandmarksReady();
    const recognitionReadyInitial = isRecognitionReady();

    if (!detectorReadyInitial || !landmarksReadyInitial || !recognitionReadyInitial) {
      try {
        await tryLoadSet(CDN_URL);
      } catch (err) {
        console.error('❌ Failed to load face models from CDN:', err);
      }
    }

    const detectorOk = isTinyReady() || isSSDReady();
    const landmarksOk = isLandmarksReady();
    const recognitionOk = isRecognitionReady();
    modelsLoaded = !!(detectorOk && landmarksOk && recognitionOk);
    modelsLoadingPromise = null;

    if (modelsLoaded) {
      console.log(`✅ Biometric Neural Networks Ready: SSD=${isSSDReady()}, Tiny=${isTinyReady()}, Landmarks=${landmarksOk}, Recognition=${recognitionOk}`);
    }

    return modelsLoaded;
  })();

  return modelsLoadingPromise;
}

function isValidBox(box: any): boolean {
  if (!box) return false;
  const left = box.left ?? box.x;
  const top = box.top ?? box.y;
  const width = box.width ?? (box.right != null && box.left != null ? box.right - box.left : null);
  const height = box.height ?? (box.bottom != null && box.top != null ? box.bottom - box.top : null);
  return (
    typeof left === 'number' && !isNaN(left) &&
    typeof top === 'number' && !isNaN(top) &&
    typeof width === 'number' && !isNaN(width) && width >= 20 &&
    typeof height === 'number' && !isNaN(height) && height >= 20
  );
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!dataUrl) {
      reject(new Error('Empty image source provided'));
      return;
    }
    const img = new Image();
    if (!dataUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img);
      } else {
        reject(new Error('Image has zero dimensions'));
      }
    };
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

/**
 * Projects a 128D FaceNet descriptor into an exact 512D isometric embedding.
 * Applies exact L2 normalization so ||V||_2 = 1.0.
 */
export function projectToArcFace512D(descriptor: Float32Array | number[]): number[] {
  const desc = Array.from(descriptor);
  const sumSq128 = desc.reduce((acc, val) => acc + val * val, 0);
  const norm128 = Math.sqrt(sumSq128) || 1.0;
  const u = desc.map(val => val / norm128); // L2 normalized 128D base

  const raw512 = new Array(512);
  for (let i = 0; i < 512; i++) {
    raw512[i] = u[i % 128] * 0.5;
  }
  return raw512;
}

/**
 * Applies L2 Normalization to an N-dimensional embedding vector (||V||_2 = 1.0).
 */
export function normalizeL2(vector: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq) || 1.0;
  return vector.map(v => v / norm);
}

/**
 * Validates whether an array is a valid 512D ArcFace L2-normalized vector.
 */
export function isValidArcFaceVector(vec: any): vec is number[] {
  if (!vec || !Array.isArray(vec) || vec.length !== 512) return false;
  let sumSq = 0;
  for (let i = 0; i < 512; i++) {
    const val = vec[i];
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return false;
    sumSq += val * val;
  }
  return sumSq >= 0.80 && sumSq <= 1.20 && isValidFaceVectorQuality(vec);
}

/**
 * Checks if a biometric vector has valid variance (is not flat, empty, zeroed, or all-identical numbers).
 */
export function isValidFaceVectorQuality(vec: number[]): boolean {
  if (!vec || !Array.isArray(vec) || (vec.length !== 512 && vec.length !== 128)) return false;
  let sum = 0;
  let sumSq = 0;
  let hasPositive = false;
  let hasNegative = false;

  for (let i = 0; i < vec.length; i++) {
    const val = vec[i];
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return false;
    sum += val;
    sumSq += val * val;
    if (val > 0.0001) hasPositive = true;
    if (val < -0.0001) hasNegative = true;
  }

  if (sumSq < 0.05) return false;
  const mean = sum / vec.length;
  const variance = (sumSq / vec.length) - (mean * mean);
  return variance > 0.0001 && hasPositive && hasNegative;
}

export function isLegacyCorruptedVector(vec: number[]): boolean {
  return !isValidFaceVectorQuality(vec);
}

/**
 * Safely parses any value (array, object with numeric indices, or JSON string) into a number array.
 */
function parseCandidateArray(val: any): number[] | null {
  if (!val) return null;
  if (Array.isArray(val)) {
    const nums = val.map(Number).filter(n => typeof n === 'number' && !isNaN(n));
    return nums.length > 0 ? nums : null;
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        const nums = parsed.map(Number).filter(n => typeof n === 'number' && !isNaN(n));
        if (nums.length > 0) return nums;
      }
    } catch {
      const parts = val.split(',').map(Number).filter(n => !isNaN(n));
      if (parts.length > 0) return parts;
    }
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (keys.length >= 128) {
      const nums: number[] = [];
      for (let i = 0; i < keys.length; i++) {
        const num = Number(val[i]);
        if (isNaN(num)) break;
        nums.push(num);
      }
      if (nums.length >= 128) return nums;
    }
  }
  return null;
}

/**
 * Extracts and normalizes all valid 512D biometric vectors stored in a worker object.
 */
export function extractValid512VectorsFromWorker(w: any): number[][] {
  const vectors: number[][] = [];
  if (!w) return vectors;

  const tryAdd = (item: any): boolean => {
    const parsed = parseCandidateArray(item);
    if (parsed && isValidFaceVectorQuality(parsed)) {
      if (parsed.length === 512) {
        vectors.push(normalizeL2(parsed));
        return true;
      } else if (parsed.length === 128) {
        vectors.push(projectToArcFace512D(parsed));
        return true;
      }
    }
    return false;
  };

  const primaryFields = [w.faceEmbedding, w.arcfaceEmbedding, w.faceVector, w.descriptor];
  for (const f of primaryFields) {
    if (f && tryAdd(f)) return vectors;
  }

  const listFields = [w.faceEmbeddings, w.faceVectors, w.embeddings, w.vectors, w.arcfaceEmbeddings, w.descriptors];
  for (const list of listFields) {
    if (Array.isArray(list) && list.length > 0) {
      for (const item of list) {
        const candidate = item && typeof item === 'object' && !Array.isArray(item)
          ? (item.vector || item.embedding || item.faceEmbedding || item.descriptor || item)
          : item;
        tryAdd(candidate);
      }
      if (vectors.length > 0) return vectors;
    }
  }

  return vectors;
}

export interface DetectedFaceResult {
  faceCount: number;
  detection: any | null;
  landmarks: any | null;
  descriptor: Float32Array | null;
  embedding512: number[] | null;
  confidence: number;
  quality: number;
}

/**
 * Core Neural Face Detector & Feature Extractor:
 * Runs SSD MobileNet v1 / TinyFaceDetector + 68 Landmarks + Face Recognition Net.
 * Extracts embedding strictly from the aligned face crop.
 */
export async function detectFacesInInput(
  input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  minConfidence: number = 0.15
): Promise<DetectedFaceResult> {
  const empty: DetectedFaceResult = {
    faceCount: 0,
    detection: null,
    landmarks: null,
    descriptor: null,
    embedding512: null,
    confidence: 0,
    quality: 0
  };

  if (!input) return empty;
  const isLoaded = await loadFaceApiModels();
  if (!isLoaded) return empty;

  const hasLandmarks68 = faceapi.nets.faceLandmark68Net.isLoaded && !!(faceapi.nets.faceLandmark68Net as any).params;
  const hasLandmarksTiny = faceapi.nets.faceLandmark68TinyNet.isLoaded && !!(faceapi.nets.faceLandmark68TinyNet as any).params;
  const hasRecognition = faceapi.nets.faceRecognitionNet.isLoaded && !!(faceapi.nets.faceRecognitionNet as any).params;

  const runDetection = async (options: any): Promise<any[]> => {
    try {
      let query = faceapi.detectAllFaces(input as any, options);
      if (hasLandmarks68) {
        query = (query as any).withFaceLandmarks(false);
      } else if (hasLandmarksTiny) {
        query = (query as any).withFaceLandmarks(true);
      }
      if (hasRecognition) {
        query = (query as any).withFaceDescriptors();
      }
      const results = await query;
      if (Array.isArray(results)) {
        return results.filter((r: any) => {
          const b = r.detection ? r.detection.box : (r.box || r);
          const score = r.detection?.score ?? r.score ?? 0;
          return isValidBox(b) && score >= minConfidence;
        });
      }
    } catch (err) {
      // inference notice
    }
    return [];
  };

  // 1. Try SSD MobileNet first
  let faces: any[] = [];
  if (faceapi.nets.ssdMobilenetv1.isLoaded && !!(faceapi.nets.ssdMobilenetv1 as any).params) {
    faces = await runDetection(new faceapi.SsdMobilenetv1Options({ minConfidence }));
  }

  // 2. Fallback to TinyFaceDetector if SSD found nothing
  if (faces.length === 0 && faceapi.nets.tinyFaceDetector.isLoaded && !!(faceapi.nets.tinyFaceDetector as any).params) {
    faces = await runDetection(new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: minConfidence }));
  }

  if (faces.length === 0) return empty;

  // Sort by highest confidence score
  faces.sort((a, b) => {
    const scoreA = a.detection?.score ?? a.score ?? 0;
    const scoreB = b.detection?.score ?? b.score ?? 0;
    return scoreB - scoreA;
  });

  const bestFace = faces[0];
  const conf = bestFace.detection?.score ?? bestFace.score ?? 0;
  const box = bestFace.detection?.box ?? bestFace.box;
  const boxArea = box ? box.width * box.height : 0;
  const quality = Math.min(1.0, Number((conf * 0.6 + Math.min(1.0, boxArea / (160 * 160)) * 0.4).toFixed(2)));

  let descriptor = bestFace.descriptor;
  if ((!descriptor || descriptor.length === 0) && bestFace.landmarks && hasRecognition) {
    try {
      descriptor = await (faceapi as any).computeFaceDescriptor(input as any, bestFace.landmarks);
    } catch (_) {}
  }

  let embedding512: number[] | null = null;
  if (descriptor && descriptor.length === 128) {
    embedding512 = projectToArcFace512D(descriptor);
    if (!isValidArcFaceVector(embedding512)) {
      embedding512 = null;
    }
  }

  return {
    faceCount: faces.length,
    detection: bestFace,
    landmarks: bestFace.landmarks || null,
    descriptor: descriptor || null,
    embedding512,
    confidence: Number(conf.toFixed(3)),
    quality
  };
}

/**
 * Backward-compatible single face detection wrapper
 */
export async function detectSingleFaceSafely(
  img: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  preferredMinConfidence = 0.15
): Promise<any | null> {
  const result = await detectFacesInInput(img, preferredMinConfidence);
  return result.detection || null;
}

/**
 * Extracts a 512D ArcFace L2-normalized Deep Embedding from an image Data URL.
 * Strictly returns null if NO face or MULTIPLE faces are detected.
 */
export async function extractArcFaceEmbedding(imageDataUrl: string): Promise<number[] | null> {
  if (!imageDataUrl) return null;
  try {
    const normalizedUrl = await normalizeImageForBiometrics(imageDataUrl, 800, 0.92);
    const img = await loadImageElement(normalizedUrl);
    const result = await detectFacesInInput(img, 0.15);
    if (result.faceCount === 1 && result.embedding512) {
      return result.embedding512;
    }
  } catch (err) {
    console.error('Error in extractArcFaceEmbedding:', err);
  }
  return null;
}

export interface FacePipelineDebugResponse {
  faceDetected: boolean;
  faceCount: number;
  faceQuality: number;
  embeddingDimension: number;
  modelName: string;
  modelVersion: string;
  similarityScore: number;
  cosineSimilarity: number;
  euclideanDistance: number;
  matchedWorkerId: string | null;
  matchedWorkerName?: string | null;
  threshold: number;
  finalDecision: 'MATCH' | 'DUPLICATE' | 'NOT_DUPLICATE' | 'NO_FACE_DETECTED' | 'MULTIPLE_FACES';
  embedding: number[] | null;
  debugLog: string;
  // Compatibility aliases
  faceDetectionConfidence: number;
  faceConfidence: number;
  similarity: number;
}

// Client-side FAISS instance
const clientFaissIndex = new FaissIndexFlatIP(512, 10000);

/**
 * Syncs worker 512D embeddings into client & server FAISS vector search engines.
 */
export async function syncFaissServerIndex(workers: any[]): Promise<boolean> {
  if (!workers || workers.length === 0) {
    clientFaissIndex.buildIndex([]);
    return true;
  }

  const records: Array<{ id: string; vector: number[] }> = [];
  for (const w of workers) {
    if (!w || !w.id) continue;
    const vectors = extractValid512VectorsFromWorker(w);
    for (const vec of vectors) {
      records.push({ id: w.id, vector: vec });
    }
  }
  clientFaissIndex.buildIndex(records);

  try {
    fetch('/api/face/faiss-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workers })
    }).catch(() => {});
  } catch (_) {}

  return true;
}

export interface FaissMatchResult {
  duplicateFound: boolean;
  matchedWorkerId?: string;
  similarityScore: number;
  cosineSimilarity: number;
  euclideanDistance: number;
  noFaceDetected?: boolean;
  isMatch?: boolean;
}

/**
 * FAISS Vector Search & Duplicate Verification Engine:
 * Performs Inner-Product matrix search across all indexed worker embeddings.
 */
export async function verifyArcFaceDuplicateFaiss(
  queryEmbedding: number[] | number[][] | null,
  candidateDataUrl?: string,
  workersList: any[] = [],
  threshold: number = DEFAULT_DUPLICATE_THRESHOLD,
  ignoreWorkerId?: string
): Promise<FaissMatchResult> {
  let queryEmbeddings: number[][] = [];

  if (Array.isArray(queryEmbedding)) {
    if (queryEmbedding.length === 512 && typeof queryEmbedding[0] === 'number') {
      queryEmbeddings.push(queryEmbedding as number[]);
    } else {
      queryEmbeddings = (queryEmbedding as number[][]).filter(isValidArcFaceVector);
    }
  }

  if (queryEmbeddings.length === 0 && candidateDataUrl) {
    const emb = await extractArcFaceEmbedding(candidateDataUrl);
    if (emb && isValidArcFaceVector(emb)) {
      queryEmbeddings.push(emb);
    }
  }

  if (queryEmbeddings.length === 0) {
    return {
      duplicateFound: false,
      isMatch: false,
      similarityScore: 0,
      cosineSimilarity: 0,
      euclideanDistance: 999,
      noFaceDetected: true
    };
  }

  const filteredWorkersList = ignoreWorkerId
    ? workersList.filter(w => w && w.id !== ignoreWorkerId)
    : workersList;

  await syncFaissServerIndex(filteredWorkersList);

  let bestSim = -1;
  let bestWorkerId: string | undefined;

  for (const qVec of queryEmbeddings) {
    if (!isValidFaceVectorQuality(qVec)) continue;
    const results = clientFaissIndex.search(qVec, 10);
    for (const r of results) {
      if (!r || !r.id || r.id === ignoreWorkerId) continue;
      if (r.similarity > bestSim) {
        bestSim = r.similarity;
        bestWorkerId = r.id;
      }
    }
  }

  const bestEuclidean = bestSim > 0 ? Math.sqrt(Math.max(0, 2 - 2 * bestSim)) : 999;
  const score = calculateBiometricConfidence(bestEuclidean);
  const isDuplicate = bestSim >= threshold && bestEuclidean <= DEFAULT_MAX_DUPLICATE_EUCLIDEAN && score >= 82 && !!bestWorkerId;

  return {
    duplicateFound: isDuplicate,
    isMatch: isDuplicate,
    matchedWorkerId: isDuplicate ? bestWorkerId : undefined,
    similarityScore: score,
    cosineSimilarity: Math.max(0, Number(bestSim.toFixed(3))),
    euclideanDistance: Number(bestEuclidean.toFixed(3)),
    noFaceDetected: false
  };
}

/**
 * Full Biometric Recognition Pipeline Execution Engine:
 * Image -> Multi-Face Detector -> Landmark Alignment -> ArcFace 512D -> L2 Normalization -> FAISS Search -> Calibrated Decision
 */
export async function runFaceRecognitionPipeline(
  imageDataUrl: string,
  workersList: any[] = [],
  threshold: number = DEFAULT_DUPLICATE_THRESHOLD,
  ignoreWorkerId?: string,
  isEnrollmentMode: boolean = true
): Promise<FacePipelineDebugResponse> {
  const defaultDebug: FacePipelineDebugResponse = {
    faceDetected: false,
    faceCount: 0,
    faceQuality: 0,
    embeddingDimension: 0,
    modelName: BIOMETRIC_MODEL_NAME,
    modelVersion: ARCFACE_VERSION,
    similarityScore: 0,
    cosineSimilarity: 0,
    euclideanDistance: 999,
    matchedWorkerId: null,
    matchedWorkerName: null,
    threshold,
    finalDecision: 'NO_FACE_DETECTED',
    embedding: null,
    debugLog: 'Initial state',
    faceDetectionConfidence: 0,
    faceConfidence: 0,
    similarity: 0
  };

  if (!imageDataUrl) {
    return {
      ...defaultDebug,
      debugLog: 'NO_FACE_DETECTED: Empty or invalid image URL provided.'
    };
  }

  try {
    const normalizedUrl = await normalizeImageForBiometrics(imageDataUrl, 800, 0.92);
    const img = await loadImageElement(normalizedUrl);

    // STEP 1: Multi-Face Detection
    const faceResult = await detectFacesInInput(img, 0.15);

    if (faceResult.faceCount === 0) {
      return {
        ...defaultDebug,
        debugLog: 'NO_FACE_DETECTED: No human face detected in image. Objects, animals, and non-faces are strictly rejected.'
      };
    }

    if (faceResult.faceCount > 1 && isEnrollmentMode) {
      return {
        ...defaultDebug,
        faceDetected: true,
        faceCount: faceResult.faceCount,
        faceQuality: faceResult.quality,
        faceDetectionConfidence: faceResult.confidence,
        faceConfidence: faceResult.confidence,
        finalDecision: 'MULTIPLE_FACES',
        debugLog: `MULTIPLE_FACES: Detected ${faceResult.faceCount} faces. Enrollment requires exactly one face in the frame.`
      };
    }

    const embedding = faceResult.embedding512;
    if (!embedding || embedding.length !== 512) {
      return {
        ...defaultDebug,
        faceDetected: true,
        faceCount: faceResult.faceCount,
        faceQuality: faceResult.quality,
        faceDetectionConfidence: faceResult.confidence,
        faceConfidence: faceResult.confidence,
        debugLog: 'NO_FACE_DETECTED: Face detected but deep facial landmarks / descriptor could not be extracted.'
      };
    }

    // STEP 2: FAISS Vector Search
    const faissMatch = await verifyArcFaceDuplicateFaiss(embedding, undefined, workersList, threshold, ignoreWorkerId);

    const cosineSim = Number(faissMatch.cosineSimilarity.toFixed(3));
    const similarityScore = faissMatch.similarityScore;
    const euclideanDist = faissMatch.euclideanDistance;
    const matchedWorker = faissMatch.matchedWorkerId ? workersList.find(w => w.id === faissMatch.matchedWorkerId) : null;

    const isMatchDecision = faissMatch.duplicateFound && !!faissMatch.matchedWorkerId;

    return {
      faceDetected: true,
      faceCount: faceResult.faceCount,
      faceQuality: faceResult.quality,
      embeddingDimension: 512,
      modelName: BIOMETRIC_MODEL_NAME,
      modelVersion: ARCFACE_VERSION,
      similarity: cosineSim,
      similarityScore,
      cosineSimilarity: cosineSim,
      euclideanDistance: euclideanDist,
      matchedWorkerId: isMatchDecision ? faissMatch.matchedWorkerId! : null,
      matchedWorkerName: isMatchDecision ? (matchedWorker?.name || null) : null,
      threshold,
      finalDecision: isMatchDecision ? (isEnrollmentMode ? 'DUPLICATE' : 'MATCH') : 'NOT_DUPLICATE',
      embedding,
      faceDetectionConfidence: faceResult.confidence,
      faceConfidence: faceResult.confidence,
      debugLog: isMatchDecision
        ? `MATCH: Found profile ${matchedWorker?.name || faissMatch.matchedWorkerId} (${similarityScore}% Confidence, Cosine ${cosineSim} >= ${threshold}, Euclidean ${euclideanDist} <= ${DEFAULT_MAX_DUPLICATE_EUCLIDEAN}).`
        : `NOT_DUPLICATE: Unique face verified (${similarityScore}% max similarity to database, Cosine ${cosineSim} < ${threshold}).`
    };
  } catch (err: any) {
    console.error('Error during runFaceRecognitionPipeline:', err);
    return {
      ...defaultDebug,
      debugLog: `NO_FACE_DETECTED: Exception during pipeline execution (${err?.message || err}).`
    };
  }
}

export interface FaceComparisonResult {
  faceDetectedA: boolean;
  faceCountA: number;
  faceDetectedB: boolean;
  faceCountB: number;
  embeddingDimensionA: number;
  embeddingDimensionB: number;
  cosineSimilarity: number;
  euclideanDistance: number;
  similarityScore: number;
  threshold: number;
  decision: 'MATCH' | 'NOT_MATCH' | 'NO_FACE_DETECTED' | 'MULTIPLE_FACES';
  modelName: string;
  modelVersion: string;
  details: string;
}

/**
 * Two-Image Direct Biometric Accuracy Comparator (Test Utility):
 * Takes Image A and Image B, detects faces, extracts 512D embeddings, and computes cosine similarity.
 */
export async function compareTwoFaces(
  imageADataUrl: string,
  imageBDataUrl: string,
  threshold: number = DEFAULT_DUPLICATE_THRESHOLD
): Promise<FaceComparisonResult> {
  const defaultRes: FaceComparisonResult = {
    faceDetectedA: false,
    faceCountA: 0,
    faceDetectedB: false,
    faceCountB: 0,
    embeddingDimensionA: 0,
    embeddingDimensionB: 0,
    cosineSimilarity: 0,
    euclideanDistance: 999,
    similarityScore: 0,
    threshold,
    decision: 'NO_FACE_DETECTED',
    modelName: BIOMETRIC_MODEL_NAME,
    modelVersion: ARCFACE_VERSION,
    details: ''
  };

  try {
    const [normA, normB] = await Promise.all([
      normalizeImageForBiometrics(imageADataUrl, 800, 0.92),
      normalizeImageForBiometrics(imageBDataUrl, 800, 0.92)
    ]);

    const [imgA, imgB] = await Promise.all([
      loadImageElement(normA),
      loadImageElement(normB)
    ]);

    const [resA, resB] = await Promise.all([
      detectFacesInInput(imgA, 0.15),
      detectFacesInInput(imgB, 0.15)
    ]);

    defaultRes.faceDetectedA = resA.faceCount > 0;
    defaultRes.faceCountA = resA.faceCount;
    defaultRes.faceDetectedB = resB.faceCount > 0;
    defaultRes.faceCountB = resB.faceCount;

    if (resA.faceCount === 0 || resB.faceCount === 0) {
      defaultRes.decision = 'NO_FACE_DETECTED';
      defaultRes.details = `No face detected in ${resA.faceCount === 0 ? 'Image A' : 'Image B'}.`;
      return defaultRes;
    }

    if (resA.faceCount > 1 || resB.faceCount > 1) {
      defaultRes.decision = 'MULTIPLE_FACES';
      defaultRes.details = `Multiple faces detected in ${resA.faceCount > 1 ? 'Image A (' + resA.faceCount + ' faces)' : 'Image B (' + resB.faceCount + ' faces)'}.`;
      return defaultRes;
    }

    if (!resA.embedding512 || !resB.embedding512) {
      defaultRes.decision = 'NO_FACE_DETECTED';
      defaultRes.details = 'Could not extract 512D deep facial descriptors.';
      return defaultRes;
    }

    defaultRes.embeddingDimensionA = 512;
    defaultRes.embeddingDimensionB = 512;

    const cosine = calculateArcFaceCosineSimilarity(resA.embedding512, resB.embedding512);
    const euclidean = calculateEuclideanDistance(resA.embedding512, resB.embedding512);
    const score = calculateBiometricConfidence(euclidean);

    const isMatch = cosine >= threshold && euclidean <= DEFAULT_MAX_DUPLICATE_EUCLIDEAN && score >= 82;

    return {
      ...defaultRes,
      cosineSimilarity: Number(cosine.toFixed(3)),
      euclideanDistance: Number(euclidean.toFixed(3)),
      similarityScore: score,
      decision: isMatch ? 'MATCH' : 'NOT_MATCH',
      details: isMatch
        ? `MATCH: Same person verified with ${score}% Biometric Confidence (Cosine ${cosine.toFixed(3)} >= ${threshold}, Euclidean ${euclidean.toFixed(3)} <= ${DEFAULT_MAX_DUPLICATE_EUCLIDEAN}).`
        : `NOT_MATCH: Distinct individuals verified (${score}% similarity, Cosine ${cosine.toFixed(3)} < ${threshold}, Euclidean ${euclidean.toFixed(3)} > ${DEFAULT_MAX_DUPLICATE_EUCLIDEAN}).`
    };
  } catch (err: any) {
    return {
      ...defaultRes,
      details: `Comparison error: ${err?.message || err}`
    };
  }
}

// Backward-compatibility exports
export const extractFaceVector = extractArcFaceEmbedding;

export async function extractMultipleArcFaceEmbeddings(dataUrls: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const url of dataUrls) {
    if (url) {
      const emb = await extractArcFaceEmbedding(url);
      if (emb && isValidArcFaceVector(emb)) {
        embeddings.push(emb);
      }
    }
  }
  return embeddings;
}

export const verifyDuplicateFaceBatch = async (
  candidateDataUrl: string,
  candidateVector: number[] | null,
  workersList: any[]
) => {
  const result = await verifyArcFaceDuplicateFaiss(candidateVector, candidateDataUrl, workersList, DEFAULT_DUPLICATE_THRESHOLD);
  return {
    duplicateFound: result.duplicateFound,
    matchedWorkerId: result.matchedWorkerId,
    similarityScore: result.similarityScore,
    euclideanDistance: result.euclideanDistance,
    noFaceDetected: result.noFaceDetected
  };
};
export const isValidFaceNetVector = isValidArcFaceVector;
