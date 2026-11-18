// In-memory form state (SPEC.md section 4, step 2): answers keyed by field id.
//
// Value shapes:
//   coded single     { system, code, display }
//   coded multiple   [{ system, code, display }, ...]
//   text, date       string
//   integer          number
//   boolean          true or false
//   repeating group  [{ _seed?, [columnId]: value, ... }, ...]
//
// An empty value removes the key, so "nothing selected" means "nothing recorded"
// (SPEC.md section 5.4).

import { DEFINITION } from '../definition/assessment-definition.js';

const answers = new Map();
let patient = null;            // { mode: 'existing', resource } | { mode: 'new' } | null
const listeners = new Set();

export function getAnswer(id) {
  return answers.get(id);
}

export function setAnswer(id, value) {
  if (isEmpty(value)) answers.delete(id);
  else answers.set(id, value);
  notify({ type: 'answer', id });
}

export function getPatient() {
  return patient;
}

export function setPatient(next) {
  patient = next;
  notify({ type: 'patient' });
}

export function allAnswers() {
  return new Map(answers);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(change) {
  listeners.forEach(fn => fn(change));
}

export function isEmpty(value) {
  if (value == null || value === '') return true;
  if (typeof value === 'number') return Number.isNaN(value);
  if (Array.isArray(value)) return value.every(isEmpty);
  if (typeof value === 'object' && !('code' in value)) {
    // A repeating-group row: empty if every column is empty. `_seed` is a label, not a value.
    return Object.entries(value).every(([k, v]) => k === '_seed' || isEmpty(v));
  }
  return false;
}

// Number of fields on a tab that hold a value (FR-3 completion indicator).
export function countForTab(tabId) {
  let n = 0;
  for (const field of DEFINITION.fields) {
    if (field.tab !== tabId) continue;
    // Patient fields only count for a new patient; an existing one counts once below.
    if (field.output === 'patient' && patient?.mode !== 'new') continue;
    if (answers.has(field.id)) n++;
  }
  if (tabId === 'context' && patient?.mode === 'existing') n++;
  return n;
}
