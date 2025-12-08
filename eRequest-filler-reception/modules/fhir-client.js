/**
 * @module fhir-client
 * @description FHIR HTTP operations with retry logic
 *
 * Provides functions for:
 * - JSON fetching with exponential backoff retry
 * - Reference resolution
 * - Task and ServiceRequest retrieval
 * - Transaction bundle submission with fallback
 *
 * @requires config
 * @requires fhir-helpers
 */

import { CONFIG } from '../config.js';
import { toTypeId } from './fhir-helpers.js';

/**
 * Fetch JSON from a URL with retry logic and exponential backoff
 * @param {string} url - URL to fetch
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<Object>} Parsed JSON response
 */
export async function fetchJson(url, retries = CONFIG.FHIR.retryCount) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.FHIR.timeout);

      const res = await fetch(url, {
        headers: CONFIG.FHIR.headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        // Exponential backoff: 1s, 2s, 4s, etc. (capped at retryDelayMax)
        const delay = Math.min(
          CONFIG.FHIR.retryDelayInitial * Math.pow(2, i),
          CONFIG.FHIR.retryDelayMax
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Fetch a resource by reference
 * @param {string} base - FHIR base URL
 * @param {string|Object} refOrString - Reference string or object
 * @returns {Promise<Object|null>} FHIR resource or null
 */
export async function getByRef(base, refOrString) {
  if (!refOrString) return null;
  const s = typeof refOrString === 'string' ? refOrString : refOrString.reference;
  if (!s) return null;
  try {
    if (s.startsWith('http')) return await fetchJson(s);
  } catch (err) {
    console.warn('Failed to fetch absolute reference:', s, err);
    return null;
  }
  return await fetchJson(`${base.replace(/\/$/, '')}/${s}`);
}

/**
 * Fetch all diagnostic Tasks for a group Task
 * @param {string} base - FHIR base URL
 * @param {string} groupTaskId - Group Task ID
 * @returns {Promise<Array>} Array of Task resources
 */
export async function fetchDiagnosticTasksForGroup(base, groupTaskId) {
  const url = `${base.replace(/\/$/, '')}/Task?part-of=${encodeURIComponent('Task/' + groupTaskId)}&_count=${CONFIG.FHIR.pageSize}`;
  const bundle = await fetchJson(url);
  return (bundle.entry || []).map(e => e.resource).filter(r => r?.resourceType === 'Task');
}

/**
 * Fetch ServiceRequests and all related resources for given Tasks
 * @param {string} base - FHIR base URL
 * @param {Array} tasks - Array of Task resources
 * @returns {Promise<Object>} {srs: ServiceRequest[], related: Resource[]}
 */
export async function fetchServiceRequestsAndRelated(base, tasks) {
  const srs = [];
  const extra = [];
  const seen = new Set();

  for (const t of tasks) {
    const fref = t.focus?.reference;
    if (!fref) continue;

    const key = fref.startsWith('http')
      ? new URL(fref).pathname.split('/').filter(Boolean).slice(-2).join('/')
      : fref;

    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const sr = await getByRef(base, fref);
      if (sr?.resourceType === 'ServiceRequest') {
        srs.push(sr);

        // Fetch supporting info (e.g., pregnancy Observations)
        for (const r of (sr.supportingInfo || [])) {
          const res = await getByRef(base, r.reference || r);
          if (res?.resourceType === 'Observation') extra.push(res);
        }

        // Fetch requester and related resources
        if (sr.requester?.reference) {
          const rq = await getByRef(base, sr.requester.reference);
          if (rq) extra.push(rq);

          if (rq?.resourceType === 'PractitionerRole') {
            // Fetch organization
            if (rq.organization?.reference) {
              const org = await getByRef(base, rq.organization.reference);
              if (org) extra.push(org);
            }

            // Fetch locations
            if (Array.isArray(rq.location)) {
              for (const lr of rq.location) {
                const loc = await getByRef(base, lr.reference || lr);
                if (loc) extra.push(loc);
              }
            }

            // Fetch practitioner
            if (rq.practitioner?.reference) {
              const prac = await getByRef(base, rq.practitioner.reference);
              if (prac) extra.push(prac);
            }
          }
        }
      }
    } catch (e) {
      console.warn('SR fetch failed for', fref, e);
    }
  }

  return { srs, related: extra };
}

/**
 * Submit a transaction bundle with fallback to individual operations
 * @param {string} base - FHIR base URL
 * @param {Array} toCreate - Resources to POST
 * @param {Array} toUpdate - Resources to PUT
 * @param {Array} srPuts - ServiceRequests to PUT
 * @returns {Promise<void>}
 */
export async function submitClaimTransaction(base, toCreate, toUpdate, srPuts) {
  const txEntries = [
    ...toCreate.map(res => ({
      request: { method: 'POST', url: 'Task' },
      resource: res
    })),
    ...toUpdate.map(res => ({
      request: { method: 'PUT', url: `Task/${encodeURIComponent(res.id)}` },
      resource: res
    })),
    ...srPuts.map(res => ({
      request: { method: 'PUT', url: `ServiceRequest/${encodeURIComponent(res.id)}` },
      resource: res
    }))
  ];

  try {
    // Try transaction bundle first
    const resp = await fetch(base.replace(/\/$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json'
      },
      body: JSON.stringify({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: txEntries
      })
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    await resp.json();
  } catch (e) {
    console.warn('Transaction bundle failed, falling back to individual operations:', e);

    // Fallback: POST/PUT individually
    for (const r of toCreate) {
      const p = await fetch(`${base.replace(/\/$/, '')}/Task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json', 'Accept': 'application/fhir+json' },
        body: JSON.stringify(r)
      });
      if (!p.ok) throw new Error('POST Task failed');
      const created = await p.json();
      r.id = created.id;
    }

    for (const r of toUpdate) {
      const q = await fetch(`${base.replace(/\/$/, '')}/Task/${encodeURIComponent(r.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/fhir+json', 'Accept': 'application/fhir+json' },
        body: JSON.stringify(r)
      });
      if (!q.ok) throw new Error('PUT Task failed');
    }

    for (const r of srPuts) {
      const q = await fetch(`${base.replace(/\/$/, '')}/ServiceRequest/${encodeURIComponent(r.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/fhir+json', 'Accept': 'application/fhir+json' },
        body: JSON.stringify(r)
      });
      if (!q.ok) throw new Error('PUT ServiceRequest failed');
    }
  }
}
