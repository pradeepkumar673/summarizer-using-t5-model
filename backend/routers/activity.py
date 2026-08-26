"""
STEP 13: Activity-log router.

POST /api/activity/log
    Records a single user interaction event.

GET  /api/documents/{id}/heatmap
    Aggregates ActivityLog for the user, applies a weighted scoring formula,
    and returns paragraph_id -> heat level ("none"|"yellow"|"orange"|"red").

Weighted scoring formula
------------------------
| event_type       | weight |
|------------------|--------|
| quiz_wrong       |   5.0  |
| reread           |   3.0  |
| doubt_asked      |   2.5  |
| time_spent       |   1.5  | (per 30 s block, capped at 5 blocks)
| manual_highlight |   1.0  |
| note_click       |   0.5  |

Heat thresholds (cumulative weighted score per paragraph):
  < 1.0  → "none"
  1.0 – 3.5  → "yellow"
  3.5 – 7.0  → "orange"
  ≥ 7.0  → "red"
"""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Literal

from database import db
from deps import get_current_user
from models import UserPublic
from routers.documents import _get_owned_document

router = APIRouter(tags=["activity"])

# ── Types ─────────────────────────────────────────────────────────────────────
EventType = Literal[
    "reread",
    "note_click",
    "doubt_asked",
    "manual_highlight",
    "quiz_wrong",
    "time_spent",
]

HeatLevel = Literal["none", "yellow", "orange", "red"]

EVENT_WEIGHTS: dict[str, float] = {
    "quiz_wrong": 5.0,
    "reread": 3.0,
    "doubt_asked": 2.5,
    "time_spent": 1.5,   # per 30-second block, capped later
    "manual_highlight": 1.0,
    "note_click": 0.5,
}

# Thresholds for heat levels
THRESH_YELLOW = 1.0
THRESH_ORANGE = 3.5
THRESH_RED = 7.0

MAX_TIME_BLOCKS = 5   # cap time_spent contribution at 5 × 30 s blocks


# ── Request schemas ───────────────────────────────────────────────────────────

class LogRequest(BaseModel):
    document_id: str
    paragraph_id: int
    event_type: EventType
    value: float = 1.0    # seconds for time_spent; count for others


# ── POST /api/activity/log ────────────────────────────────────────────────────

@router.post("/api/activity/log", status_code=204)
async def log_activity(
    body: LogRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Lightweight, fire-and-forget endpoint.  The frontend calls this in the
    background; failures are silently swallowed by the client.
    """
    await db.activity_logs.insert_one(
        {
            "user_id": current_user.id,
            "document_id": body.document_id,
            "paragraph_id": body.paragraph_id,
            "event_type": body.event_type,
            "value": body.value,
            "timestamp": datetime.now(timezone.utc),
        }
    )


# ── GET /api/documents/{id}/heatmap ──────────────────────────────────────────

@router.get(
    "/api/documents/{document_id}/heatmap",
    response_model=dict[str, HeatLevel],
)
async def get_heatmap(
    document_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Aggregate all ActivityLog entries for this user/document pair.
    Apply a weighted score per paragraph, bucket into heat levels.
    Returns  {paragraph_id_str -> "none"|"yellow"|"orange"|"red"}.
    """
    doc = await _get_owned_document(document_id, current_user.id)
    doc_id_str = str(doc["_id"])

    cursor = db.activity_logs.find(
        {"document_id": doc_id_str, "user_id": current_user.id}
    )
    logs = await cursor.to_list(length=None)

    # Accumulate raw scores per paragraph
    scores: dict[int, float] = {}
    for log in logs:
        pid = log.get("paragraph_id")
        if pid is None:
            continue
        etype = log.get("event_type", "note_click")
        raw_value = float(log.get("value", 1.0))
        weight = EVENT_WEIGHTS.get(etype, 0.5)

        if etype == "time_spent":
            # Convert seconds → 30-second blocks, cap at MAX_TIME_BLOCKS
            blocks = min(raw_value / 30.0, MAX_TIME_BLOCKS)
            contribution = weight * blocks
        else:
            contribution = weight * raw_value

        scores[pid] = scores.get(pid, 0.0) + contribution

    # Bucket into heat levels
    result: dict[str, HeatLevel] = {}
    for pid, score in scores.items():
        if score < THRESH_YELLOW:
            level: HeatLevel = "none"
        elif score < THRESH_ORANGE:
            level = "yellow"
        elif score < THRESH_RED:
            level = "orange"
        else:
            level = "red"
        result[str(pid)] = level

    return result
