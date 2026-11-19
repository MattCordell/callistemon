// Form controls (FR-4) and automatic control choice (SPEC.md section 5.4).
// Every answer list comes from the definition: an ECL or value set expanded on
// Ontoserver, or inline options. No codes live here.

import { SCALE_BANDS, SCALE_DISPLAY_ORDER, SCALE_OTHER_LABEL, REVIEW_CHECKS } from '../definition/assessment-definition.js';
import { getConfig } from '../config.js';
import { expand, lookup } from './terminology.js';
import { esc, html, infoPop, aucdiBadge } from './ui.js';
import { createTypeahead, selectedChipHtml } from './typeahead.js';
import { createLensPanel, updateLens } from './lens.js';
import { createIcd11Panel, updateIcd11Panel } from './icd11.js';

let uid = 0;
const nextId = prefix => `${prefix}-${++uid}`;

const sameCoding = (a, b) => !!a && !!b && a.code === b.code && a.system === b.system;
const toCoding = m => ({ system: m.system, code: m.code, display: m.display });

// ---------------------------------------------------------------- bindings

export function bindingOf(def) {
  if (def.ecl) return { ecl: def.ecl };
  if (def.valueSet) return { valueSet: def.valueSet };
  return null;
}

// Fields with any terminology to show in the Lens.
export function hasTerminology(def) {
  return !!(def.ecl || def.valueSet || def.options || def.observable);
}

const CODED_CONTROLS = ['auto', 'select', 'multiselect', 'typeahead'];

// One expansion size serves the auto rule and typeahead browsing, so fields
// that share a binding share one cached request.
function initialCount() {
  const cfg = getConfig();
  return Math.max(cfg.AUTO_DROPDOWN_MAX, cfg.TYPEAHEAD_BROWSE_MAX) + 1;
}

// Returns { total, members } from inline options or the binding's expansion.
export async function loadMembers(def) {
  if (def.options) return { total: def.options.length, members: def.options };
  const res = await expand(bindingOf(def), { count: initialCount() });
  return { total: res.total, members: res.contains.filter(m => !m.inactive) };
}

// SPEC.md 5.4: auto picks chips, dropdown or typeahead from the expansion total.
export function chooseKind(def, total) {
  const cfg = getConfig();
  switch (def.control) {
    case 'auto':
      if (total <= cfg.AUTO_CHIPS_MAX) return 'chips';
      if (total <= cfg.AUTO_DROPDOWN_MAX) return 'dropdown';
      return 'typeahead';
    case 'select':
    case 'multiselect':
      return 'dropdown';
    case 'typeahead':
      return 'typeahead';
    case 'boolean':
      return 'checkbox';
    default:
      return def.control;
  }
}

// Codings held in a value of any shape, for the Lens "Selected" list.
export function codingsIn(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(codingsIn);
  if (typeof value === 'object' && 'code' in value) return [value];
  return [];
}

// ---------------------------------------------------------------- scale bands

const bandMatchers = SCALE_BANDS.map(band => ({
  id: band.id,
  patterns: band.words.map(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))
}));

export function bandOf(display) {
  for (const band of bandMatchers) {
    if (band.patterns.some(p => p.test(display || ''))) return band.id;
  }
  return 'other';
}

export function bandLabel(id) {
  if (id === 'other') return SCALE_OTHER_LABEL;
  return SCALE_BANDS.find(b => b.id === id)?.label || id;
}

// Members grouped in display order: Reduced, Normal, Increased, Other.
// Within a band the server's order is kept.
export function groupByBand(members) {
  const groups = Object.fromEntries(SCALE_DISPLAY_ORDER.map(id => [id, []]));
  for (const m of members) (groups[bandOf(m.display)] ||= []).push(m);
  return SCALE_DISPLAY_ORDER.map(id => ({ id, label: bandLabel(id), members: groups[id] }));
}

// ---------------------------------------------------------------- labels

export function initialLabel(def) {
  return def.label || def.observable?.display || def.id;
}

// SPEC.md 5.2: if label is omitted, use the AU preferred term of the observable.
function resolveLabel(def, labelEl) {
  if (def.label || !def.observable) return;
  const cfg = getConfig();
  const system = def.observable.system || cfg.SNOMED_SYSTEM;
  if (system === REVIEW_CHECKS.localSystem) return;
  lookup(def.observable.code, { system })
    .then(res => { if (res.display) labelEl.textContent = res.display; })
    .catch(() => { /* keep the definition display; the Lens shows lookup errors */ });
}

