// Terminology Lens (FR-5): a global toggle that reveals binding detail beside
// each coded field, and a concept detail drawer populated by $lookup.
// When the Lens is off, panels are hidden by CSS and the form stays clean.

import { REVIEW_CHECKS } from '../definition/assessment-definition.js';
import { getConfig } from '../config.js';
import { lookup } from './terminology.js';
import { esc, copyText, aucdiBadge } from './ui.js';

const STORAGE_KEY = 'mh-assessment.lens';
const INTERPRETS = '363714003';
const HAS_INTERPRETATION = '363713009';

let drawer = null;
let drawerOpener = null;
let drawerToken = 0;
const ptCache = new Map(); // "system|code" -> AU preferred term

// ---------------------------------------------------------------- toggle

export function mountLens(toggleButton, drawerEl) {
  drawer = drawerEl;
  let on = false;
  try { on = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* storage blocked */ }
  setLens(on, toggleButton);
  toggleButton.addEventListener('click', () => setLens(!document.body.classList.contains('lens-on'), toggleButton));

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer && !drawer.hidden) closeDrawer();
  });
}

function setLens(on, button) {
  document.body.classList.toggle('lens-on', on);
  button.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
  if (!on) closeDrawer();
}

async function onClick(e) {
  const inLens = e.target.closest('.lens-panel, .concept-drawer');
  if (!inLens) return;

  const copy = e.target.closest('[data-copy]');
  if (copy) {
    const label = copy.dataset.label ??= copy.textContent;
    const ok = await copyText(copy.dataset.copy);
    copy.textContent = ok ? 'Copied' : 'Copy failed';
    clearTimeout(copy._resetTimer);
    copy._resetTimer = setTimeout(() => { copy.textContent = label; }, 1200);
    return;
  }

  const concept = e.target.closest('[data-concept-code]');
  if (concept) {
    openConcept({
      system: concept.dataset.conceptSystem,
      code: concept.dataset.conceptCode,
      display: concept.dataset.conceptDisplay
    }, concept);
    return;
  }

  if (e.target.closest('[data-close-drawer]')) closeDrawer();
}

// ---------------------------------------------------------------- panels

export function createLensPanel(fctx) {
  const el = document.createElement('aside');
  el.className = 'lens-panel';
  el.setAttribute('aria-label', `Terminology detail for ${fctx.def.label || fctx.def.id}`);
  fctx.lensEl = el;
  updateLens(fctx);
  return el;
}

export function updateLens(fctx) {
  const el = fctx?.lensEl;
  if (!el) return;
  el.innerHTML = fctx.isGroup ? groupHtml(fctx) : fieldHtml(fctx, true);
  fillPreferredTerms(el);
}

function headHtml(def) {
  const status = def.status === 'reviewed'
    ? '<span class="tag tag-ok">reviewed</span>'
    : `<span class="tag tag-placeholder" title="Binding not yet reviewed">${esc(def.status || 'placeholder')}</span>`;
  return `<div class="lens-head">
    <span class="lens-title">Terminology lens</span>
    ${status}
    ${def.aucdi ? aucdiBadge(def.aucdi) : ''}
  </div>`;
}

