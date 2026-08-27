# ──────────────────────────────────────────────────────────────────────────────
# RESP2 compatibility patch for redis-py 5.x + celery/kombu
#
# redis-py 5+ defaults to RESP3 protocol which breaks kombu's zset score-pair
# parsing (ValueError: too many values to unpack).  Force RESP2 globally
# before any other import touches the redis module.
# ──────────────────────────────────────────────────────────────────────────────
import redis.connection as _redis_conn

# Force RESP2 for all connections (redis-py 5.x)
_redis_conn.DEFAULT_RESP_VERSION = 2

# redis 8.x introduced MaintNotificationsConfig (requires RESP3 + hiredis).
# Patch it away only if it actually exists in this redis version.
if hasattr(_redis_conn, "MaintNotificationsConfig"):
    _orig_maint_init = _redis_conn.MaintNotificationsConfig.__init__
    _redis_conn.MaintNotificationsConfig.__init__ = (
        lambda self, *args, **kwargs: _orig_maint_init(self, enabled=False)
    )

import torch
# Limit PyTorch CPU threads to prevent 100% CPU system lockup
torch.set_num_threads(4)

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
    # Instruct kombu to negotiate RESP2 with the Redis server
    broker_transport_options={"protocol": 2},
    result_backend_transport_options={"protocol": 2},
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Load T5 and sentence-transformer models when each WORKER PROCESS starts,
# not when Celery config is applied (on_after_configure fires in the main
# process, not in the forked worker — models loaded there are lost after fork).
from celery.signals import worker_process_init
from summarization_service import load_model as load_summarizer
from embedding_service import load_model as load_embedder

@worker_process_init.connect
def load_models_in_worker(**kwargs):
    load_summarizer()
    load_embedder()
