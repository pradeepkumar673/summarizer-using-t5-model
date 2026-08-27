"""
STEP 15: Viva Simulator — adaptive oral examination powered by Groq.

POST /api/viva/start
    Accepts document_id + topic_id, gathers context (topic notes + exam
    essentials within the topic's page range), calls Groq to generate an
    opening question at MEDIUM difficulty, creates a VivaSession in MongoDB,
    and returns the session_id + first question.

POST /api/viva/{session_id}/answer
    Accepts the student's text answer. Builds a structured Groq prompt that:
      1. Shows the original question + grounding source passages.
      2. Asks the model to evaluate on 5 rubric dimensions (1-5 each):
         conceptual_accuracy, completeness, clarity, use_of_examples, confidence.
      3. Asks for missing_keywords (list).
      4. Asks for a source_paragraph reference (paragraph_id, page_number).
      5. Generates the next question, increasing difficulty on good answers,
         maintaining on mediocre, decreasing on weak ones.
    Returns evaluation + next_question + source reference.
    Stores the exchange in MongoDB.

GET /api/viva/{session_id}
    Returns the full session with all Q&A rounds and evaluations.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import settings
from database import db
from deps import get_current_user
from models import UserPublic
from routers.documents import _get_owned_document

router = APIRouter(prefix="/api/viva", tags=["viva"])
logger = logging.getLogger(__name__)

GROQ_MODEL = "llama-3.1-8b-instant"
MAX_CONTEXT_CHARS = 4000   # cap total context size sent to Groq

Difficulty = Literal["easy", "medium", "hard"]

DIFFICULTY_LEVELS: list[Difficulty] = ["easy", "medium", "hard"]


# ── Schemas ───────────────────────────────────────────────────────────────────

class StartRequest(BaseModel):
    document_id: str
    topic_id: str


class StartResponse(BaseModel):
    session_id: str
    question: str
    difficulty: Difficulty
    topic_title: str


class AnswerRequest(BaseModel):
    answer: str


class RubricScore(BaseModel):
    conceptual_accuracy: int   # 1-5
    completeness: int
    clarity: int
    use_of_examples: int
    confidence: int


class AnswerResponse(BaseModel):
    evaluation: RubricScore
    overall_score: float        # mean of the 5 dimensions
    feedback: str               # 1-3 sentence narrative
    missing_keywords: list[str]
    next_question: str | None   # None if session should end
    next_difficulty: Difficulty
    source_page: int | None
    source_paragraph_id: int | None
    session_complete: bool


class QARound(BaseModel):
    question: str
    difficulty: Difficulty
    answer: str
    evaluation: dict
    overall_score: float = 0.0
    feedback: str
    missing_keywords: list[str]
    next_question: str | None
    source_page: int | None
    source_paragraph_id: int | None



class SessionDetail(BaseModel):
    id: str
    document_id: str
    topic_id: str
    topic_title: str
    status: str
    current_difficulty: Difficulty
    rounds: list[QARound]
    created_at: datetime


# ── Helpers ───────────────────────────────────────────────────────────────────

def _groq_client():
    from groq import Groq
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not configured.")
    return Groq(api_key=settings.groq_api_key)


async def _gather_context(doc_id_str: str, topic: dict) -> str:
    """Build a grounded context string from the topic's notes + exam essentials."""
    page_range = topic.get("page_range", [0, 0])
    p_start = page_range[0] if page_range else 0
    p_end = page_range[1] if len(page_range) > 1 else p_start

    # Topic-level notes
    notes = await db.notes.find(
        {
            "document_id": doc_id_str,
            "$or": [
                {"topic_id": str(topic["_id"])},
                {"level": {"$in": ["topic", "chapter"]}},
            ],
        }
    ).sort("source_pages", 1).to_list(length=30)

    # Exam essentials in this page range
    essentials = await db.exam_essentials.find(
        {
            "document_id": doc_id_str,
            "source_page": {"$gte": p_start, "$lte": p_end},
        }
    ).sort("source_page", 1).to_list(length=50)

    parts: list[str] = []

    if notes:
        parts.append("=== TOPIC NOTES ===")
        for n in notes:
            text = n.get("edited_text") or n.get("text", "")
            pages = n.get("source_pages", [])
            page_str = f"[p.{pages[0]}] " if pages else ""
            parts.append(f"{page_str}{text}")

    if essentials:
        parts.append("\n=== KEY INFORMATION (Definitions, Formulas, Rules) ===")
        for e in essentials:
            cat = e.get("category", "")
            text = e.get("text", "")
            page = e.get("source_page", "?")
            parts.append(f"[{cat.upper()} | p.{page}] {text}")

    ctx = "\n".join(parts)
    return ctx[:MAX_CONTEXT_CHARS]


