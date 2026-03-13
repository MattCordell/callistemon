/**
 * @module fhir-client
 * @description Read-only FHIR HTTP operations with retry logic
 */

import { CONFIG } from '../config.js';

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

/**
 * Search with pagination — follows Bundle.link next URLs.
 * Returns all matching resources across pages (up to maxPages).
 */
export async function searchWithPaging(base, resourceType, params, maxPages = 5) {
  const cleanBase = base.replace(/\/$/, '');
  const qs = new URLSearchParams(params).toString();
  let url = `${cleanBase}/${resourceType}?${qs}`;
  const resources = [];

  for (let page = 0; page < maxPages; page++) {
    const bundle = await fetchJson(url);
    const entries = (bundle.entry || []).map(e => e.resource).filter(Boolean);
    resources.push(...entries);

    const nextLink = (bundle.link || []).find(l => l.relation === 'next');
    if (!nextLink?.url) break;
    url = nextLink.url;
  }
  return resources;
}

/**
 * Search with pagination — returns full bundle entries (resource + search mode) for _include support.
 */
export async function searchWithPagingRaw(base, resourceType, params, maxPages = 5) {
  const cleanBase = base.replace(/\/$/, '');
  const qs = new URLSearchParams(params).toString();
  let url = `${cleanBase}/${resourceType}?${qs}`;
  const entries = [];

  for (let page = 0; page < maxPages; page++) {
    const bundle = await fetchJson(url);
    entries.push(...(bundle.entry || []));

    const nextLink = (bundle.link || []).find(l => l.relation === 'next');
    if (!nextLink?.url) break;
    url = nextLink.url;
  }
  return entries;
}

/**
 * Batch fetch resources by comma-separated IDs.
 * Falls back to individual getByRef calls if the server doesn't support _id search.
 */
export async function batchFetchByIds(base, resourceType, ids) {
  if (!ids.length) return [];
  const cleanBase = base.replace(/\/$/, '');

  try {
    const url = `${cleanBase}/${resourceType}?_id=${ids.join(',')}&_count=${ids.length}`;
    const bundle = await fetchJson(url);
    return (bundle.entry || []).map(e => e.resource).filter(Boolean);
  } catch (err) {
    console.warn('Batch _id fetch failed, falling back to individual:', err);
    const results = [];
    for (const id of ids) {
      try {
        const r = await getByRef(base, `${resourceType}/${id}`);
        if (r) results.push(r);
      } catch (e) {
        console.warn(`Failed to fetch ${resourceType}/${id}:`, e);
      }
    }
    return results;
  }
}
