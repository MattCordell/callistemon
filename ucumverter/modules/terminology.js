/**
 * @module terminology
 * @description Loads AMT medicines for a guideline: expands the guideline ECL on Ontoserver,
 * reads each product's machine-readable strength with $lookup, and falls back to the
 * static config/medicines.json snapshot when the server can't be reached.
 */

import { CONFIG } from '../config.js';

const cache = new Map();

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/fhir+json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Expand an ECL expression against the SNOMED CT-AU edition. */
export async function expandEcl(ecl) {
  const u = new URL(CONFIG.TX_BASE + '/ValueSet/$expand');
  u.searchParams.set('url', `${CONFIG.SNOMED_EDITION}?fhir_vs=ecl/${encodeURIComponent(ecl)}`);
  u.searchParams.set('count', String(CONFIG.EXPAND_COUNT));
  const vs = await fetchJson(u.toString());
  return ((vs.expansion && vs.expansion.contains) || []).map(c => ({ code: c.code, display: c.display }));
}

/**
 * Read strength values from a $lookup Parameters resource. Single-ingredient products
 * only, so the first value found for each attribute is used and role groups are ignored.
 * @returns {{boss:string|null, concentration:{value:number, snomedUnit:string}|null, totalQuantity:{value:number, snomedUnit:string}|null}}
 */
export function parseStrength(params) {
  const found = {};
  const take = (parts) => {
    const code = (parts.find(p => p.name === 'code') || {}).valueCode;
    const val = parts.find(p => p.name === 'value');
    if (code && val && !(code in found)) found[code] = val.valueDecimal ?? val.valueCode ?? val.valueString;
    parts.filter(p => p.name === 'subproperty').forEach(s => take(s.part || []));
  };
  (params.parameter || []).filter(p => p.name === 'property').forEach(p => take(p.part || []));

  const A = CONFIG.AMT;
  const pair = (v, u) => (found[v] != null && found[u] ? { value: Number(found[v]), snomedUnit: String(found[u]) } : null);
  return {
    boss: found[A.BOSS] || null,
    concentration: pair(A.CONC_VALUE, A.CONC_UNIT),
    totalQuantity: pair(A.TOTAL_VALUE, A.TOTAL_UNIT),
  };
}

/** $lookup one product and parse its strength. */
export async function lookupStrength(code) {
  const u = new URL(CONFIG.TX_BASE + '/CodeSystem/$lookup');
  u.searchParams.set('system', CONFIG.SNOMED_SYSTEM);
  u.searchParams.set('version', CONFIG.SNOMED_EDITION);
  u.searchParams.set('code', code);
  const A = CONFIG.AMT;
  [A.CONC_VALUE, A.CONC_UNIT, A.TOTAL_VALUE, A.TOTAL_UNIT, A.BOSS].forEach(p => u.searchParams.append('property', p));
  return parseStrength(await fetchJson(u.toString()));
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

let snapshot = null;
async function loadSnapshot() {
  if (!snapshot) {
    const res = await fetch(CONFIG.FILES.medicines);
    if (!res.ok) throw new Error(`Could not load ${CONFIG.FILES.medicines}`);
    snapshot = await res.json();
  }
  return snapshot;
}

/**
 * Load the medicines for a guideline.
 * @returns {Promise<{source:'live'|'offline', items:object[], error?:string}>}
 */
export async function loadMedicines(guideline) {
  if (cache.has(guideline.id)) return cache.get(guideline.id);
  let result;
  try {
    const concepts = await expandEcl(guideline.drugEcl);
    const items = await mapLimited(concepts, CONFIG.LOOKUP_CONCURRENCY, async c => ({ ...c, ...(await lookupStrength(c.code)) }));
    items.sort((a, b) => a.display.localeCompare(b.display, undefined, { numeric: true }));
    result = { source: 'live', items };
  } catch (e) {
    const snap = await loadSnapshot();
    const entry = snap.guidelines && snap.guidelines[guideline.id];
    result = { source: 'offline', items: (entry && entry.items) || [], error: e.message };
  }
  cache.set(guideline.id, result);
  return result;
}

/**
 * Attach UCUM codes to a product using the SNOMED-to-UCUM map.
 * Products with unmapped units are flagged so the UI can disable them.
 */
export function toUcumProduct(product, unitMap) {
  const unmapped = [];
  const conv = (q) => {
    if (!q) return null;
    const m = unitMap[q.snomedUnit];
    if (!m) { unmapped.push(q.snomedUnit); return null; }
    return { value: q.value, snomedUnit: q.snomedUnit, snomedDisplay: m.display, ucum: m.ucum };
  };
  const concentration = conv(product.concentration);
  const totalQuantity = conv(product.totalQuantity);
  return { ...product, concentration, totalQuantity, unmapped, usable: unmapped.length === 0 && !!(concentration || totalQuantity) };
}
