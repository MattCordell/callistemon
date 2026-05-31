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

      // PATH/IMAG (or any caller-supplied kind) badge — used by Feature B.
      if (item.kind) {
        const badge = document.createElement('span');
        badge.className = 'text-[10px] leading-none px-1 py-0.5 rounded border border-current opacity-70';
        badge.textContent = item.kind;
        li.appendChild(badge);
      }

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

/**
 * Render a click-to-add list of AI suggestions into `container`.
 *
 * Unlike renderSuggestionReviewList, there are no per-chip ✓/✕ buttons and no
 * Accept-all/Reject-all actions: the user clicks a chip to add it (onPick) and it
 * leaves the list; unwanted suggestions are simply ignored. This mirrors the
 * non-AI reason-suggestion UX (reason-tags.js showReasonSuggestions) — the
 * "remove" affordance lives only on the committed tags, not on suggestions.
 *
 * The concept CODE is intentionally NOT displayed (text only); callers still
 * receive the full item — code/system included — via onPick, so it flows into the
 * FHIR bundle unchanged.
 *
 * @param {object} o
 * @param {HTMLElement} o.container
 * @param {Array<{system?:string,code:string,display:string,kind?:string}>} o.items
 * @param {(item:object)=>void} [o.onPick]   invoked when a suggestion is clicked
 * @param {(remaining:number)=>void} [o.onCountChange]
 * @param {'reason'|'test'|'finding'} [o.kind]
 */
