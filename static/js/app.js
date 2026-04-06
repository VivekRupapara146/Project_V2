/* ═══════════════════════════════════════════════════
   app.js
   Navigation, sidebar, counters, chart defaults,
   auth token management, shared API helper
═══════════════════════════════════════════════════ */

const API_BASE = '';   // same origin — Flask serves both frontend and API

/* ═══════════════════════════════════════════════════
   AUTH — JWT token management
═══════════════════════════════════════════════════ */
const Auth = {
  getToken()        { return localStorage.getItem('ts_token'); },
  setToken(t)       { localStorage.setItem('ts_token', t); },
  removeToken()     { localStorage.removeItem('ts_token'); },
  isLoggedIn()      { return !!this.getToken(); },

  getUser() {
    const t = this.getToken();
    if (!t) return null;
    try {
      // Decode JWT payload (base64 middle segment) — no verify, just read
      const payload = JSON.parse(atob(t.split('.')[1]));
      // Check expiry
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        this.removeToken();
        return null;
      }
      return payload.sub;   // email
    } catch { return null; }
  },

  logout() {
    this.removeToken();
    // Clear session analysis history so next login starts fresh
    window._sessionHistory = [];
    // Reset charts back to empty state
    if (typeof resetCharts === 'function') resetCharts();
    showLoginModal();
  }
};

/* ═══════════════════════════════════════════════════
   API HELPER — always attaches JWT header
═══════════════════════════════════════════════════ */
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Don't set Content-Type for FormData — browser sets it with boundary
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (res.status === 401) { Auth.logout(); throw new Error('Unauthorised'); }
  return res;
}

/* ═══════════════════════════════════════════════════
   LOGIN MODAL
═══════════════════════════════════════════════════ */
function showLoginModal() {
  document.getElementById('login-modal').style.display = 'flex';
}
function hideLoginModal() {
  document.getElementById('login-modal').style.display = 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent  = 'Signing in...';

  try {
    const res  = await fetch(API_BASE + '/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Login failed.';
      return;
    }

    Auth.setToken(data.token);
    hideLoginModal();
    onAuthSuccess();

  } catch (err) {
    errEl.textContent = 'Network error. Is the server running?';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

function switchToRegister() {
  document.getElementById('login-form-wrap').style.display  = 'none';
  document.getElementById('register-form-wrap').style.display = 'flex';
  document.getElementById('login-error').textContent = '';
}
function switchToLogin() {
  document.getElementById('register-form-wrap').style.display = 'none';
  document.getElementById('login-form-wrap').style.display    = 'flex';
  document.getElementById('register-error').textContent = '';
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('register-error');
  const btn      = document.getElementById('register-btn');

  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent  = 'Registering...';

  try {
    const res  = await fetch(API_BASE + '/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Registration failed.';
      return;
    }

    // Auto-login after register
    errEl.style.color = '#22c55e';
    errEl.textContent = 'Registered! Signing in...';
    document.getElementById('login-email').value    = email;
    document.getElementById('login-password').value = password;
    switchToLogin();
    document.getElementById('login-form').dispatchEvent(new Event('submit'));

  } catch (err) {
    errEl.textContent = 'Network error.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

/* ═══════════════════════════════════════════════════
   POST-LOGIN INIT
═══════════════════════════════════════════════════ */
function onAuthSuccess() {
  const user = Auth.getUser();
  if (user) {
    document.getElementById('avatar-label').textContent = user.split('@')[0];
  }
  // Start metrics polling
  startMetricsPoll();
  // Init dashboard charts with real data
  initDashboardCharts();
}

/* ═══════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════ */
const pageTitles = {
  dashboard: 'Traffic Monitoring Dashboard',
  live:      'Live Camera Feed',
  analytics: 'Traffic Analytics',
  reports:   'Reports Center',
  zones:     'Zone Management',
  alerts:    'Alerts & Notifications',
  settings:  'System Settings',
};

let chartsInitialized = {};

function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === pageId);
  });
  document.getElementById('page-title').textContent = pageTitles[pageId] || pageId;
  closeSidebar();

  if (pageId === 'analytics' && !chartsInitialized.analytics) { initAnalyticsCharts(); chartsInitialized.analytics = true; }
  if (pageId === 'live'      && !chartsInitialized.live)      { renderFeed();           chartsInitialized.live      = true; }
  if (pageId === 'reports'   && !chartsInitialized.reports)   { renderReports();        chartsInitialized.reports   = true; }
  if (pageId === 'zones'     && !chartsInitialized.zones)     { renderZones();          chartsInitialized.zones     = true; }
  if (pageId === 'alerts'    && !chartsInitialized.alerts)    { renderAlerts();         chartsInitialized.alerts    = true; }
}

/* ═══════════════════════════════════════════════════
   MOBILE SIDEBAR
═══════════════════════════════════════════════════ */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

/* ═══════════════════════════════════════════════════
   ANIMATED COUNTERS
═══════════════════════════════════════════════════ */
function animateCounter(el, target, duration) {
  const start = performance.now();
  function tick(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target).toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ═══════════════════════════════════════════════════
   CHART DEFAULTS  (used by charts.js)
═══════════════════════════════════════════════════ */
Chart.defaults.color       = '#64748b';
Chart.defaults.borderColor = 'rgba(255,255,255,0.04)';
Chart.defaults.font.family = 'Inter';
Chart.defaults.font.size   = 11;

const tooltipPlugin = {
  backgroundColor: 'rgba(6,10,20,0.96)',
  borderColor:     'rgba(0,212,255,0.2)',
  borderWidth:     1,
  titleColor:      '#e2e8f0',
  bodyColor:       '#94a3b8',
  cornerRadius:    10,
  padding:         10,
};

/* ═══════════════════════════════════════════════════
   DOM READY
═══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Wire nav buttons
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  // Overlay tap closes sidebar
  document.getElementById('overlay').addEventListener('click', closeSidebar);

  // Login / register form handlers
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);

  // Check auth state
  if (!Auth.isLoggedIn()) {
    showLoginModal();
  } else {
    onAuthSuccess();
  }
});
