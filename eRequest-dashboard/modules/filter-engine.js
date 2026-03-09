/**
 * @module filter-engine
 * @description Business logic for filtering and data transformations
 *
 * Provides pure functions for:
 * - Building incoming ServiceRequest rows
 * - Filtering by category, modality, anatomy
 * - Building patient rows with grouping and search
 *
 * @requires fhir-helpers
 * @requires formatters
 * @requires config
 */

import * as FhirHelpers from './fhir-helpers.js';
import { fmtPatientName, fmtTimeSince, fmtDateTime } from './formatters.js';
import { CONFIG } from '../config.js';

/**
 * Build incoming ServiceRequest display rows
 * @param {Array} srList - Array of ServiceRequest resources
 * @param {Object} patientMap - Map of Patient resources by reference
 * @param {Object} taskBySrId - Map of Task resources by SR reference
 * @param {Object} resByRef - Map of all resources by reference
 * @returns {Array} Array of display row objects
 */
export function buildIncomingRows(srList, patientMap, taskBySrId, resByRef) {
  const rows = srList.map((sr) => {
    const pref = FhirHelpers.normalizePatientRef(FhirHelpers.srPatientRef(sr));
    const p = patientMap[pref];
    const fallbackDisplay = sr?.subject?.display ? String(sr.subject.display).trim() : '';
    const srRef = 'ServiceRequest/' + sr.id;
    const task = taskBySrId[srRef];
    const priority = sr?.priority ? String(sr.priority) : '';
    const since = priority && priority.toLowerCase() !== 'routine'
      ? fmtTimeSince(FhirHelpers.srAuthoredOn(sr))
      : '';

    const businessStatus =
      task?.businessStatus?.text ||
      task?.businessStatus?.coding?.[0]?.display ||
      '';

    return {
      id: sr.id,
      date: FhirHelpers.srAuthoredOn(sr),
      patientRef: pref,
      patientName: fmtPatientName(p) || fallbackDisplay || '(no name)',
      testName: FhirHelpers.srCodeText(sr),
      categoryText: FhirHelpers.srCategoryText(sr),
      status: sr.status || '',
      categorySct: FhirHelpers.snomedCodesFromCC(sr.category?.[0]),
      testSct: FhirHelpers.snomedCodesFromCC(sr.code),
      taskStatus: task?.status ? String(task.status) : '',
      taskBusinessStatus: businessStatus ? String(businessStatus) : '',
      priority: priority,
      sinceAuthored: since,
      performer: FhirHelpers.taskOwnerName(task, resByRef)
    };
  });

  // Sort by date descending
  rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return rows;
}

/**
 * Filter rows by category
 * @param {Array} rows - Display rows
 * @param {string} categoryFilter - Category filter: 'all', 'lab', 'imaging'
 * @returns {Array} Filtered rows
 */
export function filterByCategory(rows, categoryFilter) {
  if (categoryFilter === 'lab') {
    return rows.filter(r =>
      r.categorySct && r.categorySct.indexOf(CONFIG.SNOMED.LAB_CATEGORY) !== -1
    );
  }

  if (categoryFilter === 'imaging') {
    return rows.filter(r =>
      r.categorySct && r.categorySct.indexOf(CONFIG.SNOMED.IMAGING_CATEGORY) !== -1
    );
  }

  return rows; // 'all'
}

/**
 * Filter rows by modality codes
 * @param {Array} rows - Display rows
 * @param {Set} modalityCodes - Set of SNOMED modality codes
 * @returns {Array} Filtered rows
 */
export function filterByModality(rows, modalityCodes) {
  if (!modalityCodes || modalityCodes.size === 0) {
    return rows;
  }

  return rows.filter(r =>
    (r.testSct || []).some(c => modalityCodes.has(c))
  );
}

/**
 * Filter rows by anatomy codes
 * @param {Array} rows - Display rows
 * @param {Set} anatomyCodes - Set of anatomy codes
 * @returns {Array} Filtered rows
 */
export function filterByAnatomy(rows, anatomyCodes) {
  if (!anatomyCodes || anatomyCodes.size === 0) {
    return rows;
  }

  return rows.filter(r =>
    (r.testSct || []).some(c => anatomyCodes.has(c))
  );
}

/**
 * Apply all filters to incoming rows
 * @param {Object} state - Full application state
 * @returns {Array} Filtered display rows
 */
export function applyAllFilters(state) {
  let rows = buildIncomingRows(
    state.data.srList,
    state.data.patientMap,
    state.data.taskBySrId,
    state.data.resByRef
  );

  rows = filterByCategory(rows, state.filters.categoryFilter);
  rows = filterByModality(rows, state.filters.modality.codes);
  rows = filterByAnatomy(rows, state.filters.anatomy.codes);

  return rows;
}

/**
 * Build patient rows with grouping and filtering
 * @param {Array} srList - Array of ServiceRequest resources
 * @param {Object} patientMap - Map of Patient resources by reference
 * @param {string} patientSearch - Search query string
 * @param {boolean} last7Only - Filter to last 7 days only
 * @returns {Array} Array of patient row objects
 */
export function buildPatientRows(srList, patientMap, patientSearch, last7Only) {
  const map = new Map();

  // Group ServiceRequests by patient
  for (const sr of srList) {
    const pref = FhirHelpers.normalizePatientRef(FhirHelpers.srPatientRef(sr));
    if (!pref) continue;

    const when = FhirHelpers.srAuthoredOn(sr) || '';
    const cur = map.get(pref);

    if (!cur || new Date(when) > new Date(cur.latestDate)) {
      map.set(pref, {
        latestDate: when,
        count: (cur?.count || 0) + 1
      });
    } else {
      cur.count = (cur.count || 0) + 1;
    }
  }

  // Convert to array
  let arr = Array.from(map.entries()).map(([pref, v]) => ({
    patientRef: pref,
    patientName: fmtPatientName(patientMap[pref]),
    latestDate: v.latestDate,
    count: v.count
  }));

  // Apply patient name search filter
  const q = patientSearch.trim().toLowerCase();
  if (q) {
    arr = arr.filter(p => (p.patientName || '').toLowerCase().includes(q));
  }

  // Apply last 7 days filter
  if (last7Only) {
    const now = Date.now();
    const seven = 7 * 24 * 60 * 60 * 1000;
    arr = arr.filter(p => {
      const t = new Date(p.latestDate || 0).getTime();
      return !Number.isNaN(t) && now - t <= seven;
    });
  }

  // Sort by latest date descending
  arr.sort((a, b) => new Date(b.latestDate || 0) - new Date(a.latestDate || 0));

  return arr;
}
