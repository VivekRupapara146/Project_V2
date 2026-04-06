/* ═══════════════════════════════════════════════════
   feed.js
   Live feed — real /video_feed MJPEG stream
   with guarded Start / Stop webcam control.
═══════════════════════════════════════════════════ */

const cameras = [
  { id: 'CAM-01', zone: 'Live Webcam Feed',    status: 'live',    vehicles: 0,   primary: true  },
  { id: 'CAM-02', zone: 'Highway I-95 North',  status: 'live',    vehicles: 128, primary: false },
  { id: 'CAM-03', zone: 'Airport Boulevard',    status: 'live',    vehicles: 67,  primary: false },
  { id: 'CAM-04', zone: 'City Center Bridge',   status: 'live',    vehicles: 89,  primary: false },
  { id: 'CAM-05', zone: 'Industrial Zone A',    status: 'offline', vehicles: 0,   primary: false },
  { id: 'CAM-06', zone: 'Residential District', status: 'live',    vehicles: 23,  primary: false },
];

// ── Guards — prevent duplicate start/stop calls ───
let _streaming   = false;
let _stopInFlight = false;

function renderFeed() {
  const grid = document.getElementById('feed-grid');
  grid.innerHTML = cameras.map((cam, i) => {
    if (cam.primary) {
      return `
        <div class="feed-card fade-in d1">
          <div class="feed-video" style="background:#000;position:relative;" id="primary-feed-wrap">

            <!-- Stopped state (default) -->
            <div id="feed-stopped-state"
              style="position:absolute;inset:0;display:flex;flex-direction:column;
                     align-items:center;justify-content:center;gap:10px;
                     background:rgba(8,12,24,0.96);">
              <i class="fa-solid fa-video" style="font-size:28px;color:rgba(0,212,255,0.4);"></i>
              <span style="font-size:12px;color:var(--text3);">Webcam is off</span>
              <button onclick="startWebcam()" class="btn btn-grad" style="padding:7px 18px;font-size:12px;">
                <i class="fa-solid fa-play"></i> Start Feed
              </button>
            </div>

            <!-- Live stream img — NO onerror handler (MJPEG triggers browser errors normally) -->
            <img
              id="webcam-img"
              src=""
              alt="Live detection feed"
              style="width:100%;height:100%;object-fit:cover;display:none;"
            />

            <!-- LIVE badge -->
            <div class="feed-status-tl" id="feed-status-badge" style="display:none;">
              <div style="width:6px;height:6px;border-radius:50%;background:#22c55e;
                          animation:pulseDot 2s ease infinite;
                          box-shadow:0 0 6px rgba(34,197,94,0.7);"></div>
              <span style="color:#22c55e;">LIVE</span>
            </div>
            <div class="feed-cam-id">CAM-01</div>

            <!-- Stop button — shown only while streaming -->
            <div id="feed-stop-btn"
              style="display:none;position:absolute;bottom:10px;
                     left:50%;transform:translateX(-50%);">
              <button onclick="stopWebcam()"
                style="padding:6px 16px;border-radius:8px;
                       background:rgba(239,68,68,0.85);
                       border:1px solid rgba(239,68,68,0.5);
                       color:#fff;font-size:11px;font-weight:600;
                       font-family:var(--font);cursor:pointer;
                       display:flex;align-items:center;gap:6px;">
                <i class="fa-solid fa-stop"></i> Stop Feed
              </button>
            </div>

          </div>
          <div class="feed-info">
            <div class="feed-zone">Live Webcam Feed</div>
            <div class="feed-meta" id="feed-meta-label">
              CAM-01 &nbsp;·&nbsp; <span style="color:var(--text3);">Webcam off</span>
            </div>
          </div>
        </div>`;
    }

    // ── Secondary mock cameras ────────────────────
    return `
      <div class="feed-card fade-in d${(i % 6) + 1}">
        <div class="feed-video">
          ${cam.status === 'live' ? `
            <div class="feed-grid-bg"></div>
            <div style="position:absolute;top:18%;left:12%;width:20%;height:30%;
                        border:1.5px solid #00d4ff;border-radius:4px;
                        box-shadow:0 0 8px rgba(0,212,255,0.3);">
              <div style="position:absolute;top:-14px;left:0;
                          background:rgba(0,212,255,0.2);color:#00d4ff;
                          font-size:8px;padding:1px 5px;border-radius:3px;">Car 0.94</div>
            </div>
            <div class="scan-overlay"><div class="scan-line"></div></div>
          ` : `
            <div class="feed-offline">
              <i class="fa-solid fa-video-slash"></i><span>Camera Offline</span>
            </div>
          `}
          <div class="feed-status-tl">
            <div style="width:6px;height:6px;border-radius:50%;
                        background:${cam.status === 'live' ? '#22c55e' : '#ef4444'};
                        ${cam.status === 'live'
                          ? 'animation:pulseDot 2s ease infinite;box-shadow:0 0 6px rgba(34,197,94,0.7);'
                          : ''}"></div>
            <span style="color:${cam.status === 'live' ? '#22c55e' : '#ef4444'};">
              ${cam.status.toUpperCase()}
            </span>
          </div>
          <div class="feed-cam-id">${cam.id}</div>
          ${cam.status === 'live'
            ? `<div class="feed-count">
                 <i class="fa-solid fa-car"></i>
                 <span id="cnt-${cam.id}">${cam.vehicles}</span>
               </div>`
            : ''}
        </div>
        <div class="feed-info">
          <div class="feed-zone">${cam.zone}</div>
          <div class="feed-meta">
            ${cam.id}
            ${cam.status === 'live'
              ? `&nbsp;·&nbsp;<span style="color:var(--cyan);font-family:monospace;">
                   ${Math.floor(38 + Math.random() * 18)} km/h avg
                 </span>`
              : '&nbsp;·&nbsp;Feed unavailable'}
          </div>
        </div>
      </div>`;
  }).join('');

  // Animate secondary camera vehicle counters
  cameras.filter(c => c.status === 'live' && !c.primary).forEach(cam => {
    setInterval(() => {
      const el = document.getElementById('cnt-' + cam.id);
      if (el) el.textContent = Math.max(0,
        parseInt(el.textContent) + Math.floor(Math.random() * 7 - 3));
    }, 2500);
  });
}

