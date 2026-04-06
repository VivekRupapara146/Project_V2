/* ═══════════════════════════════════════════════════
   zones.js
   Zone data and rendering
═══════════════════════════════════════════════════ */

const zones = [
  { id: 'Z-01', name: 'Downtown Core',       cameras: 6, vehicles: 342, congestion: 78, status: 'high'     },
  { id: 'Z-02', name: 'Highway Corridor',    cameras: 4, vehicles: 512, congestion: 45, status: 'moderate' },
  { id: 'Z-03', name: 'Airport Access',      cameras: 8, vehicles: 289, congestion: 62, status: 'high'     },
  { id: 'Z-04', name: 'Industrial District', cameras: 3, vehicles: 128, congestion: 32, status: 'low'      },
  { id: 'Z-05', name: 'Residential Area A',  cameras: 5, vehicles: 89,  congestion: 18, status: 'low'      },
  { id: 'Z-06', name: 'City Center Bridge',  cameras: 2, vehicles: 178, congestion: 89, status: 'critical' },
];

const statusCfg = {
  low:      { color: '#22c55e', label: 'Low',      bg: 'rgba(34,197,94,0.12)'  },
  moderate: { color: '#f59e0b', label: 'Moderate', bg: 'rgba(245,158,11,0.12)' },
  high:     { color: '#00d4ff', label: 'High',     bg: 'rgba(0,212,255,0.12)'  },
  critical: { color: '#ef4444', label: 'Critical', bg: 'rgba(239,68,68,0.12)'  },
};

function renderZones() {
  document.getElementById('zone-list').innerHTML = zones.map((z, i) => {
    const cfg = statusCfg[z.status];
    return `
    <div class="zone-row fade-in d${(i % 6) + 1}">
      <div class="zone-info">
        <div class="zone-name">
          ${z.name}
          <span class="zone-id">${z.id}</span>
          <span class="zone-status-badge" style="color:${cfg.color};background:${cfg.bg};border:1px solid ${cfg.color}25;">${cfg.label}</span>
        </div>
        <div class="zone-details">
          <span><i class="fa-solid fa-video" style="color:var(--text3);"></i>${z.cameras} cameras</span>
          <span><i class="fa-solid fa-car"   style="color:var(--text3);"></i>${z.vehicles} vehicles</span>
        </div>
      </div>
      <div class="zone-cong">
        <div class="zone-cong-val" style="color:${cfg.color};">${z.congestion}%</div>
        <div class="zone-cong-bar">
          <div class="zone-cong-fill" style="width:${z.congestion}%;background:${cfg.color};box-shadow:0 0 6px ${cfg.color}50;transition:width 1s ease;"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}
