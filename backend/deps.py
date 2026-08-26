from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from bson.errors import InvalidId
from database import db
from security import decode_access_token
from models import UserPublic, user_doc_to_public

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UserPublic:
    token = credentials.credentials
    user_id = decode_access_token(token)

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if user_id is None:
        raise credentials_exception

    try:
        oid = ObjectId(user_id)
    except InvalidId:
        raise credentials_exception

    user_doc = await db.users.find_one({"_id": oid})
    if user_doc is None:
        raise credentials_exception

    return user_doc_to_public(user_doc)
