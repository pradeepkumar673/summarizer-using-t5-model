"""
STEP 14: Knowledge Graph router.

POST /api/documents/{id}/graph/generate
    Builds the NetworkX graph from topics + exam essentials, serializes to
    JSON, stores in MongoDB, and returns the graph.

GET  /api/documents/{id}/graph
    Returns the stored graph JSON for a document.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import get_current_user
from graph_builder import build_graph
from models import UserPublic
from routers.documents import _get_owned_document

router = APIRouter(prefix="/api/documents", tags=["graph"])


@router.post("/{document_id}/graph/generate")
async def generate_graph(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    # Fetch topics
    topics = await db.topics.find(
        {"document_id": doc_id_str}
    ).sort("order_index", 1).to_list(length=None)

    if not topics:
        raise HTTPException(
            status_code=400,
            detail="No topics found. Run 'Segment Topics' first.",
        )

    # Fetch exam essentials
    essentials = await db.exam_essentials.find(
        {"document_id": doc_id_str}
    ).sort([("category", 1), ("source_page", 1)]).to_list(length=None)

    # Build the graph
    graph_data = build_graph(topics, essentials)

    # Store (upsert) in MongoDB
    now = datetime.now(timezone.utc)
    await db.knowledge_graphs.update_one(
        {"document_id": doc_id_str},
        {
            "$set": {
                "document_id": doc_id_str,
                "nodes": graph_data["nodes"],
                "edges": graph_data["edges"],
                "updated_at": now,
            }
        },
        upsert=True,
    )

    return graph_data


@router.get("/{document_id}/graph")
async def get_graph(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    stored = await db.knowledge_graphs.find_one({"document_id": doc_id_str})
    if not stored:
        return {"nodes": [], "edges": []}

    return {
        "nodes": stored.get("nodes", []),
        "edges": stored.get("edges", []),
    }
