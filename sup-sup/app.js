/**
 * @module app
 * @description Sup-Sup orchestrator. Owns mutable state, wires UI events to model + loaders.
 */

import { CONFIG } from './config.js';
import { loadSourceFromFile, loadSourceFromTS } from './modules/source-loader.js';
import { loadSupplementFromFile, saveSupplementToFile } from './modules/supplement-loader.js';
import {
  addConcept,
  removeConcept,
  addProperty,
  updatePropertyAt,
  removePropertyAt,
  addDesignation,
  updateDesignationAt,
  removeDesignationAt,
  isConceptValid,
} from './modules/supplement-model.js';
import {
  renderSourceColumn,
  renderSupplementColumn,
  renderSyncList,
  renderMetadataModal,
  renderAddSubForm,
  renderEditValueForm,
} from './modules/ui-rendering.js';

const state = {
  source: null,
  supplement: null,
  ui: {
    sourceFilter: '',
    supplementFilter: '',
    expandedConcepts: new Set(),
    syncMode: false,
  },
};

/* Tracks the in-flight edit so the modal Save button knows what to update */
let pendingEdit = null; // { kind: 'property'|'designation', code, index }

function render() {
  renderSourceColumn(state);
  renderSupplementColumn(state);
  updateSyncControls();
  if (state.ui.syncMode) renderSyncList(state);
  applySyncMode();
  updateExpandAllLabel();
}

function applySyncMode() {
  const main = document.querySelector('main.columns');
  const syncList = document.getElementById('sync-list');
  const sourceList = document.getElementById('source-list');
  const suppList = document.getElementById('supplement-list');
  if (state.ui.syncMode) {
    main.classList.add('sync-mode');
    syncList.hidden = false;
    sourceList.hidden = true;
    suppList.hidden = true;
  } else {
    main.classList.remove('sync-mode');
    syncList.hidden = true;
    sourceList.hidden = false;
    suppList.hidden = false;
  }
}

function updateSyncControls() {
  const btn = document.getElementById('btn-sync');
  const enabled = !!(state.source && state.supplement);
  btn.disabled = !enabled;
  btn.classList.toggle('active', state.ui.syncMode && enabled);
  btn.textContent = state.ui.syncMode && enabled ? 'Sync ✓' : 'Sync';
  if (!enabled && state.ui.syncMode) state.ui.syncMode = false;
}

function updateExpandAllLabel() {
  const btn = document.getElementById('btn-expand-all');
  if (!state.supplement) { btn.disabled = true; btn.textContent = 'Expand all'; return; }
  btn.disabled = false;
  const total = (state.supplement.raw.concept || []).length;
  const expanded = state.ui.expandedConcepts.size;
  btn.textContent = total > 0 && expanded >= total ? 'Collapse all' : 'Expand all';
}

function setStatus(msg, kind = 'info') {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'status ' + kind;
}

/* ---------- Toolbar wiring ---------- */

function wireToolbar() {
  document.getElementById('source-file').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setStatus(`Loading source from ${file.name}…`);
      state.source = await loadSourceFromFile(file);
      setStatus(`Loaded ${state.source.concepts.length} concepts from ${file.name}.`, 'ok');
      render();
    } catch (err) {
      console.error(err);
      setStatus('Failed to load source: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btn-source-ts').addEventListener('click', () => {
    document.getElementById('ts-base').value = CONFIG.DEFAULT_TX_BASE;
    document.getElementById('ts-canonical').value = '';
    openModal('ts-modal');
    document.getElementById('ts-canonical').focus();
  });

  document.getElementById('ts-load').addEventListener('click', async () => {
    const tx = document.getElementById('ts-base').value.trim();
    const url = document.getElementById('ts-canonical').value.trim();
    if (!tx || !url) { setStatus('Provide both TS base and canonical URL.', 'error'); return; }
    closeModal('ts-modal');
    try {
      setStatus(`Loading from ${tx}…`);
      state.source = await loadSourceFromTS(tx, url);
      setStatus(`Loaded ${state.source.concepts.length} concepts.`, 'ok');
      render();
    } catch (err) {
      console.error(err);
      setStatus('TS load failed: ' + err.message, 'error');
    }
  });

  document.getElementById('supplement-file').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setStatus(`Loading supplement from ${file.name}…`);
      state.supplement = await loadSupplementFromFile(file);
      state.ui.expandedConcepts = new Set();
      setStatus(`Loaded supplement: ${state.supplement.raw.title || state.supplement.raw.id}.`, 'ok');
      render();
    } catch (err) {
      console.error(err);
      setStatus('Failed to load supplement: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btn-save-supplement').addEventListener('click', () => {
    if (!state.supplement) return;
    const invalid = (state.supplement.raw.concept || []).filter(c => !isConceptValid(c));
    if (invalid.length) {
      const codes = invalid.map(c => c.code).join(', ');
      const proceed = confirm(
        `${invalid.length} concept(s) have no properties or designations: ${codes}\n\n` +
        `These concepts don't need to be in the supplement. Save anyway?`
      );
      if (!proceed) return;
    }
    saveSupplementToFile(state.supplement.raw, state.supplement.sourceFilename);
    setStatus('Saved supplement.', 'ok');
  });

  document.getElementById('btn-supplement-metadata').addEventListener('click', () => {
    if (!state.supplement) return;
    renderMetadataModal(state.supplement.raw);
    openModal('metadata-modal');
  });

  document.getElementById('source-filter').addEventListener('input', e => {
    state.ui.sourceFilter = e.target.value;
    renderSourceColumn(state);
    if (state.ui.syncMode) renderSyncList(state);
  });
  document.getElementById('supplement-filter').addEventListener('input', e => {
    state.ui.supplementFilter = e.target.value;
    renderSupplementColumn(state);
    if (state.ui.syncMode) renderSyncList(state);
  });

  document.getElementById('btn-expand-all').addEventListener('click', () => {
    if (!state.supplement) return;
    const total = (state.supplement.raw.concept || []).length;
    if (state.ui.expandedConcepts.size >= total && total > 0) {
      state.ui.expandedConcepts.clear();
    } else {
      state.ui.expandedConcepts = new Set((state.supplement.raw.concept || []).map(c => c.code));
    }
    render();
  });

  document.getElementById('btn-sync').addEventListener('click', () => {
    if (!state.source || !state.supplement) return;
    state.ui.syncMode = !state.ui.syncMode;
    render();
  });
}

