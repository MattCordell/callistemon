// FHIR server client for Callistemon (vanilla HAPI R4).
// Session 2: patient search. Session 3 adds the transaction POST.

import { getConfig } from '../config.js';
import { outcomeText } from './terminology.js';

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

async function getJson(url) {
  const { FETCH_TIMEOUT_MS } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/fhir+json' },
        signal: controller.signal
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new FhirError('Timed out waiting for the FHIR server', { url });
      throw new FhirError('Network error: could not reach the FHIR server (offline, wrong URL or CORS)', { url });
    }
    let body = null;
    try { body = await response.json(); } catch { /* not JSON */ }
    if (!response.ok || body?.resourceType === 'OperationOutcome') {
      const message = outcomeText(body) || `HTTP ${response.status} ${response.statusText}`;
      throw new FhirError(message, { status: response.status, outcome: body, url });
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
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
