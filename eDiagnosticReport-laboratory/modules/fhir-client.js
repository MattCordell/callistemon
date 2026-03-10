/**
 * @module fhir-client
 * @description FHIR HTTP operations with retry logic
 *
 * Adapted from eRequest-filler-reception for laboratory context.
 */

import { CONFIG } from '../config.js';
import { isGroupTask, relRefString } from './fhir-helpers.js';

/**
 * Fetch JSON with retry + exponential backoff
 */
export async function fetchJson(url, retries = CONFIG.FHIR.retryCount) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.FHIR.timeout);
      const res = await fetch(url, { headers: CONFIG.FHIR.headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        const delay = Math.min(CONFIG.FHIR.retryDelayInitial * Math.pow(2, i), CONFIG.FHIR.retryDelayMax);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Fetch a resource by reference (absolute or relative)
 */
export async function getByRef(base, refOrString) {
  if (!refOrString) return null;
  const s = typeof refOrString === 'string' ? refOrString : refOrString.reference;
  if (!s) return null;
  try {
    if (s.startsWith('http')) return await fetchJson(s);
  } catch (err) {
    console.warn('Failed to fetch absolute ref:', s, err);
    return null;
  }
  return await fetchJson(`${base.replace(/\/$/, '')}/${s}`);
}

// Cache: orgKey -> { reference, display }
const orgRefCache = new Map();

/**
 * Ensure a filler Organization exists on the server; create if not.
 * Returns a FHIR Reference { reference: "Organization/id", display }.
 */
export async function ensureOrganization(base, orgConfig) {
  const cacheKey = `${orgConfig.identifier.system}|${orgConfig.identifier.value}`;
  if (orgRefCache.has(cacheKey)) return orgRefCache.get(cacheKey);

  const cleanBase = base.replace(/\/$/, '');
  const searchUrl = `${cleanBase}/Organization?identifier=${encodeURIComponent(cacheKey)}&_count=1`;

  try {
    const bundle = await fetchJson(searchUrl);
    const existing = (bundle.entry || []).map(e => e.resource).find(r => r?.resourceType === 'Organization');
    if (existing?.id) {
      const ref = { reference: `Organization/${existing.id}`, display: orgConfig.display };
      orgRefCache.set(cacheKey, ref);
      return ref;
    }
  } catch (err) {
    console.warn('Organization search failed, will attempt create:', err);
  }

  try {
    const resp = await fetch(`${cleanBase}/Organization`, {
      method: 'POST',
      headers: CONFIG.FHIR.headers,
      body: JSON.stringify(orgConfig.resource)
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const created = await resp.json();
    const ref = { reference: `Organization/${created.id}`, display: orgConfig.display };
    orgRefCache.set(cacheKey, ref);
    return ref;
  } catch (err) {
    console.warn('Organization create failed, using logical reference:', err);
    const fallback = { identifier: orgConfig.identifier, display: orgConfig.display };
    orgRefCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Fetch all accepted diagnostic Tasks owned by the given organisation.
 * First resolves the Organization to get its server ID, then queries by owner reference.
 * Returns { tasks: Task[], groupTasks: Task[] }
 */
export async function fetchAcceptedTasks(base, orgConfig) {
  const cleanBase = base.replace(/\/$/, '');

  // Resolve the Organization on the server to get its ID
  const orgRef = await ensureOrganization(base, orgConfig);
  const ownerRef = orgRef.reference; // "Organization/{id}"
  if (!ownerRef) throw new Error('Could not resolve Organization on server');

  const url = `${cleanBase}/Task?owner=${encodeURIComponent(ownerRef)}&status=accepted&_count=${CONFIG.FHIR.pageSize}`;

  const bundle = await fetchJson(url);
  const all = (bundle.entry || []).map(e => e.resource).filter(r => r?.resourceType === 'Task');

  const groupTasks = all.filter(t => isGroupTask(t));
  const diagnosticTasks = all.filter(t => !isGroupTask(t));

  return { tasks: diagnosticTasks, groupTasks };
}

/**
 * Fetch ServiceRequests referenced by the given Tasks.
 * Returns Map<srRef, ServiceRequest>
 */
export async function fetchServiceRequests(base, tasks) {
  const srMap = new Map();
  const seen = new Set();

  for (const t of tasks) {
    const fref = t.focus?.reference;
    if (!fref) continue;
    const key = relRefString(t.focus);
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const sr = await getByRef(base, fref);
      if (sr?.resourceType === 'ServiceRequest') {
        srMap.set(key, sr);
      }
    } catch (e) {
      console.warn('SR fetch failed for', fref, e);
    }
  }
  return srMap;
}

/**
 * Fetch a Patient by reference
 */
export async function fetchPatient(base, patientRef) {
  return getByRef(base, patientRef);
}

/**
 * Submit a FHIR transaction Bundle.
 * Falls back to individual requests if transaction fails.
 */
export async function submitTransactionBundle(base, bundle) {
  const cleanBase = base.replace(/\/$/, '');

  try {
    const resp = await fetch(cleanBase, {
      method: 'POST',
      headers: CONFIG.FHIR.headers,
      body: JSON.stringify(bundle)
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${body}`);
    }
    return await resp.json();
  } catch (e) {
    console.warn('Transaction bundle failed, falling back to individual requests:', e);

    const results = [];
    for (const entry of (bundle.entry || [])) {
      const req = entry.request;
      if (!req) continue;

      const url = req.url.startsWith('http') ? req.url : `${cleanBase}/${req.url}`;
      const resp = await fetch(url, {
        method: req.method,
        headers: CONFIG.FHIR.headers,
        body: entry.resource ? JSON.stringify(entry.resource) : undefined
      });
      if (!resp.ok) throw new Error(`${req.method} ${req.url} failed: HTTP ${resp.status}`);
      results.push(await resp.json());
    }
    return results;
  }
}

/**
 * Fetch all sibling Tasks sharing the same groupIdentifier to check completion.
 * Returns Task[]
 */
export async function fetchSiblingTasks(base, groupIdentifierValue) {
  const cleanBase = base.replace(/\/$/, '');
  const url = `${cleanBase}/Task?group-identifier=${encodeURIComponent(groupIdentifierValue)}&_count=${CONFIG.FHIR.pageSize}`;
  const bundle = await fetchJson(url);
  return (bundle.entry || []).map(e => e.resource).filter(r => r?.resourceType === 'Task');
}
