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
from models import UserPublic, DocumentPublic, DocumentDetail, document_doc_to_public, chunk_doc_to_public
from pdf_extraction import extract_blocks_from_pdf

router = APIRouter(prefix="/api/documents", tags=["documents"])

os.makedirs(settings.upload_dir, exist_ok=True)


@router.post("/upload", response_model=DocumentPublic, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: UserPublic = Depends(get_current_user),
):
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Save file to disk with a unique name to avoid collisions
    file_id = uuid.uuid4().hex
    safe_filename = f"{file_id}.pdf"
    file_path = os.path.join(settings.upload_dir, safe_filename)

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    with open(file_path, "wb") as f:
        f.write(contents)

    # Create the document record in "processing" state first
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

    # Run real PyMuPDF extraction synchronously
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
