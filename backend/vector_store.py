"""
STEP 9: per-document ChromaDB collections for semantic search.

Each document gets its OWN collection, named `doc_{document_id}`, so a
similarity query can never leak results from a different document. We
compute embeddings ourselves via embedding_service (all-MiniLM-L6-v2) and
pass them in explicitly -- collections are created with embedding_function
set to Chroma's no-op, so Chroma never tries to compute its own embeddings
with a different model.
"""
from chromadb import PersistentClient
from chromadb.api import ClientAPI

CHROMA_PERSIST_DIR = "chroma_data"

_client: ClientAPI | None = None


class _NoOpEmbeddingFunction:
    """Placeholder embedding function -- we always pass embeddings explicitly,
    but Chroma requires *some* embedding_function object be associated with
    a collection, so this one simply refuses to be called."""

    def __call__(self, input):  # pragma: no cover - should never actually run
        raise RuntimeError(
            "This collection expects embeddings to be supplied explicitly "
            "(via encode()/encode_one()) -- it should never auto-embed."
        )

    def name(self) -> str:
        return "no_op"


def get_client() -> ClientAPI:
    global _client
    if _client is None:
        _client = PersistentClient(path=CHROMA_PERSIST_DIR)
    return _client


def _collection_name(document_id: str) -> str:
    return f"doc_{document_id}"


def reset_document_collection(document_id: str):
    """Deletes + recreates the collection for a document. Called every time
    the document is (re-)processed so semantic search never serves stale
    chunks from a previous version of the document."""
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


def query_similar(document_id: str, query_embedding: list[float], top_k: int = 8) -> list[dict]:
    """Real cosine-similarity search against the document's collection.
    Returns [] if the document hasn't been indexed yet (e.g. 'Segment Topics'
    was never run) rather than raising -- an empty result set, not an error."""
    client = get_client()
    name = _collection_name(document_id)
    try:
        collection = client.get_collection(name=name, embedding_function=_NoOpEmbeddingFunction())
    except Exception:
        return []
    count = collection.count()
    if count == 0:
        return []
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
