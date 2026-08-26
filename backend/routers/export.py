"""
STEP 11: Export router.

GET /api/documents/{id}/export/markdown
    Returns a real .md file download containing the user's notebook
    (pinned/edited notes) and Exam Essentials, organised by topic.

GET /api/documents/{id}/export/pdf
    Returns a real .pdf file download of the same content, generated
    with reportlab (Platypus), with headings, bullet points, and page refs.
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from database import db
from deps import get_current_user
from exam_models import ALL_CATEGORIES
from export_service import build_markdown, build_pdf
from models import UserPublic
from routers.documents import _get_owned_document

router = APIRouter(prefix="/api/documents", tags=["export"])


def _safe_filename(title: str) -> str:
    """Strip characters that are invalid in filenames."""
    clean = re.sub(r'[\\/:*?"<>|]', "_", title)
    clean = re.sub(r"\s+", "_", clean.strip())
    return clean[:80] or "document"


async def _gather_export_data(document_id: str, user_id: str) -> tuple[dict, list, list, dict]:
    """
    Returns (doc, topics, notebook_notes, exam_essentials_dict).
    All DB fetches run concurrently-ish via sequential awaits (Motor is
    async; each call is non-blocking while the event loop processes others).
    """
    doc_cursor = db.documents.find_one({"_id": (await db.documents.find_one({"_id": None}))})  # dummy
    # Use the already-written helper instead
    from bson import ObjectId
    oid = ObjectId(document_id)
    doc = await db.documents.find_one({"_id": oid})

    topics = await db.topics.find(
        {"document_id": document_id}
    ).sort("order_index", 1).to_list(length=None)

    notebook_notes = await db.notes.find(
        {
            "document_id": document_id,
            "user_id": user_id,
            "$or": [{"is_pinned": True}, {"edited_text": {"$nin": [None, ""]}}],
        }
    ).sort([("source_pages", 1), ("paragraph_id", 1)]).to_list(length=None)

    raw_essentials = await db.exam_essentials.find(
        {"document_id": document_id}
    ).sort([("category", 1), ("source_page", 1)]).to_list(length=None)

    exam_dict: dict[str, list] = {cat: [] for cat in ALL_CATEGORIES}
    for e in raw_essentials:
        cat = e.get("category")
        if cat in exam_dict:
            exam_dict[cat].append(e)

    return doc, topics, notebook_notes, exam_dict


@router.get("/{document_id}/export/markdown")
async def export_markdown(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    topics = await db.topics.find(
        {"document_id": doc_id_str}
    ).sort("order_index", 1).to_list(length=None)

    notebook_notes = await db.notes.find(
        {
            "document_id": doc_id_str,
            "user_id": current_user.id,
            "$or": [{"is_pinned": True}, {"edited_text": {"$nin": [None, ""]}}],
        }
    ).sort([("source_pages", 1), ("paragraph_id", 1)]).to_list(length=None)

    raw_essentials = await db.exam_essentials.find(
        {"document_id": doc_id_str}
    ).sort([("category", 1), ("source_page", 1)]).to_list(length=None)

    exam_dict: dict[str, list] = {cat: [] for cat in ALL_CATEGORIES}
    for e in raw_essentials:
        cat = e.get("category")
        if cat in exam_dict:
            exam_dict[cat].append(e)

    md_text = build_markdown(
        doc_title=doc["title"],
        topics=topics,
        notebook_notes=notebook_notes,
        exam_essentials=exam_dict,
    )

    filename = _safe_filename(doc["title"]) + ".md"
    return Response(
        content=md_text.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get("/{document_id}/export/pdf")
async def export_pdf(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    topics = await db.topics.find(
        {"document_id": doc_id_str}
    ).sort("order_index", 1).to_list(length=None)

    notebook_notes = await db.notes.find(
        {
            "document_id": doc_id_str,
            "user_id": current_user.id,
            "$or": [{"is_pinned": True}, {"edited_text": {"$nin": [None, ""]}}],
        }
    ).sort([("source_pages", 1), ("paragraph_id", 1)]).to_list(length=None)

    raw_essentials = await db.exam_essentials.find(
        {"document_id": doc_id_str}
    ).sort([("category", 1), ("source_page", 1)]).to_list(length=None)

    exam_dict: dict[str, list] = {cat: [] for cat in ALL_CATEGORIES}
    for e in raw_essentials:
        cat = e.get("category")
        if cat in exam_dict:
            exam_dict[cat].append(e)

    pdf_bytes = build_pdf(
        doc_title=doc["title"],
        topics=topics,
        notebook_notes=notebook_notes,
        exam_essentials=exam_dict,
    )

    filename = _safe_filename(doc["title"]) + ".pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
