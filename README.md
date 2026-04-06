# 🚦 TrafficSense AI — Real-Time Traffic Detection System

A production-grade, full-stack traffic object detection platform built with **YOLOv8**, **Flask**, and **MongoDB Atlas**. Features a live annotated video stream, image/video upload detection, JWT authentication, analytics dashboard, and real-time system metrics.

---

## Project Structure

```
project/
├── app.py                        # Flask entry point + all API routes
├── requirements.txt
├── model/
│   └── best.pt                   # ← Place your YOLOv8 model here
│
├── templates/
│   └── index.html                # Frontend SPA dashboard
│
├── static/
│   ├── css/
│   │   └── main.css              # All dashboard styles
│   └── js/
│       ├── app.js                # Auth, navigation, API helper
│       ├── metrics.js            # Live sidebar metrics polling
│       ├── charts.js             # Dashboard + analytics charts
│       ├── feed.js               # Live MJPEG feed rendering
│       ├── upload.js             # Image/video upload + results
│       ├── alerts.js             # Alert list + filtering
│       ├── zones.js              # Zone status rendering
│       └── reports.js            # Reports list + download
│
└── utils/
    ├── __init__.py               # Package exports
    ├── detector.py               # YOLOv8 inference (singleton)
    ├── visualizer.py             # Bounding box drawing
    ├── stream.py                 # Webcam/video MJPEG streaming
    ├── database.py               # MongoDB Atlas (retry + watchdog)
    ├── auth.py                   # JWT register/login + decorator
    ├── rate_limiter.py           # Per-endpoint rate limiting
    ├── cache.py                  # In-memory TTL cache
    └── metrics.py                # Inference/FPS/error tracking
```

---

## Setup

**1. Install dependencies**
```bash
pip install -r requirements.txt
```

**2. Place your YOLOv8 model**
```
model/best.pt
```

**3. Set environment variables**
```bash
# Required
export MONGO_URI="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority"
export JWT_SECRET="your-strong-random-secret-here"

# Optional
export DB_NAME="traffic_detection"        # default: traffic_detection
export JWT_EXPIRY_HOURS=24                # default: 24
export REDIS_URL="redis://..."            # for rate limiting on Render/cloud
```

**4. Run the server**
```bash
python app.py
```

Open `http://localhost:5000` — the login modal appears automatically.

---

## First Time Use

1. Open `http://localhost:5000`
2. Click **Create one** to register a new account
3. Fill in username, email, and password (min 8 characters)
4. You are automatically logged in after registration
5. The full dashboard loads — upload an image, open Live Feed, or check Analytics

---

## API Endpoints

All endpoints except `/`, `/auth/register`, `/auth/login`, and `/video_feed` require a JWT token in the `Authorization` header.

```
Authorization: Bearer <token>
```

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Login and receive JWT token |

**Register:**
```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "vivek", "email": "vivek@example.com", "password": "secret123"}'
```

**Login:**
```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "vivek@example.com", "password": "secret123"}'
# Response: { "token": "<jwt>", "expires_in_hours": 24 }
```

---

### Detection

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/predict` | Upload image → JSON detections |
| `POST` | `/predict_video` | Upload video → per-frame JSON results |
| `GET`  | `/video_feed` | Live annotated MJPEG webcam stream |

**Image detection:**
```bash
curl -X POST http://localhost:5000/predict \
  -H "Authorization: Bearer <token>" \
  -F "image=@photo.jpg"
```
```json
{
  "objects": [
    { "label": "car",    "confidence": 0.92, "bbox": [120, 80, 340, 220] },
    { "label": "person", "confidence": 0.87, "bbox": [400, 60, 460, 210] }
  ],
  "count": 2
}
```

**Video detection:**
```bash
curl -X POST http://localhost:5000/predict_video \
  -H "Authorization: Bearer <token>" \
  -F "video=@traffic.mp4"
```
```json
{
  "total_frames": 300,
  "processed_frames": 87,
  "summary": { "car": 142, "person": 31, "motorbike": 9 },
  "detections_by_frame": [
    { "frame": 5, "timestamp_s": 0.2, "objects": [...] }
  ]
}
```

**Live stream** — open in browser or embed in HTML:
```html
<img src="http://localhost:5000/video_feed" />
```
Switch webcam: `http://localhost:5000/video_feed?source=1`

---

### Data & Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/detections` | Recent detection records from MongoDB |
| `GET` | `/analytics/traffic` | Object class distribution totals |
| `GET` | `/analytics/peak-time` | Busiest hours of day |
| `GET` | `/metrics` | Live system metrics snapshot |

**Recent detections:**
```bash
curl "http://localhost:5000/detections?limit=20" \
  -H "Authorization: Bearer <token>"

# With time filter:
curl "http://localhost:5000/detections?start_time=2026-04-01T00:00:00Z" \
  -H "Authorization: Bearer <token>"
```

**Traffic distribution:**
```bash
curl http://localhost:5000/analytics/traffic \
  -H "Authorization: Bearer <token>"
# { "car": 342, "person": 120, "bus": 45, "motorbike": 18 }
```

