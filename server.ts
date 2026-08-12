import express from "express";
import path from "path";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Spawn Python FastAPI Microservice on port 8000
  console.log("🚀 Launching Python FastAPI Biometric Face Service on port 8000...");
  const pythonProcess = spawn("python3", ["-m", "uvicorn", "fastapi_server:app", "--host", "127.0.0.1", "--port", "8000"], {
    stdio: "inherit"
  });

  pythonProcess.on("error", (err) => {
    console.error("⚠️ Failed to start Python FastAPI process:", err);
  });

  // Express proxy to Python FastAPI Microservice
  app.all("/api/python/*", async (req, res) => {
    const targetPath = req.params[0] || "";
    const fastapiUrl = `http://127.0.0.1:8000/${targetPath}`;
    try {
      const response = await fetch(fastapiUrl, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body)
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (err: any) {
      console.error("Proxy error to FastAPI:", err);
      res.status(502).json({ error: "Python FastAPI Service Unavailable", details: err?.message });
    }
  });

  // Health route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "Node/Express + Python FastAPI Microservice" });
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
