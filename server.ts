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

  // FAISS Sync Endpoint: Syncs/Rebuilds FAISS Index with 512D ArcFace embeddings from Firestore
  app.post("/api/face/faiss-sync", async (req, res) => {
    try {
      const { workers } = req.body;
      if (!Array.isArray(workers)) {
        return res.status(400).json({ error: "workers array required" });
      }

      // Sync to Python FastAPI microservice
      fetch("http://127.0.0.1:8000/sync-faiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workers })
      }).catch((err) => console.warn("Failed to sync to Python FAISS:", err?.message || err));

      const records: Array<{ id: string; vector: number[] }> = [];
      workerMetadataStore.clear();

      for (const w of workers) {
        if (!w.id) continue;
        workerMetadataStore.set(w.id, { id: w.id, name: w.name, entityName: w.entityName });

        // Multi-photo ArcFace embeddings
        if (Array.isArray(w.arcfaceEmbeddings) && w.arcfaceEmbeddings.length > 0) {
          for (const vec of w.arcfaceEmbeddings) {
            if (Array.isArray(vec) && vec.length === 512) {
              records.push({ id: w.id, vector: vec });
            }
          }
        } 
        // Single ArcFace embedding
        else if (Array.isArray(w.faceEmbedding) && w.faceEmbedding.length === 512) {
          records.push({ id: w.id, vector: w.faceEmbedding });
        }
      }

      faissIndex.buildIndex(records);
      console.log(`✅ FAISS Index rebuilt successfully with ${records.length} ArcFace 512D vectors for ${workerMetadataStore.size} workers.`);

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
      const { embedding, embeddings, threshold = 0.68, topK = 1 } = req.body;

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
      const isDuplicate = similarity >= threshold;
      const similarityPercentage = Math.min(100, Math.max(0, Math.round(similarity * 100)));
      const workerMeta = workerMetadataStore.get(bestMatch.id) || null;

      return res.json({
        duplicateFound: isDuplicate,
        finalDecision: isDuplicate ? "DUPLICATE" : "NOT_DUPLICATE",
        matchedWorkerId: isDuplicate ? bestMatch.id : null,
        matchedWorker: isDuplicate ? workerMeta : null,
        similarityScore: similarityPercentage,
        cosineSimilarity: similarity,
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