**Peak hours:**
```bash
curl http://localhost:5000/analytics/peak-time \
  -H "Authorization: Bearer <token>"
# [{ "hour": 8, "total_objects": 1240, "frame_count": 310 }, ...]
```

**System metrics** (no auth required):
```bash
curl http://localhost:5000/metrics
```
```json
{
  "uptime": "2h 14m 33s",
  "inference": { "avg_ms": 28.4, "min_ms": 21.1, "max_ms": 67.3, "p95_ms": 51.2, "fps": 24.6 },
  "database":  { "connected": true, "queue_size": 3 },
  "errors":    { "total": 2, "by_category": { "invalid_input": 2 } }
}
```

---

## Detectable Classes

| Class         | Confidence Filter | Color in UI |
|---------------|-------------------|-------------|
| car           | ≥ 0.4             | Cyan        |
| person        | ≥ 0.4             | Green       |
| bus           | ≥ 0.4             | Purple      |
| motorbike     | ≥ 0.4             | Red         |
| bicycle       | ≥ 0.4             | Green       |
| traffic light | ≥ 0.4             | Amber       |

---

## Configuration Reference

| Parameter              | File            | Default   | Description |
|------------------------|-----------------|-----------|-------------|
| `CONFIDENCE_THRESHOLD` | `detector.py`   | `0.4`     | Min confidence to include a detection |
| `ALLOWED_CLASSES`      | `detector.py`   | 6 classes | Classes the model will report |
| `FRAME_WIDTH`          | `stream.py`     | `640`     | Resize width for inference |
| `FRAME_HEIGHT`         | `stream.py`     | `480`     | Resize height for inference |
| `TARGET_FPS`           | `stream.py`     | `30`      | Webcam target FPS |
| `JPEG_QUALITY`         | `stream.py`     | `85`      | Stream JPEG compression quality |
| `MAX_CONTENT_LENGTH`   | `app.py`        | `500 MB`  | Max file upload size |
| `SAVE_EVERY_N_FRAMES`  | `database.py`   | `5`       | Save 1 in every N video frames |
| `MIN_CONFIDENCE_TO_SAVE` | `database.py` | `0.5`     | Min confidence to trigger DB write |
| `MAX_CONNECT_RETRIES`  | `database.py`   | `5`       | Atlas connection retry attempts |
| `WATCHDOG_INTERVAL`    | `database.py`   | `30s`     | DB liveness check frequency |
| `TTL_ANALYTICS`        | `cache.py`      | `60s`     | Analytics cache expiry |
| `TTL_PEAK_TIMES`       | `cache.py`      | `120s`    | Peak time cache expiry |
| `METRICS_INTERVAL`     | `metrics.js`    | `5s`      | Frontend metrics poll frequency |

---

## Frontend Dashboard Pages

| Page       | What it shows |
|------------|---------------|
| Dashboard  | Stat cards, upload & analyze, vehicle breakdown, hourly/weekly charts |
| Live Feed  | Real YOLOv8 annotated webcam stream + mock secondary cameras |
| Analytics  | Real data from `/analytics/traffic` and `/analytics/peak-time` |
| Reports    | Downloadable report list (mock, ready for backend wiring) |
| Zones      | Zone congestion overview (mock, ready for backend wiring) |
| Alerts     | Alert list with filtering and mark-read |
| Settings   | Detection, notification, system, display toggles |

---

## Testing

**Test detector independently (no Flask):**
```python
import cv2
from utils.detector import detect

img = cv2.imread("test.jpg")
results = detect(img, source="image", user_email="test@example.com")
print(results)
```

**Test visualizer:**
```python
import cv2
from utils.detector   import detect
from utils.visualizer import draw_boxes

img        = cv2.imread("test.jpg")
detections = detect(img)
annotated  = draw_boxes(img, detections)
cv2.imwrite("output.jpg", annotated)
```

**Test DB connection:**
```python
from utils.database import connect, is_connected
connect()
print("Connected:", is_connected())
```

**Test auth token:**
```python
from utils.auth import generate_token, decode_token
token   = generate_token("test@example.com")
payload = decode_token(token)
print(payload)
```

---

## Security Notes

- JWT tokens expire after 24 hours (configurable via `JWT_EXPIRY_HOURS`)
- Passwords are hashed with **bcrypt** — never stored in plain text
- All detection and analytics endpoints require a valid JWT
- Rate limiting protects `/predict` (30/min), `/detections` (60/min), analytics (20/min)
- Never commit `MONGO_URI` or `JWT_SECRET` to source control — always use environment variables
- Set `debug=False` in `app.py` before deploying to production

---

## Future Extensions

- [ ] Object tracking with DeepSORT
- [ ] Vehicle counting per zone / ROI
- [ ] Speed estimation
- [ ] Docker + docker-compose deployment
- [ ] RTSP / IP camera support
- [ ] Real camera wiring for secondary Live Feed cards
- [ ] Analytics time-range filter wiring (24h / 7d / 30d buttons)
- [ ] Zone and Report data from MongoDB
