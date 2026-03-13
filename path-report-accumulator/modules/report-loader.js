/**
 * @module report-loader
 * @description Fetch DiagnosticReports and their Observations for a patient
 */

import { CONFIG } from '../config.js';
import { searchWithPaging, batchFetchByIds, getByRef } from './fhir-client.js';
import {
  relRefString, extractLoincCode, extractDisplayText,
  extractPerformerRef, extractPerformerDisplay, extractMethod,
  extractRefRange, extractUnit, extractValue
} from './fhir-helpers.js';

/**
 * Fetch all lab DiagnosticReports for a patient, sorted by date descending.
 */
export async function fetchReportsForPatient(base, patientRef) {
  return searchWithPaging(base, 'DiagnosticReport', [
    ['subject', patientRef],
    ['category', CONFIG.CATEGORY.diagnosticServiceLab.code],
    ['_sort', '-date'],
    ['_count', '50']
  ]);
}

/**
 * Resolve all Observation references from a DiagnosticReport.
 */
export async function fetchObservationsForReport(base, report) {
  const refs = report.result || [];
  if (!refs.length) return [];

  // Extract IDs from references
  const ids = [];
  const absoluteRefs = [];

  for (const ref of refs) {
    const s = ref.reference || '';
    if (s.startsWith('http')) {
      absoluteRefs.push(s);
    } else if (s.includes('/')) {
      const id = s.split('/').pop();
      if (id) ids.push(id);
    }
  }

  const observations = [];

  // Batch fetch relative references
  if (ids.length) {
    const batch = await batchFetchByIds(base, 'Observation', ids);
    observations.push(...batch.filter(r => r.resourceType === 'Observation'));
  }

  // Fetch absolute references individually
  for (const absRef of absoluteRefs) {
    try {
      const obs = await getByRef(base, absRef);
      if (obs?.resourceType === 'Observation') observations.push(obs);
    } catch (e) {
      console.warn('Failed to fetch observation:', absRef, e);
    }
  }

  return observations;
}

/**
 * Normalize a report + observations into a ReportData object.
 */
export function buildReportData(report, observations) {
  return {
    id: report.id,
    date: report.effectiveDateTime || report.issued || '',
    issued: report.issued || '',
    code: report.code || {},
    performerRef: extractPerformerRef(report),
    performerDisplay: extractPerformerDisplay(report),
    observations: observations.map(obs => ({
      id: obs.id,
      loincCode: extractLoincCode(obs),
      loincDisplay: (obs.code?.coding || []).find(c => c.system === 'http://loinc.org')?.display || '',
      displayText: extractDisplayText(obs),
      value: extractValue(obs),
      unit: extractUnit(obs),
      refRange: extractRefRange(obs),
      performerRef: extractPerformerRef(obs),
      performerDisplay: extractPerformerDisplay(obs),
      method: extractMethod(obs)
    }))
  };
}

/**
 * Select up to maxCompanion companion reports from the full report list.
 *
 * If the current report is not the most recent, fill newer reports first,
 * then older ones. Always aims for maxCompanion companions.
 */
export function selectCompanionReports(allReports, currentIdx) {
  const max = CONFIG.UI.maxCompanionReports;
  const companions = [];

  // Reports newer than current (lower index = more recent since sorted desc)
  const newer = [];
  for (let i = currentIdx - 1; i >= 0; i--) {
    newer.push(i);
  }
  // Reports older than current
  const older = [];
  for (let i = currentIdx + 1; i < allReports.length; i++) {
    older.push(i);
  }

  // Fill newer first (closest to current first), then older
  const ordered = [...newer.reverse(), ...older];
  for (const idx of ordered) {
    if (companions.length >= max) break;
    companions.push(idx);
  }

  return companions.map(i => allReports[i]);
}
