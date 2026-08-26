import os
import uuid
from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

import hierarchy_service
from config import settings
from database import db
from deps import get_current_user
from models import (
    ChunkPublic,
    DocumentDetail,
    DocumentPublic,
    NotePublic,
    TopicPublic,
    UserPublic,
    chunk_doc_to_public,
    document_doc_to_public,
    note_doc_to_public,
    topic_doc_to_public,
)
from pdf_extraction import extract_blocks_from_pdf
from preprocessing import clean_chunks, split_into_sentences
from summarization_service import is_ready as summarizer_is_ready
from summarization_service import summarize_text
from topic_segmentation import segment_topics

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentPublic, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: UserPublic = Depends(get_current_user),
):
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    file_id = uuid.uuid4().hex
    safe_filename = f"{file_id}.pdf"
    os.makedirs(settings.upload_dir, exist_ok=True)
    file_path = os.path.join(settings.upload_dir, safe_filename)

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    with open(file_path, "wb") as f:
        f.write(contents)

    document_doc = {
        "title": file.filename or "Untitled.pdf",
        "owner_id": current_user.id,
        "upload_date": datetime.now(timezone.utc),
        "total_pages": 0,
        "status": "processing",
        "file_path": file_path,
    }
    result = await db.documents.insert_one(document_doc)
    document_id = result.inserted_id

    try:
        total_pages, chunks = extract_blocks_from_pdf(file_path)
    except Exception as exc:
        await db.documents.update_one(
            {"_id": document_id}, {"$set": {"status": "failed"}}
        )
        raise HTTPException(status_code=422, detail=f"Failed to process PDF: {exc}")

    if chunks:
        chunk_docs = [
            {
                "document_id": str(document_id),
                "page_number": c["page_number"],
                "paragraph_id": c["paragraph_id"],
                "text": c["text"],
                "bounding_box": c["bounding_box"],
                "avg_font_size": c.get("avg_font_size"),
                "is_bold": c.get("is_bold", False),
            }
            for c in chunks
        ]
        await db.chunks.insert_many(chunk_docs)

    await db.documents.update_one(
        {"_id": document_id},
        {"$set": {"total_pages": total_pages, "status": "ready"}},
    )

    updated_doc = await db.documents.find_one({"_id": document_id})
    return document_doc_to_public(updated_doc)


@router.get("", response_model=list[DocumentPublic])
async def list_documents(current_user: UserPublic = Depends(get_current_user)):
    cursor = db.documents.find({"owner_id": current_user.id}).sort("upload_date", -1)
    docs = await cursor.to_list(length=1000)
    return [document_doc_to_public(d) for d in docs]


