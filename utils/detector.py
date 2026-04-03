"""
detector.py
Core inference logic using YOLOv8.

v3 additions:
  - track_inference() context manager wraps model call for latency/FPS metrics
  - record_error("inference") on any model failure
  - DB save errors recorded as record_error("db_write")
"""

from ultralytics import YOLO
import numpy as np
import os
import logging

logger = logging.getLogger(__name__)

_model = None
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "model", "best.pt")
CONFIDENCE_THRESHOLD = 0.4
ALLOWED_CLASSES = {"person", "bicycle", "car", "bus", "motorbike", "traffic light"}


def load_model():
    global _model
    if _model is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Model file not found at: {MODEL_PATH}\n"
                "Please place best.pt inside the /model directory."
            )
        _model = YOLO(MODEL_PATH)
        logger.info(f"[detector] Model loaded from: {MODEL_PATH}")
    return _model


def get_model():
    global _model
    if _model is None:
        load_model()
    return _model


def detect(image: np.ndarray, source: str = "video") -> list[dict]:
    """
    Run YOLOv8 inference on a single BGR image.
    Records latency/FPS via metrics and saves to DB asynchronously.

    Args:
        image  (np.ndarray): BGR frame from OpenCV.
        source (str):        "video" | "image"

    Returns:
        list[dict]: Detections with label, conf, bbox.
    """
    if image is None or not isinstance(image, np.ndarray):
        from utils.metrics import record_error
        record_error("invalid_input")
        raise ValueError("Invalid input: expected a numpy ndarray image.")

    model = get_model()

    # ── Timed inference ───────────────────────────────────────────────────────
    try:
        from utils.metrics import track_inference
        with track_inference():
            results = model(image, verbose=False)[0]
    except Exception as e:
        from utils.metrics import record_error
        record_error("inference")
        logger.error(f"[detector] Inference error: {e}")
        raise

    detections = []
    for box in results.boxes:
        conf = float(box.conf[0])
        if conf < CONFIDENCE_THRESHOLD:
            continue
        cls_id = int(box.cls[0])
        label  = results.names.get(cls_id, f"class_{cls_id}")

        if label not in ALLOWED_CLASSES:
            continue
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        detections.append({
            "label": label,
            "conf":  round(conf, 4),
            "bbox":  [round(x1), round(y1), round(x2), round(y2)]
        })

    # ── Non-blocking DB write ─────────────────────────────────────────────────
    try:
        from utils.database import save_frame
        save_frame(detections, source=source)
    except Exception as e:
        from utils.metrics import record_error
        record_error("db_write")
        logger.warning(f"[detector] DB save skipped: {e}")

    return detections
