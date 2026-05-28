// modules/state.js — Shared mutable application state.
//
// Imported as a leaf module by anything that needs read or write access to
// state shared across modules. Keep this small — module-private state stays
// inside the module that owns it.

export const state = {
  // FHIR server base URL — set during boot, mutated when the user applies a preset.
  FHIR_BASE: '',
  // Patient interaction
  ptMode: 'search',
  currentPatientResource: null,
  patientAddress: null,
  patientSourceServer: null,
  // Reason coding
  reasonTags: [],
  notesAnchor: 0,
  // Test selection
  selectedTests: [],
  // The currently-selected pathology provider supplement URL (or null).
  activeProviderSupplement: null,
  // Bundle
  lastRequisitionId: null,
  // JSON viewer instance, set during boot.
  viewer: null,
};
