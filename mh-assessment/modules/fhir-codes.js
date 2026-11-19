// Small helpers shared by the FHIR builders (SPEC.md section 7.1).

import { getConfig } from '../config.js';
import { isEmpty } from './state.js';

// A FHIR Coding. SNOMED CT codings carry the AU edition as the version, so the
// edition is explicit. Other systems are passed through.
export function coding(c) {
  const cfg = getConfig();
  const out = { system: c.system || cfg.SNOMED_SYSTEM };
  if (out.system === cfg.SNOMED_SYSTEM) out.version = cfg.SNOMED_EDITION;
  out.code = c.code;
  if (c.display) out.display = c.display;
  return out;
}

// A CodeableConcept with one coding. text defaults to the coding's display.
export function concept(c, text = c.display) {
  const out = { coding: [coding(c)] };
  if (text) out.text = text;
  return out;
}

// A CodeableConcept for a status or category: coding only, no text.
export function statusConcept(c) {
  return { coding: [coding(c)] };
}

// True when a value holds nothing worth recording. Whitespace-only text counts
// as empty, as does anything state.isEmpty treats as empty.
export function blank(value) {
  if (typeof value === 'string') return value.trim() === '';
  return isEmpty(value);
}

// Stable urn:uuid values keyed by a builder key, so the live preview does not
// change ids on every keystroke. Reset after a successful POST.
const uuids = new Map();

export function uuidFor(key) {
  if (!uuids.has(key)) uuids.set(key, `urn:uuid:${crypto.randomUUID()}`);
  return uuids.get(key);
}

export function resetUuids() {
  uuids.clear();
}

// "2026-11-19T09:30" (local, from a datetime-local input) -> FHIR dateTime
// with the browser's time zone offset, for example "2026-11-19T09:30:00+10:00".
// Returns null when the input is not a valid date and time.
export function toFhirDateTime(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(d.getTime())) return null;
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}
