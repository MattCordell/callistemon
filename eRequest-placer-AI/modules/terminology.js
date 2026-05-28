// modules/terminology.js — Ontoserver expand, SNOMED $subsumes, supplement properties, fasting preload

import {
  R4_BASE, TX_BASE, TERM_BASE,
  R5_PROP_EXT,
  VS_ECL_FASTING, VS_ECL_SITE_SPECIFIC,
} from '../config.js';
import { setDebugUrl } from './utils.js';

// ----- Module-public mutable sets, populated by the preloaders below -----
export const fastingCodeSet = new Set();
export const siteSpecificCodeSet = new Set();

// ----- Module-private subsumes cache -----
const subsumesCache = new Map();

// ----- Extract supplement properties from R5 backport extensions -----
export function extractSupplementProperties(concept) {
  const props = {};
  (concept.extension || []).forEach((ext) => {
    if (ext.url !== R5_PROP_EXT) return;
    const subExts = ext.extension || [];
    const codeExt  = subExts.find((e) => e.url === 'code');
    const valueExt = subExts.find((e) => e.url === 'value');
    if (!codeExt) return;
    const code = codeExt.valueCode;
    const value = (valueExt && (valueExt.valueString || valueExt.valueCode)) || '';
    if (['pathologyTestsExplainedUrl', 'rcpaManualUrl', 'requiredSpecimen', 'collectionCentreRequirements'].includes(code)) {
      props[code] = value;
    }
  });
  return props;
}

// ----- Ontoserver ValueSet $expand -----
export async function expandFromOntoserver(vsCanonicalUrl, filter, opts) {
  opts = opts || {};

  async function doExpand(supplementList) {
    const base = new URL(opts.base || TX_BASE);
    base.searchParams.set('url', vsCanonicalUrl);
    if (filter && filter.trim().length) base.searchParams.set('filter', filter);
    base.searchParams.set('count', opts.count || '50');
    if (opts.includeDesignations) base.searchParams.set('includeDesignations', 'true');
    supplementList.forEach((s) => base.searchParams.append('useSupplement', s));
    if (opts.properties) opts.properties.forEach((p) => base.searchParams.append('property', p));
    if (opts.boost) base.searchParams.set('_boost', opts.boost);
    const url = base.toString();
    setDebugUrl(url);
    const r = await fetch(url, { headers: { Accept: 'application/fhir+json' } });
    if (!r.ok) throw new Error('Ontoserver ' + r.status);
    const j = await r.json();
    return (j && j.expansion && j.expansion.contains) ? j.expansion.contains : [];
  }

  const supps = Array.isArray(opts.useSupplement) ? opts.useSupplement
              : (opts.useSupplement ? [opts.useSupplement] : []);
  try {
    return await doExpand(supps);
  } catch (e) {
    if (supps.length > 1) {
      console.warn('Expand with provider supplement failed, retrying without it', e);
      try { return await doExpand([supps[0]]); } catch (e2) { console.warn('Fallback expand failed', e2); }
    } else {
      console.warn('Ontoserver expand failed', e);
    }
    return [];
  }
}

// ----- Preload fasting codes from ECL -----
export async function preloadFastingCodes() {
  try {
    const items = await expandFromOntoserver(VS_ECL_FASTING);
    items.forEach((i) => { if (i.code) fastingCodeSet.add(i.code); });
  } catch (e) { console.warn('preloadFastingCodes', e); }
}

// ----- Preload site-specific procedure codes from ECL -----
export async function preloadSiteSpecificCodes() {
  try {
    const items = await expandFromOntoserver(VS_ECL_SITE_SPECIFIC, null, { base: R4_BASE, count: '1000' });
    items.forEach((i) => { if (i.code) siteSpecificCodeSet.add(i.code); });
  } catch (e) { console.warn('preloadSiteSpecificCodes', e); }
}

// ----- SNOMED $subsumes -----
function readOutcomeFromParameters(j) {
  try {
    if (j && j.resourceType === 'Parameters' && Array.isArray(j.parameter)) {
      const outParam = j.parameter.find((p) => p.name === 'outcome');
      const resParam = j.parameter.find((p) => p.name === 'result');
      if (outParam) {
        const val = outParam.valueCode || outParam.valueString || (outParam.value && outParam.value.code);
        if (typeof val === 'string') return { outcome: val };
      }
      if (resParam && typeof resParam.valueBoolean === 'boolean') {
        return { result: !!resParam.valueBoolean };
      }
    }
  } catch (_e) { /* parse failure → empty result */ }
  return {};
}

async function callSubsumes(codeA, codeB) {
  const url = TERM_BASE + '/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=' +
    encodeURIComponent(codeA) + '&codeB=' + encodeURIComponent(codeB);
  setDebugUrl(url);
  const r = await fetch(url, { headers: { Accept: 'application/fhir+json' } });
  if (!r.ok) throw new Error('subsumes ' + r.status);
  const j = await r.json();
  return readOutcomeFromParameters(j);
}

export async function snomedSubsumes(parent, child) {
  if (!parent || !child) return false;
  const key = parent + '|' + child;
  if (subsumesCache.has(key)) return subsumesCache.get(key);
  try {
    let resp = await callSubsumes(parent, child);
    let match = (resp.outcome === 'subsumes' || resp.outcome === 'equivalent' || resp.result === true);
    if (!match) {
      resp = await callSubsumes(child, parent);
      match = (resp.outcome === 'specializes' || resp.outcome === 'equivalent' || resp.result === true);
    }
    subsumesCache.set(key, !!match);
    return !!match;
  } catch (e) {
    console.warn('subsumes', e);
    subsumesCache.set(key, false);
    return false;
  }
}
