/**
 * @module ui-table
 * @description Render the cumulative results table
 */

import { escapeHtml, fmtDate, fmtTime, fmtDateTime, fmtRefRange } from './formatters.js';

/**
 * Render the cumulative results table.
 *
 * @param {HTMLElement} container
 * @param {{ columns: ColumnDef[], rows: RowDef[] }} tableModel
 * @param {'asc'|'desc'} sortOrder - asc = oldest left, desc = newest left
 */
export function renderCumulativeTable(container, tableModel, sortOrder) {
  const { columns, rows } = tableModel;

  if (!columns.length || !rows.length) {
    container.innerHTML = '<p class="text-gray-400 text-sm p-4">No observations to display</p>';
    return;
  }

  // Sort columns by date
  const sorted = [...columns].sort((a, b) => {
    const cmp = (a.date || '').localeCompare(b.date || '');
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  const html = `
    <div class="cumulative-table-wrap overflow-x-auto">
      <table class="cumulative-table w-full text-sm border-collapse">
        <thead>
          <tr>
            <th class="sticky left-0 z-10 bg-gray-900 text-left px-3 py-2 text-gray-400
                       font-medium border-b border-gray-700 min-w-[180px]">Test</th>
            ${sorted.map(col => `
              <th class="px-3 py-2 text-center font-medium border-b border-gray-700 min-w-[100px]
                         ${col.isCurrent ? 'current-col bg-blue-900/40 text-blue-300' : 'text-gray-400'}"
                  title="${escapeHtml(fmtDateTime(col.date))}">
                ${escapeHtml(fmtDate(col.date))}
                <div class="text-[10px] font-normal ${col.isCurrent ? 'text-blue-300/70' : 'text-gray-500'}">${escapeHtml(fmtTime(col.date))}</div>
                ${col.performerDisplay ? `<div class="text-[10px] font-normal ${col.isCurrent ? 'text-blue-400/70' : 'text-gray-500'} text-center">${escapeHtml(col.performerDisplay)}</div>` : ''}
                ${col.isCurrent ? '<div class="text-[10px] font-normal text-blue-400">Selected</div>' : ''}
              </th>`).join('')}
            <th class="px-3 py-2 text-center text-gray-400 font-medium border-b border-gray-700
                       min-w-[100px]">Ref. Interval</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, ri) => `
            <tr class="${ri % 2 === 0 ? 'bg-gray-800/50' : ''}">
              <td class="sticky left-0 z-10 ${ri % 2 === 0 ? 'bg-gray-800/95' : 'bg-gray-900/95'}
                         px-3 py-1.5 text-gray-200 font-medium border-b border-gray-800 whitespace-nowrap">
                ${escapeHtml(row.displayName)}
                ${row.unit ? `<span class="text-gray-500 font-normal text-xs ml-1">(${escapeHtml(row.unit)})</span>` : ''}
              </td>
              ${sorted.map(col => {
                const cell = row.cells.get(col.reportId);
                if (!cell) {
                  return `<td class="px-3 py-1.5 text-center text-gray-600 border-b border-gray-800
                               ${col.isCurrent ? 'current-col bg-blue-900/20' : ''}">&mdash;</td>`;
                }
                return `<td class="px-3 py-1.5 text-center border-b border-gray-800
                             ${col.isCurrent ? 'current-col bg-blue-900/20' : ''}
                             ${cell.isOutOfRange ? 'out-of-range text-red-400 font-semibold' : 'text-gray-100'}">
                  ${escapeHtml(cell.display)}
                </td>`;
              }).join('')}
              <td class="px-3 py-1.5 text-center text-gray-400 text-xs border-b border-gray-800">
                ${escapeHtml(fmtRefRange(row.refRange))}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  container.innerHTML = html;
}
