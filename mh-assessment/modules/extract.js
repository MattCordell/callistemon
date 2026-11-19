// Resource extraction (SPEC.md sections 7.2 and 7.3, Appendix A).
//
// Each extractor takes a field definition, its answer and the build context,
// and returns { entries, warnings }. An entry is { key, resource, label },
// where key is stable for the preview and becomes the entry's urn:uuid.
// An empty answer returns no entries: nothing selected means nothing recorded.
//
// Context (built in bundle.js):
//   ctx.refs        { patient, encounter, qr } References
//   ctx.when        assessment date and time (FHIR dateTime)
//   ctx.labelOf(def)            field label (definition label or AU PT of the observable)
//   ctx.observableDisplay(def)  AU PT of the observable

import { FHIR_CODES } from '../definition/assessment-definition.js';
import { codingsIn } from './controls.js';
import { coding, concept, statusConcept, blank } from './fhir-codes.js';

const EXTRACTORS = {
  'observation-qa': observationQa,
  'observation-score': observationScore,
  'smoking-status': smokingStatus,
  'condition': conditions,
  'family-history': familyHistory,
  'medication-statement': medicationStatements,
  'allergy': allergies,
  'substance-use': substanceUse
};

// Runs the extractor for one field. Fields with output "patient" or "qr-only"
// (and any unknown output) produce no resources here.
export function extractField(def, value, ctx) {
  const fn = EXTRACTORS[def.output];
  if (!fn || blank(value)) return { entries: [], warnings: [] };
  return fn(def, value, ctx);
}

// ---------------------------------------------------------------- helpers

const result = (entries = [], warnings = []) => ({ entries, warnings });

// Observation.code: the observable, with the field label as text. Fields with
// no observable yet get a text-only code (agreed with Matt, session 3).
function observableConcept(def, ctx) {
  const text = ctx.labelOf(def);
  if (!def.observable) return { text };
  return concept({ ...def.observable, display: ctx.observableDisplay(def) }, text);
}

function categoryConcept(code) {
  return { coding: [{ system: FHIR_CODES.observationCategory, code }] };
}

function observation(def, ctx) {
  const obs = { resourceType: 'Observation', status: 'final' };
  if (def.category) obs.category = [categoryConcept(def.category)];
  obs.code = observableConcept(def, ctx);
  obs.subject = ctx.refs.patient;
  obs.encounter = ctx.refs.encounter;
  if (ctx.when) obs.effectiveDateTime = ctx.when;
  return obs;
}

function withDerivedFrom(obs, ctx) {
  obs.derivedFrom = [ctx.refs.qr];
  return obs;
}

// Columns of a repeating group, keyed by role.
function columnsByRole(def) {
  return Object.fromEntries((def.columns || []).filter(c => c.role).map(c => [c.role, c]));
}

// The non-empty rows of a group answer, with their 1-based row number.
function rowsOf(value) {
  return (Array.isArray(value) ? value : [])
    .map((row, i) => ({ row, n: i + 1 }))
    .filter(({ row }) => !blank(row));
}

const codingOf = (row, col) => (col && row[col.id] && row[col.id].code ? row[col.id] : null);
const lower = s => (s || '').toLowerCase();

function missing(def, n, col, resourceType) {
  return `${def.label || def.id}, row ${n}: no ${lower(col?.label || 'value')} chosen, so no ${resourceType} is created.`;
}

// ---------------------------------------------------------------- Observations

// 7.2 option A: code = observable, value = finding. One Observation per
// selected finding, each with the same code.
function observationQa(def, value, ctx) {
  const label = ctx.labelOf(def);
  const entries = codingsIn(value).map(c => {
    const obs = observation(def, ctx);
    obs.valueCodeableConcept = concept(c);
    return {
      key: `${def.id}|${c.system}|${c.code}`,
      resource: withDerivedFrom(obs, ctx),
      label: `${label}: ${c.display}`
    };
  });
  return result(entries);
}

