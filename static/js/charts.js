/* ═══════════════════════════════════════════════════
   charts.js
   Dashboard charts: static hourly/weekly mock data
   Analytics charts: fetched from /analytics/traffic
                     and /analytics/peak-time
═══════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   DASHBOARD CHARTS  (static — shown on page load)
═══════════════════════════════════════════════════ */
function initDashboardCharts() {
  const barLabels = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
  const barData   = {
    Cars:    [120, 45, 310, 280, 342, 190],
    Buses:   [18,   6,  52,  44,  56,  32],
    Trucks:  [30,  12,  78,  65,  89,  54],
    Persons: [45,  20, 110,  95, 128,  72],
  };

  new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: barLabels,
      datasets: [
        { label: 'Cars',    data: barData.Cars,    backgroundColor: 'rgba(0,212,255,0.7)',   borderRadius: 4, borderSkipped: false },
        { label: 'Buses',   data: barData.Buses,   backgroundColor: 'rgba(168,85,247,0.7)', borderRadius: 4, borderSkipped: false },
        { label: 'Trucks',  data: barData.Trucks,  backgroundColor: 'rgba(245,158,11,0.7)', borderRadius: 4, borderSkipped: false },
        { label: 'Persons', data: barData.Persons, backgroundColor: 'rgba(34,197,94,0.7)',  borderRadius: 4, borderSkipped: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      barPercentage: 0.7, categoryPercentage: 0.75,
      plugins: { legend: { labels: { boxWidth: 10, color: '#94a3b8' } }, tooltip: tooltipPlugin },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#475569' } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569' } },
      },
    },
  });

  new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        { label: 'Total Vehicles',   data: [480, 520, 390, 610, 680, 420, 310], borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.08)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
        { label: 'Congestion Index', data: [32,  41,  28,  55,  62,  38,  22],  borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.06)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 10, color: '#94a3b8' } }, tooltip: tooltipPlugin },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#475569' } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569' } },
      },
    },
  });
}

/* ═══════════════════════════════════════════════════
   ANALYTICS CHARTS  (real data from API)
═══════════════════════════════════════════════════ */
async function initAnalyticsCharts() {
  // 24h direction chart — still simulated (no per-direction API yet)
  const h24    = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
  const mkData = (base, amp) => h24.map((_, i) => Math.max(0, Math.round(base + Math.sin(i / 3) * amp + Math.random() * 20)));

  new Chart(document.getElementById('areaChart'), {
    type: 'line',
    data: {
      labels: h24,
      datasets: [
        { label: 'North', data: mkData(80, 60), borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.07)',  fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
        { label: 'South', data: mkData(65, 50), borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.06)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
        { label: 'East',  data: mkData(50, 40), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.05)',  fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
        { label: 'West',  data: mkData(70, 55), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.05)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 10, color: '#94a3b8' } }, tooltip: tooltipPlugin },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#475569', maxTicksLimit: 8 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569' } },
      },
    },
  });

  // ── Peak time chart — real data ───────────────────
  try {
    const res      = await apiFetch('/analytics/peak-time');
    const peakData = await res.json();

    // Sort by hour for display
    const sorted   = [...peakData].sort((a, b) => a.hour - b.hour);
    const hours    = sorted.map(d => `${String(d.hour).padStart(2, '0')}:00`);
    const totals   = sorted.map(d => d.total_objects);

    new Chart(document.getElementById('peakChart'), {
      type: 'bar',
      data: {
        labels: hours.length ? hours : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          label: 'Detections',
          data:  totals.length ? totals : [680, 720, 610, 790, 855, 520, 380],
          backgroundColor: 'rgba(0,212,255,0.75)', borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        barPercentage: 0.7, categoryPercentage: 0.72,
        plugins: { legend: { labels: { boxWidth: 10, color: '#94a3b8' } }, tooltip: tooltipPlugin },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#475569' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569' } },
        },
      },
    });
  } catch (e) {
    console.warn('[charts] peak-time fetch failed, using mock data');
    _renderPeakChartMock();
  }

  // ── Vehicle mix pie — real data ───────────────────
  try {
    const res      = await apiFetch('/analytics/traffic');
    const traffic  = await res.json();

    const colorMap = {
      car:           'rgba(0,212,255,0.85)',
      person:        'rgba(34,197,94,0.85)',
      bus:           'rgba(168,85,247,0.85)',
      motorbike:     'rgba(239,68,68,0.85)',
      bicycle:       'rgba(245,158,11,0.85)',
      'traffic light':'rgba(250,204,21,0.85)',
    };

    const labels = Object.keys(traffic);
    const values = Object.values(traffic);
    const colors = labels.map(l => colorMap[l] || 'rgba(148,163,184,0.85)');

    new Chart(document.getElementById('pieChart'), {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)) : ['No data'],
        datasets: [{
          data:            values.length ? values : [1],
          backgroundColor: values.length ? colors : ['rgba(100,116,139,0.5)'],
          borderColor:     'rgba(0,0,0,0)',
          hoverOffset:     6,
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
  } catch (e) {
    console.warn('[charts] traffic analytics fetch failed, using mock data');
    _renderPieChartMock();
  }
}

function _renderPeakChartMock() {
  new Chart(document.getElementById('peakChart'), {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        { label: 'Peak Hours', data: [680, 720, 610, 790, 855, 520, 380], backgroundColor: 'rgba(0,212,255,0.75)', borderRadius: 4 },
        { label: 'Off-Peak',   data: [220, 195, 240, 210, 280, 380, 420], backgroundColor: 'rgba(168,85,247,0.7)', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, barPercentage: 0.7, categoryPercentage: 0.72,
      plugins: { legend: { labels: { boxWidth: 10, color: '#94a3b8' } }, tooltip: tooltipPlugin },
      scales: { x: { grid: { display: false }, ticks: { color: '#475569' } }, y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569' } } },
    },
  });
}
function _renderPieChartMock() {
  new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: ['Cars', 'Persons', 'Buses', 'Motorbikes', 'Bicycles'],
      datasets: [{ data: [342, 128, 56, 74, 30], backgroundColor: ['rgba(0,212,255,0.85)', 'rgba(34,197,94,0.85)', 'rgba(168,85,247,0.85)', 'rgba(239,68,68,0.85)', 'rgba(245,158,11,0.85)'], borderColor: 'rgba(0,0,0,0)', hoverOffset: 6 }],
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, color: '#94a3b8', padding: 12 } }, tooltip: tooltipPlugin } },
  });
}
