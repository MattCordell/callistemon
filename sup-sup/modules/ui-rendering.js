/**
 * @module ui-rendering
 * @description DOM rendering helpers for source/supplement columns and modals
 */

import { CONFIG } from '../config.js';
import {
  declaredProperties,
  isConceptValid,
  getDisplayLabel,
  describeProperty,
} from './supplement-model.js';

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Source column (read-only) ---------- */

export function renderSourceColumn(state) {
  const titleEl = document.getElementById('source-title');
  const countEl = document.getElementById('source-count');
  const listEl = document.getElementById('source-list');
  const filter = (state.ui.sourceFilter || '').toLowerCase();

  if (!state.source) {
    titleEl.textContent = 'No source loaded';
    countEl.textContent = '';
    listEl.innerHTML = '<p class="empty">Load a CodeSystem or ValueSet from file or terminology server to begin.</p>';
    return;
  }

  titleEl.textContent = state.source.title;
  const supplementCodes = new Set((state.supplement?.raw?.concept || []).map(c => c.code));

  const visible = state.source.concepts
    .filter(c => !filter || c.display.toLowerCase().includes(filter) || c.code.toLowerCase().includes(filter))
    .sort((a, b) => a.display.localeCompare(b.display));

  countEl.textContent = `${visible.length} of ${state.source.concepts.length}`;

  if (!visible.length) {
    listEl.innerHTML = '<p class="empty">No concepts match the current filter.</p>';
    return;
  }

  listEl.innerHTML = visible.map(c => sourceRowHTML(c, supplementCodes, !!state.supplement)).join('');
}

function sourceRowHTML(c, supplementCodes, supplementLoaded) {
  const inSupp = supplementCodes.has(c.code);
  return `
    <div class="row source-row${inSupp ? ' in-supplement' : ''}">
      <div class="row-label">
        <span class="display">${escapeHtml(c.display)}</span>
        <span class="code">${escapeHtml(c.code)}</span>
      </div>
      <button class="btn-icon"
              data-action="add-concept"
              data-code="${escapeHtml(c.code)}"
              data-display="${escapeHtml(c.display)}"
              ${inSupp || !supplementLoaded ? 'disabled' : ''}
              title="${inSupp ? 'Already in supplement' : (!supplementLoaded ? 'Load a supplement first' : 'Add to supplement')}">+</button>
    </div>
  `;
}

/* ---------- Supplement column (editable) ---------- */

export function renderSupplementColumn(state) {
  const titleEl = document.getElementById('supplement-title');
  const countEl = document.getElementById('supplement-count');
  const listEl = document.getElementById('supplement-list');
  const saveBtn = document.getElementById('btn-save-supplement');
  const metaBtn = document.getElementById('btn-supplement-metadata');

  if (!state.supplement) {
    titleEl.textContent = 'No supplement loaded';
    countEl.textContent = '';
    listEl.innerHTML = '<p class="empty">Load a FHIR CodeSystem supplement (content = "supplement") from a local file.</p>';
    saveBtn.disabled = true;
    metaBtn.disabled = true;
    return;
  }

  saveBtn.disabled = false;
  metaBtn.disabled = false;

  const raw = state.supplement.raw;
  titleEl.textContent = raw.title || raw.name || raw.url || 'Supplement';

  const sourceMap = sourceConceptsByCode(state);
  const filter = (state.ui.supplementFilter || '').toLowerCase();
  const concepts = (raw.concept || []).slice();

  const visible = concepts.filter(c => {
    if (!filter) return true;
    const label = getDisplayLabel(c, sourceMap).toLowerCase();
    return label.includes(filter) || c.code.toLowerCase().includes(filter);
  });

  countEl.textContent = `${visible.length} of ${concepts.length}`;

  if (!concepts.length) {
    listEl.innerHTML = '<p class="empty">Supplement has no concepts. Add one from the source column.</p>';
    return;
  }

  if (!visible.length) {
    listEl.innerHTML = '<p class="empty">No concepts match the current filter.</p>';
    return;
  }

  listEl.innerHTML = visible.map(c => renderSupplementConcept(c, state, sourceMap)).join('');
}

