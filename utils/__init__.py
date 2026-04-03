"""
utils/__init__.py
Package initialiser for the traffic detection utilities.

Exposes the core public API of each module so imports
throughout the project stay clean and consistent.

Usage examples:
    from utils import detect, draw_boxes, generate_frames
    from utils import save_frame, get_recent_detections
    from utils import require_auth, record_error
"""

from utils.detector     import load_model, get_model, detect
from utils.visualizer   import draw_boxes
from utils.stream       import generate_frames
from utils.database     import (
    connect,
    is_connected,
    save_frame,
    get_recent_detections,
    get_traffic_analytics,
    get_peak_times,
    create_user,
    find_user_by_email,
)
from utils.auth         import require_auth, register_routes as register_auth_routes
from utils.rate_limiter import limiter, rate_limit_error_handler
from utils.cache        import get_cached, set_cache, invalidate
from utils.metrics      import track_inference, record_error, get_snapshot, register_metrics_route

__all__ = [
    # detector
    "load_model", "get_model", "detect",
    # visualizer
    "draw_boxes",
    # stream
    "generate_frames",
    # database
    "connect", "is_connected", "save_frame",
    "get_recent_detections", "get_traffic_analytics", "get_peak_times",
    "create_user", "find_user_by_email",
    # auth
    "require_auth", "register_auth_routes",
    # rate limiter
    "limiter", "rate_limit_error_handler",
    # cache
    "get_cached", "set_cache", "invalidate",
    # metrics
    "track_inference", "record_error", "get_snapshot", "register_metrics_route",
]
