/**
 * @module supplement-model
 * @description Pure data operations on a FHIR CodeSystem supplement (mutates raw JSON in place)
 */

import { CONFIG } from '../config.js';

export function declaredProperties(raw) {
  return Array.isArray(raw?.property) ? raw.property : [];
}

export function findConcept(raw, code) {
  return (raw?.concept || []).find(c => c.code === code) || null;
}

export function hasConcept(raw, code) {
  return !!findConcept(raw, code);
}

export function addConcept(raw, code, display) {
  if (hasConcept(raw, code)) return findConcept(raw, code);
  if (!Array.isArray(raw.concept)) raw.concept = [];
  const concept = { code, display, property: [], designation: [] };
  raw.concept.push(concept);
  return concept;
}

export function removeConcept(raw, code) {
  if (!Array.isArray(raw.concept)) return;
  raw.concept = raw.concept.filter(c => c.code !== code);
}

export function addProperty(concept, propertyCode, valueString) {
  if (!Array.isArray(concept.property)) concept.property = [];
  concept.property.push({ code: propertyCode, valueString });
}

export function updatePropertyAt(concept, index, valueString) {
  if (!concept.property?.[index]) return;
  concept.property[index].valueString = valueString;
}

export function removePropertyAt(concept, index) {
  if (!Array.isArray(concept.property)) return;
  concept.property.splice(index, 1);
}

export function addDesignation(concept, useCode, value) {
  if (!Array.isArray(concept.designation)) concept.designation = [];
  concept.designation.push({
    use: {
      system: CONFIG.SNOMED.SYSTEM,
      code: useCode,
      display: useCode === CONFIG.SNOMED.USE_PREFERRED ? 'Preferred' : 'Synonym',
    },
    value,
  });
}

export function updateDesignationAt(concept, index, value) {
  if (!concept.designation?.[index]) return;
  concept.designation[index].value = value;
}

export function removeDesignationAt(concept, index) {
  if (!Array.isArray(concept.designation)) return;
  concept.designation.splice(index, 1);
}

export function isConceptValid(concept) {
  const props = (concept.property || []).length;
  const desigs = (concept.designation || []).length;
  return (props + desigs) > 0;
}

/**
 * Resolve the label for a supplement concept:
 *   1. Preferred designation (SNOMED use code 900000000000548007)
 *   2. Source display (looked up by code)
 *   3. concept.display
 *   4. bare code
 */
export function getDisplayLabel(concept, sourceConceptsByCode) {
  const preferred = (concept.designation || []).find(
    d => d?.use?.code === CONFIG.SNOMED.USE_PREFERRED
  );
  if (preferred?.value) return preferred.value;
  const fromSource = sourceConceptsByCode?.[concept.code]?.display;
  if (fromSource) return fromSource;
  if (concept.display) return concept.display;
  return concept.code;
}

export function describeProperty(raw, propertyCode) {
  const decl = declaredProperties(raw).find(p => p.code === propertyCode);
  return decl?.description || '';
}
