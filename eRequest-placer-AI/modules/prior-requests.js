// modules/prior-requests.js — Feature C (decision support) prior-request context.
//
// Fetches a patient's recent ServiceRequests from the configured FHIR server so
// the decision-support agent can spot duplicates (spec §C.5). Deliberately
// best-effort: any failure, empty result, or missing patient id resolves to an
// empty array and NEVER blocks the caller (spec §C.3, §C.5). FHIR auth is applied
// automatically by the fetch monkey-patch in server.js — no extra work here.

import { state } from './state.js';
import { setDebugUrl } from './utils.js';

const INCLUDE_STATUS = new Set(['active', 'completed', 'on-hold']);

/**
 * Fetch + summarise recent ServiceRequests for a patient.
 * @param {string} patientId — server id of the patient (omit/empty -> []).
 * @returns {Promise<Array<{code:string|null, display:string|null, system:string|null, authored:string|null}>>}
 */
export async function fetchAndSummarisePrior(patientId) {
  const id = String(patientId || '').trim();
  if (!id || !state.FHIR_BASE) return [];

  try {
    // Primary sort is -authored (spec §C.5). Some servers don't index `authored`
    // for ServiceRequest search and answer 4xx; fall back to -_lastUpdated once.
    let resp = await queryWith(id, '-authored');
    if (resp && !resp.ok && resp.status >= 400 && resp.status < 500) {
      resp = await queryWith(id, '-_lastUpdated');
    }
    if (!resp || !resp.ok) return [];

    let bundle;
    try { bundle = await resp.json(); } catch (_e) { return []; }

    const entries = Array.isArray(bundle && bundle.entry) ? bundle.entry : [];
    const out = [];
    for (const e of entries) {
      const res = e && e.resource;
      if (!res || res.resourceType !== 'ServiceRequest') continue;
      if (!INCLUDE_STATUS.has(res.status)) continue;
      const coding = (res.code && Array.isArray(res.code.coding) && res.code.coding[0]) || null;
      out.push({
        code: coding ? (coding.code || null) : null,
        display: (coding && coding.display) || (res.code && res.code.text) || null,
        system: coding ? (coding.system || null) : null,
        authored: res.authoredOn || null,
      });
    }
    return out;
  } catch (_e) {
    // Network error / abort / anything else: degrade silently, never block.
    return [];
  }
}

function queryWith(patientId, sort) {
  const url = new URL(state.FHIR_BASE.replace(/\/+$/, '') + '/ServiceRequest');
  url.searchParams.set('subject', 'Patient/' + patientId);
  url.searchParams.set('_sort', sort);
  url.searchParams.set('_count', '20');
  setDebugUrl(url.toString());
  return fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
}
