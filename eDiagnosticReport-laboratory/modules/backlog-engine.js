/**
 * @module backlog-engine
 * @description Backlog query, super set detection, and observable merging logic.
 *
 * Builds a structured backlog from Tasks + ServiceRequests + test definitions.
 * Detects when multiple tests within a requisition belong to the same Test Super Set
 * and merges them into a single backlog entry.
 */

import { TEST_DEFINITIONS, SUPER_SETS, findTestByCode } from './test-definitions.js';
import { srSnomedCode, isPathology, groupTasksByRequisition, isGroupTask, relRefString } from './fhir-helpers.js';

/**
 * @typedef {Object} BacklogEntry
 * @property {string} displayName     - UI label (test displayName or super set displayName)
 * @property {string|null} superSetKey - Super set key if merged, else null
 * @property {Object} code            - { system, code, display, displayName } for DiagnosticReport
 * @property {Array} testDefinitions  - Array of matched test definition objects
 * @property {Array} serviceRequests  - Array of ServiceRequest resources covered by this entry
 * @property {Array} tasks            - Array of diagnostic Task resources covered by this entry
 * @property {string} patientRef      - Patient reference (e.g., "Patient/123")
 * @property {string} requisitionId   - groupIdentifier value
 * @property {string} authoredOn      - Earliest authoredOn from the SRs
 * @property {Array} headings         - Merged headings with observables (deduped for super sets)
 */

/**
 * @typedef {Object} BacklogGroup
 * @property {string} requisitionId
 * @property {string} patientRef
 * @property {Array<BacklogEntry>} entries
 * @property {Object|null} groupTask  - The group Task resource (if found)
 */

/**
 * Build the laboratory backlog from fetched Tasks and ServiceRequests.
 *
 * @param {Array} diagnosticTasks - Diagnostic Task resources (status=accepted)
 * @param {Map} srMap - Map<srRef, ServiceRequest>
 * @param {Array} groupTasks - Group Task resources
 * @param {Array} [testDefinitions] - Provider-customised test definitions (defaults to master)
 * @returns {Array<BacklogGroup>} Grouped backlog items
 */
export function buildBacklog(diagnosticTasks, srMap, groupTasks = [], testDefinitions = TEST_DEFINITIONS) {
  // 1. Pair each task with its SR and test definition
  const paired = [];
  for (const task of diagnosticTasks) {
    const srRef = relRefString(task.focus);
    const sr = srMap.get(srRef);
    if (!sr) continue;
    if (!isPathology(sr)) continue;

    const snomedCode = srSnomedCode(sr);
    const testDef = snomedCode ? testDefinitions.find(t => t.code === snomedCode) : null;
    if (!testDef) continue;

    paired.push({ task, sr, testDef, srRef });
  }

  // 2. Group by requisition
  const byRequisition = new Map();
  for (const item of paired) {
    const reqId = item.task.groupIdentifier?.value || item.task.id || 'ungrouped';
    if (!byRequisition.has(reqId)) byRequisition.set(reqId, []);
    byRequisition.get(reqId).push(item);
  }

  // Build a lookup for group tasks by groupIdentifier
  const groupTaskByReqId = new Map();
  for (const gt of groupTasks) {
    const key = gt.groupIdentifier?.value;
    if (key) groupTaskByReqId.set(key, gt);
  }

  // 3. Within each requisition, detect super sets and build entries
  const backlogGroups = [];

  for (const [reqId, items] of byRequisition) {
    const patientRef = items[0].sr.subject?.reference
      ? relRefString(items[0].sr.subject)
      : null;

    // Collect super set memberships
    const bySuperSet = new Map();  // superSetKey -> items[]
    const standalone = [];         // items with no super set

    for (const item of items) {
      if (item.testDef.superSet) {
        const key = item.testDef.superSet;
        if (!bySuperSet.has(key)) bySuperSet.set(key, []);
        bySuperSet.get(key).push(item);
      } else {
        standalone.push(item);
      }
    }

    const entries = [];

    // Super set entries: only merge if 2+ tests in the same super set
    for (const [ssKey, ssItems] of bySuperSet) {
      if (ssItems.length >= 2) {
        // Merge into a single super set entry
        const ssDef = SUPER_SETS[ssKey];
        entries.push({
          displayName: ssDef?.displayName || ssKey,
          superSetKey: ssKey,
          code: ssDef ? {
            system: ssDef.system,
            code: ssDef.code,
            display: ssDef.display,
            displayName: ssDef.displayName
          } : { system: '', code: '', display: ssKey, displayName: ssKey },
          testDefinitions: ssItems.map(i => i.testDef),
          serviceRequests: ssItems.map(i => i.sr),
          tasks: ssItems.map(i => i.task),
          patientRef,
          requisitionId: reqId,
          authoredOn: earliestDate(ssItems.map(i => i.sr.authoredOn)),
          headings: mergeObservables(ssItems.map(i => i.testDef))
        });
      } else {
        // Only 1 test in this super set within the requisition — treat as standalone
        standalone.push(...ssItems);
      }
    }

    // Standalone entries: one entry per test
    for (const item of standalone) {
      entries.push({
        displayName: item.testDef.displayName,
        superSetKey: null,
        code: {
          system: item.testDef.system,
          code: item.testDef.code,
          display: item.testDef.display,
          displayName: item.testDef.displayName
        },
        testDefinitions: [item.testDef],
        serviceRequests: [item.sr],
        tasks: [item.task],
        patientRef,
        requisitionId: reqId,
        authoredOn: item.sr.authoredOn || null,
        headings: item.testDef.headings
      });
    }

    if (entries.length > 0) {
      backlogGroups.push({
        requisitionId: reqId,
        patientRef,
        entries,
        groupTask: groupTaskByReqId.get(reqId) || null
      });
    }
  }

  return backlogGroups;
}

/**
 * Merge observables from multiple test definitions into a single heading list.
 * Deduplicates observables by LOINC code (first occurrence wins).
 *
 * @param {Array} testDefs - Array of test definition objects
 * @returns {Array} Merged headings array
 */
export function mergeObservables(testDefs) {
  const seenLoinc = new Set();
  const mergedHeadings = [];

  for (const td of testDefs) {
    for (const heading of td.headings) {
      const newObs = [];
      for (const obs of heading.observables) {
        if (!seenLoinc.has(obs.loincCode)) {
          seenLoinc.add(obs.loincCode);
          newObs.push(obs);
        }
      }
      if (newObs.length > 0) {
        // Check if we already have a heading with this title
        const existing = mergedHeadings.find(h => h.title === heading.title);
        if (existing) {
          existing.observables.push(...newObs);
        } else {
          mergedHeadings.push({ title: heading.title, observables: [...newObs] });
        }
      }
    }
  }

  return mergedHeadings;
}

/**
 * Get the earliest date from an array of date strings.
 */
function earliestDate(dates) {
  const valid = dates.filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a < b ? a : b).toISOString();
}
