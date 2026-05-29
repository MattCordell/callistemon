// modules/ai-context.js — shared helpers for the AI feature modules (Feature A
// reason coding, Feature B test selection, Feature C decision support):
// patient-context gathering and in-scope confirmation. Extracted so the features
// don't duplicate this logic.

import { searchConcepts } from './ontoserver-tools.js';

const SCT = 'http://snomed.info/sct';

/** Approximate age in whole years from a yyyy-mm-dd date string; null if absent/invalid. */
export function ageFromDob(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return (age >= 0 && age < 200) ? age : null;
}

/** Read the shared patient context (age/sex/pregnancy) from the form. */
export function gatherPatientContext() {
  const age = ageFromDob(document.getElementById('patient-dob').value);
  const sex = document.getElementById('patient-gender').value || 'unknown';
  const pregEl = document.getElementById('pregnancy-status');
  // Include pregnancy only if a status is actually selected.
  const pregnancy = (pregEl && pregEl.value)
    ? (pregEl.selectedOptions[0] && pregEl.selectedOptions[0].textContent.trim())
    : null;
  return { age, sex, pregnancy };
}

/**
 * Defence in depth (spec §3.4, §10.3): confirm a candidate's code is returned by
 * an in-scope search for its display term. Drops hallucinated/out-of-scope codes
 * even after the agent "searched". Conservative — returns false on any error.
 */
export async function confirmInScope(candidate, ecl) {
  try {
    const results = await searchConcepts({ query: candidate.display, valueSetEcl: ecl, count: 30 });
    return results.some((r) => r.code === candidate.code);
  } catch (_e) {
    return false;
  }
}

export { SCT };
