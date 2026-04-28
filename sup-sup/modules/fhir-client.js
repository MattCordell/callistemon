/**
 * @module fhir-client
 * @description Minimal FHIR HTTP helper with FHIR JSON Accept header
 */

export async function fetchFhirJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/fhir+json' } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data, text };
}

export async function fhirGET(url) {
  const { ok, status, data, text } = await fetchFhirJson(url);
  if (!ok) {
    throw new Error(`FHIR GET ${url} -> ${status}${text ? ': ' + text.slice(0, 300) : ''}`);
  }
  return data;
}
