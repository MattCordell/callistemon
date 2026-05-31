// modules/patient-history-tool.js — Feature C: agent-initiated patient-history query tool.
//
// Gives the decision-support agent a read-only window onto the patient's FHIR
// record beyond the pre-fetched prior ServiceRequests (issue #25). The agent
// decides, per rule, what to pull (e.g. "don't repeat HbA1c resulted in the last
// 3 months" -> recent Observations / DiagnosticReports). Deliberately a thin
// local function rather than an MCP server: it reuses the existing authed
// fetch monkey-patch (server.js) and works in headless/automated contexts where
// interactively-authed MCP servers may be absent.
//
// Guardrails (all enforced HERE, ignoring anything the model claims):
//   - read-only (GET only)
//   - resourceType allow-list
//   - every query scoped to subject=Patient/{id} — the model cannot widen it
//   - _count capped
//   - a per-evaluation query budget (the factory closes over a call counter)
// Every query is logged via setDebugUrl so it shows in the debug panel (spec §C.12).

import { state } from './state.js';
import { setDebugUrl } from './utils.js';

// Resource types the agent may read. Chosen for the history-dependent rules in
// issue #25 (Observations/DiagnosticReports for recent results, Conditions for
// documented indications, MedicationRequests for drug interactions) plus
// ServiceRequest so the agent can filter prior orders by code/date itself.
const ALLOWED_TYPES = new Set([
  'Observation', 'Condition', 'MedicationRequest', 'DiagnosticReport', 'ServiceRequest',
]);

// Hard cap on _count regardless of what the model asks for.
const MAX_COUNT = 20;

// Per-evaluation ceiling on the number of history queries the agent may make.
// Bounds prompt size / latency / cost of agent-initiated fetching (issue #25).
// Exported so the decision-support agent's maxIterations can be derived from it —
// the iteration cap must leave room for this many queries plus the final answer,
// or the history capability is stranded (see ai-decision-support.js).
export const QUERY_BUDGET = 6;

// Per-resource clinical date search parameter for the optional `dateFrom` filter.
// Falls back to the universal `_lastUpdated` if the server rejects the clinical
// param (mirrors the prior-requests -authored -> -_lastUpdated fallback).
const DATE_PARAM = {
  Observation: 'date',
  DiagnosticReport: 'date',
  Condition: 'recorded-date',
  MedicationRequest: 'authoredon',
  ServiceRequest: 'authored',
};

/** OpenAI-format tool descriptor advertised to the model (Feature C only). */
export function getHistoryTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'query_patient_history',
        description: 'Read the current patient\'s FHIR history to evaluate a history-dependent rule '
          + '(e.g. avoid repeating a test resulted recently, check for a documented indication, or a '
          + 'relevant medication). Read-only and automatically scoped to THIS patient — you cannot query '
          + 'another patient. Returns a compact summarised list, not raw FHIR. Use it only when a rule you '
          + 'are applying needs data not already in the provided context; there is a small per-evaluation '
          + 'query budget, so be selective.',
        parameters: {
          type: 'object',
          properties: {
            resourceType: {
              type: 'string',
              enum: Array.from(ALLOWED_TYPES),
              description: 'FHIR resource type to read.',
            },
            code: {
              type: 'string',
              description: 'Optional code token to filter to a specific test/finding/medication, '
                + 'e.g. "http://snomed.info/sct|43396009" or a bare code.',
            },
            category: {
              type: 'string',
              description: 'Optional category token, e.g. "laboratory" for Observations.',
            },
            dateFrom: {
              type: 'string',
              description: 'Optional ISO date (YYYY-MM-DD); returns only records on/after this date.',
            },
            count: {
              type: 'integer',
              description: 'Max results (default ' + MAX_COUNT + ', hard cap ' + MAX_COUNT + ').',
            },
          },
          required: ['resourceType'],
        },
      },
    },
  ];
}

/**
 * Build the toolImpl for query_patient_history, scoped to one patient for the
 * duration of one decision-support evaluation. The returned function closes over
 * a private call counter implementing the per-evaluation query budget.
 * @param {object} opts
 * @param {string} opts.patientId — server id of the current patient.
 * @returns {(args:object) => Promise<object>}
 */
export function makeHistoryToolImpl({ patientId } = {}) {
  const id = String(patientId || '').trim();
  let used = 0;

  return async function queryPatientHistory(args) {
    args = args || {};

    if (!id) return { error: 'No patient resolved; patient history is unavailable.' };
    if (!state.FHIR_BASE) return { error: 'No FHIR server configured.' };

    const resourceType = String(args.resourceType || '').trim();
    if (!ALLOWED_TYPES.has(resourceType)) {
      return { error: 'resourceType not allowed. Allowed types: ' + Array.from(ALLOWED_TYPES).join(', ') + '.' };
    }

    if (used >= QUERY_BUDGET) {
      return { error: 'Patient-history query budget exhausted (max ' + QUERY_BUDGET + ' per evaluation).' };
    }
    used++;

    try {
      // Primary attempt uses the per-resource clinical date param; on a 4xx
      // (param unsupported/unindexed) retry once with the universal _lastUpdated.
      let resp = await runQuery(resourceType, id, args, false);
      if (resp && !resp.ok && resp.status >= 400 && resp.status < 500 && args.dateFrom) {
        resp = await runQuery(resourceType, id, args, true);
      }
      if (!resp || !resp.ok) {
        return { error: 'FHIR query failed (status ' + (resp ? resp.status : 'network') + ').' };
      }

      let bundle;
      try { bundle = await resp.json(); } catch (_e) { return { error: 'Could not parse FHIR response.' }; }

      const entries = Array.isArray(bundle && bundle.entry) ? bundle.entry : [];
      const records = [];
      for (const e of entries) {
        const res = e && e.resource;
        if (!res || res.resourceType !== resourceType) continue;
        records.push(summarise(resourceType, res));
      }
      return { resourceType, count: records.length, records };
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      return { error: String((e && e.message) || e) };
    }
  };
}

