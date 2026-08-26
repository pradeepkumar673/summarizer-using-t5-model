from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

client: AsyncIOMotorClient = AsyncIOMotorClient(settings.mongodb_uri)
db = client[settings.mongodb_db_name]


async def ping_database() -> bool:
    """Attempts a real round-trip to MongoDB Atlas. Returns True if reachable."""
    try:
        await client.admin.command("ping")
        return True
    except Exception:
        return False