def _difficulty_prompt_hint(difficulty: Difficulty) -> str:
    if difficulty == "easy":
        return (
            "Ask a basic recall question — definition, simple fact, or "
            "identify a term from the content."
        )
    if difficulty == "medium":
        return (
            "Ask a conceptual question that requires understanding, "
            "comparison, or explanation — not just recall."
        )
    return (
        "Ask a challenging analytical or applied question — cause/effect, "
        "synthesis, evaluation, or a scenario requiring multi-step reasoning."
    )


def _next_difficulty(current: Difficulty, score: float) -> Difficulty:
    """Adapt difficulty: raise on ≥4.0 avg, lower on ≤2.0 avg, else hold."""
    idx = DIFFICULTY_LEVELS.index(current)
    if score >= 4.0:
        idx = min(idx + 1, len(DIFFICULTY_LEVELS) - 1)
    elif score <= 2.0:
        idx = max(idx - 1, 0)
    return DIFFICULTY_LEVELS[idx]


def _parse_groq_json(raw: str) -> dict:
    """Extract the first JSON object from Groq's response text."""
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in Groq response.")
    return json.loads(raw[start:end])


# ── POST /api/viva/start ──────────────────────────────────────────────────────

@router.post("/start", response_model=StartResponse)
async def start_viva(
    body: StartRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await _get_owned_document(body.document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    # Validate topic ownership
    try:
        topic_oid = ObjectId(body.topic_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid topic_id.")
    topic = await db.topics.find_one({"_id": topic_oid, "document_id": doc_id_str})
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found.")

    context = await _gather_context(doc_id_str, topic)
    if not context.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "No notes or key information found for this topic. "
                "Run 'Generate Notes' and 'Extract Key Info' first."
            ),
        )

    difficulty: Difficulty = "medium"
    topic_title = topic.get("title", "Untitled Topic")
    hint = _difficulty_prompt_hint(difficulty)

    system_prompt = (
        "You are a strict but fair academic examiner conducting an oral viva. "
        "You have been given source content from a student's study document. "
        "Generate ONE clear, well-formed examination question based ONLY on "
        "the provided content. Do not ask anything outside the provided content. "
        f"Difficulty instruction: {hint}"
    )
    user_prompt = (
        f"Topic: {topic_title}\n\n"
        f"Source Content:\n{context}\n\n"
        "Generate one viva question. Output ONLY the question text, nothing else."
    )

    client = _groq_client()
    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=256,
    )
    first_question = (completion.choices[0].message.content or "").strip()

    # Create session in MongoDB
    now = datetime.now(timezone.utc)
    session_doc = {
        "user_id": current_user.id,
        "document_id": doc_id_str,
        "topic_id": body.topic_id,
        "topic_title": topic_title,
        "status": "active",
        "current_difficulty": difficulty,
        "opening_question": first_question,   # stored so submit_answer can read it for round 1
        "rounds": [],
        "created_at": now,
        "updated_at": now,
    }
    result = await db.viva_sessions.insert_one(session_doc)
    session_id = str(result.inserted_id)

    return StartResponse(
        session_id=session_id,
        question=first_question,
        difficulty=difficulty,
        topic_title=topic_title,
    )