// ---------------------------------------------------------------- field

// Renders one field. Returns { el, fctx }; fctx is the field's terminology
// context, shared with the Lens.
//   value, onChange   current value and change callback
//   compact           true inside a repeating-group row (label visually hidden)
//   scale             true inside a scale grid section
//   withLens          false to skip the Lens panel (group columns use the group's)
//   initialQuery      typeahead seed text
export function renderField(def, { value, onChange, compact = false, scale = false, withLens = true, initialQuery = '' } = {}) {
  const labelId = nextId('lbl');
  const label = initialLabel(def);
  const fctx = {
    def, kind: null, total: null, truncated: false, error: null, warnings: [], value,
    selected: () => codingsIn(fctx.value)
  };

  const cls = ['field', compact ? 'field-compact' : '', scale ? 'field-scale' : ''].filter(Boolean).join(' ');
  const el = html(`
    <div class="${cls}" data-field-id="${esc(def.id)}">
      <div class="field-head">
        <span class="field-label" id="${labelId}">${esc(label)}</span>
        ${def.aucdi && !compact ? aucdiBadge(def.aucdi) : ''}
        ${def.info ? infoPop(def.info, `About ${label}`) : ''}
      </div>
      ${def.helper ? `<p class="field-helper">${esc(def.helper)}</p>` : ''}
      <div class="field-control"></div>
    </div>`);

  const slot = el.querySelector('.field-control');
  // FR-9: unreviewed ICD-11 entities for the selected concept, under the control.
  const icd11Panel = def.icd11 ? createIcd11Panel() : null;
  if (icd11Panel) {
    slot.after(icd11Panel);
    updateIcd11Panel(icd11Panel, value);
  }
  const set = v => {
    fctx.value = v;
    onChange(v);
    updateLens(fctx);
    if (icd11Panel) updateIcd11Panel(icd11Panel, v, { announce: true });
  };

  if (withLens && hasTerminology(def)) el.append(createLensPanel(fctx));
  resolveLabel(def, el.querySelector('.field-label'));

  const ctx = { def, slot, labelId, label, value, set, fctx, scale, initialQuery };
  let ready;
  if (CODED_CONTROLS.includes(def.control) || (def.control === 'boolean' && bindingOf(def))) {
    ready = mountCoded(ctx);
  } else {
    mountPlain(ctx);
    ready = Promise.resolve();
  }
  // ready resolves once the control is in the DOM (coded controls load values first).
  return { el, fctx, ready };
}

// ---------------------------------------------------------------- coded controls

async function mountCoded(ctx) {
  const { def, slot, fctx } = ctx;
  slot.classList.remove('scale-chips', 'span-bands');
  slot.innerHTML = '<span class="loading"><span class="spinner" aria-hidden="true"></span> Loading values...</span>';
  if (ctx.scale) slot.classList.add('span-bands');
  fctx.error = null;
  fctx.warnings = [];
  updateLens(fctx);

  let total, members;
  try {
    ({ total, members } = await loadMembers(def));
  } catch (err) {
    fctx.error = err.message;
    slot.innerHTML = `
      <div class="unavailable">
        <select class="input" disabled aria-labelledby="${ctx.labelId}"><option>Values unavailable</option></select>
        <span class="small muted">The terminology server did not return values.</span>
        <button type="button" class="btn-link" data-retry>Retry</button>
      </div>`;
    slot.querySelector('[data-retry]').addEventListener('click', () => mountCoded(ctx));
    updateLens(fctx);
    return;
  }

  fctx.total = total;
  fctx.kind = chooseKind(def, total);
  if (total === 0) fctx.warnings.push('Expansion is empty.');
  if (fctx.kind !== 'typeahead' && members.length < total) {
    fctx.truncated = true;
    fctx.warnings.push(`Only the first ${members.length} of ${total} concepts are offered by this ${fctx.kind}.`);
  }

  switch (fctx.kind) {
    case 'chips': chipsControl(ctx, members); break;
    case 'dropdown': dropdownControl(ctx, members); break;
    case 'typeahead': typeaheadControl(ctx, members, total); break;
    case 'checkbox': codedCheckbox(ctx, members, total); break;
    default: slot.textContent = `Unknown control: ${def.control}`;
  }
  updateLens(fctx);
}

