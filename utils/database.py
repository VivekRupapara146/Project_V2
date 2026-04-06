"""
database.py
MongoDB Atlas integration layer — production-hardened.

Additions over v1:
  - Exponential backoff retry on connect()
  - Background watchdog thread for auto-reconnect
  - Non-blocking async writes via queue + worker thread
  - Combined write strategy (every-N frames + min confidence)
  - Query helpers for /detections and /analytics endpoints
  - Graceful degradation — inference never blocked by DB failures
"""

import os
import time
import logging
import threading
import queue
from datetime import datetime, timezone

from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure, OperationFailure

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
MONGO_URI         = os.getenv("MONGO_URI", "mongodb+srv://vivekrupaparag_db_user:qSIOQy1VfdxgbXXy@cluster0.24idgza.mongodb.net/?appName=Cluster0")
DB_NAME           = os.getenv("DB_NAME",   "traffic_detection")
COLLECTION_FRAMES = "frames"
COLLECTION_USERS  = "users"

SAVE_EVERY_N_FRAMES    = 5
MIN_CONFIDENCE_TO_SAVE = 0.5

MAX_CONNECT_RETRIES = 5
RETRY_BASE_DELAY    = 1.0
WATCHDOG_INTERVAL   = 30

# ── Singleton state ───────────────────────────────────────────────────────────
_client: MongoClient | None           = None
_db                                   = None
_write_queue: queue.Queue             = queue.Queue(maxsize=500)
_worker_thread: threading.Thread | None  = None
_watchdog_thread: threading.Thread | None = None
_frame_counter: int                   = 0
_counter_lock                         = threading.Lock()
_connect_lock                         = threading.Lock()


# ─────────────────────────────────────────────────────────────────────────────
# Connection + Retry
# ─────────────────────────────────────────────────────────────────────────────

def _try_connect_once() -> bool:
    global _client, _db
    try:
        client = MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=5_000,
            connectTimeoutMS=5_000,
            socketTimeoutMS=10_000,
            maxPoolSize=10,
        )
        client.admin.command("ping")
        _client = client
        _db     = _client[DB_NAME]
        return True
    except Exception as e:
        logger.warning(f"[database] Connection attempt failed: {e}")
        return False


def connect() -> bool:
    global _client, _db
    with _connect_lock:
        if _client is not None:
            return True
        delay = RETRY_BASE_DELAY
        for attempt in range(1, MAX_CONNECT_RETRIES + 1):
            logger.info(f"[database] Connection attempt {attempt}/{MAX_CONNECT_RETRIES} ...")
            if _try_connect_once():
                _ensure_indexes()
                _start_write_worker()
                _start_watchdog()
                logger.info(f"[database] Connected to MongoDB Atlas — db: '{DB_NAME}'")
                return True
            if attempt < MAX_CONNECT_RETRIES:
                logger.info(f"[database] Retrying in {delay:.0f}s ...")
                time.sleep(delay)
                delay = min(delay * 2, 30)
        logger.error("[database] All connection attempts failed. Running without DB.")
        return False


def is_connected() -> bool:
    return _client is not None and _db is not None


