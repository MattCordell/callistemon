/**
 * @module ui-panels
 * @description Render patient list, report list, and patient banner
 */

import { escapeHtml, fmtDate, fmtDateTime, fmtName, calcAge, fmtAddress } from './formatters.js';

/**
 * Render the patient list in the sidebar.
 */
export function renderPatientList(container, patients, onSelect) {
  if (!patients.length) {
    container.innerHTML = '<p class="text-gray-400 text-sm p-3">No patients found</p>';
    return;
  }

  container.innerHTML = patients.map((entry, idx) => {
    const p = entry.patient;
    const name = p.name ? fmtName(p.name[0]) : `Patient/${p.id}`;
    return `
      <button class="patient-item w-full text-left px-3 py-2 rounded-lg hover:bg-gray-700
                      transition-colors border border-transparent hover:border-gray-600"
              data-idx="${idx}">
        <div class="font-medium text-sm text-gray-100">${escapeHtml(name)}</div>
        <div class="text-xs text-gray-400 mt-0.5">
          ${entry.reportCount} reports &middot; Latest: ${escapeHtml(fmtDate(entry.latestDate))}
        </div>
      </button>`;
  }).join('');

  container.querySelectorAll('.patient-item').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.patient-item').forEach(b => {
        b.classList.remove('bg-gray-700', 'border-blue-500');
        b.classList.add('border-transparent');
      });
      btn.classList.add('bg-gray-700', 'border-blue-500');
      btn.classList.remove('border-transparent');
      onSelect(patients[parseInt(btn.dataset.idx)]);
    });
  });
}

/**
 * Render the report list for a selected patient.
 */
export function renderReportList(container, reports, onSelect) {
  if (!reports.length) {
    container.innerHTML = '<p class="text-gray-400 text-sm p-3">No reports found</p>';
    return;
  }

  container.innerHTML = reports.map((r, idx) => {
    const date = r.effectiveDateTime || r.issued || '';
    const codeText = r.code?.text || r.code?.coding?.[0]?.display || 'Report';
    const performer = r.performer?.[0]?.display || '';
    return `
      <button class="report-item w-full text-left px-3 py-2 rounded-lg hover:bg-gray-700
                      transition-colors border border-transparent hover:border-gray-600"
              data-idx="${idx}" title="${escapeHtml(fmtDateTime(date))}">
        <div class="font-medium text-sm text-gray-100">${escapeHtml(codeText)}</div>
        <div class="text-xs text-gray-400 mt-0.5">
          ${escapeHtml(fmtDate(date))}${performer ? ' &middot; ' + escapeHtml(performer) : ''}
        </div>
      </button>`;
  }).join('');

  container.querySelectorAll('.report-item').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.report-item').forEach(b => {
        b.classList.remove('bg-gray-700', 'border-blue-500');
        b.classList.add('border-transparent');
      });
      btn.classList.add('bg-gray-700', 'border-blue-500');
      btn.classList.remove('border-transparent');
      onSelect(reports[parseInt(btn.dataset.idx)], parseInt(btn.dataset.idx));
    });
  });
}

/**
 * Render the patient banner.
 */
export function renderPatientBanner(container, patient) {
  if (!patient) {
    container.innerHTML = '';
    return;
  }

  const name = patient.name ? fmtName(patient.name[0]) : `Patient/${patient.id}`;
  const initials = getInitials(patient);
  const dob = patient.birthDate || '';
  const gender = patient.gender || '\u2014';
  const ihi = getIhi(patient);
  const address = fmtAddress(patient.address);

  container.innerHTML = `
    <div class="flex items-center gap-4 bg-gray-800 rounded-xl p-4 border border-gray-700">
      <div class="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center
                  text-white font-bold text-lg shrink-0">${escapeHtml(initials)}</div>
      <div class="min-w-0">
        <div class="flex items-baseline gap-3 flex-wrap">
          <span class="font-semibold text-gray-100">${escapeHtml(name)}</span>
          <span class="text-xs text-gray-400">${escapeHtml(ihi)}</span>
        </div>
        <div class="flex gap-4 text-xs text-gray-400 mt-1 flex-wrap">
          <span><b class="text-gray-500">DOB</b> ${escapeHtml(fmtDate(dob))}</span>
          <span><b class="text-gray-500">Age</b> ${calcAge(dob)}</span>
          <span><b class="text-gray-500">Gender</b> ${escapeHtml(gender)}</span>
          <span><b class="text-gray-500">Address</b> ${escapeHtml(address)}</span>
        </div>
      </div>
    </div>`;
}

function getInitials(patient) {
  const n = patient.name?.[0];
  if (!n) return '?';
  const g = Array.isArray(n.given) ? n.given[0] : '';
  const f = n.family || '';
  return ((g[0] || '') + (f[0] || '')).toUpperCase() || '?';
}

function getIhi(patient) {
  const ids = patient.identifier || [];
  const ihi = ids.find(i => i.system === 'http://ns.electronichealth.net.au/id/hi/ihi/1.0');
  if (ihi) return `IHI: ${ihi.value}`;
  return ids[0] ? `${ids[0].system?.split('/').pop() || 'ID'}: ${ids[0].value}` : '';
}

/**
 * Show a toast notification.
 */
export function showToast(container, message, tone = 'ok') {
  const colors = {
    ok: 'bg-green-800 border-green-600',
    warn: 'bg-yellow-800 border-yellow-600',
    err: 'bg-red-800 border-red-600'
  };
  const el = document.createElement('div');
  el.className = `px-4 py-2 rounded-lg border text-sm text-gray-100 shadow-lg ${colors[tone] || colors.ok}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
