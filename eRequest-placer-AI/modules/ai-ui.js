// modules/ai-ui.js — shared UI helpers for the AI features (Feature A reason
// coding now; reused by Feature B test selection and Feature C decision support).
//
// Pure DOM, no module imports. All text rendered via textContent — values may be
// AI-sourced, so nothing here uses innerHTML.

const KIND_STYLES = {
  // AI suggestion chips use indigo + ✨ so they are visibly distinct from the
  // emerald manual reason chips (see reason-tags.js).
  reason:  { chip: 'border-indigo-200 bg-indigo-50 text-indigo-800', spark: true, heading: 'AI-suggested reason codes' },
  test:    { chip: 'border-indigo-200 bg-indigo-50 text-indigo-800', spark: true, heading: 'AI-suggested tests' },
  finding: { chip: 'border-amber-200 bg-amber-50 text-amber-800',   spark: false, heading: 'Findings' },
};

/**
 * Render an accept/reject review list of AI suggestions into `container`.
 * Owns a working copy of `items`; accept/reject splice it and re-render, so the
 * caller's callbacks only handle side effects. Hides + empties the container
 * once nothing remains.
 *
 * @param {object} o
 * @param {HTMLElement} o.container
 * @param {Array<{system?:string,code:string,display:string}>} o.items
 * @param {(item:object)=>void} [o.onAccept]
 * @param {(item:object)=>void} [o.onReject]
 * @param {(remaining:object[])=>void} [o.onAcceptAll]
 * @param {()=>void} [o.onRejectAll]
 * @param {(remaining:number)=>void} [o.onCountChange] invoked after each render with the remaining count
 * @param {'reason'|'test'|'finding'} [o.kind]
 */
export function renderSuggestionReviewList({
  container, items, onAccept, onReject, onAcceptAll, onRejectAll, onCountChange, kind = 'reason',
}) {
  if (!container) return;
  const style = KIND_STYLES[kind] || KIND_STYLES.reason;
  const working = Array.isArray(items) ? items.slice() : [];

  const remove = (item) => { const i = working.indexOf(item); if (i > -1) working.splice(i, 1); };

  function render() {
    container.replaceChildren();
    if (!working.length) {
      container.classList.add('hidden');
      if (typeof onCountChange === 'function') onCountChange(0);
      return;
    }
    container.classList.remove('hidden');

    // ----- header: count + bulk actions -----
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between gap-2 mb-2';
    const h = document.createElement('div');
    h.className = 'text-xs font-medium text-gray-600';
    h.textContent = style.heading + ' — review (' + working.length + ')';
    header.appendChild(h);

    const actions = document.createElement('div');
    actions.className = 'flex gap-2';
    const acceptAll = document.createElement('button');
    acceptAll.type = 'button';
    acceptAll.className = 'text-xs px-2 py-1 rounded bg-indigo-600 text-white';
    acceptAll.textContent = 'Accept all';
    acceptAll.onclick = () => {
      const remaining = working.slice();
      if (typeof onAcceptAll === 'function') onAcceptAll(remaining);
      else if (typeof onAccept === 'function') remaining.forEach(onAccept);
      working.length = 0;
      render();
    };
    const rejectAll = document.createElement('button');
    rejectAll.type = 'button';
    rejectAll.className = 'text-xs px-2 py-1 rounded border bg-white';
    rejectAll.textContent = 'Reject all';
    rejectAll.onclick = () => {
      if (typeof onRejectAll === 'function') onRejectAll();
      working.length = 0;
      render();
    };
    actions.appendChild(acceptAll);
    actions.appendChild(rejectAll);
    header.appendChild(actions);
    container.appendChild(header);

    // ----- the suggestions -----
    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    ul.className = 'flex flex-wrap gap-2';
    working.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'inline-flex items-center gap-1.5 border ' + style.chip + ' rounded-full pl-2 pr-1 py-0.5 text-xs';

      if (style.spark) {
        const s = document.createElement('span');
        s.setAttribute('aria-hidden', 'true');
        s.textContent = '✨';
        li.appendChild(s);
      }
      const label = document.createElement('span');
      label.textContent = item.display + (item.code ? ' (' + item.code + ')' : '');
      li.appendChild(label);

      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'opacity-80 hover:opacity-100 font-semibold';
      accept.textContent = '✓';
      accept.setAttribute('aria-label', 'Accept ' + (item.display || item.code));
      accept.onclick = () => { if (typeof onAccept === 'function') onAccept(item); remove(item); render(); };

      const reject = document.createElement('button');
      reject.type = 'button';
      reject.className = 'opacity-70 hover:opacity-100';
      reject.textContent = '✕';
      reject.setAttribute('aria-label', 'Reject ' + (item.display || item.code));
      reject.onclick = () => { if (typeof onReject === 'function') onReject(item); remove(item); render(); };

      li.appendChild(accept);
      li.appendChild(reject);
      ul.appendChild(li);
    });
    container.appendChild(ul);
    if (typeof onCountChange === 'function') onCountChange(working.length);
  }

  render();
}

/** Disable a button and swap its label to a loading indicator; restores on false. */
export function setLoadingState(buttonEl, isLoading, loadingText = 'Working…') {
  if (!buttonEl) return;
  if (isLoading) {
    if (buttonEl.dataset.originalLabel == null) buttonEl.dataset.originalLabel = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.classList.add('btn-disabled');
    buttonEl.textContent = '⏳ ' + loadingText;
  } else {
    buttonEl.disabled = false;
    buttonEl.classList.remove('btn-disabled');
    if (buttonEl.dataset.originalLabel != null) {
      buttonEl.textContent = buttonEl.dataset.originalLabel;
      delete buttonEl.dataset.originalLabel;
    }
  }
}

/** Non-alarming inline empty message (spec §4.7). */
export function renderEmptyState(container, message) {
  if (!container) return;
  container.classList.remove('hidden');
  container.replaceChildren();
  const p = document.createElement('p');
  p.className = 'text-sm text-gray-500';
  p.textContent = message;
  container.appendChild(p);
}

/** Inline error with a Retry button (spec §4.7). Must not block the rest of the form. */
export function renderErrorState(container, message, onRetry) {
  if (!container) return;
  container.classList.remove('hidden');
  container.replaceChildren();
  const box = document.createElement('div');
  box.className = 'flex items-center gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2';
  const msg = document.createElement('span');
  msg.textContent = message;
  box.appendChild(msg);
  if (typeof onRetry === 'function') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'ml-auto text-xs px-2 py-1 rounded border bg-white';
    retry.textContent = 'Retry';
    retry.onclick = onRetry;
    box.appendChild(retry);
  }
  container.appendChild(box);
}

// ----- Phase 4 (decision support) stubs — implemented in that phase. -----
export function renderAdvisoryPanel(/* { container, findings, onAddTest, onDismiss } */) {
  console.warn('ai-ui.renderAdvisoryPanel is a Phase 4 stub — not implemented yet.');
}

export function openSeriousReviewModal(/* { findings, advisoryFindings } */) {
  console.warn('ai-ui.openSeriousReviewModal is a Phase 4 stub — not implemented yet.');
  return Promise.resolve({ action: 'proceed' });
}
