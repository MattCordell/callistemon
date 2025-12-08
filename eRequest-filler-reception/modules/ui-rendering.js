/**
 * @module ui-rendering
 * @description DOM manipulation and UI rendering
 *
 * Provides functions for:
 * - Patient identity rendering
 * - Requisition grouping and display
 * - Claim workflow orchestration
 * - Toast notifications
 * - Local bundle updates
 *
 * @requires config
 * @requires formatters
 * @requires fhir-helpers
 * @requires terminology
 * @requires fhir-client
 */

import { CONFIG } from '../config.js';
import {
  escapeHtml,
  fmtName,
  fmtDateTime,
  calcAge,
  fmtAddress,
  toDataUri,
  safeId,
  humanStatus,
  humanPriority
} from './formatters.js';
import {
  makeResolver,
  pickPatient,
  outstandingServiceRequests,
  tasksByFocusMap,
  requesterDetails,
  getPregnancyStatusDetail,
  srDisplay,
  srSnomedCode,
  bestNote,
  relRefString
} from './fhir-helpers.js';
import { snomedSubsumes, ensureFastingSet } from './terminology.js';
import { submitClaimTransaction } from './fhir-client.js';

// Internal state - current bundle
let currentBundle = null;

/**
 * Get the current bundle
 * @returns {Object|null} Current FHIR Bundle
 */
export function getCurrentBundle() {
  return currentBundle;
}

/**
 * Set the current bundle
 * @param {Object} bundle - FHIR Bundle
 */
export function setCurrentBundle(bundle) {
  currentBundle = bundle;
}

/**
 * Show a toast notification
 * @param {string} msg - Message to display
 * @param {string} tone - Toast tone: 'ok', 'warn', 'err'
 * @param {number} timeout - Display duration in milliseconds
 */
export function showToast(msg, tone = 'ok', timeout = CONFIG.UI.toastTimeout) {
  const host = document.querySelector('#toast');
  if (!host) return;

  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = msg;
  host.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .2s';
  }, timeout - 200);

  setTimeout(() => {
    el.remove();
  }, timeout);
}

/**
 * Render patient identity card
 * @param {Object} patient - FHIR Patient resource
 */
