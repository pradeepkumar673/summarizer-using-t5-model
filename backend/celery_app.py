# Force Redis client to use RESP2 protocol globally for compatibility with Windows Redis 5.x server
import redis.connection
redis.connection.DEFAULT_RESP_VERSION = 2

# Disable maintenance notifications globally since they require RESP3 and hiredis
original_maint_init = redis.connection.MaintNotificationsConfig.__init__
redis.connection.MaintNotificationsConfig.__init__ = lambda self, *args, **kwargs: original_maint_init(self, enabled=False)

from celery import Celery
from config import settings


celery_app = Celery(
    "pdf_notes_platform",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_transport_options={"protocol": 2},
    result_backend_transport_options={"protocol": 2},
)

# Force load T5 and sentence-transformer models when worker starts
from summarization_service import load_model as load_summarizer
from embedding_service import load_model as load_embedder

@celery_app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    load_summarizer()
    load_embedder()

