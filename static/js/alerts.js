/* ═══════════════════════════════════════════════════
   alerts.js
   Alert data, rendering, filtering, mark-read
═══════════════════════════════════════════════════ */

const alerts = [
  { id: 1, type: 'critical', title: 'Severe Congestion Detected',  location: 'City Center Bridge (Z-06)', time: '2 min ago',  desc: 'Vehicle density exceeds 95% capacity. Immediate attention required.',                      icon: 'fa-car-burst',    color: '#ef4444', read: false },
  { id: 2, type: 'warning',  title: 'Unusual Speed Detected',      location: 'Highway I-95 North',        time: '8 min ago',  desc: 'Multiple vehicles exceeding 120 km/h speed limit in restricted zone.',                    icon: 'fa-gauge-high',   color: '#f59e0b', read: false },
  { id: 3, type: 'warning',  title: 'Camera Offline',              location: 'Industrial Zone A (CAM-05)',time: '15 min ago', desc: 'Feed lost. Manual inspection may be required.',                                          icon: 'fa-video-slash',  color: '#f59e0b', read: false },
  { id: 4, type: 'info',     title: 'Peak Hour Alert',             location: 'Downtown Core (Z-01)',       time: '25 min ago', desc: 'Traffic volume 34% above average for this time slot.',                                  icon: 'fa-chart-line',   color: '#00d4ff', read: true  },
  { id: 5, type: 'info',     title: 'Incident Cleared',            location: 'Airport Boulevard',          time: '42 min ago', desc: 'Previous minor collision cleared. Traffic flow restored.',                              icon: 'fa-circle-check', color: '#22c55e', read: true  },
  { id: 6, type: 'critical', title: 'Wrong-Way Vehicle',           location: 'Highway Onramp E12',        time: '1h ago',     desc: 'Vehicle detected travelling in wrong direction. Emergency services notified.',           icon: 'fa-ban',          color: '#ef4444', read: true  },
];

let activeFilter = 'all';

function renderAlerts() {
  const list     = document.getElementById('alert-list');
  const filtered = activeFilter === 'all' ? alerts : alerts.filter(a => a.type === activeFilter);

  list.innerHTML = filtered.map(a => `
    <div class="alert-item ${a.read ? '' : 'unread'}" onclick="markRead(${a.id})"
      style="${!a.read ? `border-left-color:${a.color};` : ''}border-color:${!a.read ? a.color + '28' : 'rgba(255,255,255,0.04)'};">
      <div class="alert-icon" style="background:${a.color}15;">
        <i class="fa-solid ${a.icon}" style="color:${a.color};"></i>
      </div>
      <div class="alert-body">
        <div class="alert-head">
          <span class="alert-title">${a.title}</span>
          ${!a.read ? `<div class="unread-dot" style="background:${a.color};"></div>` : ''}
        </div>
        <div class="alert-loc"><i class="fa-solid fa-location-dot" style="color:${a.color}80;"></i> ${a.location} · ${a.time}</div>
        <div class="alert-desc">${a.desc}</div>
      </div>
      <div>
        <span class="alert-badge" style="color:${a.color};background:${a.color}15;border:1px solid ${a.color}22;">${a.type}</span>
      </div>
    </div>
  `).join('');

  // Update unread count badge
  const unread = alerts.filter(a => !a.read).length;
  const badge  = document.getElementById('unread-count');
  badge.textContent    = unread + ' new';
  badge.style.display  = unread > 0 ? '' : 'none';
}

function markRead(id) {
  const a = alerts.find(x => x.id === id);
  if (a) a.read = true;
  renderAlerts();
}

function markAllRead() {
  alerts.forEach(a => a.read = true);
  renderAlerts();
}

function filterAlerts(btn, filter) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = filter;
  renderAlerts();
}
