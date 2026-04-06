/* ═══════════════════════════════════════════════════
   metrics.js
   Polls GET /metrics every 5 seconds and updates
   sidebar system card: model name, FPS, DB status,
   uptime, and inference latency
═══════════════════════════════════════════════════ */

const METRICS_INTERVAL = 5000;  // ms
let _metricsTimer = null;

async function fetchMetrics() {
  try {
    const res  = await apiFetch('/metrics');
    if (!res.ok) return;
    const data = await res.json();
    updateSidebarMetrics(data);
  } catch (e) {
    // Silent — sidebar just keeps last values
  }
}

function updateSidebarMetrics(data) {
  const inf = data.inference || {};
  const db  = data.database  || {};

  // Uptime
  const uptimeEl = document.getElementById('sys-uptime');
  if (uptimeEl) uptimeEl.textContent = data.uptime || '—';

  // FPS
  const fpsEl = document.getElementById('sys-fps');
  if (fpsEl) fpsEl.textContent = inf.fps != null ? `${inf.fps} FPS` : '—';

  // Avg inference latency
  const latEl = document.getElementById('sys-latency');
  if (latEl) latEl.textContent = inf.avg_ms != null ? `${inf.avg_ms} ms` : '—';

  // DB connected indicator
  const dbEl = document.getElementById('sys-db');
  if (dbEl) {
    dbEl.textContent  = db.connected ? 'Connected' : 'Offline';
    dbEl.style.color  = db.connected ? 'var(--green)' : 'var(--red)';
  }

  // GPU usage bar — use queue size as a proxy (0–500 → 0–100%)
  const barFill = document.getElementById('sys-bar-fill');
  if (barFill) {
    const pct = Math.min(100, Math.round((db.queue_size || 0) / 5));
    barFill.style.width = pct + '%';
  }
}

function startMetricsPoll() {
  fetchMetrics();  // immediate first fetch
  if (_metricsTimer) clearInterval(_metricsTimer);
  _metricsTimer = setInterval(fetchMetrics, METRICS_INTERVAL);
}
