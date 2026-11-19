// Terminology client for Ontoserver: $expand, $lookup and $validate-code.
// Results are cached in memory by request URL. The cache holds promises,
// so parallel callers share one request. Failed requests are not cached.
//
// Requests go through the shared helper in http.js, which sends only the
// Accept header (Ontoserver's CORS policy allows nothing else).

import { getConfig } from '../config.js';
import { SNOMED_METADATA } from '../definition/assessment-definition.js';
import { fetchJson as httpFetchJson, outcomeText } from './http.js';

export { outcomeText };

const cache = new Map();

export class TerminologyError extends Error {
  constructor(message, { status = 0, outcome = null, url = '' } = {}) {
    super(message);
    this.name = 'TerminologyError';
    this.status = status;
    this.outcome = outcome;
    this.url = url;
  }
}

export function clearCache() {
  cache.clear();
}

// Implicit SNOMED CT value set URL for an ECL expression, in the configured edition.
export function implicitVsUrl(ecl, edition = getConfig().SNOMED_EDITION) {
  return `${edition}?fhir_vs=ecl/${encodeURIComponent(ecl)}`;
}

// A binding is { ecl } or { valueSet }. Returns the value set URL to send.
export function bindingUrl(binding) {
  if (binding.ecl) return implicitVsUrl(binding.ecl);
  if (binding.valueSet) return binding.valueSet;
  throw new TerminologyError('Binding has neither ecl nor valueSet.');
}

// ValueSet/$expand. Returns { total, offset, contains: [{ system, code, display, inactive }] }.
export async function expand(binding, { count, offset, filter } = {}) {
  const cfg = getConfig();
  const params = new URLSearchParams({ url: bindingUrl(binding) });
  if (count != null) params.set('count', String(count));
  if (offset) params.set('offset', String(offset));
  if (filter) params.set('filter', filter);
  params.set('displayLanguage', cfg.DISPLAY_LANGUAGE);

  const vs = await getJson(`${cfg.TX_BASE}/ValueSet/$expand?${params}`);
  const exp = vs.expansion || {};
  const contains = (exp.contains || []).map(c => ({
    system: c.system,
    code: c.code,
    display: c.display,
    inactive: c.inactive === true
  }));
  return {
    total: typeof exp.total === 'number' ? exp.total : contains.length,
    offset: exp.offset || 0,
    contains
  };
}

// CodeSystem/$lookup. For SNOMED CT the configured edition is sent as the version.
// Returns { display, version, inactive, fsn, synonyms, parents, designations, properties }.
export async function lookup(code, { system, properties } = {}) {
  const cfg = getConfig();
  const sys = system || cfg.SNOMED_SYSTEM;
  const params = new URLSearchParams({ system: sys, code });
  if (sys === cfg.SNOMED_SYSTEM) params.set('version', cfg.SNOMED_EDITION);
  (properties || []).forEach(p => params.append('property', p));
  params.set('displayLanguage', cfg.DISPLAY_LANGUAGE);

  const result = await getJson(`${cfg.TX_BASE}/CodeSystem/$lookup?${params}`);
  return parseLookup(result);
}

// ValueSet/$validate-code. Returns { result, display, message }.
export async function validateCode(binding, code, system) {
  const cfg = getConfig();
  const params = new URLSearchParams({
    url: bindingUrl(binding),
    system: system || cfg.SNOMED_SYSTEM,
    code,
    displayLanguage: cfg.DISPLAY_LANGUAGE
  });
  const result = await getJson(`${cfg.TX_BASE}/ValueSet/$validate-code?${params}`);
  const p = paramMap(result.parameter);
  return {
    result: p.result?.valueBoolean === true,
    display: p.display?.valueString || '',
    message: p.message?.valueString || ''
  };
}

// ---- internals ----

function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const promise = fetchJson(url).catch(err => {
    // Only remove our own entry: a newer run may have replaced it.
    if (cache.get(url) === promise) cache.delete(url);
    throw err;
  });
  cache.set(url, promise);
  return promise;
}

function fetchJson(url) {
  return httpFetchJson(url, {
    serverName: 'terminology server',
    makeError: (message, details) => new TerminologyError(message, details)
  });
}

function paramMap(parameters = []) {
  const map = {};
  for (const p of parameters) if (!(p.name in map)) map[p.name] = p;
  return map;
}

const FSN_USE = SNOMED_METADATA.fsnUse.code;
const SYNONYM_USE = SNOMED_METADATA.synonymUse.code;

function parseLookup(result) {
  const params = result.parameter || [];
  const p = paramMap(params);
  const properties = [];
  const designations = [];

  for (const param of params) {
    if (param.name === 'property') {
      const parts = paramMap(param.part);
      const value = parts.value || {};
      properties.push({
        code: parts.code?.valueCode,
        value: value.valueCode ?? value.valueString ?? value.valueBoolean ??
          value.valueCoding ?? value.valueInteger ?? value.valueDecimal,
        // Role-grouped SNOMED attributes arrive as sub-properties.
        subproperties: (param.part || [])
          .filter(x => x.name === 'subproperty')
          .map(sp => {
            const spParts = paramMap(sp.part);
            const v = spParts.value || {};
            return { code: spParts.code?.valueCode, value: v.valueCode ?? v.valueString ?? v.valueCoding };
          })
      });
    } else if (param.name === 'designation') {
      const parts = paramMap(param.part);
      designations.push({
        language: parts.language?.valueCode,
        use: parts.use?.valueCoding?.code,
        value: parts.value?.valueString
      });
    }
  }

  const inactiveProp = properties.find(x => x.code === 'inactive');
  const fsn = designations.find(d => d.use === FSN_USE)?.value || '';
  const display = p.display?.valueString || '';
  const synonyms = [...new Set(designations
    .filter(d => d.use === SYNONYM_USE && d.value !== display)
    .map(d => d.value))];

  return {
    display,
    version: p.version?.valueString || '',
    inactive: inactiveProp ? inactiveProp.value === true : null,
    fsn,
    synonyms,
    parents: properties.filter(x => x.code === 'parent').map(x => x.value),
    designations,
    properties
  };
}
