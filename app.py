"""
app.py
Flask entry point for the Real-Time Traffic Detection System.

Endpoints:
    GET  /              → Status page (HTML dashboard)
    POST /predict       → Single image detection (JSON response)
    GET  /video_feed    → Live MJPEG webcam stream
"""

import os
import io
import logging

import cv2
import numpy as np
from flask import Flask, request, jsonify, Response, render_template, g
from flask_cors import CORS

from utils.detector   import load_model, detect
from utils.visualizer import draw_boxes
from utils.stream     import (
    generate_frames, generate_video_detection_stream,
    process_video_upload, allowed_video,
    request_stop, clear_stop, is_streaming
)
from utils.database   import (
    connect as db_connect,
    get_recent_detections,
    get_traffic_analytics,
    get_peak_times,
    is_connected,
)
from utils.rate_limiter import (
    limiter,
    rate_limit_error_handler,
    PREDICT_LIMIT,
    DETECTIONS_LIMIT,
    ANALYTICS_LIMIT,
)
from utils.auth    import require_auth, register_routes as register_auth_routes
from utils.metrics import register_metrics_route, record_error
from utils.cache import (
    get_cached, set_cache,
    KEY_TRAFFIC_ANALYTICS, KEY_PEAK_TIMES,
    TTL_ANALYTICS, TTL_PEAK_TIMES,
)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── App init ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024   # 500 MB (video uploads)

CORS(app)   # Allow cross-origin requests (needed for local frontend dev)

limiter.init_app(app)
app.register_error_handler(429, rate_limit_error_handler)
register_auth_routes(app)
register_metrics_route(app)

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "bmp", "webp"}


def allowed_file(filename: str) -> bool:
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


# ─────────────────────────────────────────────────────────────────────────────
# Route: /  — Serve frontend dashboard
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/")
def index():
    return render_template("index.html")


# ─────────────────────────────────────────────────────────────────────────────
# Route: POST /predict — single image detection
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/predict")
@limiter.limit(PREDICT_LIMIT)
@require_auth
def predict():
    """
    Accept an image file and return object detections as JSON.

    Request:
        multipart/form-data with field: "image"

    Response 200:
        {
            "objects": [
                {"label": "car", "confidence": 0.92, "bbox": [x1,y1,x2,y2]},
                ...
            ],
            "count": 3
        }

    Response 400 / 500:
        { "error": "<message>" }
    """
    # ── Validate request ──────────────────────────────────────────────────────
    if "image" not in request.files:
        return jsonify({"error": "No 'image' field in request."}), 400

    file = request.files["image"]

    if file.filename == "":
        return jsonify({"error": "Empty filename."}), 400

    if not allowed_file(file.filename):
        record_error("invalid_input")
        return jsonify({
            "error": f"Unsupported file type. Allowed: {ALLOWED_EXTENSIONS}"
        }), 400

    # ── Decode image ──────────────────────────────────────────────────────────
    try:
        img_bytes = file.read()
        np_arr    = np.frombuffer(img_bytes, np.uint8)
        image     = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if image is None:
            record_error("invalid_input")
            return jsonify({"error": "Could not decode image. Ensure it is a valid image file."}), 400

    except Exception as e:
        logger.error(f"[/predict] Image decode error: {e}")
        record_error("invalid_input")
        return jsonify({"error": "Failed to read image."}), 400

    # ── Run detection ─────────────────────────────────────────────────────────
    try:
        detections = detect(image, source="image", user_email=g.current_user)
    except Exception as e:
        logger.error(f"[/predict] Detection error: {e}")
        return jsonify({"error": "Inference failed. Please try again."}), 500

    # ── Format response ───────────────────────────────────────────────────────
    objects = [
        {
            "label":      d["label"],
            "confidence": d["conf"],
            "bbox":       d["bbox"],
        }
        for d in detections
    ]

    return jsonify({"objects": objects, "count": len(objects)})


# ─────────────────────────────────────────────────────────────────────────────
# Route: GET /detections — fetch stored detections from MongoDB
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/detections")
@limiter.limit(DETECTIONS_LIMIT)
@require_auth
def detections_list():
    """
    Fetch recent detection records from MongoDB.

    Query params:
        limit      (int):  Max records to return (default 50, max 200)
        start_time (str):  ISO 8601 lower bound  e.g. 2026-01-10T00:00:00Z
        end_time   (str):  ISO 8601 upper bound

    Response 200:
        [
            {
                "timestamp":     "2026-01-10T14:28:01Z",
                "source":        "video",
                "total_objects": 6,
                "detections":    [{"label": "car", "confidence": 0.89, "bbox": [...]}]
            }
        ]
    """
    if not is_connected():
        return jsonify({"error": "Database unavailable."}), 503

    try:
        limit = int(request.args.get("limit", 50))
    except ValueError:
        return jsonify({"error": "'limit' must be an integer."}), 400

    start_time = end_time = None
    try:
        from datetime import datetime
        raw_start = request.args.get("start_time")
        raw_end   = request.args.get("end_time")
        if raw_start:
            start_time = datetime.fromisoformat(raw_start.replace("Z", "+00:00"))
        if raw_end:
            end_time = datetime.fromisoformat(raw_end.replace("Z", "+00:00"))
    except ValueError as e:
        return jsonify({"error": f"Invalid datetime format: {e}"}), 400

    docs = get_recent_detections(limit=limit, start_time=start_time, end_time=end_time)
    for doc in docs:
        if "timestamp" in doc and hasattr(doc["timestamp"], "isoformat"):
            doc["timestamp"] = doc["timestamp"].isoformat()

    return jsonify(docs)


