// Demo page: generate, copy and validate synthetic identifiers.
import { TYPES, generate, validate, toFhirIdentifier } from './modules/registry.js';

const $ = (id) => document.getElementById(id);

// One line per type for the "Rules and limits" section.
const RULES = {
  medicare: '11 digits: first digit 2-6, check digit (digit 9, mod 10 with weights 1,3,7,9), issue number, IRN. A 10-digit form leaves off the IRN.',
  dva: 'State letter (N, S, W, T, V or Q), war code of 1-3 letters, digits, optional dependant letter. Up to 9 characters. No check digit.',
  ihi: '16 digits: prefix 800360, 9 digits, Luhn check digit.',
  hpii: '16 digits: prefix 800361, 9 digits, Luhn check digit.',
  hpio: '16 digits: prefix 800362, 9 digits, Luhn check digit.',
  'medicare-provider': '6-digit stem, location character, check letter (mod 11). Generated location characters never include 0, I, O, S or Z.',
  'pbs-prescriber': '7 digits with a check digit. A leading 0 uses mod 11, and the undefined check value 10 is never generated.',
  ahpra: '3-letter profession code then 10 digits. No check digit.',
  'hospital-provider': 'Same algorithm as the Medicare provider number, with a stem starting 0. The HL7 AU Base IG defines no FHIR system for it.',
};

let current = { typeId: null, values: [] };

function setStatus(message, isError = false) {
  const el = $('status');
  el.textContent = message;
  el.classList.toggle('error', isError);
}

function fillTypeSelect(select) {
  for (const t of TYPES) select.add(new Option(t.label, t.id));
}

async function copyText(text, trigger) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for pages not served from a secure context.
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch { setStatus('Could not copy. Select the text and copy it by hand.', true); }
    area.remove();
  }
  if (trigger) {
    const old = trigger.textContent;
    trigger.textContent = 'Copied';
    setTimeout(() => { trigger.textContent = old; }, 1200);
  }
}

// ---------- output formats ----------
function formatOutput(typeId, values, format) {
  if (format === 'json') {
    return JSON.stringify(values.map((value) => ({ type: typeId, value, synthetic: true })), null, 2);
  }
  if (format === 'fhir') {
    return JSON.stringify(values.map((v) => toFhirIdentifier(typeId, v)), null, 2);
  }
  return values.join('\n');
}

function renderOutput() {
  $('out-text').textContent = formatOutput(current.typeId, current.values, $('out-format').value);
}

// ---------- generate ----------
function renderResults() {
  const body = $('results-body');
  body.replaceChildren();
  current.values.forEach((value, i) => {
    const check = validate(current.typeId, value);
    const tr = document.createElement('tr');

    const num = document.createElement('td');
    num.className = 'num';
    num.textContent = String(i + 1);

    const val = document.createElement('td');
    val.className = 'value';
    val.textContent = value;

    const status = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = check.valid ? 'badge badge-ok' : 'badge badge-bad';
    badge.textContent = check.valid ? 'Valid' : 'Invalid';
    status.append(badge);
    for (const w of check.warnings || []) {
      const note = document.createElement('span');
      note.className = 'note';
      note.textContent = w;
      status.append(note);
    }

    const copy = document.createElement('td');
    copy.className = 'copy';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-small';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', `Copy ${value}`);
    btn.addEventListener('click', () => copyText(value, btn));
    copy.append(btn);

    tr.append(num, val, status, copy);
    body.append(tr);
  });
  $('results-area').hidden = current.values.length === 0;
  renderOutput();
}

function onGenerate() {
  const typeId = $('gen-type').value;
  const count = Math.min(50, Math.max(1, Math.floor(Number($('gen-count').value)) || 1));
  $('gen-count').value = String(count);
  const seed = $('gen-seed').value.trim();
  const options = { count, seed: seed || undefined };
  if (typeId === 'medicare') options.length = Number($('gen-length').value);
  current = { typeId, values: generate(typeId, options) };
  renderResults();
  const label = TYPES.find((t) => t.id === typeId).label;
  setStatus(`Generated ${current.values.length} synthetic ${label} value${current.values.length === 1 ? '' : 's'}${seed ? ` with seed "${seed}"` : ''}.`);
}

function onTypeChange() {
  const type = TYPES.find((t) => t.id === $('gen-type').value);
  $('gen-example').textContent = `Example from a spec or sample: ${type.example}`;
  $('gen-length-field').hidden = type.id !== 'medicare';
}

// ---------- validate ----------
function onValidate() {
  const text = $('val-input').value;
  const box = $('val-result');
  if (!text.trim()) { box.hidden = true; return; }
  const r = validate($('val-type').value, text);
  box.hidden = false;
  box.className = r.valid ? 'msg msg-ok' : 'msg msg-error';
  const parts = [r.valid ? 'Valid format and check digit.' : `Not valid. ${r.reason}`];
  for (const w of r.warnings || []) parts.push(`Note: ${w}`);
  box.textContent = parts.join(' ');
}

// ---------- rules list ----------
function renderRules() {
  const dl = $('rules-list');
  for (const t of TYPES) {
    const dt = document.createElement('dt');
    dt.textContent = t.label;
    const dd = document.createElement('dd');
    dd.textContent = RULES[t.id] || '';
    dl.append(dt, dd);
  }
}

// ---------- tabs ----------
// Follows the WAI-ARIA tabs pattern: arrow keys, Home and End move between tabs.
// The chosen tab is kept in the URL hash, so #validate and #rules can be linked to.
const TABS = ['generate', 'validate', 'rules'];

function selectTab(name, { focus = false, updateHash = true } = {}) {
  for (const t of TABS) {
    const selected = t === name;
    const tab = $(`tab-${t}`);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(`panel-${t}`).hidden = !selected;
    if (selected && focus) tab.focus();
  }
  if (updateHash) {
    try { history.replaceState(null, '', `#${name}`); } catch { /* hash is only a convenience */ }
  }
}

function tabFromHash() {
  const name = location.hash.slice(1);
  return TABS.includes(name) ? name : 'generate';
}

function initTabs() {
  const list = document.querySelector('.tab-list');
  list.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) selectTab(tab.dataset.tab);
  });
  list.addEventListener('keydown', (e) => {
    const i = TABS.indexOf(document.activeElement?.dataset?.tab);
    if (i === -1) return;
    const target = { ArrowRight: (i + 1) % TABS.length, ArrowLeft: (i + TABS.length - 1) % TABS.length, Home: 0, End: TABS.length - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    selectTab(TABS[target], { focus: true });
  });
  window.addEventListener('hashchange', () => selectTab(tabFromHash(), { updateHash: false }));
  selectTab(tabFromHash(), { updateHash: false });
}

function init() {
  initTabs();
  fillTypeSelect($('gen-type'));
  fillTypeSelect($('val-type'));
  renderRules();
  onTypeChange();
  $('gen-type').addEventListener('change', onTypeChange);
  $('btn-generate').addEventListener('click', onGenerate);
  $('gen-count').addEventListener('keydown', (e) => { if (e.key === 'Enter') onGenerate(); });
  $('gen-seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') onGenerate(); });
  $('out-format').addEventListener('change', renderOutput);
  $('btn-copy-all').addEventListener('click', (e) => copyText($('out-text').textContent, e.currentTarget));
  $('val-type').addEventListener('change', onValidate);
  $('val-input').addEventListener('input', onValidate);
  onGenerate();
}

init();
