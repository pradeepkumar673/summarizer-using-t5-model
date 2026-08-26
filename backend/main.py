from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from database import ping_database, db
from routers.auth import router as auth_router

app = FastAPI(title="Traceable PDF Notes Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.on_event("startup")
async def create_indexes():
    await db.users.create_index("email", unique=True)


@app.get("/api/health")
async def health_check():
    db_ok = await ping_database()
    return {
        "status": "ok",
        "db": "connected" if db_ok else "disconnected",
    }
