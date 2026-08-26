from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserInDB(BaseModel):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)

    id: str = Field(alias="_id")
    email: EmailStr
    hashed_password: str
    created_at: datetime


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def user_doc_to_public(doc: dict) -> UserPublic:
    return UserPublic(id=str(doc["_id"]), email=doc["email"], created_at=doc["created_at"])


# --- Document / chunk models ---

DocumentStatus = Literal["processing", "ready", "segmented", "failed"]


class BoundingBox(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float


class ChunkPublic(BaseModel):
    id: str
    document_id: str
    page_number: int
    paragraph_id: int
    text: str
    bounding_box: BoundingBox
    avg_font_size: float | None = None
    is_bold: bool = False


class DocumentPublic(BaseModel):
    id: str
    title: str
    owner_id: str
    upload_date: datetime
    total_pages: int
    status: DocumentStatus


class DocumentDetail(DocumentPublic):
    chunks: list[ChunkPublic]


def document_doc_to_public(doc: dict) -> DocumentPublic:
    return DocumentPublic(
        id=str(doc["_id"]),
        title=doc["title"],
        owner_id=doc["owner_id"],
        upload_date=doc["upload_date"],
        total_pages=doc["total_pages"],
        status=doc["status"],
    )


def chunk_doc_to_public(doc: dict) -> ChunkPublic:
    return ChunkPublic(
        id=str(doc["_id"]),
        document_id=doc["document_id"],
        page_number=doc["page_number"],
        paragraph_id=doc["paragraph_id"],
        text=doc["text"],
        bounding_box=BoundingBox(**doc["bounding_box"]),
        avg_font_size=doc.get("avg_font_size"),
        is_bold=doc.get("is_bold", False),
    )


# --- Topic models ---

class TopicPublic(BaseModel):
    id: str
    document_id: str
    title: str
    order_index: int
    paragraph_ids: list[str]  # unique chunk IDs this topic was built from (traceable)
    page_range: list[int]  # [min_page, max_page]


def topic_doc_to_public(doc: dict) -> TopicPublic:
    return TopicPublic(
        id=str(doc["_id"]),
        document_id=doc["document_id"],
        title=doc["title"],
        order_index=doc["order_index"],
        paragraph_ids=doc["paragraph_ids"],
        page_range=doc["page_range"],
    )


# --- Note models ---

NoteLevel = Literal["paragraph", "topic", "page", "chapter"]


class NotePublic(BaseModel):
    id: str
    document_id: str
    level: NoteLevel
    text: str  # original AI-generated summary -- never mutated by edits
    edited_text: str | None = None  # the user's personal rewrite, if any
    is_pinned: bool = False
    user_id: str  # owner of the note (== the document's owner_id)
    topic_id: str | None = None  # set for paragraph/topic notes; None for page/chapter
    paragraph_id: int | None = None  # only set for level="paragraph" (per-page chunk index)
    source_chunk_ids: list[str]  # every source chunk _id this note traces back to
    source_pages: list[int]  # sorted, de-duplicated page numbers this note covers
    source_bounding_boxes: list[BoundingBox]  # bbox for each entry in source_chunk_ids
    created_at: datetime


class NoteUpdate(BaseModel):
    """
    PATCH payload. Uses pydantic's exclude_unset semantics at the router level:
    a field omitted entirely is left untouched; a field explicitly sent as
    null (e.g. {"edited_text": null}) clears it back to the original AI text.
    """
    edited_text: str | None = None
    is_pinned: bool | None = None


def note_doc_to_public(doc: dict) -> NotePublic:
    return NotePublic(
        id=str(doc["_id"]),
        document_id=doc["document_id"],
        level=doc["level"],
        text=doc["text"],
        edited_text=doc.get("edited_text"),
        is_pinned=doc.get("is_pinned", False),
        user_id=doc.get("user_id", ""),
        topic_id=doc.get("topic_id"),
        paragraph_id=doc.get("paragraph_id"),
        source_chunk_ids=doc["source_chunk_ids"],
        source_pages=doc["source_pages"],
        source_bounding_boxes=[BoundingBox(**bb) for bb in doc["source_bounding_boxes"]],
        created_at=doc["created_at"],
    )
