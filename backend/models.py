from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict


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
    return UserPublic(
        id=str(doc["_id"]),
        email=doc["email"],
        created_at=doc["created_at"],
    )


# --- Document / chunk models ---

DocumentStatus = Literal["processing", "ready", "failed"]


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
    )
