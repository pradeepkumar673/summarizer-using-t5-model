from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import embedding_service
import summarization_service
from config import settings
from database import ping_database, db
from routers.auth import router as auth_router
from routers.documents import router as documents_router
from routers.notes import router as notes_router
from routers.search import router as search_router
from routers.exam_essentials import router as exam_router
from routers.export import router as export_router

app = FastAPI(title="Traceable PDF Notes Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(notes_router)
app.include_router(search_router)
app.include_router(exam_router)
app.include_router(export_router)


@app.on_event("startup")
async def create_indexes():
    await db.users.create_index("email", unique=True)
    await db.documents.create_index("owner_id")
    await db.chunks.create_index("document_id")
    await db.chunks.create_index([("document_id", 1), ("page_number", 1)])
    await db.topics.create_index("document_id")
    await db.topics.create_index([("document_id", 1), ("order_index", 1)])
    await db.notes.create_index([("document_id", 1), ("level", 1), ("source_page", 1)])
    await db.notes.create_index([("document_id", 1), ("user_id", 1), ("is_pinned", 1)])
    # STEP 9: real MongoDB text indexes powering keyword search.
    await db.chunks.create_index([("text", "text")], name="chunks_text_search")
    await db.notes.create_index(
        [("text", "text"), ("edited_text", "text")], name="notes_text_search"
    )
    # STEP 10: exam essentials index
    await db.exam_essentials.create_index([("document_id", 1), ("category", 1)])


@app.on_event("startup")
async def load_summarization_model():
    print("[main] Loading T5 summarization model (t5-small)...")
    summarization_service.load_model()
    print("[main] T5 summarization model ready.")


@app.on_event("startup")
async def load_embedding_model():
    print("[main] Loading sentence-transformers embedding model (all-MiniLM-L6-v2)...")
    embedding_service.load_model()
    print("[main] Embedding model ready.")


@app.get("/api/health")
async def health_check():
    db_ok = await ping_database()
    return {
        "status": "ok",
        "db": "connected" if db_ok else "disconnected",
    }
