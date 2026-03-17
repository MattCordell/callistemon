/**
 * @module row-grouper
 * @description Row grouping algorithms for the 4 display modes
 *
 * Each mode defines a row key function that determines which observations
 * from different reports share a row in the cumulative table.
 */

import { CONFIG } from '../config.js';

const { DISPLAY_MODES } = CONFIG;

/**
 * Return the row key function for the given display mode.
 */
export function getRowKeyFn(mode) {
  switch (mode) {
    case DISPLAY_MODES.COMPACT:
      return compactKey;
    case DISPLAY_MODES.SIMPLE:
      return simpleKey;
    case DISPLAY_MODES.LAB_SPECIFIC:
      return labSpecificKey;
    case DISPLAY_MODES.METHOD_SPECIFIC:
      return methodSpecificKey;
    default:
      return compactKey;
  }
}

/**
 * Compact: group by display name (case-insensitive).
 * Observations with the same name share a row regardless of LOINC, lab, or method.
 */
function compactKey(obs) {
  return (obs.displayText || '').toLowerCase().trim();
}

/**
 * Simple: group by LOINC code + reference range.
 * Same row only if LOINC AND reference intervals match exactly.
 */
function simpleKey(obs) {
  const loinc = obs.loincCode || obs.displayText || '';
  const low = obs.refRange?.low ?? '';
  const high = obs.refRange?.high ?? '';
  return `${loinc}|${low}:${high}`;
}

/**
 * Lab Specific: group by display name + performing organization.
 * Different labs get separate rows even for the same test.
 */
function labSpecificKey(obs) {
  const name = (obs.displayText || '').toLowerCase().trim();
  const performer = obs.performerRef || '';
  return `${name}|${performer}`;
}

/**
 * Method Specific: group by LOINC code + method.
 * Same LOINC but different methods get separate rows.
 */
function methodSpecificKey(obs) {
  const loinc = obs.loincCode || obs.displayText || '';
  const method = obs.method || '';
  return `${loinc}|${method}`;
}

/**
 * Build the cumulative table rows from the current report and companions.
 *
 * @param {ReportData} currentReport - The selected "current" report
 * @param {ReportData[]} companionReports - The companion reports
 * @param {string} displayMode - One of CONFIG.DISPLAY_MODES values
 * @returns {{ columns: ColumnDef[], rows: RowDef[] }}
 *
 * ColumnDef: { reportId, date, isCurrent }
 * RowDef: { rowKey, displayName, loincCode, unit, refRange, cells: Map<reportId, CellDef> }
 * CellDef: { display, raw, isOutOfRange }
 */
export function buildCumulativeTable(currentReport, companionReports, displayMode) {
  const rowKeyFn = getRowKeyFn(displayMode);
  const allReports = [currentReport, ...companionReports];

  // Build columns (will be sorted by caller based on sort order)
  const columns = allReports.map(r => ({
    reportId: r.id,
    date: r.date,
    isCurrent: r.id === currentReport.id,
    performerDisplay: r.performerDisplay || ''
  }));

  const rowMap = new Map(); // rowKey -> RowDef
  const rowOrder = []; // preserve insertion order

  // First pass: current report observations (establishes reference intervals)
  for (const obs of currentReport.observations) {
    const key = rowKeyFn(obs);
    if (!rowMap.has(key)) {
      const row = {
        rowKey: key,
        displayName: obs.displayText,
        loincCode: obs.loincCode,
        unit: obs.unit,
        refRange: obs.refRange,
        performerDisplay: obs.performerDisplay,
        method: obs.method,
        cells: new Map()
      };
      rowMap.set(key, row);
      rowOrder.push(key);
    }
    const row = rowMap.get(key);
    row.cells.set(currentReport.id, buildCell(obs, obs.refRange));
  }

  // Second pass: companion report observations
  for (const report of companionReports) {
    for (const obs of report.observations) {
      const key = rowKeyFn(obs);
      if (!rowMap.has(key)) {
        const row = {
          rowKey: key,
          displayName: obs.displayText,
          loincCode: obs.loincCode,
          unit: obs.unit,
          refRange: obs.refRange,
          performerDisplay: obs.performerDisplay,
          method: obs.method,
          cells: new Map()
        };
        rowMap.set(key, row);
        rowOrder.push(key);
      }
      const row = rowMap.get(key);
      // Don't overwrite if this report already has a cell for this row
      if (!row.cells.has(report.id)) {
        // Use the row's reference range (from current report) for out-of-range check
        row.cells.set(report.id, buildCell(obs, row.refRange));
      }
    }
  }

  const rows = rowOrder.map(key => rowMap.get(key));
  rows.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', undefined, { sensitivity: 'base' }));
  return { columns, rows };
}

function buildCell(obs, refRange) {
  const { display, raw } = obs.value;
  let outOfRange = false;
  if (typeof raw === 'number' && refRange) {
    if (refRange.low != null && raw < refRange.low) outOfRange = true;
    if (refRange.high != null && raw > refRange.high) outOfRange = true;
  }
  return { display, raw, isOutOfRange: outOfRange };
}
