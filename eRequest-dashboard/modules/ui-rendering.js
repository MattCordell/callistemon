/**
 * @module ui-rendering
 * @description DOM manipulation and UI rendering
 *
 * Provides functions for:
 * - ServiceRequest table rendering
 * - Patient table rendering
 * - Patient details sidebar rendering
 * - Filter controls updates
 * - Error and loading states
 * - View mode switching
 *
 * @requires formatters
 * @requires config
 */

import { escapeHtml, fmtDateTime, fmtPatientName, calcAge, fmtAddress, getPatientPhotoSrc } from './formatters.js';
import { CONFIG } from '../config.js';

// ==================== Server Selection ====================

/**
 * Populate server selection dropdowns
 */
export function populateServerSelects() {
  // FHIR server presets
  const serverSelect = document.getElementById('server-url');
  if (serverSelect) {
    CONFIG.FHIR_SERVERS.forEach(url => {
      const option = document.createElement('option');
      option.value = url;
      option.textContent = url;
      serverSelect.appendChild(option);
    });
  }

  // Terminology server presets
  const txSelect = document.getElementById('tx-server');
  if (txSelect) {
    CONFIG.TX_SERVERS.forEach(url => {
      const option = document.createElement('option');
      option.value = url;
      option.textContent = url;
      txSelect.appendChild(option);
    });
  }

  // Modality options
  const modalitySelect = document.getElementById('modality-select');
  if (modalitySelect) {
    CONFIG.MODALITIES.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.code;
      option.textContent = opt.display;
      modalitySelect.appendChild(option);
    });
  }

  // Set default terminology server
  const txServer = document.getElementById('tx-server');
  if (txServer) {
    txServer.value = CONFIG.DEFAULT_TX;
  }
}

// ==================== View Mode ====================

/**
 * Switch active view mode
 * @param {string} mode - Mode to activate: 'incoming' | 'patients'
 */
export function showActiveTab(mode) {
  const incomingView = document.getElementById('incoming-view');
  const patientsView = document.getElementById('patients-view');
  const incomingBtn = document.getElementById('mode-incoming');
  const patientsBtn = document.getElementById('mode-patients');

  if (mode === 'incoming') {
    incomingView?.classList.remove('hidden');
    patientsView?.classList.add('hidden');
    incomingBtn?.classList.add('bg-slate-800', 'border-slate-700');
    incomingBtn?.classList.remove('bg-slate-900', 'border-slate-800', 'hover:bg-slate-800');
    patientsBtn?.classList.remove('bg-slate-800', 'border-slate-700');
    patientsBtn?.classList.add('bg-slate-900', 'border-slate-800', 'hover:bg-slate-800');
  } else {
    incomingView?.classList.add('hidden');
    patientsView?.classList.remove('hidden');
    patientsBtn?.classList.add('bg-slate-800', 'border-slate-700');
    patientsBtn?.classList.remove('bg-slate-900', 'border-slate-800', 'hover:bg-slate-800');
    incomingBtn?.classList.remove('bg-slate-800', 'border-slate-700');
    incomingBtn?.classList.add('bg-slate-900', 'border-slate-800', 'hover:bg-slate-800');
  }
}

// ==================== Error and Loading ====================

/**
 * Show error message
 * @param {string} message - Error message to display
 */
export function showError(message) {
  const errorEl = document.getElementById('error-display');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}

/**
 * Clear error message
 */
export function clearError() {
  const errorEl = document.getElementById('error-display');
  if (errorEl) {
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
  }
}

/**
 * Update loading state
 * @param {boolean} isLoading - Loading state
 */
export function showLoading(isLoading) {
  const fetchBtn = document.getElementById('fetch-btn');
  const loadMoreBtn = document.getElementById('load-more-btn');

  if (fetchBtn) {
    fetchBtn.disabled = isLoading;
    fetchBtn.textContent = isLoading ? 'Loading...' : 'Fetch';
  }

  if (loadMoreBtn && isLoading) {
    loadMoreBtn.textContent = 'Loading...';
  }
}