function fieldHtml(fctx, withHead) {
  const d = fctx.def;
  const rows = [];

  const shape = [d.control, d.cardinality, d.output ? `output ${d.output}` : ''].filter(Boolean).join(', ');
  rows.push(['Field', `<code>${esc(d.id)}</code> <span class="muted">${esc(shape)}</span>`]);

  if (d.observable) rows.push(['Observable', codingHtml(d.observable)]);
  else if (/^observation/.test(d.output || '')) rows.push(['Observable', '<span class="muted">TBC</span>']);

  if (d.componentCode) rows.push(['Component', codingHtml(d.componentCode)]);

  if (d.ecl) {
    rows.push(['ECL', `<div class="ecl">${esc(d.ecl)}</div><button type="button" class="btn-link" data-copy="${esc(d.ecl)}">Copy ECL</button>`]);
  } else if (d.valueSet) {
    rows.push(['Value set', `<div class="ecl">${esc(d.valueSet)}</div><button type="button" class="btn-link" data-copy="${esc(d.valueSet)}">Copy URL</button>`]);
  } else if (d.options) {
    rows.push(['Options', `<span class="muted">Inline in the definition:</span> ${d.options.map(o => `<code>${esc(o.code)}</code> ${esc(o.display)}`).join('; ')}`]);
  }

  if (d.ecl || d.valueSet || d.options) {
    let expansion;
    if (fctx.error) expansion = '<span class="text-warn">Failed</span>';
    else if (fctx.total == null) expansion = '<span class="spinner" aria-label="Loading"></span>';
    else {
      const how = fctx.kind ? ` &middot; ${d.control === 'auto' ? 'auto &rarr; ' : ''}${esc(fctx.kind)}` : '';
      expansion = `<strong>${fctx.total}</strong> ${fctx.total === 1 ? 'concept' : 'concepts'}${how}`;
    }
    rows.push(['Expansion', expansion]);
  }

  const selected = fctx.selected();
  if (selected.length) {
    rows.push(['Selected', `<ul class="lens-selected">${selected.map(c => `<li>${conceptButton(c)}</li>`).join('')}</ul>`]);
  }

  if (d.notes) rows.push(['Notes', esc(d.notes)]);

  const problems = [
    fctx.error ? `<li class="warn">Expansion failed: ${esc(fctx.error)}</li>` : '',
    ...(fctx.warnings || []).map(w => `<li class="warn">${esc(w)}</li>`)
  ].join('');

  return `${withHead ? headHtml(d) : ''}
    <dl class="lens-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${problems ? `<ul class="warnings">${problems}</ul>` : ''}`;
}

function groupHtml(gctx) {
  const columns = gctx.columns.map(cctx => `
    <div class="lens-col">
      <h4>${esc(cctx.def.label || cctx.def.id)} <span class="tag ${cctx.def.status === 'reviewed' ? 'tag-ok' : 'tag-placeholder'}">${esc(cctx.def.status || 'placeholder')}</span></h4>
      ${fieldHtml(cctx, false)}
    </div>`).join('');
  return `${headHtml(gctx.def)}${fieldHtml(gctx, false)}${columns}`;
}

function codingHtml(c) {
  const system = c.system || getConfig().SNOMED_SYSTEM;
  const local = system === REVIEW_CHECKS.localSystem;
  const pt = ptCache.get(`${system}|${c.code}`);
  const sys = system === getConfig().SNOMED_SYSTEM ? '' : ` <span class="muted small">${esc(local ? 'local code' : system)}</span>`;
  return `<code>${esc(c.code)}</code> <span${local ? '' : ` data-pt-system="${esc(system)}" data-pt-code="${esc(c.code)}"`}>${esc(pt || c.display || '')}</span>${sys}`;
}

function conceptButton(c) {
  return `<button type="button" class="concept-link" data-concept-system="${esc(c.system)}" data-concept-code="${esc(c.code)}" data-concept-display="${esc(c.display)}"><code>${esc(c.code)}</code> ${esc(c.display)}</button>`;
}

// Replace definition displays with the AU preferred term from $lookup.
function fillPreferredTerms(root) {
  root.querySelectorAll('[data-pt-code]').forEach(span => {
    const { ptSystem: system, ptCode: code } = span.dataset;
    const key = `${system}|${code}`;
    if (ptCache.has(key)) return;
    lookup(code, { system }).then(res => {
      if (!res.display) return;
      ptCache.set(key, res.display);
      document.querySelectorAll(`[data-pt-code="${CSS.escape(code)}"][data-pt-system="${CSS.escape(system)}"]`)
        .forEach(s => { s.textContent = res.display; });
    }).catch(() => { /* keep the definition display */ });
  });
}

// ---------------------------------------------------------------- concept detail

