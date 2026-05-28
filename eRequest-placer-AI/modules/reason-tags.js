// modules/reason-tags.js — Reason tag chips, clinical notes autocomplete

import { state } from './state.js';
import { setDebugUrl } from './utils.js';
import { TX_BASE, VS, MAX_NOTE_SUG } from '../config.js';
import { computeAndRenderSuggestions } from './suggestions.js';

export function renderReasonTags() {
  const wrap = document.querySelector('#notes-tags');
  wrap.innerHTML = '';
  state.reasonTags.forEach((t, idx) => {
    const chip = document.createElement('span');
    chip.className = 'inline-flex items-center gap-1.5 border border-emerald-100 bg-emerald-50 text-emerald-800 rounded-full px-2 py-0.5 text-xs';
    chip.innerHTML = '<span>' + t.display + '</span>';
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '✕';
    x.className = 'opacity-70 hover:opacity-100';
    x.onclick = () => { state.reasonTags.splice(idx, 1); renderReasonTags(); };
    chip.appendChild(x);
    wrap.appendChild(chip);
  });
  computeAndRenderSuggestions();
}

export function buildReasonCodeArray() {
  if (!state.reasonTags.length) return undefined;
  return state.reasonTags.map((t) => ({
    coding: [{ system: t.system || 'http://snomed.info/sct', code: t.code, display: t.display }],
    text: t.display,
  }));
}

export function buildCombinedNoteText() {
  return (document.querySelector('#clinical-notes').value || '').trim();
}

// Module-private: only `wireNotesAutocomplete` below calls this.
async function fetchReasonSuggestions(filter, signal) {
  if (!filter || filter.length < 4) return [];
  try {
    const url = TX_BASE + '?url=' + encodeURIComponent(VS.REASON) + '&count=20&filter=' + encodeURIComponent(filter);
    setDebugUrl(url);
    const r = await fetch(url, { headers: { Accept: 'application/fhir+json' }, signal });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    return (j && j.expansion && j.expansion.contains) ? j.expansion.contains : [];
  } catch (e) {
    if (e.name === 'AbortError') return [];
    console.warn(e);
    return [];
  }
}

export function showReasonSuggestions(items) {
  const box = document.getElementById('notes-suggestions');
  const list = document.getElementById('notes-suggestion-list');
  list.innerHTML = '';
  const top = items.slice(0, MAX_NOTE_SUG);
  if (!top.length) { box.classList.add('hidden'); return; }
  top.forEach((it) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-2 py-1 rounded border text-xs hover:bg-gray-50';
    btn.textContent = it.display || it.code || '—';
    btn.onclick = () => {
      const code = it.code;
      const system = it.system || 'http://snomed.info/sct';
      const display = it.display || it.code;

      if (!state.reasonTags.some((t) => t.code === code && t.system === system)) {
        state.reasonTags.push({ system, code, display });
        renderReasonTags();
      }

      const notes = document.getElementById('clinical-notes');
      const start = notes.selectionStart;
      const text = notes.value;
      const before = text.slice(0, state.notesAnchor);
      const insertion = display + ' ';
      const after = text.slice(start);
      notes.value = before + insertion + after;
      const newPos = before.length + insertion.length;
      notes.focus();
      requestAnimationFrame(() => {
        try { notes.setSelectionRange(newPos, newPos); } catch (_e) { /* selection failed */ }
      });
      state.notesAnchor = newPos;
      box.classList.add('hidden');
    };
    list.appendChild(btn);
  });
  box.classList.remove('hidden');
}

export function wireNotesAutocomplete() {
  const notes = document.getElementById('clinical-notes');
  let debounce = null;
  let activeController = null;
  notes.addEventListener('input', () => {
    const text = notes.value || '';
    const caret = (notes.selectionStart != null ? notes.selectionStart : text.length);
    const since = (text.slice(state.notesAnchor, caret) || '').trim();
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      if (since.length < 4) { document.getElementById('notes-suggestions').classList.add('hidden'); return; }
      // Cancel any in-flight request so a slow earlier response can't clobber this one.
      if (activeController) activeController.abort();
      activeController = new AbortController();
      const sig = activeController.signal;
      const items = await fetchReasonSuggestions(since, sig);
      if (sig.aborted) return;
      showReasonSuggestions(items);
    }, 250);
  });
}
