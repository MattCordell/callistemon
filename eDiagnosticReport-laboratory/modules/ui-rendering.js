/**
 * @module ui-rendering
 * @description DOM rendering for backlog list, patient banner, data entry form, and toasts.
 */

import { escapeHtml, fmtName, fmtDate, fmtDateTime, calcAge, fmtAddress } from './formatters.js';
import { CONFIG } from '../config.js';

/**
 * Render the backlog table from grouped backlog data.
 * @param {HTMLElement} container - DOM element to render into
 * @param {Array} backlogGroups - Output from buildBacklog()
 * @param {Map} patientMap - Map<patientRef, Patient resource>
 * @param {Function} onSelect - Callback(entry, patient) when user clicks "Enter Results"
 */
export function renderBacklog(container, backlogGroups, patientMap, onSelect) {
  if (!backlogGroups.length) {
    container.innerHTML = '<div class="empty">No claimed pathology requests in backlog.</div>';
    return;
  }

  let html = `<table class="backlog-table">
    <thead><tr>
      <th>Patient</th>
      <th>Test</th>
      <th>Requisition</th>
      <th>Authored</th>
      <th></th>
    </tr></thead><tbody>`;

  for (const group of backlogGroups) {
    for (const entry of group.entries) {
      const patient = patientMap.get(entry.patientRef);
      const patientName = patient ? escapeHtml(fmtName(patient.name?.[0] || patient.name)) : '\u2014';
      const patientDob = patient?.birthDate ? fmtDate(patient.birthDate) : '';
      const testLabel = escapeHtml(entry.displayName);
      const isSuperSet = !!entry.superSetKey;
      const badge = isSuperSet ? ' <span class="badge superset">Super Set</span>' : '';
      const reqId = escapeHtml(entry.requisitionId?.substring(0, 8) || '\u2014');
      const authored = entry.authoredOn ? fmtDateTime(entry.authoredOn) : '\u2014';
      const entryId = `entry_${group.requisitionId}_${entry.code.code}`;

      html += `<tr>
        <td><strong>${patientName}</strong>${patientDob ? `<br><span class="hint">${escapeHtml(patientDob)}</span>` : ''}</td>
        <td><span class="test-name">${testLabel}</span>${badge}</td>
        <td class="hint mono">${reqId}</td>
        <td class="hint">${escapeHtml(authored)}</td>
        <td><button class="btn btn-autocomplete" data-entry-id="${entryId}">Enter Results</button></td>
      </tr>`;
    }
  }

  html += '</tbody></table>';
  container.innerHTML = html;

  // Bind click handlers
  let entryIndex = 0;
  for (const group of backlogGroups) {
    for (const entry of group.entries) {
      const entryId = `entry_${group.requisitionId}_${entry.code.code}`;
      const btn = container.querySelector(`[data-entry-id="${entryId}"]`);
      if (btn) {
        const patient = patientMap.get(entry.patientRef);
        btn.addEventListener('click', () => onSelect(entry, patient, group));
      }
      entryIndex++;
    }
  }
}

/**
 * Render the patient identity banner.
 * @param {Object} elements - DOM element refs { avatar, ptName, ptLine, ptDob, ptAge, ptGender, ptAddress }
 * @param {Object} patient - FHIR Patient resource
 */
export function renderPatientBanner(elements, patient) {
  if (!patient) return;

  const name = patient.name?.[0] || patient.name;
  const displayName = fmtName(name);
  elements.ptName.textContent = displayName;

  // Avatar initials
  const initials = ((name?.given?.[0] || '').charAt(0) + (name?.family || '').charAt(0)).toUpperCase();
  elements.avatar.textContent = initials || '\u29D7';

  // IHI or other identifier
  const ihi = (patient.identifier || []).find(id =>
    id.system === 'http://ns.electronichealth.net.au/id/hi/ihi/1.0'
  );
  elements.ptLine.textContent = ihi ? `IHI: ${ihi.value}` : (patient.id ? `ID: ${patient.id}` : '\u2014');

  elements.ptDob.textContent = patient.birthDate ? fmtDate(patient.birthDate) : '\u2014';
  elements.ptAge.textContent = calcAge(patient.birthDate);
  elements.ptGender.textContent = patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : '\u2014';
  elements.ptAddress.textContent = fmtAddress(patient.address);
}

/**
 * Render the data entry form for a backlog entry.
 * @param {HTMLElement} container - DOM element to render the form into
 * @param {Object} entry - BacklogEntry from the backlog engine
 */