# ── POST /api/viva/{session_id}/answer ────────────────────────────────────────

@router.post("/{session_id}/answer", response_model=AnswerResponse)
async def submit_answer(
    session_id: str,
    body: AnswerRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    try:
        sid_oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid session_id.")

    session = await db.viva_sessions.find_one(
        {"_id": sid_oid, "user_id": current_user.id}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.get("status") != "active":
        raise HTTPException(status_code=400, detail="Session is already complete.")

    answer_text = body.answer.strip()
    if not answer_text:
        raise HTTPException(status_code=422, detail="Answer must not be empty.")

    doc_id_str = session["document_id"]
    topic = await db.topics.find_one({"_id": ObjectId(session["topic_id"])})
    topic_title = session.get("topic_title", "")
    current_difficulty: Difficulty = session.get("current_difficulty", "medium")

    # Grab the last question from the session rounds, or if first answer, get the
    # initial question by re-querying — we store it in rounds after each exchange
    rounds = session.get("rounds", [])
    if rounds:
        last_question = rounds[-1].get("next_question") or rounds[-1].get("question", "")
    else:
        # First answer: the question was the opening question — we need it from
        # session metadata. Store it in a "pending_question" field during start.
        # Since we didn't do that, pull it from a metadata key we'll add now.
        last_question = session.get("opening_question", "")

    # Rebuild context
    context = await _gather_context(doc_id_str, topic) if topic else ""

    # Build the Groq evaluation prompt
    next_hint = _difficulty_prompt_hint(current_difficulty)

    rubric_json_schema = """{
  "conceptual_accuracy": <1-5>,
  "completeness": <1-5>,
  "clarity": <1-5>,
  "use_of_examples": <1-5>,
  "confidence": <1-5>,
  "feedback": "<1-3 sentence narrative explaining strengths and weaknesses>",
  "missing_keywords": ["<keyword1>", "<keyword2>"],
  "source_page": <integer page number the answer should reference, or null>,
  "source_paragraph_id": <integer paragraph_id, or null>,
  "next_question": "<next viva question, or null if session should end after 10 rounds>"
}"""

    system_prompt = (
        "You are a strict academic examiner. Given a viva question, the student's "
        "answer, and the authoritative source content, you must:\n"
        "1. Evaluate the answer on 5 rubric dimensions, each scored 1-5.\n"
        "2. Identify any important missing keywords or concepts.\n"
        "3. Provide 1-3 sentences of constructive feedback.\n"
        "4. Identify the source_page and source_paragraph_id the answer relates to.\n"
        "5. Generate the next question based on difficulty guidance.\n"
        "Output ONLY valid JSON matching this exact schema:\n"
        f"{rubric_json_schema}\n\n"
        "Difficulty guidance for next question: "
        f"{next_hint}"
    )

    rounds_count = len(rounds) + 1
    session_end_note = (
        f" This is round {rounds_count}/10. Set next_question to null if this is round 10."
        if rounds_count >= 10
        else f" This is round {rounds_count}/10."
    )

    user_prompt = (
        f"Topic: {topic_title}\n\n"
        f"Source Content:\n{context}\n\n"
        f"Question asked: {last_question}\n\n"
        f"Student's answer: {answer_text}\n\n"
        f"Evaluate and generate the next question.{session_end_note}"
    )

    client = _groq_client()
    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=700,
    )
    raw_response = (completion.choices[0].message.content or "").strip()

    # Parse JSON
    try:
        parsed = _parse_groq_json(raw_response)
    except Exception as exc:
        logger.error("Groq JSON parse error: %s\nRaw: %s", exc, raw_response)
        raise HTTPException(
            status_code=502,
            detail="Failed to parse evaluation from Groq. Please try again.",
        )

    # Extract fields with safe defaults
    def clamp(v, lo=1, hi=5) -> int:
        try:
            return max(lo, min(hi, int(v)))
        except Exception:
            return 3

    rubric = RubricScore(
        conceptual_accuracy=clamp(parsed.get("conceptual_accuracy", 3)),
        completeness=clamp(parsed.get("completeness", 3)),
        clarity=clamp(parsed.get("clarity", 3)),
        use_of_examples=clamp(parsed.get("use_of_examples", 3)),
        confidence=clamp(parsed.get("confidence", 3)),
    )
    overall = round(
        (
            rubric.conceptual_accuracy
            + rubric.completeness
            + rubric.clarity
            + rubric.use_of_examples
            + rubric.confidence
        )
        / 5,
        2,
    )
    feedback = str(parsed.get("feedback", "")).strip()
    missing_kws: list[str] = [
        str(k) for k in (parsed.get("missing_keywords") or []) if k
    ]
    next_q: str | None = parsed.get("next_question") or None
    if next_q:
        next_q = next_q.strip() or None
    src_page: int | None = parsed.get("source_page")
    src_pid: int | None = parsed.get("source_paragraph_id")

    next_diff = _next_difficulty(current_difficulty, overall)
    session_complete = rounds_count >= 10 or next_q is None

    # Persist round to MongoDB
    round_entry = {
        "question": last_question,
        "difficulty": current_difficulty,
        "answer": answer_text,
        "evaluation": rubric.model_dump(),
        "overall_score": overall,
        "feedback": feedback,
        "missing_keywords": missing_kws,
        "next_question": next_q,
        "source_page": src_page,
        "source_paragraph_id": src_pid,
    }

    update_fields: dict = {
        "current_difficulty": next_diff,
        "updated_at": datetime.now(timezone.utc),
    }
    if session_complete:
        update_fields["status"] = "complete"

    await db.viva_sessions.update_one(
        {"_id": sid_oid},
        {
            "$push": {"rounds": round_entry},
            "$set": update_fields,
        },
    )

    return AnswerResponse(
        evaluation=rubric,
        overall_score=overall,
        feedback=feedback,
        missing_keywords=missing_kws,
        next_question=next_q,
        next_difficulty=next_diff,
        source_page=src_page,
        source_paragraph_id=src_pid,
        session_complete=session_complete,
    )


# ── GET /api/viva/document/{doc_id}/sessions ──────────────────────────────────
# MUST be declared BEFORE /{session_id} so that "document" is NOT consumed as
# a session_id path parameter by FastAPI's greedy route matching.

@router.get("/document/{document_id}/sessions")
async def list_sessions(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    sessions = await db.viva_sessions.find(
        {"document_id": document_id, "user_id": current_user.id}
    ).sort("created_at", -1).to_list(length=20)

    return [
        {
            "id": str(s["_id"]),
            "topic_title": s.get("topic_title", ""),
            "status": s.get("status", "active"),
            "rounds": len(s.get("rounds", [])),
            "created_at": s["created_at"].isoformat(),
        }
        for s in sessions
    ]


# ── GET /api/viva/{session_id} ────────────────────────────────────────────────
# Declared AFTER /document/{document_id}/sessions to avoid swallowing the
# literal path segment "document" as a session_id.

@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    try:
        sid_oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid session_id.")

    session = await db.viva_sessions.find_one(
        {"_id": sid_oid, "user_id": current_user.id}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    rounds = [QARound(**r) for r in session.get("rounds", [])]
    return SessionDetail(
        id=str(session["_id"]),
        document_id=session["document_id"],
        topic_id=session["topic_id"],
        topic_title=session.get("topic_title", ""),
        status=session.get("status", "active"),
        current_difficulty=session.get("current_difficulty", "medium"),
        rounds=rounds,
        created_at=session["created_at"],
    )
