// Assessment form (FR-3): tabs, sections and fields, all rendered from the
// definition file. Tabs render on first view and keep their DOM afterwards.

import { DEFINITION, SCALE_DISPLAY_ORDER } from '../definition/assessment-definition.js';
import { esc, html, infoPop } from './ui.js';
import { getAnswer, setAnswer, subscribe, countForTab } from './state.js';
import { renderField, renderGroup, bandLabel } from './controls.js';
import { renderPatientSection, mountBanner } from './patient.js';
import { renderSubmitPanel } from './submit.js';

const tabs = DEFINITION.tabs;
let root = null;
let current = null;
const rendered = new Set();

export function mountForm(container) {
  root = container;
  root.innerHTML = `
    <section class="patient-banner" aria-label="Patient"></section>
    <div class="sr-only" aria-live="polite" data-patient-live></div>
    <div class="tabbar" role="tablist" aria-label="Assessment sections">
      ${tabs.map((t, i) => `
        <a role="tab" href="#form/${esc(t.id)}" id="tab-${esc(t.id)}" aria-controls="panel-${esc(t.id)}"
          aria-selected="false" tabindex="-1" class="tab">
          <span class="tab-num" aria-hidden="true">${i + 1}</span>
          <span class="tab-label">${esc(t.label)}</span>
          <span class="tab-count" data-count="${esc(t.id)}"></span>
        </a>`).join('')}
    </div>
    <div class="tab-panels">
      ${tabs.map(t => `<section role="tabpanel" id="panel-${esc(t.id)}" aria-labelledby="tab-${esc(t.id)}" class="tab-panel" hidden></section>`).join('')}
    </div>`;

  mountBanner(root.querySelector('.patient-banner'), root.querySelector('[data-patient-live]'));
  root.querySelector('.tabbar').addEventListener('keydown', onTabKey);
  subscribe(updateCounts);
  updateCounts();
}

// Shows a tab by id; unknown ids show the first tab.
export function showTab(id) {
  const tab = tabs.find(t => t.id === id) || tabs[0];
  current = tab.id;
  for (const t of tabs) {
    const on = t.id === tab.id;
    const tabEl = root.querySelector(`#tab-${CSS.escape(t.id)}`);
    tabEl.setAttribute('aria-selected', String(on));
    tabEl.tabIndex = on ? 0 : -1;
    root.querySelector(`#panel-${CSS.escape(t.id)}`).hidden = !on;
  }
  if (!rendered.has(tab.id)) {
    renderTab(tab);
    rendered.add(tab.id);
  }
}

// Re-renders open tabs, for example after a server change. Answers are kept.
export function rerenderForm() {
  if (!root) return;
  rendered.clear();
  root.querySelectorAll('.tab-panel').forEach(p => { p.innerHTML = ''; });
  if (current) showTab(current);
}

function onTabKey(e) {
  const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  const i = tabs.findIndex(t => t.id === current);
  let next = i;
  if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
  if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
  if (e.key === 'Home') next = 0;
  if (e.key === 'End') next = tabs.length - 1;
  location.hash = `#form/${tabs[next].id}`;
  root.querySelector(`#tab-${CSS.escape(tabs[next].id)}`).focus();
}

function updateCounts() {
  for (const t of tabs) {
    const el = root.querySelector(`[data-count="${CSS.escape(t.id)}"]`);
    if (!el) continue;
    const n = countForTab(t.id);
    el.textContent = n ? String(n) : '';
    el.title = n ? `${n} ${n === 1 ? 'field' : 'fields'} completed` : '';
    el.hidden = !n;
  }
}

// ---------------------------------------------------------------- rendering

function renderTopField(def, opts = {}) {
  const bind = { value: getAnswer(def.id), onChange: v => setAnswer(def.id, v) };
  if (def.control === 'repeating-group') return renderGroup(def, bind).el;
  return renderField(def, { ...opts, ...bind }).el;
}

function renderTab(tab) {
  const panel = root.querySelector(`#panel-${CSS.escape(tab.id)}`);
  panel.innerHTML = `
    <div class="tab-head">
      <h2>${esc(tab.label)}</h2>
      ${tab.info ? infoPop(tab.info, `About the ${tab.label} tab`) : ''}
    </div>
    ${tab.note ? `<p class="tab-note" role="note">${esc(tab.note)}</p>` : ''}`;

  const fields = DEFINITION.fields.filter(f => f.tab === tab.id);
  if (!fields.length) {
    panel.append(placeholderFor(tab));
    return;
  }

  for (const [name, sectionFields] of sectionsOf(fields)) {
    if (sectionFields.every(f => f.output === 'patient')) {
      panel.append(renderPatientSection(name, sectionFields, renderTopField));
      continue;
    }
    panel.append(renderSection(tab, name, sectionFields));
  }
}

// Sections in order of first appearance in the definition.
function sectionsOf(fields) {
  const map = new Map();
  for (const f of fields) {
    if (!map.has(f.section)) map.set(f.section, []);
    map.get(f.section).push(f);
  }
  return map;
}

function renderSection(tab, name, fields) {
  const sensitive = fields.some(f => f.sensitive);
  const note = tab.sectionInfo?.[name];
  const scale = fields.every(f => f.scale);
  const section = html(`
    <section class="form-section${sensitive ? ' is-sensitive' : ''}">
      <h3>${esc(name)}${sensitive ? ' <span class="tag tag-sensitive" title="Sensitive information">Sensitive</span>' : ''}</h3>
      ${note ? `<p class="section-note" role="note">${esc(note)}</p>` : ''}
      <div class="section-body ${scale ? 'scale-grid' : 'field-stack'}"></div>
    </section>`);
  const body = section.querySelector('.section-body');

  if (scale) {
    body.append(html(`
      <div class="scale-head" aria-hidden="true">
        <span></span>
        ${SCALE_DISPLAY_ORDER.map(id => `<span class="band-head band-${id}">${esc(bandLabel(id))}</span>`).join('')}
      </div>`));
  }

  for (const f of fields) {
    const el = renderTopField(f, { scale });
    // A lone field named like its section: the heading already labels it.
    if (fields.length === 1 && (f.label || '') === name) el.classList.add('label-is-heading');
    body.append(el);
  }
  return section;
}

function placeholderFor(tab) {
  if (tab.id === 'review') return renderSubmitPanel();
  return html('<p class="muted">No fields are defined for this tab.</p>');
}
