// FHIR server client for Callistemon (vanilla HAPI R4).
// Patient search and the transaction POST.

import { getConfig } from '../config.js';
import { fetchJson } from './http.js';

export class FhirError extends Error {
  constructor(message, { status = 0, outcome = null, url = '' } = {}) {
    super(message);
    this.name = 'FhirError';
    this.status = status;
    this.outcome = outcome;
    this.url = url;
  }
}

// Patient?name= search. Returns an array of Patient resources.
export async function searchPatients(name) {
  const cfg = getConfig();
  const params = new URLSearchParams({ name, _count: String(cfg.PATIENT_SEARCH_COUNT) });
  const bundle = await getJson(`${cfg.FHIR_BASE}/Patient?${params}`);
  return (bundle.entry || []).map(e => e.resource).filter(r => r?.resourceType === 'Patient');
}

export function patientUrl(id) {
  return resourceUrl('Patient', id);
}

export function resourceUrl(type, id) {
  return `${getConfig().FHIR_BASE}/${type}/${encodeURIComponent(id)}`;
}

// POSTs a transaction Bundle to the base URL (SPEC.md 7.4, FR-10).
// Returns the transaction-response Bundle; throws FhirError on failure.
export function postTransaction(bundle) {
  const { FHIR_BASE } = getConfig();
  return fetchJson(FHIR_BASE, {
    method: 'POST',
    body: bundle,
    serverName: 'FHIR server',
    makeError: (message, details) => new FhirError(message, details)
  });
}

// "Observation/123/_history/1" or a full URL -> { type, id }.
export function parseLocation(location) {
  const m = /(?:^|\/)([A-Z][A-Za-z]+)\/([^/]+)(?:\/_history\/[^/]+)?\/?$/.exec(location || '');
  return m ? { type: m[1], id: m[2] } : null;
}

function getJson(url) {
  return fetchJson(url, {
    serverName: 'FHIR server',
    makeError: (message, details) => new FhirError(message, details)
  });
}

// Display helpers shared by the picker and the banner.
export function patientName(p) {
  const n = (p?.name || []).find(x => x.use === 'official') || p?.name?.[0];
  if (!n) return '(no name)';
  const family = n.family || '';
  const given = (n.given || []).join(' ');
  if (family || given) return [family.toUpperCase(), given].filter(Boolean).join(', ');
  return n.text || '(no name)';
}
