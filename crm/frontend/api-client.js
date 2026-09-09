/* Shared helpers used by app.js and calendar.js. Plain script (no ES
   modules) so this also works when opened directly as a local file. */

const API_BASE = '/api';
let useDemoMode = false;
let demoModeChecked = false;

async function ensureDemoModeChecked() {
  if (demoModeChecked) return;
  demoModeChecked = true;
  try {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) throw new Error('api not ready');
    useDemoMode = false;
  } catch {
    useDemoMode = true;
    showDemoBanner();
  }
}

function showDemoBanner() {
  const banner = document.createElement('div');
  banner.textContent = 'Demo mode -- showing sample data only. Deploy the api/ folder and Cosmos DB per the README to go live.';
  banner.style.cssText =
    'background:#FFF4E5;color:#7A4A00;font-size:12px;text-align:center;padding:6px;border-bottom:1px solid #F0C36D;';
  document.body.prepend(banner);
}

function demoRoute(method, pathAndQuery, body) {
  const [rawPath, queryString] = pathAndQuery.split('?');
  const query = new URLSearchParams(queryString || '');
  const parts = rawPath.split('/').filter(Boolean);

  if (parts[0] === 'config') return window.DemoApi.getConfig();
  if (parts[0] === 'calendar') return window.DemoApi.getCalendarFeed(Number(query.get('days')) || 5);

  if (parts[0] === 'leads') {
    if (parts.length === 1) {
      if (method === 'GET') return window.DemoApi.getLeads(query.get('archived') === 'true');
      if (method === 'POST') return window.DemoApi.createLead(body);
    }
    const id = parts[1];
    if (parts.length === 2 && method === 'PATCH') return window.DemoApi.updateLead(id, body);
    if (parts.length === 2 && method === 'DELETE') return window.DemoApi.deleteLead(id);
    if (parts[2] === 'stage') return window.DemoApi.updateStage(id, body.action, body.targetStage);
    if (parts[2] === 'archive') return window.DemoApi.archiveLead(id, body.archived !== false);
    if (parts[2] === 'actions' && parts.length === 3) return window.DemoApi.addActionItem(id, body);
    if (parts[2] === 'actions' && parts.length === 4) return window.DemoApi.updateActionItem(id, parts[3], body);
    if (parts[2] === 'events' && parts.length === 3) return window.DemoApi.addEvent(id, body);
    if (parts[2] === 'events' && parts.length === 4) return window.DemoApi.updateEvent(id, parts[3], body);
    if (parts[2] === 'communications') return window.DemoApi.addCommunication(id, body);
  }
  throw new Error(`No demo route for ${method} ${pathAndQuery}`);
}

async function safeErrorMessage(res) {
  try {
    const body = await res.json();
    return body.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

async function apiGet(pathAndQuery) {
  await ensureDemoModeChecked();
  if (useDemoMode) return demoRoute('GET', pathAndQuery);
  const res = await fetch(`${API_BASE}${pathAndQuery}`);
  if (!res.ok) throw new Error(await safeErrorMessage(res));
  return res.json();
}

async function apiPost(path, body) {
  await ensureDemoModeChecked();
  if (useDemoMode) return demoRoute('POST', path, body);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await safeErrorMessage(res));
  return res.json();
}

async function apiPatch(path, body) {
  await ensureDemoModeChecked();
  if (useDemoMode) return demoRoute('PATCH', path, body);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await safeErrorMessage(res));
  return res.json();
}

async function apiDelete(path) {
  await ensureDemoModeChecked();
  if (useDemoMode) return demoRoute('DELETE', path);
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await safeErrorMessage(res));
}

function applyBrandFromConfig(config) {
  const root = document.documentElement.style;
  Object.entries(config.brand.colors).forEach(([key, value]) => {
    root.setProperty(`--brand-${camelToKebab(key)}`, value);
  });
  document.querySelectorAll('[data-logo="full"]').forEach((img) => (img.src = config.brand.logos.full));
  document.querySelectorAll('[data-logo="icon"]').forEach((img) => (img.src = config.brand.logos.icon));
}

function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // Date-only values ("YYYY-MM-DD", used for action item due dates) are
  // parsed as UTC by the Date constructor, which can shift the displayed
  // day by one depending on the browser's timezone. Parse those as local
  // instead; full ISO datetimes (events, timestamps) parse normally.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(dateStr);
  if (dateOnly) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Converts a stored ISO datetime into the local "YYYY-MM-DDTHH:mm" string a
// <input type="datetime-local"> needs as its value -- the inverse of the
// `new Date(input.value).toISOString()` conversion used when saving one.
function toDatetimeLocalValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showToast(message, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' is-error' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