# ─────────────────────────────────────────────────────────────────────────────
# Route: GET /analytics/traffic — object class distribution
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/analytics/traffic")
@limiter.limit(ANALYTICS_LIMIT)
@require_auth
def analytics_traffic():
    """
    Total detection count per object class across all stored frames.

    Response 200:
        { "car": 342, "person": 120, "bus": 45, "bicycle": 30, "motorbike": 18 }
    """
    if not is_connected():
        return jsonify({"error": "Database unavailable."}), 503

    cached = get_cached(KEY_TRAFFIC_ANALYTICS)
    if cached is not None:
        return jsonify(cached)

    data = get_traffic_analytics()
    set_cache(KEY_TRAFFIC_ANALYTICS, data, ttl=TTL_ANALYTICS)
    return jsonify(data)


# ─────────────────────────────────────────────────────────────────────────────
# Route: GET /analytics/peak-time — busiest hours of day
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/analytics/peak-time")
@limiter.limit(ANALYTICS_LIMIT)
@require_auth
def analytics_peak_time():
    """
    Total detected objects grouped by hour-of-day (UTC), busiest first.

    Response 200:
        [
            { "hour": 8,  "total_objects": 1240, "frame_count": 310 },
            { "hour": 17, "total_objects": 980,  "frame_count": 245 }
        ]
    """
    if not is_connected():
        return jsonify({"error": "Database unavailable."}), 503

    cached = get_cached(KEY_PEAK_TIMES)
    if cached is not None:
        return jsonify(cached)

    data = get_peak_times()
    set_cache(KEY_PEAK_TIMES, data, ttl=TTL_PEAK_TIMES)
    return jsonify(data)


# ─────────────────────────────────────────────────────────────────────────────
# Route: GET /video_feed — live MJPEG stream
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/video_feed")
def video_feed():
    """
    Streams annotated webcam/video frames as MJPEG.
    Open in browser or embed in an <img> tag:
        <img src="/video_feed">
    """
    source = request.args.get("source", default=0)

    try:
        source = int(source)
    except (ValueError, TypeError):
        pass

    # Optional auth — video feed is public but passes user if token present
    user_email = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        from utils.auth import decode_token
        payload = decode_token(auth_header.split(" ", 1)[1].strip())
        if payload:
            user_email = payload.get("sub")

    return Response(
        generate_frames(source, user_email=user_email),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Route: POST /stop_feed — stop the active webcam stream
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/stop_feed")
def stop_feed():
    """
    Signal the active MJPEG stream to stop at the next frame boundary.
    The camera is released inside generate_frames() finally block.
    """
    request_stop()
    return jsonify({"message": "Stream stop requested."})


# ─────────────────────────────────────────────────────────────────────────────
# Route: GET /stream_status — check if stream is active
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/stream_status")
def stream_status():
    """Return whether the webcam stream is currently active."""
    return jsonify({"streaming": is_streaming()})


# ─────────────────────────────────────────────────────────────────────────────
# Route: POST /predict_video — uploaded video file detection
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/predict_video")
@limiter.limit(PREDICT_LIMIT)
@require_auth
def predict_video():
    """
    Accept an uploaded video file, run detection on every frame,
    and return a structured JSON summary.

    Request:
        multipart/form-data with field: "video"
        Supported formats: mp4, avi, mov, mkv, webm

    Response 200:
        {
            "total_frames":     120,
            "processed_frames": 34,
            "summary": { "car": 28, "person": 10, "motorbike": 4 },
            "detections_by_frame": [
                {
                    "frame":       12,
                    "timestamp_s": 0.48,
                    "objects": [
                        { "label": "car", "confidence": 0.91, "bbox": [...] }
                    ]
                },
                ...
            ]
        }

    Response 400: invalid/missing file
    Response 500: processing failure
    """
    import tempfile

    # ── Validate request ──────────────────────────────────────────────────────
    if "video" not in request.files:
        return jsonify({"error": "No 'video' field in request."}), 400

    file = request.files["video"]

    if file.filename == "":
        return jsonify({"error": "Empty filename."}), 400

    if not allowed_video(file.filename):
        record_error("invalid_input")
        return jsonify({
            "error": "Unsupported video format. Allowed: mp4, avi, mov, mkv, webm"
        }), 400

    # ── Save to temp file (OpenCV needs a real file path) ─────────────────────
    ext      = file.filename.rsplit(".", 1)[1].lower()
    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=f".{ext}", delete=False, dir="/tmp"
        ) as tmp:
            file.save(tmp)
            tmp_path = tmp.name

        logger.info(f"[/predict_video] Saved upload to: {tmp_path}")

        # ── Run detection across all frames ───────────────────────────────────
        result = process_video_upload(tmp_path, user_email=g.current_user)

        if not result:
            return jsonify({"error": "Video processing failed."}), 500

        return jsonify(result)

    except Exception as e:
        logger.error(f"[/predict_video] Error: {e}")
        record_error("inference")
        return jsonify({"error": "Video processing failed. Please try again."}), 500

    finally:
        # ── Always clean up the temp file ─────────────────────────────────────
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
            logger.info(f"[/predict_video] Temp file cleaned up: {tmp_path}")


