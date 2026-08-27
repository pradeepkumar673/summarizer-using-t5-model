# Force Redis client to use RESP2 protocol globally for compatibility with Windows Redis 5.x server
import redis.connection
redis.connection.DEFAULT_RESP_VERSION = 2

# Disable maintenance notifications globally since they require RESP3 and hiredis
original_maint_init = redis.connection.MaintNotificationsConfig.__init__
redis.connection.MaintNotificationsConfig.__init__ = lambda self, *args, **kwargs: original_maint_init(self, enabled=False)

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

