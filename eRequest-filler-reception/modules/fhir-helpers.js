/**
 * @module fhir-helpers
 * @description Bundle manipulation and FHIR resource utilities (pure functions, no network calls)
 *
 * Provides functions for:
 * - URL normalization and base URL inference
 * - Bundle resolution and resource extraction
 * - Patient and ServiceRequest filtering
 * - Task mapping and grouping
 * - Requester and pregnancy status details
 *
 * @requires formatters
 */

import { fmtName, fmtAddress } from './formatters.js?v=2';
import { CONFIG } from '../config.js?v=2';

/**
 * Normalize a FHIR resource URL by removing _history version
 * @param {string} u - Resource URL
 * @returns {string} Normalized URL
 */
export function normalizeResourceUrl(u) {
  if (!u) return u;
  try {
    const url = new URL(u);
    const parts = url.pathname.split('/').filter(Boolean);
    const hIdx = parts.indexOf('_history');
    if (hIdx > 0 && hIdx === parts.length - 2) {
      parts.splice(hIdx, 2);               // remove "_history" and "<vid>"
      url.pathname = '/' + parts.join('/');
      url.search = '';
      url.hash = '';
    }
    return url.toString();
  } catch {
    return u.replace(/\/_history\/[^\/?#]+(?=[?#]|$)/, '');
  }
}

/**
 * Infer FHIR base URL from a resource URL
 * @param {string} url - Full resource URL
 * @returns {string} Base URL
 */
export function inferBaseFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex(p => ['Patient', 'Bundle', 'ServiceRequest', 'Encounter', 'Observation', 'Task', 'Organization', 'Practitioner', 'PractitionerRole', 'Location', 'RequestGroup', 'List'].includes(p));
    return idx > 0 ? `${u.origin}/${parts.slice(0, idx).join('/')}` : `${u.origin}`;
  } catch {
    return '';
  }
}

/**
 * Convert a reference object to a relative reference string
 * @param {Object} refObj - FHIR Reference object
 * @returns {string} Relative reference string
 */
export function relRefString(refObj) {
  const s = refObj?.reference || '';
  if (!s) return '';
  try {
    if (s.startsWith('http')) {
      const p = new URL(s).pathname.split('/').filter(Boolean).slice(-2).join('/');
      return p;
    }
  } catch {}
  return s;
}

/**
 * Convert a reference to Type/ID format
 * @param {string|Object} refOrString - FHIR reference string or object
 * @returns {string|null} Type/ID string
 */
export function toTypeId(refOrString) {
  const s = typeof refOrString === 'string' ? refOrString : (refOrString?.reference || '');
  if (!s) return null;
  try {
    if (s.startsWith('http')) {
      const parts = new URL(s).pathname.split('/').filter(Boolean);
      return `${parts.slice(-2)[0]}/${parts.slice(-1)[0]}`;
    }
  } catch {}
  return s.includes('/') ? s : `Task/${s}`;
}

/**
 * Create a resolver function for a bundle
 * @param {Object} bundle - FHIR Bundle
 * @returns {Function} Resolver function
 */
export function makeResolver(bundle) {
  const byFullUrl = new Map();
  const byTypeId = new Map();
  (bundle.entry || []).forEach(e => {
    const r = e?.resource;
    if (!r) return;
    if (e.fullUrl) byFullUrl.set(e.fullUrl, r);
    if (r.resourceType && r.id) byTypeId.set(`${r.resourceType}/${r.id}`, r);
  });
  return (ref) => {
    const s = ref?.reference;
    if (!s) return null;
    if (byFullUrl.has(s)) return byFullUrl.get(s);
    if (byTypeId.has(s)) return byTypeId.get(s);
    try {
      if (s.startsWith('http')) {
        const key = new URL(s).pathname.split('/').filter(Boolean).slice(-2).join('/');
        if (byTypeId.has(key)) return byTypeId.get(key);
      }
    } catch {}
    return null;
  };
}

/**
 * Extract the Patient resource from a bundle
 * @param {Object} bundle - FHIR Bundle
 * @returns {Object|null} Patient resource or null
 */
export function pickPatient(bundle) {
  const resolver = makeResolver(bundle);
  const srs = (bundle.entry || []).map(e => e.resource).filter(r => r?.resourceType === 'ServiceRequest');
  for (const sr of srs) {
    const p = sr.subject && resolver(sr.subject);
    if (p?.resourceType === 'Patient') return p;
  }
  return (bundle.entry || []).map(e => e.resource).find(r => r?.resourceType === 'Patient') || null;
}

