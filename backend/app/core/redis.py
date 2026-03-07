"""Async Redis client for ephemeral state (OAuth nonces, rate-limit caches)."""
from __future__ import annotations

import redis.asyncio as aioredis

from app.core.config import settings

_pool: aioredis.ConnectionPool | None = None


def get_redis_pool() -> aioredis.ConnectionPool:
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(
            settings.REDIS_URL, decode_responses=True
        )
    return _pool


def get_redis() -> aioredis.Redis:
    return aioredis.Redis(connection_pool=get_redis_pool())
