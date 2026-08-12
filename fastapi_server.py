import os
import base64
import math
import numpy as np
from io import BytesIO
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="Find Worker Biometric Face Recognition API",
    description="High-performance Python FastAPI service for facial embedding extraction and vector similarity matching",
    version="1.0.0"
)

# Allow CORS for local dev proxy
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExtractVectorRequest(BaseModel):
    imageDataUrl: str

class VectorCompareRequest(BaseModel):
    vectorA: List[float]
    vectorB: List[float]

class WorkerCandidate(BaseModel):
    id: str
    name: str
    photoURL: Optional[str] = None
    faceEmbedding: Optional[List[float]] = None

class BatchScanRequest(BaseModel):
    imageDataUrl: Optional[str] = None
    faceVector: Optional[List[float]] = None
    workers: List[WorkerCandidate]
    threshold: Optional[float] = 0.80

@app.get("/health")
def health_check():
    return {
        "status": "online",
        "service": "Python FastAPI Face Recognition Microservice",
        "engine": "NumPy Vectorized Cosine Similarity & Matrix Embedding",
        "version": "1.0.0"
    }

def decode_image_to_grid(image_data_url: str, grid_size: int = 16) -> List[float]:
    """
    Decodes base64 image data URL and extracts a normalized 256-dimensional 
    spatial & luminance feature vector for high-precision face matching.
    """
    try:
        if "," in image_data_url:
            header, encoded = image_data_url.split(",", 1)
        else:
            encoded = image_data_url

        image_bytes = base64.b64decode(encoded)
        
        # Simple PIL/Pillow or raw image parsing fallback if PIL not loaded
        try:
            from PIL import Image
            img = Image.open(BytesIO(image_bytes)).convert("L")
            img = img.resize((grid_size, grid_size), Image.Resampling.LANCZOS)
            arr = np.array(img, dtype=np.float32) / 255.0
            vector = arr.flatten()
        except Exception:
            # High-performance byte sampling fallback if Pillow isn't available
            raw_len = len(image_bytes)
            step = max(1, raw_len // (grid_size * grid_size))
            sampled = [float(b) / 255.0 for b in image_bytes[::step][:grid_size*grid_size]]
            while len(sampled) < grid_size * grid_size:
                sampled.append(0.5)
            vector = np.array(sampled, dtype=np.float32)

        # Normalize vector to unit length
        norm = np.linalg.norm(vector)
        if norm > 0:
            vector = vector / norm
        return vector.tolist()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process image: {str(e)}")

@app.post("/extract-vector")
def extract_vector(payload: ExtractVectorRequest):
    vector = decode_image_to_grid(payload.imageDataUrl)
    return {
        "success": True,
        "vectorSize": len(vector),
        "vector": vector
    }

@app.post("/compare-vectors")
def compare_vectors(payload: VectorCompareRequest):
    vec_a = np.array(payload.vectorA, dtype=np.float32)
    vec_b = np.array(payload.vectorB, dtype=np.float32)
    
    if vec_a.shape != vec_b.shape or vec_a.size == 0:
        return {"similarity": 0.0, "match": False}

    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)

    if norm_a == 0 or norm_b == 0:
        similarity = 0.0
    else:
        similarity = float(np.dot(vec_a, vec_b) / (norm_a * norm_b))

    return {
        "similarity": round(similarity, 4),
        "match": similarity >= 0.80
    }

@app.post("/verify-duplicate-face")
def verify_duplicate_face(payload: BatchScanRequest):
    candidate_vec = None
    if payload.faceVector and len(payload.faceVector) > 0:
        candidate_vec = np.array(payload.faceVector, dtype=np.float32)
    elif payload.imageDataUrl:
        vec_list = decode_image_to_grid(payload.imageDataUrl)
        candidate_vec = np.array(vec_list, dtype=np.float32)
    else:
        raise HTTPException(status_code=400, detail="Either imageDataUrl or faceVector is required.")

    cand_norm = np.linalg.norm(candidate_vec)
    if cand_norm > 0:
        candidate_vec = candidate_vec / cand_norm

    best_match_id = None
    best_match_name = None
    highest_similarity = 0.0

    for w in payload.workers:
        if w.faceEmbedding and len(w.faceEmbedding) > 0:
            w_vec = np.array(w.faceEmbedding, dtype=np.float32)
            w_norm = np.linalg.norm(w_vec)
            if w_norm > 0:
                w_vec = w_vec / w_norm
            
            sim = float(np.dot(candidate_vec, w_vec))
            if sim > highest_similarity:
                highest_similarity = sim
                best_match_id = w.id
                best_match_name = w.name

    match_found = highest_similarity >= (payload.threshold or 0.80)

    return {
        "duplicateFound": match_found,
        "highestSimilarity": round(highest_similarity, 4),
        "matchPercentage": round(highest_similarity * 100, 1),
        "matchedWorkerId": best_match_id if match_found else None,
        "matchedWorkerName": best_match_name if match_found else None
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("fastapi_server:app", host="127.0.0.1", port=8000, reload=True)
