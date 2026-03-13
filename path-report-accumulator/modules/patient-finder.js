/**
 * @module patient-finder
 * @description Find patients with 2+ DiagnosticReports at different timestamps
 */

import { CONFIG } from '../config.js';
import { searchWithPagingRaw, searchWithPaging } from './fhir-client.js';
import { relRefString } from './fhir-helpers.js';

/**
 * Browse all patients with 2+ lab DiagnosticReports at different timestamps.
 * Uses _include to fetch Patient resources in the same request.
 * Returns [{ patient, reportCount, latestDate }] sorted by latestDate desc.
 */
export async function findPatientsWithMultipleReports(base, onStatus) {
  onStatus?.('Fetching diagnostic reports…');

  const params = [
    ['category', CONFIG.CATEGORY.diagnosticServiceLab.code],
    ['_sort', '-date'],
    ['_count', String(CONFIG.FHIR.pageSize)],
    ['_include', 'DiagnosticReport:subject']
  ];

  const entries = await searchWithPagingRaw(base, 'DiagnosticReport', params);

  // Separate DiagnosticReports from included Patients
  const reports = [];
  const patientMap = new Map(); // id -> Patient resource

  for (const entry of entries) {
    const r = entry.resource;
    if (!r) continue;
    if (r.resourceType === 'DiagnosticReport') {
      reports.push(r);
    } else if (r.resourceType === 'Patient') {
      patientMap.set(`Patient/${r.id}`, r);
    }
  }

  // Group reports by patient, tracking distinct timestamps
  const byPatient = new Map(); // patientRef -> { timestamps: Set, latestDate }

  for (const dr of reports) {
    const patRef = relRefString(dr.subject);
    if (!patRef) continue;

    if (!byPatient.has(patRef)) {
      byPatient.set(patRef, { timestamps: new Set(), latestDate: null });
    }
    const entry = byPatient.get(patRef);
    const ts = dr.effectiveDateTime || dr.issued || '';
    if (ts) {
      entry.timestamps.add(ts);
      if (!entry.latestDate || ts > entry.latestDate) {
        entry.latestDate = ts;
      }
    }
  }

  // Filter to patients with 2+ distinct timestamps
  const results = [];
  for (const [patRef, data] of byPatient) {
    if (data.timestamps.size < 2) continue;

    let patient = patientMap.get(patRef);
    // If _include didn't return the patient, we have the reference but no demographics
    if (!patient) {
      patient = { resourceType: 'Patient', id: patRef.replace('Patient/', '') };
    }

    results.push({
      patient,
      reportCount: data.timestamps.size,
      latestDate: data.latestDate
    });
  }

  // Sort by latest report date descending
  results.sort((a, b) => (b.latestDate || '').localeCompare(a.latestDate || ''));

  onStatus?.(`Found ${results.length} patients with cumulative results`);
  return results;
}

/**
 * Search patients by name, then check which have 2+ lab DiagnosticReports.
 * Returns same shape as findPatientsWithMultipleReports.
 */
export async function searchPatientByName(base, name, onStatus) {
  onStatus?.(`Searching for "${name}"…`);

  const patients = await searchWithPaging(base, 'Patient', [
    ['name', name],
    ['_count', '20']
  ], 1);

  if (!patients.length) {
    onStatus?.('No patients found');
    return [];
  }

  onStatus?.(`Checking ${patients.length} patient(s) for reports…`);
  const results = [];

  for (const patient of patients) {
    const patRef = `Patient/${patient.id}`;
    const reports = await searchWithPaging(base, 'DiagnosticReport', [
      ['subject', patRef],
      ['category', CONFIG.CATEGORY.diagnosticServiceLab.code],
      ['_sort', '-date'],
      ['_count', '50']
    ], 1);

    const timestamps = new Set();
    let latestDate = null;
    for (const dr of reports) {
      const ts = dr.effectiveDateTime || dr.issued || '';
      if (ts) {
        timestamps.add(ts);
        if (!latestDate || ts > latestDate) latestDate = ts;
      }
    }

    if (timestamps.size >= 2) {
      results.push({ patient, reportCount: timestamps.size, latestDate });
    }
  }

  results.sort((a, b) => (b.latestDate || '').localeCompare(a.latestDate || ''));
  onStatus?.(`Found ${results.length} patients with cumulative results`);
  return results;
}