function renderSupplementConcept(concept, state, sourceMap) {
  const expanded = state.ui.expandedConcepts.has(concept.code);
  const valid = isConceptValid(concept);
  const label = getDisplayLabel(concept, sourceMap);
  const props = concept.property || [];
  const desigs = concept.designation || [];

  const subRows = expanded ? `
    <div class="sub-rows">
      ${props.map((p, i) => renderPropertyRow(concept.code, i, p, state.supplement.raw)).join('')}
      ${desigs.map((d, i) => renderDesignationRow(concept.code, i, d)).join('')}
      <button class="btn-add-sub" data-action="open-add-sub" data-code="${escapeHtml(concept.code)}">
        + Add property or designation
      </button>
    </div>
  ` : '';

  return `
    <div class="row supp-row${valid ? '' : ' invalid'}" data-concept-code="${escapeHtml(concept.code)}">
      <div class="row-label">
        <button class="btn-toggle" data-action="toggle-concept" data-code="${escapeHtml(concept.code)}" aria-label="${expanded ? 'Collapse' : 'Expand'}">${expanded ? '▾' : '▸'}</button>
        <span class="display">${escapeHtml(label)}</span>
        <span class="code">${escapeHtml(concept.code)}</span>
        ${valid ? '' : '<span class="warn" title="Concept must have at least one property or designation">⚠</span>'}
      </div>
      <button class="btn-icon danger" data-action="remove-concept" data-code="${escapeHtml(concept.code)}" title="Remove concept">✕</button>
    </div>
    ${subRows}
  `;
}

function renderPropertyRow(code, index, prop, raw) {
  const desc = describeProperty(raw, prop.code);
  return `
    <div class="sub-row prop-row">
      <div class="sub-meta">
        <span class="prop-code">${escapeHtml(prop.code)}</span>
        ${desc ? `<span class="prop-desc" title="${escapeHtml(desc)}">ⓘ</span>` : ''}
      </div>
      <div class="sub-value">${escapeHtml(prop.valueString ?? '')}</div>
      <div class="sub-actions">
        <button class="btn-icon" data-action="edit-property" data-code="${escapeHtml(code)}" data-index="${index}" title="Edit">✎</button>
        <button class="btn-icon danger" data-action="remove-property" data-code="${escapeHtml(code)}" data-index="${index}" title="Remove">✕</button>
      </div>
    </div>
  `;
}

function renderDesignationRow(code, index, d) {
  const useCode = d?.use?.code || '';
  const useLabel = useCode === CONFIG.SNOMED.USE_PREFERRED ? 'Preferred' :
    useCode === CONFIG.SNOMED.USE_SYNONYM ? 'Synonym' :
    (d?.use?.display || useCode || 'designation');
  return `
    <div class="sub-row desig-row">
      <div class="sub-meta">
        <span class="prop-code">designation · ${escapeHtml(useLabel)}</span>
      </div>
      <div class="sub-value">${escapeHtml(d?.value ?? '')}</div>
      <div class="sub-actions">
        <button class="btn-icon" data-action="edit-designation" data-code="${escapeHtml(code)}" data-index="${index}" title="Edit">✎</button>
        <button class="btn-icon danger" data-action="remove-designation" data-code="${escapeHtml(code)}" data-index="${index}" title="Remove">✕</button>
      </div>
    </div>
  `;
}

/* ---------- Sync list (paired rows) ---------- */

