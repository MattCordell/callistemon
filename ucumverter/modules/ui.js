/**
 * @module ui
 * @description Rendering helpers: unit dropdowns, value + unit input pairs that convert
 * on unit change, and the conversion trace table.
 */

import { convert, describe } from './ucum.js';
import { fmt } from './calc.js';

export const $ = (id) => document.getElementById(id);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Fill a <select> with UCUM unit options, keeping the current choice if still offered.
 * Options show the UCUM code only; the UCUM name is the hover tooltip. */
export function fillUnitSelect(select, codes, defaultCode) {
  const keep = codes.includes(select.value) ? select.value : (defaultCode || codes[0]);
  select.innerHTML = codes.map(c => `<option value="${esc(c)}" title="${esc(describe(c))}">${esc(c)}</option>`).join('');
  select.value = keep;
}

/** Fill a <select> with {value, label} options. */
export function fillSelect(select, items, { placeholder } = {}) {
  const head = placeholder ? `<option value="">${esc(placeholder)}</option>` : '';
  select.innerHTML = head + items.map(i =>
    `<option value="${esc(i.value)}"${i.disabled ? ' disabled' : ''}>${esc(i.label)}</option>`).join('');
}

const shown = (n) => String(Number(n.toPrecision(6)));

/**
 * A number input paired with a unit select. Changing the unit converts the value, so the
 * quantity stays the same. The exact value is kept separately from the rounded display,
 * which means repeated unit changes never drift.
 */
export class QuantityField {
  constructor({ input, select, onChange, molarMass = () => null }) {
    this.input = input;
    this.select = select;
    this.onChange = onChange;
    this.molarMass = molarMass;
    this.exact = null;
    this.unit = select.value;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      this.exact = Number.isFinite(v) ? v : null;
      this.onChange();
    });
    select.addEventListener('change', () => this.changeUnit(select.value));
  }

  setOptions(codes, defaultCode) {
    fillUnitSelect(this.select, codes, defaultCode);
    if (this.select.value !== this.unit) this.changeUnit(this.select.value, { silent: true });
  }

  changeUnit(to, { silent = false } = {}) {
    const from = this.unit;
    this.select.value = to;
    this.unit = to;
    if (this.exact != null && from && from !== to) {
      try {
        this.exact = convert(this.exact, from, to, this.molarMass());
      } catch {
        this.exact = null; // not commensurable (e.g. molar without a molar mass)
      }
      this.render();
    }
    if (!silent) this.onChange();
  }

  /** Set the quantity from a value in any unit; it is shown in the current unit. */
  set(value, unit = this.unit) {
    this.exact = value == null ? null : convert(value, unit, this.unit, this.molarMass());
    this.render();
  }

  get() {
    return this.exact == null ? null : { value: this.exact, unit: this.unit };
  }

  render() {
    this.input.value = this.exact == null ? '' : shown(this.exact);
  }

  /** Switch to a random different unit from the current options. */
  shuffle() {
    const opts = [...this.select.options].map(o => o.value).filter(v => v !== this.unit);
    if (opts.length) this.changeUnit(opts[Math.floor(Math.random() * opts.length)], { silent: true });
  }
}

/** Render the conversion trace rows. */
export function renderTrace(tbody, trace) {
  tbody.innerHTML = trace.map(t => {
    const same = t.from.unit === t.to.unit;
    const note = same ? 'already canonical' : (t.molarMass ? `via molar mass ${fmt(t.molarMass)} g/mol` : '');
    return `<tr class="${same ? 'same' : ''}">
      <td>${esc(t.what)}</td>
      <td class="num">${esc(fmt(t.from.value))} <code>${esc(t.from.unit)}</code></td>
      <td class="arrow" aria-label="converts to">&rarr;</td>
      <td class="num">${esc(fmt(t.to.value))} <code>${esc(t.to.unit)}</code></td>
      <td class="note">${esc(note)}</td>
    </tr>`;
  }).join('');
}
