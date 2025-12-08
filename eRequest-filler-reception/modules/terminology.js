/**
 * @module terminology
 * @description SNOMED CT terminology services with caching
 *
 * Provides functions for:
 * - SNOMED subsumption testing
 * - ValueSet expansion (fasting codes)
 * - Cache management for performance
 *
 * @requires config
 */

import { CONFIG } from '../config.js';

// Internal state - caches
const subsumesCache = new Map(); // `${ancestor}|${code}` -> boolean
let fastingCodeSet = null;       // Set<string> of SNOMED codes

/**
 * Check if a SNOMED code is subsumed by (descendant of) an ancestor code
 * Uses the terminology server's $subsumes operation
 * @param {string} ancestor - SNOMED ancestor code
 * @param {string} code - SNOMED code to test
 * @returns {Promise<boolean>} True if code is subsumed by ancestor
 */
export async function snomedSubsumes(ancestor, code) {
  if (!code) return false;
  const key = `${ancestor}|${code}`;
  if (subsumesCache.has(key)) return subsumesCache.get(key);

  try {
    const url = `${CONFIG.TERMINOLOGY.txBase}/CodeSystem/$subsumes?system=${encodeURIComponent(CONFIG.TERMINOLOGY.snomedSystem)}&codeA=${encodeURIComponent(ancestor)}&codeB=${encodeURIComponent(code)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/fhir+json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const js = await res.json();
    const outcome = (js.parameter || []).find(p => p.name === 'outcome')?.valueCode || '';
    const yes = outcome === 'subsumes' || outcome === 'equivalent';
    subsumesCache.set(key, yes);
    return yes;
  } catch (err) {
    console.warn('SNOMED subsumption check failed:', err);
    subsumesCache.set(key, false);
    return false;
  }
}

/**
 * Ensure fasting code set is loaded from terminology server
 * Uses ValueSet $expand operation with ECL query
 * @returns {Promise<Set<string>>} Set of SNOMED codes for fasting procedures
 */
export async function ensureFastingSet() {
  if (fastingCodeSet) return fastingCodeSet;

  fastingCodeSet = new Set();
  try {
    const vsUrl = `${CONFIG.TERMINOLOGY.snomedSystem}?fhir_vs=ecl/${CONFIG.TERMINOLOGY.ecl.fasting}`;
    const url = `${CONFIG.TERMINOLOGY.txBase}/ValueSet/$expand?count=1000&url=${encodeURIComponent(vsUrl)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/fhir+json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const js = await res.json();
    for (const c of (js.expansion?.contains || [])) {
      if (c.code) fastingCodeSet.add(String(c.code));
    }
  } catch (err) {
    console.warn('Fasting ValueSet expansion failed:', err);
    // Fallback: empty set (heuristic will still run in UI)
  }

  return fastingCodeSet;
}

/**
 * Get terminology cache statistics (for debugging)
 * @returns {Object} Cache statistics
 */
export function getTerminologyCacheStats() {
  return {
    subsumesEntries: subsumesCache.size,
    fastingCodesCount: fastingCodeSet?.size || 0
  };
}

/**
 * Clear all terminology caches
 */
export function clearTerminologyCaches() {
  subsumesCache.clear();
  fastingCodeSet = null;
}
