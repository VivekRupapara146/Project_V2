/* ═══════════════════════════════════════════════════
   charts.js
   All charts start empty with a prompt message.
   They update only from real session analysis data.

   Public API:
     initDashboardCharts()          — called once on login
     initAnalyticsCharts()          — called on first visit to Analytics
     updateChartsFromSession(data)  — called by upload.js after each analysis
═══════════════════════════════════════════════════ */

// Chart instances — kept so they can be updated via .data / .update()
let _barChart  = null;
let _lineChart = null;
let _pieChart  = null;
let _peakChart = null;
let _areaChart = null;

// Shared empty-state message shown inside chart canvas area
const EMPTY_MSG_PLUGIN = {
  id: 'emptyState',
  afterDraw(chart) {
    const hasData = chart.data.datasets.some(ds =>
      ds.data && ds.data.some(v => v > 0)
    );
    if (hasData) return;

    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    ctx.save();
    ctx.fillStyle = 'rgba(148,163,184,0.25)';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = (chartArea.left + chartArea.right)  / 2;
    const cy = (chartArea.top  + chartArea.bottom) / 2;
    ctx.fillText('Analyze an image or video to visualize data', cx, cy);
    ctx.restore();
  }
};

// ─────────────────────────────────────────────────
// Helper: build empty dataset structure
// ─────────────────────────────────────────────────
function _emptyBarDatasets() {
  return [
    { label: 'Cars',    data: [0,0,0,0,0,0], backgroundColor: 'rgba(0,212,255,0.7)',   borderRadius: 4, borderSkipped: false },
    { label: 'Buses',   data: [0,0,0,0,0,0], backgroundColor: 'rgba(168,85,247,0.7)', borderRadius: 4, borderSkipped: false },
    { label: 'Persons', data: [0,0,0,0,0,0], backgroundColor: 'rgba(34,197,94,0.7)',  borderRadius: 4, borderSkipped: false },
    { label: 'Motorbikes',data:[0,0,0,0,0,0],backgroundColor: 'rgba(239,68,68,0.7)',  borderRadius: 4, borderSkipped: false },
    { label: 'Bicycles', data: [0,0,0,0,0,0],backgroundColor: 'rgba(245,158,11,0.7)', borderRadius: 4, borderSkipped: false },
  ];
}

const _CHART_OPT_SHARED = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { boxWidth: 10, color: '#94a3b8' } }, tooltip: tooltipPlugin },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#475569' } },
    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569' } },
  },
};

/* ═══════════════════════════════════════════════════
   DASHBOARD CHARTS — initialised empty on login
═══════════════════════════════════════════════════ */
function initDashboardCharts() {
  // Destroy previous instances if re-initialising
  if (_barChart)  { _barChart.destroy();  _barChart  = null; }
  if (_lineChart) { _lineChart.destroy(); _lineChart = null; }

  _barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    plugins: [EMPTY_MSG_PLUGIN],
    data: {
      labels:   ['Analysis 1', 'Analysis 2', 'Analysis 3', 'Analysis 4', 'Analysis 5', 'Analysis 6'],
      datasets: _emptyBarDatasets(),
    },
    options: {
      ..._CHART_OPT_SHARED,
      barPercentage: 0.7, categoryPercentage: 0.75,
    },
  });

  _lineChart = new Chart(document.getElementById('lineChart'), {
    type: 'line',
    plugins: [EMPTY_MSG_PLUGIN],
    data: {
      labels:   ['Analysis 1', 'Analysis 2', 'Analysis 3', 'Analysis 4', 'Analysis 5', 'Analysis 6'],
      datasets: [
        { label: 'Total Objects', data: [0,0,0,0,0,0], borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.08)', fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2 },
        { label: 'Unique Classes',data: [0,0,0,0,0,0], borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.06)', fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2 },
      ],
    },
    options: _CHART_OPT_SHARED,
  });
}

/* ═══════════════════════════════════════════════════
   ANALYTICS CHARTS — initialised empty on first visit
═══════════════════════════════════════════════════ */
function initAnalyticsCharts() {
  if (_pieChart)  { _pieChart.destroy();  _pieChart  = null; }
  if (_peakChart) { _peakChart.destroy(); _peakChart = null; }
  if (_areaChart) { _areaChart.destroy(); _areaChart = null; }

  // Area chart — session cumulative timeline (starts empty)
  _areaChart = new Chart(document.getElementById('areaChart'), {
    type: 'line',
    plugins: [EMPTY_MSG_PLUGIN],
    data: {
      labels: [],
      datasets: [
        { label: 'Total Objects', data: [], borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.07)', fill: true, tension: 0.4, pointRadius: 3, borderWidth: 1.5 },
      ],
    },
    options: {
      ..._CHART_OPT_SHARED,
      plugins: { ...(_CHART_OPT_SHARED.plugins), legend: { labels: { boxWidth: 10, color: '#94a3b8' } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#475569', maxTicksLimit: 8 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569' } },
      },
    },
  });

  // Peak chart — detections per analysis (starts empty)
  _peakChart = new Chart(document.getElementById('peakChart'), {
    type: 'bar',
    plugins: [EMPTY_MSG_PLUGIN],
    data: {
      labels: [],
      datasets: [
        { label: 'Objects Detected', data: [], backgroundColor: 'rgba(0,212,255,0.75)', borderRadius: 4 },
      ],
    },
    options: {
      ..._CHART_OPT_SHARED,
      barPercentage: 0.6, categoryPercentage: 0.7,
    },
  });

  // Pie chart — vehicle mix from session (starts empty)
  _pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    plugins: [EMPTY_MSG_PLUGIN],
    data: {
      labels: ['No data yet'],
      datasets: [{
        data: [1],
        backgroundColor: ['rgba(100,116,139,0.15)'],
        borderColor: 'rgba(0,0,0,0)',
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, color: '#94a3b8', padding: 12 } },
        tooltip: tooltipPlugin,
      },
    },
  });
}

