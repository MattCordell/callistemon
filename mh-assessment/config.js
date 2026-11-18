// Runtime configuration. Defaults live here; the Settings panel stores
// overrides in localStorage. No terminology content belongs in this file.

export const DEFAULTS = Object.freeze({
  FHIR_BASE: 'https://server.callistemon.site/fhir',
  TX_BASE: 'https://tx.ontoserver.csiro.au/fhir',
  SNOMED_SYSTEM: 'http://snomed.info/sct',
  // SNOMED CT-AU edition, no version suffix, so the latest release is used.
  SNOMED_EDITION: 'http://snomed.info/sct/32506021000036107',
  DISPLAY_LANGUAGE: 'en-AU',
  FETCH_TIMEOUT_MS: 30000,
  CONCURRENCY: 4,          // parallel terminology requests in the Binding Review
  LARGE_EXPANSION: 500,    // warn when an expansion is larger than this
  PREVIEW_COUNT: 10,       // members shown per field in the Binding Review
  // Form: automatic control choice (SPEC.md section 5.4).
  AUTO_CHIPS_MAX: 12,      // this many concepts or fewer: chips
  AUTO_DROPDOWN_MAX: 60,   // this many or fewer: dropdown; more: typeahead
  // Typeahead
  TYPEAHEAD_COUNT: 20,
  TYPEAHEAD_DEBOUNCE_MS: 250,
  TYPEAHEAD_MIN_CHARS: 2,
  TYPEAHEAD_BROWSE_MAX: 100, // value sets this small list all members on focus
  PATIENT_SEARCH_COUNT: 20
});

// Only these keys can be changed from the Settings panel.
export const EDITABLE_KEYS = ['FHIR_BASE', 'TX_BASE', 'SNOMED_EDITION'];

const STORAGE_KEY = 'mh-assessment.config';
const listeners = new Set();

function readOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeOverrides(overrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage blocked: the change still applies for this page load.
  }
}

let overrides = readOverrides();

export function getConfig() {
  return { ...DEFAULTS, ...overrides };
}

export function setConfig(partial) {
  const next = { ...overrides };
  for (const key of EDITABLE_KEYS) {
    if (!(key in partial)) continue;
    const value = String(partial[key] ?? '').trim().replace(/\/+$/, '');
    if (!value || value === DEFAULTS[key]) delete next[key];
    else next[key] = value;
  }
  const changed = JSON.stringify(sorted(next)) !== JSON.stringify(sorted(overrides));
  overrides = next;
  writeOverrides(overrides);
  if (changed) notify();
}

export function resetConfig() {
  const changed = Object.keys(overrides).length > 0;
  overrides = {};
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  if (changed) notify();
}

function sorted(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

export function onConfigChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  const cfg = getConfig();
  listeners.forEach(fn => fn(cfg));
}
