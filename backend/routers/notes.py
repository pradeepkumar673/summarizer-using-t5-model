from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import get_current_user
from models import NotePublic, NoteUpdate, UserPublic, note_doc_to_public

router = APIRouter(prefix="/api/notes", tags=["notes"])


async def _get_owned_note(note_id: str, user_id: str) -> dict:
    try:
        oid = ObjectId(note_id)
    except InvalidId:
        raise HTTPException(status_code=404, detail="Note not found")
    note = await db.notes.find_one({"_id": oid})
    if not note or note.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.patch("/{note_id}", response_model=NotePublic)
async def update_note(
    note_id: str,
    payload: NoteUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    note = await _get_owned_note(note_id, current_user.id)

    # exclude_unset distinguishes "field omitted" (leave alone) from
    # "field explicitly sent, even as null" (apply it) -- required for
    # edited_text=null to mean "revert to the original AI text".
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "edited_text" in update_data and update_data["edited_text"] is not None:
        stripped = update_data["edited_text"].strip()
        update_data["edited_text"] = stripped if stripped else None

    await db.notes.update_one({"_id": note["_id"]}, {"$set": update_data})
    updated = await db.notes.find_one({"_id": note["_id"]})
    return note_doc_to_public(updated)


@router.delete("/{note_id}")
async def delete_note(
    note_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    note = await _get_owned_note(note_id, current_user.id)
    await db.notes.delete_one({"_id": note["_id"]})
    return {"message": "Note deleted successfully", "id": note_id}

