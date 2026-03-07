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
  pickPatient,
  outstandingServiceRequests,
  tasksByFocusMap,
  requesterDetails,
  getPregnancyStatusDetail,
  srDisplay,
  srSnomedCode,
  bestNote,
  isPathology,
  isImaging
} from './fhir-helpers.js';
import { snomedSubsumes, ensureFastingSet } from './terminology.js';
import { submitTaskUpdates, ensureOrganization } from './fhir-client.js';

// Internal state
let currentBundle = null;
let currentBase = '';
let currentGetFillerOrg = null;

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


// Coded businessStatus values from AU eRequesting Task Business Status ValueSet
const BUSINESS_STATUS = {
  specimenCollected: {
    coding: [{
      system: 'http://terminology.hl7.org.au/CodeSystem/au-erequesting-task-businessstatus',
      code: 'specimen-collected',
      display: 'Specimen Collected'
    }]
  },
  serviceBooked: {
    coding: [{
      system: 'http://terminology.hl7.org.au/CodeSystem/au-erequesting-task-businessstatus',
      code: 'service-booked',
      display: 'Service Booked'
    }]
  },
  requestDataIssue: {
    coding: [{
      system: 'http://terminology.hl7.org.au/CodeSystem/au-erequesting-task-businessstatus',
      code: 'request-data-issue',
      display: 'Request Data Issue'
    }]
  }
};

/**
 * Get the appropriate businessStatus for a ServiceRequest category
 * @param {Object} sr - ServiceRequest resource
 * @returns {Object} Coded businessStatus
 */
function businessStatusForSR(sr) {
  if (isImaging(sr)) return BUSINESS_STATUS.serviceBooked;
  return BUSINESS_STATUS.specimenCollected;
}

/**
 * Check if a task is already claimed (accepted or further along)
 * @param {Object} task - Task resource
 * @returns {boolean}
 */
function isTaskClaimed(task) {
  return task && ['accepted', 'in-progress', 'completed'].includes(task.status);
}

/**
 * Find the Task Group resource in the current bundle
 * @returns {Object|null} Task Group resource
 */
function findGroupTask() {
  if (!currentBundle?.entry) return null;
  return currentBundle.entry
    .map(e => e.resource)
    .find(r => {
      if (r?.resourceType !== 'Task') return false;
      const profs = r.meta?.profile || [];
      const tags = r.meta?.tag || [];
      return profs.some(p => /au-?e?request(ing)?-?task-?group/i.test(p))
        || tags.some(t => /fulfil?ment-?task-?group/i.test(t.code || ''))
        || (!r.focus && !!r.groupIdentifier);
    }) || null;
}

/**
 * Update the Task Group status to reflect child task statuses
 * @param {Object} groupTask - Task Group resource
 * @param {Object} fillerRef - FHIR Reference for filler organization
 * @returns {Object|null} Updated Task Group clone, or null if no update needed
 */
function prepareGroupTaskUpdate(groupTask, fillerRef) {
  if (!groupTask?.id) return null;

  // Collect all child task statuses from the bundle
  const childTasks = (currentBundle?.entry || [])
    .map(e => e.resource)
    .filter(r => r?.resourceType === 'Task' && r.id !== groupTask.id && r.partOf?.some(
      p => p.reference === `Task/${groupTask.id}` || p.reference?.endsWith(`/Task/${groupTask.id}`)
    ));

  if (!childTasks.length) return null;

  // Determine the most appropriate status
  const statuses = childTasks.map(t => t.status);
  let newStatus;
  if (statuses.every(s => s === 'accepted' || s === 'in-progress' || s === 'completed')) {
    newStatus = 'accepted';
  } else if (statuses.some(s => s === 'accepted' || s === 'in-progress')) {
    newStatus = 'accepted';
  } else {
    newStatus = groupTask.status; // no change
  }

  if (newStatus === groupTask.status) return null;

  const upd = window.structuredClone
    ? structuredClone(groupTask)
    : JSON.parse(JSON.stringify(groupTask));
  upd.status = newStatus;
  upd.lastModified = new Date().toISOString();
  upd.owner = fillerRef;
  delete upd.statusReason;
  return upd;
}

/**
 * Execute a claim action for a set of items
 * @param {Array} items - Array of {sr, task} to claim
 * @param {string} currentBase - FHIR base URL
 * @param {Function} getFillerOrg - Function returning org config
 * @param {HTMLButtonElement} btn - Button to update
 * @param {string} label - Button label (e.g. "Claim All Pathology")
 */
