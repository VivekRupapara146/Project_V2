/* ═══════════════════════════════════════════════════
   upload.js
   Real API integration for image + video upload
   POST /predict        → image detection
   POST /predict_video  → video detection
═══════════════════════════════════════════════════ */

// Class label → color map matching backend ALLOWED_CLASSES
const LABEL_COLORS = {
  person:        '#22c55e',
  bicycle:       '#22c55e',
  car:           '#00d4ff',
  bus:           '#a855f7',
  motorbike:     '#ef4444',
  'traffic light': '#f59e0b',
};
function labelColor(lbl) { return LABEL_COLORS[lbl] || '#94a3b8'; }

document.addEventListener('DOMContentLoaded', () => {
  const uploadZone       = document.getElementById('upload-zone');
  const fileInput        = document.getElementById('file-input');
  const analyzeBtn       = document.getElementById('analyze-btn');
  const progressWrap     = document.getElementById('progress-wrap');
  const progressFill     = document.getElementById('progress-fill');
  const progressPct      = document.getElementById('progress-pct');
  const progressLabel    = document.getElementById('progress-label');
  const resultPlaceholder = document.getElementById('result-placeholder');
  const resultImgWrap    = document.getElementById('result-img-wrap');
  const resultImg        = document.getElementById('result-img');
  const detGrid          = document.getElementById('det-grid');
  const scanOverlay      = document.getElementById('scan-overlay');
  const resTl            = document.getElementById('res-tl');
  const resTr            = document.getElementById('res-tr');
  const fnameEl          = document.getElementById('upload-fname');
  const fnameText        = document.getElementById('fname-text');
  const bboxContainer    = document.getElementById('bbox-container');

  let selectedFile = null;

  // ── Click to browse ──────────────────────────────
  uploadZone.addEventListener('click', () => fileInput.click());

  // ── Drag and drop ────────────────────────────────
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

  // ── Handle selected file ─────────────────────────
  function handleFile(file) {
    selectedFile = file;
    fnameText.textContent = file.name;
    fnameEl.classList.add('show');
    analyzeBtn.disabled = false;

    // Reset results
    detGrid.style.display    = 'none';
    scanOverlay.style.display = 'none';
    resTl.style.display = 'none';
    resTr.style.display = 'none';
    if (bboxContainer) bboxContainer.innerHTML = '';

    const isImage = file.type.startsWith('image/');
    if (isImage) {
      const reader = new FileReader();
      reader.onload = e => {
        resultImg.src = e.target.result;
        resultPlaceholder.style.display = 'none';
        resultImgWrap.classList.add('show');
        resultImgWrap.style.opacity = '0.5';
      };
      reader.readAsDataURL(file);
    } else {
      // Video — show placeholder
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
    const isImage = selectedFile.type.startsWith('image/');
    isImage ? await runImageDetection() : await runVideoDetection();
  };

  // ── Image detection ───────────────────────────────
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

      if (!res.ok) {
        showError(data.error || 'Detection failed.');
        return;
      }
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
    resTr.textContent           = `${data.count} objects`;
    analyzeBtn.disabled         = false;

    // Draw real bounding boxes
    if (bboxContainer) {
      bboxContainer.innerHTML = '';
      const wrap = resultImgWrap;
      const wW   = wrap.offsetWidth;
      const wH   = wrap.offsetHeight;
      const imgNatW = resultImg.naturalWidth  || wW;
      const imgNatH = resultImg.naturalHeight || wH;

      data.objects.forEach(obj => {
        const [x1, y1, x2, y2] = obj.bbox;
        const color = labelColor(obj.label);
        const div   = document.createElement('div');
        div.className = 'bbox';
        div.style.cssText = `
          left:   ${(x1 / imgNatW * 100).toFixed(2)}%;
          top:    ${(y1 / imgNatH * 100).toFixed(2)}%;
          width:  ${((x2 - x1) / imgNatW * 100).toFixed(2)}%;
          height: ${((y2 - y1) / imgNatH * 100).toFixed(2)}%;
          border-color: ${color};
          box-shadow: 0 0 8px ${color}50;
        `;
        div.innerHTML = `<div class="bbox-label" style="background:${color}22;color:${color};">${obj.label} ${(obj.confidence * 100).toFixed(0)}%</div>`;
        bboxContainer.appendChild(div);
      });
    }

    // Build detection summary grid
    const counts = {};
    data.objects.forEach(o => { counts[o.label] = (counts[o.label] || 0) + 1; });
    renderDetGrid(counts);
  }

  // ── Video detection ───────────────────────────────
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

      if (!res.ok) {
        showError(data.error || 'Video detection failed.');
        return;
      }
    } catch (err) {
      showError('Network error. Is the server running?');
      return;
    }

    setTimeout(() => showVideoResults(data), 300);
  }

  function showVideoResults(data) {
    hideProgress();
    analyzeBtn.disabled = false;

    resultPlaceholder.style.display = 'none';
    resultImgWrap.classList.remove('show');

    // Show video summary in placeholder area
    const total     = data.total_frames    || 0;
    const processed = data.processed_frames || 0;
    resultPlaceholder.style.display = 'flex';
    resultPlaceholder.innerHTML = `
      <i class="fa-solid fa-circle-check" style="font-size:28px;color:var(--green);opacity:1;"></i>
      <span style="color:var(--green);font-size:13px;font-weight:600;">Video Analysis Complete</span>
      <span>${processed} frames with detections out of ${total} total frames</span>
    `;

    resTl.style.display = 'flex';
    resTr.style.display = 'block';
    resTr.textContent   = `${processed} frames`;

    renderDetGrid(data.summary || {});
  }

  // ── Detection summary grid ────────────────────────
  function renderDetGrid(counts) {
    const iconMap = {
      person:        { icon: 'fa-person-walking', color: 'var(--green)' },
      car:           { icon: 'fa-car',            color: 'var(--cyan)'  },
      bus:           { icon: 'fa-bus',            color: 'var(--purple)'},
      motorbike:     { icon: 'fa-motorcycle',     color: 'var(--red)'   },
      bicycle:       { icon: 'fa-bicycle',        color: 'var(--green)' },
      'traffic light':{ icon: 'fa-traffic-light', color: 'var(--amber)' },
    };

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      detGrid.style.display = 'none';
      return;
    }

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
  let _progressInterval = null;

  function showProgress(label) {
    analyzeBtn.disabled = true;
    progressWrap.classList.add('show');
    setProgressLabel(label || 'Analyzing...');
    setProgressPct(0);
  }
  function hideProgress() {
    progressWrap.classList.remove('show');
    if (_progressInterval) { clearInterval(_progressInterval); _progressInterval = null; }
  }
  function setProgressLabel(txt) {
    if (progressLabel) progressLabel.textContent = txt;
  }
  function setProgressPct(p) {
    progressFill.style.width = p + '%';
    progressPct.textContent  = Math.round(p) + '%';
  }
  function animateProgressBar(from, to) {
    if (_progressInterval) clearInterval(_progressInterval);
    let cur = from;
    _progressInterval = setInterval(() => {
      cur += (to - cur) * 0.12;
      setProgressPct(cur);
      if (Math.abs(cur - to) < 0.5) { setProgressPct(to); clearInterval(_progressInterval); }
    }, 60);
  }
  function showError(msg) {
    hideProgress();
    analyzeBtn.disabled = false;
    if (progressLabel) {
      progressWrap.classList.add('show');
      progressLabel.innerHTML = `<span style="color:var(--red);"><i class="fa-solid fa-circle-xmark"></i> ${msg}</span>`;
      progressFill.style.width = '0%';
      progressPct.textContent  = '';
      setTimeout(() => progressWrap.classList.remove('show'), 4000);
    }
  }
});