def _ensure_indexes():
    try:
        frames = _db[COLLECTION_FRAMES]
        frames.create_index([("timestamp", DESCENDING)], name="idx_timestamp")
        frames.create_index(
            [("timestamp", ASCENDING), ("detections.label", ASCENDING)],
            name="idx_timestamp_label"
        )
        logger.info("[database] Indexes ensured.")
    except Exception as e:
        logger.warning(f"[database] Index creation warning: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Watchdog
# ─────────────────────────────────────────────────────────────────────────────

def _start_watchdog():
    global _watchdog_thread
    if _watchdog_thread and _watchdog_thread.is_alive():
        return
    _watchdog_thread = threading.Thread(target=_watchdog_loop, daemon=True, name="db-watchdog")
    _watchdog_thread.start()
    logger.info("[database] Watchdog thread started.")


def _watchdog_loop():
    global _client, _db
    while True:
        time.sleep(WATCHDOG_INTERVAL)
        if not is_connected():
            logger.info("[database] Watchdog: not connected — attempting reconnect ...")
            connect()
            continue
        try:
            _client.admin.command("ping")
        except Exception as e:
            logger.warning(f"[database] Watchdog: liveness check failed ({e}) — resetting.")
            with _connect_lock:
                _client = None
                _db     = None
            connect()


# ─────────────────────────────────────────────────────────────────────────────
# Async Write Worker
# ─────────────────────────────────────────────────────────────────────────────

def _start_write_worker():
    global _worker_thread
    if _worker_thread and _worker_thread.is_alive():
        return
    _worker_thread = threading.Thread(target=_write_loop, daemon=True, name="db-writer")
    _worker_thread.start()
    logger.info("[database] Background write worker started.")


def _write_loop():
    while True:
        try:
            doc = _write_queue.get(timeout=1)
            if doc is None:
                break
            if is_connected():
                _db[COLLECTION_FRAMES].insert_one(doc)
        except queue.Empty:
            continue
        except Exception as e:
            logger.error(f"[database] Write worker insert error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Write Strategy
# ─────────────────────────────────────────────────────────────────────────────

def should_save(detections: list[dict], source: str = "video") -> bool:
    global _frame_counter

    # Images are single intentional uploads — ALWAYS save them,
    # bypassing the every-N-frames counter entirely.
    if source == "image":
        if not detections:
            return False
        return any(d.get("conf", 0) >= MIN_CONFIDENCE_TO_SAVE for d in detections)

    # Video frames: apply every-N-frames + confidence filter
    with _counter_lock:
        _frame_counter += 1
        save_by_count = (_frame_counter % SAVE_EVERY_N_FRAMES == 0)

    if not save_by_count or not detections:
        return False
    return any(d.get("conf", 0) >= MIN_CONFIDENCE_TO_SAVE for d in detections)


def save_frame(detections: list[dict],
               source: str = "video",
               user_email: str = None) -> bool:
    if not is_connected() or not should_save(detections, source):
        return False
    doc = {
        "timestamp":     datetime.now(timezone.utc),
        "source":        source,
        "total_objects": len(detections),
        "user_email":    user_email,      # None if called from video stream
        "detections": [
            {"label": d["label"], "confidence": d["conf"], "bbox": d["bbox"]}
            for d in detections
        ],
    }
    try:
        _write_queue.put_nowait(doc)
        return True
    except queue.Full:
        logger.warning("[database] Write queue full — frame dropped.")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Query Helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_recent_detections(limit=50, start_time=None, end_time=None):
    if not is_connected():
        return []
    limit = min(limit, 200)
    query = {}
    if start_time or end_time:
        query["timestamp"] = {}
        if start_time:
            query["timestamp"]["$gte"] = start_time
        if end_time:
            query["timestamp"]["$lte"] = end_time
    try:
        return list(
            _db[COLLECTION_FRAMES]
            .find(query, {"_id": 0})
            .sort("timestamp", DESCENDING)
            .limit(limit)
        )
    except Exception as e:
        logger.error(f"[database] get_recent_detections error: {e}")
        return []


def get_traffic_analytics():
    if not is_connected():
        return {}
    pipeline = [
        {"$unwind": "$detections"},
        {"$group": {"_id": "$detections.label", "count": {"$sum": 1}}},
        {"$sort": {"count": DESCENDING}},
    ]
    try:
        return {r["_id"]: r["count"] for r in _db[COLLECTION_FRAMES].aggregate(pipeline)}
    except Exception as e:
        logger.error(f"[database] get_traffic_analytics error: {e}")
        return {}


def get_peak_times():
    if not is_connected():
        return []
    pipeline = [
        {"$group": {
            "_id":           {"hour": {"$hour": "$timestamp"}},
            "total_objects": {"$sum": "$total_objects"},
            "frame_count":   {"$sum": 1},
        }},
        {"$project": {
            "_id": 0, "hour": "$_id.hour",
            "total_objects": 1, "frame_count": 1,
        }},
        {"$sort": {"total_objects": DESCENDING}},
    ]
    try:
        return list(_db[COLLECTION_FRAMES].aggregate(pipeline))
    except Exception as e:
        logger.error(f"[database] get_peak_times error: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# User Helpers
# ─────────────────────────────────────────────────────────────────────────────

def create_user(username, email, password_hash):
    if not is_connected():
        return False
    try:
        _db[COLLECTION_USERS].insert_one({
            "username":      username,
            "email":         email,
            "password_hash": password_hash,
            "created_at":    datetime.now(timezone.utc),
        })
        return True
    except Exception as e:
        logger.error(f"[database] create_user error: {e}")
        return False


def find_user_by_email(email):
    if not is_connected():
        return None
    try:
        return _db[COLLECTION_USERS].find_one({"email": email}, {"_id": 0})
    except Exception as e:
        logger.error(f"[database] find_user_by_email error: {e}")
        return None
