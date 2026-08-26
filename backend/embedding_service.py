"""
STEP 9: sentence-transformer embedding service.
Loads all-MiniLM-L6-v2 ONCE at startup (mirrors summarization_service's
load_model()/is_ready() pattern) and exposes encode()/encode_one() so both
indexing (chunk text, at process-time) and querying (a user's search box)
go through the exact same model -- required for cosine similarity in
ChromaDB to mean anything.
"""
import logging

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

MODEL_NAME = "all-MiniLM-L6-v2"

_model: SentenceTransformer | None = None


def load_model() -> None:
    """Loads the embedding model once per process. Safe to call multiple times."""
    global _model
    if _model is not None:
        return
    print(f"[embedding_service] Loading '{MODEL_NAME}'...")
    _model = SentenceTransformer(MODEL_NAME)
    print("[embedding_service] Embedding model loaded and ready.")


def is_ready() -> bool:
    return _model is not None


def encode(texts: list[str]) -> list[list[float]]:
    """Real sentence-transformer inference -- returns one embedding vector per text."""
    if not is_ready():
        raise RuntimeError("Embedding model is not loaded yet. Call load_model() first.")
    if not texts:
        return []
    vectors = _model.encode(texts, convert_to_numpy=True, show_progress_bar=False, normalize_embeddings=True)
    return vectors.tolist()


def encode_one(text: str) -> list[float]:
    return encode([text])[0]
