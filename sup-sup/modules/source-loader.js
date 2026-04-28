/**
 * @module source-loader
 * @description Load a source CodeSystem or ValueSet from file or terminology server
 */

import { expandValueSet, fetchCodeSystem, normaliseCodeSystem, normaliseValueSet } from './terminology.js';

export async function loadSourceFromFile(file) {
  const text = await file.text();
  const json = JSON.parse(stripBom(text));
  return normaliseAnyResource(json);
}

function stripBom(s) {
  return s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

export async function loadSourceFromTS(txBase, canonicalUrl) {
  const trimmed = canonicalUrl.trim();
  const isValueSet = /\?fhir_vs=|\/ValueSet[\/\?]|ValueSet\/\$expand/i.test(trimmed);
  const isCodeSystem = /\/CodeSystem[\/\?]/i.test(trimmed);
  if (isCodeSystem && !isValueSet) {
    return fetchCodeSystem(txBase, trimmed);
  }
  return expandValueSet(txBase, trimmed);
}

function normaliseAnyResource(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Source file is not valid JSON');
  }
  const rt = json.resourceType;
  if (rt === 'CodeSystem') {
    const norm = normaliseCodeSystem(json);
    return { ...norm, resourceType: 'CodeSystem' };
  }
  if (rt === 'ValueSet') {
    if (!json.expansion?.contains?.length) {
      throw new Error('ValueSet has no expansion. Load via terminology server, or supply a pre-expanded ValueSet.');
    }
    const norm = normaliseValueSet(json);
    return { ...norm, resourceType: 'ValueSet' };
  }
  throw new Error(`Unsupported resource type: ${rt}. Expected CodeSystem or expanded ValueSet.`);
}