async function executeClaim(items, currentBase, getFillerOrg, btn, label) {
  if (!currentBase) {
    showToast('No FHIR server base available for updates.', 'err');
    return;
  }

  const claimable = items.filter(({ task }) => task?.id && !isTaskClaimed(task));
  if (!claimable.length) {
    showToast('Nothing to claim.', 'warn');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Claiming\u2026';

  try {
    const orgConfig = getFillerOrg();
    const fillerRef = await ensureOrganization(currentBase, orgConfig);

    // Prepare updates per item with category-appropriate businessStatus
    const toUpdate = [];
    const nowIso = new Date().toISOString();
    for (const { sr, task } of claimable) {
      const upd = window.structuredClone
        ? structuredClone(task)
        : JSON.parse(JSON.stringify(task));
      upd.status = 'accepted';
      upd.businessStatus = businessStatusForSR(sr);
      upd.lastModified = nowIso;
      upd.owner = fillerRef;
      delete upd.statusReason;
      toUpdate.push(upd);
    }

    // Also update Task Group if present
    const groupTask = findGroupTask();
    // Temporarily update local child tasks so group status calculation sees new statuses
    for (const upd of toUpdate) {
      const idx = currentBundle.entry.findIndex(
        e => e.resource?.resourceType === 'Task' && e.resource.id === upd.id
      );
      if (idx >= 0) currentBundle.entry[idx].resource = upd;
    }
    const groupUpdate = prepareGroupTaskUpdate(groupTask, fillerRef);
    if (groupUpdate) toUpdate.push(groupUpdate);

    await submitTaskUpdates(currentBase, toUpdate);

    // Update local bundle
    updateLocalTasks(toUpdate);

    btn.textContent = 'Claimed';
    showToast(`${label}: ${claimable.length} task${claimable.length > 1 ? 's' : ''} accepted.`, 'ok');
    renderBundle(currentBundle, null, null, null);
  } catch (err) {
    console.error(err);
    showToast(`${label} failed. See console.`, 'err');
    btn.disabled = false;
    btn.textContent = label;
  }
}

/**
 * Execute a reject action for a single task
 * @param {Object} task - Task resource to reject
 * @param {string} reason - Rejection reason text
 * @param {string} currentBase - FHIR base URL
 * @param {Function} getFillerOrg - Function returning org config
 */
async function executeReject(task, reason, currentBase, getFillerOrg) {
  if (!currentBase) {
    showToast('No FHIR server base available for updates.', 'err');
    return;
  }
  if (!task?.id) {
    showToast('Cannot reject: no Task resource.', 'err');
    return;
  }

  try {
    const orgConfig = getFillerOrg();
    const fillerRef = await ensureOrganization(currentBase, orgConfig);

    const upd = window.structuredClone
      ? structuredClone(task)
      : JSON.parse(JSON.stringify(task));
    upd.status = 'rejected';
    upd.businessStatus = BUSINESS_STATUS.requestDataIssue;
    upd.statusReason = { text: reason || 'Rejected by filler' };
    upd.lastModified = new Date().toISOString();
    upd.owner = fillerRef;

    const allUpdates = [upd];

    // Update local so group calc sees it
    const idx = currentBundle.entry.findIndex(
      e => e.resource?.resourceType === 'Task' && e.resource.id === upd.id
    );
    if (idx >= 0) currentBundle.entry[idx].resource = upd;

    const groupTask = findGroupTask();
    const groupUpdate = prepareGroupTaskUpdate(groupTask, fillerRef);
    if (groupUpdate) allUpdates.push(groupUpdate);

    await submitTaskUpdates(currentBase, allUpdates);
    updateLocalTasks(allUpdates);

    showToast(`Task rejected.`, 'ok');
    renderBundle(currentBundle, null, null, null);
  } catch (err) {
    console.error(err);
    showToast('Reject failed. See console.', 'err');
  }
}

/**
 * Render grouped requisitions with selective claiming
 * @param {Object} bundle - FHIR Bundle
 * @param {Array} list - Array of ServiceRequest resources
 * @param {string} currentBase - FHIR base URL
 * @param {Function} getFillerOrg - Function returning filler org config
 */
export function renderRequestsGrouped(bundle, list, currentBase, getFillerOrg) {
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

    // Classify items
    const pathItems = group.items.filter(({ sr }) => isPathology(sr));
    const imagItems = group.items.filter(({ sr }) => isImaging(sr));
    const otherItems = group.items.filter(({ sr }) => !isPathology(sr) && !isImaging(sr));

    const hasPath = pathItems.length > 0;
    const hasImag = imagItems.length > 0;
    const isMixed = hasPath && hasImag;
    const isAllPath = hasPath && !hasImag && !otherItems.length;
    const isAllImag = !hasPath && hasImag && !otherItems.length;

    // Requisition-level metadata
    const authoredCandidates = [],
      pregCodes = new Set(),
      pregLabels = new Set();
    let reqName = '\u2014',
      reqAddress = '\u2014',
      clinicalNote = '';

    for (const { sr, task } of group.items) {
      if (task?.authoredOn) authoredCandidates.push(task.authoredOn);
      if (sr?.authoredOn) authoredCandidates.push(sr.authoredOn);

      const det = getPregnancyStatusDetail(sr, bundle);
      if (det.code) pregCodes.add(det.code);
      if (det.label) pregLabels.add(det.label.toLowerCase());

      if (reqName === '\u2014' && sr?.requester) {
        const d = requesterDetails(sr, bundle);
        reqName = d.name || '\u2014';
        reqAddress = d.address || '\u2014';
      }

      const n = bestNote(sr);
      if (n && n.length > clinicalNote.length) clinicalNote = n;
    }

    let authored = '\u2014';
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
    const allClaimed = group.items.length > 0 && group.items.every(({ task }) => isTaskClaimed(task));

    // Group shell
    const gId = safeId(`${reqNo}_${gIndex}`);
    const gEl = document.createElement('div');
    gEl.className = 'req-group';

    // Build claim buttons HTML based on group composition
    let claimButtonsHtml = '';
    if (isAllPath || (!hasPath && !hasImag)) {
      // All pathology (or uncategorised): single Claim All
      claimButtonsHtml = `<button class="btn btn-claim" data-claim="all" ${allClaimed ? 'disabled' : ''}>${allClaimed ? 'Claimed' : 'Claim All'}</button>`;
    } else if (isAllImag) {
      // All imaging: Claim All + individual per row
      const allImagClaimed = imagItems.every(({ task }) => isTaskClaimed(task));
      claimButtonsHtml = `<button class="btn btn-claim" data-claim="all" ${allImagClaimed ? 'disabled' : ''}>${allImagClaimed ? 'Claimed' : 'Claim All'}</button>`;
    } else if (isMixed) {
      // Mixed: Claim All Pathology + Claim All Imaging
      const allPathClaimed = pathItems.every(({ task }) => isTaskClaimed(task));
      const allImagClaimed = imagItems.every(({ task }) => isTaskClaimed(task));
      claimButtonsHtml = `
        <button class="btn btn-claim" data-claim="pathology" ${allPathClaimed ? 'disabled' : ''}>${allPathClaimed ? 'Pathology Claimed' : 'Claim All Pathology'}</button>
        <button class="btn btn-claim" data-claim="imaging" ${allImagClaimed ? 'disabled' : ''}>${allImagClaimed ? 'Imaging Claimed' : 'Claim All Imaging'}</button>`;
      if (otherItems.length) {
        const allOtherClaimed = otherItems.every(({ task }) => isTaskClaimed(task));
        claimButtonsHtml += `<button class="btn btn-claim" data-claim="other" ${allOtherClaimed ? 'disabled' : ''}>${allOtherClaimed ? 'Other Claimed' : 'Claim All Other'}</button>`;
      }
    }

    gEl.innerHTML = `
      <div class="req-gh">
        <div class="req-gtitle">Requisition: ${escapeHtml(group.title)}</div>
        <div class="grp-actions">
          ${claimButtonsHtml}
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
          <span style="opacity:.8">\u2014 ${escapeHtml(reqAddress)}</span>
        </div>
        ${clinicalNote ? `<div class="meta-row"><strong>Clinical note:</strong> <span>${escapeHtml(clinicalNote)}</span></div>` : ''}
        <div class="alerts" id="${gId}_alerts"></div>
      </div>

      <div class="req-list"></div>
    `;

    const listEl = gEl.querySelector('.req-list');
    const alertsEl = gEl.querySelector(`#${gId}_alerts`);
    const fastingBox = gEl.querySelector(`#${gId}_fasting`);

    // Render SR rows
    const rows = [];
    for (let i = 0; i < group.items.length; i++) {
      const { sr, task } = group.items[i];
      const [srLabel, srTone] = humanStatus(sr.status);
      const [tLabel, tTone] = humanStatus(task?.status);
      const bStat = task?.businessStatus?.coding?.[0]?.display || task?.businessStatus?.text || '';
      const [prioLabel, prioTone] = humanPriority(sr.priority);
      const title = srDisplay(sr);
      const code = srSnomedCode(sr);
      const noteInline = bestNote(sr);
      const isSrImaging = isImaging(sr);
      const claimed = isTaskClaimed(task);

      const row = document.createElement('div');
      row.className = 'req';
      row.dataset.code = code || '';
      row.dataset.title = (title || '').toLowerCase();

      // Individual claim/reject buttons for imaging rows (or all rows in mixed mode)
      let rowActionsHtml = '';
      if (task?.id) {
        const rowBtns = [];
        if ((hasImag) && isSrImaging) {
          rowBtns.push(`<button class="btn btn-claim btn-sm" data-claim-row="${i}" ${claimed ? 'disabled' : ''}>${claimed ? 'Claimed' : 'Claim'}</button>`);
        }
        if (!claimed) {
          rowBtns.push(`<button class="btn btn-reject btn-sm" data-reject-row="${i}">Reject</button>`);
        }
        if (rowBtns.length) rowActionsHtml = `<div class="row-actions">${rowBtns.join('')}</div>`;
      }

      row.innerHTML = `
        <div class="req-head">
          <div class="req-title">${escapeHtml(title)}${isSrImaging ? ' <span class="badge">Imaging</span>' : isPathology(sr) ? ' <span class="badge">Pathology</span>' : ''}</div>
          <div class="badges">
            ${prioLabel ? `<span class="badge ${prioTone}" title="ServiceRequest.priority">${escapeHtml(prioLabel)}</span>` : ''}
            <span class="badge ${srTone}" title="ServiceRequest.status">${escapeHtml(srLabel)}</span>
            <span class="badge ${tTone}" title="Task.status">${escapeHtml(tLabel)}</span>
          </div>
        </div>
        ${bStat ? `<div class="note"><strong>Task business status:</strong> ${escapeHtml(bStat)}</div>` : ''}
        ${noteInline && noteInline !== clinicalNote ? `<div class="note">${escapeHtml(noteInline)}</div>` : ''}
        <div class="note fasting-note js-fasting-note" style="display:none">Patient should be fasting prior to collection.</div>
        ${rowActionsHtml}
      `;
      listEl.appendChild(row);
      rows.push({ row, code, titleLower: (title || '').toLowerCase() });
    }

    // Wire up individual claim buttons
    listEl.querySelectorAll('[data-claim-row]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.claimRow, 10);
        const item = group.items[idx];
        if (!item) return;
        await executeClaim([item], currentBase, getFillerOrg, btn, `Claim ${srDisplay(item.sr)}`);
      });
    });

    // Wire up reject buttons
    listEl.querySelectorAll('[data-reject-row]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.rejectRow, 10);
        const item = group.items[idx];
        if (!item?.task) return;
        const reason = prompt('Reason for rejection (optional):') ?? '';
        btn.disabled = true;
        btn.textContent = 'Rejecting\u2026';
        await executeReject(item.task, reason, currentBase, getFillerOrg);
      });
    });

    // Wire up group-level claim buttons
    gEl.querySelectorAll('[data-claim]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const scope = btn.dataset.claim;
        let targetItems;
        if (scope === 'pathology') targetItems = pathItems;
        else if (scope === 'imaging') targetItems = imagItems;
        else if (scope === 'other') targetItems = otherItems;
        else targetItems = group.items;

        const label = scope === 'all' ? `Requisition ${reqNo}` : `${scope.charAt(0).toUpperCase() + scope.slice(1)} \u2014 ${reqNo}`;
        await executeClaim(targetItems, currentBase, getFillerOrg, btn, label);
      });
    });

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
      currentBundle.entry.push({ fullUrl: `Task/${t.id}`, resource: t });
    }
  }
}