/* ═══════════════════════════════════════════════════
   UPDATE ALL CHARTS FROM SESSION DATA
   Called by upload.js after every successful analysis.

   sessionHistory: array of all analyses this session
     [{ filename, type, timestamp, counts, total }, ...]
   latestCounts: { car: 3, person: 2, ... } from latest run
═══════════════════════════════════════════════════ */
function updateChartsFromSession(sessionHistory, latestCounts) {
  _updateDashboardCharts(sessionHistory);
  _updateAnalyticsCharts(sessionHistory, latestCounts);
}

// ── Dashboard: bar = per-analysis class counts, line = totals/classes ──────
function _updateDashboardCharts(history) {
  if (!_barChart || !_lineChart || !history.length) return;

  const labels   = history.map((h, i) => `#${i + 1} ${_shortName(h.filename)}`);
  const classList = ['car', 'person', 'bus', 'motorbike', 'bicycle', 'traffic light'];
  const colors    = [
    'rgba(0,212,255,0.7)', 'rgba(34,197,94,0.7)', 'rgba(168,85,247,0.7)',
    'rgba(239,68,68,0.7)', 'rgba(245,158,11,0.7)', 'rgba(250,204,21,0.7)',
  ];

  // Bar chart — one dataset per class, one bar per analysis
  _barChart.data.labels   = labels;
  _barChart.data.datasets = classList.map((cls, ci) => ({
    label:           cls.charAt(0).toUpperCase() + cls.slice(1) + 's',
    data:            history.map(h => h.counts[cls] || 0),
    backgroundColor: colors[ci],
    borderRadius:    4,
    borderSkipped:   false,
  })).filter((_, ci) => {
    // Only include classes that actually appeared at least once
    return history.some(h => h.counts[classList[ci]] > 0);
  });
  _barChart.update();

  // Line chart — total objects and unique class count per analysis
  _lineChart.data.labels = labels;
  _lineChart.data.datasets[0].data = history.map(h => h.total);
  _lineChart.data.datasets[1].data = history.map(h => Object.keys(h.counts).length);
  _lineChart.update();
}

// ── Analytics: pie = cumulative mix, peak = per-analysis totals, area = timeline ──
function _updateAnalyticsCharts(history, latestCounts) {
  if (!history.length) return;

  // Cumulative counts across entire session
  const cumulative = {};
  history.forEach(h => {
    Object.entries(h.counts).forEach(([lbl, cnt]) => {
      cumulative[lbl] = (cumulative[lbl] || 0) + cnt;
    });
  });

  const colorMap = {
    car:            'rgba(0,212,255,0.85)',
    person:         'rgba(34,197,94,0.85)',
    bus:            'rgba(168,85,247,0.85)',
    motorbike:      'rgba(239,68,68,0.85)',
    bicycle:        'rgba(245,158,11,0.85)',
    'traffic light':'rgba(250,204,21,0.85)',
  };

  // Pie: cumulative session vehicle mix
  if (_pieChart) {
    const lbls   = Object.keys(cumulative);
    const vals   = Object.values(cumulative);
    const colors = lbls.map(l => colorMap[l] || 'rgba(148,163,184,0.85)');
    _pieChart.data.labels            = lbls.map(l => l.charAt(0).toUpperCase() + l.slice(1));
    _pieChart.data.datasets[0].data            = vals;
    _pieChart.data.datasets[0].backgroundColor = colors;
    _pieChart.update();
  }

  // Peak bar: total detections per analysis
  if (_peakChart) {
    _peakChart.data.labels = history.map((h, i) => `#${i + 1} ${_shortName(h.filename)}`);
    _peakChart.data.datasets[0].data = history.map(h => h.total);
    _peakChart.update();
  }

  // Area: cumulative total over analyses (running sum)
  if (_areaChart) {
    let running = 0;
    _areaChart.data.labels = history.map((h, i) => `#${i + 1}`);
    _areaChart.data.datasets[0].data = history.map(h => { running += h.total; return running; });
    _areaChart.update();
  }
}

// Trim filename to max 10 chars for chart labels
function _shortName(filename) {
  if (!filename) return '';
  const name = filename.replace(/\.[^.]+$/, '');   // strip extension
  return name.length > 10 ? name.slice(0, 10) + '…' : name;
}

/* ═══════════════════════════════════════════════════
   RESET — called on logout to wipe charts
═══════════════════════════════════════════════════ */
function resetCharts() {
  initDashboardCharts();
  // Analytics charts reset lazily when user navigates back to that page
  if (_pieChart)  { _pieChart.destroy();  _pieChart  = null; }
  if (_peakChart) { _peakChart.destroy(); _peakChart = null; }
  if (_areaChart) { _areaChart.destroy(); _areaChart = null; }
  // Reset chartsInitialized flag so they re-init on next visit
  chartsInitialized.analytics = false;
}
