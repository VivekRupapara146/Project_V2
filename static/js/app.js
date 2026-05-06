/* ═══════════════════════════════════════════════════
   app.js
   Navigation, sidebar, counters, chart defaults,
   auth token management, shared API helper,
   guest mode support
═══════════════════════════════════════════════════ */

const API_BASE = '';

/* ═══════════════════════════════════════════════════
   GUEST MODE FLAG
   true  → user chose "Continue as Guest"
   false → user is authenticated
═══════════════════════════════════════════════════ */
window._guestMode = false;

/* ═══════════════════════════════════════════════════
   AUTH — JWT token management
═══════════════════════════════════════════════════ */
const Auth = {
  getToken()  { return localStorage.getItem('ts_token'); },
  setToken(t) { localStorage.setItem('ts_token', t); },
  removeToken(){ localStorage.removeItem('ts_token'); },
  isLoggedIn(){ return !!this.getToken(); },

  getUser() {
    const t = this.getToken();
    if (!t) return null;
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        this.removeToken();
        return null;
      }
      return payload.sub;
    } catch { return null; }
  },

  logout() {
    this.removeToken();
    window._guestMode       = false;
    window._sessionHistory  = [];
    if (typeof resetCharts === 'function') resetCharts();
    _updateHeaderForAuth();
    showLoginModal();
  }
};

/* ═══════════════════════════════════════════════════
   GUEST MODE ENTRY
═══════════════════════════════════════════════════ */
function enterGuestMode() {
  window._guestMode = true;
  hideLoginModal();
  _updateHeaderForGuest();
  _showGuestBanner();
  onAuthSuccess();   // init charts + metrics same as auth
}

/* ═══════════════════════════════════════════════════
   API HELPER — attaches JWT if present
   Guest requests go through without Authorization header
═══════════════════════════════════════════════════ */
async function apiFetch(path, options = {}) {
  const token   = Auth.getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const res = await fetch(API_BASE + path, { ...options, headers });
  // 401 only kicks authenticated users out — guests already have no token
  if (res.status === 401 && Auth.isLoggedIn()) {
    Auth.logout();
    throw new Error('Unauthorised');
  }
  return res;
}

/* ═══════════════════════════════════════════════════
   LOGIN MODAL
═══════════════════════════════════════════════════ */
function showLoginModal() {
  document.getElementById('login-modal').style.display = 'flex';
  // Reset to login form view
  switchToLogin();
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
  btn.disabled      = true;
  btn.textContent   = 'Signing in...';

  try {
    const res  = await fetch(API_BASE + '/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) { errEl.textContent = data.error || 'Login failed.'; return; }

    Auth.setToken(data.token);
    window._guestMode = false;
    hideLoginModal();
    _hideGuestBanner();
    _updateHeaderForAuth();
    onAuthSuccess();

  } catch (err) {
    errEl.textContent = 'Network error. Is the server running?';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Sign In';
  }
}

function switchToRegister() {
  document.getElementById('login-form-wrap').style.display    = 'none';
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
  btn.disabled      = true;
  btn.textContent   = 'Registering...';

  try {
    const res  = await fetch(API_BASE + '/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Registration failed.'; return; }
    errEl.style.color  = '#22c55e';
    errEl.textContent  = 'Registered! Signing in...';
    document.getElementById('login-email').value    = email;
    document.getElementById('login-password').value = password;
    switchToLogin();
    document.getElementById('login-form').dispatchEvent(new Event('submit'));
  } catch (err) {
    errEl.textContent = 'Network error.';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Create Account';
  }
}

/* ═══════════════════════════════════════════════════
   GUEST BANNER
═══════════════════════════════════════════════════ */
function _showGuestBanner() {
  const banner = document.getElementById('guest-banner');
  if (banner) banner.style.display = 'flex';
}
function _hideGuestBanner() {
  const banner = document.getElementById('guest-banner');
  if (banner) banner.style.display = 'none';
}

/* ═══════════════════════════════════════════════════
   HEADER STATE HELPERS
═══════════════════════════════════════════════════ */
function _updateHeaderForGuest() {
  const emailEl   = document.getElementById('user-menu-email');
  const signinEl  = document.getElementById('header-signin-link');
  const menuSign  = document.getElementById('user-menu-signin');
  const menuSignOut = document.getElementById('user-menu-signout');
  if (emailEl)    emailEl.textContent       = 'Guest User';
  if (signinEl)   signinEl.style.display    = 'flex';
  if (menuSign)   menuSign.style.display    = 'flex';
  if (menuSignOut) menuSignOut.style.display = 'none';
}

function _updateHeaderForAuth() {
  const user      = Auth.getUser();
  const emailEl   = document.getElementById('user-menu-email');
  const signinEl  = document.getElementById('header-signin-link');
  const menuSign  = document.getElementById('user-menu-signin');
  const menuSignOut = document.getElementById('user-menu-signout');
  if (emailEl)    emailEl.textContent       = user || '—';
  if (signinEl)   signinEl.style.display    = 'none';
  if (menuSign)   menuSign.style.display    = 'none';
  if (menuSignOut) menuSignOut.style.display = 'flex';
}

/* ═══════════════════════════════════════════════════
   USER MENU DROPDOWN
═══════════════════════════════════════════════════ */
function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

/* ═══════════════════════════════════════════════════
   POST-LOGIN / POST-GUEST INIT
═══════════════════════════════════════════════════ */
function onAuthSuccess() {
  if (!window._guestMode) {
    const user    = Auth.getUser();
    const emailEl = document.getElementById('user-menu-email');
    if (emailEl && user) emailEl.textContent = user;
    _updateHeaderForAuth();
  }
  startMetricsPoll();
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
   CHART DEFAULTS
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
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  document.getElementById('overlay').addEventListener('click', closeSidebar);

  document.addEventListener('click', (e) => {
    const avatar = document.getElementById('user-avatar');
    const menu   = document.getElementById('user-menu');
    if (!menu || !avatar) return;
    if (!avatar.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);

  // Auth gate — allow guest bypass
  if (Auth.isLoggedIn()) {
    onAuthSuccess();
  } else {
    showLoginModal();
  }
});
