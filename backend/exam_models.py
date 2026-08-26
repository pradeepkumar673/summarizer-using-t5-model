"""
STEP 10: ExamEssential Pydantic models and MongoDB helper.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from models import BoundingBox

ExamCategory = Literal["definition", "formula", "unit", "rule", "example", "exception"]

ALL_CATEGORIES: list[ExamCategory] = [
    "definition", "formula", "unit", "rule", "example", "exception"
]


class ExamEssentialPublic(BaseModel):
    id: str
    document_id: str
    category: ExamCategory
    text: str
    source_page: int
    source_bounding_box: BoundingBox | None = None
    created_at: datetime


def exam_doc_to_public(doc: dict) -> ExamEssentialPublic:
    bbox = doc.get("source_bounding_box")
    return ExamEssentialPublic(
        id=str(doc["_id"]),
        document_id=doc["document_id"],
        category=doc["category"],
        text=doc["text"],
        source_page=doc["source_page"],
        source_bounding_box=BoundingBox(**bbox) if bbox else None,
        created_at=doc["created_at"],
    )