async def _get_owned_document(document_id: str, owner_id: str) -> dict:
    try:
        oid = ObjectId(document_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = await db.documents.find_one({"_id": oid})
    if not doc or doc["owner_id"] != owner_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/{document_id}", response_model=DocumentDetail)
async def get_document(document_id: str, current_user: UserPublic = Depends(get_current_user)):
    doc = await _get_owned_document(document_id, current_user.id)

    chunk_cursor = db.chunks.find({"document_id": str(doc["_id"])}).sort(
        [("page_number", 1), ("paragraph_id", 1)]
    )
    chunk_docs = await chunk_cursor.to_list(length=None)

    public = document_doc_to_public(doc)
    return DocumentDetail(**public.model_dump(), chunks=[chunk_doc_to_public(c) for c in chunk_docs])


@router.get("/{document_id}/file")
async def get_document_file(document_id: str, current_user: UserPublic = Depends(get_current_user)):
    doc = await _get_owned_document(document_id, current_user.id)
    file_path = doc["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
    return FileResponse(file_path, media_type="application/pdf", filename=doc["title"])


@router.post("/{document_id}/process", response_model=list[TopicPublic])
async def process_document(document_id: str, current_user: UserPublic = Depends(get_current_user)):
    doc = await _get_owned_document(document_id, current_user.id)

    chunk_cursor = db.chunks.find({"document_id": str(doc["_id"])}).sort(
        [("page_number", 1), ("paragraph_id", 1)]
    )
    raw_chunks = await chunk_cursor.to_list(length=None)
    if not raw_chunks:
        raise HTTPException(status_code=400, detail="Document has no extracted content to process")

    cleaned = clean_chunks(raw_chunks)

    for c in cleaned:
        c["sentences"] = split_into_sentences(c["text"])

    topic_dicts = segment_topics(cleaned)

    await db.topics.delete_many({"document_id": str(doc["_id"])})

    topic_docs = [
        {
            "document_id": str(doc["_id"]),
            "title": t["title"],
            "order_index": t["order_index"],
            "paragraph_ids": t["paragraph_ids"],
            "page_range": t["page_range"],
        }
        for t in topic_dicts
    ]

    inserted_topics = []
    if topic_docs:
        result = await db.topics.insert_many(topic_docs)
        inserted_topics = await db.topics.find(
            {"_id": {"$in": list(result.inserted_ids)}}
        ).sort("order_index", 1).to_list(length=None)

    await db.documents.update_one({"_id": doc["_id"]}, {"$set": {"status": "segmented"}})

    return [topic_doc_to_public(t) for t in inserted_topics]


@router.get("/{document_id}/topics", response_model=list[TopicPublic])
async def get_topics(document_id: str, current_user: UserPublic = Depends(get_current_user)):
    doc = await _get_owned_document(document_id, current_user.id)
    cursor = db.topics.find({"document_id": str(doc["_id"])}).sort("order_index", 1)
    topics = await cursor.to_list(length=None)
    return [topic_doc_to_public(t) for t in topics]


# --- STEP 5: paragraph-level T5 summarization ---

MIN_WORDS_FOR_SUMMARY = 8


@router.post("/{document_id}/summarize", response_model=list[NotePublic])
async def summarize_document(document_id: str, current_user: UserPublic = Depends(get_current_user)):
    if not summarizer_is_ready():
        raise HTTPException(
            status_code=503,
            detail="Summarization model is still loading. Try again in a moment.",
        )

    doc = await _get_owned_document(document_id, current_user.id)

    chunk_cursor = db.chunks.find({"document_id": str(doc["_id"])}).sort(
        [("page_number", 1), ("paragraph_id", 1)]
    )
    raw_chunks = await chunk_cursor.to_list(length=None)
    if not raw_chunks:
        raise HTTPException(status_code=400, detail="Document has no extracted content to summarize.")

    topic_cursor = db.topics.find({"document_id": str(doc["_id"])})
    topics = await topic_cursor.to_list(length=None)
    paragraph_to_topic: dict[str, str] = {}
    for t in topics:
        for pid in t["paragraph_ids"]:
            paragraph_to_topic[pid] = str(t["_id"])

    # Idempotent re-summarization: wipe previous paragraph-level notes for this doc first.
    # Also wipe any downstream roll-ups (topic/page/chapter), since they'd now be stale.
    await db.notes.delete_many(
        {"document_id": str(doc["_id"]), "level": {"$in": ["paragraph", "topic", "page", "chapter"]}}
    )

    note_docs = []
    for chunk in raw_chunks:
        text = (chunk.get("text") or "").strip()
        if len(text.split()) < MIN_WORDS_FOR_SUMMARY:
            continue

        summary = summarize_text(text, max_length=60, min_length=10)
        if not summary:
            continue

        chunk_id_str = str(chunk["_id"])
        note_docs.append(
            {
                "document_id": str(doc["_id"]),
                "level": "paragraph",
                "text": summary,
                "topic_id": paragraph_to_topic.get(chunk_id_str),
                "paragraph_id": chunk["paragraph_id"],
                "source_chunk_ids": [chunk_id_str],
                "source_pages": [chunk["page_number"]],
                "source_bounding_boxes": [chunk["bounding_box"]],
                "created_at": datetime.now(timezone.utc),
            }
        )

    inserted_notes = []
    if note_docs:
        result = await db.notes.insert_many(note_docs)
        inserted_notes = await db.notes.find(
            {"_id": {"$in": list(result.inserted_ids)}}
        ).sort([("source_pages", 1), ("paragraph_id", 1)]).to_list(length=None)

    return [note_doc_to_public(n) for n in inserted_notes]


# --- STEP 6: hierarchical roll-up (topic -> page -> chapter) ---

@router.post("/{document_id}/summarize/hierarchy", response_model=dict[str, list[NotePublic]])
async def summarize_hierarchy(document_id: str, current_user: UserPublic = Depends(get_current_user)):
    if not summarizer_is_ready():
        raise HTTPException(
            status_code=503,
            detail="Summarization model is still loading. Try again in a moment.",
        )

    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    paragraph_count = await db.notes.count_documents({"document_id": doc_id_str, "level": "paragraph"})
    if paragraph_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No paragraph-level notes found. Run POST /summarize first.",
        )

    await db.notes.delete_many({"document_id": doc_id_str, "level": {"$in": ["topic", "page", "chapter"]}})

    # 1. topic level
    topic_docs = await hierarchy_service.build_topic_notes(db, doc_id_str)
    inserted_topic_notes = []
    if topic_docs:
        result = await db.notes.insert_many(topic_docs)
        raw = await db.notes.find({"_id": {"$in": list(result.inserted_ids)}}).to_list(None)
        topics_order = {
            str(t["_id"]): t["order_index"]
            for t in await db.topics.find({"document_id": doc_id_str}).to_list(None)
        }
        raw.sort(key=lambda n: topics_order.get(n.get("topic_id"), 0))
        inserted_topic_notes = raw

    # 2. page level
    page_docs = await hierarchy_service.build_page_notes(db, doc_id_str)
    inserted_page_notes = []
    if page_docs:
        result = await db.notes.insert_many(page_docs)
        raw = await db.notes.find({"_id": {"$in": list(result.inserted_ids)}}).to_list(None)
        raw.sort(key=lambda n: n["source_pages"][0])
        inserted_page_notes = raw

    # 3. chapter level
    chapter_doc = await hierarchy_service.build_chapter_note(db, doc_id_str)
    inserted_chapter_notes = []
    if chapter_doc:
        result = await db.notes.insert_one(chapter_doc)
        inserted = await db.notes.find_one({"_id": result.inserted_id})
        inserted_chapter_notes = [inserted]

    return {
        "topic": [note_doc_to_public(n) for n in inserted_topic_notes],
        "page": [note_doc_to_public(n) for n in inserted_page_notes],
        "chapter": [note_doc_to_public(n) for n in inserted_chapter_notes],
    }


@router.get("/{document_id}/notes", response_model=list[NotePublic])
async def get_notes(
    document_id: str,
    level: Literal["paragraph", "topic", "page", "chapter"] = "paragraph",
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(document_id, current_user.id)
    cursor = db.notes.find({"document_id": str(doc["_id"]), "level": level}).sort(
        [("source_pages", 1), ("paragraph_id", 1)]
    )
    notes = await cursor.to_list(length=None)
    return [note_doc_to_public(n) for n in notes]