// ==================== Incoming ServiceRequests Table ====================

/**
 * Render incoming ServiceRequests table
 * @param {Array} rows - Display row objects
 * @param {Function} onRowClick - Click handler: (patientRef) => void
 */
export function renderIncomingTable(rows, onRowClick) {
  const tbody = document.querySelector('#incoming-table tbody');
  const countEl = document.getElementById('incoming-count');

  if (!tbody) return;

  // Update count
  if (countEl) {
    countEl.textContent = `${rows.length} shown`;
  }

  // Clear existing rows
  tbody.innerHTML = '';

  // Create document fragment for performance
  const fragment = document.createDocumentFragment();

  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = 'border-t border-slate-800 hover:bg-slate-900/50 cursor-pointer';
    tr.tabIndex = 0;

    tr.innerHTML = `
      <td class="px-4 py-2 whitespace-nowrap">${escapeHtml(fmtDateTime(row.date))}</td>
      <td class="px-4 py-2">${escapeHtml(row.patientName)}</td>
      <td class="px-4 py-2">${escapeHtml(row.testName)}</td>
      <td class="px-4 py-2">${escapeHtml(row.categoryText)}</td>
      <td class="px-4 py-2 uppercase tracking-wide text-slate-300">${escapeHtml(row.status)}</td>
      <td class="px-4 py-2 text-slate-200">
        <span class="uppercase tracking-wide">${escapeHtml(row.taskStatus || '')}</span>
        ${row.taskBusinessStatus ? '<span> — ' + escapeHtml(row.taskBusinessStatus) + '</span>' : ''}
      </td>
      <td class="px-4 py-2 capitalize">${escapeHtml(row.priority || '')}</td>
      <td class="px-4 py-2" data-since="${escapeHtml(row.date)}">${escapeHtml(row.sinceAuthored || '')}</td>
      <td class="px-4 py-2">${escapeHtml(row.performer || '')}</td>
    `;

    // Add click handler
    tr.addEventListener('click', () => {
      if (onRowClick) onRowClick(row.patientRef);
    });

    // Add keyboard support
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (onRowClick) onRowClick(row.patientRef);
      }
    });

    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
}

/**
 * Update "time since" columns without full re-render
 * @param {Array} rows - Display row objects
 */
export function updateTimeSinceColumns(rows) {
  const tbody = document.querySelector('#incoming-table tbody');
  if (!tbody) return;

  const trs = tbody.querySelectorAll('tr');
  trs.forEach((tr, index) => {
    if (index < rows.length) {
      const row = rows[index];
      const sinceCell = tr.querySelector('td[data-since]');
      if (sinceCell && row.sinceAuthored) {
        sinceCell.textContent = row.sinceAuthored;
      }
    }
  });
}

// ==================== Patient Table ====================

/**
 * Render patient table
 * @param {Array} rows - Patient row objects
 * @param {string} selectedPatientRef - Currently selected patient reference
 * @param {Function} onRowClick - Click handler: (patientRef) => void
 */
export function renderPatientTable(rows, selectedPatientRef, onRowClick) {
  const tbody = document.querySelector('#patient-table tbody');
  const countEl = document.getElementById('patient-count');

  if (!tbody) return;

  // Update count
  if (countEl) {
    countEl.textContent = `${rows.length} patients`;
  }

  // Clear existing rows
  tbody.innerHTML = '';

  // Create document fragment
  const fragment = document.createDocumentFragment();

  rows.forEach(row => {
    const tr = document.createElement('tr');
    const isSelected = selectedPatientRef === row.patientRef;
    tr.className = 'border-t border-slate-800 hover:bg-slate-900/50 cursor-pointer' +
                   (isSelected ? ' bg-slate-900/60' : '');
    tr.tabIndex = 0;

    tr.innerHTML = `
      <td class="px-4 py-2">${escapeHtml(row.patientName)}</td>
      <td class="px-4 py-2 whitespace-nowrap">${escapeHtml(fmtDateTime(row.latestDate))}</td>
      <td class="px-4 py-2">${escapeHtml(String(row.count))}</td>
    `;

    // Add click handler
    tr.addEventListener('click', () => {
      if (onRowClick) onRowClick(row.patientRef);
    });

    // Add keyboard support
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (onRowClick) onRowClick(row.patientRef);
      }
    });

    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
}

