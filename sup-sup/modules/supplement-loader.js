/**
 * @module supplement-loader
 * @description Load and save FHIR CodeSystem supplements from/to local files
 */

export async function loadSupplementFromFile(file) {
  const text = await file.text();
  const json = JSON.parse(stripBom(text));
  validateSupplement(json);
  return { raw: json, sourceFilename: file.name };
}

function stripBom(s) {
  return s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

export function saveSupplementToFile(raw, suggestedFilename) {
  const json = JSON.stringify(raw, null, 2);
  const blob = new Blob([json], { type: 'application/fhir+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedFilename || (raw.id ? raw.id + '.json' : 'supplement.json');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validateSupplement(json) {
  if (!json || typeof json !== 'object') throw new Error('Supplement file is not valid JSON');
  if (json.resourceType !== 'CodeSystem') {
    throw new Error(`Expected CodeSystem, got ${json.resourceType}`);
  }
  if (json.content !== 'supplement') {
    throw new Error(`Expected CodeSystem.content = "supplement", got "${json.content}"`);
  }
  if (!Array.isArray(json.property)) json.property = [];
  if (!Array.isArray(json.concept)) json.concept = [];
}
