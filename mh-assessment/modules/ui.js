// Small DOM and utility helpers shared by the UI modules.

export const $ = (selector, root = document) => root.querySelector(selector);

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function downloadText(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function debounce(fn, ms) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

// Builds an element from an HTML string (one root element).
export function html(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

let popId = 0;

// An "i" button that toggles a small popover with `text`. Uses the native
// popover attribute; `label` names the button for screen readers.
export function infoPop(text, label = 'More information') {
  const id = `info-pop-${++popId}`;
  return `<span class="info-pop-wrap"><button type="button" class="info-pop-btn" popovertarget="${id}" aria-label="${esc(label)}">i</button>`
    + `<span popover id="${id}" class="info-pop" role="note">${esc(text)}</span></span>`;
}

// FR-7: small AUCDI Release 3 badge with an explanatory tooltip.
export function aucdiBadge(group) {
  const tip = `This field corresponds to the ${group} data group in Australian Clinical Data for Interoperability (AUCDI) Release 3.`;
  return `<span class="badge-aucdi" title="${esc(tip)}"><span class="sr-only">${esc(tip)} </span><span aria-hidden="true">AUCDI R3: ${esc(group)}</span></span>`;
}

// Position open popovers next to their button (no CSS anchor positioning yet).
document.addEventListener('toggle', e => {
  const pop = e.target;
  if (!(pop instanceof HTMLElement) || !pop.classList?.contains('info-pop') || e.newState !== 'open') return;
  const btn = document.querySelector(`[popovertarget="${pop.id}"]`);
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 32);
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.max(16, Math.min(r.left, window.innerWidth - width - 16))}px`;
  pop.style.top = `${r.bottom + 6}px`;
}, true);

// "2014-08-01" -> "01/08/2014" (en-AU). Returns '' for empty input.
export function formatDateAU(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = String(isoDate).split('-');
  if (!y) return '';
  return [d, m, y].filter(Boolean).join('/');
}

// Whole years between an ISO birth date and today. Null if unknown.
export function ageFrom(isoDate, now = new Date()) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(isoDate || '');
  if (!m) return null;
  const y = +m[1], mo = +(m[2] || 1), d = +(m[3] || 1);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
  return age >= 0 ? age : null;
}

// Returns limit(fn): runs async fn with at most `max` calls in flight.
export function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return fn => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}