function observationScore(def, value, ctx) {
  if (typeof value !== 'number') return result();
  const obs = observation(def, ctx);
  obs.valueInteger = value;
  return result([{ key: def.id, resource: withDerivedFrom(obs, ctx), label: `${ctx.labelOf(def)}: ${value}` }]);
}

// AU Core Smoking Status shape: LOINC code from the definition, value from the binding.
function smokingStatus(def, value, ctx) {
  const c = codingsIn(value)[0];
  if (!c) return result();
  const obs = observation(def, ctx);
  obs.valueCodeableConcept = concept(c);
  return result([{ key: def.id, resource: withDerivedFrom(obs, ctx), label: `${ctx.labelOf(def)}: ${c.display}` }]);
}

// ---------------------------------------------------------------- Condition

function conditionResource(def, code, { clinicalStatus, verificationStatus }, ctx) {
  const cond = { resourceType: 'Condition' };
  if (clinicalStatus) cond.clinicalStatus = statusConcept(clinicalStatus);
  if (verificationStatus) cond.verificationStatus = statusConcept(verificationStatus);
  if (def.conditionCategory) cond.category = [statusConcept(def.conditionCategory)];
  cond.code = concept(code);
  cond.subject = ctx.refs.patient;
  cond.encounter = ctx.refs.encounter;
  if (ctx.when) cond.recordedDate = ctx.when;
  return cond;
}

// A Condition per selected concept (multi-select fields) or per row (groups).
// Row status columns override the field defaults. Rows with a rank column are
// flagged for Encounter.diagnosis.
function conditions(def, value, ctx) {
  const label = ctx.labelOf(def);
  if (def.control !== 'repeating-group') {
    const entries = codingsIn(value).map(c => ({
      key: `${def.id}|${c.system}|${c.code}`,
      resource: conditionResource(def, c, {
        clinicalStatus: def.clinicalStatus, verificationStatus: def.verificationStatus
      }, ctx),
      label: `${label}: ${c.display}`
    }));
    return result(entries);
  }

  const cols = columnsByRole(def);
  const entries = [];
  const warnings = [];
  for (const { row, n } of rowsOf(value)) {
    const code = codingOf(row, cols.code);
    if (!code) {
      warnings.push(missing(def, n, cols.code, 'Condition'));
      continue;
    }
    const entry = {
      key: `${def.id}#${n}`,
      resource: conditionResource(def, code, {
        clinicalStatus: codingOf(row, cols.clinicalStatus) || def.clinicalStatus,
        verificationStatus: codingOf(row, cols.verificationStatus) || def.verificationStatus
      }, ctx),
      label: `${label}: ${code.display}`
    };
    if (cols.rank) {
      const chosen = codingOf(row, cols.rank);
      const option = chosen && (cols.rank.options || []).find(o => o.code === chosen.code && o.system === chosen.system);
      entry.encounterDiagnosis = { rank: option?.encounterRank ?? null };
      if (chosen) entry.label += ` (${lower(chosen.display)})`;
    }
    entries.push(entry);
  }
  return result(entries, warnings);
}

// ---------------------------------------------------------------- FamilyMemberHistory

// R4 FamilyMemberHistory has no encounter element, so none is set.
function familyHistory(def, value, ctx) {
  const cols = columnsByRole(def);
  const entries = [];
  const warnings = [];
  for (const { row, n } of rowsOf(value)) {
    const relationship = codingOf(row, cols.relationship);
    const code = codingOf(row, cols.code);
    if (!relationship || !code) {
      warnings.push(missing(def, n, relationship ? cols.code : cols.relationship, 'FamilyMemberHistory'));
      continue;
    }
    const condition = { code: concept(code) };
    const age = cols.onsetAge ? row[cols.onsetAge.id] : null;
    if (typeof age === 'number') {
      const unit = FHIR_CODES.ageYears;
      condition.onsetAge = { value: age, unit: unit.unit, system: unit.system, code: unit.code };
    }
    const fmh = {
      resourceType: 'FamilyMemberHistory',
      status: 'completed',
      patient: ctx.refs.patient
    };
    if (ctx.when) fmh.date = ctx.when;
    fmh.relationship = concept(relationship);
    fmh.condition = [condition];
    entries.push({ key: `${def.id}#${n}`, resource: fmh, label: `${relationship.display}: ${code.display}` });
  }
  return result(entries, warnings);
}