// ==================== Patient Details Sidebar ====================

/**
 * Render patient details sidebar
 * @param {Object} patient - Patient resource
 * @param {Array} srs - ServiceRequest rows for this patient
 * @param {Object} taskBySrId - Task map
 * @param {string} baseUrl - FHIR server base URL
 */
export function renderPatientSidebar(patient, srs, taskBySrId, baseUrl) {
  const detailsEl = document.getElementById('patient-details');
  const srsEl = document.getElementById('patient-srs');

  if (!detailsEl || !srsEl) return;

  // Render patient details
  if (patient) {
    const photoSrc = getPatientPhotoSrc(patient, baseUrl);
    const photoHtml = photoSrc
      ? `<img src="${escapeHtml(photoSrc)}" alt="patient" class="w-16 h-16 rounded-xl object-cover border border-slate-800" />`
      : '<div class="w-16 h-16 rounded-xl bg-slate-900 border border-slate-800 grid place-items-center text-xs text-slate-500">No photo</div>';

    detailsEl.innerHTML = `
      <div class="mt-2 text-sm flex gap-3">
        ${photoHtml}
        <div class="space-y-1">
          <div><span class="text-slate-400">Name:&nbsp;</span>${escapeHtml(fmtPatientName(patient))}</div>
          ${patient.birthDate ? `<div><span class="text-slate-400">Age:&nbsp;</span>${escapeHtml(calcAge(patient.birthDate))} (DOB: ${escapeHtml(patient.birthDate)})</div>` : ''}
          ${patient.address && patient.address.length > 0 ? `<div><span class="text-slate-400">Address:&nbsp;</span>${escapeHtml(fmtAddress(patient.address))}</div>` : ''}
          ${patient.gender ? `<div><span class="text-slate-400">Gender:&nbsp;</span>${escapeHtml(patient.gender)}</div>` : ''}
          <div class="text-slate-500 text-xs">${escapeHtml('Patient/' + patient.id)}</div>
        </div>
      </div>
    `;
  } else {
    detailsEl.innerHTML = '<div class="text-slate-400 text-sm mt-2">Click a patient to view details.</div>';
  }

  // Render ServiceRequests
  if (srs && srs.length > 0) {
    const srsHtml = srs.map(r => {
      const srRef = 'ServiceRequest/' + r.id;
      const task = taskBySrId[srRef];
      const taskUrl = task ? baseUrl.replace(/\/$/, '') + '/Task/' + task.id : null;

      return `
        <li class="bg-slate-900/40 border border-slate-800 rounded-xl p-2">
          <div class="text-sm font-medium">${escapeHtml(r.testName)}</div>
          <div class="text-xs text-slate-400">${escapeHtml(fmtDateTime(r.date))} — ${escapeHtml(r.categoryText || '')}</div>
          <div class="text-xs uppercase text-slate-300">${escapeHtml(r.status)}</div>
          ${taskUrl ? `
            <div class="text-xs text-indigo-300 mt-1">
              <span class="text-slate-400">Task: </span>
              <a href="${escapeHtml(taskUrl)}" target="_blank" rel="noopener noreferrer" class="underline hover:text-indigo-200">
                ${escapeHtml(taskUrl)}
              </a>
            </div>
          ` : ''}
        </li>
      `;
    }).join('');

    srsEl.innerHTML = `<ul class="mt-2 space-y-2">${srsHtml}</ul>`;
  } else {
    srsEl.innerHTML = '<div class="text-slate-400 text-sm mt-2">Select a patient to view their requests.</div>';
  }
}

