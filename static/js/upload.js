/* ═══════════════════════════════════════════════════
   upload.js
   Image / video upload + real detection results.
   Manages session history for charts + download.

   Session store (in-memory, cleared on logout):
     window._sessionHistory  — array of analysis records
     window._sessionUser     — email of logged-in user
═══════════════════════════════════════════════════ */

const LABEL_COLORS = {
  person:          '#22c55e',
  bicycle:         '#22c55e',
  car:             '#00d4ff',
  bus:             '#a855f7',
  motorbike:       '#ef4444',
  'traffic light': '#f59e0b',
};
function labelColor(lbl) { return LABEL_COLORS[lbl] || '#94a3b8'; }

const VEH_CONFIG = {
  car:             { icon: 'fa-car',           color: 'var(--cyan)',   rgb: '0,212,255'  },
  person:          { icon: 'fa-person-walking', color: 'var(--green)', rgb: '34,197,94'  },
  bus:             { icon: 'fa-bus',           color: 'var(--purple)', rgb: '168,85,247' },
  motorbike:       { icon: 'fa-motorcycle',    color: 'var(--red)',    rgb: '239,68,68'  },
  bicycle:         { icon: 'fa-bicycle',       color: 'var(--green)',  rgb: '34,197,94'  },
  'traffic light': { icon: 'fa-traffic-light', color: 'var(--amber)',  rgb: '245,158,11' },
};

// ── Session store ─────────────────────────────────
// Initialised once per login, cleared on logout
window._sessionHistory = window._sessionHistory || [];

function _pushToSession(record) {
  window._sessionHistory.push(record);
  _refreshDownloadBtn();
}

function clearSessionHistory() {
  window._sessionHistory = [];
  _refreshDownloadBtn();
}

function _refreshDownloadBtn() {
  const btn = document.getElementById('download-session-btn');
  if (!btn) return;
  const count = window._sessionHistory.length;
  if (count === 0) {
    btn.style.display = 'none';
  } else {
    btn.style.display = 'flex';
    btn.querySelector('#dl-count').textContent = count;
  }
}

