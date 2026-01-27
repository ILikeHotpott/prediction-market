import asyncio
import logging
import os

from django.conf import settings

from .scheduler import FinanceMarketScheduler
from .streams import PriceStreamManager

logger = logging.getLogger(__name__)

_inline_started = False
_tasks = []
_manager = None


def _is_enabled() -> bool:
    mode = os.getenv("FINANCE_STREAM_MODE", "auto").strip().lower()
    if mode in {"off", "disabled", "none"}:
        return False
    if mode == "inline":
        return True
    if mode == "external":
        return False
    # auto: only start inline if redis is not configured
    return not bool(os.getenv("REDIS_URL"))


def ensure_inline_services_started() -> None:
    global _inline_started
    if _inline_started:
        return
    if not _is_enabled():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    global _manager
    if _manager is None:
        _manager = PriceStreamManager(min_broadcast_interval=0.5)
    scheduler = FinanceMarketScheduler(_manager.store, interval_seconds=0.5)
    _tasks.append(loop.create_task(_manager.start()))
    _tasks.append(loop.create_task(scheduler.run()))
    _inline_started = True
    logger.info("Finance inline streams started (websocket + scheduler).")
