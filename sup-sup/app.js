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
  declaredProperties,
  createBlankSupplement,
  addPropertyDeclaration,
  removePropertyDeclaration,
  addDesignationWithUse,
} from './modules/supplement-model.js';
import {
  renderSourceColumn,
  renderSupplementColumn,
  renderSyncList,
  renderMetadataModal,
  renderMetadataEditForm,
  readAndSaveMetadataForm,
  renderAddSubForm,
  renderEditValueForm,
  renderNewSupplementForm,
  renderPropertyDeclarationRows,
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

  document.getElementById('btn-new-supplement').addEventListener('click', () => {
    renderNewSupplementForm();
    openModal('new-supplement-modal');
  });

  document.getElementById('btn-create-supplement').addEventListener('click', () => {
    const url = (document.getElementById('new-url')?.value || '').trim();
    const name = (document.getElementById('new-name')?.value || '').trim();
    const status = document.getElementById('new-status')?.value || 'draft';
    const supplements = (document.getElementById('new-supplements')?.value || '').trim();
    const errEl = document.getElementById('new-supplement-error');
    const errors = [];
    if (!url) errors.push('url is required');
    if (!name) errors.push('name is required');
    if (errors.length) {
      errEl.textContent = errors.join('; ');
      errEl.hidden = false;
      return;
    }
    state.supplement = createBlankSupplement(url, name, status, supplements);
    state.ui.expandedConcepts = new Set();
    closeModal('new-supplement-modal');
    render();
    setStatus(`Created new supplement: ${name}.`, 'ok');
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
    resetMetadataModal();
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

function resetMetadataModal() {
  document.getElementById('btn-metadata-edit').hidden = false;
  document.getElementById('btn-metadata-close').hidden = false;
  document.getElementById('btn-metadata-save').hidden = true;
  document.getElementById('btn-metadata-cancel').hidden = true;
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

  // Metadata edit/save/cancel
  document.getElementById('btn-metadata-edit').addEventListener('click', () => {
    if (!state.supplement) return;
    renderMetadataEditForm(state.supplement.raw);
    document.getElementById('btn-metadata-edit').hidden = true;
    document.getElementById('btn-metadata-close').hidden = true;
    document.getElementById('btn-metadata-save').hidden = false;
    document.getElementById('btn-metadata-cancel').hidden = false;
    document.getElementById('meta-url').focus();
  });
  document.getElementById('btn-metadata-save').addEventListener('click', () => {
    if (!state.supplement) return;
    const result = readAndSaveMetadataForm(state.supplement.raw);
    if (!result.ok) { alert(result.errors.join('\n')); return; }
    renderMetadataModal(state.supplement.raw);
    resetMetadataModal();
    renderSupplementColumn(state);
  });
  document.getElementById('btn-metadata-cancel').addEventListener('click', () => {
    renderMetadataModal(state.supplement.raw);
    resetMetadataModal();
  });

  // Metadata modal — property declaration add/remove (delegated)
  document.getElementById('metadata-body').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !state.supplement) return;
    const raw = state.supplement.raw;
    if (btn.dataset.action === 'remove-prop-decl') {
      if (!removePropertyDeclaration(raw, btn.dataset.propcode))
        alert('Property is in use by one or more concepts and cannot be removed.');
      else renderPropertyDeclarationRows(raw);
    } else if (btn.dataset.action === 'add-prop-decl') {
      const code = (document.getElementById('new-prop-code')?.value || '').trim();
      const desc = (document.getElementById('new-prop-description')?.value || '').trim();
      const type = document.getElementById('new-prop-type')?.value || 'string';
      if (!code) { alert('Property code is required.'); return; }
      if (declaredProperties(raw).some(p => p.code === code)) {
        alert(`Property "${code}" is already declared.`); return;
      }
      addPropertyDeclaration(raw, code, desc, type);
      renderPropertyDeclarationRows(raw);
      document.getElementById('new-prop-code').value = '';
      document.getElementById('new-prop-description').value = '';
    }
  });

  // Addsub modal — show/hide custom designation fields on type change
  document.getElementById('addsub-modal').addEventListener('change', e => {
    if (e.target.id === 'addsub-type') {
      const customFields = document.getElementById('custom-desig-fields');
      if (customFields) customFields.hidden = e.target.value !== 'desig:__custom__';
    }
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
    } else if (type === 'desig:__custom__') {
      const system = (document.getElementById('addsub-use-system')?.value || '').trim();
      const useCode = (document.getElementById('addsub-use-code')?.value || '').trim();
      const display = (document.getElementById('addsub-use-display')?.value || '').trim();
      if (!useCode) { alert('Designation use code is required.'); return; }
      addDesignationWithUse(concept, { system, code: useCode, display }, value);
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
