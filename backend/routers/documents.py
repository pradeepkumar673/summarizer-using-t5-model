import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, Request, Query
from fastapi.responses import FileResponse

import hierarchy_service
from config import settings
from database import db
from deps import get_current_user
from security import hash_password, verify_password, create_access_token, decode_access_token
from embedding_service import encode
from embedding_service import is_ready as embedder_is_ready
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
from vector_store import index_chunks, delete_document_collection
from tasks import process_document_pipeline

logger = logging.getLogger(__name__)

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
        "status": "queued",
        "file_path": file_path,
    }
    result = await db.documents.insert_one(document_doc)
    document_id = str(result.inserted_id)

    # Queue Celery processing pipeline
    process_document_pipeline.delay(document_id)

    updated_doc = await db.documents.find_one({"_id": result.inserted_id})
    return document_doc_to_public(updated_doc)


@router.get("/{document_id}/status")
async def get_document_status(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(document_id, current_user.id)
    return {"status": doc["status"]}


@router.post("/{document_id}/retry")
async def retry_document_pipeline(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(document_id, current_user.id)
    await db.documents.update_one(
        {"_id": ObjectId(document_id)},
        {"$set": {"status": "queued"}}
    )
    process_document_pipeline.delay(document_id)
    return {"status": "queued"}



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


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    file_path = doc.get("file_path")
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            logger.warning(f"Could not remove PDF file {file_path}: {e}")

    delete_document_collection(doc_id_str)

    await db.chunks.delete_many({"document_id": doc_id_str})
    await db.topics.delete_many({"document_id": doc_id_str})
    await db.notes.delete_many({"document_id": doc_id_str})
    await db.exam_essentials.delete_many({"document_id": doc_id_str})
    await db.knowledge_graphs.delete_many({"document_id": doc_id_str})
    await db.activity_logs.delete_many({"document_id": doc_id_str})
    await db.documents.delete_one({"_id": doc["_id"]})

    return {"message": "Document deleted successfully", "id": document_id}



@router.get("/{document_id}/file")
async def get_document_file(
    document_id: str,
    request: Request,
    token: str | None = Query(None),
):
    auth_header = request.headers.get("Authorization")
    actual_token = None
    if auth_header and auth_header.startswith("Bearer "):
        actual_token = auth_header.split(" ")[1]
    elif token:
        actual_token = token

    if not actual_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = decode_access_token(actual_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    doc = await _get_owned_document(document_id, user_id)
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

    # STEP 9: (re)build the document's semantic-search index from the same
    # cleaned/de-noised chunks the topic segmenter just used, so headers,
    # footers, and page-number noise never pollute semantic search results.
    if embedder_is_ready():
        try:
            texts = [c["text"] for c in cleaned]
            embeddings = encode(texts)
            index_chunks(str(doc["_id"]), cleaned, embeddings)
        except Exception:
            logger.exception(
                "Failed to build semantic search index for document %s -- "
                "keyword search will still work, semantic search will not.",
                doc["_id"],
            )
    else:
        logger.warning(
            "Embedding model not ready yet -- skipped semantic indexing for "
            "document %s. Re-run 'Segment Topics' once it's loaded.",
            doc["_id"],
        )

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
                "edited_text": None,
                "is_pinned": False,
                "user_id": current_user.id,
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

    def _stamp(d: dict) -> dict:
        d["user_id"] = current_user.id
        d["is_pinned"] = False
        d["edited_text"] = None
        return d

    topic_docs = [_stamp(d) for d in await hierarchy_service.build_topic_notes(db, doc_id_str)]
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

    page_docs = [_stamp(d) for d in await hierarchy_service.build_page_notes(db, doc_id_str)]
    inserted_page_notes = []
    if page_docs:
        result = await db.notes.insert_many(page_docs)
        raw = await db.notes.find({"_id": {"$in": list(result.inserted_ids)}}).to_list(None)
        raw.sort(key=lambda n: n["source_pages"][0])
        inserted_page_notes = raw

    chapter_doc = await hierarchy_service.build_chapter_note(db, doc_id_str)
    inserted_chapter_notes = []
    if chapter_doc:
        chapter_doc = _stamp(chapter_doc)
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


@router.get("/{document_id}/notebook", response_model=list[NotePublic])
async def get_notebook(document_id: str, current_user: UserPublic = Depends(get_current_user)):
    """The user's personal revision notebook: every note on this document
    that they've pinned and/or personally edited."""
    doc = await _get_owned_document(document_id, current_user.id)
    cursor = db.notes.find(
        {
            "document_id": str(doc["_id"]),
            "user_id": current_user.id,
            "$or": [
                {"is_pinned": True},
                {"edited_text": {"$nin": [None, ""]}},
            ],
        }
    ).sort([("level", 1), ("source_pages", 1)])
    notes = await cursor.to_list(length=None)
    return [note_doc_to_public(n) for n in notes]


@router.delete("/{document_id}/notes")
async def clear_notes(
    document_id: str,
    level: Literal["paragraph", "topic", "page", "chapter", "all"] = "all",
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])
    query: dict = {"document_id": doc_id_str}
    if level != "all":
        query["level"] = level

    result = await db.notes.delete_many(query)
    return {"message": "Notes deleted successfully", "deleted_count": result.deleted_count}