/* ═══════════════════════════════════════════════════
   START WEBCAM
   Sets img.src to /video_feed which opens the
   Flask MJPEG generator. Guard prevents double-start.
═══════════════════════════════════════════════════ */
function startWebcam() {
  // Guard: ignore if already streaming
  if (_streaming) return;

  const img       = document.getElementById('webcam-img');
  const stopped   = document.getElementById('feed-stopped-state');
  const badge     = document.getElementById('feed-status-badge');
  const stopBtn   = document.getElementById('feed-stop-btn');
  const metaLabel = document.getElementById('feed-meta-label');

  if (!img) return;

  _streaming    = true;
  _stopInFlight = false;

  img.src           = '/video_feed';
  img.style.display = 'block';
  stopped.style.display = 'none';
  badge.style.display   = 'flex';
  stopBtn.style.display = 'block';
  metaLabel.innerHTML   =
    'CAM-01 &nbsp;·&nbsp; <span style="color:var(--cyan);">YOLOv8 annotated stream</span>';
}

/* ═══════════════════════════════════════════════════
   STOP WEBCAM
   1. Detaches stream from <img> immediately
      (browser stops receiving frames right away)
   2. Sends ONE POST /stop_feed to release the
      OpenCV camera on the server side
   Guard flag ensures this runs exactly once per stop.
═══════════════════════════════════════════════════ */
async function stopWebcam() {
  // Guard: ignore if not streaming or already stopping
  if (!_streaming || _stopInFlight) return;
  _stopInFlight = true;

  const img       = document.getElementById('webcam-img');
  const stopped   = document.getElementById('feed-stopped-state');
  const badge     = document.getElementById('feed-status-badge');
  const stopBtn   = document.getElementById('feed-stop-btn');
  const metaLabel = document.getElementById('feed-meta-label');

  // ── Step 1: Immediately cut the browser stream ──
  // Setting src='' makes the browser drop the HTTP connection instantly.
  // This is the most important step — it stops new frames loading.
  if (img) {
    img.src           = '';
    img.style.display = 'none';
  }
  if (stopped)   stopped.style.display  = 'flex';
  if (badge)     badge.style.display    = 'none';
  if (stopBtn)   stopBtn.style.display  = 'none';
  if (metaLabel) metaLabel.innerHTML =
    'CAM-01 &nbsp;·&nbsp; <span style="color:var(--text3);">Webcam off</span>';

  _streaming = false;

  // ── Step 2: Signal Flask to release the camera ──
  // Fire exactly once, do not retry on failure.
  try {
    await fetch('/stop_feed', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.warn('[feed] /stop_feed request failed (server may already be stopped):', e);
  } finally {
    _stopInFlight = false;
  }
}
