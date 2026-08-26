import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from bson import ObjectId
from bson.errors import InvalidId

from database import db
from config import settings
from deps import get_current_user
from models import (
    UserPublic,
    DocumentPublic,
    DocumentDetail,
    TopicPublic,
    NotePublic,
    document_doc_to_public,
    chunk_doc_to_public,
    topic_doc_to_public,
    note_doc_to_public,
)
from pdf_extraction import extract_blocks_from_pdf
from preprocessing import clean_chunks, split_into_sentences
from topic_segmentation import segment_topics
from summarization_service import is_ready as summarizer_is_ready, summarize_text

router = APIRouter(prefix="/api/documents", tags=["documents"])

os.makedirs(settings.upload_dir, exist_ok=True)


@router.post("/upload", response_model=DocumentPublic, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: UserPublic = Depends(get_current_user),
):
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    file_id = uuid.uuid4().hex
    safe_filename = f"{file_id}.pdf"
    file_path = os.path.join(settings.upload_dir, safe_filename)

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    with open(file_path, "wb") as f:
        f.write(contents)

    document_doc = {
        "title": file.filename,
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
    except InvalidId:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = await db.documents.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc["owner_id"] != owner_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this document")
    return doc


@router.get("/{document_id}", response_model=DocumentDetail)
async def get_document(document_id: str, current_user: UserPublic = Depends(get_current_user)):
    doc = await _get_owned_document(document_id, current_user.id)

    chunk_cursor = db.chunks.find({"document_id": str(doc["_id"])}).sort(
        [("page_number", 1), ("paragraph_id", 1)]
    )
    chunk_docs = await chunk_cursor.to_list(length=None)

    public = document_doc_to_public(doc)
    return DocumentDetail(
        **public.model_dump(),
        chunks=[chunk_doc_to_public(c) for c in chunk_docs],
    )


@router.get("/{document_id}/file")
async def get_document_file(document_id: str, current_user: UserPublic = Depends(get_current_user)):
    doc = await _get_owned_document(document_id, current_user.id)
    file_path = doc["file_path"]

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=doc["title"],
    )


@router.post("/{document_id}/process", response_model=list[TopicPublic])
async def process_document(document_id: str, current_user: UserPublic = Depends(get_current_user)):
    doc = await _get_owned_document(document_id, current_user.id)

    if doc["status"] not in ("ready", "segmented"):
        raise HTTPException(
            status_code=400,
            detail=f"Document is not ready for processing (status: {doc['status']})",
        )

    chunk_cursor = db.chunks.find({"document_id": str(doc["_id"])}).sort(
        [("page_number", 1), ("paragraph_id", 1)]
    )
    raw_chunks = await chunk_cursor.to_list(length=None)

    if not raw_chunks:
        raise HTTPException(status_code=400, detail="No extracted text found for this document")

    # 1. Preprocessing: strip page-number noise + repeated headers/footers, normalize whitespace
    cleaned = clean_chunks(raw_chunks)

    # 2. Real spaCy sentence segmentation per block (kept for downstream summarization
    #    steps; topic segmentation itself groups at block level to preserve bbox traceability)
    for c in cleaned:
        c["sentences"] = split_into_sentences(c["text"])

    # 3. Topic segmentation via font-size/bold heuristics + text-pattern fallback
    topic_dicts = segment_topics(cleaned)

    if not topic_dicts:
        raise HTTPException(status_code=422, detail="Topic segmentation produced no topics")

    # Idempotent re-processing: wipe any previous topics for this document first
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
    result = await db.topics.insert_many(topic_docs)

    await db.documents.update_one({"_id": doc["_id"]}, {"$set": {"status": "segmented"}})

    inserted_topics = await db.topics.find(
        {"_id": {"$in": result.inserted_ids}}
    ).sort("order_index", 1).to_list(length=None)
    return [topic_doc_to_public(t) for t in inserted_topics]


@router.get("/{document_id}/topics", response_model=list[TopicPublic])
async def get_topics(document_id: str, current_user: UserPublic = Depends(get_current_user)):
    doc = await _get_owned_document(document_id, current_user.id)
    cursor = db.topics.find({"document_id": str(doc["_id"])}).sort("order_index", 1)
    topics = await cursor.to_list(length=None)
    return [topic_doc_to_public(t) for t in topics]


# --- STEP 5: paragraph-level T5 summarization ---

MIN_WORDS_FOR_SUMMARY = 8  # skip lone headings / page-artifact blocks - nothing to summarize


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

    # Build a chunk-_id -> topic-_id lookup so each Note can be linked back to its topic
    topic_cursor = db.topics.find({"document_id": str(doc["_id"])})
    topics = await topic_cursor.to_list(length=None)
    paragraph_to_topic: dict[str, str] = {}
    for t in topics:
        for pid in t["paragraph_ids"]:
            paragraph_to_topic[pid] = str(t["_id"])

    # Idempotent re-summarization: wipe previous paragraph-level notes for this doc first
    await db.notes.delete_many({"document_id": str(doc["_id"]), "level": "paragraph"})

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
                "topic_id": paragraph_to_topic.get(chunk_id_str),
                "paragraph_id": chunk["paragraph_id"],
                "level": "paragraph",
                "text": summary,
                "source_page": chunk["page_number"],
                "source_bounding_box": chunk["bounding_box"],
                "created_at": datetime.now(timezone.utc),
            }
        )

    inserted_notes = []
    if note_docs:
        result = await db.notes.insert_many(note_docs)
        inserted_notes = await db.notes.find(
            {"_id": {"$in": list(result.inserted_ids)}}
        ).sort([("source_page", 1), ("paragraph_id", 1)]).to_list(length=None)

    return [note_doc_to_public(n) for n in inserted_notes]


@router.get("/{document_id}/notes", response_model=list[NotePublic])
async def get_notes(
    document_id: str,
    level: str = "paragraph",
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(document_id, current_user.id)
    cursor = db.notes.find({"document_id": str(doc["_id"]), "level": level}).sort(
        [("source_page", 1), ("paragraph_id", 1)]
    )
    notes = await cursor.to_list(length=None)
    return [note_doc_to_public(n) for n in notes]
