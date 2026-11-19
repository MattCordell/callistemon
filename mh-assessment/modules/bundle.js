// Transaction Bundle assembly (SPEC.md section 7.4) and the Encounter (FR-2).
//
// Order: Patient (if new), Encounter, QuestionnaireResponse, then extracted
// resources in definition order. Every entry has a urn:uuid fullUrl and a
// POST request; internal references use the urn:uuid values.

import { DEFINITION } from '../definition/assessment-definition.js';
import { getConfig } from '../config.js';
import { allAnswers, getPatient, getAssessment } from './state.js';
import { lookup } from './terminology.js';
import { patientName } from './fhir-client.js';
import { initialLabel } from './controls.js';
import { coding, concept, blank, uuidFor, toFhirDateTime } from './fhir-codes.js';
import { buildQuestionnaireResponse } from './qr-builder.js';
import { extractField } from './extract.js';

// Builds the Bundle from current form state. Returns
//   { bundle, entries: [{ key, fullUrl, resource, label }], warnings, blockers }
// blockers are reasons the Bundle cannot be POSTed yet.
export async function buildBundle({
  answers = allAnswers(),
  patient = getPatient(),
  assessment = getAssessment()
} = {}) {
  const warnings = [];
  const blockers = [];

  const when = toFhirDateTime(assessment.dateTime);
  if (!when) blockers.push('Enter the assessment date and time.');

  const { labelOf, observableDisplay } = await labelResolver(answers);

  // ---- Patient
  const entries = [];
  let patientRef;
  if (patient?.mode === 'existing') {
    patientRef = { reference: `Patient/${patient.resource.id}`, display: patientName(patient.resource) };
  } else if (patient?.mode === 'new') {
    const resource = newPatient(answers);
    const fullUrl = uuidFor('patient');
    patientRef = { reference: fullUrl };
    if (!resource.name) warnings.push('The new patient has no name.');
    entries.push({ key: 'patient', fullUrl, resource, label: newPatientLabel(resource) });
  } else {
    patientRef = { display: 'No patient selected' };
    blockers.push('Choose or create a patient on the Context tab.');
  }

  const refs = {
    patient: patientRef,
    encounter: { reference: uuidFor('encounter') },
    qr: { reference: uuidFor('qr') }
  };
  const ctx = { answers, patient, refs, when, labelOf, observableDisplay };

  // ---- Extracted resources (built first so the Encounter can list diagnoses)
  const extracted = [];
  for (const def of DEFINITION.fields) {
    const out = extractField(def, answers.get(def.id), ctx);
    warnings.push(...out.warnings);
    for (const e of out.entries) extracted.push({ ...e, fullUrl: uuidFor(e.key) });
  }

  // ---- Encounter
  const encounter = {
    resourceType: 'Encounter',
    status: 'finished',
    class: coding(assessment.encounterClass || DEFINITION.encounter.classDefault),
    subject: refs.patient
  };
  if (when) encounter.period = { start: when };
  const diagnoses = extracted
    .filter(e => e.encounterDiagnosis)
    .map(e => {
      const d = { condition: { reference: e.fullUrl } };
      if (e.encounterDiagnosis.rank != null) d.rank = e.encounterDiagnosis.rank;
      return d;
    });
  if (diagnoses.length) encounter.diagnosis = diagnoses;
  entries.push({
    key: 'encounter', fullUrl: refs.encounter.reference, resource: encounter,
    label: `${encounter.class.display || encounter.class.code}${when ? `, ${assessment.dateTime.replace('T', ' ')}` : ''}`
  });

  // ---- QuestionnaireResponse
  const qr = buildQuestionnaireResponse(ctx);
  const answered = (qr.item || []).reduce((n, g) => n + g.item.length, 0);
  entries.push({
    key: 'qr', fullUrl: refs.qr.reference, resource: qr,
    label: `${answered} answered ${answered === 1 ? 'item' : 'items'}`
  });

  entries.push(...extracted);

  const bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries.map(e => ({
      fullUrl: e.fullUrl,
      resource: e.resource,
      request: { method: 'POST', url: e.resource.resourceType }
    }))
  };
  return { bundle, entries, warnings, blockers };
}

// Field labels as the FHIR layer writes them: the definition label, else the
// AU preferred term of the observable (SPEC.md 5.2). With `answers`, only the
// observables of answered fields are looked up; without, all of them (the
// Questionnaire). Returns { labelOf(def), observableDisplay(def) }.
export async function labelResolver(answers = null) {
  const displays = await observableDisplays(answers);
  const observableDisplay = def => displays.get(def.observable?.code) || def.observable?.display || '';
  const labelOf = def => def.label || (def.observable ? observableDisplay(def) : '') || initialLabel(def);
  return { labelOf, observableDisplay };
}

// AU preferred terms of SNOMED CT observables. $lookup results are cached;
// a failed lookup falls back to the definition display.
async function observableDisplays(answers) {
  const cfg = getConfig();
  // Columns count as answered when their repeating group is.
  const defs = DEFINITION.fields.flatMap(f => [f, ...(f.columns || [])].map(def => ({ def, fieldId: f.id })));
  const codes = new Set(defs
    .filter(({ def }) => def.observable && (def.observable.system || cfg.SNOMED_SYSTEM) === cfg.SNOMED_SYSTEM)
    .filter(({ fieldId }) => !answers || !blank(answers.get(fieldId)))
    .map(({ def }) => def.observable.code));
  const out = new Map();
  await Promise.all([...codes].map(async code => {
    try {
      const res = await lookup(code);
      if (res.display) out.set(code, res.display);
    } catch {
      // Keep the definition display.
    }
  }));
  return out;
}

// A new Patient from the fields with output "patient" (FR-1).
function newPatient(answers) {
  const byElement = {};
  for (const f of DEFINITION.fields.filter(x => x.output === 'patient')) {
    const v = answers.get(f.id);
    if (!blank(v)) byElement[f.patientElement] = v;
  }
  const p = { resourceType: 'Patient' };
  const family = (byElement['name.family'] || '').trim();
  const given = (byElement['name.given'] || '').trim();
  if (family || given) {
    const name = { use: 'official' };
    if (family) name.family = family;
    if (given) name.given = [given];
    p.name = [name];
  }
  if (byElement.gender?.code) p.gender = byElement.gender.code;
  if (byElement.birthDate) p.birthDate = byElement.birthDate;
  if (byElement.maritalStatus?.code) p.maritalStatus = concept(byElement.maritalStatus);
  return p;
}

function newPatientLabel(p) {
  return p.name ? `New patient: ${patientName(p)}` : 'New patient (no name)';
}