export function renderSyncList(state) {
  const el = document.getElementById('sync-list');
  if (!state.source || !state.supplement) {
    el.innerHTML = '<p class="empty">Load both a source and a supplement to use sync mode.</p>';
    return;
  }

  const sourceMap = sourceConceptsByCode(state);
  const suppByCode = new Map();
  for (const c of (state.supplement.raw.concept || [])) suppByCode.set(c.code, c);
  const supplementCodes = new Set(suppByCode.keys());
  const sourceCodes = new Set(state.source.concepts.map(c => c.code));

  const sFilter = (state.ui.sourceFilter || '').toLowerCase();
  const tFilter = (state.ui.supplementFilter || '').toLowerCase();

  const sortedSource = state.source.concepts.slice()
    .sort((a, b) => a.display.localeCompare(b.display));

  const cells = [];

  // Source-driven rows
  for (const s of sortedSource) {
    const supp = suppByCode.get(s.code) || null;
    const sourceMatches = !sFilter ||
      s.display.toLowerCase().includes(sFilter) ||
      s.code.toLowerCase().includes(sFilter);
    const suppLabel = supp ? getDisplayLabel(supp, sourceMap).toLowerCase() : '';
    const suppMatches = supp && (!tFilter ||
      suppLabel.includes(tFilter) ||
      supp.code.toLowerCase().includes(tFilter));
    if (!sourceMatches && !suppMatches) continue;
    cells.push(`<div class="sync-cell source">${
      sourceMatches ? sourceRowHTML(s, supplementCodes, true) : ''
    }</div>`);
    cells.push(`<div class="sync-cell supplement">${
      suppMatches ? renderSupplementConcept(supp, state, sourceMap) : ''
    }</div>`);
  }

  // Orphan supplement concepts (not in source)
  for (const t of (state.supplement.raw.concept || [])) {
    if (sourceCodes.has(t.code)) continue;
    const tLabel = getDisplayLabel(t, sourceMap).toLowerCase();
    if (tFilter && !tLabel.includes(tFilter) && !t.code.toLowerCase().includes(tFilter)) continue;
    cells.push('<div class="sync-cell source orphan-source"></div>');
    cells.push(`<div class="sync-cell supplement">${renderSupplementConcept(t, state, sourceMap)}</div>`);
  }

  if (!cells.length) {
    el.innerHTML = '<p class="empty">No concepts match the current filters.</p>';
    return;
  }
  el.innerHTML = cells.join('');
}

/* ---------- Modals ---------- */

export function renderPropertyDeclarationRows(raw) {
  const list = document.getElementById('meta-prop-list');
  if (!list) return;
  const usedCodes = new Set(
    (raw.concept || []).flatMap(c => (c.property || []).map(p => p.code))
  );
  list.innerHTML = declaredProperties(raw).map(p => {
    const inUse = usedCodes.has(p.code);
    return `<li class="prop-decl-item">
      <strong>${escapeHtml(p.code)}</strong>
      <span class="meta-type">(${escapeHtml(p.type || 'string')})</span>
      ${p.description ? ` — ${escapeHtml(p.description)}` : ''}
      <button type="button" class="btn-icon" data-action="remove-prop-decl" data-propcode="${escapeHtml(p.code)}"
        ${inUse ? 'disabled title="In use by concepts"' : 'title="Remove"'}>✕</button>
    </li>`;
  }).join('');
}