// ==================== Filter Controls ====================

/**
 * Update category filter button states
 * @param {string} categoryFilter - Active category: 'all' | 'lab' | 'imaging'
 */
export function updateCategoryButtons(categoryFilter) {
  const buttons = {
    all: document.getElementById('category-all'),
    lab: document.getElementById('category-lab'),
    imaging: document.getElementById('category-imaging')
  };

  Object.keys(buttons).forEach(key => {
    const btn = buttons[key];
    if (!btn) return;

    if (key === categoryFilter) {
      btn.classList.add('bg-slate-800');
      btn.classList.remove('bg-slate-900', 'hover:bg-slate-800');
    } else {
      btn.classList.remove('bg-slate-800');
      btn.classList.add('bg-slate-900', 'hover:bg-slate-800');
    }
  });
}

/**
 * Update modality filter UI state
 * @param {Object} modalityState - Modality filter state
 */
export function updateModalityUI(modalityState) {
  const loadingEl = document.getElementById('modality-loading');
  const errorEl = document.getElementById('modality-error');
  const clearBtn = document.getElementById('modality-clear');
  const select = document.getElementById('modality-select');

  if (loadingEl) {
    loadingEl.classList.toggle('hidden', !modalityState.loading);
  }

  if (errorEl) {
    errorEl.classList.toggle('hidden', !modalityState.error);
  }

  if (clearBtn && select) {
    clearBtn.classList.toggle('hidden', !select.value);
  }
}

/**
 * Update anatomy filter UI state
 * @param {Object} anatomyState - Anatomy filter state
 */
export function updateAnatomyUI(anatomyState) {
  const loadingEl = document.getElementById('anatomy-loading');
  const errorEl = document.getElementById('anatomy-error');
  const clearBtn = document.getElementById('anatomy-clear');
  const menuEl = document.getElementById('anatomy-menu');

  if (loadingEl) {
    loadingEl.classList.toggle('hidden', !anatomyState.loading);
  }

  if (errorEl) {
    errorEl.textContent = anatomyState.error;
    errorEl.classList.toggle('hidden', !anatomyState.error);
  }

  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !anatomyState.selected);
  }

  if (menuEl) {
    menuEl.classList.toggle('hidden', !anatomyState.menuOpen);
  }
}

/**
 * Render anatomy autocomplete options
 * @param {Array} options - Array of {code, display} objects
 * @param {Function} onSelect - Selection handler: (code, display) => void
 */
export function renderAnatomyOptions(options, onSelect) {
  const optionsEl = document.getElementById('anatomy-options');
  if (!optionsEl) return;

  optionsEl.innerHTML = '';

  options.slice(0, CONFIG.UI.AUTOCOMPLETE_MAX_RESULTS).forEach(opt => {
    const li = document.createElement('li');
    li.className = 'px-3 py-2 hover:bg-slate-800 cursor-pointer';
    li.textContent = opt.display;

    li.addEventListener('click', () => {
      if (onSelect) onSelect(opt.code, opt.display);
    });

    optionsEl.appendChild(li);
  });
}

// ==================== Pagination ====================

/**
 * Update pagination UI
 * @param {string} nextLink - Next page URL
 * @param {boolean} loading - Loading state
 */
export function updatePagination(nextLink, loading) {
  const loadMoreBtn = document.getElementById('load-more-btn');
  const statusEl = document.getElementById('pagination-status');

  if (loadMoreBtn) {
    loadMoreBtn.disabled = !nextLink || loading;
    loadMoreBtn.textContent = nextLink
      ? (loading ? 'Loading...' : 'Load more')
      : 'No more';
  }

  if (statusEl) {
    statusEl.textContent = nextLink
      ? 'More pages available from server'
      : 'End of results';
  }
}
