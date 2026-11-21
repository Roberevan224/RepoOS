import { mountNotes } from './apps/notes.js';
import { mountSettings } from './apps/settings.js';
import { mountCalculator } from './apps/calculator.js';
import { mountSystem } from './apps/system.js';

const $ = (selector, root = document) => root.querySelector(selector);

/* ---------------------------------- api ---------------------------------- */

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* --------------------------------- state --------------------------------- */

let user = null;
const windows = new Map();
let topZ = 20;
let openCount = 0;
let authMode = 'signin';

const APPS = [
  { id: 'notes', name: 'Notes', glyph: '📝', width: 780, height: 520, mount: mountNotes, hint: 'Write things down' },
  { id: 'calculator', name: 'Calculator', glyph: '🧮', width: 330, height: 470, mount: mountCalculator, hint: 'Quick maths' },
  { id: 'settings', name: 'Settings', glyph: '⚙️', width: 660, height: 560, mount: mountSettings, hint: 'Make it yours' },
  { id: 'system', name: 'About RepoOS', glyph: 'ℹ️', width: 480, height: 460, mount: mountSystem, hint: 'System status' },
];

const toast = (message, kind = 'info') => {
  const el = document.createElement('div');
  el.className = `toast ${kind === 'error' ? 'error' : ''}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    el.style.transition = '200ms ease';
    setTimeout(() => el.remove(), 220);
  }, 3200);
};

/* ------------------------------- appearance ------------------------------ */

function contrastInk(hex) {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.55 ? '#0b1220' : '#ffffff';
}

function applyAppearance(person) {
  const root = document.documentElement;
  root.dataset.theme = person.theme || 'dark';
  root.dataset.wallpaper = person.wallpaper || 'aurora';
  root.style.setProperty('--accent', person.accent || '#4f8cff');
  root.style.setProperty('--accent-ink', contrastInk(person.accent || '#4f8cff'));
}

function initials(name = '') {
  return (name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2) || 'U').toUpperCase();
}

function renderIdentity() {
  if (!user) return;
  const label = initials(user.name);
  $('#avatar').textContent = label;
  $('#account-avatar').textContent = label;
  $('#account-name').textContent = user.name;
  $('#account-email').textContent = user.email;
  $('#start-user').textContent = `Signed in as ${user.name}`;
}

async function updateUser(patch) {
  const { user: updated } = await api('/me', { method: 'PATCH', body: patch });
  user = updated;
  applyAppearance(user);
  renderIdentity();
  return user;
}

/* ---------------------------------- auth --------------------------------- */

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';
  $('#tab-signin').classList.toggle('is-active', !isSignup);
  $('#tab-signup').classList.toggle('is-active', isSignup);
  $('#tab-signin').setAttribute('aria-selected', String(!isSignup));
  $('#tab-signup').setAttribute('aria-selected', String(isSignup));
  $('#name-field').hidden = !isSignup;
  $('#auth-submit').textContent = isSignup ? 'Create account' : 'Sign in';
  $('#auth-password').setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
  $('#auth-error').textContent = '';
}

function showAuth() {
  $('#boot').classList.add('is-done');
  $('#desktop').hidden = true;
  $('#auth').hidden = false;
  setAuthMode('signin');
  $('#auth-email').focus({ preventScroll: true });
}

$('#tab-signin').addEventListener('click', () => setAuthMode('signin'));
$('#tab-signup').addEventListener('click', () => setAuthMode('signup'));

$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $('#auth-submit');
  const error = $('#auth-error');
  error.textContent = '';

  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const name = $('#auth-name').value.trim();

  if (!email || !password) {
    error.textContent = 'Enter your email and password.';
    return;
  }

  submit.disabled = true;
  submit.textContent = authMode === 'signup' ? 'Creating account…' : 'Signing in…';
  try {
    const result = await api(`/auth/${authMode === 'signup' ? 'signup' : 'login'}`, {
      method: 'POST',
      body: authMode === 'signup' ? { email, password, name } : { email, password },
    });
    $('#auth-password').value = '';
    enterDesktop(result.user);
    toast(`Welcome, ${result.user.name}`);
  } catch (err) {
    error.textContent = err.message;
  } finally {
    submit.disabled = false;
    submit.textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
  }
});

/* -------------------------------- desktop -------------------------------- */

function enterDesktop(person) {
  user = person;
  applyAppearance(user);
  renderIdentity();
  $('#auth').hidden = true;
  $('#desktop').hidden = false;
  $('#boot').classList.add('is-done');
  renderDesktopIcons();
  renderStartMenu();
  startClock();
  // On narrow screens a window would cover the desktop icons, so start clean.
  if (window.innerWidth >= 1100) openApp('notes');
}

function renderDesktopIcons() {
  const host = $('#desktop-icons');
  host.replaceChildren();
  for (const app of APPS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'desktop-icon';
    button.dataset.app = app.id;
    button.innerHTML = `<span class="glyph">${app.glyph}</span><span>${app.name}</span>`;
    button.addEventListener('click', () => openApp(app.id));
    host.append(button);
  }
}

function renderStartMenu() {
  const host = $('#start-grid');
  host.replaceChildren();
  for (const app of APPS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'start-app';
    button.dataset.app = app.id;
    button.dataset.search = `${app.name} ${app.hint}`.toLowerCase();
    button.innerHTML = `<span class="glyph">${app.glyph}</span><span>${app.name}</span>`;
    button.addEventListener('click', () => {
      closeStartMenu();
      openApp(app.id);
    });
    host.append(button);
  }
}

let clockTimer = null;
function startClock() {
  const tick = () => {
    const now = new Date();
    $('#clock-time').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    $('#clock-date').textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    $('#tray-clock').title = now.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
  };
  tick();
  if (!clockTimer) clockTimer = setInterval(tick, 1000);
}

/* ------------------------------ window manager ---------------------------- */

function focusWindow(id) {
  const win = windows.get(id);
  if (!win) return;
  topZ += 1;
  win.el.style.zIndex = String(topZ);
  for (const other of windows.values()) other.el.classList.toggle('is-focused', other === win);
  for (const [key, other] of windows) {
    taskbarButton(key)?.classList.toggle('is-open', key === id && !other.el.classList.contains('is-minimized'));
  }
}

function taskbarButton(id) {
  return $(`.task-btn[data-app="${id}"]`);
}

function openApp(id) {
  closeStartMenu();
  closeAccountMenu();

  const existing = windows.get(id);
  if (existing) {
    existing.el.classList.remove('is-minimized');
    focusWindow(id);
    return;
  }

  const app = APPS.find((item) => item.id === id);
  if (!app) return;

  const width = Math.min(app.width, window.innerWidth - 24);
  const height = Math.min(app.height, window.innerHeight - 110);
  const offset = (openCount % 5) * 26;
  openCount += 1;

  const el = document.createElement('section');
  el.className = 'window';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', app.name);
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.left = `${Math.max(12, Math.round((window.innerWidth - width) / 2) + offset - 40)}px`;
  el.style.top = `${Math.max(12, Math.round((window.innerHeight - height) / 2) - 30 + offset)}px`;
  el.innerHTML = `
    <header class="titlebar">
      <span class="win-glyph" aria-hidden="true">${app.glyph}</span>
      <h2>${app.name}</h2>
      <div class="win-actions">
        <button class="win-btn" type="button" data-act="minimize" aria-label="Minimize">—</button>
        <button class="win-btn" type="button" data-act="maximize" aria-label="Maximize">▢</button>
        <button class="win-btn close" type="button" data-act="close" aria-label="Close">✕</button>
      </div>
    </header>
    <div class="window-body"></div>`;

  const body = $('.window-body', el);
  const record = { app, el, body };
  windows.set(id, record);
  $('#windows').append(el);
  focusWindow(id);
  addTaskbarButton(app);

  el.querySelector('[data-act="close"]').addEventListener('click', () => closeWindow(id));
  el.querySelector('[data-act="minimize"]').addEventListener('click', () => minimizeWindow(id));
  el.querySelector('[data-act="maximize"]').addEventListener('click', () => toggleMaximize(id));
  $('.titlebar', el).addEventListener('dblclick', (event) => {
    if (!event.target.closest('.win-btn')) toggleMaximize(id);
  });
  el.addEventListener('pointerdown', () => focusWindow(id), true);
  makeDraggable(id, el);

  const context = { user, api, toast, updateUser, close: () => closeWindow(id) };
  try {
    const result = app.mount(body, context);
    if (result instanceof Promise) result.catch((err) => toast(err.message, 'error'));
  } catch (err) {
    body.innerHTML = `<div class="app-pad"><p class="muted">This app failed to open: ${err.message}</p></div>`;
  }
}

function addTaskbarButton(app) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'task-btn is-open';
  button.dataset.app = app.id;
  button.title = app.name;
  button.innerHTML = `<span aria-hidden="true">${app.glyph}</span><span>${app.name}</span>`;
  button.addEventListener('click', () => {
    const win = windows.get(app.id);
    if (!win) return;
    if (win.el.classList.contains('is-minimized')) {
      win.el.classList.remove('is-minimized');
      focusWindow(app.id);
    } else if (win.el.classList.contains('is-focused')) {
      minimizeWindow(app.id);
    } else {
      focusWindow(app.id);
    }
  });
  $('#taskbar-apps').append(button);
}

function closeWindow(id) {
  const win = windows.get(id);
  if (!win) return;
  win.el.remove();
  windows.delete(id);
  taskbarButton(id)?.remove();
  const next = [...windows.keys()].pop();
  if (next) focusWindow(next);
}

function minimizeWindow(id) {
  const win = windows.get(id);
  if (!win) return;
  win.el.classList.add('is-minimized');
  taskbarButton(id)?.classList.remove('is-open');
  const next = [...windows.entries()].filter(([, item]) => !item.el.classList.contains('is-minimized')).pop();
  if (next) focusWindow(next[0]);
}

function toggleMaximize(id) {
  const win = windows.get(id);
  if (!win) return;
  win.el.classList.toggle('is-maximized');
  focusWindow(id);
}

function makeDraggable(id, el) {
  const bar = $('.titlebar', el);
  let start = null;

  bar.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.win-btn') || el.classList.contains('is-maximized')) return;
    start = {
      x: event.clientX,
      y: event.clientY,
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
    };
    bar.setPointerCapture(event.pointerId);
  });

  bar.addEventListener('pointermove', (event) => {
    if (!start) return;
    const maxLeft = Math.max(0, window.innerWidth - el.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - el.offsetHeight - 70);
    el.style.left = `${Math.min(maxLeft, Math.max(0, start.left + event.clientX - start.x))}px`;
    el.style.top = `${Math.min(maxTop, Math.max(0, start.top + event.clientY - start.y))}px`;
  });

  const end = () => { start = null; };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
}

/* ------------------------------- chrome menus ----------------------------- */

function closeStartMenu() {
  $('#start-menu').hidden = true;
  $('#start-btn').setAttribute('aria-expanded', 'false');
}

function closeAccountMenu() {
  $('#account-menu').hidden = true;
}

$('#start-btn').addEventListener('click', (event) => {
  event.stopPropagation();
  const menu = $('#start-menu');
  const willOpen = menu.hidden;
  closeAccountMenu();
  menu.hidden = !willOpen;
  $('#start-btn').setAttribute('aria-expanded', String(willOpen));
  if (willOpen) {
    $('#start-search').value = '';
    for (const item of document.querySelectorAll('.start-app')) item.hidden = false;
    $('#start-search').focus();
  }
});

$('#start-search').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  for (const item of document.querySelectorAll('.start-app')) {
    item.hidden = Boolean(query) && !item.dataset.search.includes(query);
  }
});

$('#avatar').addEventListener('click', (event) => {
  event.stopPropagation();
  const menu = $('#account-menu');
  const willOpen = menu.hidden;
  closeStartMenu();
  menu.hidden = !willOpen;
});

$('#account-settings').addEventListener('click', () => {
  closeAccountMenu();
  openApp('settings');
});

const signOut = async () => {
  closeAccountMenu();
  closeStartMenu();
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    /* session already gone */
  }
  for (const id of [...windows.keys()]) closeWindow(id);
  user = null;
  showAuth();
};

$('#sign-out').addEventListener('click', signOut);
$('#account-signout').addEventListener('click', signOut);

document.addEventListener('click', (event) => {
  if (!event.target.closest('#start-menu') && !event.target.closest('#start-btn')) closeStartMenu();
  if (!event.target.closest('#account-menu') && !event.target.closest('#avatar')) closeAccountMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeStartMenu();
    closeAccountMenu();
  }
});

window.addEventListener('resize', () => {
  for (const { el } of windows.values()) {
    const left = Math.min(parseFloat(el.style.left) || 0, Math.max(0, window.innerWidth - el.offsetWidth));
    const top = Math.min(parseFloat(el.style.top) || 0, Math.max(0, window.innerHeight - el.offsetHeight - 70));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }
});

/* ---------------------------------- boot --------------------------------- */

(async () => {
  try {
    const { user: person } = await api('/me');
    if (person) enterDesktop(person);
    else showAuth();
  } catch {
    showAuth();
    $('#auth-error').textContent = 'Could not reach the server. Reload to try again.';
  }
})();