// ── Download session JSON ─────────────────────────
window.downloadSessionJSON = function () {
  const user = Auth.getUser() || 'unknown';
  const data = {
    session_user:  user,
    exported_at:   new Date().toISOString(),
    total_analyses: window._sessionHistory.length,
    analyses:      window._sessionHistory,
  };

  const blob     = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  const date     = new Date().toISOString().slice(0, 10);
  a.href         = url;
  a.download     = `trafficsense_session_${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const uploadZone        = document.getElementById('upload-zone');
  const fileInput         = document.getElementById('file-input');
  const analyzeBtn        = document.getElementById('analyze-btn');
  const progressWrap      = document.getElementById('progress-wrap');
  const progressFill      = document.getElementById('progress-fill');
  const progressPct       = document.getElementById('progress-pct');
  const progressLabel     = document.getElementById('progress-label');
  const resultPlaceholder = document.getElementById('result-placeholder');
  const resultImgWrap     = document.getElementById('result-img-wrap');
  const resultImg         = document.getElementById('result-img');
  const detGrid           = document.getElementById('det-grid');
  const scanOverlay       = document.getElementById('scan-overlay');
  const resTl             = document.getElementById('res-tl');
  const resTr             = document.getElementById('res-tr');
  const fnameEl           = document.getElementById('upload-fname');
  const fnameText         = document.getElementById('fname-text');
  const bboxContainer     = document.getElementById('bbox-container');

  let selectedFile = null;

  // ── Drag / click upload ──────────────────────────
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover',  e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  // ── File selected ────────────────────────────────
  function handleFile(file) {
    selectedFile = file;
    fnameText.textContent = file.name;
    fnameEl.classList.add('show');
    analyzeBtn.disabled = false;

    detGrid.style.display     = 'none';
    scanOverlay.style.display = 'none';
    resTl.style.display = 'none';
    resTr.style.display = 'none';
    if (bboxContainer) bboxContainer.innerHTML = '';

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        resultImg.src = e.target.result;
        resultPlaceholder.style.display = 'none';
        resultImgWrap.classList.add('show');
        resultImgWrap.style.opacity = '0.5';
      };
      reader.readAsDataURL(file);
    } else {
      resultImgWrap.classList.remove('show');
      resultPlaceholder.style.display = 'flex';
      resultPlaceholder.innerHTML = `
        <i class="fa-solid fa-film" style="font-size:28px;opacity:0.5;"></i>
        <span style="color:var(--cyan);font-size:13px;">${file.name}</span>
        <span>Video ready — results will appear after analysis</span>
      `;
    }
  }

  // ── Analyze button ────────────────────────────────
  window.startAnalysis = async function () {
    if (!selectedFile) return;
    selectedFile.type.startsWith('image/')
      ? await runImageDetection()
      : await runVideoDetection();
  };

  // ═══════════════════════════════════════════════
  // IMAGE DETECTION
  // ═══════════════════════════════════════════════
  async function runImageDetection() {
    showProgress('Uploading image...');
    animateProgressBar(0, 30);

    const formData = new FormData();
    formData.append('image', selectedFile);

    let data;
    try {
      animateProgressBar(30, 70);
      const res = await apiFetch('/predict', { method: 'POST', body: formData });
      animateProgressBar(70, 95);
      data = await res.json();
      if (!res.ok) { showError(data.error || 'Detection failed.'); return; }
    } catch (err) {
      showError('Network error. Is the server running?');
      return;
    }

    animateProgressBar(95, 100);
    setTimeout(() => showImageResults(data), 300);
  }

  function showImageResults(data) {
    hideProgress();
    resultImgWrap.style.opacity = '1';
    scanOverlay.style.display   = 'block';
    resTl.style.display         = 'flex';
    resTr.style.display         = 'block';
    resTr.textContent           = `${data.count} object${data.count !== 1 ? 's' : ''}`;
    analyzeBtn.disabled         = false;

    // Draw bounding boxes
    if (bboxContainer) {
      bboxContainer.innerHTML = '';
      const imgNatW = resultImg.naturalWidth  || resultImgWrap.offsetWidth;
      const imgNatH = resultImg.naturalHeight || resultImgWrap.offsetHeight;
      data.objects.forEach(obj => {
        const [x1,y1,x2,y2] = obj.bbox;
        const color = labelColor(obj.label);
        const div   = document.createElement('div');
        div.className = 'bbox';
        div.style.cssText = `
          left:${(x1/imgNatW*100).toFixed(2)}%;
          top:${(y1/imgNatH*100).toFixed(2)}%;
          width:${((x2-x1)/imgNatW*100).toFixed(2)}%;
          height:${((y2-y1)/imgNatH*100).toFixed(2)}%;
          border-color:${color};box-shadow:0 0 8px ${color}50;
        `;
        div.innerHTML = `<div class="bbox-label" style="background:${color}22;color:${color};">${obj.label} ${(obj.confidence*100).toFixed(0)}%</div>`;
        bboxContainer.appendChild(div);
      });
    }

    const counts = {};
    data.objects.forEach(o => { counts[o.label] = (counts[o.label] || 0) + 1; });

    // Save to session
    _pushToSession({
      timestamp:  new Date().toISOString(),
      filename:   selectedFile.name,
      type:       'image',
      total_objects: data.count,
      counts,
      total:      data.count,
      objects:    data.objects,
    });

    updateDashboard(data.objects, counts);
    updateChartsFromSession(window._sessionHistory, counts);
  }

  // ═══════════════════════════════════════════════
  // VIDEO DETECTION
  // ═══════════════════════════════════════════════
  async function runVideoDetection() {
    showProgress('Uploading video...');
    animateProgressBar(0, 20);

    const formData = new FormData();
    formData.append('video', selectedFile);

    let data;
    try {
      animateProgressBar(20, 85);
      setProgressLabel('Running detection on all frames...');
      const res = await apiFetch('/predict_video', { method: 'POST', body: formData });
      animateProgressBar(85, 100);
      data = await res.json();
      if (!res.ok) { showError(data.error || 'Video detection failed.'); return; }
    } catch (err) {
      showError('Network error. Is the server running?');
      return;
    }

    setTimeout(() => showVideoResults(data), 300);
  }

  function showVideoResults(data) {
    hideProgress();
    analyzeBtn.disabled = false;

    resultImgWrap.classList.remove('show');
    resultPlaceholder.style.display = 'flex';

    const total     = data.total_frames     || 0;
    const processed = data.processed_frames || 0;
    resultPlaceholder.innerHTML = `
      <i class="fa-solid fa-circle-check" style="font-size:28px;color:var(--green);opacity:1;"></i>
      <span style="color:var(--green);font-size:13px;font-weight:600;">Video Analysis Complete</span>
      <span>${processed} frames with detections out of ${total} total frames</span>
    `;

    resTl.style.display = 'flex';
    resTr.style.display = 'block';
    resTr.textContent   = `${processed} frames`;

    const summary = data.summary || {};
    const totalDetected = Object.values(summary).reduce((a, b) => a + b, 0);

    // Save to session
    _pushToSession({
      timestamp:      new Date().toISOString(),
      filename:       selectedFile.name,
      type:           'video',
      total_frames:   total,
      processed_frames: processed,
      total_objects:  totalDetected,
      counts:         summary,
      total:          totalDetected,
      detections_by_frame: data.detections_by_frame || [],
    });

    // Build fake flat objects list for updateDashboard stat cards
    const fakeObjects = [];
    Object.entries(summary).forEach(([lbl, cnt]) => {
      for (let i = 0; i < cnt; i++) fakeObjects.push({ label: lbl, confidence: 0 });
    });

    updateDashboard(fakeObjects, summary, data);
    updateChartsFromSession(window._sessionHistory, summary);
  }

  // ═══════════════════════════════════════════════
  // UPDATE STAT CARDS + VEH BREAKDOWN
  // ═══════════════════════════════════════════════
  function updateDashboard(objects, counts, videoData) {
    renderDetGrid(counts);

    const totalEl       = document.getElementById('stat-total');
    const totalSubEl    = document.getElementById('stat-total-sub');
    const topClassEl    = document.getElementById('stat-top-class');
    const topCountEl    = document.getElementById('stat-top-count');
    const classesEl     = document.getElementById('stat-classes');
    const classesSubEl  = document.getElementById('stat-classes-sub');
    const confEl        = document.getElementById('stat-conf');
    const confSubEl     = document.getElementById('stat-conf-sub');

    const total      = objects.length;
    const classCount = Object.keys(counts).length;
    const sorted     = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const topClass   = sorted[0]?.[0] || '—';
    const topCount   = sorted[0]?.[1] || 0;
    const confs      = objects.filter(o => o.confidence > 0).map(o => o.confidence);
    const avgConf    = confs.length
      ? (confs.reduce((a, b) => a + b, 0) / confs.length * 100).toFixed(1) + '%'
      : '—';

    if (totalEl)     animateCounter(totalEl, total, 900);
    if (totalSubEl)  totalSubEl.textContent = videoData
      ? `across ${videoData.processed_frames} frames`
      : 'in this image';
    if (topClassEl)  topClassEl.textContent = topClass.charAt(0).toUpperCase() + topClass.slice(1);
    if (topCountEl)  topCountEl.textContent = topCount ? `${topCount} detected` : 'No detections';
    if (classesEl)   animateCounter(classesEl, classCount, 700);
    if (classesSubEl) classesSubEl.textContent = classCount
      ? sorted.map(([l]) => l).join(', ')
      : 'None found';
    if (confEl)      confEl.textContent = avgConf;
    if (confSubEl)   confSubEl.textContent = confs.length
      ? 'Across all detections'
      : 'N/A for video summary';

    renderVehCards(counts);
  }

  function renderVehCards(counts) {
    const container  = document.getElementById('veh-cards');
    const emptyState = document.getElementById('breakdown-empty');
    if (!container) return;

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      container.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    const total = entries.reduce((s, [,v]) => s + v, 0);
    if (emptyState) emptyState.style.display = 'none';
    container.style.display = 'grid';

    container.innerHTML = entries.map(([lbl, cnt]) => {
      const cfg = VEH_CONFIG[lbl] || { icon: 'fa-cube', color: 'var(--text2)', rgb: '148,163,184' };
      const pct = total > 0 ? (cnt / total * 100).toFixed(1) : '0.0';
      return `
        <div class="veh-card">
          <div class="veh-icon" style="background:rgba(${cfg.rgb},0.12);border:1px solid rgba(${cfg.rgb},0.2);">
            <i class="fa-solid ${cfg.icon}" style="color:${cfg.color};"></i>
          </div>
          <div class="veh-count" style="color:${cfg.color};">${cnt}</div>
          <div class="veh-name">${lbl.charAt(0).toUpperCase() + lbl.slice(1)}s</div>
          <div class="veh-bar">
            <div class="veh-bar-fill" style="width:0%;background:linear-gradient(90deg,${cfg.color},rgba(${cfg.rgb},0.5));box-shadow:0 0 6px rgba(${cfg.rgb},0.4);transition:width 1.2s ease;"></div>
          </div>
          <div class="veh-pct">${pct}%</div>
        </div>`;
    }).join('');

    requestAnimationFrame(() => {
      setTimeout(() => {
        container.querySelectorAll('.veh-bar-fill').forEach((bar, i) => {
          const pct = entries[i] ? (entries[i][1] / total * 100).toFixed(1) : 0;
          bar.style.width = pct + '%';
        });
      }, 50);
    });
  }

  function renderDetGrid(counts) {
    const iconMap = {
      person:          { icon: 'fa-person-walking', color: 'var(--green)' },
      car:             { icon: 'fa-car',            color: 'var(--cyan)'  },
      bus:             { icon: 'fa-bus',            color: 'var(--purple)'},
      motorbike:       { icon: 'fa-motorcycle',     color: 'var(--red)'   },
      bicycle:         { icon: 'fa-bicycle',        color: 'var(--green)' },
      'traffic light': { icon: 'fa-traffic-light',  color: 'var(--amber)' },
    };

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) { detGrid.style.display = 'none'; return; }

    detGrid.innerHTML = entries.map(([lbl, cnt]) => {
      const cfg = iconMap[lbl] || { icon: 'fa-cube', color: 'var(--text2)' };
      return `
        <div class="det-row">
          <i class="fa-solid ${cfg.icon}" style="color:${cfg.color};"></i>
          <span class="det-name">${lbl.charAt(0).toUpperCase() + lbl.slice(1)}s</span>
          <span class="det-val" style="color:${cfg.color};">${cnt}</span>
        </div>`;
    }).join('');
    detGrid.style.display = 'grid';
  }

  // ── Progress helpers ──────────────────────────────
  let _pi = null;
  function showProgress(label) { analyzeBtn.disabled = true; progressWrap.classList.add('show'); setProgressLabel(label); setProgressPct(0); }
  function hideProgress() { progressWrap.classList.remove('show'); if (_pi) { clearInterval(_pi); _pi = null; } }
  function setProgressLabel(t) { if (progressLabel) progressLabel.textContent = t; }
  function setProgressPct(p) { progressFill.style.width = p + '%'; progressPct.textContent = Math.round(p) + '%'; }
  function animateProgressBar(from, to) {
    if (_pi) clearInterval(_pi);
    let cur = from;
    _pi = setInterval(() => {
      cur += (to - cur) * 0.12; setProgressPct(cur);
      if (Math.abs(cur - to) < 0.5) { setProgressPct(to); clearInterval(_pi); }
    }, 60);
  }
  function showError(msg) {
    hideProgress(); analyzeBtn.disabled = false;
    if (progressLabel) {
      progressWrap.classList.add('show');
      progressLabel.innerHTML = `<span style="color:var(--red);"><i class="fa-solid fa-circle-xmark"></i> ${msg}</span>`;
      progressFill.style.width = '0%'; progressPct.textContent = '';
      setTimeout(() => progressWrap.classList.remove('show'), 4000);
    }
  }
});
