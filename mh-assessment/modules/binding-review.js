// Binding Review (SPEC.md FR-6): lists every field in the definition with its
// binding, live expansion details and warnings. A terminologist's view.

import { DEFINITION, REVIEW_CHECKS } from '../definition/assessment-definition.js';
import { getConfig } from '../config.js';
import { expand, lookup, validateCode, clearCache } from './terminology.js';
import { $, esc, copyText, downloadText, createLimiter } from './ui.js';

let root = null;
let rows = [];
let runToken = 0;
let filters = { codedOnly: false, warningsOnly: false };
let releaseVersion = '';

// ---------------------------------------------------------------- model

// One row per field, plus one row per column of a repeating group.
function buildRows() {
  const tabLabels = Object.fromEntries(DEFINITION.tabs.map(t => [t.id, t.label]));
  const out = [];
  for (const field of DEFINITION.fields) {
    out.push(makeRow(field, null, tabLabels[field.tab] || field.tab));
    for (const col of field.columns || []) {
      out.push(makeRow(col, field, tabLabels[field.tab] || field.tab));
    }
  }
  return out;
}

function makeRow(def, parent, tabLabel) {
  const bindingType = def.ecl ? 'ecl' : def.valueSet ? 'valueSet' : def.options ? 'options' : 'none';
  return {
    def,
    parent,
    tabLabel,
    bindingType,
    coded: bindingType !== 'none' || !!def.observable,
    label: def.label || '',
    labelFromPt: false,
    observablePt: '',
    total: null,
    members: [],
    warnings: [],
    info: [],
    state: 'pending'
  };
}

// ---------------------------------------------------------------- checks

async function checkRow(row, limit, token) {
  const cfg = getConfig();
  const { def } = row;
  const warnings = [];
  const info = [];
  const tasks = [];

  // 1 and 2: expansion empty, failed, or too large.
  if (row.bindingType === 'ecl' || row.bindingType === 'valueSet') {
    const binding = row.bindingType === 'ecl' ? { ecl: def.ecl } : { valueSet: def.valueSet };
    tasks.push(limit(() => expand(binding, { count: cfg.PREVIEW_COUNT })).then(res => {
      row.total = res.total;
      row.members = res.contains;
      if (res.total === 0) warnings.push('Expansion is empty.');
      if (res.total > cfg.LARGE_EXPANSION) {
        warnings.push(`Expansion has ${res.total} concepts (over ${cfg.LARGE_EXPANSION}): likely too broad.`);
      }
    }).catch(err => {
      warnings.push(`Expansion failed: ${err.message}`);
    }));
  }

  // 3 and 4: observable is an active Observable entity.
  const obs = def.observable;
  if (obs) {
    const system = obs.system || cfg.SNOMED_SYSTEM;
    if (system === REVIEW_CHECKS.localSystem) {
      info.push(`Observable ${obs.code} is a local placeholder code; not checked.`);
    } else {
      tasks.push(limit(() => lookup(obs.code, { system, properties: ['inactive'] })).then(res => {
        row.observablePt = res.display;
        if (system === cfg.SNOMED_SYSTEM && res.version && token === runToken) releaseVersion = res.version;
        if (!def.label && res.display) {
          row.label = res.display;
          row.labelFromPt = true;
        }
        if (res.inactive === true) warnings.push(`Observable ${obs.code} |${res.display}| is inactive.`);
        if (obs.display && res.display && obs.display !== res.display) {
          info.push(`Definition display "${obs.display}" differs from the preferred term "${res.display}".`);
        }
      }).catch(err => {
        warnings.push(`Observable ${obs.code} lookup failed: ${err.message}`);
      }));

      if (system === cfg.SNOMED_SYSTEM) {
        tasks.push(limit(() => validateCode({ ecl: REVIEW_CHECKS.observableEcl }, obs.code)).then(res => {
          if (!res.result) {
            warnings.push(`Observable ${obs.code} is not in ${REVIEW_CHECKS.observableEcl}.`);
          }
        }).catch(err => {
          warnings.push(`Observable ${obs.code} hierarchy check failed: ${err.message}`);
        }));
      } else {
        info.push(`Observable is not SNOMED CT (${system}); hierarchy check skipped.`);
      }
    }
  } else if (row.parent === null && def.output && /^observation/.test(def.output)) {
    info.push('Observable TBC.');
  }

  // 4: every code enumerated in the ECL is active.
  if (def.ecl) {
    for (const code of codesInEcl(def.ecl)) {
      tasks.push(limit(() => lookup(code, { properties: ['inactive'] })).then(res => {
        if (res.inactive === true) warnings.push(`ECL code ${code} |${res.display}| is inactive.`);
      }).catch(err => {
        warnings.push(`ECL code ${code} lookup failed: ${err.message}`);
      }));
    }
  }

  // Inline options: confirm codes exist, except local placeholder codes.
  if (def.options) {
    row.total = def.options.length;
    row.members = def.options;
    for (const opt of def.options) {
      if (opt.system === REVIEW_CHECKS.localSystem) continue;
      tasks.push(limit(() => lookup(opt.code, { system: opt.system })).catch(err => {
        warnings.push(`Option ${opt.code} (${opt.system}) lookup failed: ${err.message}`);
      }));
    }
    if (def.options.some(o => o.system === REVIEW_CHECKS.localSystem)) {
      info.push('Uses local placeholder codes.');
    }
  }

  await Promise.all(tasks);
  if (token !== runToken) return;
  row.warnings = warnings;
  row.info = info;
  row.state = 'done';
}

