import os
import httpx
import numpy as np
import faiss

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
DIM = 768

_OLLAMA_AVAILABLE: bool | None = None


def _check_ollama() -> bool:
    global _OLLAMA_AVAILABLE
    if _OLLAMA_AVAILABLE is not None:
        return _OLLAMA_AVAILABLE
    try:
        r = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=2.0)
        _OLLAMA_AVAILABLE = r.status_code == 200
    except Exception:
        _OLLAMA_AVAILABLE = False
    if not _OLLAMA_AVAILABLE:
        print(
            f"NOTE: Ollama not reachable at {OLLAMA_URL}. Jobs will be returned "
            "unranked. Start Ollama and pull '{MODEL}' to enable AI ranking."
        )
    return _OLLAMA_AVAILABLE


def embed(text: str) -> np.ndarray:
    if not _check_ollama():
        return np.zeros(DIM, dtype="float32")

    text = " ".join(text.split())[:2000]
    text = text.encode("ascii", errors="ignore").decode()

    try:
        r = httpx.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": MODEL, "prompt": text},
            timeout=60,
        )
        data = r.json()
        if "embedding" not in data:
            return np.zeros(DIM, dtype="float32")
        vec = np.array(data["embedding"], dtype="float32")
        if vec.shape[0] != DIM:
            return np.zeros(DIM, dtype="float32")
        faiss.normalize_L2(vec.reshape(1, -1))
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