/**
 * Filter outstanding ServiceRequests for a patient
 * @param {Object} bundle - FHIR Bundle
 * @param {Object} patient - Patient resource
 * @returns {Array} Array of outstanding ServiceRequest resources
 */
export function outstandingServiceRequests(bundle, patient) {
  const resolver = makeResolver(bundle);
  const EX = new Set(['completed', 'revoked', 'entered-in-error']);
  const srs = (bundle.entry || []).map(e => e.resource).filter(r => r?.resourceType === 'ServiceRequest');
  return srs.filter(sr => {
    if (patient && sr.subject) {
      const tgt = resolver(sr.subject);
      if (!tgt || tgt.resourceType !== 'Patient' || tgt.id !== patient.id) return false;
    }
    return !EX.has((sr.status || '').toLowerCase());
  });
}

/**
 * Extract all Tasks from a bundle
 * @param {Object} bundle - FHIR Bundle
 * @returns {Array} Array of Task resources
 */
export function tasksInBundle(bundle) {
  return (bundle.entry || []).map(e => e.resource).filter(r => r?.resourceType === 'Task');
}

/**
 * Create a map of Tasks by their focus reference
 * @param {Object} bundle - FHIR Bundle
 * @returns {Map} Map of focus reference -> array of Tasks
 */
export function tasksByFocusMap(bundle) {
  const m = new Map();
  for (const t of tasksInBundle(bundle)) {
    let key = t.focus?.reference;
    if (!key) continue;
    try {
      if (key.startsWith('http')) key = new URL(key).pathname.split('/').filter(Boolean).slice(-2).join('/');
    } catch {}
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(t);
  }
  return m;
}

/**
 * Compose a FHIR Bundle from resources
 * @param {Object} patient - Patient resource
 * @param {Array} serviceRequests - Array of ServiceRequest resources
 * @param {Array} tasks - Array of Task resources
 * @param {Array} extras - Additional resources
 * @param {Object} includeGroupTask - Optional group Task to include
 * @returns {Object} FHIR Collection Bundle
 */
export function composeBundle(patient, serviceRequests, tasks, extras = [], includeGroupTask = null) {
  const entry = [];
  if (patient) entry.push({ fullUrl: `Patient/${patient.id}`, resource: patient });
  for (const r of (serviceRequests || [])) {
    if (r?.resourceType === 'ServiceRequest') {
      entry.push({ fullUrl: `ServiceRequest/${r.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`, resource: r });
    }
  }
  for (const t of (tasks || [])) {
    if (t?.resourceType === 'Task') {
      entry.push({ fullUrl: `Task/${t.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`, resource: t });
    }
  }
  for (const x of (extras || [])) {
    if (x?.resourceType && x.id) {
      entry.push({ fullUrl: `${x.resourceType}/${x.id}`, resource: x });
    }
  }
  if (includeGroupTask) entry.push({ fullUrl: `Task/${includeGroupTask.id}`, resource: includeGroupTask });
  return { resourceType: 'Bundle', type: 'collection', entry };
}

/**
 * Check if a Task is a Group Task
 * @param {Object} res - Task resource
 * @returns {boolean} True if it's a group task
 */
export function isGroupTask(res) {
  if (res?.resourceType !== 'Task') return false;
  const profs = res.meta?.profile || [];
  const tags = res.meta?.tag || [];
  const profileHit = profs.some(p => /au-?e?request(ing)?-?task-?group/i.test(p));
  const tagHit = tags.some(t => /fulfil?ment-?task-?group/i.test(t.code || ''));
  const looksLikeGroup = !res.focus && !!res.groupIdentifier;  // pragmatic heuristic
  return profileHit || tagHit || looksLikeGroup;
}

/**
 * Get requester details from a ServiceRequest
 * @param {Object} sr - ServiceRequest resource
 * @param {Object} bundle - FHIR Bundle
 * @returns {Object} {name, address} object
 */
