/**
 * @module fhir-helpers
 * @description FHIR resource utilities (pure functions, no network calls)
 *
 * Provides functions for:
 * - Reference normalization
 * - Resource extraction
 * - Display text helpers
 * - SNOMED code extraction
 * - Bundle processing
 *
 * @requires formatters
 * @requires config
 */

import { fmtName } from './formatters.js';
import { CONFIG } from '../config.js';

// ==================== Reference Normalization ====================

/**
 * Normalize a reference string to Type/ID format
 * @param {string|Object} ref - Reference string or Reference object
 * @returns {string} Normalized reference
 */
export function normalizeRefStr(ref) {
  const s = String(ref || '').trim();
  const m = s.match(/^([A-Za-z]+)\/([^\/#?]+)/);
  return m ? (m[1] + '/' + m[2]) : s;
}

/**
 * Normalize a reference to specific type
 * @param {string|Object} ref - Reference string or Reference object
 * @param {string} type - Resource type (e.g., 'Patient', 'ServiceRequest')
 * @returns {string} Normalized reference
 */
export function normalizeRef(ref, type) {
  const s = String(ref || '').trim();
  const m = s.match(new RegExp(type + '\\/([^\\/#?]+)'));
  return m ? (type + '/' + m[1]) : s;
}

/**
 * Normalize a patient reference
 * @param {string|Object} ref - Reference string or Reference object
 * @returns {string} Normalized patient reference
 */
export function normalizePatientRef(ref) {
  return normalizeRef(ref, 'Patient');
}

/**
 * Normalize a ServiceRequest reference
 * @param {string|Object} ref - Reference string or Reference object
 * @returns {string} Normalized ServiceRequest reference
 */
export function normalizeServiceRequestRef(ref) {
  return normalizeRef(ref, 'ServiceRequest');
}

// ==================== ServiceRequest Helpers ====================

/**
 * Get authored date from ServiceRequest
 * @param {Object} sr - ServiceRequest resource
 * @returns {string|null} ISO datetime or null
 */
export function srAuthoredOn(sr) {
  return sr?.authoredOn || sr?.meta?.lastUpdated || null;
}

/**
 * Get code text from ServiceRequest
 * @param {Object} sr - ServiceRequest resource
 * @returns {string} Code display text
 */
export function srCodeText(sr) {
  const t = sr?.code?.text;
  const c = sr?.code?.coding?.[0];
  return t || c?.display || c?.code || '(no code)';
}

/**
 * Get category text from ServiceRequest
 * @param {Object} sr - ServiceRequest resource
 * @returns {string} Category display text
 */
export function srCategoryText(sr) {
  const cat = sr?.category?.[0];
  const c = cat?.coding?.[0];
  return cat?.text || c?.display || c?.code || '';
}

/**
 * Get patient reference from ServiceRequest
 * @param {Object} sr - ServiceRequest resource
 * @returns {string|null} Patient reference
 */
export function srPatientRef(sr) {
  return sr?.subject?.reference || null;
}

// ==================== SNOMED Helpers ====================

/**
 * Extract all codings from a CodeableConcept
 * @param {Object|Array} cc - CodeableConcept or array of CodeableConcepts
 * @returns {Array} Array of Coding objects
 */
export function codingsFromCC(cc) {
  const arr = [];
  if (!cc) return arr;

  if (Array.isArray(cc)) {
    for (const item of cc) {
      const codings = item?.coding;
      if (Array.isArray(codings)) {
        for (const coding of codings) {
          if (coding) arr.push(coding);
        }
      }
    }
    return arr;
  }

  const coding = cc.coding;
  if (Array.isArray(coding)) {
    for (const c of coding) {
      if (c) arr.push(c);
    }
  }

  return arr;
}

/**
 * Extract SNOMED codes from CodeableConcept
 * @param {Object|Array} cc - CodeableConcept or array of CodeableConcepts
 * @returns {Array<string>} Array of SNOMED codes
 */
export function snomedCodesFromCC(cc) {
  return codingsFromCC(cc)
    .filter(cd => (cd.system || '').toLowerCase().includes('snomed'))
    .map(cd => cd.code)
    .filter(Boolean);
}

// ==================== Resource Name Resolution ====================

/**
 * Get name from a FHIR resource
 * @param {Object} res - FHIR resource
 * @param {Object} resByRef - Map of resources by reference (for PractitionerRole resolution)
 * @returns {string} Resource name
 */
export function nameFromResource(res, resByRef = {}) {
  if (!res?.resourceType) return '';

  switch (res.resourceType) {
    case 'Patient':
    case 'Practitioner':
    case 'RelatedPerson':
      return fmtName(res.name);

    case 'Organization':
    case 'CareTeam':
    case 'HealthcareService':
      return String(res.name || '');

    case 'Device': {
      if (Array.isArray(res.deviceName) && res.deviceName.length) {
        return res.deviceName[0].name || '';
      }
      if (res.type?.text) return res.type.text;
      if (Array.isArray(res.type?.coding) && res.type.coding[0]) {
        return res.type.coding[0].display || res.type.coding[0].code || '';
      }
      return '';
    }

    case 'PractitionerRole': {
      let prac = '';
      if (res.practitioner?.reference) {
        const pracRes = resByRef[normalizeRefStr(res.practitioner.reference)];
        prac = nameFromResource(pracRes, resByRef);
      }

      let org = '';
      if (res.organization?.reference) {
        const orgRes = resByRef[normalizeRefStr(res.organization.reference)];
        org = nameFromResource(orgRes, resByRef);
      }

      let role = '';
      if (Array.isArray(res.code) && res.code.length) {
        const c = res.code[0];
        role = c.text ||
               (Array.isArray(c.coding) && c.coding[0]?.display) ||
               (Array.isArray(c.coding) && c.coding[0]?.code) ||
               '';
      }

      const left = prac || role;
      if (left && org) return left + ' @ ' + org;
      return left || org || '';
    }

    default:
      if (res.title) return String(res.title);
      if (res.name) return String(res.name);
      return '';
  }
}

/**
 * Get performer names from ServiceRequest
 * @param {Object} sr - ServiceRequest resource
 * @param {Object} resByRef - Map of resources by reference
 * @returns {string} Comma-separated performer names
 */
export function performerNames(sr, resByRef) {
  const refs = Array.isArray(sr?.performer) ? sr.performer : [];
  const names = [];

  for (const r of refs) {
    const disp = r?.display ? String(r.display).trim() : '';
    const refStr = normalizeRefStr(r?.reference);
    const res = refStr ? resByRef[refStr] : null;
    const nm = nameFromResource(res, resByRef) || disp || refStr;
    if (nm) names.push(nm);
  }

  // Deduplicate
  const seen = new Set();
  const uniq = [];
  for (const n of names) {
    if (!seen.has(n)) {
      uniq.push(n);
      seen.add(n);
    }
  }

  return uniq.join(', ');
}

// ==================== Bundle Processing ====================

/**
 * Compare two resource meta.lastUpdated timestamps
 * @param {Object} aMeta - First resource meta
 * @param {Object} bMeta - Second resource meta
 * @returns {boolean} True if a is newer or equal to b
 * @private
 */
function newer(aMeta, bMeta) {
  const a = new Date(aMeta?.lastUpdated || 0).getTime();
  const b = new Date(bMeta?.lastUpdated || 0).getTime();
  return a >= b;
}

/**
 * Process FHIR Bundle and extract resources
 * @param {Object} bundle - FHIR Bundle
 * @param {boolean} reset - If true, replace existing data; if false, merge
 * @param {Object} currentState - Current state data
 * @param {Array} currentState.srList - Current ServiceRequest list
 * @param {Object} currentState.patientMap - Current patient map
 * @param {Object} currentState.taskBySrId - Current task map
 * @param {Object} currentState.resByRef - Current resource map
 * @returns {Object} Processed data: {srList, patientMap, taskBySrId, resByRef, nextLink}
 */
export function processBundle(bundle, reset, currentState = {}) {
  const entries = bundle?.entry || [];
  const nextPatients = reset ? {} : { ...currentState.patientMap };
  const nextSRsMap = new Map((reset ? [] : currentState.srList || []).map(r => [r.id, r]));
  const nextTaskBySrId = reset ? {} : { ...currentState.taskBySrId };
  const nextResByRef = reset ? {} : { ...currentState.resByRef };

  // Process all resources
  for (const entry of entries) {
    const r = entry?.resource;
    if (!r) continue;

    // Add to resByRef map
    if (r.resourceType && r.id) {
      nextResByRef[r.resourceType + '/' + r.id] = r;
    }

    // Process by resource type
    if (r.resourceType === 'ServiceRequest') {
      nextSRsMap.set(r.id, r);
    }

    if (r.resourceType === 'Patient') {
      nextPatients['Patient/' + r.id] = r;
    }

    if (r.resourceType === 'Task') {
      // 1) Task.focus -> ServiceRequest (spec-defined relationship)
      const focusRef = normalizeServiceRequestRef(r.focus?.reference);
      if (focusRef) {
        const existing = nextTaskBySrId[focusRef];
        if (!existing || newer(r.meta, existing.meta)) {
          nextTaskBySrId[focusRef] = r;
        }
      }

      // 2) Task.basedOn[] -> ServiceRequest (fallback)
      if (Array.isArray(r.basedOn)) {
        for (const ref of r.basedOn) {
          const srRef = normalizeServiceRequestRef(ref?.reference);
          if (srRef) {
            const existing = nextTaskBySrId[srRef];
            if (!existing || newer(r.meta, existing.meta)) {
              nextTaskBySrId[srRef] = r;
            }
          }
        }
      }
    }
  }

  // Extract next link for pagination
  const links = bundle?.link || [];
  let nextLink = '';
  for (const link of links) {
    if (link?.relation === 'next') {
      nextLink = link.url || '';
      break;
    }
  }

  return {
    srList: Array.from(nextSRsMap.values()),
    patientMap: nextPatients,
    taskBySrId: nextTaskBySrId,
    resByRef: nextResByRef,
    nextLink
  };
}
