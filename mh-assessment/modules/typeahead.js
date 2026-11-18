// Typeahead (FR-4): an ARIA combobox that searches a binding with
// ValueSet/$expand and the `filter` parameter, debounced, showing the AU
// preferred term. Small value sets can also be browsed on focus.

import { getConfig } from '../config.js';
import { expand } from './terminology.js';
import { esc, html, debounce } from './ui.js';

let uid = 0;

const sameCoding = (a, b) => !!a && !!b && a.code === b.code && a.system === b.system;
const toCoding = m => ({ system: m.system, code: m.code, display: m.display });

// A removable chip for a selected coding. The parent handles [data-remove] clicks.
export function selectedChipHtml(coding, index) {
  return `<li class="chip chip-selected" data-code="${esc(coding.code)}">`
    + `<span class="chip-text">${esc(coding.display || coding.code)}</span>`
    + `<button type="button" class="chip-x" data-remove="${index}" aria-label="Remove ${esc(coding.display || coding.code)}">&times;</button></li>`;
}

// options:
//   binding       { ecl } or { valueSet }
//   labelId       id of the visible label element
//   multiple      true for multiple selection (selections shown as chips)
//   value         current coding (single) or codings (multiple)
//   onChange      called with the new value
//   browse        full member list when the value set is small, else null
//   initialQuery  text to search on first focus (seeded repeating-group rows)
//   placeholder   input placeholder
export function createTypeahead({ binding, labelId, multiple, value, onChange, browse = null,
  initialQuery = '', placeholder = '' }) {
  const cfg = getConfig();
  const listId = `ta-list-${++uid}`;
  const root = html(`
    <div class="typeahead">
      <div class="ta-single"></div>
      <div class="ta-box">
        <input type="text" class="input ta-input" role="combobox" aria-autocomplete="list"
          aria-expanded="false" aria-controls="${listId}" aria-labelledby="${labelId}"
          autocomplete="off" spellcheck="false">
        <ul class="ta-list" role="listbox" id="${listId}" aria-labelledby="${labelId}" hidden></ul>
      </div>
      <div class="ta-status muted small" aria-live="polite"></div>
      <ul class="selected-chips"></ul>
    </div>`);

  const input = root.querySelector('.ta-input');
  const list = root.querySelector('.ta-list');
  const status = root.querySelector('.ta-status');
  const single = root.querySelector('.ta-single');
  const chips = root.querySelector('.selected-chips');

  let selected = multiple ? [...(value || [])] : (value || null);
  let results = [];
  let active = -1;
  let seq = 0;
  let seedUsed = false;

  input.placeholder = initialQuery ? `Search for ${initialQuery}` : (placeholder || 'Type to search');

  function setStatus(text) { status.textContent = text; }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function isChosen(m) {
    return multiple ? selected.some(s => sameCoding(s, m)) : sameCoding(selected, m);
  }

  function show(items, total) {
    results = items.filter(m => !m.inactive);
    active = -1;
    if (!results.length) {
      list.innerHTML = '';
      close();
      setStatus('No matches.');
      return;
    }
    list.innerHTML = results.map((m, i) => {
      const chosen = isChosen(m);
      return `<li role="option" id="${listId}-${i}" data-i="${i}" aria-selected="false"${chosen ? ' aria-disabled="true" class="is-chosen"' : ''}>${esc(m.display)}</li>`;
    }).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setStatus(total > results.length
      ? `Showing ${results.length} of ${total}. Keep typing to narrow the list.`
      : `${total} ${total === 1 ? 'match' : 'matches'}.`);
  }

  function showBrowse(q) {
    const needle = q.toLowerCase();
    const items = needle ? browse.filter(m => m.display.toLowerCase().includes(needle)) : browse;
    show(items, items.length);
  }

  const search = debounce(async q => {
    const my = ++seq;
    if (q.length < cfg.TYPEAHEAD_MIN_CHARS) {
      if (browse) showBrowse(q);
      else {
        close();
        setStatus(q ? `Type at least ${cfg.TYPEAHEAD_MIN_CHARS} characters.` : '');
      }
      return;
    }
    setStatus('Searching...');
    try {
      const res = await expand(binding, { filter: q, count: cfg.TYPEAHEAD_COUNT });
      if (my !== seq) return;
      show(res.contains, res.total);
    } catch (err) {
      if (my !== seq) return;
      close();
      setStatus(`Search failed: ${err.message}`);
    }
  }, cfg.TYPEAHEAD_DEBOUNCE_MS);

  function setActive(i) {
    const items = list.querySelectorAll('[role="option"]');
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((li, j) => li.setAttribute('aria-selected', String(j === active)));
    input.setAttribute('aria-activedescendant', items[active].id);
    items[active].scrollIntoView({ block: 'nearest' });
  }

  function pick(i) {
    const m = results[i];
    if (!m || isChosen(m)) return;
    const coding = toCoding(m);
    if (multiple) {
      selected = [...selected, coding];
      onChange(selected);
    } else {
      selected = coding;
      onChange(selected);
    }
    input.value = '';
    seq++;
    close();
    setStatus('');
    renderSelected();
    if (!multiple) single.querySelector('.chip-x')?.focus();
  }

  function renderSelected() {
    if (multiple) {
      chips.innerHTML = selected.map(selectedChipHtml).join('');
      chips.hidden = !selected.length;
      single.hidden = true;
      return;
    }
    chips.hidden = true;
    single.hidden = !selected;
    root.querySelector('.ta-box').hidden = !!selected;
    single.innerHTML = selected
      ? `<ul class="selected-chips">${selectedChipHtml(selected, 0)}</ul>`
      : '';
  }

  input.addEventListener('input', () => search(input.value.trim()));

  input.addEventListener('focus', () => {
    if (!input.value && initialQuery && !seedUsed) {
      seedUsed = true;
      input.value = initialQuery;
      input.select();
    }
    const q = input.value.trim();
    if (q || browse) search(q);
  });

  input.addEventListener('blur', () => setTimeout(close, 150));

  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.hidden) search(input.value.trim());
      else setActive(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!list.hidden) setActive(active - 1);
    } else if (e.key === 'Enter') {
      if (!list.hidden && active >= 0) {
        e.preventDefault();
        pick(active);
      }
    } else if (e.key === 'Escape') {
      if (!list.hidden) {
        e.preventDefault();
        close();
      }
    }
  });

  // pointerdown keeps focus in the input while choosing.
  list.addEventListener('pointerdown', e => {
    const li = e.target.closest('[role="option"]');
    if (!li) return;
    e.preventDefault();
    pick(Number(li.dataset.i));
  });

  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    if (multiple) {
      selected = selected.filter((_, i) => i !== Number(btn.dataset.remove));
      onChange(selected);
      renderSelected();
    } else {
      selected = null;
      onChange(null);
      renderSelected();
    }
    input.focus();
  });

  renderSelected();
  return root;
}