export function requesterDetails(sr, bundle) {
  const resolver = makeResolver(bundle);
  const ref = sr.requester;
  const blank = { name: '—', address: '—' };
  if (!ref) return blank;
  const tgt = resolver(ref);
  if (!tgt) return { name: ref.display || '—', address: '—' };
  if (tgt.resourceType === 'Organization') return { name: tgt.name || '—', address: fmtAddress(tgt.address) || '—' };
  if (tgt.resourceType === 'Practitioner') return { name: fmtName(tgt.name?.[0] || tgt.name) || '—', address: fmtAddress(tgt.address) || '—' };
  if (tgt.resourceType === 'PractitionerRole') {
    const org = tgt.organization && resolver(tgt.organization);
    const prac = tgt.practitioner && resolver(tgt.practitioner);
    let name = (org && org.name) || (prac && fmtName(prac.name?.[0] || prac.name)) || (tgt.code && tgt.code[0]?.text) || '—';
    let address = '—';
    if (org?.address) address = fmtAddress(org.address);
    else if (Array.isArray(tgt.location) && tgt.location.length) {
      for (const lr of tgt.location) {
        const loc = resolver(lr);
        if (loc?.address) {
          address = fmtAddress(loc.address);
          break;
        }
      }
    } else if (prac?.address) address = fmtAddress(prac.address);
    return { name, address };
  }
  return { name: tgt.name || ref.display || tgt.resourceType, address: '—' };
}

/**
 * Get pregnancy status detail from a ServiceRequest
 * @param {Object} sr - ServiceRequest resource
 * @param {Object} bundle - FHIR Bundle
 * @returns {Object} {code, label} object
 */
export function getPregnancyStatusDetail(sr, bundle) {
  const resolver = makeResolver(bundle);
  const infos = Array.isArray(sr.supportingInfo) ? sr.supportingInfo : [];
  for (const ref of infos) {
    const res = resolver(ref);
    if (!res) continue;
    if (res.resourceType === 'Observation') {
      const looks = ((res.code?.text) || '').toLowerCase().includes('pregnan') || ((res.code?.coding?.[0]?.display) || '').toLowerCase().includes('pregnan');
      if (looks) {
        if ('valueBoolean' in res) return { code: res.valueBoolean ? null : CONFIG.TERMINOLOGY.codes.notPregnant, label: res.valueBoolean ? 'pregnant' : 'not pregnant' };
        const vcc = res.valueCodeableConcept;
        if (vcc?.coding?.length) {
          const c = vcc.coding[0];
          return { code: c.code || null, label: c.display || vcc.text || c.code || 'unspecified' };
        }
        if (typeof res.valueString === 'string' && res.valueString) {
          const l = res.valueString.toLowerCase();
          if (l.includes('not') && l.includes('pregnan')) return { code: CONFIG.TERMINOLOGY.codes.notPregnant, label: 'not pregnant' };
          if (l.includes('pregnan')) return { code: null, label: 'pregnant' };
          return { code: null, label: res.valueString };
        }
      }
    }
  }
  return { code: null, label: 'unspecified' };
}

/**
 * Check if a ServiceRequest is categorised as pathology
 * @param {Object} sr - ServiceRequest resource
 * @returns {boolean}
 */
export function isPathology(sr) {
  return (sr.category || []).some(cat =>
    (cat.coding || []).some(c => c.code === '108252007')
  );
}

/**
 * Check if a ServiceRequest is categorised as imaging
 * @param {Object} sr - ServiceRequest resource
 * @returns {boolean}
 */
export function isImaging(sr) {
  return (sr.category || []).some(cat =>
    (cat.coding || []).some(c => c.code === '363679005')
  );
}

/**
 * Get display text for a ServiceRequest
 * @param {Object} sr - ServiceRequest resource
 * @returns {string} Display text
 */
export function srDisplay(sr) {
  const c = sr.code || {};
  if (Array.isArray(c.coding) && c.coding.length) {
    const disp = c.coding.find(x => x.display)?.display || c.coding[0].display || c.coding[0].code;
    if (disp) return disp;
  }
  return c.text || '—';
}

/**
 * Get SNOMED code from a ServiceRequest
 * @param {Object} sr - ServiceRequest resource
 * @returns {string|null} SNOMED code or null
 */
export function srSnomedCode(sr) {
  const codings = sr.code?.coding || [];
  const sn = codings.find(cd => (cd.system || '').startsWith(CONFIG.TERMINOLOGY.snomedSystem));
  return sn ? sn.code : null;
}

/**
 * Get best note from a ServiceRequest
 * @param {Object} sr - ServiceRequest resource
 * @returns {string} Note text or empty string
 */
export function bestNote(sr) {
  if (Array.isArray(sr.note) && sr.note.length) {
    const all = sr.note.map(n => n.text).filter(Boolean);
    if (all.length) return all.sort((a, b) => b.length - a.length)[0];
  }
  if (Array.isArray(sr.reasonCode) && sr.reasonCode.length) {
    const rc = sr.reasonCode[0];
    return rc.coding?.[0]?.display || rc.text || '';
  }
  return '';
}
