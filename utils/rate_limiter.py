"""
rate_limiter.py
Centralised rate limiting configuration using Flask-Limiter.

Storage backends:
  - Local dev  : in-memory (default, no setup needed)
  - Render/Prod: Redis via REDIS_URL environment variable

Usage in app.py:
    from utils.rate_limiter import limiter, DEFAULT_LIMITS
    limiter.init_app(app)

    @app.post("/predict")
    @limiter.limit("30 per minute")
    def predict(): ...
"""

import os
import logging
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

logger = logging.getLogger(__name__)

# ── Storage backend ───────────────────────────────────────────────────────────
# Set REDIS_URL env var on Render to switch to Redis automatically.
# Locally: uses in-memory storage (resets on restart — fine for dev).
REDIS_URL = os.getenv("REDIS_URL", None)

storage_uri = REDIS_URL if REDIS_URL else "memory://"

if REDIS_URL:
    logger.info(f"[rate_limiter] Using Redis storage: {REDIS_URL}")
else:
    logger.info("[rate_limiter] Using in-memory storage (local dev mode).")

# ── Limiter instance ──────────────────────────────────────────────────────────
limiter = Limiter(
    key_func=get_remote_address,         # rate limit per client IP
    default_limits=["200 per day", "50 per hour"],
    storage_uri=storage_uri,
    strategy="fixed-window",             # simple and predictable
)

# ── Per-endpoint limit strings (import these in app.py) ──────────────────────
PREDICT_LIMIT    = "30 per minute"       # YOLO inference is expensive
DETECTIONS_LIMIT = "60 per minute"       # DB read — less costly
ANALYTICS_LIMIT  = "20 per minute"       # aggregation queries


def rate_limit_error_handler(e):
    """
    Return a clean JSON 429 response instead of Flask-Limiter's default HTML.
    Register this in app.py via:
        app.register_error_handler(429, rate_limit_error_handler)
    """
    from flask import jsonify
    return jsonify({
        "error":   "Rate limit exceeded.",
        "message": str(e.description),
    }), 429