export function renderMetadataEditForm(raw) {
  const body = document.getElementById('metadata-body');
  if (!raw) { body.innerHTML = ''; return; }
  const statusOptions = ['draft', 'active', 'retired', 'unknown']
    .map(s => `<option value="${s}"${raw.status === s ? ' selected' : ''}>${s}</option>`)
    .join('');
  const contact = (raw.contact || []).map(c => {
    const name = c.name ? escapeHtml(c.name) : '';
    const tels = (c.telecom || []).map(t =>
      `${escapeHtml(t.system || '')}: ${escapeHtml(t.value || '')}`
    ).join('<br>');
    return `<li>${name}${tels ? '<br>' + tels : ''}</li>`;
  }).join('');
  const typeOptions = ['string', 'code', 'Coding', 'boolean', 'integer', 'decimal', 'dateTime']
    .map(t => `<option value="${t}">${t}</option>`).join('');
  body.innerHTML = `
    <table class="meta-table meta-table-edit">
      <tr><th>url *</th><td><input type="url" id="meta-url" value="${escapeHtml(raw.url || '')}"></td></tr>
      <tr><th>version</th><td><input type="text" id="meta-version" value="${escapeHtml(raw.version || '')}"></td></tr>
      <tr><th>name *</th><td><input type="text" id="meta-name" value="${escapeHtml(raw.name || '')}"></td></tr>
      <tr><th>title</th><td><input type="text" id="meta-title" value="${escapeHtml(raw.title || '')}"></td></tr>
      <tr><th>status *</th><td><select id="meta-status">${statusOptions}</select></td></tr>
      <tr><th>experimental</th><td><input type="checkbox" id="meta-experimental"${raw.experimental ? ' checked' : ''}></td></tr>
      <tr><th>date</th><td><input type="text" id="meta-date" value="${escapeHtml(raw.date || '')}" placeholder="YYYY-MM-DD"></td></tr>
      <tr><th>publisher</th><td><input type="text" id="meta-publisher" value="${escapeHtml(raw.publisher || '')}"></td></tr>
      <tr><th>description</th><td><textarea id="meta-description" rows="3">${escapeHtml(raw.description || '')}</textarea></td></tr>
      <tr><th>content</th><td>supplement <em class="meta-type">(fixed)</em></td></tr>
      <tr><th>supplements</th><td><input type="url" id="meta-supplements" value="${escapeHtml(raw.supplements || '')}"></td></tr>
      ${contact ? `<tr><th>contact</th><td><ul class="meta-list">${contact}</ul></td></tr>` : ''}
      <tr><th>property</th><td>
        <ul id="meta-prop-list" class="meta-list"></ul>
        <div class="prop-add-row">
          <input type="text" id="new-prop-code" placeholder="code" style="width:7em">
          <input type="text" id="new-prop-description" placeholder="description" style="width:12em">
          <select id="new-prop-type">${typeOptions}</select>
          <button type="button" class="btn" data-action="add-prop-decl">+ Add</button>
        </div>
      </td></tr>
    </table>
  `;
  renderPropertyDeclarationRows(raw);
}

export function readAndSaveMetadataForm(raw) {
  const get = id => (document.getElementById(id)?.value || '').trim();
  const url = get('meta-url');
  const name = get('meta-name');
  const status = get('meta-status');
  const errors = [];
  if (!url) errors.push('url is required');
  if (!name) errors.push('name is required');
  if (!status) errors.push('status is required');
  if (errors.length) return { ok: false, errors };

  raw.url = url;
  raw.name = name;
  raw.status = status;
  const version = get('meta-version');
  if (version) raw.version = version; else delete raw.version;
  const title = get('meta-title');
  if (title) raw.title = title; else delete raw.title;
  const experimental = document.getElementById('meta-experimental')?.checked;
  if (experimental) raw.experimental = true; else delete raw.experimental;
  const date = get('meta-date');
  if (date) raw.date = date; else delete raw.date;
  const publisher = get('meta-publisher');
  if (publisher) raw.publisher = publisher; else delete raw.publisher;
  const description = (document.getElementById('meta-description')?.value || '').trim();
  if (description) raw.description = description; else delete raw.description;
  const supplements = get('meta-supplements');
  if (supplements) raw.supplements = supplements; else delete raw.supplements;
  return { ok: true };
}