/**
 * Render a complete bundle (patient + requisitions)
 * @param {Object} bundle - FHIR Bundle
 * @param {string} currentBase - FHIR base URL
 * @param {Function} getFillerOrg - Function returning filler org config
 * @param {HTMLElement} statusEl - Status element to update
 */
export function renderBundle(bundle, base, getFillerOrg, statusEl) {
  currentBundle = bundle;
  if (base) currentBase = base;
  if (getFillerOrg) currentGetFillerOrg = getFillerOrg;
  if (statusEl) statusEl.textContent = '';

  if (!bundle || bundle.resourceType !== 'Bundle') {
    throw new Error('Input is not a FHIR Bundle.');
  }

  const patient = pickPatient(bundle);
  if (!patient) {
    document.querySelector('#pt-name').textContent = '\u2014';
    document.querySelector('#pt-line').textContent = '\u2014';
    document.querySelector('#pt-dob').textContent = '\u2014';
    document.querySelector('#pt-age').textContent = '\u2014';
    document.querySelector('#pt-gender').textContent = '\u2014';
    document.querySelector('#pt-address').textContent = '\u2014';
    document.querySelector('#avatar').textContent = 'PT';
  } else {
    renderPatient(patient);
  }

  const srs = outstandingServiceRequests(bundle, patient);
  renderRequestsGrouped(bundle, srs, currentBase, currentGetFillerOrg);
}
