"""
STEP 9: Universal search.
  - GET /api/documents/{id}/search           -- real MongoDB $text keyword
    search across raw extracted paragraph text (chunks) AND generated note
    text (including any personal edited_text), merged and ranked by score.
  - GET /api/documents/{id}/search/semantic  -- real embedding similarity
    search (sentence-transformers + ChromaDB) against a document's indexed
    paragraph chunks.
Every hit carries page/paragraph/bounding-box references so the frontend
can click straight back into the workspace and reuse Step 7's highlighting.
"""
from typing import Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import db
from deps import get_current_user
from embedding_service import encode_one
from embedding_service import is_ready as embedder_is_ready
from models import BoundingBox, UserPublic
from routers.documents import _get_owned_document
from vector_store import query_similar

router = APIRouter(prefix="/api/documents", tags=["search"])


class SearchResult(BaseModel):
    source_type: Literal["chunk", "note"]
    chunk_id: str | None = None
    note_id: str | None = None
    note_level: Literal["paragraph", "topic", "page", "chapter"] | None = None
    page_number: int
    paragraph_id: int | None = None
    text: str
    bounding_box: BoundingBox | None = None
    score: float


@router.get("/{document_id}/search", response_model=list[SearchResult])
async def keyword_search(
    document_id: str,
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: UserPublic = Depends(get_current_user),
):
    """Real MongoDB text-index search. Requires the text indexes created at
    startup (main.py) on chunks.text and notes.text/edited_text."""
    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    results: list[SearchResult] = []

    chunk_cursor = (
        db.chunks.find(
            {"document_id": doc_id_str, "$text": {"$search": q}},
            {"score": {"$meta": "textScore"}},
        )
        .sort([("score", {"$meta": "textScore"})])
        .limit(limit)
    )
    async for c in chunk_cursor:
        results.append(
            SearchResult(
                source_type="chunk",
                chunk_id=str(c["_id"]),
                page_number=c["page_number"],
                paragraph_id=c["paragraph_id"],
                text=c["text"],
                bounding_box=BoundingBox(**c["bounding_box"]),
                score=round(c.get("score", 0.0), 4),
            )
        )

    note_cursor = (
        db.notes.find(
            {
                "document_id": doc_id_str,
                "user_id": current_user.id,
                "$text": {"$search": q},
            },
            {"score": {"$meta": "textScore"}},
        )
        .sort([("score", {"$meta": "textScore"})])
        .limit(limit)
    )
    async for n in note_cursor:
        page_number = n["source_pages"][0] if n.get("source_pages") else 0
        bbox = n["source_bounding_boxes"][0] if n.get("source_bounding_boxes") else None
        results.append(
            SearchResult(
                source_type="note",
                note_id=str(n["_id"]),
                note_level=n["level"],
                page_number=page_number,
                paragraph_id=n.get("paragraph_id"),
                text=n.get("edited_text") or n["text"],
                bounding_box=BoundingBox(**bbox) if bbox else None,
                score=round(n.get("score", 0.0), 4),
            )
        )

    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]


@router.get("/{document_id}/search/semantic", response_model=list[SearchResult])
async def semantic_search(
    document_id: str,
    q: str = Query(..., min_length=1),
    top_k: int = Query(8, ge=1, le=50),
    current_user: UserPublic = Depends(get_current_user),
):
    """Real embedding-based similarity search -- embeds the query with the
    same sentence-transformers model used at indexing time, then queries the
    document's ChromaDB collection for nearest neighbours."""
    if not embedder_is_ready():
        raise HTTPException(
            status_code=503,
            detail="Embedding model is still loading. Try again in a moment.",
        )
    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    query_embedding = encode_one(q)
    hits = query_similar(doc_id_str, query_embedding, top_k=top_k)
    if not hits:
        return []

    object_ids = []
    for h in hits:
        try:
            object_ids.append(ObjectId(h["chunk_id"]))
        except InvalidId:
            continue
    chunk_docs = await db.chunks.find({"_id": {"$in": object_ids}}).to_list(length=None)
    bbox_by_id = {str(c["_id"]): c["bounding_box"] for c in chunk_docs}

    results = []
    for h in hits:
        bbox = bbox_by_id.get(h["chunk_id"])
        results.append(
            SearchResult(
                source_type="chunk",
                chunk_id=h["chunk_id"],
                page_number=h["page_number"],
                paragraph_id=h["paragraph_id"],
                text=h["text"],
                bounding_box=BoundingBox(**bbox) if bbox else None,
                score=h["score"],
            )
        )
    return results
