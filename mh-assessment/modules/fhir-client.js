// FHIR server client for Callistemon (vanilla HAPI R4).
// Session 2: patient search. Session 3 adds the transaction POST.

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
  return `${getConfig().FHIR_BASE}/Patient/${encodeURIComponent(id)}`;
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