// ---------------------------------------------------------------- MedicationStatement

// AU Core MedicationStatement shape. effectiveDateTime is the assessment time:
// the medication is current at the assessment.
function medicationStatements(def, value, ctx) {
  const cols = columnsByRole(def);
  const entries = [];
  const warnings = [];
  for (const { row, n } of rowsOf(value)) {
    const med = codingOf(row, cols.code);
    if (!med) {
      warnings.push(missing(def, n, cols.code, 'MedicationStatement'));
      continue;
    }
    const ms = {
      resourceType: 'MedicationStatement',
      status: 'active',
      medicationCodeableConcept: concept(med),
      subject: ctx.refs.patient,
      context: ctx.refs.encounter
    };
    if (ctx.when) {
      ms.effectiveDateTime = ctx.when;
      ms.dateAsserted = ctx.when;
    }
    const dosage = cols.dosage ? row[cols.dosage.id] : null;
    if (!blank(dosage)) ms.dosage = [{ text: String(dosage).trim() }];
    entries.push({ key: `${def.id}#${n}`, resource: ms, label: med.display });
  }
  return result(entries, warnings);
}

// ---------------------------------------------------------------- AllergyIntolerance

// AU Core AllergyIntolerance shape. Clinical status comes from the definition.
function allergies(def, value, ctx) {
  const cols = columnsByRole(def);
  const entries = [];
  const warnings = [];
  for (const { row, n } of rowsOf(value)) {
    const substance = codingOf(row, cols.code);
    if (!substance) {
      warnings.push(missing(def, n, cols.code, 'AllergyIntolerance'));
      continue;
    }
    const ai = { resourceType: 'AllergyIntolerance' };
    if (def.clinicalStatus) ai.clinicalStatus = statusConcept(def.clinicalStatus);
    const verification = codingOf(row, cols.verificationStatus);
    if (verification) ai.verificationStatus = statusConcept(verification);
    ai.code = concept(substance);
    ai.patient = ctx.refs.patient;
    ai.encounter = ctx.refs.encounter;
    if (ctx.when) ai.recordedDate = ctx.when;
    const reaction = codingOf(row, cols.reaction);
    if (reaction) ai.reaction = [{ manifestation: [concept(reaction)] }];
    entries.push({
      key: `${def.id}#${n}`, resource: ai,
      label: `${substance.display}${reaction ? ` (${lower(reaction.display)})` : ''}`
    });
  }
  return result(entries, warnings);
}

// ---------------------------------------------------------------- substance use

// The substance-use pattern (SPEC.md 7.3), kept in this one function so it is
// easy to change once it is settled against the AUCDI Substance use summary.
// One Observation per row: code = substance use observable, value = use status,
// and one component whose code is the local "substance" code and whose value
// is the SNOMED CT substance. A row needs both a substance and a status.
function substanceUse(def, value, ctx) {
  const cols = columnsByRole(def);
  const entries = [];
  const warnings = [];
  for (const { row, n } of rowsOf(value)) {
    const substance = codingOf(row, cols.substance);
    const status = codingOf(row, cols.status);
    if (!substance || !status) {
      const label = row._seed ? `${def.label || def.id}, row ${n} (${row._seed})` : `${def.label || def.id}, row ${n}`;
      const what = substance ? cols.status : cols.substance;
      warnings.push(`${label}: no ${lower(what?.label || 'value')} chosen, so no Observation is created.`);
      continue;
    }
    const obs = observation(def, ctx);
    obs.valueCodeableConcept = concept(status);
    obs.component = [{
      code: { coding: [coding(def.componentCode)], text: def.componentCode.display },
      valueCodeableConcept: concept(substance)
    }];
    entries.push({
      key: `${def.id}#${n}`,
      resource: withDerivedFrom(obs, ctx),
      label: `${substance.display}: ${status.display}`
    });
  }
  return result(entries, warnings);
}
