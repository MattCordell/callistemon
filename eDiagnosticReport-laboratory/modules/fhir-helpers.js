/**
 * @module fhir-helpers
 * @description Pure FHIR utility functions (no network calls)
 *
 * Adapted from eRequest-filler-reception for laboratory context.
 */

import { CONFIG } from '../config.js';

/**
 * Convert a reference to Type/ID format
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
  return s.includes('/') ? s : null;
}

/**
 * Convert a reference to a relative string
 */
export function relRefString(refObj) {
  const s = refObj?.reference || '';
  if (!s) return '';
  try {
    if (s.startsWith('http')) {
      return new URL(s).pathname.split('/').filter(Boolean).slice(-2).join('/');
    }
  } catch {}
  return s;
}

/**
 * Get SNOMED code from a ServiceRequest
 */
export function srSnomedCode(sr) {
  const codings = sr.code?.coding || [];
  const sn = codings.find(cd => (cd.system || '').includes('snomed'));
  return sn ? sn.code : null;
}

/**
 * Get display text for a ServiceRequest
 */
export function srDisplay(sr) {
  const c = sr.code || {};
  if (Array.isArray(c.coding) && c.coding.length) {
    const disp = c.coding.find(x => x.display)?.display;
    if (disp) return disp;
  }
  return c.text || '\u2014';
}

/**
 * Check if a ServiceRequest is categorised as pathology
 */
export function isPathology(sr) {
  return (sr.category || []).some(cat =>
    (cat.coding || []).some(c => c.code === CONFIG.CATEGORY.pathologySnomedCode)
  );
}

/**
 * Group tasks by requisition (groupIdentifier value).
 * Returns Map<string, Task[]>
 */
export function groupTasksByRequisition(tasks) {
  const m = new Map();
  for (const t of tasks) {
    const key = t.groupIdentifier?.value || t.id || 'ungrouped';
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(t);
  }
  return m;
}

/**
 * Check if a Task is a Group Task (no focus, has groupIdentifier)
 */
export function isGroupTask(task) {
  if (task?.resourceType !== 'Task') return false;
  const profs = task.meta?.profile || [];
  const profileHit = profs.some(p => /au-?e?request(ing)?-?task-?group/i.test(p));
  const looksLikeGroup = !task.focus && !!task.groupIdentifier;
  return profileHit || looksLikeGroup;
}

/**
 * Extract the patient reference from a ServiceRequest
 */
export function srPatientRef(sr) {
  return relRefString(sr?.subject) || null;
}
