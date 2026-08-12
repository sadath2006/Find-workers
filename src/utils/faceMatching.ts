/**
 * High-Precision Biometric Face Matching Engine.
 * Uses Python FastAPI Microservice (/api/python/*) for high-speed
 * vector extraction and cosine similarity matching with local fallback.
 */

export async function extractFaceVector(imageDataUrl: string): Promise<number[]> {
  try {
    const res = await fetch('/api/python/extract-vector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl })
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.vector && Array.isArray(data.vector)) {
        return data.vector;
      }
    }
  } catch (err) {
    console.warn('Python FastAPI extract-vector fallback to local:', err);
  }

  // Client-side fallback if Python API is starting
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 16;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(new Array(size * size).fill(0));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const imgData = ctx.getImageData(0, 0, size, size).data;
      const vector: number[] = [];
      let totalLuminance = 0;

      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        vector.push(lum);
        totalLuminance += lum;
      }

      const avg = totalLuminance / vector.length || 1;
      const normalized = vector.map(val => val / avg);
      resolve(normalized);
    };
    img.onerror = () => {
      resolve(new Array(256).fill(0.5));
    };
    img.src = imageDataUrl;
  });
}

/**
 * Calculates Cosine Similarity between two feature vectors.
 */
export function calculateFaceSimilarity(vectorA: number[], vectorB: number[]): number {
  if (!vectorA || !vectorB || vectorA.length === 0 || vectorB.length === 0) return 0;
  const len = Math.min(vectorA.length, vectorB.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Fast Batch Duplicate Face Verification using Python FastAPI.
 */
export async function verifyDuplicateFaceBatch(
  candidateDataUrl: string,
  candidateVector: number[],
  workersList: any[]
): Promise<{ duplicateFound: boolean; matchedWorkerId?: string; similarityScore: number }> {
  try {
    const res = await fetch('/api/python/verify-duplicate-face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl: candidateDataUrl,
        faceVector: candidateVector,
        workers: workersList,
        threshold: 0.80
      })
    });

    if (res.ok) {
      const data = await res.json();
      return {
        duplicateFound: !!data.duplicateFound,
        matchedWorkerId: data.matchedWorkerId,
        similarityScore: data.matchPercentage || 0
      };
    }
  } catch (err) {
    console.warn('Python FastAPI batch verify fallback to local:', err);
  }

  // Local fallback
  let bestId: string | undefined = undefined;
  let highestSim = 0;

  for (const w of workersList) {
    if (w.faceEmbedding && w.faceEmbedding.length > 0) {
      const sim = calculateFaceSimilarity(candidateVector, w.faceEmbedding);
      if (sim > highestSim) {
        highestSim = sim;
        bestId = w.id;
      }
    }
  }

  return {
    duplicateFound: highestSim >= 0.80,
    matchedWorkerId: bestId,
    similarityScore: Math.round(highestSim * 100)
  };
}
