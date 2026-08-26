from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from database import ping_database

app = FastAPI(title="Traceable PDF Notes Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    db_ok = await ping_database()
    return {
        "status": "ok",
        "db": "connected" if db_ok else "disconnected",
    }