// ----- query construction -----

function runQuery(resourceType, patientId, args, useLastUpdated) {
  const url = new URL(state.FHIR_BASE.replace(/\/+$/, '') + '/' + resourceType);
  // Patient scope is fixed here — never taken from model args.
  url.searchParams.set('subject', 'Patient/' + patientId);

  if (args.code) url.searchParams.set('code', String(args.code));
  if (args.category) url.searchParams.set('category', String(args.category));

  if (args.dateFrom) {
    const param = useLastUpdated ? '_lastUpdated' : (DATE_PARAM[resourceType] || '_lastUpdated');
    url.searchParams.set(param, 'ge' + String(args.dateFrom));
  }

  url.searchParams.set('_count', String(clampCount(args.count)));
  setDebugUrl(url.toString());
  return fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
}

function clampCount(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v) || v <= 0) return MAX_COUNT;
  return Math.min(v, MAX_COUNT);
}

// ----- summarisers (compact, to limit prompt size / cost) -----

function firstCoding(cc) {
  return (cc && Array.isArray(cc.coding) && cc.coding[0]) || null;
}

function codeDisplay(cc) {
  const c = firstCoding(cc);
  return {
    code: c ? (c.code || null) : null,
    display: (c && c.display) || (cc && cc.text) || null,
  };
}

function summarise(resourceType, res) {
  switch (resourceType) {
    case 'Observation': return summariseObservation(res);
    case 'DiagnosticReport': return summariseDiagnosticReport(res);
    case 'Condition': return summariseCondition(res);
    case 'MedicationRequest': return summariseMedicationRequest(res);
    case 'ServiceRequest': return summariseServiceRequest(res);
    default: return { code: null, display: null };
  }
}

function summariseObservation(res) {
  const cd = codeDisplay(res.code);
  return {
    code: cd.code, display: cd.display, value: observationValue(res), status: res.status || null,
    effective: res.effectiveDateTime || (res.effectivePeriod && res.effectivePeriod.start) || null,
  };
}

// Observation.value[x] — cover the common types. A null value can mislead a
// history-dependent rule into thinking a result is missing (e.g. a boolean
// positive/negative or an integer count), so handle boolean/integer/ratio too,
// not just quantity/codeable/string. `!= null` keeps falsy-but-present values
// (false, 0).
function observationValue(res) {
  if (res.valueQuantity) {
    return { value: res.valueQuantity.value, unit: res.valueQuantity.unit || res.valueQuantity.code || null };
  }
  if (res.valueCodeableConcept) return codeDisplay(res.valueCodeableConcept).display;
  if (res.valueString != null) return String(res.valueString);
  if (res.valueBoolean != null) return res.valueBoolean;
  if (res.valueInteger != null) return res.valueInteger;
  if (res.valueRatio) {
    const num = res.valueRatio.numerator && res.valueRatio.numerator.value;
    const den = res.valueRatio.denominator && res.valueRatio.denominator.value;
    if (num != null && den != null) return num + ':' + den;
  }
  if (res.valueDateTime != null) return String(res.valueDateTime);
  return null;
}

function summariseDiagnosticReport(res) {
  const cd = codeDisplay(res.code);
  return {
    code: cd.code, display: cd.display, status: res.status || null,
    effective: res.effectiveDateTime || (res.effectivePeriod && res.effectivePeriod.start) || null,
  };
}

function summariseCondition(res) {
  const cd = codeDisplay(res.code);
  const cs = firstCoding(res.clinicalStatus);
  return {
    code: cd.code, display: cd.display,
    clinicalStatus: cs ? (cs.code || null) : null,
    onset: res.onsetDateTime || res.recordedDate || null,
  };
}

function summariseMedicationRequest(res) {
  let medication = null;
  if (res.medicationCodeableConcept) medication = codeDisplay(res.medicationCodeableConcept).display;
  else if (res.medicationReference) medication = res.medicationReference.display || null;
  return {
    medication, status: res.status || null, authoredOn: res.authoredOn || null,
  };
}

function summariseServiceRequest(res) {
  const cd = codeDisplay(res.code);
  return {
    code: cd.code, display: cd.display, status: res.status || null, authoredOn: res.authoredOn || null,
  };
}
