// ICD-11 unreviewed display (FR-9). Shows the ICD-11 entities whose draft
// research map targets the selected SNOMED CT concept. Exact concept matches
// only: no ancestors are walked. UI only: nothing here reaches the FHIR output.
//
// The map runs from ICD-11 to SNOMED CT. Reading it backwards is a display aid,
// not a SNOMED CT to ICD-11 map.

import { getConfig } from '../config.js';
import { esc, html, infoPop } from './ui.js';

// Column headers read from the TSV (looked up by name, not position).
const COL = {
  description: 'Description',
  foundationUri: 'FoundationURI',
  mmsCode: 'MMS Code',
  mmsUrl: 'MMS BrowserURL',
  foundationUrl: 'Foundation BrowserURL',
  relationship: 'Relationship',
  mapStatus: 'Map Status',
  target: 'Target Code'
};

const BADGE_TEXT = 'Unreviewed research map';
const BADGE_TIP = 'This ICD-11 to SNOMED CT map is a draft research map and has not been reviewed. '
  + 'It runs from ICD-11 to SNOMED CT. Showing the ICD-11 entities that map to the selected '
  + 'concept is a display aid only: it is not a SNOMED CT to ICD-11 map. '
  + 'ICD-11 codes are not written into the FHIR resources.';

// ---------------------------------------------------------------- parsing

// "a" -> a, and "" -> " inside a quoted value (for a PowerShell Export-Csv copy).
function unquote(value) {
  const v = value ?? '';
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/""/g, '"');
  return v;
}

// Parses the map TSV. Returns Map<SNOMED CT code, rows[]>, rows sorted for display.
export function parseMapTsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const header = (lines.shift() || '').split('\t').map(unquote);
  const at = {};
  for (const [key, name] of Object.entries(COL)) {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`The ICD-11 map has no "${name}" column.`);
    at[key] = i;
  }

  const index = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split('\t').map(unquote);
    const row = Object.fromEntries(Object.entries(at).map(([key, i]) => [key, (cells[i] || '').trim()]));
    if (!row.target) continue;
    if (!index.has(row.target)) index.set(row.target, []);
    index.get(row.target).push(row);
  }
  for (const rows of index.values()) rows.sort(compareRows);
  return index;
}

// Rows with an MMS code first, in code order; then Foundation-only rows by description.
function compareRows(a, b) {
  if (!!a.mmsCode !== !!b.mmsCode) return a.mmsCode ? -1 : 1;
  if (a.mmsCode) return a.mmsCode.localeCompare(b.mmsCode, 'en', { numeric: true });
  return a.description.localeCompare(b.description, 'en');
}

// ---------------------------------------------------------------- loading

let mapPromise = null;

// Fetches and indexes the map once. A failed load is not kept, so Retry works.
export function loadIcd11Map() {
  if (!mapPromise) {
    const url = new URL(getConfig().ICD11_MAP_URL, document.baseURI).href;
    mapPromise = fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading the ICD-11 map.`);
        return res.text();
      })
      .then(parseMapTsv)
      .catch(err => {
        mapPromise = null;
        throw err;
      });
  }
  return mapPromise;
}

// ---------------------------------------------------------------- panel

// An empty panel for a field. Fill it with updateIcd11Panel.
export function createIcd11Panel() {
  const panel = html('<div class="icd11-panel" aria-live="polite" hidden></div>');
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-icd11-retry]')) updateIcd11Panel(panel, panel._value);
  });
  return panel;
}

// value: a coding, an array of codings, or empty.
export function updateIcd11Panel(panel, value) {
  panel._value = value;
  const codings = (Array.isArray(value) ? value : [value]).filter(c => c && c.code);
  const seq = (panel._seq || 0) + 1;
  panel._seq = seq;
  if (!codings.length) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `${headHtml()}<p class="small muted"><span class="spinner" aria-hidden="true"></span> Loading the ICD-11 map...</p>`;

  loadIcd11Map()
    .then(index => {
      if (panel._seq !== seq) return;
      panel.innerHTML = headHtml() + codings.map(c => conceptHtml(c, index.get(c.code) || [], codings.length > 1)).join('');
    })
    .catch(err => {
      if (panel._seq !== seq) return;
      panel.innerHTML = `${headHtml()}<p class="small text-warn">The ICD-11 map could not be loaded: ${esc(err.message)}
        <button type="button" class="btn-link" data-icd11-retry>Retry</button></p>`;
    });
}

function headHtml() {
  return `
    <div class="icd11-head">
      <span class="icd11-title">ICD-11</span>
      <span class="badge-unreviewed" title="${esc(BADGE_TIP)}">${BADGE_TEXT}</span>
      ${infoPop(BADGE_TIP, 'About the unreviewed ICD-11 research map')}
    </div>`;
}

function conceptHtml(coding, rows, showConcept) {
  const heading = showConcept ? `<p class="icd11-concept">${esc(coding.display || coding.code)}</p>` : '';
  if (!rows.length) {
    return `${heading}<p class="small muted">No ICD-11 entities in the research map target this concept.</p>`;
  }
  const n = getConfig().ICD11_PREVIEW_ROWS;
  const first = rows.slice(0, n);
  const rest = rows.slice(n);
  return `${heading}
    <ul class="icd11-list">${first.map(rowHtml).join('')}</ul>
    ${rest.length ? `
      <details class="icd11-more">
        <summary>Show all ${rows.length}</summary>
        <ul class="icd11-list">${rest.map(rowHtml).join('')}</ul>
      </details>` : ''}`;
}

function rowHtml(r) {
  // FR-9: the MMS code if present, otherwise the Foundation URI.
  const code = r.mmsCode
    ? `<span class="icd11-code">${esc(r.mmsCode)}</span>`
    : `<span class="icd11-code icd11-uri">${esc(r.foundationUri || 'No code')}</span>`;
  const links = [
    r.mmsUrl ? `<a href="${esc(r.mmsUrl)}" target="_blank" rel="noopener">MMS<span class="sr-only"> browser for ${esc(r.description)}</span></a>` : '',
    r.foundationUrl ? `<a href="${esc(r.foundationUrl)}" target="_blank" rel="noopener">Foundation<span class="sr-only"> browser for ${esc(r.description)}</span></a>` : ''
  ].filter(Boolean).join(' ');
  return `
    <li class="icd11-row">
      ${code}
      <span class="icd11-desc">${esc(r.description)}</span>
      <span class="icd11-meta">${esc(r.relationship)} · ${esc(r.mapStatus)}${links ? ` · ${links}` : ''}</span>
    </li>`;
}