export function renderMetadataModal(raw) {
  const body = document.getElementById('metadata-body');
  if (!raw) { body.innerHTML = ''; return; }
  const fields = [
    ['url', raw.url],
    ['version', raw.version],
    ['name', raw.name],
    ['title', raw.title],
    ['status', raw.status],
    ['experimental', raw.experimental],
    ['date', raw.date],
    ['publisher', raw.publisher],
    ['description', raw.description],
    ['content', raw.content],
    ['supplements', raw.supplements],
  ];
  const contact = (raw.contact || []).map(c => {
    const name = c.name ? escapeHtml(c.name) : '';
    const tels = (c.telecom || []).map(t =>
      `${escapeHtml(t.system || '')}: ${escapeHtml(t.value || '')}`
    ).join('<br>');
    return `<li>${name}${tels ? '<br>' + tels : ''}</li>`;
  }).join('');
  const properties = declaredProperties(raw).map(p => `
    <li>
      <strong>${escapeHtml(p.code)}</strong> <span class="meta-type">(${escapeHtml(p.type || 'string')})</span>
      ${p.description ? `<div class="prop-desc">${escapeHtml(p.description)}</div>` : ''}
    </li>
  `).join('');

  body.innerHTML = `
    <table class="meta-table">
      ${fields.map(([k, v]) => v == null || v === '' ? '' :
        `<tr><th>${k}</th><td>${escapeHtml(String(v))}</td></tr>`).join('')}
      ${contact ? `<tr><th>contact</th><td><ul class="meta-list">${contact}</ul></td></tr>` : ''}
      ${properties ? `<tr><th>property</th><td><ul class="meta-list">${properties}</ul></td></tr>` : ''}
    </table>
  `;
}

export function renderAddSubForm(raw, conceptCode) {
  const container = document.getElementById('addsub-body');
  const props = declaredProperties(raw);
  const propOptions = props.map(p =>
    `<option value="prop:${escapeHtml(p.code)}">${escapeHtml(p.code)} (property)</option>`
  ).join('');
  container.innerHTML = `
    <input type="hidden" id="addsub-code" value="${escapeHtml(conceptCode)}">
    <label>Type
      <select id="addsub-type">
        ${propOptions}
        <option value="desig:${CONFIG.SNOMED.USE_SYNONYM}">designation · Synonym</option>
        <option value="desig:${CONFIG.SNOMED.USE_PREFERRED}">designation · Preferred</option>
        <option value="desig:__custom__">designation · Custom…</option>
      </select>
    </label>
    <div id="custom-desig-fields" hidden>
      <label>Use system<input type="url" id="addsub-use-system" value="http://snomed.info/sct"></label>
      <label>Use code *<input type="text" id="addsub-use-code"></label>
      <label>Use display<input type="text" id="addsub-use-display"></label>
    </div>
    <label>Value
      <textarea id="addsub-value" rows="3"></textarea>
    </label>
  `;
}

export function renderNewSupplementForm() {
  const statusOptions = ['draft', 'active', 'retired', 'unknown']
    .map(s => `<option value="${s}"${s === 'draft' ? ' selected' : ''}>${s}</option>`)
    .join('');
  document.getElementById('new-supplement-body').innerHTML = `
    <table class="meta-table meta-table-edit">
      <tr><th>url *</th><td><input type="url" id="new-url" placeholder="https://…"></td></tr>
      <tr><th>name *</th><td><input type="text" id="new-name"></td></tr>
      <tr><th>status *</th><td><select id="new-status">${statusOptions}</select></td></tr>
      <tr><th>supplements</th><td><input type="url" id="new-supplements" placeholder="Canonical URL of system being supplemented"></td></tr>
    </table>
    <p id="new-supplement-error" class="error-msg" hidden></p>
  `;
}

export function renderEditValueForm(initialValue, label) {
  document.getElementById('edit-label').textContent = label;
  document.getElementById('edit-value').value = initialValue || '';
}

/* ---------- helpers ---------- */

function sourceConceptsByCode(state) {
  const out = {};
  if (!state.source) return out;
  for (const c of state.source.concepts) out[c.code] = c;
  return out;
}
