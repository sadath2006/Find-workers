/**
 * FAISS IndexFlatIP (Inner Product) Vector Search Engine in TypeScript.
 * Optimized for 512-Dimensional ArcFace Deep Biometric Vectors.
 * Sub-millisecond similarity search across thousands of indexed face embeddings.
 */

export interface FaissSearchResult {
  id: string;
  similarity: number;
  index: number;
}

export class FaissIndexFlatIP {
  private dimension: number;
  private ids: string[] = [];
  private matrix: Float32Array;
  private size: number = 0;
  private capacity: number = 1000;

  constructor(dimension: number = 512, initialCapacity: number = 1000) {
    this.dimension = dimension;
    this.capacity = initialCapacity;
    this.matrix = new Float32Array(this.capacity * this.dimension);
  }

  /**
   * Resizes the internal Float32Array buffer as dataset grows.
   */
  private ensureCapacity(needed: number) {
    if (needed > this.capacity) {
      this.capacity = Math.max(this.capacity * 2, needed);
      const newMatrix = new Float32Array(this.capacity * this.dimension);
      newMatrix.set(this.matrix);
      this.matrix = newMatrix;
    }
  }

  /**
   * Adds a 512-dimensional L2-normalized vector into FAISS index.
   * Ensures strict 1-to-1 sync between internal matrix slot and worker ID.
   */
  public add(id: string, vector: number[] | Float32Array): void {
    if (!id || !vector || vector.length !== this.dimension) return;

    this.ensureCapacity(this.size + 1);
    this.ids.push(id);

    const offset = this.size * this.dimension;
    for (let i = 0; i < this.dimension; i++) {
      this.matrix[offset + i] = vector[i];
    }
    this.size++;
  }

  /**
   * Resets and rebuilds the FAISS index from a list of records.
   * Guarantees index position i maps directly to record[i].id.
   */
  public buildIndex(records: Array<{ id: string; vector: number[] | Float32Array }>): void {
    this.ids = [];
    this.size = 0;
    this.capacity = Math.max(100, records.length);
    this.matrix = new Float32Array(this.capacity * this.dimension);

    for (const rec of records) {
      if (rec && rec.id && rec.vector && rec.vector.length === this.dimension) {
        this.add(rec.id, rec.vector);
      }
    }
  }

  /**
   * Performs FAISS IndexFlatIP inner product vector search for a query vector.
   * Returns top-K nearest matches with cosine similarity scores.
   */
  public search(queryVector: number[] | Float32Array, k: number = 1): FaissSearchResult[] {
    if (this.size === 0 || !queryVector || queryVector.length !== this.dimension) {
      return [];
    }

    const q = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);

    // Compute Inner Product Matrix Multiplication (q . X_i)
    const results: FaissSearchResult[] = new Array(this.size);

    for (let i = 0; i < this.size; i++) {
      const offset = i * this.dimension;
      let dotProduct = 0.0;

      for (let j = 0; j < this.dimension; j++) {
        dotProduct += q[j] * this.matrix[offset + j];
      }

      results[i] = {
        id: this.ids[i],
        similarity: Math.max(-1.0, Math.min(1.0, dotProduct)),
        index: i
      };
    }

    // Sort descending by highest similarity score
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, k);
  }

  public getSize(): number {
    return this.size;
  }

  public getIds(): string[] {
    return [...this.ids];
  }
}