export async function openConcept(coding, opener) {
  if (!drawer) return;
  const cfg = getConfig();
  const token = ++drawerToken;
  if (opener && !drawer.contains(opener)) drawerOpener = opener;
  drawer.hidden = false;
  drawer.innerHTML = drawerFrame(coding.display || coding.code,
    '<p class="muted"><span class="spinner" aria-hidden="true"></span> Looking up concept...</p>');
  drawer.querySelector('h2').focus();

  if (coding.system === REVIEW_CHECKS.localSystem) {
    drawer.innerHTML = drawerFrame(coding.display || coding.code, `
      <dl class="lens-dl"><dt>Code</dt><dd><code>${esc(coding.code)}</code></dd>
      <dt>System</dt><dd>${esc(coding.system)}</dd></dl>
      <p class="muted">Local placeholder code. It cannot be looked up on the terminology server.</p>`);
    return;
  }

  const isSct = coding.system === cfg.SNOMED_SYSTEM;
  try {
    const res = await lookup(coding.code, {
      system: coding.system,
      properties: isSct ? ['designation', 'parent', 'inactive', INTERPRETS, HAS_INTERPRETATION] : ['designation']
    });
    if (token !== drawerToken) return;

    const interprets = attributeValues(res.properties, INTERPRETS);
    const hasInterp = attributeValues(res.properties, HAS_INTERPRETATION);
    const related = [...new Set([...res.parents.map(valueCode), ...interprets, ...hasInterp])];
    const displays = new Map(await Promise.all(related.map(code =>
      lookup(code, { system: coding.system }).then(r => [code, r.display]).catch(() => [code, '']))));
    if (token !== drawerToken) return;

    const link = code => conceptButton({ system: coding.system, code, display: displays.get(code) || '' });
    const list = codes => codes.length ? `<ul class="lens-selected">${codes.map(c => `<li>${link(c)}</li>`).join('')}</ul>` : '<span class="muted">None</span>';
    const synonyms = res.synonyms.filter(s => s !== res.fsn);

    const rows = [
      ['Code', `<code>${esc(coding.code)}</code>`],
      ['AU preferred term', esc(res.display)],
      isSct ? ['Fully specified name', esc(res.fsn || '')] : null,
      ['Synonyms', synonyms.length ? `<ul class="plain">${synonyms.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '<span class="muted">None</span>'],
      isSct ? ['Parents', list(res.parents.map(valueCode))] : null,
      isSct ? ['Interprets', list(interprets)] : null,
      isSct ? ['Has interpretation', list(hasInterp)] : null,
      ['Status', res.inactive === true ? '<span class="tag tag-warn">inactive</span>' : 'Active'],
      ['System', esc(coding.system)],
      res.version ? ['Version', `<span class="small">${esc(res.version)}</span>`] : null
    ].filter(Boolean);

    drawer.innerHTML = drawerFrame(res.display || coding.display || coding.code,
      `<dl class="lens-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`);
  } catch (err) {
    if (token !== drawerToken) return;
    drawer.innerHTML = drawerFrame(coding.display || coding.code, `
      <dl class="lens-dl"><dt>Code</dt><dd><code>${esc(coding.code)}</code></dd>
      <dt>System</dt><dd>${esc(coding.system)}</dd></dl>
      <ul class="warnings"><li class="warn">Lookup failed: ${esc(err.message)}</li></ul>`);
  }
  drawer.querySelector('h2')?.focus();
}

function drawerFrame(title, body) {
  return `<div class="drawer-head">
      <h2 tabindex="-1" id="concept-drawer-title">${esc(title)}</h2>
      <button type="button" class="btn btn-secondary btn-small" data-close-drawer>Close</button>
    </div>
    <p class="drawer-kicker">Concept detail</p>
    ${body}`;
}

function closeDrawer() {
  if (!drawer || drawer.hidden) return;
  drawerToken++;
  drawer.hidden = true;
  drawer.innerHTML = '';
  if (drawerOpener?.isConnected) drawerOpener.focus();
  drawerOpener = null;
}

const valueCode = v => (v && typeof v === 'object' ? v.code : v);

// Attribute values, ungrouped or inside SNOMED role groups (property 609096000).
function attributeValues(properties, attribute) {
  const values = [
    ...properties.filter(p => p.code === attribute).map(p => valueCode(p.value)),
    ...properties.flatMap(p => p.subproperties || []).filter(sp => sp.code === attribute).map(sp => valueCode(sp.value))
  ].filter(Boolean);
  return [...new Set(values)];
}