function chipsControl(ctx, members) {
  const { def, slot, labelId } = ctx;
  const multiple = def.cardinality === 'multiple';
  let value = multiple ? [...(ctx.value || [])] : (ctx.value || null);

  const isOn = m => multiple ? value.some(v => sameCoding(v, m)) : sameCoding(value, m);
  const chip = m => `<button type="button" class="chip" aria-pressed="${isOn(m)}" data-code="${esc(m.code)}">${esc(m.display)}</button>`;

  slot.setAttribute('role', 'group');
  slot.setAttribute('aria-labelledby', labelId);
  if (def.scale && ctx.scale) {
    slot.classList.remove('span-bands');
    slot.classList.add('scale-chips');
    slot.innerHTML = groupByBand(members).map(b => `
      <div class="band band-${b.id}">
        <span class="band-label">${esc(b.label)}</span>
        ${b.members.map(chip).join('')}
      </div>`).join('');
  } else if (def.scale) {
    slot.innerHTML = `<div class="chips">${groupByBand(members).filter(b => b.members.length).map(b =>
      `<span class="band-inline">${esc(b.label)}</span>${b.members.map(chip).join('')}`).join('')}</div>`;
  } else {
    slot.innerHTML = `<div class="chips">${members.map(chip).join('')}</div>`;
  }

  slot.onclick = e => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    const m = members.find(x => x.code === btn.dataset.code);
    if (!m) return;
    if (multiple) {
      value = isOn(m) ? value.filter(v => !sameCoding(v, m)) : [...value, toCoding(m)];
    } else {
      value = isOn(m) ? null : toCoding(m);
    }
    slot.querySelectorAll('.chip').forEach(c => {
      const cm = members.find(x => x.code === c.dataset.code);
      c.setAttribute('aria-pressed', String(!!cm && isOn(cm)));
    });
    ctx.set(value);
  };
}

function dropdownControl(ctx, members) {
  const { def, slot, labelId, label } = ctx;
  const multiple = def.cardinality === 'multiple';
  let value = multiple ? [...(ctx.value || [])] : (ctx.value || null);

  const optionHtml = (m, i) => {
    const sel = !multiple && sameCoding(value, m) ? ' selected' : '';
    const dis = multiple && value.some(v => sameCoding(v, m)) ? ' disabled' : '';
    return `<option value="${i}"${sel}${dis}>${esc(m.display)}</option>`;
  };
  const indexed = members.map((m, i) => ({ m, i }));
  let options;
  if (def.scale) {
    const byCode = new Map(indexed.map(x => [x.m.code, x.i]));
    options = groupByBand(members).filter(b => b.members.length).map(b =>
      `<optgroup label="${esc(b.label)}">${b.members.map(m => optionHtml(m, byCode.get(m.code))).join('')}</optgroup>`).join('');
  } else {
    options = indexed.map(x => optionHtml(x.m, x.i)).join('');
  }
  // A saved single value no longer in the list is still shown, marked as such.
  const orphan = !multiple && value && !members.some(m => sameCoding(m, value))
    ? `<option value="orphan" selected>${esc(value.display)} (not in current value set)</option>` : '';

  // SPEC.md 5.4: the placeholder is the field label; choosing it clears the field.
  slot.innerHTML = `
    <select class="input" aria-labelledby="${labelId}">
      <option value="">${esc(multiple ? `Add ${label.toLowerCase()}...` : label)}</option>
      ${orphan}${options}
    </select>
    ${multiple ? '<ul class="selected-chips"></ul>' : ''}`;

  const select = slot.querySelector('select');
  const chips = slot.querySelector('.selected-chips');

  const drawChips = () => {
    if (!chips) return;
    chips.innerHTML = value.map(selectedChipHtml).join('');
    select.querySelectorAll('option[value]:not([value=""])').forEach(o => {
      const m = members[Number(o.value)];
      if (m) o.disabled = value.some(v => sameCoding(v, m));
    });
  };

  select.addEventListener('change', () => {
    if (select.value === 'orphan') return;
    const m = members[Number(select.value)];
    if (multiple) {
      if (m && !value.some(v => sameCoding(v, m))) value = [...value, toCoding(m)];
      select.value = '';
      drawChips();
    } else {
      value = select.value === '' ? null : toCoding(m);
    }
    ctx.set(value);
  });

  if (chips) {
    chips.addEventListener('click', e => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      value = value.filter((_, i) => i !== Number(btn.dataset.remove));
      drawChips();
      ctx.set(value);
      select.focus();
    });
    drawChips();
  }
}