# ─────────────────────────────────────────────────────────────────────────────
# Route: POST /upload_video_stream — upload video, get back stream path
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/upload_video_stream")
@limiter.limit(PREDICT_LIMIT)
@require_auth
def upload_video_stream():
    """
    Accept an uploaded video file, save it to /tmp, and return the temp path
    so the frontend can open GET /video_detection_stream?path=<tmp_path>.

    We keep the file alive until the stream finishes — a separate cleanup
    endpoint is called by the frontend when playback ends.

    Response 200:
        { "stream_url": "/video_detection_stream?path=<tmp_path>",
          "total_frames": 300, "fps": 25.0 }
    """
    import tempfile

    if "video" not in request.files:
        return jsonify({"error": "No 'video' field in request."}), 400

    file = request.files["video"]
    if file.filename == "":
        return jsonify({"error": "Empty filename."}), 400

    if not allowed_video(file.filename):
        record_error("invalid_input")
        return jsonify({"error": "Unsupported video format. Allowed: mp4, avi, mov, mkv, webm"}), 400

    ext = file.filename.rsplit(".", 1)[1].lower()
    try:
        with tempfile.NamedTemporaryFile(
            suffix=f".{ext}", delete=False, dir="/tmp", prefix="ts_vid_"
        ) as tmp:
            file.save(tmp)
            tmp_path = tmp.name

        # Read metadata without opening full stream
        import cv2 as _cv2
        cap = _cv2.VideoCapture(tmp_path)
        total_frames = int(cap.get(_cv2.CAP_PROP_FRAME_COUNT))
        fps          = cap.get(_cv2.CAP_PROP_FPS) or 25
        cap.release()

        logger.info(f"[/upload_video_stream] Saved to {tmp_path}, {total_frames} frames")

        return jsonify({
            "stream_url":    f"/video_detection_stream?path={tmp_path}",
            "tmp_path":      tmp_path,
            "total_frames":  total_frames,
            "fps":           round(fps, 2),
        })

    except Exception as e:
        logger.error(f"[/upload_video_stream] Error: {e}")
        return jsonify({"error": "Failed to prepare video for streaming."}), 500


# ─────────────────────────────────────────────────────────────────────────────
# Route: GET /video_detection_stream — stream annotated video frames as MJPEG
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/video_detection_stream")
def video_detection_stream():
    """
    Stream an uploaded video file with YOLO annotations as MJPEG.
    The ?path= query param must point to a valid /tmp/ts_vid_*.* file
    (created by POST /upload_video_stream).

    Embeds in browser via: <img src="/video_detection_stream?path=...">
    """
    tmp_path   = request.args.get("path", "")
    user_email = None

    # Validate the path — only allow our own temp files
    if not tmp_path or not tmp_path.startswith("/tmp/ts_vid_"):
        return jsonify({"error": "Invalid or missing path parameter."}), 400

    if not os.path.exists(tmp_path):
        return jsonify({"error": "Video file not found or already cleaned up."}), 404

    # Optional auth — read user from header if present
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        from utils.auth import decode_token
        payload = decode_token(auth_header.split(" ", 1)[1].strip())
        if payload:
            user_email = payload.get("sub")

    return Response(
        generate_video_detection_stream(tmp_path, user_email=user_email),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Route: POST /cleanup_video — delete temp video file after stream ends
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/cleanup_video")
def cleanup_video():
    """
    Delete a temp video file created by /upload_video_stream.
    Called by the frontend when the stream <img> finishes or user navigates away.
    """
    data     = request.get_json(silent=True) or {}
    tmp_path = data.get("path", "")

    if not tmp_path or not tmp_path.startswith("/tmp/ts_vid_"):
        return jsonify({"error": "Invalid path."}), 400

    try:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
            logger.info(f"[/cleanup_video] Deleted: {tmp_path}")
        return jsonify({"message": "Cleaned up."})
    except Exception as e:
        logger.error(f"[/cleanup_video] Failed: {e}")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# Startup
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logger.info("[app] 🔄 Loading YOLOv8 model at startup …")
    load_model()   # Eager load — avoids cold-start on first request

    logger.info("[app] 🔄 Connecting to MongoDB Atlas …")
    if db_connect():
        logger.info("[app] ✅ Database connected.")
    else:
        logger.warning("[app] ⚠️  Database unavailable — running without persistence.")

    logger.info("[app] 🚀 Starting Flask server on http://0.0.0.0:5000")
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,       # Set True during development
        threaded=True,     # Needed for concurrent streaming + predict calls
    )
