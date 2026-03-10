/**
 * @module report-builder
 * @description Builds FHIR transaction Bundles for submitting DiagnosticReport + Observations.
 *
 * Constructs AU-compliant resources:
 * - DiagnosticReport (au-pathologyreport profile)
 * - Observations (au-core-diagnosticresult-path profile)
 * - Task status updates (completed, results-available)
 */

import { CONFIG } from '../config.js';
import { flatObservables } from './test-definitions.js';

/**
 * Build a FHIR transaction Bundle for submitting lab results.
 *
 * @param {Map<string, number>} formData - Map of loincCode -> numeric value
 * @param {Object} context
 * @param {Object} context.entry - BacklogEntry (from backlog-engine)
 * @param {Object} context.patient - Patient resource
 * @param {Object} context.orgRef - Organization reference { reference, display }
 * @param {Object|null} context.groupTask - Group Task resource (if any)
 * @param {boolean} context.allSiblingsComplete - Whether all sibling tasks will be done after this
 * @returns {Object} FHIR transaction Bundle
 */
export function buildTransactionBundle(formData, context) {
  const { entry, patient, orgRef } = context;
  const now = new Date().toISOString();
  const patientRef = { reference: `Patient/${patient.id}` };
  const performerRef = orgRef.reference
    ? { reference: orgRef.reference, display: orgRef.display }
    : { identifier: orgRef.identifier, display: orgRef.display };

  const txEntries = [];
  const observationRefs = [];

  // Collect all observables across headings (already deduped for super sets)
  const allObservables = entry.headings.flatMap(h => h.observables);

  // 1. Create individual Observations for each filled field
  for (const obs of allObservables) {
    const value = formData.get(obs.loincCode);
    if (value == null || isNaN(value)) continue;

    const obsUuid = `urn:uuid:${crypto.randomUUID()}`;

    const observation = {
      resourceType: 'Observation',
      meta: {
        profile: [CONFIG.PROFILES.pathologyResult]
      },
      status: 'final',
      category: [{
        coding: [CONFIG.CATEGORY.laboratory]
      }],
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: obs.loincCode,
          display: obs.loincDisplay
        }],
        text: obs.display
      },
      subject: patientRef,
      effectiveDateTime: now,
      performer: [performerRef],
      valueQuantity: {
        value: round(value, obs.decimalPlaces),
        unit: obs.unit,
        system: 'http://unitsofmeasure.org',
        code: obs.ucumCode
      }
    };

    // Add reference range if defined
    if (obs.referenceRange && (obs.referenceRange.low != null || obs.referenceRange.high != null)) {
      const range = {};
      if (obs.referenceRange.low != null) {
        range.low = {
          value: obs.referenceRange.low,
          unit: obs.unit,
          system: 'http://unitsofmeasure.org',
          code: obs.ucumCode
        };
      }
      if (obs.referenceRange.high != null) {
        range.high = {
          value: obs.referenceRange.high,
          unit: obs.unit,
          system: 'http://unitsofmeasure.org',
          code: obs.ucumCode
        };
      }
      observation.referenceRange = [range];
    }

    txEntries.push({
      fullUrl: obsUuid,
      resource: observation,
      request: { method: 'POST', url: 'Observation' }
    });

    observationRefs.push({ reference: obsUuid });
  }

  // 2. Create DiagnosticReport
  const drUuid = `urn:uuid:${crypto.randomUUID()}`;
  const diagnosticReport = {
    resourceType: 'DiagnosticReport',
    meta: {
      profile: [CONFIG.PROFILES.pathologyReport]
    },
    status: 'final',
    category: [{
      coding: [CONFIG.CATEGORY.diagnosticServiceLab]
    }],
    code: {
      coding: [{
        system: entry.code.system,
        code: entry.code.code,
        display: entry.code.display
      }],
      text: entry.code.displayName
    },
    subject: patientRef,
    effectiveDateTime: now,
    issued: now,
    performer: [performerRef],
    basedOn: entry.serviceRequests.map(sr => ({
      reference: `ServiceRequest/${sr.id}`
    })),
    result: observationRefs
  };

  txEntries.push({
    fullUrl: drUuid,
    resource: diagnosticReport,
    request: { method: 'POST', url: 'DiagnosticReport' }
  });

  // 3. Task updates — mark each diagnostic task as completed
  for (const task of entry.tasks) {
    const updatedTask = structuredClone(task);
    updatedTask.status = 'completed';
    updatedTask.businessStatus = {
      coding: [CONFIG.BUSINESS_STATUS.resultsAvailable]
    };
    updatedTask.lastModified = now;
    updatedTask.output = [{
      type: { text: 'DiagnosticReport' },
      valueReference: { reference: drUuid }
    }];

    txEntries.push({
      resource: updatedTask,
      request: { method: 'PUT', url: `Task/${encodeURIComponent(task.id)}` }
    });
  }

  // 4. Group Task update (if all siblings will be complete)
  if (context.groupTask && context.allSiblingsComplete) {
    const updatedGroup = structuredClone(context.groupTask);
    updatedGroup.status = 'completed';
    updatedGroup.lastModified = now;

    txEntries.push({
      resource: updatedGroup,
      request: { method: 'PUT', url: `Task/${encodeURIComponent(context.groupTask.id)}` }
    });
  }

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: txEntries
  };
}

/**
 * Round a number to the specified decimal places.
 */
function round(value, dp) {
  if (!dp || dp <= 0) return Math.round(value);
  const factor = Math.pow(10, dp);
  return Math.round(value * factor) / factor;
}
