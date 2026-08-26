"""
STEP 9: per-document vector store for semantic search.

Supports ChromaDB if installed, or falls back to a clean, fast NumPy /
Scikit-Learn cosine-similarity store persisted in `chroma_data/` so that
semantic search works out-of-the-box on all platforms without requiring C++
compilation.
"""
import json
import logging
import os
from typing import Any

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

CHROMA_PERSIST_DIR = "chroma_data"

try:
    from chromadb import PersistentClient
    HAS_CHROMADB = True
except Exception:
    HAS_CHROMADB = False

if HAS_CHROMADB:
    _client: Any | None = None

    class _NoOpEmbeddingFunction:
        def __call__(self, input):
            raise RuntimeError(
                "This collection expects embeddings to be supplied explicitly "
                "(via encode()/encode_one()) -- it should never auto-embed."
            )

        def name(self) -> str:
            return "no_op"

    def get_client() -> Any:
        global _client
        if _client is None:
            _client = PersistentClient(path=CHROMA_PERSIST_DIR)
        return _client

    def _collection_name(document_id: str) -> str:
        return f"doc_{document_id}"

    def reset_document_collection(document_id: str):
        client = get_client()
        name = _collection_name(document_id)
        try:
            client.delete_collection(name)
        except Exception:
            pass
        return client.create_collection(
            name=name,
            embedding_function=_NoOpEmbeddingFunction(),
            metadata={"hnsw:space": "cosine"},
        )


def index_chunks(document_id: str, chunks: list[dict], embeddings: list[list[float]]) -> None:
    """
    chunks: dicts with at least _id, page_number, paragraph_id, text.
    embeddings: parallel list of vectors, same order/length as chunks.
    """
    if not chunks:
        return

    if HAS_CHROMADB:
        try:
            collection = reset_document_collection(document_id)
            ids = [str(c["_id"]) for c in chunks]
            documents = [c["text"] for c in chunks]
            metadatas = [
                {
                    "page_number": c["page_number"],
                    "paragraph_id": c["paragraph_id"],
                }
                for c in chunks
            ]
            collection.add(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)
            return
        except Exception as e:
            logger.warning(f"ChromaDB index failed, falling back to NumPy store: {e}")

    # NumPy / Scikit-Learn fallback vector store
    os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
    file_path = os.path.join(CHROMA_PERSIST_DIR, f"doc_{document_id}.json")
    data = {
        "chunks": [
            {
                "chunk_id": str(c["_id"]),
                "page_number": c["page_number"],
                "paragraph_id": c["paragraph_id"],
                "text": c["text"],
            }
            for c in chunks
        ],
        "embeddings": embeddings,
    }
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def query_similar(document_id: str, query_embedding: list[float], top_k: int = 8) -> list[dict]:
    """Real cosine-similarity search against the document's collection."""
    if HAS_CHROMADB:
        try:
            client = get_client()
            name = _collection_name(document_id)
            collection = client.get_collection(name=name, embedding_function=_NoOpEmbeddingFunction())
            count = collection.count()
            if count > 0:
                result = collection.query(
                    query_embeddings=[query_embedding],
                    n_results=min(top_k, count),
                    include=["documents", "metadatas", "distances"],
                )
                hits = []
                ids = result.get("ids", [[]])[0]
                docs = result.get("documents", [[]])[0]
                metas = result.get("metadatas", [[]])[0]
                dists = result.get("distances", [[]])[0]
                for i in range(len(ids)):
                    similarity = 1.0 - dists[i]
                    hits.append(
                        {
                            "chunk_id": ids[i],
                            "text": docs[i],
                            "page_number": metas[i]["page_number"],
                            "paragraph_id": metas[i]["paragraph_id"],
                            "score": round(float(similarity), 4),
                        }
                    )
                return hits
        except Exception:
            pass

    # NumPy / Scikit-Learn fallback store reader
    file_path = os.path.join(CHROMA_PERSIST_DIR, f"doc_{document_id}.json")
    if not os.path.exists(file_path):
        return []

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    chunks = data.get("chunks", [])
    embeddings = data.get("embeddings", [])
    if not chunks or not embeddings:
        return []

    matrix = np.array(embeddings)
    q_vec = np.array([query_embedding])
    sims = cosine_similarity(q_vec, matrix)[0]

    top_indices = np.argsort(sims)[::-1][:top_k]
    hits = []
    for idx in top_indices:
        c = chunks[idx]
        hits.append(
            {
                "chunk_id": c["chunk_id"],
                "text": c["text"],
                "page_number": c["page_number"],
                "paragraph_id": c["paragraph_id"],
                "score": round(float(sims[idx]), 4),
            }
        )
    return hits
