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

// ----- AI prompt log (debug-only) -----
// Captures the exact message payloads sent to the model so they can be inspected
// from the Debug panel. This is a developer aid only — it is NOT shown in the
// normal app UI. Prompts include clinical free-text / patient demographics, the
// same data already visible in the terminology URLs above; same client-side,
// same-origin risk posture (spec §9). Capture happens once per chatCompletion
// call in openrouter-client.js.
const aiPromptLog = { history: [], max: 20 };

export function logAiPrompt(entry) {
  if (!entry) return;
  // Snapshot the messages at capture time. runAgent reuses ONE messages array and
  // mutates it across tool-loop iterations, so holding the live reference would
  // make every entry for a run show the final transcript, not the per-call
  // payload. Deep-clone (payloads are JSON-serialisable — they're JSON.stringify'd
  // to send anyway); fall back to a shallow copy if cloning ever fails.
  let messages = [];
  try { messages = JSON.parse(JSON.stringify(entry.messages || [])); }
  catch (_e) { messages = Array.isArray(entry.messages) ? entry.messages.slice() : []; }

  aiPromptLog.history.unshift({
    ts: new Date(),
    model: entry.model || '(default)',
    route: entry.route || '',
    messages,
    toolCount: entry.toolCount || 0,
  });
  if (aiPromptLog.history.length > aiPromptLog.max) aiPromptLog.history.pop();
  renderAiPromptLog();
}

/** Snapshot of the captured prompts (most recent first), for the Copy-all button. */
export function getAiPromptLog() {
  return aiPromptLog.history.map((r) => ({
    ts: r.ts.toISOString(), model: r.model, route: r.route, toolCount: r.toolCount, messages: r.messages,
  }));
}

function formatMessages(messages) {
  return messages.map((m) => {
    const role = String(m.role || '?').toUpperCase();
    let body;
    if (typeof m.content === 'string') body = m.content;
    else if (m.content == null) body = '';
    else body = JSON.stringify(m.content);
    let extra = '';
    if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
      extra += '\n[tool_calls] ' + m.tool_calls
        .map((tc) => ((tc.function && tc.function.name) || '?') + '(' + ((tc.function && tc.function.arguments) || '') + ')')
        .join(', ');
    }
    if (m.tool_call_id) extra += '\n[tool_call_id] ' + m.tool_call_id;
    return '── ' + role + ' ──\n' + body + extra;
  }).join('\n\n');
}

function renderAiPromptLog() {
  const ul = document.querySelector('#ai-prompt-log');
  if (!ul) return;
  ul.replaceChildren();
  aiPromptLog.history.forEach((rec) => {
    const li = document.createElement('li');
    const det = document.createElement('details');
    det.className = 'border border-yellow-200 rounded bg-yellow-50';
    const sum = document.createElement('summary');
    sum.className = 'cursor-pointer px-2 py-1 text-[11px] text-yellow-900';
    sum.textContent = '[' + rec.ts.toLocaleTimeString() + '] '
      + (rec.route ? rec.route + ' · ' : '') + rec.model
      + ' · ' + rec.messages.length + ' msg'
      + (rec.toolCount ? ' · ' + rec.toolCount + ' tools' : '');
    det.appendChild(sum);
    const pre = document.createElement('pre');
    // textContent only — content carries AI-sourced / clinical free-text.
    pre.className = 'text-[11px] whitespace-pre-wrap break-words p-2 border-t border-yellow-200 max-h-[30vh] overflow-auto';
    pre.textContent = formatMessages(rec.messages);
    det.appendChild(pre);
    li.appendChild(det);
    ul.appendChild(li);
  });
}

export function initDebugPanel() {
  const panel = document.getElementById('debug-panel');
  const toggle = document.getElementById('debug-toggle');
  const close = document.getElementById('debug-close');
  const copy = document.getElementById('debug-copy');
  const copyPrompts = document.getElementById('ai-prompt-copy');

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
  if (copyPrompts) copyPrompts.addEventListener('click', async () => {
    const data = getAiPromptLog();
    if (!data.length) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      const old = copyPrompts.textContent;
      copyPrompts.textContent = 'Copied!';
      setTimeout(() => { copyPrompts.textContent = old; }, 1200);
    } catch (_e) { /* clipboard blocked */ }
  });
}
