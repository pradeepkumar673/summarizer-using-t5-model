"""
STEP 10: Exam Essentials router.

POST /api/documents/{id}/exam-essentials/generate
    Runs key_info_extractor over the document's chunks, stores results in the
    `exam_essentials` MongoDB collection, and returns grouped results.

GET  /api/documents/{id}/exam-essentials
    Returns all ExamEssential entries for a document, grouped by category.
"""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import get_current_user
from exam_models import ALL_CATEGORIES, ExamEssentialPublic, exam_doc_to_public
from key_info_extractor import extract_from_chunks
from models import UserPublic
from routers.documents import _get_owned_document

router = APIRouter(prefix="/api/documents", tags=["exam-essentials"])


@router.post(
    "/{document_id}/exam-essentials/generate",
    response_model=dict[str, list[ExamEssentialPublic]],
)
async def generate_exam_essentials(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Run the spaCy key-information extractor on every extracted chunk for
    this document. Previous results are replaced atomically.
    """
    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    chunk_cursor = db.chunks.find({"document_id": doc_id_str}).sort(
        [("page_number", 1), ("paragraph_id", 1)]
    )
    raw_chunks = await chunk_cursor.to_list(length=None)
    if not raw_chunks:
        raise HTTPException(
            status_code=400,
            detail="Document has no extracted text. Upload and process the PDF first.",
        )

    # Run extractor (CPU-bound but typically fast for moderate docs)
    extracted = extract_from_chunks(raw_chunks)

    # Clear previous results and persist new ones
    await db.exam_essentials.delete_many({"document_id": doc_id_str})

    now = datetime.now(timezone.utc)
    docs_to_insert = [
        {
            "document_id": doc_id_str,
            "category": e["category"],
            "text": e["text"],
            "source_page": e["source_page"],
            "source_bounding_box": e["source_bounding_box"],
            "created_at": now,
        }
        for e in extracted
    ]

    inserted_ids: list[ObjectId] = []
    if docs_to_insert:
        result = await db.exam_essentials.insert_many(docs_to_insert)
        inserted_ids = list(result.inserted_ids)

    inserted = []
    if inserted_ids:
        inserted = await db.exam_essentials.find(
            {"_id": {"$in": inserted_ids}}
        ).sort([("category", 1), ("source_page", 1)]).to_list(length=None)

    return _group_by_category([exam_doc_to_public(d) for d in inserted])


@router.get(
    "/{document_id}/exam-essentials",
    response_model=dict[str, list[ExamEssentialPublic]],
)
async def get_exam_essentials(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Return all stored ExamEssential entries for a document, grouped by category.
    """
    doc = await _get_owned_document(document_id, current_user.id)
    cursor = db.exam_essentials.find({"document_id": str(doc["_id"])}).sort(
        [("category", 1), ("source_page", 1)]
    )
    docs = await cursor.to_list(length=None)
    return _group_by_category([exam_doc_to_public(d) for d in docs])


def _group_by_category(
    items: list[ExamEssentialPublic],
) -> dict[str, list[ExamEssentialPublic]]:
    """Return a dict with every category key present (even if the list is empty)."""
    grouped: dict[str, list[ExamEssentialPublic]] = {cat: [] for cat in ALL_CATEGORIES}
    for item in items:
        grouped[item.category].append(item)
    return grouped
