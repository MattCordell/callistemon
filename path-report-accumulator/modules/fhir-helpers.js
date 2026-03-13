/**
 * @module fhir-helpers
 * @description Pure FHIR utility functions (no network calls)
 */

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
 * Extract the first LOINC code from an Observation's code.coding
 */
export function extractLoincCode(obs) {
  const codings = obs?.code?.coding || [];
  const loinc = codings.find(c => c.system === 'http://loinc.org');
  return loinc?.code || null;
}

/**
 * Extract display text from an Observation
 */
export function extractDisplayText(obs) {
  if (obs?.code?.text) return obs.code.text;
  const codings = obs?.code?.coding || [];
  const loinc = codings.find(c => c.system === 'http://loinc.org');
  if (loinc?.display) return loinc.display;
  return codings[0]?.display || '\u2014';
}

/**
 * Extract the first Organization performer reference from an Observation or DiagnosticReport
 */
export function extractPerformerRef(resource) {
  const performers = resource?.performer || [];
  for (const p of performers) {
    const ref = relRefString(p);
    if (ref.startsWith('Organization/')) return ref;
  }
  // Fall back to first performer reference
  return performers[0] ? relRefString(performers[0]) : '';
}

/**
 * Extract performer display name
 */
export function extractPerformerDisplay(resource) {
  const performers = resource?.performer || [];
  return performers[0]?.display || '';
}

/**
 * Extract method text from an Observation
 */
export function extractMethod(obs) {
  if (obs?.method?.text) return obs.method.text;
  const codings = obs?.method?.coding || [];
  return codings[0]?.display || null;
}

/**
 * Extract reference range { low, high } from an Observation
 */
export function extractRefRange(obs) {
  const rr = obs?.referenceRange?.[0];
  if (!rr) return { low: null, high: null };
  return {
    low: rr.low?.value ?? null,
    high: rr.high?.value ?? null
  };
}

/**
 * Extract the unit string from an Observation
 */
export function extractUnit(obs) {
  return obs?.valueQuantity?.unit || '';
}

/**
 * Extract value from an Observation.
 * Returns { display: string, raw: number|string|null }
 */
export function extractValue(obs) {
  if (obs?.valueQuantity != null) {
    const v = obs.valueQuantity.value;
    return { display: v != null ? String(v) : '\u2014', raw: v ?? null };
  }
  if (obs?.valueString != null) {
    return { display: obs.valueString, raw: obs.valueString };
  }
  if (obs?.valueCodeableConcept != null) {
    const cc = obs.valueCodeableConcept;
    const disp = cc.text || cc.coding?.[0]?.display || '\u2014';
    return { display: disp, raw: disp };
  }
  return { display: '\u2014', raw: null };
}

/**
 * Check if a numeric value is outside the reference range
 */
export function isOutOfRange(raw, refRange) {
  if (typeof raw !== 'number' || !refRange) return false;
  if (refRange.low != null && raw < refRange.low) return true;
  if (refRange.high != null && raw > refRange.high) return true;
  return false;
}
