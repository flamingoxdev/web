import httpx
import numpy as np
import faiss

OLLAMA_URL = "http://localhost:11434"
MODEL = "nomic-embed-text"
DIM = 768

def embed(text: str) -> np.ndarray:
    # Clean and truncate aggressively
    text = " ".join(text.split())  # normalize whitespace
    text = text[:2000]             # hard limit
    text = text.encode("ascii", errors="ignore").decode()  # strip non-ascii
    
    try:
        r = httpx.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": MODEL, "prompt": text},
            timeout=120
        )
        data = r.json()
        if "embedding" not in data:
            print(f"No embedding in response: {data}")
            return np.zeros(DIM, dtype="float32")
        vec = np.array(data["embedding"], dtype="float32")
        if vec.shape[0] != DIM:
            print(f"Wrong dim: {vec.shape}, returning zeros")
            return np.zeros(DIM, dtype="float32")
        faiss.normalize_L2(vec.reshape(1, -1))
        print(f"Embedding dim: {vec.shape}")
        return vec
    except Exception as e:
        print(f"Embedding error: {e}")
        return np.zeros(DIM, dtype="float32")

def build_index(vectors: list[np.ndarray]) -> faiss.IndexFlatIP:
    index = faiss.IndexFlatIP(DIM)
    matrix = np.vstack(vectors).astype("float32")
    index.add(matrix)
    return index

def search(index: faiss.IndexFlatIP, query_vec: np.ndarray, k: int):
    k = min(k, index.ntotal)
    # Reshape and ensure correct dimension
    query_vec = query_vec.flatten()[:DIM].reshape(1, -1)
    scores, indices = index.search(query_vec, k)
    return indices[0], scores[0]