/* ---------- Column event delegation ---------- */

function handleClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const code = btn.dataset.code;
  const idx = btn.dataset.index ? Number(btn.dataset.index) : null;
  const raw = state.supplement?.raw;
  const concept = raw ? (raw.concept || []).find(c => c.code === code) : null;
  const refresh = () => state.ui.syncMode ? (renderSupplementColumn(state), renderSyncList(state)) : renderSupplementColumn(state);

  switch (action) {
    case 'add-concept': {
      if (!state.supplement) { setStatus('Load a supplement before adding concepts.', 'error'); return; }
      const c = addConcept(state.supplement.raw, code, btn.dataset.display);
      state.ui.expandedConcepts.add(c.code);
      render();
      openAddSub(c.code);
      break;
    }
    case 'toggle-concept':
      if (state.ui.expandedConcepts.has(code)) state.ui.expandedConcepts.delete(code);
      else state.ui.expandedConcepts.add(code);
      refresh();
      updateExpandAllLabel();
      break;
    case 'remove-concept':
      if (!raw) return;
      if (!confirm(`Remove concept ${code} from supplement?`)) return;
      removeConcept(raw, code);
      state.ui.expandedConcepts.delete(code);
      render();
      break;
    case 'open-add-sub':
      openAddSub(code);
      break;
    case 'edit-property': {
      const p = concept?.property?.[idx];
      if (!p) return;
      pendingEdit = { kind: 'property', code, index: idx };
      renderEditValueForm(p.valueString, `${p.code} (property)`);
      openModal('edit-modal');
      document.getElementById('edit-value').focus();
      break;
    }
    case 'edit-designation': {
      const d = concept?.designation?.[idx];
      if (!d) return;
      pendingEdit = { kind: 'designation', code, index: idx };
      const useCode = d?.use?.code || '';
      const useLabel = useCode === CONFIG.SNOMED.USE_PREFERRED ? 'Preferred' :
        useCode === CONFIG.SNOMED.USE_SYNONYM ? 'Synonym' : (d?.use?.display || 'designation');
      renderEditValueForm(d.value, `designation · ${useLabel}`);
      openModal('edit-modal');
      document.getElementById('edit-value').focus();
      break;
    }
    case 'remove-property':
      if (!concept) return;
      removePropertyAt(concept, idx);
      refresh();
      break;
    case 'remove-designation':
      if (!concept) return;
      removeDesignationAt(concept, idx);
      refresh();
      break;
  }
}

function wireColumns() {
  document.getElementById('source-list').addEventListener('click', handleClick);
  document.getElementById('supplement-list').addEventListener('click', handleClick);
  document.getElementById('sync-list').addEventListener('click', handleClick);
}

/* ---------- Add-sub modal ---------- */

function openAddSub(code) {
  if (!state.supplement) return;
  renderAddSubForm(state.supplement.raw, code);
  openModal('addsub-modal');
  document.getElementById('addsub-value').focus();
}

function wireModals() {
  // Metadata modal
  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => closeModal(el.dataset.closeModal));
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeModal(modal.id);
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => closeModal(m.id));
  });

  // Add-sub save
  document.getElementById('addsub-save').addEventListener('click', () => {
    const code = document.getElementById('addsub-code').value;
    const type = document.getElementById('addsub-type').value;
    const value = document.getElementById('addsub-value').value;
    if (!value.trim()) { alert('Value is required.'); return; }
    const concept = (state.supplement?.raw?.concept || []).find(c => c.code === code);
    if (!concept) return;
    if (type.startsWith('prop:')) {
      addProperty(concept, type.slice(5), value);
    } else if (type.startsWith('desig:')) {
      addDesignation(concept, type.slice(6), value);
    }
    closeModal('addsub-modal');
    renderSupplementColumn(state);
    if (state.ui.syncMode) renderSyncList(state);
  });

  // Edit-value save
  document.getElementById('edit-save').addEventListener('click', () => {
    if (!pendingEdit) return;
    const value = document.getElementById('edit-value').value;
    const concept = (state.supplement?.raw?.concept || []).find(c => c.code === pendingEdit.code);
    if (!concept) return;
    if (pendingEdit.kind === 'property') {
      updatePropertyAt(concept, pendingEdit.index, value);
    } else {
      updateDesignationAt(concept, pendingEdit.index, value);
    }
    pendingEdit = null;
    closeModal('edit-modal');
    renderSupplementColumn(state);
    if (state.ui.syncMode) renderSyncList(state);
  });
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/* ---------- Boot ---------- */

document.addEventListener('DOMContentLoaded', () => {
  wireToolbar();
  wireColumns();
  wireModals();
  render();
});