// SCTIDs written in the ECL, ignoring the |terms|.
function codesInEcl(ecl) {
  const stripped = ecl.replace(/\|[^|]*\|/g, ' ');
  return [...new Set(stripped.match(/\b\d{6,18}\b/g) || [])];
}

export async function runAll() {
  const token = ++runToken;
  clearCache();
  releaseVersion = '';
  rows = buildRows();
  // Set states before the first draw so coded rows show their loading state.
  rows.forEach(row => { row.state = row.coded ? 'running' : 'done'; });
  render();

  const limit = createLimiter(getConfig().CONCURRENCY);
  await Promise.all(rows.filter(row => row.coded).map(row =>
    checkRow(row, limit, token).then(() => {
      if (token === runToken) updateRow(row);
    })
  ));
  if (token === runToken) renderSummary();
}

// ---------------------------------------------------------------- render

export function mountBindingReview(container) {
  root = container;
  root.innerHTML = `
    <div class="review-head">
      <div>
        <h2>Binding review</h2>
        <p class="muted">Every field in <code>definition/assessment-definition.js</code>, with live results from the terminology server.</p>
      </div>
      <div class="review-actions">
        <button type="button" class="btn" data-action="rerun">Re-run all</button>
        <button type="button" class="btn btn-secondary" data-action="csv">Export CSV</button>
      </div>
    </div>
    <div class="review-bar">
      <div class="review-summary" aria-live="polite"></div>
      <div class="review-filters">
        <label><input type="checkbox" data-filter="codedOnly"> Coded fields only</label>
        <label><input type="checkbox" data-filter="warningsOnly"> With warnings only</label>
      </div>
    </div>
    <div class="table-wrap">
      <table class="review-table">
        <thead>
          <tr>
            <th>Tab</th><th>Field id</th><th>Label</th><th>Observable</th><th>Binding</th>
            <th class="num">Total</th><th>First ${getConfig().PREVIEW_COUNT} members</th>
            <th>Status</th><th>Notes</th><th>Warnings</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>`;

  root.addEventListener('click', onClick);
  root.addEventListener('change', e => {
    const key = e.target.dataset.filter;
    if (!key) return;
    filters[key] = e.target.checked;
    applyFilters();
  });
}

async function onClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.action === 'rerun') runAll();
  if (btn.dataset.action === 'csv') exportCsv();
  if (btn.dataset.copy != null) {
    // Keep the original label once, so repeat clicks can't capture "Copied".
    const label = btn.dataset.label ??= btn.textContent;
    const ok = await copyText(btn.dataset.copy);
    btn.textContent = ok ? 'Copied' : 'Copy failed';
    clearTimeout(btn._resetTimer);
    btn._resetTimer = setTimeout(() => { btn.textContent = label; }, 1200);
  }
}

function render() {
  $('tbody', root).innerHTML = rows.map(rowHtml).join('');
  applyFilters();
  renderSummary();
}

function updateRow(row) {
  const tr = root.querySelector(`tr[data-id="${CSS.escape(row.def.id)}"]`);
  if (tr) tr.outerHTML = rowHtml(row);
  applyFilters();
  renderSummary();
}

