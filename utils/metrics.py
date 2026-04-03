"""
metrics.py
Lightweight in-process monitoring system.

Tracks:
  - Inference latency (rolling average + min/max/p95)
  - FPS (frames processed per second, rolling 10s window)
  - DB write queue size
  - Error counts per category
  - Uptime

No external dependencies. Exposes a JSON snapshot via GET /metrics.

Usage:
    # In detector.py — wrap detect() automatically:
    from utils.metrics import track_inference

    with track_inference():
        results = model(image, verbose=False)[0]

    # In app.py — register the /metrics endpoint:
    from utils.metrics import register_metrics_route
    register_metrics_route(app)

    # Record errors anywhere:
    from utils.metrics import record_error
    record_error("db_write")
    record_error("inference")
    record_error("invalid_input")
"""

import time
import threading
import logging
from collections import deque
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
FPS_WINDOW_SECONDS   = 10     # rolling window for FPS calculation
LATENCY_HISTORY_SIZE = 200    # number of recent inference times to keep


# ─────────────────────────────────────────────────────────────────────────────
# Internal State
# ─────────────────────────────────────────────────────────────────────────────

_lock = threading.Lock()

# Inference latency — store recent durations in ms
_latency_history: deque = deque(maxlen=LATENCY_HISTORY_SIZE)

# FPS — store timestamps of recent frame completions
_frame_timestamps: deque = deque()

# Error counters — keyed by category string
_error_counts: dict[str, int] = {}

# App start time
_start_time: float = time.monotonic()


# ─────────────────────────────────────────────────────────────────────────────
# Inference Timing
# ─────────────────────────────────────────────────────────────────────────────

@contextmanager
def track_inference():
    """
    Context manager that measures inference duration and records it.

    Usage:
        with track_inference():
            results = model(image, verbose=False)[0]
    """
    t0 = time.perf_counter()
    try:
        yield
    finally:
        elapsed_ms = (time.perf_counter() - t0) * 1000
        _record_latency(elapsed_ms)
        _record_frame()


def _record_latency(ms: float):
    with _lock:
        _latency_history.append(ms)


def _record_frame():
    """Record a frame completion timestamp for FPS calculation."""
    now = time.monotonic()
    with _lock:
        _frame_timestamps.append(now)
        # Evict timestamps outside the rolling window
        cutoff = now - FPS_WINDOW_SECONDS
        while _frame_timestamps and _frame_timestamps[0] < cutoff:
            _frame_timestamps.popleft()


# ─────────────────────────────────────────────────────────────────────────────
# Error Tracking
# ─────────────────────────────────────────────────────────────────────────────

def record_error(category: str = "general"):
    """
    Increment the error counter for a given category.

    Categories used in this project:
        "inference"     — YOLO model errors
        "db_write"      — MongoDB insert failures
        "db_connect"    — Atlas connection failures
        "invalid_input" — Bad image uploads
        "auth"          — JWT / login failures
        "stream"        — Video capture errors
    """
    with _lock:
        _error_counts[category] = _error_counts.get(category, 0) + 1
    logger.debug(f"[metrics] Error recorded: {category}")


# ─────────────────────────────────────────────────────────────────────────────
# Snapshot Computation
# ─────────────────────────────────────────────────────────────────────────────

def _percentile(sorted_data: list[float], p: float) -> float:
    """Compute percentile p (0–100) from a pre-sorted list."""
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * p / 100
    f = int(k)
    c = f + 1
    if c >= len(sorted_data):
        return round(sorted_data[f], 2)
    return round(sorted_data[f] + (k - f) * (sorted_data[c] - sorted_data[f]), 2)


def get_snapshot() -> dict:
    """
    Return a full metrics snapshot as a serialisable dict.

    Called by GET /metrics — safe to call frequently.
    """
    now = time.monotonic()

    with _lock:
        # ── Inference latency ─────────────────────────────────────────────────
        latencies = list(_latency_history)
        frame_ts  = list(_frame_timestamps)
        errors    = dict(_error_counts)

    # ── Latency stats ─────────────────────────────────────────────────────────
    if latencies:
        sorted_lat = sorted(latencies)
        latency_stats = {
            "avg_ms":    round(sum(latencies) / len(latencies), 2),
            "min_ms":    round(sorted_lat[0], 2),
            "max_ms":    round(sorted_lat[-1], 2),
            "p95_ms":    _percentile(sorted_lat, 95),
            "samples":   len(latencies),
        }
    else:
        latency_stats = {
            "avg_ms": 0, "min_ms": 0, "max_ms": 0, "p95_ms": 0, "samples": 0
        }

    # ── FPS ───────────────────────────────────────────────────────────────────
    cutoff = now - FPS_WINDOW_SECONDS
    recent_frames = [t for t in frame_ts if t >= cutoff]
    fps = round(len(recent_frames) / FPS_WINDOW_SECONDS, 2) if recent_frames else 0.0

    # ── DB queue size ─────────────────────────────────────────────────────────
    db_queue_size = _get_db_queue_size()

    # ── Uptime ────────────────────────────────────────────────────────────────
    uptime_seconds = round(now - _start_time)
    uptime_str = _format_uptime(uptime_seconds)

    # ── Total errors ─────────────────────────────────────────────────────────
    total_errors = sum(errors.values())

    return {
        "uptime":          uptime_str,
        "uptime_seconds":  uptime_seconds,
        "inference": {
            **latency_stats,
            "fps": fps,
        },
        "database": {
            "connected":  _get_db_connected(),
            "queue_size": db_queue_size,
        },
        "errors": {
            "total":      total_errors,
            "by_category": errors,
        },
    }


def _get_db_queue_size() -> int:
    """Safely read the DB write queue size without hard-importing at module level."""
    try:
        from utils.database import _write_queue
        return _write_queue.qsize()
    except Exception:
        return -1


def _get_db_connected() -> bool:
    try:
        from utils.database import is_connected
        return is_connected()
    except Exception:
        return False


def _format_uptime(seconds: int) -> str:
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    return f"{h}h {m}m {s}s"


# ─────────────────────────────────────────────────────────────────────────────
# Flask Route Registration
# ─────────────────────────────────────────────────────────────────────────────

def register_metrics_route(app):
    """
    Register GET /metrics on the Flask app.
    Call this in app.py:  register_metrics_route(app)

    Response 200:
    {
        "uptime": "2h 14m 33s",
        "uptime_seconds": 8073,
        "inference": {
            "avg_ms": 28.4,
            "min_ms": 21.1,
            "max_ms": 67.3,
            "p95_ms": 51.2,
            "samples": 142,
            "fps": 24.6
        },
        "database": {
            "connected": true,
            "queue_size": 3
        },
        "errors": {
            "total": 2,
            "by_category": { "invalid_input": 2 }
        }
    }
    """
    from flask import jsonify

    @app.get("/metrics")
    def metrics():
        return jsonify(get_snapshot())
