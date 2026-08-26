"""
STEP 12: Groq-powered RAG doubt assistant.

POST /api/documents/{id}/assistant
    - Embeds the user's question with the same sentence-transformer from Step 9
    - Retrieves the top-k most relevant chunks from ChromaDB / NumPy fallback
    - Builds a grounded system prompt that includes the retrieved passages
    - Calls the Groq API (model: llama-3.1-8b-instant) with the full conversation
    - Stores the exchange in MongoDB and returns the answer + source pages

GET  /api/documents/{id}/assistant/history
    - Returns all stored messages for this document/user pair
"""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import embedding_service
import vector_store
from config import settings
from database import db
from deps import get_current_user
from models import UserPublic
from routers.documents import _get_owned_document

router = APIRouter(prefix="/api/documents", tags=["assistant"])

GROQ_MODEL = "llama-3.1-8b-instant"
TOP_K = 6          # number of chunks to retrieve
MAX_CHUNK_CHARS = 900  # truncate very long chunks in the prompt
MAX_HISTORY_MSGS = 8   # how many prior turns to include in the prompt


# ── Request / Response schemas ────────────────────────────────────────────────

class AskRequest(BaseModel):
    question: str


class SourceReference(BaseModel):
    chunk_id: str
    page_number: int
    paragraph_id: int
    score: float
    text: str


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceReference]
    message_id: str


class ChatMessage(BaseModel):
    id: str
    role: str          # "user" | "assistant"
    content: str
    sources: list[SourceReference]
    created_at: datetime


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_system_prompt(chunks: list[dict]) -> str:
    """
    Build a grounded system prompt.  The model is instructed to answer ONLY
    from the retrieved passages and to cite the page numbers.
    """
    passages = []
    for i, c in enumerate(chunks, 1):
        text = c["text"][:MAX_CHUNK_CHARS]
        passages.append(
            f"[Passage {i} | Page {c['page_number']}]\n{text}"
        )
    context_block = "\n\n".join(passages)

    return (
        "You are a study assistant for a student reading an academic PDF document. "
        "Answer the student's question using ONLY the passages provided below. "
        "Do NOT use any external knowledge. "
        "If the answer is not present in the passages, say: "
        "\"I could not find the answer in the document.\" "
        "Always cite the page number(s) you drew from, like: (Page 3), (Pages 2, 5).\n\n"
        "=== RETRIEVED PASSAGES ===\n\n"
        f"{context_block}\n\n"
        "=== END OF PASSAGES ===\n\n"
        "Answer concisely and accurately, referencing the passage page numbers."
    )


async def _get_history(doc_id: str, user_id: str, limit: int = MAX_HISTORY_MSGS) -> list[dict]:
    cursor = db.assistant_messages.find(
        {"document_id": doc_id, "user_id": user_id}
    ).sort("created_at", 1)
    all_msgs = await cursor.to_list(length=None)
    # Return the last `limit` messages for context
    return all_msgs[-limit:] if len(all_msgs) > limit else all_msgs


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/{document_id}/assistant", response_model=AskResponse)
async def ask_assistant(
    document_id: str,
    body: AskRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not configured on the server.",
        )

    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question must not be empty.")

    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    # 1. Embed the question
    model = embedding_service.get_model()
    q_embedding = model.encode([question])[0].tolist()

    # 2. Retrieve top-k chunks
    hits = vector_store.query_similar(doc_id_str, q_embedding, top_k=TOP_K)
    if not hits:
        raise HTTPException(
            status_code=400,
            detail=(
                "No vector index found for this document. "
                "Please run semantic search indexing first (process the document)."
            ),
        )

    sources = [
        SourceReference(
            chunk_id=h["chunk_id"],
            page_number=h["page_number"],
            paragraph_id=h["paragraph_id"],
            score=h["score"],
            text=h["text"],
        )
        for h in hits
    ]

    # 3. Build Groq messages including conversation history
    history = await _get_history(doc_id_str, current_user.id)

    system_prompt = _build_system_prompt(hits)
    messages: list[dict] = [{"role": "system", "content": system_prompt}]

    for past in history:
        messages.append({"role": past["role"], "content": past["content"]})

    messages.append({"role": "user", "content": question})

    # 4. Call the real Groq API
    from groq import Groq  # local import so startup doesn't fail without key

    groq_client = Groq(api_key=settings.groq_api_key)
    completion = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=messages,
        temperature=0.2,
        max_tokens=1024,
    )
    answer: str = completion.choices[0].message.content or ""

    # 5. Persist both turns to MongoDB
    now = datetime.now(timezone.utc)
    user_doc = {
        "document_id": doc_id_str,
        "user_id": current_user.id,
        "role": "user",
        "content": question,
        "sources": [],
        "created_at": now,
    }
    asst_doc = {
        "document_id": doc_id_str,
        "user_id": current_user.id,
        "role": "assistant",
        "content": answer,
        "sources": [s.model_dump() for s in sources],
        "created_at": now,
    }
    await db.assistant_messages.insert_many([user_doc, asst_doc])
    # asst_doc now has _id after insert_many
    asst_id = str(asst_doc["_id"])

    return AskResponse(answer=answer, sources=sources, message_id=asst_id)


@router.get("/{document_id}/assistant/history", response_model=list[ChatMessage])
async def get_assistant_history(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    cursor = db.assistant_messages.find(
        {"document_id": doc_id_str, "user_id": current_user.id}
    ).sort("created_at", 1)
    docs = await cursor.to_list(length=None)

    result = []
    for d in docs:
        raw_sources = d.get("sources", [])
        result.append(
            ChatMessage(
                id=str(d["_id"]),
                role=d["role"],
                content=d["content"],
                sources=[SourceReference(**s) for s in raw_sources],
                created_at=d["created_at"],
            )
        )
    return result
