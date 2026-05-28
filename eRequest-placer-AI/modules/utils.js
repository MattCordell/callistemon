// modules/utils.js — UUID, formatAddress, date helpers, DOM helpers, debug panel

// ----- DOM helpers -----
export function $(s) { return document.querySelector(s); }

// ----- UUID -----
export function newUUID() {
  return (crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : (Date.now() + '-' + Math.random().toString(16).slice(2)));
}

export function uuidURN() { return 'urn:uuid:' + newUUID(); }

// ----- Address formatting -----
export function formatAddress(addr) {
  if (!addr) return '';
  if (addr.text) return addr.text;
  const parts = [];
  if (Array.isArray(addr.line) && addr.line.length) parts.push(addr.line.join(', '));
  if (addr.city) parts.push(addr.city);
  if (addr.state) parts.push(addr.state);
  if (addr.postalCode) parts.push(addr.postalCode);
  if (addr.country) parts.push(addr.country);
  return parts.filter(Boolean).join(', ');
}

// ----- Date helpers -----
export function isoDateMonthsAgo(m) {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  return d.toISOString();
}

export function isoDateDaysAgo(dy) {
  return new Date(Date.now() - dy * 24 * 60 * 60 * 1000).toISOString();
}

// ----- Status / Error -----
export function showError(msg) {
  const box = $('#error-box');
  box.textContent = msg;
  box.classList.remove('hidden');
}

export function showStatus(msg) {
  const box = $('#status-box');
  box.textContent = msg;
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 4000);
}

// ----- Debug panel -----
const debug = { history: [], max: 50 };

export function setDebugUrl(url) {
  if (!url) return;
  const last = document.querySelector('#last-expand-url');
  if (!last) return;
  last.textContent = url;
  debug.history.unshift({ url, ts: new Date() });
  if (debug.history.length > debug.max) debug.history.pop();
  const ul = document.querySelector('#expand-history');
  if (!ul) return;
  ul.innerHTML = '';
  debug.history.forEach((i) => {
    const li = document.createElement('li');
    li.className = 'break-all';
    li.textContent = '[' + i.ts.toLocaleTimeString() + '] ' + i.url;
    ul.appendChild(li);
  });
}

export function initDebugPanel() {
  const panel = document.getElementById('debug-panel');
  const toggle = document.getElementById('debug-toggle');
  const close = document.getElementById('debug-close');
  const copy = document.getElementById('debug-copy');

  if (toggle) toggle.addEventListener('click', () => panel.classList.toggle('hidden'));
  if (close) close.addEventListener('click', () => panel.classList.add('hidden'));
  if (copy) copy.addEventListener('click', async () => {
    const t = (document.querySelector('#last-expand-url') || {}).textContent || '';
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      const old = copy.textContent;
      copy.textContent = 'Copied!';
      setTimeout(() => { copy.textContent = old; }, 1200);
    } catch (_e) { /* clipboard blocked */ }
  });
}