function typeaheadControl(ctx, members, total) {
  const { def, slot, labelId, label } = ctx;
  const browse = total <= getConfig().TYPEAHEAD_BROWSE_MAX && members.length === total ? members : null;
  slot.innerHTML = '';
  slot.append(createTypeahead({
    binding: bindingOf(def),
    labelId,
    multiple: def.cardinality === 'multiple',
    value: ctx.value,
    onChange: ctx.set,
    browse,
    initialQuery: ctx.initialQuery,
    placeholder: browse ? `Type to search, or choose from ${total}` : `Search ${label.toLowerCase()}`
  }));
}

// Boolean with a binding: ticking records the expansion member.
function codedCheckbox(ctx, members, total) {
  const { slot, labelId, fctx } = ctx;
  const member = members[0];
  if (!member) {
    slot.innerHTML = `<label class="check"><input type="checkbox" disabled aria-labelledby="${labelId}"> Values unavailable</label>`;
    return;
  }
  if (total !== 1) {
    fctx.warnings.push(`Expansion has ${total} concepts; the checkbox records the first: ${member.code} |${member.display}|.`);
  }
  const id = nextId('chk');
  slot.innerHTML = `<label class="check" for="${id}"><input type="checkbox" id="${id}" aria-describedby="${labelId}"${ctx.value ? ' checked' : ''}> Yes</label>`;
  slot.querySelector('input').addEventListener('change', e => {
    ctx.set(e.target.checked ? toCoding(member) : null);
  });
}

// ---------------------------------------------------------------- plain controls

function mountPlain(ctx) {
  const { def, slot, labelId } = ctx;
  const value = ctx.value;
  switch (def.control) {
    case 'text':
    case 'date': {
      const type = def.control === 'date' ? 'date' : 'text';
      slot.innerHTML = `<input type="${type}" class="input" aria-labelledby="${labelId}" value="${esc(value ?? '')}">`;
      slot.querySelector('input').addEventListener('input', e => ctx.set(e.target.value));
      break;
    }
    case 'textarea': {
      slot.innerHTML = `<textarea class="input" rows="3" aria-labelledby="${labelId}">${esc(value ?? '')}</textarea>`;
      slot.querySelector('textarea').addEventListener('input', e => ctx.set(e.target.value));
      break;
    }
    case 'integer': {
      const min = def.min ?? '';
      const max = def.max ?? '';
      const errId = nextId('err');
      const range = def.min != null && def.max != null ? `${def.min} to ${def.max}` : '';
      slot.innerHTML = `
        <div class="integer">
          <input type="number" class="input input-int" inputmode="numeric" step="1" min="${min}" max="${max}"
            aria-labelledby="${labelId}" aria-describedby="${errId}" value="${esc(value ?? '')}">
          ${range ? `<span class="muted small">${esc(range)}</span>` : ''}
        </div>
        <p class="field-error" id="${errId}" hidden></p>`;
      const input = slot.querySelector('input');
      const err = slot.querySelector('.field-error');
      input.addEventListener('input', () => {
        const raw = input.value.trim();
        const n = Number(raw);
        const ok = raw === '' || (Number.isInteger(n) && (def.min == null || n >= def.min) && (def.max == null || n <= def.max));
        input.setAttribute('aria-invalid', String(!ok));
        err.hidden = ok;
        err.textContent = ok ? '' : `Enter a whole number${range ? ` from ${range}` : ''}.`;
        ctx.set(raw === '' || !ok ? null : n);
      });
      break;
    }
    case 'boolean': {
      // Yes and No, so "No" is recordable. Choosing the pressed option again clears it.
      const btn = (v, text) => `<button type="button" class="chip" aria-pressed="${value === v}" data-v="${v}">${text}</button>`;
      slot.innerHTML = `<div class="chips" role="group" aria-labelledby="${labelId}">${btn(true, 'Yes')}${btn(false, 'No')}</div>`;
      let current = value ?? null;
      slot.addEventListener('click', e => {
        const b = e.target.closest('.chip');
        if (!b) return;
        const v = b.dataset.v === 'true';
        current = current === v ? null : v;
        slot.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String((c.dataset.v === 'true') === current && current !== null)));
        ctx.set(current);
      });
      break;
    }
    default:
      slot.innerHTML = `<span class="muted small">Unsupported control: ${esc(def.control)}</span>`;
  }
}

// ---------------------------------------------------------------- repeating group