export function renderDataEntryForm(container, entry) {
  let html = `<h3 style="margin-top:0; font-size:18px; color:var(--text);">${escapeHtml(entry.displayName)}</h3>`;

  if (entry.superSetKey) {
    const testNames = entry.testDefinitions.map(td => td.displayName).join(', ');
    html += `<p class="hint" style="margin:-4px 0 12px;">Combines: ${escapeHtml(testNames)}</p>`;
  }

  for (const heading of entry.headings) {
    html += `<h3>${escapeHtml(heading.title)}</h3>`;

    for (const obs of heading.observables) {
      if (obs.resultType === 'text') {
        html += `<div class="obs-row obs-row--text">
          <label for="obs_${escapeHtml(obs.loincCode)}">${escapeHtml(obs.display)}</label>
          <input id="obs_${escapeHtml(obs.loincCode)}"
                 type="text"
                 data-loinc="${escapeHtml(obs.loincCode)}"
                 data-result-type="text"
                 placeholder="\u2014" />
          <span class="obs-unit"></span>
          <span class="obs-ref"></span>
        </div>`;
      } else {
        const refLow = obs.referenceRange?.low;
        const refHigh = obs.referenceRange?.high;
        let refText = '';
        if (refLow != null && refHigh != null) refText = `${refLow}\u2013${refHigh}`;
        else if (refLow != null) refText = `\u2265${refLow}`;
        else if (refHigh != null) refText = `\u2264${refHigh}`;

        html += `<div class="obs-row">
          <label for="obs_${escapeHtml(obs.loincCode)}">${escapeHtml(obs.display)}</label>
          <input id="obs_${escapeHtml(obs.loincCode)}"
                 type="number"
                 step="${stepForDecimals(obs.decimalPlaces)}"
                 data-loinc="${escapeHtml(obs.loincCode)}"
                 data-low="${refLow ?? ''}"
                 data-high="${refHigh ?? ''}"
                 placeholder="\u2014" />
          <span class="obs-unit">${escapeHtml(obs.unit)}</span>
          <span class="obs-ref">${refText}</span>
        </div>`;
      }
    }
  }

  container.innerHTML = html;

  // Add out-of-range highlighting on numeric inputs
  container.querySelectorAll('input[type="number"]').forEach(input => {
    input.addEventListener('input', () => highlightRange(input));
  });
}

/**
 * Collect form data from the data entry form.
 * @param {HTMLElement} container - The form container
 * @returns {Map<string, number|string>} Map of loincCode -> numeric value or string
 */
export function collectFormData(container) {
  const data = new Map();
  container.querySelectorAll('input[data-loinc]').forEach(input => {
    const val = input.value.trim();
    if (val === '') return;
    if (input.dataset.resultType === 'text') {
      data.set(input.dataset.loinc, val);
    } else {
      const num = parseFloat(val);
      if (!isNaN(num)) data.set(input.dataset.loinc, num);
    }
  });
  return data;
}

/**
 * Fill form fields with autocomplete values.
 * @param {HTMLElement} container - The form container
 * @param {Map<string, number|string>} values - Map of loincCode -> value
 */
export function fillFormValues(container, values) {
  container.querySelectorAll('input[data-loinc]').forEach(input => {
    const loinc = input.dataset.loinc;
    if (values.has(loinc)) {
      input.value = values.get(loinc);
      if (input.type === 'number') highlightRange(input);
    }
  });
}

/**
 * Show a toast notification.
 * @param {HTMLElement} toastContainer
 * @param {string} msg
 * @param {'ok'|'warn'|'err'} tone
 */
export function showToast(toastContainer, msg, tone = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), CONFIG.UI.toastTimeout);
}

// ── Private helpers ─────────────────────────────────────────────────

function stepForDecimals(dp) {
  if (!dp || dp <= 0) return '1';
  return (1 / Math.pow(10, dp)).toString();
}

function highlightRange(input) {
  const val = parseFloat(input.value);
  const low = parseFloat(input.dataset.low);
  const high = parseFloat(input.dataset.high);
  if (isNaN(val) || (isNaN(low) && isNaN(high))) {
    input.classList.remove('out-of-range');
    return;
  }
  const outOfRange = (!isNaN(low) && val < low) || (!isNaN(high) && val > high);
  input.classList.toggle('out-of-range', outOfRange);
}
