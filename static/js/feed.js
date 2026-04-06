/* ═══════════════════════════════════════════════════
   feed.js
   Live feed page — renders real /video_feed MJPEG stream
   for the primary camera, mock cards for others
═══════════════════════════════════════════════════ */

const cameras = [
  { id: 'CAM-01', zone: 'Live Webcam Feed',      status: 'live',    vehicles: 0,  primary: true  },
  { id: 'CAM-02', zone: 'Highway I-95 North',    status: 'live',    vehicles: 128, primary: false },
  { id: 'CAM-03', zone: 'Airport Boulevard',      status: 'live',    vehicles: 67,  primary: false },
  { id: 'CAM-04', zone: 'City Center Bridge',     status: 'live',    vehicles: 89,  primary: false },
  { id: 'CAM-05', zone: 'Industrial Zone A',      status: 'offline', vehicles: 0,   primary: false },
  { id: 'CAM-06', zone: 'Residential District',   status: 'live',    vehicles: 23,  primary: false },
];

function renderFeed() {
  const grid = document.getElementById('feed-grid');
  grid.innerHTML = cameras.map((cam, i) => {
    if (cam.primary) {
      // ── Real MJPEG stream from Flask /video_feed ──
      return `
        <div class="feed-card fade-in d1">
          <div class="feed-video" style="background:#000;">
            <img
              src="/video_feed"
              alt="Live detection feed"
              style="width:100%;height:100%;object-fit:cover;display:block;"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
            />
            <div class="feed-offline" style="display:none;">
              <i class="fa-solid fa-video-slash"></i>
              <span>Camera unavailable</span>
            </div>
            <div class="feed-status-tl">
              <div style="width:6px;height:6px;border-radius:50%;background:#22c55e;animation:pulseDot 2s ease infinite;box-shadow:0 0 6px rgba(34,197,94,0.7);"></div>
              <span style="color:#22c55e;">LIVE</span>
            </div>
            <div class="feed-cam-id">${cam.id}</div>
          </div>
          <div class="feed-info">
            <div class="feed-zone">${cam.zone}</div>
            <div class="feed-meta">${cam.id} &nbsp;·&nbsp; <span style="color:var(--cyan);">YOLOv8 annotated stream</span></div>
          </div>
        </div>`;
    }

    // ── Mock cards for secondary cameras ──────────────
    return `
      <div class="feed-card fade-in d${(i % 6) + 1}">
        <div class="feed-video">
          ${cam.status === 'live' ? `
            <div class="feed-grid-bg"></div>
            <div style="position:absolute;top:18%;left:12%;width:20%;height:30%;border:1.5px solid #00d4ff;border-radius:4px;box-shadow:0 0 8px rgba(0,212,255,0.3);">
              <div style="position:absolute;top:-14px;left:0;background:rgba(0,212,255,0.2);color:#00d4ff;font-size:8px;padding:1px 5px;border-radius:3px;">Car 0.94</div>
            </div>
            <div class="scan-overlay"><div class="scan-line"></div></div>
          ` : `
            <div class="feed-offline"><i class="fa-solid fa-video-slash"></i><span>Camera Offline</span></div>
          `}
          <div class="feed-status-tl">
            <div style="width:6px;height:6px;border-radius:50%;background:${cam.status === 'live' ? '#22c55e' : '#ef4444'};${cam.status === 'live' ? 'animation:pulseDot 2s ease infinite;box-shadow:0 0 6px rgba(34,197,94,0.7);' : ''}"></div>
            <span style="color:${cam.status === 'live' ? '#22c55e' : '#ef4444'};">${cam.status.toUpperCase()}</span>
          </div>
          <div class="feed-cam-id">${cam.id}</div>
          ${cam.status === 'live' ? `<div class="feed-count"><i class="fa-solid fa-car"></i><span id="cnt-${cam.id}">${cam.vehicles}</span></div>` : ''}
        </div>
        <div class="feed-info">
          <div class="feed-zone">${cam.zone}</div>
          <div class="feed-meta">${cam.id} ${cam.status === 'live'
            ? `&nbsp;·&nbsp;<span style="color:var(--cyan);font-family:monospace;">${Math.floor(38 + Math.random() * 18)} km/h avg</span>`
            : '&nbsp;·&nbsp;Feed unavailable'
          }</div>
        </div>
      </div>`;
  }).join('');

  // Animate mock vehicle counters
  cameras.filter(c => c.status === 'live' && !c.primary).forEach(cam => {
    setInterval(() => {
      const el = document.getElementById('cnt-' + cam.id);
      if (el) el.textContent = Math.max(0, parseInt(el.textContent) + Math.floor(Math.random() * 7 - 3));
    }, 2500);
  });
}