// FR-4: rows can be added and removed. Each coded column has its own binding.
export function renderGroup(def, { value, onChange }) {
  const cols = def.columns || [];
  const seeded = !!(def.seedRows && def.seedRows.length);
  let rows = Array.isArray(value) && value.length
    ? value.map(r => ({ ...r }))
    : (def.seedRows || []).map(s => ({ _seed: s }));
  if (!rows.length) rows = [{}];

  // The first coded column takes the seed label as its starting search.
  const seedCol = cols.find(c => bindingOf(c));

  const gctx = {
    def, isGroup: true, warnings: [], error: null,
    selected: () => [],
    columns: cols.filter(hasTerminology).map(col => {
      const cctx = {
        def: col, parent: def, kind: null, total: null, error: null, warnings: [],
        selected: () => rows.flatMap(r => codingsIn(r[col.id]))
      };
      if (bindingOf(col) || col.options) {
        loadMembers(col)
          .then(({ total }) => { cctx.total = total; cctx.kind = chooseKind(col, total); })
          .catch(err => { cctx.error = err.message; })
          .finally(() => updateLens(gctx));
      }
      return cctx;
    })
  };

  const label = initialLabel(def);
  const labelId = nextId('lbl');
  const template = `${seeded ? 'minmax(7rem, 0.6fr) ' : ''}${cols.map(c => c.control === 'integer' ? 'minmax(6rem, 0.5fr)' : 'minmax(10rem, 1fr)').join(' ')} auto`;

  const el = html(`
    <div class="field field-group" data-field-id="${esc(def.id)}">
      <div class="field-head">
        <span class="field-label" id="${labelId}">${esc(label)}</span>
        ${def.aucdi ? aucdiBadge(def.aucdi) : ''}
        ${def.info ? infoPop(def.info, `About ${label}`) : ''}
      </div>
      ${def.helper ? `<p class="field-helper">${esc(def.helper)}</p>` : ''}
      <div class="group-table" role="group" aria-labelledby="${labelId}" style="--group-cols: ${template}">
        <div class="group-headrow" aria-hidden="true">
          ${seeded ? '<span></span>' : ''}${cols.map(c => `<span>${esc(c.label || c.id)}</span>`).join('')}<span></span>
        </div>
        <div class="group-rows"></div>
      </div>
      <button type="button" class="btn btn-secondary btn-small" data-add>Add row</button>
    </div>`);

  if (hasTerminology(def) || gctx.columns.length) el.append(createLensPanel(gctx));

  const rowsEl = el.querySelector('.group-rows');
  let lastRowFirstCell = null; // { cell, ready } for the newest row's first column

  const commit = () => {
    onChange(rows.map(r => ({ ...r })));
    updateLens(gctx);
  };

  function drawRows() {
    rowsEl.innerHTML = '';
    if (!rows.length) {
      rowsEl.innerHTML = '<p class="muted small group-empty">No rows. Use Add row to record one.</p>';
      return;
    }
    rows.forEach((row, index) => {
      const rowEl = html(`<div class="group-row">${seeded ? `<span class="group-seed">${esc(row._seed || '')}</span>` : ''}</div>`);
      for (const [colIndex, col] of cols.entries()) {
        const { el: cell, ready } = renderField(col, {
          compact: true,
          withLens: false,
          value: row[col.id],
          initialQuery: col === seedCol ? (row._seed || '') : '',
          onChange: v => {
            row[col.id] = v;
            commit();
          }
        });
        rowEl.append(cell);
        if (colIndex === 0) lastRowFirstCell = { cell, ready };
      }
      const remove = html(`<button type="button" class="btn-link group-remove" aria-label="Remove row ${index + 1}${row._seed ? ` (${esc(row._seed)})` : ''}">Remove</button>`);
      remove.addEventListener('click', () => {
        rows.splice(index, 1);
        commit();
        drawRows();
      });
      rowEl.append(remove);
      // ICD-11 panels (FR-9) span the whole row rather than one narrow cell.
      rowEl.querySelectorAll('.icd11').forEach(p => {
        p.classList.add('icd11-row-panel');
        rowEl.append(p);
      });
      rowsEl.append(rowEl);
    });
  }

  // Focus the new row's first control once it exists: coded cells load their values first.
  el.querySelector('[data-add]').addEventListener('click', () => {
    rows.push({});
    drawRows();
    const target = lastRowFirstCell;
    target?.ready.then(() => {
      if (!target.cell.isConnected) return;
      target.cell.querySelector('input:not([disabled]), select:not([disabled]), textarea, button')?.focus();
    });
  });

  drawRows();
  return { el, fctx: gctx };
}
