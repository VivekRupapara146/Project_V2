"""
cache.py
Lightweight in-memory TTL cache for analytics query results.

Eliminates redundant MongoDB aggregation pipeline calls.
No external dependencies — pure Python.

Usage:
    from utils.cache import get_cached, set_cache, invalidate

    result = get_cached("traffic_analytics")
    if result is None:
        result = expensive_db_query()
        set_cache("traffic_analytics", result, ttl=60)
    return result
"""

import time
import threading
import logging

logger = logging.getLogger(__name__)

# ── TTL defaults (seconds) ────────────────────────────────────────────────────
TTL_ANALYTICS  = 60    # traffic distribution — refreshes every 60s
TTL_PEAK_TIMES = 120   # peak hour data — changes slowly, cache longer

# ── Cache store ───────────────────────────────────────────────────────────────
# Structure: { key: { "value": ..., "expires_at": float } }
_store: dict = {}
_lock = threading.Lock()


def get_cached(key: str):
    """
    Return cached value if it exists and hasn't expired.
    Returns None on miss or expiry.
    """
    with _lock:
        entry = _store.get(key)
        if entry is None:
            return None
        if time.monotonic() > entry["expires_at"]:
            del _store[key]
            logger.debug(f"[cache] TTL expired: {key}")
            return None
        logger.debug(f"[cache] Hit: {key}")
        return entry["value"]


def set_cache(key: str, value, ttl: int = TTL_ANALYTICS) -> None:
    """Store a value with a TTL (in seconds)."""
    with _lock:
        _store[key] = {
            "value":      value,
            "expires_at": time.monotonic() + ttl,
        }
    logger.debug(f"[cache] Set: {key} (TTL={ttl}s)")


def invalidate(key: str) -> None:
    """Manually evict a cache entry (e.g. after a bulk write)."""
    with _lock:
        _store.pop(key, None)
    logger.debug(f"[cache] Invalidated: {key}")


def invalidate_all() -> None:
    """Clear the entire cache."""
    with _lock:
        _store.clear()
    logger.debug("[cache] All entries cleared.")


# ── Cache key constants ───────────────────────────────────────────────────────
KEY_TRAFFIC_ANALYTICS = "traffic_analytics"
KEY_PEAK_TIMES        = "peak_times"