export function renderPatient(patient) {
  const name = fmtName(patient.name?.[0] || patient.name);

  document.querySelector('#pt-name').textContent = name;
  document.querySelector('#pt-dob').textContent = patient.birthDate || '—';
  document.querySelector('#pt-age').textContent = calcAge(patient.birthDate);
  document.querySelector('#pt-gender').textContent = patient.gender
    ? patient.gender[0].toUpperCase() + patient.gender.slice(1)
    : '—';
  document.querySelector('#pt-address').textContent = fmtAddress(patient.address);

  const ident = (patient.identifier || [])
    .map(id => {
      const type = id.type?.text || id.type?.coding?.[0]?.display;
      const sys = id.system ? id.system.split('/').pop() : '';
      const val = id.value;
      if (!val) return null;
      return type ? `${type}: ${val}` : sys ? `${sys}: ${val}` : val;
    })
    .filter(Boolean);

  document.querySelector('#pt-line').textContent = ident[0] || '—';

  const av = document.querySelector('#avatar');
  av.innerHTML = '';
  const uri = patient.photo?.length ? toDataUri(patient.photo[0]) : null;
  if (uri) {
    const img = new Image();
    img.alt = 'Patient photo';
    img.src = uri;
    av.appendChild(img);
  } else {
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .map(s => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'PT';
    av.textContent = initials;
  }
}

/**
 * Prepare claim updates for a requisition group
 * @param {Object} group - Requisition group object
 * @param {Object} bundle - FHIR Bundle
 * @param {Object} fillerRef - Filler organization reference
 * @param {string} reqNo - Requisition number
 * @returns {Object} {toCreate, toUpdate, srPuts}
 */
function prepareClaimUpdates(group, bundle, fillerRef, reqNo) {
  const nowIso = new Date().toISOString();
  const toCreate = [];
  const toUpdate = [];
  const srPuts = [];

  let exemplarGroupId = null;
  for (const { task } of group.items) {
    if (task?.groupIdentifier) {
      exemplarGroupId = task.groupIdentifier;
      break;
    }
  }

  for (const { sr, task } of group.items) {
    // Tasks
    if (task && task.id) {
      const upd = window.structuredClone
        ? structuredClone(task)
        : JSON.parse(JSON.stringify(task));
      upd.status = 'in-progress';
      upd.businessStatus = { text: 'collected' };
      upd.lastModified = nowIso;
      upd.owner = fillerRef;
      toUpdate.push(upd);
    } else {
      const focusRef = `ServiceRequest/${sr.id}`;
      const patRef = relRefString(sr.subject || {});
      const newTask = {
        resourceType: 'Task',
        intent: 'order',
        status: 'in-progress',
        businessStatus: { text: 'collected' },
        authoredOn: sr.authoredOn || nowIso,
        lastModified: nowIso,
        owner: fillerRef,
        focus: { reference: focusRef },
        ...(patRef && patRef.startsWith('Patient/')
          ? { for: { reference: patRef } }
          : {}),
        ...(exemplarGroupId
          ? { groupIdentifier: exemplarGroupId }
          : reqNo && reqNo !== 'Ungrouped'
          ? { groupIdentifier: { value: reqNo } }
          : {})
      };
      toCreate.push(newTask);
    }

    // SR.performer
    const srClone = window.structuredClone
      ? structuredClone(sr)
      : JSON.parse(JSON.stringify(sr));
    const perf = Array.isArray(srClone.performer) ? srClone.performer : [];
    const exists = perf.some(
      p =>
        (p.identifier?.system === fillerRef.identifier.system &&
          p.identifier?.value === fillerRef.identifier.value) ||
        (p.display && p.display === fillerRef.display)
    );
    if (!exists) {
      perf.push({ identifier: fillerRef.identifier, display: fillerRef.display });
      srClone.performer = perf;
      srPuts.push(srClone);
    }
  }

  return { toCreate, toUpdate, srPuts };
}

/**
 * Update UI after successful claim
 * @param {HTMLButtonElement} claimBtn - Claim button element
 * @param {string} reqNo - Requisition number
 * @param {Object} counts - {created, updated, srUpdates}
 */
function updateUIAfterClaim(claimBtn, reqNo, counts) {
  claimBtn.textContent = 'Claimed';
  claimBtn.disabled = true;

  showToast(
    `Requisition ${reqNo}: created ${counts.created}, updated ${counts.updated}, SR performer updates ${counts.srUpdates}.`,
    'ok'
  );

  renderBundle(currentBundle);
}

/**
 * Render grouped requisitions
 * @param {Object} bundle - FHIR Bundle
 * @param {Array} list - Array of ServiceRequest resources
 * @param {string} currentBase - FHIR base URL
 * @param {Function} getFillerRef - Function to get selected filler reference
 */
export function renderRequestsGrouped(bundle, list, currentBase, getFillerRef) {
  const host = document.querySelector('#reqs');
  host.innerHTML = '';

  if (!list.length) {
    host.innerHTML =
      '<div class="empty">No outstanding requests found for this patient.</div>';
    return;
  }

  const tMap = tasksByFocusMap(bundle);

  // Group by Task.groupIdentifier
  const groups = new Map();
  for (const sr of list) {
    const key = `ServiceRequest/${sr.id}`;
    const tasks = tMap.get(key) || [];
    const theTask = tasks[0] || null;
    const gi = theTask?.groupIdentifier || {};
    const reqNo = gi.value || gi.id || 'Ungrouped';
    if (!groups.has(reqNo)) groups.set(reqNo, { title: reqNo, items: [] });
    groups.get(reqNo).items.push({ sr, task: theTask });
  }

  let gIndex = 0;
  for (const [reqNo, group] of groups) {
    gIndex++;

    // Requisition-level metadata
    const authoredCandidates = [],
      pregCodes = new Set(),
      pregLabels = new Set();
    let reqName = '—',
      reqAddress = '—',
      clinicalNote = '',
      exemplarGroupId = null;

    for (const { sr, task } of group.items) {
      if (task?.authoredOn) authoredCandidates.push(task.authoredOn);
      if (sr?.authoredOn) authoredCandidates.push(sr.authoredOn);
      if (!exemplarGroupId && task?.groupIdentifier)
        exemplarGroupId = task.groupIdentifier;

      const det = getPregnancyStatusDetail(sr, bundle);
      if (det.code) pregCodes.add(det.code);
      if (det.label) pregLabels.add(det.label.toLowerCase());

      if (reqName === '—' && sr?.requester) {
        const d = requesterDetails(sr, bundle);
        reqName = d.name || '—';
        reqAddress = d.address || '—';
      }

      const n = bestNote(sr);
      if (n && n.length > clinicalNote.length) clinicalNote = n;
    }

    let authored = '—';
    if (authoredCandidates.length) {
      const dates = authoredCandidates
        .map(s => new Date(s))
        .filter(d => !isNaN(d))
        .sort((a, b) => a - b);
      if (dates.length) authored = fmtDateTime(dates[0].toISOString());
    }

    const hasKnownNotPreg =
      pregCodes.has(CONFIG.TERMINOLOGY.codes.notPregnant) ||
      pregLabels.has('not pregnant');
    const hasAnyPregEvidence =
      [...pregLabels].some(l => l.includes('pregnant') && l !== 'not pregnant') ||
      [...pregCodes].some(c => c !== CONFIG.TERMINOLOGY.codes.notPregnant);
    const pregIsUnspecified = !hasKnownNotPreg && !hasAnyPregEvidence;
    const pregForDisplay =
      hasKnownNotPreg && !hasAnyPregEvidence
        ? 'not pregnant'
        : pregIsUnspecified
        ? 'unspecified'
        : [...pregLabels].join(', ');
    const pregIsNotPregnant = hasKnownNotPreg && !hasAnyPregEvidence;

    // All claimed?
    const allClaimed =
      group.items.length > 0 &&
      group.items.every(
        ({ task }) =>
          task &&
          task.status === 'in-progress' &&
          (task.businessStatus?.text || '').toLowerCase() === 'collected'
      );

    // Group shell
    const gId = safeId(`${reqNo}_${gIndex}`);
    const gEl = document.createElement('div');
    gEl.className = 'req-group';
    gEl.innerHTML = `
      <div class="req-gh">
        <div class="req-gtitle">Requisition: ${escapeHtml(group.title)}</div>
        <div class="grp-actions">
          <button class="btn btn-claim" id="${gId}_claim" ${allClaimed ? 'disabled' : ''}>${allClaimed ? 'Claimed' : 'Claim'}</button>
          <span class="hint">${group.items.length} request${group.items.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div class="grp-meta">
        <div class="meta-row"><strong>Authored:</strong> <span>${escapeHtml(authored)}</span></div>
        <div class="meta-row"><strong>Pregnancy status:</strong> <span>${escapeHtml(pregForDisplay || 'unspecified')}</span></div>
        <div class="meta-row">
          <label class="inline"><input id="${gId}_fasting" type="checkbox" class="chk" /> Fasting</label>
        </div>
        <div class="meta-row">
          <strong>Requestor:</strong>
          <span>${escapeHtml(reqName)}</span>
          <span style="opacity:.8">— ${escapeHtml(reqAddress)}</span>
        </div>
        ${clinicalNote ? `<div class="meta-row"><strong>Clinical note:</strong> <span>${escapeHtml(clinicalNote)}</span></div>` : ''}
        <div class="alerts" id="${gId}_alerts"></div>
      </div>

      <div class="req-list"></div>
    `;

    const listEl = gEl.querySelector('.req-list');
    const alertsEl = gEl.querySelector(`#${gId}_alerts`);
    const fastingBox = gEl.querySelector(`#${gId}_fasting`);
    const claimBtn = gEl.querySelector(`#${gId}_claim`);

    // Render SR rows
    const rows = [];
    for (const { sr, task } of group.items) {
      const [srLabel, srTone] = humanStatus(sr.status);
      const [tLabel, tTone] = humanStatus(task?.status);
      const bStat = task?.businessStatus?.text || '';
      const [prioLabel, prioTone] = humanPriority(sr.priority);
      const title = srDisplay(sr);
      const code = srSnomedCode(sr);
      const noteInline = bestNote(sr);

      const row = document.createElement('div');
      row.className = 'req';
      row.dataset.code = code || '';
      row.dataset.title = (title || '').toLowerCase();
      row.innerHTML = `
        <div class="req-head">
          <div class="req-title">${escapeHtml(title)}</div>
          <div class="badges">
            ${prioLabel ? `<span class="badge ${prioTone}" title="ServiceRequest.priority">${escapeHtml(prioLabel)}</span>` : ''}
            <span class="badge ${srTone}" title="ServiceRequest.status">${escapeHtml(srLabel)}</span>
            <span class="badge ${tTone}" title="Task.status">${escapeHtml(tLabel)}</span>
          </div>
        </div>
        ${bStat ? `<div class="note"><strong>Task business status:</strong> ${escapeHtml(bStat)}</div>` : ''}
        ${noteInline && noteInline !== clinicalNote ? `<div class="note">${escapeHtml(noteInline)}</div>` : ''}
        <div class="note fasting-note js-fasting-note" style="display:none">Patient should be fasting prior to collection.</div>
      `;
      listEl.appendChild(row);
      rows.push({ row, code, titleLower: (title || '').toLowerCase() });
    }

    // Fasting behavior (unchecked by default)
    async function applyFastingState() {
      const need = !fastingBox.checked;
      for (const { row } of rows) row.querySelector('.js-fasting-note').style.display = 'none';
      if (!need) return;

      const fastingCodeSet = await ensureFastingSet();
      for (const { row, code, titleLower } of rows) {
        const match =
          (fastingCodeSet && code && fastingCodeSet.has(String(code))) ||
          titleLower.includes('fasting');
        if (match) row.querySelector('.js-fasting-note').style.display = '';
      }
    }

    fastingBox.addEventListener('change', applyFastingState);
    applyFastingState();

    // Radiation alerts (suppress when pregnancy is not-pregnant or unspecified)
    (async () => {
      try {
        let radiographicCount = 0;
        for (const { code } of rows) {
          if (
            await snomedSubsumes(CONFIG.TERMINOLOGY.codes.radiographicAncestor, code)
          ) {
            radiographicCount++;
          }
        }

        if (!pregIsNotPregnant && !pregIsUnspecified && radiographicCount >= 1) {
          const a = document.createElement('div');
          a.className = 'alert warn';
          a.textContent = 'Radiation + Pregnancy risk';
          alertsEl.appendChild(a);
        }

        if (radiographicCount > 3) {
          const a = document.createElement('div');
          a.className = 'alert warn';
          a.textContent = 'Radiation exposure';
          alertsEl.appendChild(a);
        }
      } catch (e) {
        /* ignore, keep UI */
      }
    })();

    // Claim behavior
    claimBtn.addEventListener('click', async () => {
      try {
        if (!currentBase) {
          showToast('No FHIR server base available for updates.', 'err');
          return;
        }

        const fillerRef = getFillerRef();
        const { toCreate, toUpdate, srPuts } = prepareClaimUpdates(
          group,
          bundle,
          fillerRef,
          reqNo
        );

        if (!toCreate.length && !toUpdate.length && !srPuts.length) {
          showToast('Nothing to claim for this requisition.', 'warn');
          return;
        }

        claimBtn.disabled = true;
        claimBtn.textContent = 'Claiming…';

        await submitClaimTransaction(currentBase, toCreate, toUpdate, srPuts);

        updateLocalTasks([...toCreate, ...toUpdate]);
        updateLocalServiceRequests(srPuts);

        updateUIAfterClaim(claimBtn, reqNo, {
          created: toCreate.length,
          updated: toUpdate.length,
          srUpdates: srPuts.length
        });
      } catch (err) {
        console.error(err);
        showToast(`Requisition ${reqNo}: claim failed. See console.`, 'err');
        claimBtn.disabled = false;
        claimBtn.textContent = 'Claim';
      }
    });

    // Mount group
    host.appendChild(gEl);
  }
}

/**
 * Update local bundle with modified Tasks
 * @param {Array} tasks - Array of Task resources
 */
export function updateLocalTasks(tasks) {
  if (!currentBundle?.entry) return;

  for (const t of tasks) {
    const idx = currentBundle.entry.findIndex(
      e => e.resource?.resourceType === 'Task' && e.resource.id === t.id
    );
    if (idx >= 0) {
      currentBundle.entry[idx].resource = t;
    } else {
      const fullUrl = t.id
        ? `Task/${t.id}`
        : `urn:uuid:${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      currentBundle.entry.push({ fullUrl, resource: t });
    }
  }
}

/**
 * Update local bundle with modified ServiceRequests
 * @param {Array} srs - Array of ServiceRequest resources
 */
export function updateLocalServiceRequests(srs) {
  if (!currentBundle?.entry || !srs?.length) return;

  for (const sr of srs) {
    const idx = currentBundle.entry.findIndex(
      e => e.resource?.resourceType === 'ServiceRequest' && e.resource.id === sr.id
    );
    if (idx >= 0) {
      currentBundle.entry[idx].resource = sr;
    }
  }
}

/**
 * Render a complete bundle (patient + requisitions)
 * @param {Object} bundle - FHIR Bundle
 * @param {string} currentBase - FHIR base URL
 * @param {Function} getFillerRef - Function to get selected filler reference
 * @param {HTMLElement} statusEl - Status element to update
 */
export function renderBundle(bundle, currentBase, getFillerRef, statusEl) {
  currentBundle = bundle;
  if (statusEl) statusEl.textContent = '';

  if (!bundle || bundle.resourceType !== 'Bundle') {
    throw new Error('Input is not a FHIR Bundle.');
  }

  const patient = pickPatient(bundle);
  if (!patient) {
    document.querySelector('#pt-name').textContent = '—';
    document.querySelector('#pt-line').textContent = '—';
    document.querySelector('#pt-dob').textContent = '—';
    document.querySelector('#pt-age').textContent = '—';
    document.querySelector('#pt-gender').textContent = '—';
    document.querySelector('#pt-address').textContent = '—';
    document.querySelector('#avatar').textContent = 'PT';
  } else {
    renderPatient(patient);
  }

  const srs = outstandingServiceRequests(bundle, patient);
  renderRequestsGrouped(bundle, srs, currentBase, getFillerRef);
}
