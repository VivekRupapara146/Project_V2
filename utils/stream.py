"""
stream.py
Real-time video capture, inference, and MJPEG frame generation.
Designed to be consumed by Flask's streaming response.
"""

import os
import cv2
import logging
import threading
from utils.detector   import detect
from utils.visualizer import draw_boxes

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
FRAME_WIDTH  = 640
FRAME_HEIGHT = 480
TARGET_FPS   = 30

# Allowed video upload extensions
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "avi", "mov", "mkv", "webm"}

_stop_event = threading.Event()
_is_streaming = False

def request_stop():
    """Request the video stream to stop."""
    _stop_event.set()

def clear_stop():
    """Clear the stop request."""
    _stop_event.clear()

def is_streaming() -> bool:
    """Return whether a stream is currently active."""
    return _is_streaming


def _open_capture(source) -> cv2.VideoCapture:
    """
    Open a VideoCapture from webcam index (int) or file/URL (str).
    Raises RuntimeError if the source cannot be opened.
    """
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(
            f"Cannot open video source: {source!r}. "
            "Check camera permissions or file path."
        )
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
    cap.set(cv2.CAP_PROP_FPS,          TARGET_FPS)
    return cap


def allowed_video(filename: str) -> bool:
    """Return True if the filename has an allowed video extension."""
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_VIDEO_EXTENSIONS
    )


def generate_frames(source=0, user_email: str = None):
    """
    Generator that yields MJPEG-encoded bytes for Flask streaming.

    Args:
        source     : Webcam index (default 0) or path to video file / RTSP URL.
        user_email : Logged-in user's email — passed to detect() for DB storage.

    Yields:
        bytes: Encoded JPEG frame ready for HTTP streaming.
    """
    global _is_streaming

    try:
        cap = _open_capture(source)
    except RuntimeError as e:
        logger.error(str(e))
        return

    logger.info(f"[stream] 🎥 Streaming started from source: {source!r}")
    _is_streaming = True
    clear_stop()

    try:
        while not _stop_event.is_set():
            success, frame = cap.read()

            if not success:
                logger.warning("[stream] ⚠️  Failed to read frame — stream may have ended.")
                break

            frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))

            try:
                detections = detect(frame, source="video", user_email=user_email)
                frame      = draw_boxes(frame, detections)
            except Exception as e:
                logger.error(f"[stream] Inference error: {e}")

            success, buffer = cv2.imencode(
                ".jpg", frame,
                [cv2.IMWRITE_JPEG_QUALITY, 85]
            )
            if not success:
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + buffer.tobytes()
                + b"\r\n"
            )

    finally:
        _is_streaming = False
        cap.release()
        logger.info("[stream] 🛑 Camera released.")


def process_video_upload(video_path: str, user_email: str = None) -> dict:
    """
    Run detection on every frame of an uploaded video file.
    Does NOT stream — processes fully and returns a structured summary.

    Args:
        video_path  (str): Absolute path to the saved temp video file.
        user_email  (str): Logged-in user's email for DB storage.

    Returns:
        dict: {
            "total_frames":    int,
            "processed_frames": int,   # frames that had detections
            "detections_by_frame": [
                {
                    "frame":      int,
                    "timestamp_s": float,
                    "objects": [ { "label", "confidence", "bbox" } ]
                }
            ],
            "summary": { "car": 12, "person": 5, ... }
        }
    """
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open uploaded video: {video_path}")
    except Exception as e:
        logger.error(f"[stream] process_video_upload open error: {e}")
        return {}

    fps          = cap.get(cv2.CAP_PROP_FPS) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    detections_by_frame = []
    summary: dict[str, int] = {}
    frame_index = 0

    logger.info(f"[stream] 📹 Processing uploaded video: {total_frames} frames @ {fps:.1f} FPS")

    try:
        while True:
            success, frame = cap.read()
            if not success:
                break

            frame_index += 1
            frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))

            try:
                detections = detect(frame, source="video", user_email=user_email)
            except Exception as e:
                logger.error(f"[stream] Frame {frame_index} inference error: {e}")
                detections = []

            if detections:
                timestamp_s = round(frame_index / fps, 3)
                detections_by_frame.append({
                    "frame":       frame_index,
                    "timestamp_s": timestamp_s,
                    "objects": [
                        {
                            "label":      d["label"],
                            "confidence": d["conf"],
                            "bbox":       d["bbox"],
                        }
                        for d in detections
                    ],
                })
                # Build summary counts
                for d in detections:
                    summary[d["label"]] = summary.get(d["label"], 0) + 1

    finally:
        cap.release()
        logger.info(f"[stream] ✅ Video processing complete. "
                    f"{len(detections_by_frame)} frames had detections.")

    return {
        "total_frames":        total_frames,
        "processed_frames":    len(detections_by_frame),
        "detections_by_frame": detections_by_frame,
        "summary":             summary,
    }

