import express from "express";
import path from "path";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import { FaissIndexFlatIP, FaissSearchResult } from "./src/utils/faissIndex";

// Ensure Python FastAPI server is running on port 8000
let pythonProcess: any = null;
function ensurePythonFastApiServer() {
  fetch("http://127.0.0.1:8000/health")
    .then((res) => {
      if (res.ok) console.log("✅ Python FastAPI SCRFD + ArcFace 512D microservice is online!");
      else spawnPython();
    })
    .catch(() => {
      spawnPython();
    });
}

function spawnPython() {
  console.log("🚀 Spawning Python FastAPI biometric server (fastapi_server.py)...");
  pythonProcess = spawn("python3", ["fastapi_server.py"], { stdio: "inherit" });
  pythonProcess.on("error", (err: any) => console.error("FastAPI spawn error:", err));
}

ensurePythonFastApiServer();

// Initialize Server-Side FAISS IndexFlatIP (512 Dimensions for ArcFace Vectors)
const faissIndex = new FaissIndexFlatIP(512, 50000);
const workerMetadataStore = new Map<string, { id: string; name: string; entityName?: string }>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "35mb" }));
  app.use(express.urlencoded({ extended: true, limit: "35mb" }));

  // Helper to forward request to Python FastAPI microservice
  const forwardToFastApi = async (endpoint: string, reqBody: any, res: express.Response) => {
    try {
      const response = await fetch(`http://127.0.0.1:8000${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody)
      });
      if (response.ok) {
        const data = await response.json();
        return res.json(data);
      } else {
        const errText = await response.text();
        return res.status(response.status).send(errText);
      }
    } catch (err: any) {
      console.warn(`⚠️ FastAPI forward error on ${endpoint}:`, err?.message || err);
      return null;
    }
  };

  // Health & FAISS Index Status Route
  app.get("/api/health", async (req, res) => {
    try {
      const pyRes = await fetch("http://127.0.0.1:8000/health");
      const pyData = pyRes.ok ? await pyRes.json() : null;
      return res.json({ 
        status: "ok", 
        service: "Node/Express + Python FastAPI SCRFD/ArcFace Biometric Engine",
        faissIndexSize: faissIndex.getSize(),
        dimension: 512,
        pythonService: pyData
      });
    } catch {
      return res.json({
        status: "ok",
        service: "Node/Express FAISS Vector Search Engine",
        faissIndexSize: faissIndex.getSize(),
        dimension: 512
      });
    }
  });

  // Proxy biometric endpoints to Python FastAPI microservice
  app.post("/api/face/recognize", async (req, res) => {
    const forwarded = await forwardToFastApi("/recognize", req.body, res);
    if (forwarded) return;
    return res.status(503).json({ error: "Python biometric microservice unavailable" });
  });

  app.post("/api/face/verify-duplicate", async (req, res) => {
    const forwarded = await forwardToFastApi("/verify-duplicate", req.body, res);
    if (forwarded) return;
    return res.status(503).json({ error: "Python biometric microservice unavailable" });
  });

  app.post("/api/face/extract-vector", async (req, res) => {
    const forwarded = await forwardToFastApi("/extract-vector", req.body, res);
    if (forwarded) return;
    return res.status(503).json({ error: "Python biometric microservice unavailable" });
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

  function isLegacyCorruptedVector(vec: number[]): boolean {
    if (!vec || !Array.isArray(vec) || vec.length !== 512) return true;
    let sumSq = 0;
    for (let i = 0; i < 512; i++) {
      const val = vec[i];
      if (typeof val !== "number" || isNaN(val)) return true;
      sumSq += val * val;
    }
    return sumSq < 0.05;
  }

  function normalizeL2(vec: number[]): number[] {
    let sumSq = 0;
    for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
    const norm = Math.sqrt(sumSq) || 1.0;
    return vec.map(v => v / norm);
  }

  function projectToArcFace512D(descriptor: number[]): number[] {
    const norm128 = Math.sqrt(descriptor.reduce((acc, val) => acc + val * val, 0)) || 1.0;
    const u = descriptor.map(val => val / norm128);
    const raw512 = new Array(512);
    for (let i = 0; i < 512; i++) {
      raw512[i] = u[i % 128] * 0.5;
    }
    return raw512;
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

    const rawCandidates: any[] = [
      w.faceEmbedding,
      w.faceEmbeddings,
      w.faceVector,
      w.faceVectors,
      w.embedding,
      w.embeddings,
      w.vector,
      w.vectors,
      w.arcfaceEmbeddings,
      w.arcfaceEmbedding,
      w.descriptor,
      w.descriptors,
      w.faceDescriptor,
      w.faceDescriptors,
      w.biometricVector,
      w.biometricVectors,
      w.biometrics
    ];

    const addVector = (nums: number[]) => {
      if (nums.length === 512) {
        const normalized = normalizeL2(nums);
        if (!isLegacyCorruptedVector(normalized)) {
          vectors.push(normalized);
        }
      } else if (nums.length === 128) {
        const proj512 = projectToArcFace512D(nums);
        if (!isLegacyCorruptedVector(proj512)) {
          vectors.push(proj512);
        }
      }
    };

    for (const item of rawCandidates) {
      if (!item) continue;
      if (Array.isArray(item) && item.length > 0) {
        if (typeof item[0] === "number") {
          const parsed = parseCandidateArray(item);
          if (parsed) addVector(parsed);
        } else {
          for (const sub of item) {
            if (sub && typeof sub === "object" && !Array.isArray(sub)) {
              const innerVec = sub.vector || sub.embedding || sub.faceEmbedding || sub.descriptor || sub;
              const parsed = parseCandidateArray(innerVec);
              if (parsed) addVector(parsed);
            } else {
              const parsed = parseCandidateArray(sub);
              if (parsed) addVector(parsed);
            }
          }
        }
      } else {
        const parsed = parseCandidateArray(item);
        if (parsed) addVector(parsed);
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
      const { embedding, embeddings, threshold = 0.86, topK = 1 } = req.body;

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
        if (results.length > 0) {
          if (!bestMatch || results[0].similarity > bestMatch.similarity) {
            bestMatch = results[0];
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
      if (euclideanDist <= 0.20) {
        similarityPercentage = 99;
      } else if (euclideanDist <= 0.40) {
        similarityPercentage = Math.round(98 - ((euclideanDist - 0.20) / 0.20) * 10);
      } else if (euclideanDist <= 0.52) {
        similarityPercentage = Math.round(88 - ((euclideanDist - 0.40) / 0.12) * 10);
      } else if (euclideanDist <= 0.90) {
        similarityPercentage = Math.round(74 - ((euclideanDist - 0.52) / 0.38) * 44);
      } else {
        similarityPercentage = Math.max(0, Math.round(29 - (euclideanDist - 0.90) * 15));
      }

      const isDuplicate = (similarity >= threshold || similarityPercentage >= 78) && similarity >= 0.85 && !isNaN(euclideanDist) && !!bestMatch.id;
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
