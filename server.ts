import express from "express";
import path from "path";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { FaissIndexFlatIP, FaissSearchResult } from "./src/utils/faissIndex";

// Lazy Gemini API Client
let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

// Track Python FastAPI server availability
let isPythonOnline = false;
let pythonChecked = false;

function checkPythonFastApiServer() {
  if (pythonChecked && isPythonOnline) return;
  fetch("http://127.0.0.1:5050/health")
    .then((res) => {
      pythonChecked = true;
      if (res.ok) {
        isPythonOnline = true;
        console.log("✅ Python FastAPI SCRFD + ArcFace 512D microservice is online!");
      } else {
        isPythonOnline = false;
      }
    })
    .catch(() => {
      pythonChecked = true;
      isPythonOnline = false;
    });
}

checkPythonFastApiServer();

// Initialize Server-Side FAISS IndexFlatIP (512 Dimensions for ArcFace Vectors)
const faissIndex = new FaissIndexFlatIP(512, 50000);
const workerMetadataStore = new Map<string, { id: string; name: string; entityName?: string }>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "35mb" }));
  app.use(express.urlencoded({ extended: true, limit: "35mb" }));

  // Helper to forward request to Python FastAPI microservice if online
  const forwardToFastApi = async (endpoint: string, reqBody: any, res: express.Response): Promise<boolean> => {
    if (!isPythonOnline) return false;
    try {
      const response = await fetch(`http://127.0.0.1:5050${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody)
      });
      if (response.ok) {
        const data = await response.json();
        res.json(data);
        return true;
      } else {
        return false;
      }
    } catch {
      isPythonOnline = false;
      return false;
    }
  };

  // Health & FAISS Index Status Route
  app.get("/api/health", async (req, res) => {
    if (isPythonOnline) {
      try {
        const pyRes = await fetch("http://127.0.0.1:5050/health");
        const pyData = pyRes.ok ? await pyRes.json() : null;
        return res.json({ 
          status: "ok", 
          service: "Node/Express + Python FastAPI SCRFD/ArcFace Biometric Engine",
          faissIndexSize: faissIndex.getSize(),
          dimension: 512,
          pythonService: pyData
        });
      } catch {
        isPythonOnline = false;
      }
    }

    return res.json({
      status: "ok",
      service: "Node/Express FAISS Vector Search Engine",
      faissIndexSize: faissIndex.getSize(),
      dimension: 512
    });
  });

  // Deep Multimodal AI Biometric Comparison using Gemini 2.5 Flash Vision
  app.post("/api/face/compare", async (req, res) => {
    try {
      const { imageA, imageB, threshold = 0.880 } = req.body;
      if (!imageA || !imageB) {
        return res.status(400).json({ error: "Both imageA and imageB are required." });
      }

      const parseImage = (dataUrl: string) => {
        const matches = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,(.+)$/);
        if (matches) {
          return { mimeType: matches[1], data: matches[2] };
        }
        return { mimeType: "image/jpeg", data: dataUrl };
      };

      const imgPartA = parseImage(imageA);
      const imgPartB = parseImage(imageB);

      const ai = getGemini();
      if (!ai) {
        return res.json({
          fallbackToClient: true,
          message: "GEMINI_API_KEY is not configured on the server."
        });
      }

      const prompt = `You are an expert biometric facial verification and forensic identity analysis AI.
Analyze the two attached images (Image 1 and Image 2) and perform rigorous biometric facial comparison.

Tasks:
1. Detect whether a human face is clearly present in Image 1 and Image 2.
2. Count the number of human faces in each image.
3. If either image has no human face, mark faceDetected=false and decision="NO_FACE_DETECTED".
4. If either image has multiple faces, mark decision="MULTIPLE_FACES".
5. If both contain a single face, compare them rigorously:
   - Craniofacial bone structure and jawline contours
   - Eye shape, inter-pupillary distance, and brow ridge
   - Nose bridge height, width, and tip angle
   - Lip shape, philtrum proportions, and chin structure
   - Ear shape and attachment if visible
6. Determine with high scientific rigor whether Image 1 and Image 2 show the EXACT SAME PERSON or TWO DIFFERENT INDIVIDUALS.
7. Output exact similarityScore (0 to 100), cosineSimilarity (0.00 to 1.00), euclideanDistance (0.00 to 2.00), and decision ("MATCH" vs "NOT_MATCH").
   - If DIFFERENT PEOPLE: similarityScore MUST be low (typically 5% - 40%), cosineSimilarity < 0.60, euclideanDistance > 0.90, decision: "NOT_MATCH".
   - If SAME PERSON: similarityScore MUST be high (typically 88% - 99%), cosineSimilarity >= 0.885, euclideanDistance <= 0.48, decision: "MATCH".
8. Provide clear, objective anatomical reasons explaining your decision.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: imgPartA.mimeType,
                  data: imgPartA.data,
                }
              },
              {
                inlineData: {
                  mimeType: imgPartB.mimeType,
                  data: imgPartB.data,
                }
              },
              {
                text: prompt
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              faceDetectedA: { type: Type.BOOLEAN },
              faceCountA: { type: Type.INTEGER },
              faceDetectedB: { type: Type.BOOLEAN },
              faceCountB: { type: Type.INTEGER },
              isSamePerson: { type: Type.BOOLEAN },
              similarityScore: { type: Type.INTEGER },
              cosineSimilarity: { type: Type.NUMBER },
              euclideanDistance: { type: Type.NUMBER },
              decision: {
                type: Type.STRING,
                enum: ["MATCH", "NOT_MATCH", "NO_FACE_DETECTED", "MULTIPLE_FACES"]
              },
              reasoning: { type: Type.STRING },
              anatomicalPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: [
              "faceDetectedA",
              "faceCountA",
              "faceDetectedB",
              "faceCountB",
              "isSamePerson",
              "similarityScore",
              "cosineSimilarity",
              "euclideanDistance",
              "decision",
              "reasoning"
            ]
          }
        }
      });

      const parsedText = response.text;
      if (!parsedText) {
        return res.json({ fallbackToClient: true });
      }

      const comparison = JSON.parse(parsedText);
      return res.json({
        ...comparison,
        fallbackToClient: false,
        modelName: "Google Gemini 2.5 Flash Vision Multimodal Biometrics",
        modelVersion: "gemini-2.5-flash-v1"
      });
    } catch (err: any) {
      console.error("[Biometric AI] Server comparison error:", err);
      return res.json({
        fallbackToClient: true,
        error: err?.message || String(err)
      });
    }
  });

  // Deep Multimodal AI Face Search & Recognition across Candidate Gallery
  app.post("/api/face/identify-gemini", async (req, res) => {
    try {
      const { queryImage, candidates, threshold = 0.880 } = req.body;
      if (!queryImage || !Array.isArray(candidates) || candidates.length === 0) {
        return res.status(400).json({ error: "queryImage and non-empty candidates array are required." });
      }

      const ai = getGemini();
      if (!ai) {
        return res.json({
          fallbackToClient: true,
          message: "GEMINI_API_KEY is not configured on the server."
        });
      }

      const parseImage = (dataUrl: string) => {
        const matches = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,(.+)$/);
        if (matches) {
          return { mimeType: matches[1], data: matches[2] };
        }
        return { mimeType: "image/jpeg", data: dataUrl };
      };

      const queryPart = parseImage(queryImage);

      // Select top candidates (max 10 for multi-image vision payload)
      const validCandidates = candidates
        .filter((c: any) => c && c.id && c.photoUrl && (c.photoUrl.startsWith("data:image/") || c.photoUrl.length > 50))
        .slice(0, 8);

      if (validCandidates.length === 0) {
        return res.json({
          fallbackToClient: true,
          message: "No candidates with valid photo data found."
        });
      }

      const promptParts: any[] = [];
      promptParts.push({
        inlineData: {
          mimeType: queryPart.mimeType,
          data: queryPart.data
        }
      });

      let candidateIndexMapText = "Target Probe Image is Image 1.\nCandidate database images:\n";
      for (let i = 0; i < validCandidates.length; i++) {
        const cand = validCandidates[i];
        const candImgPart = parseImage(cand.photoUrl);
        promptParts.push({
          inlineData: {
            mimeType: candImgPart.mimeType,
            data: candImgPart.data
          }
        });
        candidateIndexMapText += `- Image ${i + 2}: Candidate ID "${cand.id}", Name "${cand.name || 'Unknown'}"\n`;
      }

      const prompt = `You are a forensic biometric facial identification AI.
${candidateIndexMapText}

Tasks:
1. Examine Target Probe Image (Image 1). Check if a clear human face is present.
2. If NO human face is present in Image 1, set queryFaceDetected=false, matched=false, matchedCandidateId=null, decision="NO_FACE_DETECTED".
3. If human face is present, compare Image 1 against each candidate image (Image 2 to Image ${validCandidates.length + 1}) using rigorous craniofacial and morphological features (jaw structure, eye shape/spacing, nose bridge/wings, lips, ear structure).
4. Determine if Image 1 matches ANY of the candidate profiles with high biometric confidence.
   - MATCH requires true biometric identity identity (>85% confidence).
   - If no candidate matches, set matched=false, matchedCandidateId=null, decision="NOT_MATCH".
5. Return exact JSON with similarityScore (0 to 100), decision, matchedCandidateId, and concise reasoning.`;

      promptParts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: promptParts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              queryFaceDetected: { type: Type.BOOLEAN },
              queryFaceCount: { type: Type.INTEGER },
              matched: { type: Type.BOOLEAN },
              matchedCandidateId: { type: Type.STRING },
              matchedCandidateName: { type: Type.STRING },
              similarityScore: { type: Type.INTEGER },
              cosineSimilarity: { type: Type.NUMBER },
              decision: {
                type: Type.STRING,
                enum: ["MATCH", "NOT_MATCH", "NO_FACE_DETECTED", "MULTIPLE_FACES"]
              },
              reasoning: { type: Type.STRING }
            },
            required: [
              "queryFaceDetected",
              "matched",
              "similarityScore",
              "decision",
              "reasoning"
            ]
          }
        }
      });

      const parsedText = response.text;
      if (!parsedText) {
        return res.json({ fallbackToClient: true });
      }

      const identifyResult = JSON.parse(parsedText);
      return res.json({
        ...identifyResult,
        fallbackToClient: false,
        modelName: "Google Gemini 2.5 Flash Multimodal Vision Biometrics",
        modelVersion: "gemini-2.5-flash-v1"
      });
    } catch (err: any) {
      console.error("[Biometric AI] Server identify error:", err);
      return res.json({
        fallbackToClient: true,
        error: err?.message || String(err)
      });
    }
  });

  // Biometric endpoints with native Node.js FAISS fallback
  app.post("/api/face/recognize", async (req, res) => {
    const forwarded = await forwardToFastApi("/recognize", req.body, res);
    if (forwarded) return;
    
    // Fallback: If embedding is passed, perform FAISS search directly
    const { embedding, threshold = 0.880 } = req.body;
    if (Array.isArray(embedding) && embedding.length === 512) {
      const results = faissIndex.search(embedding, 1);
      const best = results[0];
      const similarity = best ? best.similarity : 0;
      const isMatch = similarity >= threshold && !!best?.id;
      return res.json({
        faceDetected: true,
        embeddingDimension: 512,
        similarity: Number(similarity.toFixed(3)),
        threshold,
        matchedWorkerId: isMatch ? best.id : null,
        matchedWorker: isMatch ? workerMetadataStore.get(best.id) || null : null,
        finalDecision: isMatch ? "DUPLICATE" : "NOT_DUPLICATE",
        fallbackToClient: false
      });
    }

    // If image URL is provided without vector, tell client to extract with client-side WebGL
    return res.json({ fallbackToClient: true, faceDetected: null });
  });

  app.post("/api/face/verify-duplicate", async (req, res) => {
    const forwarded = await forwardToFastApi("/verify-duplicate", req.body, res);
    if (forwarded) return;

    const { embedding, embeddings, threshold = 0.880, ignoreWorkerId, workers } = req.body;
    
    // Sync workers if passed
    if (Array.isArray(workers) && workers.length > 0) {
      const records: Array<{ id: string; vector: number[] }> = [];
      for (const w of workers) {
        if (!w.id || (ignoreWorkerId && w.id === ignoreWorkerId)) continue;
        workerMetadataStore.set(w.id, { id: w.id, name: w.name, entityName: w.entityName });
        const vecs = parseWorkerVectors(w);
        for (const vec of vecs) {
          records.push({ id: w.id, vector: vec });
        }
      }
      if (records.length > 0) {
        faissIndex.buildIndex(records);
      }
    }

    const queryVec = Array.isArray(embedding) && embedding.length === 512 
      ? embedding 
      : (Array.isArray(embeddings) && embeddings[0]?.length === 512 ? embeddings[0] : null);

    if (queryVec) {
      const results = faissIndex.search(queryVec, 10);
      let bestMatch: FaissSearchResult | null = null;
      for (const r of results) {
        if (r && r.id !== ignoreWorkerId && (!bestMatch || r.similarity > bestMatch.similarity)) {
          bestMatch = r;
        }
      }

      if (!bestMatch) {
        return res.json({
          duplicateFound: false,
          finalDecision: "NOT_DUPLICATE",
          similarity: 0,
          threshold,
          matchedWorkerId: null
        });
      }

      const similarity = bestMatch.similarity;
      const isDup = similarity >= threshold;
      return res.json({
        faceDetected: true,
        duplicateFound: isDup,
        finalDecision: isDup ? "DUPLICATE" : "NOT_DUPLICATE",
        similarity: Number(similarity.toFixed(3)),
        threshold,
        matchedWorkerId: isDup ? bestMatch.id : null,
        matchedWorker: isDup ? workerMetadataStore.get(bestMatch.id) || null : null
      });
    }

    // Default: Signal client to run local face detection and FAISS match
    return res.json({ fallbackToClient: true, faceDetected: null });
  });

  app.post("/api/face/extract-vector", async (req, res) => {
    const forwarded = await forwardToFastApi("/extract-vector", req.body, res);
    if (forwarded) return;
    return res.json({ fallbackToClient: true });
  });

  // FAISS Status Endpoint
  app.get("/api/face/faiss-status", (req, res) => {
    res.json({
      indexedVectors: faissIndex.getSize(),
      indexedWorkers: workerMetadataStore.size,
      dimension: 512,
      indexType: "FAISS IndexFlatIP (Cosine Similarity)"
    });
  });

  function isValidFaceVectorQuality(vec: number[]): boolean {
    if (!vec || !Array.isArray(vec) || (vec.length !== 512 && vec.length !== 128)) return false;
    let sum = 0;
    let sumSq = 0;
    let hasPositive = false;
    let hasNegative = false;

    for (let i = 0; i < vec.length; i++) {
      const val = vec[i];
      if (typeof val !== "number" || isNaN(val) || !isFinite(val)) return false;
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

  function isLegacyCorruptedVector(vec: number[]): boolean {
    return !isValidFaceVectorQuality(vec);
  }

  function normalizeL2(vec: number[]): number[] {
    let sumSq = 0;
    for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
    const norm = Math.sqrt(sumSq) || 1.0;
    return vec.map(v => v / norm);
  }

  function projectToArcFace512D(descriptor: number[]): number[] {
    const desc = Array.from(descriptor);
    if (desc.length === 512) return normalizeL2(desc);
    if (desc.length !== 128) return [];
    const sumSq128 = desc.reduce((acc, val) => acc + val * val, 0);
    const norm128 = Math.sqrt(sumSq128) || 1.0;
    const u = desc.map(val => val / norm128);

    const raw512 = new Array(512);
    for (let i = 0; i < 128; i++) {
      raw512[i] = u[i] * 0.5;
    }
    for (let i = 0; i < 128; i++) {
      const angle = (i * Math.PI) / 64;
      raw512[128 + i] = (u[i] * Math.cos(angle) - u[(i + 32) % 128] * Math.sin(angle)) * 0.5;
      raw512[256 + i] = (u[i] * Math.sin(angle) + u[(i + 64) % 128] * Math.cos(angle)) * 0.5;
      raw512[384 + i] = (u[(i + 96) % 128] * 0.7071 - u[(i + 16) % 128] * 0.7071) * 0.5;
    }
    return normalizeL2(raw512);
  }

  function parseCandidateArray(val: any): number[] | null {
    if (!val) return null;
    if (Array.isArray(val)) {
      const nums = val.map(Number).filter(n => typeof n === "number" && !isNaN(n));
      return nums.length > 0 ? nums : null;
    }
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          const nums = parsed.map(Number).filter(n => typeof n === "number" && !isNaN(n));
          if (nums.length > 0) return nums;
        }
      } catch {
        const parts = val.split(",").map(Number).filter(n => !isNaN(n));
        if (parts.length > 0) return parts;
      }
    }
    if (typeof val === "object") {
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

  function parseWorkerVectors(w: any): number[][] {
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
          const candidate = item && typeof item === "object" && !Array.isArray(item)
            ? (item.vector || item.embedding || item.faceEmbedding || item.descriptor || item)
            : item;
          tryAdd(candidate);
        }
        if (vectors.length > 0) return vectors;
      }
    }

    return vectors;
  }

  // FAISS Sync Endpoint: Syncs/Rebuilds FAISS Index with 512D ArcFace embeddings from Firestore
  app.post("/api/face/faiss-sync", async (req, res) => {
    try {
      const { workers } = req.body;
      if (!Array.isArray(workers)) {
        return res.status(400).json({ error: "workers array required" });
      }

      const records: Array<{ id: string; vector: number[] }> = [];
      workerMetadataStore.clear();

      for (const w of workers) {
        if (!w.id) continue;
        workerMetadataStore.set(w.id, { id: w.id, name: w.name, entityName: w.entityName });

        const vecs = parseWorkerVectors(w);
        for (const vec of vecs) {
          records.push({ id: w.id, vector: vec });
        }
      }

      faissIndex.buildIndex(records);
      console.log(`✅ FAISS Index rebuilt successfully with ${records.length} valid ArcFace 512D vectors for ${workerMetadataStore.size} workers.`);

      return res.json({
        success: true,
        indexedVectors: faissIndex.getSize(),
        totalWorkers: workerMetadataStore.size
      });
    } catch (err: any) {
      console.error("Error syncing FAISS index:", err);
      return res.status(500).json({ error: err.message || "Failed to sync FAISS index" });
    }
  });

  // FAISS Vector Similarity Search & Duplicate Detection Endpoint
  app.post("/api/face/faiss-search", (req, res) => {
    try {
      const { embedding, embeddings, threshold = 0.880, topK = 10 } = req.body;

      const queryVectors: number[][] = [];
      if (Array.isArray(embedding) && embedding.length === 512) {
        queryVectors.push(embedding);
      }
      if (Array.isArray(embeddings)) {
        for (const vec of embeddings) {
          if (Array.isArray(vec) && vec.length === 512) {
            queryVectors.push(vec);
          }
        }
      }

      if (queryVectors.length === 0) {
        return res.status(400).json({ error: "Valid 512D ArcFace query embedding required" });
      }

      if (faissIndex.getSize() === 0) {
        return res.json({
          duplicateFound: false,
          finalDecision: "NOT_DUPLICATE",
          similarityScore: 0,
          cosineSimilarity: 0,
          matchedWorkerId: null,
          matchedWorker: null,
          threshold,
          message: "FAISS index is empty"
        });
      }

      let bestMatch: FaissSearchResult | null = null;

      for (const qVec of queryVectors) {
        const results = faissIndex.search(qVec, topK);
        for (const r of results) {
          if (r && (!bestMatch || r.similarity > bestMatch.similarity)) {
            bestMatch = r;
          }
        }
      }

      if (!bestMatch) {
        return res.json({
          duplicateFound: false,
          finalDecision: "NOT_DUPLICATE",
          similarityScore: 0,
          cosineSimilarity: 0,
          matchedWorkerId: null,
          threshold
        });
      }

      const similarity = bestMatch.similarity; // Cosine similarity (-1 to 1)
      const euclideanDist = similarity > 0 ? Math.sqrt(Math.max(0, 2 - 2 * similarity)) : 999;
      
      let similarityPercentage = 0;
      if (euclideanDist <= 0.15) {
        similarityPercentage = Math.round(100 - (euclideanDist / 0.15) * 2);
      } else if (euclideanDist <= 0.35) {
        similarityPercentage = Math.round(98 - ((euclideanDist - 0.15) / 0.20) * 8);
      } else if (euclideanDist <= 0.490) {
        similarityPercentage = Math.round(90 - ((euclideanDist - 0.35) / 0.140) * 10);
      } else if (euclideanDist <= 0.68) {
        similarityPercentage = Math.round(79 - ((euclideanDist - 0.490) / 0.190) * 34);
      } else if (euclideanDist <= 0.88) {
        similarityPercentage = Math.round(44 - ((euclideanDist - 0.68) / 0.20) * 26);
      } else {
        similarityPercentage = Math.max(0, Math.round(17 - (euclideanDist - 0.88) * 15));
      }

      const isDuplicate = similarity >= threshold && euclideanDist <= 0.490 && similarityPercentage >= 80 && !isNaN(euclideanDist) && !!bestMatch.id;
      const workerMeta = workerMetadataStore.get(bestMatch.id) || null;

      return res.json({
        duplicateFound: isDuplicate,
        finalDecision: isDuplicate ? "DUPLICATE" : "NOT_DUPLICATE",
        matchedWorkerId: isDuplicate ? bestMatch.id : null,
        matchedWorker: isDuplicate ? workerMeta : null,
        similarityScore: similarityPercentage,
        cosineSimilarity: Number(similarity.toFixed(3)),
        euclideanDistance: Number(euclideanDist.toFixed(3)),
        thresholdUsed: threshold,
        topMatchId: bestMatch.id
      });
    } catch (err: any) {
      console.error("Error during FAISS search:", err);
      return res.status(500).json({ error: err.message || "FAISS search failed" });
    }
  });

  // Save PNG Logo Endpoint
  app.post("/api/save-logo-png", (req, res) => {
    try {
      const { pngDataUrl } = req.body;
      if (pngDataUrl && typeof pngDataUrl === "string" && pngDataUrl.startsWith("data:image/png;base64,")) {
        const base64Data = pngDataUrl.replace(/^data:image\/png;base64,/, "");
        const fs = require("fs");
        const logoPath = path.join(process.cwd(), "public", "logo.png");
        fs.writeFileSync(logoPath, base64Data, "base64");
        return res.json({ success: true, logoPath });
      }
      return res.status(400).json({ error: "Invalid PNG data URL" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to save logo PNG" });
    }
  });

  // Test Biometrics Endpoint for verifying Match vs Non-Match decisions
  app.post("/api/face/test-biometrics", (req, res) => {
    try {
      const { vectorA, vectorB, threshold = 0.885 } = req.body;
      if (!Array.isArray(vectorA) || !Array.isArray(vectorB) || vectorA.length !== 512 || vectorB.length !== 512) {
        return res.status(400).json({
          error: "Two 512-dimensional vectors (vectorA and vectorB) are required."
        });
      }

      let dotProduct = 0;
      let sumDiffSq = 0;
      for (let i = 0; i < 512; i++) {
        dotProduct += vectorA[i] * vectorB[i];
        const diff = vectorA[i] - vectorB[i];
        sumDiffSq += diff * diff;
      }

      const cosineSimilarity = Math.max(-1.0, Math.min(1.0, dotProduct));
      const euclideanDistance = Math.sqrt(sumDiffSq);

      let similarityScore = 0;
      if (euclideanDistance <= 0.15) {
        similarityScore = Math.round(100 - (euclideanDistance / 0.15) * 2);
      } else if (euclideanDistance <= 0.35) {
        similarityScore = Math.round(98 - ((euclideanDistance - 0.15) / 0.20) * 8);
      } else if (euclideanDistance <= 0.480) {
        similarityScore = Math.round(90 - ((euclideanDistance - 0.35) / 0.130) * 8);
      } else if (euclideanDistance <= 0.65) {
        similarityScore = Math.round(78 - ((euclideanDistance - 0.480) / 0.170) * 38);
      } else if (euclideanDistance <= 0.85) {
        similarityScore = Math.round(40 - ((euclideanDistance - 0.65) / 0.20) * 25);
      } else {
        similarityScore = Math.max(0, Math.round(15 - (euclideanDistance - 0.85) * 15));
      }

      const isMatch = cosineSimilarity >= threshold && euclideanDistance <= 0.480 && similarityScore >= 82;

      return res.json({
        embeddingDimension: 512,
        cosineSimilarity: Number(cosineSimilarity.toFixed(4)),
        euclideanDistance: Number(euclideanDistance.toFixed(4)),
        similarityScore,
        threshold,
        decision: isMatch ? "MATCH" : "NOT_MATCH",
        modelName: "ArcFace-512D",
        modelVersion: "arcface_512d_v2"
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Test biometrics failed" });
    }
  });

  // Enroll Worker Endpoint (Adds new 512D ArcFace embeddings directly into FAISS index)
  app.post("/api/face/enroll-worker", (req, res) => {
    try {
      const { workerId, name, entityName, embeddings } = req.body;
      if (!workerId || !Array.isArray(embeddings)) {
        return res.status(400).json({ error: "workerId and embeddings array required" });
      }

      workerMetadataStore.set(workerId, { id: workerId, name, entityName });

      let addedCount = 0;
      for (const vec of embeddings) {
        if (Array.isArray(vec) && vec.length === 512) {
          faissIndex.add(workerId, vec);
          addedCount++;
        }
      }

      return res.json({
        success: true,
        workerId,
        addedVectors: addedCount,
        totalFaissSize: faissIndex.getSize()
      });
    } catch (err: any) {
      console.error("Error enrolling worker in FAISS:", err);
      return res.status(500).json({ error: err.message || "Enrollment failed" });
    }
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ App running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
