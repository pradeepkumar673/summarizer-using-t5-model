# backend/tasks.py
import asyncio
import logging
from datetime import datetime, timezone
from bson import ObjectId

from celery_app import celery_app
from pdf_extraction import extract_blocks_from_pdf
from preprocessing import clean_chunks, split_into_sentences
from topic_segmentation import segment_topics
from summarization_service import summarize_text, is_ready as summarizer_ready
from embedding_service import encode, is_ready as embedder_ready
from vector_store import index_chunks
from key_info_extractor import extract_from_chunks
from graph_builder import build_graph
from hierarchy_service import build_topic_notes, build_page_notes, build_chapter_note

logger = logging.getLogger(__name__)


async def _run_pipeline(document_id: str, self):
    """Async core of the pipeline - runs all steps with status updates."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from config import settings

    # Instantiate a fresh client bound to the current running event loop
    local_client = AsyncIOMotorClient(settings.mongodb_uri)
    local_db = local_client[settings.mongodb_db_name]

    doc = await local_db.documents.find_one({"_id": ObjectId(document_id)})
    if not doc:
        raise ValueError(f"Document {document_id} not found")
    doc_id_str = str(doc["_id"])
    file_path = doc["file_path"]

    # 1. Extract
    self.update_state(state="EXTRACTING", meta={"stage": "extracting"})
    await local_db.documents.update_one({"_id": ObjectId(document_id)}, {"$set": {"status": "extracting"}})
    
    total_pages, chunks = extract_blocks_from_pdf(file_path)
    if chunks:
        chunk_docs = [
            {
                "document_id": doc_id_str,
                "page_number": c["page_number"],
                "paragraph_id": c["paragraph_id"],
                "text": c["text"],
                "bounding_box": c["bounding_box"],
                "avg_font_size": c.get("avg_font_size"),
                "is_bold": c.get("is_bold", False),
            }
            for c in chunks
        ]
        await local_db.chunks.insert_many(chunk_docs)

    await local_db.documents.update_one(
        {"_id": ObjectId(document_id)},
        {"$set": {"total_pages": total_pages, "status": "segmenting"}}
    )

    # 2. Segment
    self.update_state(state="SEGMENTING", meta={"stage": "segmenting"})
    raw_chunks = await local_db.chunks.find({"document_id": doc_id_str}).sort([("page_number", 1), ("paragraph_id", 1)]).to_list(None)
    if not raw_chunks:
        raise ValueError("No chunks found after extraction")
    
    cleaned = clean_chunks(raw_chunks)
    for c in cleaned:
        c["sentences"] = split_into_sentences(c["text"])
    
    topic_dicts = segment_topics(cleaned)
    await local_db.topics.delete_many({"document_id": doc_id_str})
    
    topic_docs = [
        {
            "document_id": doc_id_str,
            "title": t["title"],
            "order_index": t["order_index"],
            "paragraph_ids": t["paragraph_ids"],
            "page_range": t["page_range"],
        }
        for t in topic_dicts
    ]
    if topic_docs:
        await local_db.topics.insert_many(topic_docs)
    
    await local_db.documents.update_one({"_id": ObjectId(document_id)}, {"$set": {"status": "summarizing"}})

    # 3. Summarize paragraphs
    self.update_state(state="SUMMARIZING", meta={"stage": "summarizing"})
    if summarizer_ready():
        chunks_for_summary = await local_db.chunks.find({"document_id": doc_id_str}).sort([("page_number", 1), ("paragraph_id", 1)]).to_list(None)
        topics = await local_db.topics.find({"document_id": doc_id_str}).to_list(None)
        paragraph_to_topic = {}
        for t in topics:
            for pid in t["paragraph_ids"]:
                paragraph_to_topic[pid] = str(t["_id"])

        await local_db.notes.delete_many({"document_id": doc_id_str, "level": {"$in": ["paragraph", "topic", "page", "chapter"]}})

        note_docs = []
        for chunk in chunks_for_summary:
            text = chunk.get("text", "").strip()
            if len(text.split()) < 8:
                continue
            summary = summarize_text(text, max_length=60, min_length=10)
            if not summary:
                continue
            chunk_id_str = str(chunk["_id"])
            note_docs.append({
                "document_id": doc_id_str,
                "level": "paragraph",
                "text": summary,
                "edited_text": None,
                "is_pinned": False,
                "user_id": doc["owner_id"],
                "topic_id": paragraph_to_topic.get(chunk_id_str),
                "paragraph_id": chunk["paragraph_id"],
                "source_chunk_ids": [chunk_id_str],
                "source_pages": [chunk["page_number"]],
                "source_bounding_boxes": [chunk["bounding_box"]],
                "created_at": datetime.now(timezone.utc),
            })
        if note_docs:
            await local_db.notes.insert_many(note_docs)
        await local_db.documents.update_one({"_id": ObjectId(document_id)}, {"$set": {"status": "hierarchy"}})
    else:
        logger.warning("Summarization model not ready; skipping summarization")

    # 4. Build hierarchy
    self.update_state(state="HIERARCHY", meta={"stage": "hierarchy"})
    if summarizer_ready():
        topic_notes = await build_topic_notes(local_db, doc_id_str)
        if topic_notes:
            for n in topic_notes:
                n["user_id"] = doc["owner_id"]
                n["is_pinned"] = False
                n["edited_text"] = None
            await local_db.notes.insert_many(topic_notes)

        page_notes = await build_page_notes(local_db, doc_id_str)
        if page_notes:
            for n in page_notes:
                n["user_id"] = doc["owner_id"]
                n["is_pinned"] = False
                n["edited_text"] = None
            await local_db.notes.insert_many(page_notes)

        chapter_note = await build_chapter_note(local_db, doc_id_str)
        if chapter_note:
            chapter_note["user_id"] = doc["owner_id"]
            chapter_note["is_pinned"] = False
            chapter_note["edited_text"] = None
            await local_db.notes.insert_one(chapter_note)

    await local_db.documents.update_one({"_id": ObjectId(document_id)}, {"$set": {"status": "embedding"}})

    # 5. Embedding index
    self.update_state(state="EMBEDDING", meta={"stage": "embedding"})
    if embedder_ready():
        cleaned_chunks = await local_db.chunks.find({"document_id": doc_id_str}).sort([("page_number", 1), ("paragraph_id", 1)]).to_list(None)
        if cleaned_chunks:
            texts = [c["text"] for c in cleaned_chunks]
            embeddings = encode(texts)
            index_chunks(doc_id_str, cleaned_chunks, embeddings)
    else:
        logger.warning("Embedding model not ready; skipping semantic index")

    await local_db.documents.update_one({"_id": ObjectId(document_id)}, {"$set": {"status": "exam_essentials"}})

    # 6. Exam Essentials
    self.update_state(state="EXAM_ESSENTIALS", meta={"stage": "exam_essentials"})
    raw_chunks = await local_db.chunks.find({"document_id": doc_id_str}).sort([("page_number", 1), ("paragraph_id", 1)]).to_list(None)
    if raw_chunks:
        extracted = extract_from_chunks(raw_chunks)
        await local_db.exam_essentials.delete_many({"document_id": doc_id_str})
        if extracted:
            docs_to_insert = [
                {
                    "document_id": doc_id_str,
                    "category": e["category"],
                    "text": e["text"],
                    "source_page": e["source_page"],
                    "source_bounding_box": e["source_bounding_box"],
                    "created_at": datetime.now(timezone.utc),
                }
                for e in extracted
            ]
            await local_db.exam_essentials.insert_many(docs_to_insert)

    await local_db.documents.update_one({"_id": ObjectId(document_id)}, {"$set": {"status": "graph"}})

    # 7. Knowledge Graph
    self.update_state(state="GRAPH", meta={"stage": "graph"})
    topics = await local_db.topics.find({"document_id": doc_id_str}).sort("order_index", 1).to_list(None)
    essentials = await local_db.exam_essentials.find({"document_id": doc_id_str}).sort([("category", 1), ("source_page", 1)]).to_list(None)
    if topics:
        graph_data = build_graph(topics, essentials)
        await local_db.knowledge_graphs.update_one(
            {"document_id": doc_id_str},
            {"$set": {
                "document_id": doc_id_str,
                "nodes": graph_data["nodes"],
                "edges": graph_data["edges"],
                "updated_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )

    # 8. Done
    await local_db.documents.update_one({"_id": ObjectId(document_id)}, {"$set": {"status": "ready"}})
    self.update_state(state="DONE", meta={"stage": "done"})
    return {"document_id": doc_id_str, "status": "ready"}


@celery_app.task(bind=True)
def process_document_pipeline(self, document_id: str):
    """Celery task entry point - runs the async pipeline."""
    try:
        result = asyncio.run(_run_pipeline(document_id, self))
        return result
    except Exception as e:
        logger.exception("Pipeline task failed for document %s", document_id)
        
        async def _set_failed():
            from motor.motor_asyncio import AsyncIOMotorClient
            from config import settings
            client = AsyncIOMotorClient(settings.mongodb_uri)
            db = client[settings.mongodb_db_name]
            await db.documents.update_one({"_id": ObjectId(document_id)}, {"$set": {"status": "failed"}})
            
        try:
            asyncio.run(_set_failed())
        except Exception:
            pass

        self.update_state(state="FAILED", meta={"stage": "error", "error": str(e)})
        raise