export function renderSuggestionPickList({
  container, items, onPick, onCountChange, kind = 'reason',
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

    const h = document.createElement('div');
    h.className = 'text-xs font-medium text-gray-600 mb-2';
    h.textContent = style.heading + ' — click to add';
    container.appendChild(h);

    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    ul.className = 'flex flex-wrap gap-2';
    working.forEach((item) => {
      const li = document.createElement('li');
      // The whole chip is the button — click to add, matching the non-AI
      // suggestion buttons (reason-tags.js showReasonSuggestions).
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inline-flex items-center gap-1.5 border ' + style.chip
        + ' rounded-full px-2 py-0.5 text-xs hover:opacity-80';

      if (style.spark) {
        const s = document.createElement('span');
        s.setAttribute('aria-hidden', 'true');
        s.textContent = '✨';
        btn.appendChild(s);
      }
      const label = document.createElement('span');
      // Display text ONLY — the code is kept on the item (and in the bundle) but
      // not shown to the user.
      label.textContent = item.display || item.code || '';
      btn.appendChild(label);

      // PATH/IMAG (or any caller-supplied kind) badge — used by Feature B.
      if (item.kind) {
        const badge = document.createElement('span');
        badge.className = 'text-[10px] leading-none px-1 py-0.5 rounded border border-current opacity-70';
        badge.textContent = item.kind;
        btn.appendChild(badge);
      }

      btn.setAttribute('aria-label', 'Add ' + (item.display || item.code));
      btn.onclick = () => { if (typeof onPick === 'function') onPick(item); remove(item); render(); };

      li.appendChild(btn);
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

// ----- Feature C: decision support (spec §C.9) -----

const SEVERITY_STYLE = {
  advisory: { row: 'border-amber-200 bg-amber-50', dot: 'bg-amber-500', label: 'Advisory' },
  serious:  { row: 'border-red-300 bg-red-50',     dot: 'bg-red-600',   label: 'Review' },
};

// A SNOMED concept id is a bare integer string — only those get an "Add test"
// affordance (we can't add a test we can't identify).
function isSnomedId(s) { return /^[0-9]+$/.test(String(s || '')); }

function severityBadge(severity) {
  const style = SEVERITY_STYLE[severity] || SEVERITY_STYLE.advisory;
  const wrap = document.createElement('span');
  wrap.className = 'inline-flex items-center gap-1 text-[11px] font-medium';
  const dot = document.createElement('span');
  dot.className = 'inline-block w-2 h-2 rounded-full ' + style.dot;
  dot.setAttribute('aria-hidden', 'true');
  const txt = document.createElement('span');
  txt.textContent = style.label;
  wrap.appendChild(dot);
  wrap.appendChild(txt);
  return wrap;
}

/**
 * Tier 1 — inline, non-blocking advisory panel (spec §C.9). Renders every finding
 * with its summary + severity indicator. `suggestion` findings whose related_tests
 * contain a SNOMED id get one-click "Add test" buttons. All text via textContent.
 *
 * @param {object} o
 * @param {HTMLElement} o.container
 * @param {Array} o.findings              — validated findings (severity, dimension, summary, …)
 * @param {(code:string)=>void} [o.onAddTest]
 * @param {()=>void} [o.onDismiss]
 */
export function renderAdvisoryPanel({ container, findings, onAddTest, onDismiss }) {
  if (!container) return;
  container.replaceChildren();
  const list = Array.isArray(findings) ? findings : [];
  if (!list.length) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');

  const box = document.createElement('div');
  box.className = 'border border-gray-200 rounded-lg p-3 bg-white';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between gap-2 mb-2';
  const h = document.createElement('div');
  h.className = 'text-sm font-semibold text-gray-700';
  h.textContent = 'Decision support — ' + list.length + ' point' + (list.length === 1 ? '' : 's') + ' to consider';
  header.appendChild(h);
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50';
  dismiss.textContent = 'Dismiss';
  dismiss.onclick = () => { container.classList.add('hidden'); if (typeof onDismiss === 'function') onDismiss(); };
  header.appendChild(dismiss);
  box.appendChild(header);

  const ul = document.createElement('ul');
  ul.setAttribute('role', 'list');
  ul.className = 'space-y-2';
  list.forEach((f) => {
    const style = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.advisory;
    const li = document.createElement('li');
    li.className = 'border rounded-md p-2 ' + style.row;

    const top = document.createElement('div');
    top.className = 'flex items-start justify-between gap-2';
    const summary = document.createElement('span');
    summary.className = 'text-sm text-gray-800';
    summary.textContent = f.summary || '';
    top.appendChild(summary);
    top.appendChild(severityBadge(f.severity));
    li.appendChild(top);

    // One-click "Add test" for suggestion findings with identifiable SNOMED codes.
    if (f.dimension === 'suggestion' && typeof onAddTest === 'function' && Array.isArray(f.related_tests)) {
      const codes = f.related_tests.filter(isSnomedId);
      if (codes.length) {
        const actions = document.createElement('div');
        actions.className = 'flex flex-wrap gap-2 mt-1.5';
        codes.forEach((code) => {
          const add = document.createElement('button');
          add.type = 'button';
          add.className = 'text-xs px-2 py-1 rounded bg-indigo-600 text-white';
          add.textContent = '+ Add test (' + code + ')';
          // Pass the finding's category through so an imaging suggestion isn't added as pathology.
          add.onclick = () => { add.disabled = true; add.classList.add('btn-disabled'); onAddTest(code, f.kind); };
          actions.appendChild(add);
        });
        li.appendChild(actions);
      }
    }
    ul.appendChild(li);
  });
  box.appendChild(ul);
  container.appendChild(box);
}

/**
 * Tier 2 — blocking serious-review modal (spec §C.9). Resolves with the string
 * 'edit' (return to form) or 'proceed' (send as-is, acknowledgement recorded).
 * Proceed stays disabled until the confirm checkbox is ticked. Keyboard
 * accessible: focus trap, ESC resolves 'edit', focus returns to the send button.
 *
 * @param {object} o
 * @param {Array} o.findings           — serious findings (summary + detail)
 * @param {Array} [o.advisoryFindings] — advisory findings, shown for completeness
 * @returns {Promise<'edit'|'proceed'>}
 */
export function openSeriousReviewModal({ findings, advisoryFindings } = {}) {
  const backdrop = document.getElementById('ai-serious-backdrop');
  const body = document.getElementById('ai-serious-body');
  const confirm = document.getElementById('ai-serious-confirm');
  const editBtn = document.getElementById('ai-serious-edit');
  const proceedBtn = document.getElementById('ai-serious-proceed');
  // If the markup is missing, fail safe to 'edit' (never silently send).
  if (!backdrop || !body || !confirm || !editBtn || !proceedBtn) {
    console.warn('ai-ui.openSeriousReviewModal: modal markup missing — defaulting to edit.');
    return Promise.resolve('edit');
  }

  const serious = Array.isArray(findings) ? findings : [];
  const advisory = Array.isArray(advisoryFindings) ? advisoryFindings : [];

  // ----- populate -----
  body.replaceChildren();
  serious.forEach((f) => body.appendChild(findingBlock(f, 'serious')));
  if (advisory.length) {
    const sub = document.createElement('div');
    sub.className = 'pt-2 mt-1 border-t';
    const lbl = document.createElement('div');
    lbl.className = 'text-xs font-medium text-gray-500 mb-1';
    lbl.textContent = 'Also noted (no acknowledgement required)';
    sub.appendChild(lbl);
    advisory.forEach((f) => sub.appendChild(findingBlock(f, 'advisory')));
    body.appendChild(sub);
  }

  // ----- reset controls -----
  confirm.checked = false;
  proceedBtn.disabled = true;
  const previouslyFocused = document.activeElement;

  return new Promise((resolve) => {
    const focusables = () => Array.from(
      backdrop.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.offsetParent !== null);

    const onConfirmChange = () => { proceedBtn.disabled = !confirm.checked; };

    const close = (result) => {
      backdrop.style.display = 'none';
      confirm.removeEventListener('change', onConfirmChange);
      editBtn.removeEventListener('click', onEdit);
      proceedBtn.removeEventListener('click', onProceed);
      backdrop.removeEventListener('keydown', onKeydown);
      // Return focus to the send button (spec §C.9 accessibility).
      const sendBtn = document.getElementById('send-btn');
      const target = sendBtn || previouslyFocused;
      if (target && typeof target.focus === 'function') target.focus();
      resolve(result);
    };

    const onEdit = () => close('edit');
    const onProceed = () => { if (!proceedBtn.disabled) close('proceed'); };
    function onKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); close('edit'); return; }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    confirm.addEventListener('change', onConfirmChange);
    editBtn.addEventListener('click', onEdit);
    proceedBtn.addEventListener('click', onProceed);
    backdrop.addEventListener('keydown', onKeydown);

    backdrop.style.display = 'flex';
    // Initial focus inside the modal.
    confirm.focus();
  });
}

function findingBlock(f, severity) {
  const style = SEVERITY_STYLE[severity] || SEVERITY_STYLE.serious;
  const block = document.createElement('div');
  block.className = 'border rounded-md p-2 mb-2 ' + style.row;
  const top = document.createElement('div');
  top.className = 'flex items-start justify-between gap-2';
  const summary = document.createElement('span');
  summary.className = 'text-sm font-medium text-gray-800';
  summary.textContent = (f && f.summary) || '';
  top.appendChild(summary);
  top.appendChild(severityBadge(severity));
  block.appendChild(top);
  if (f && f.detail) {
    const detail = document.createElement('p');
    detail.className = 'text-sm text-gray-600 mt-1';
    detail.textContent = f.detail;
    block.appendChild(detail);
  }
  return block;
}
