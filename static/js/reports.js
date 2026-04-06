/* ═══════════════════════════════════════════════════
   reports.js
   Report data, rendering, and download simulation
═══════════════════════════════════════════════════ */

const reports = [
  { id: 'RPT-001', name: 'Daily Traffic Summary',      date: '2026-04-03', size: '2.4 MB', type: 'PDF',   status: 'ready'      },
  { id: 'RPT-002', name: 'Weekly Congestion Analysis',  date: '2026-03-31', size: '5.1 MB', type: 'Excel', status: 'ready'      },
  { id: 'RPT-003', name: 'Monthly Vehicle Count',       date: '2026-03-28', size: '8.7 MB', type: 'PDF',   status: 'ready'      },
  { id: 'RPT-004', name: 'Incident Report — Q1 2026',  date: '2026-03-20', size: '1.2 MB', type: 'PDF',   status: 'ready'      },
  { id: 'RPT-005', name: 'Speed Compliance Report',     date: '2026-03-15', size: '3.8 MB', type: 'CSV',   status: 'ready'      },
  { id: 'RPT-006', name: 'Real-time Analytics Export',  date: '2026-04-03', size: '--',     type: 'CSV',   status: 'generating' },
];

const typeColors = { PDF: '#ef4444', Excel: '#22c55e', CSV: '#00d4ff' };
const typeIcons  = { PDF: 'fa-file-pdf', Excel: 'fa-file-excel', CSV: 'fa-file-csv' };

function renderReports() {
  document.getElementById('report-list').innerHTML = reports.map(r => `
    <div class="report-row">
      <div class="report-type-icon" style="background:${typeColors[r.type]}15;">
        <i class="fa-solid ${typeIcons[r.type]}" style="color:${typeColors[r.type]};"></i>
      </div>
      <div class="report-info">
        <div class="report-name">${r.name}</div>
        <div class="report-meta">
          <span>${r.id}</span><span>·</span><span>${r.date}</span><span>·</span><span>${r.size}</span>
        </div>
      </div>
      ${r.status === 'generating'
        ? `<div class="gen-badge"><div class="blink-dot"></div> Generating...</div>`
        : `<button class="btn btn-grad report-dl" onclick="simulateDownload(this)"><i class="fa-solid fa-download"></i> Download</button>`
      }
    </div>
  `).join('');
}

function simulateDownload(btn) {
  const orig = btn.innerHTML;
  btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Downloading...';
  btn.disabled  = true;
  setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2000);
}
