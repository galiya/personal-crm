"""Redis-backed progress tracking for Telegram sync operations."""
from __future__ import annotations

import logging

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

PROGRESS_TTL = 3600  # 1 hour


async def set_progress(user_id: str, **fields) -> None:
    """Update sync progress fields in Redis hash."""
    r = get_redis()
    key = f"tg_sync_progress:{user_id}"
    # Convert all values to strings for Redis
    data = {k: str(v) for k, v in fields.items()}
    if data:
        await r.hset(key, mapping=data)
        await r.expire(key, PROGRESS_TTL)


async def get_progress(user_id: str) -> dict | None:
    """Get current sync progress. Returns None if no sync active."""
    r = get_redis()
    key = f"tg_sync_progress:{user_id}"
    data = await r.hgetall(key)
    if not data:
        return None
    # decode_responses=True means values are already strings; handle both cases
    return {
        k.decode() if isinstance(k, bytes) else k: v.decode() if isinstance(v, bytes) else v
        for k, v in data.items()
    }


async def clear_progress(user_id: str) -> None:
    """Remove sync progress."""
    r = get_redis()
    await r.delete(f"tg_sync_progress:{user_id}")


async def increment_progress(user_id: str, field: str, amount: int = 1) -> None:
    """Increment a numeric progress field."""
    r = get_redis()
    key = f"tg_sync_progress:{user_id}"
    await r.hincrby(key, field, amount)
    await r.expire(key, PROGRESS_TTL)
