/**
 * @module terminology
 * @description Terminology server operations (SNOMED ECL, ValueSet expansion)
 *
 * Provides functions for:
 * - SNOMED ECL expansion to code sets
 * - FHIR ValueSet expansion with filtering
 * - Module-scoped caching for performance
 *
 * @requires config
 */

import { CONFIG } from '../config.js';

// Module-scoped caches
const eclCache = new Map();
const valueSetCache = new Map();

/**
 * Fetch JSON with error handling
 * @param {string} url - URL to fetch
 * @returns {Promise<Object>} Response object with {ok, status, data, text}
 * @private
 */
async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/fhir+json' } });
  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return { ok: res.ok, status: res.status, data, text };
}

/**
 * Expand SNOMED ECL expression to code set
 * @param {string} txBase - Terminology server base URL
 * @param {string} ecl - SNOMED ECL expression
 * @returns {Promise<Set<string>>} Set of SNOMED codes
 */
export async function expandECL(txBase, ecl) {
  const cacheKey = `${txBase}|${ecl}`;

  // Check cache
  if (eclCache.has(cacheKey)) {
    return eclCache.get(cacheKey);
  }

  const vsUrl = CONFIG.SNOMED.SNOMED_SYSTEM + '?fhir_vs=ecl/' + encodeURIComponent(ecl);
  const url = txBase.replace(/\/$/, '') + '/ValueSet/$expand?url=' + encodeURIComponent(vsUrl) + '&count=5000';

  const { ok, status, data, text } = await fetchJson(url);

  if (!ok) {
    throw new Error(`$expand ECL failed: ${status}${text ? ' — ' + text : ''}`);
  }

  const contains = data?.expansion?.contains || [];
  const set = new Set();

  for (const it of contains) {
    if (it && (it.system || '').toLowerCase().includes('snomed') && it.code) {
      set.add(it.code);
    }
  }

  // Cache result
  eclCache.set(cacheKey, set);

  return set;
}

/**
 * Expand FHIR ValueSet with optional filter
 * @param {string} txBase - Terminology server base URL
 * @param {string} canonicalUrl - ValueSet canonical URL
 * @param {string} [filter] - Optional filter string
 * @param {number} [count] - Optional max results
 * @returns {Promise<Array>} Array of {code, display} objects
 */
export async function expandValueSet(txBase, canonicalUrl, filter, count) {
  const cacheKey = `${txBase}|${canonicalUrl}|${filter || ''}|${count || ''}`;

  // Check cache
  if (valueSetCache.has(cacheKey)) {
    return valueSetCache.get(cacheKey);
  }

  const base = txBase.replace(/\/$/, '');
  const qs = '?url=' + encodeURIComponent(canonicalUrl) +
             (filter ? '&filter=' + encodeURIComponent(filter) : '') +
             (count ? '&count=' + String(count) : '');

  let resp = await fetchJson(base + '/ValueSet/$expand' + qs);

  // Try primary server
  if (resp.ok) {
    const contains = resp.data?.expansion?.contains || [];
    const results = contains
      .filter(c => c?.code)
      .map(c => ({ code: c.code, display: c.display || c.code }));

    // Cache result
    valueSetCache.set(cacheKey, results);
    return results;
  }

  // Fallback: try extracting server from canonical URL
  if (resp.status === 404) {
    try {
      const u = new URL(canonicalUrl);
      const fallbackBase = u.origin + '/fhir';
      resp = await fetchJson(fallbackBase.replace(/\/$/, '') + '/ValueSet/$expand' + qs);

      if (resp.ok) {
        const contains2 = resp.data?.expansion?.contains || [];
        const results = contains2
          .filter(c => c?.code)
          .map(c => ({ code: c.code, display: c.display || c.code }));

        // Cache result
        valueSetCache.set(cacheKey, results);
        return results;
      }
    } catch (e) {
      // Fallback failed, continue to throw
    }
  }

  const msg = resp?.text || (resp?.data?.issue && JSON.stringify(resp.data.issue)) || '';
  throw new Error(`$expand ValueSet failed: ${resp?.status || '?'}${msg ? ' — ' + msg : ''}`);
}

/**
 * Clear all caches
 */
export function clearCaches() {
  eclCache.clear();
  valueSetCache.clear();
}
