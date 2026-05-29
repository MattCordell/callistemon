// modules/ontoserver-rest.js — REST fallback for the Ontoserver tool surface.
//
// Same surface as ontoserver-mcp.js (searchConcepts / lookupConcept, normalised
// to { code, display, system }[]) but backed by plain FHIR terminology
// operations on REST_TX_BASE:
//   searchConcepts -> ValueSet/$expand  (SNOMED fhir_vs=ecl/… canonical url)
//   lookupConcept  -> CodeSystem/$lookup
//
// The $expand request shape mirrors the CORS-proven path in
// modules/terminology.js (expandFromOntoserver): the ECL is encoded once into
// the canonical url, then URLSearchParams encodes the url param again — the
// double layer is correct because the ECL lives in a query-string-within-a-url.

import { getAiSettings } from './settings-ai.js';
import { setDebugUrl } from './utils.js';

const SCT = 'http://snomed.info/sct';

function restBase() {
  return (getAiSettings().REST_TX_BASE || '').replace(/\/+$/, '');
}

/** Surface OperationOutcome.diagnostics from an error body when present. */
function diagnosticsFrom(json, fallback) {
  try {
    if (json && json.resourceType === 'OperationOutcome' && Array.isArray(json.issue)) {
      const msg = json.issue.map((i) => i.diagnostics || (i.details && i.details.text) || i.code)
        .filter(Boolean).join('; ');
      if (msg) return msg;
    }
  } catch (_e) { /* fall through */ }
  return fallback;
}

async function getJson(url, signal) {
  setDebugUrl(url);
  let r;
  try {
    r = await fetch(url, { headers: { Accept: 'application/fhir+json' }, signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new Error('Ontoserver REST transport error: ' + ((e && e.message) || e));
  }
  let json = null;
  try { json = await r.json(); } catch (_e) { json = null; }
  if (!r.ok) {
    throw new Error(diagnosticsFrom(json, 'Ontoserver REST ' + r.status));
  }
  return json;
}

/** Unified concept search via FHIR ValueSet/$expand. */
export async function searchConcepts({ query, valueSetEcl, count } = {}, { signal } = {}) {
  const vsCanonical = SCT + '?fhir_vs=ecl/' + encodeURIComponent(valueSetEcl || '');
  const u = new URL(restBase() + '/ValueSet/$expand');
  u.searchParams.set('url', vsCanonical);
  if (query && query.trim()) u.searchParams.set('filter', query);
  u.searchParams.set('count', String(count || 20));
  u.searchParams.set('includeDesignations', 'true');

  const json = await getJson(u.toString(), signal);
  const contains = (json && json.expansion && json.expansion.contains) || [];
  return contains
    .filter((c) => c && c.code)
    .map((c) => ({ code: String(c.code), display: c.display || c.code, system: c.system || SCT }));
}

/** Unified single-concept lookup via FHIR CodeSystem/$lookup. */
export async function lookupConcept({ system, code } = {}, { signal } = {}) {
  if (!code) return [];
  const u = new URL(restBase() + '/CodeSystem/$lookup');
  u.searchParams.set('system', system || SCT);
  u.searchParams.set('code', code);

  const json = await getJson(u.toString(), signal);
  const display = readParameter(json, 'display');
  return display ? [{ code: String(code), display, system: system || SCT }] : [];
}

// Read a named value from a FHIR Parameters resource (e.g. $lookup output).
function readParameter(json, name) {
  try {
    if (json && json.resourceType === 'Parameters' && Array.isArray(json.parameter)) {
      const p = json.parameter.find((x) => x.name === name);
      if (p) return p.valueString || p.valueCode || (p.value && (p.value.string || p.value.code)) || '';
    }
  } catch (_e) { /* ignore */ }
  return '';
}
