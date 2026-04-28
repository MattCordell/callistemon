/**
 * @module terminology
 * @description Terminology server operations for fetching CodeSystem / ValueSet
 */

import { CONFIG } from '../config.js';
import { fetchFhirJson } from './fhir-client.js';

/**
 * Expand a FHIR ValueSet on a terminology server.
 * @returns {Promise<{title: string, concepts: Array<{code, display, system}>}>}
 */
export async function expandValueSet(txBase, canonicalUrl) {
  const base = txBase.replace(/\/$/, '');
  const qs = '?url=' + encodeURIComponent(canonicalUrl) + '&count=' + CONFIG.EXPAND_COUNT;
  const { ok, status, data, text } = await fetchFhirJson(base + '/ValueSet/$expand' + qs);
  if (!ok) {
    throw new Error(`$expand failed: ${status}${text ? ' — ' + text.slice(0, 300) : ''}`);
  }
  const contains = data?.expansion?.contains || [];
  const concepts = contains
    .filter(c => c?.code)
    .map(c => ({ code: c.code, display: c.display || c.code, system: c.system || '' }));
  const title = data?.title || data?.name || canonicalUrl;
  return { title, concepts };
}

/**
 * Fetch a CodeSystem by canonical URL via $lookup-style search,
 * then read inline `concept[]`.
 */
export async function fetchCodeSystem(txBase, canonicalUrl) {
  const base = txBase.replace(/\/$/, '');
  const qs = '?url=' + encodeURIComponent(canonicalUrl);
  const { ok, status, data, text } = await fetchFhirJson(base + '/CodeSystem' + qs);
  if (!ok) {
    throw new Error(`CodeSystem search failed: ${status}${text ? ' — ' + text.slice(0, 300) : ''}`);
  }
  let cs = data;
  if (data?.resourceType === 'Bundle') {
    const entry = (data.entry || []).find(e => e.resource?.resourceType === 'CodeSystem');
    if (!entry) throw new Error('No CodeSystem found at ' + canonicalUrl);
    cs = entry.resource;
  }
  return normaliseCodeSystem(cs);
}

export function normaliseCodeSystem(cs) {
  const concepts = flattenConcepts(cs?.concept || [], cs?.url || '');
  return {
    title: cs?.title || cs?.name || cs?.url || 'CodeSystem',
    concepts,
  };
}

export function normaliseValueSet(vs) {
  const contains = vs?.expansion?.contains || [];
  const concepts = contains
    .filter(c => c?.code)
    .map(c => ({ code: c.code, display: c.display || c.code, system: c.system || '' }));
  return {
    title: vs?.title || vs?.name || vs?.url || 'ValueSet',
    concepts,
  };
}

function flattenConcepts(arr, system) {
  const out = [];
  for (const c of arr) {
    if (c?.code) out.push({ code: c.code, display: c.display || c.code, system });
    if (Array.isArray(c?.concept) && c.concept.length) {
      out.push(...flattenConcepts(c.concept, system));
    }
  }
  return out;
}
