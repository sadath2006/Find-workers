import os
import base64
import threading
import numpy as np
import cv2
from io import BytesIO
from typing import List, Optional, Dict, Any, Tuple
from fastapi import FastAPI, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import insightface
import faiss

# =====================================================================
# FASTAPI SERVER INITIALIZATION
# =====================================================================
app = FastAPI(
    title="Find Worker ArcFace 512D & FAISS Biometric Recognition API",
    description="Python FastAPI Microservice with SCRFD Face Detection, Landmark Alignment, ArcFace 512D Embeddings & FAISS Cosine Similarity Search",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================================
# INSIGHTFACE MODEL & FAISS INDEX SETUP
# =====================================================================
print("🔄 Initializing InsightFace SCRFD + ArcFace ResNet50 ('buffalo_l') model...")
insight_app = insightface.app.FaceAnalysis(
    name="buffalo_l",
    providers=["CPUExecutionProvider"]
)
insight_app.prepare(ctx_id=0, det_size=(640, 640))
print("✅ InsightFace SCRFD Detector & ArcFace 512D Embedder ready!")

EMBEDDING_DIM = 512

class FaissEngine:
    def __init__(self, dimension: int = EMBEDDING_DIM):
        self.dimension = dimension
        self.lock = threading.Lock()
        self.index = faiss.IndexFlatIP(dimension)
        self.worker_ids: List[str] = []  # index -> worker_id mapping
        self.worker_metadata: Dict[str, dict] = {}  # worker_id -> info dict

    def reset(self):
        with self.lock:
            self.index = faiss.IndexFlatIP(self.dimension)
            self.worker_ids = []
            self.worker_metadata = {}

    def sync(self, workers: List[dict]) -> int:
        with self.lock:
            self.index = faiss.IndexFlatIP(self.dimension)
            self.worker_ids = []
            self.worker_metadata = {}
            
            vectors = []
            ids = []
            for w in workers:
                w_id = str(w.get("id") or w.get("workerId") or "")
                if not w_id:
                    continue
                name = str(w.get("name") or "")
                entity_name = str(w.get("entityName") or "")
                self.worker_metadata[w_id] = {"id": w_id, "name": name, "entityName": entity_name}
                
                # Check multi-photo arcfaceEmbeddings or single faceEmbedding
                embeddings = w.get("arcfaceEmbeddings") or []
                if not embeddings and w.get("faceEmbedding"):
                    embeddings = [w.get("faceEmbedding")]
                
                for vec in embeddings:
                    if isinstance(vec, list) and len(vec) == self.dimension:
                        arr = np.array(vec, dtype=np.float32)
                        norm = np.linalg.norm(arr)
                        if norm > 0:
                            arr = arr / norm
                        vectors.append(arr)
                        ids.append(w_id)
            
            if len(vectors) > 0:
                matrix = np.array(vectors, dtype=np.float32)
                self.index.add(matrix)
                self.worker_ids = ids
            
            return len(ids)

    def add_worker_embedding(self, worker_id: str, name: str, vector: List[float], entity_name: str = ""):
        if not vector or len(vector) != self.dimension:
            return
        with self.lock:
            arr = np.array(vector, dtype=np.float32)
            norm = np.linalg.norm(arr)
            if norm > 0:
                arr = arr / norm
            self.worker_metadata[worker_id] = {"id": worker_id, "name": name, "entityName": entity_name}
            self.index.add(np.array([arr], dtype=np.float32))
            self.worker_ids.append(worker_id)

    def search(self, query_vector: List[float], top_k: int = 1) -> Tuple[float, Optional[str], Optional[dict]]:
        if not query_vector or len(query_vector) != self.dimension:
            return 0.0, None, None
        with self.lock:
            if self.index.ntotal == 0 or len(self.worker_ids) == 0:
                return 0.0, None, None
            
            arr = np.array(query_vector, dtype=np.float32)
            norm = np.linalg.norm(arr)
            if norm > 0:
                arr = arr / norm
            
            k = min(top_k, self.index.ntotal)
            sims, idxs = self.index.search(np.array([arr], dtype=np.float32), k)
            
            if len(sims[0]) > 0 and idxs[0][0] >= 0:
                top_idx = int(idxs[0][0])
                top_sim = float(sims[0][0])
                if top_idx < len(self.worker_ids):
                    matched_id = self.worker_ids[top_idx]
                    meta = self.worker_metadata.get(matched_id)
                    return top_sim, matched_id, meta
            
            return 0.0, None, None

faiss_engine = FaissEngine(EMBEDDING_DIM)

# =====================================================================
# HELPER FUNCTIONS
# =====================================================================
def decode_image_to_cv2(image_input: str) -> np.ndarray:
    """Decodes a base64 image string or data URL into an OpenCV BGR numpy array."""
    if not image_input or not isinstance(image_input, str):
        raise ValueError("Invalid image input string")
    
    encoded = image_input
    if "," in image_input:
        encoded = image_input.split(",", 1)[1]
    
    image_bytes = base64.b64decode(encoded)
    np_arr = np.frombuffer(image_bytes, np.uint8)
    bgr_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    
    if bgr_img is None:
        raise ValueError("Could not decode image bytes into valid OpenCV image")
    
    return bgr_img

def process_image_scrfd_arcface(bgr_img: np.ndarray) -> Tuple[bool, float, Optional[np.ndarray]]:
    """
    Runs SCRFD face detection & landmark face alignment.
    If no face detected: returns (False, 0.0, None).
    If face detected: extracts 512D ArcFace L2-normalized embedding.
    """
    faces = insight_app.get(bgr_img)
    if not faces or len(faces) == 0:
        return False, 0.0, None
    
    # Pick the face with highest detection confidence score
    best_face = max(faces, key=lambda f: float(getattr(f, 'det_score', 0.0)))
    conf = float(getattr(best_face, 'det_score', 0.0))
    
    if conf < 0.40:  # SCRFD confidence threshold
        return False, conf, None
    
    # InsightFace ArcFace 512D normed_embedding
    embedding = getattr(best_face, 'normed_embedding', None)
    if embedding is None:
        embedding = getattr(best_face, 'embedding', None)
        if embedding is not None:
            norm = np.linalg.norm(embedding)
            if norm > 0:
                embedding = embedding / norm

    if embedding is None or len(embedding) != EMBEDDING_DIM:
        return False, conf, None
    
    # Verify exact 512 dimensions and L2 normalization
    embedding = np.array(embedding, dtype=np.float32)
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
        
    return True, conf, embedding

# =====================================================================
# REQUEST / RESPONSE MODELS
# =====================================================================
class ExtractVectorRequest(BaseModel):
    imageDataUrl: str

class WorkerCandidate(BaseModel):
    id: str
    name: Optional[str] = ""
    entityName: Optional[str] = ""
    faceEmbedding: Optional[List[float]] = None
    arcfaceEmbeddings: Optional[List[List[float]]] = None

class BiometricRequest(BaseModel):
    imageDataUrl: str
    threshold: Optional[float] = 0.86
    workers: Optional[List[WorkerCandidate]] = None

class SyncFaissRequest(BaseModel):
    workers: List[WorkerCandidate]

class EnrollWorkerRequest(BaseModel):
    workerId: str
    name: Optional[str] = ""
    entityName: Optional[str] = ""
    embeddings: List[List[float]]

# =====================================================================
# API ENDPOINTS
# =====================================================================
@app.get("/health")
def health_check():
    return {
        "status": "online",
        "service": "InsightFace SCRFD + ArcFace 512D + FAISS Cosine Similarity Engine",
        "detector": "SCRFD",
        "recognitionModel": "ArcFace ResNet50 (512D)",
        "vectorDatabase": "FAISS IndexFlatIP",
        "embeddingDimension": EMBEDDING_DIM,
        "indexedVectors": faiss_engine.index.ntotal,
        "version": "2.0.0"
    }

@app.post("/extract-vector")
@app.post("/api/face/extract-vector")
def extract_vector(payload: ExtractVectorRequest):
    try:
        bgr_img = decode_image_to_cv2(payload.imageDataUrl)
        face_detected, conf, embedding = process_image_scrfd_arcface(bgr_img)
        
        if not face_detected or embedding is None:
            return {
                "faceDetected": False,
                "faceDetectionConfidence": round(conf, 4),
                "embeddingDimension": 0,
                "finalDecision": "NO_FACE_DETECTED",
                "vector": None,
                "vectorSize": 0
            }
        
        return {
            "faceDetected": True,
            "faceDetectionConfidence": round(conf, 4),
            "embeddingDimension": len(embedding),
            "finalDecision": "FACE_DETECTED",
            "vector": embedding.tolist(),
            "vectorSize": len(embedding)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing error: {str(e)}")

@app.post("/recognize")
@app.post("/api/face/recognize")
def recognize_face(payload: BiometricRequest):
    """
    Recognition Pipeline:
    Camera image -> SCRFD face detection -> If NO face: NO_FACE_DETECTED -> Landmark Face Alignment -> ArcFace 512D -> FAISS Cosine Similarity Search -> Worker ID
    """
    threshold = payload.threshold if payload.threshold is not None else 0.86
    
    # Optionally sync workers list to FAISS if provided
    if payload.workers and len(payload.workers) > 0:
        faiss_engine.sync([w.dict() for w in payload.workers])
    
    try:
        bgr_img = decode_image_to_cv2(payload.imageDataUrl)
    except Exception as e:
        return {
            "faceDetected": False,
            "faceDetectionConfidence": 0.0,
            "embeddingDimension": 0,
            "similarity": 0.0,
            "threshold": threshold,
            "matchedWorkerId": None,
            "finalDecision": "NO_FACE_DETECTED",
            "embedding": None,
            "error": str(e)
        }
    
    face_detected, conf, embedding = process_image_scrfd_arcface(bgr_img)
    
    if not face_detected or embedding is None:
        return {
            "faceDetected": False,
            "faceDetectionConfidence": round(conf, 4),
            "embeddingDimension": 0,
            "similarity": 0.0,
            "threshold": threshold,
            "matchedWorkerId": None,
            "finalDecision": "NO_FACE_DETECTED",
            "embedding": None
        }
    
    # FAISS Cosine Similarity Search
    top_sim, matched_id, meta = faiss_engine.search(embedding.tolist(), top_k=1)
    
    is_match = (top_sim >= threshold) and (matched_id is not None)
    final_decision = "DUPLICATE" if is_match else "NOT_DUPLICATE"
    
    return {
        "faceDetected": True,
        "faceDetectionConfidence": round(conf, 4),
        "embeddingDimension": EMBEDDING_DIM,
        "similarity": round(top_sim, 4),
        "threshold": threshold,
        "matchedWorkerId": matched_id if is_match else None,
        "matchedWorker": meta if is_match else None,
        "finalDecision": final_decision,
        "embedding": embedding.tolist()
    }

@app.post("/verify-duplicate")
@app.post("/api/face/verify-duplicate")
def verify_duplicate(payload: BiometricRequest):
    """
    Duplicate Registration Check Pipeline:
    New worker image -> SCRFD face detection -> If NO face: NO_FACE_DETECTED -> Landmark Alignment -> ArcFace 512D -> FAISS Cosine Similarity -> Threshold -> DUPLICATE / NOT_DUPLICATE
    """
    threshold = payload.threshold if payload.threshold is not None else 0.86
    
    if payload.workers and len(payload.workers) > 0:
        faiss_engine.sync([w.dict() for w in payload.workers])
        
    try:
        bgr_img = decode_image_to_cv2(payload.imageDataUrl)
    except Exception as e:
        return {
            "faceDetected": False,
            "faceDetectionConfidence": 0.0,
            "embeddingDimension": 0,
            "similarity": 0.0,
            "threshold": threshold,
            "matchedWorkerId": None,
            "finalDecision": "NO_FACE_DETECTED",
            "duplicateFound": False,
            "embedding": None,
            "error": str(e)
        }
        
    face_detected, conf, embedding = process_image_scrfd_arcface(bgr_img)
    
    if not face_detected or embedding is None:
        return {
            "faceDetected": False,
            "faceDetectionConfidence": round(conf, 4),
            "embeddingDimension": 0,
            "similarity": 0.0,
            "threshold": threshold,
            "matchedWorkerId": None,
            "finalDecision": "NO_FACE_DETECTED",
            "duplicateFound": False,
            "embedding": None
        }
    
    # FAISS Search
    top_sim, matched_id, meta = faiss_engine.search(embedding.tolist(), top_k=1)
    
    is_duplicate = (top_sim >= threshold) and (matched_id is not None)
    final_decision = "DUPLICATE" if is_duplicate else "NOT_DUPLICATE"
    
    return {
        "faceDetected": True,
        "faceDetectionConfidence": round(conf, 4),
        "embeddingDimension": EMBEDDING_DIM,
        "similarity": round(top_sim, 4),
        "threshold": threshold,
        "matchedWorkerId": matched_id if is_duplicate else None,
        "matchedWorker": meta if is_duplicate else None,
        "finalDecision": final_decision,
        "duplicateFound": is_duplicate,
        "embedding": embedding.tolist()
    }

@app.post("/sync-faiss")
@app.post("/api/face/faiss-sync")
def sync_faiss(payload: SyncFaissRequest):
    count = faiss_engine.sync([w.dict() for w in payload.workers])
    return {
        "success": True,
        "indexedVectors": faiss_engine.index.ntotal,
        "totalWorkers": count
    }

@app.post("/enroll")
@app.post("/api/face/enroll-worker")
def enroll_worker(payload: EnrollWorkerRequest):
    added = 0
    for vec in payload.embeddings:
        if isinstance(vec, list) and len(vec) == EMBEDDING_DIM:
            faiss_engine.add_worker_embedding(payload.workerId, payload.name or "", vec, payload.entityName or "")
            added += 1
    return {
        "success": True,
        "workerId": payload.workerId,
        "addedVectors": added,
        "totalFaissSize": faiss_engine.index.ntotal
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("fastapi_server:app", host="127.0.0.1", port=8000, reload=False)