function rowHtml(row) {
  const { def, parent } = row;
  const cls = [
    parent ? 'is-column' : '',
    row.warnings.length ? 'has-warning' : '',
    row.coded ? 'is-coded' : 'is-uncoded'
  ].join(' ');

  const idCell = parent
    ? `<code>${esc(def.id)}</code><div class="muted small">in ${esc(parent.id)}</div>`
    : `<code>${esc(def.id)}</code>${def.control === 'repeating-group' ? '<div class="muted small">repeating group</div>' : ''}`;

  const labelCell = row.label
    ? `${esc(row.label)}${row.labelFromPt ? ' <span class="tag" title="Label taken from the AU preferred term of the observable">AU PT</span>' : ''}`
    : (row.state === 'running' ? '<span class="muted">...</span>' : '');

  const obs = def.observable;
  const obsCell = obs
    ? `<code>${esc(obs.code)}</code> ${esc(row.observablePt || obs.display || '')}${obs.system ? `<div class="muted small">${esc(obs.system)}</div>` : ''}`
    : (!parent && /^observation/.test(def.output || '') ? '<span class="muted">TBC</span>' : '');

  let bindingCell = '<span class="muted">n/a</span>';
  if (def.ecl) {
    bindingCell = `<div class="ecl">${esc(def.ecl)}</div><button type="button" class="btn-link" data-copy="${esc(def.ecl)}">Copy ECL</button>`;
  } else if (def.valueSet) {
    bindingCell = `<div class="ecl">${esc(def.valueSet)}</div><button type="button" class="btn-link" data-copy="${esc(def.valueSet)}">Copy URL</button>`;
  } else if (def.options) {
    bindingCell = `<span class="muted">Inline options (${def.options.length})</span>`;
  } else if (def.control === 'repeating-group') {
    bindingCell = `<span class="muted">See columns (${(def.columns || []).length})</span>`;
  } else if (!row.coded) {
    bindingCell = `<span class="muted">${esc(def.control)}, ${esc(def.output)}</span>`;
  }

  const totalCell = row.state === 'running' && row.total == null
    ? '<span class="spinner" aria-label="Loading"></span>'
    : (row.total ?? '');

  const more = row.total != null && row.total > row.members.length ? row.total - row.members.length : 0;
  const membersCell = row.members.length
    ? `<ul class="members">${row.members.map(m => `<li><code>${esc(m.code)}</code> ${esc(m.display)}${m.inactive ? ' <span class="tag tag-warn">inactive</span>' : ''}</li>`).join('')}</ul>${more ? `<div class="muted small">+ ${more} more</div>` : ''}`
    : '';

  const statusCell = `<span class="tag ${def.status === 'reviewed' ? 'tag-ok' : 'tag-placeholder'}">${esc(def.status || '')}</span>`
    + (def.aucdi ? `<div class="small muted">AUCDI R3: ${esc(def.aucdi)}</div>` : '')
    + (def.sensitive ? '<div class="small muted">Sensitive</div>' : '');

  const warnCell = [
    ...row.warnings.map(w => `<li class="warn">${esc(w)}</li>`),
    ...row.info.map(i => `<li class="info">${esc(i)}</li>`)
  ].join('');

  return `<tr data-id="${esc(def.id)}" class="${cls}">
    <td>${esc(row.tabLabel)}</td>
    <td>${idCell}</td>
    <td>${labelCell}</td>
    <td>${obsCell}</td>
    <td>${bindingCell}</td>
    <td class="num">${totalCell}</td>
    <td>${membersCell}</td>
    <td>${statusCell}</td>
    <td class="notes">${esc(def.notes || '')}</td>
    <td>${warnCell ? `<ul class="warnings">${warnCell}</ul>` : ''}</td>
  </tr>`;
}

function applyFilters() {
  for (const row of rows) {
    const tr = root.querySelector(`tr[data-id="${CSS.escape(row.def.id)}"]`);
    if (!tr) continue;
    const hide = (filters.codedOnly && !row.coded) || (filters.warningsOnly && !row.warnings.length);
    tr.hidden = hide;
  }
}

function renderSummary() {
  const cfg = getConfig();
  const coded = rows.filter(r => r.coded);
  const done = coded.filter(r => r.state === 'done').length;
  const warned = rows.filter(r => r.warnings.length).length;
  const warnCount = rows.reduce((n, r) => n + r.warnings.length, 0);
  const progress = done < coded.length ? ` Checking ${done} of ${coded.length} coded rows...` : '';
  $('.review-summary', root).innerHTML = `
    <strong>${rows.length}</strong> rows (${DEFINITION.fields.length} fields plus group columns),
    <strong>${coded.length}</strong> coded,
    <strong class="${warnCount ? 'text-warn' : ''}">${warnCount}</strong> warnings on ${warned} rows.${esc(progress)}
    <div class="muted small">Server: ${esc(cfg.TX_BASE)} | Edition: ${esc(releaseVersion || cfg.SNOMED_EDITION)}</div>`;
}

// ---------------------------------------------------------------- CSV

function exportCsv() {
  const header = [
    'tab', 'field_id', 'group_id', 'label', 'observable_code', 'observable_display', 'observable_system',
    'binding_type', 'binding', 'expansion_total', 'first_members', 'status', 'aucdi', 'sensitive',
    'notes', 'warnings', 'info'
  ];
  const lines = rows.map(row => {
    const { def } = row;
    const obs = def.observable;
    const binding = def.ecl || def.valueSet ||
      (def.options ? def.options.map(o => `${o.code} ${o.display}`).join('; ') : '');
    return [
      row.tabLabel,
      def.id,
      row.parent ? row.parent.id : '',
      row.label,
      obs ? obs.code : '',
      obs ? (row.observablePt || obs.display || '') : '',
      obs ? (obs.system || getConfig().SNOMED_SYSTEM) : '',
      row.bindingType,
      binding,
      row.total ?? '',
      row.members.map(m => `${m.code} ${m.display}`).join('; '),
      def.status || '',
      def.aucdi || '',
      def.sensitive ? 'yes' : '',
      def.notes || '',
      row.warnings.join('; '),
      row.info.join('; ')
    ].map(csvCell).join(',');
  });
  const csv = '\uFEFF' + [header.join(','), ...lines].join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`binding-review-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
