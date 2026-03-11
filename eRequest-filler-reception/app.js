/**
 * @module app
 * @description Main application orchestrator
 *
 * Ties together all modules and manages application state:
 * - DOM element caching
 * - Event listeners
 * - Mode switching (URL / Search / QR)
 * - Task loading workflows
 * - Patient search
 * - QR scanner integration
 */

import { CONFIG } from './config.js';
import * as FhirClient from './modules/fhir-client.js';
import * as FhirHelpers from './modules/fhir-helpers.js';
import * as UIRendering from './modules/ui-rendering.js';
import * as QRScanner from './modules/qr-scanner.js';
import { fmtName, escapeHtml } from './modules/formatters.js';
import { initAuthFetch, authHintFor, promptPasswordFor } from './modules/auth.js';

// ---------- Application State ----------
let currentBase = '';

// ---------- DOM Element Cache ----------
const by = sel => document.querySelector(sel);

const elements = {
  status: null,
  orgSelect: null,
  authManageBtn: null,
  authHint: null,
  // URL mode
  bundleUrl: null,
  loadUrlBtn: null,
  // Search mode
  baseUrl: null,
  patientQuery: null,
  results: null,
  // QR mode
  qrVideo: null,
  qrFile: null,
  startScanBtn: null,
  stopScanBtn: null,
  qrStatus: null,
  // Mode tabs
  modeBtns: {},
  panes: {}
};

/**
 * Get selected filler organization config
 * @returns {Object} Full org config entry from CONFIG.FILLER_ORGS
 */
function selectedFillerOrg() {
  const key = elements.orgSelect?.value || 'calli';
  return CONFIG.FILLER_ORGS[key] || CONFIG.FILLER_ORGS.calli;
}

/**
 * Set active mode (tab switching)
 * @param {string} mode - Mode to activate: 'url', 'search', 'qr'
 */
function setMode(mode) {
  for (const k of Object.keys(elements.modeBtns)) {
    const on = k === mode;
    elements.modeBtns[k].classList.toggle('active', on);
    elements.modeBtns[k].setAttribute('aria-selected', on);
    elements.panes[k].classList.toggle('hidden', !on);
  }
  if (mode !== 'qr') QRScanner.stopScan();
}

/**
 * Load and render a Task Group or Diagnostic Task from URL
 * @param {string} url - FHIR Task URL
 */
async function loadGroupTaskFromUrl(url) {
  elements.status.textContent = 'Fetching…';
  const base = FhirHelpers.inferBaseFromUrl(url);
  const task = await FhirClient.fetchJson(url);

  if (task?.resourceType !== 'Task') {
    throw new Error('URL does not resolve to a Task');
  }

  currentBase = base;

  let groupTask = null,
    groupKey = null,
    note = '';

  // Determine if this is a group task or diagnostic task
  if (FhirHelpers.isGroupTask(task)) {
    groupTask = task;
    groupKey = `Task/${task.id}`;
  } else if (Array.isArray(task.partOf) && task.partOf.length) {
    const grpRef = FhirHelpers.toTypeId(task.partOf[0]);
    groupTask = await FhirClient.getByRef(base, grpRef);
    groupKey = FhirHelpers.toTypeId(grpRef);
    note = 'Expanded from Diagnostic Task via partOf.';
  } else {
    groupTask = null;
    groupKey = null;
    note = 'Loaded a single Diagnostic Task (no partOf).';
  }

  // Get diagnostic request tasks
  let diagTasks = [];
  if (groupKey) {
    const grpId = groupKey.split('/')[1];
    diagTasks = await FhirClient.fetchDiagnosticTasksForGroup(base, grpId);
    if (!diagTasks.length && task.focus) diagTasks = [task]; // fallback
  } else {
    if (task.focus) diagTasks = [task]; // orphan diagnostic task
  }

  // Stamp missing groupIdentifier for UI grouping
  const stampedTasks = diagTasks.map(t => {
    if (!t.groupIdentifier) {
      const clone = JSON.parse(JSON.stringify(t));
      clone.groupIdentifier =
        groupTask?.groupIdentifier || { value: groupTask?.id || task.id || 'Requisition' };
      return clone;
    }
    return t;
  });

  // Determine patient (group.for preferred)
  let patient = null;
  if (groupTask?.for) patient = await FhirClient.getByRef(base, groupTask.for);
  else if (stampedTasks[0]?.for) patient = await FhirClient.getByRef(base, stampedTasks[0].for);

  // Fetch ServiceRequests and related
  const { srs, related } = await FhirClient.fetchServiceRequestsAndRelated(base, stampedTasks);

  // Compose and render
  const bundle = FhirHelpers.composeBundle(patient, srs, stampedTasks, related, groupTask || null);
  UIRendering.renderBundle(bundle, currentBase, selectedFillerOrg, elements.status);
  elements.status.textContent = 'Loaded ✓' + (note ? ` (${note})` : '');
}

/**
 * Run patient search
 * @param {string} query - Patient name query
 */
async function runPatientSearch(query) {
  const base = (elements.baseUrl.value || '').replace(/\/$/, '');
  if (!base) {
    elements.results.innerHTML = '<div class="res"><span>Enter server base URL first</span></div>';
    return;
  }

  elements.results.innerHTML = '<div class="res"><span>Searching…</span></div>';

  try {
    const url = `${base}/Patient?name=${encodeURIComponent(query)}&_count=10`;
    const bundle = await FhirClient.fetchJson(url);
    const entries = (bundle.entry || [])
      .map(e => e.resource)
      .filter(r => r?.resourceType === 'Patient');

    if (!entries.length) {
      elements.results.innerHTML = '<div class="res"><span>No matches</span></div>';
      return;
    }

    elements.results.innerHTML = entries
      .map(p => {
        const name = fmtName(p.name?.[0] || p.name);
        const dob = p.birthDate ? `DOB ${p.birthDate}` : '';
        const id = p.id || '';
        const ident = p.identifier?.[0]?.value || '';
        return `<div class="res" role="option" data-id="${id}">
          <div><div>${escapeHtml(name)}</div><div class="small">${escapeHtml(dob)}</div></div>
          <div class="small">${escapeHtml(ident || id)}</div>
        </div>`;
      })
      .join('');

    // Wire up click handlers for results
    for (const row of elements.results.querySelectorAll('.res')) {
      row.addEventListener('click', async () => {
        const id = row.getAttribute('data-id');
        elements.results.innerHTML = '';

        try {
          elements.status.textContent = 'Loading patient…';

          const [pt, srBundle] = await Promise.all([
            FhirClient.fetchJson(`${base}/Patient/${id}`),
            FhirClient.fetchJson(`${base}/ServiceRequest?subject=Patient/${id}&_count=100`)
          ]);

          const srResources = srBundle.entry?.map(e => e.resource) || [];

          // Fetch related tasks
          const tasks = [];
          for (const sr of srResources) {
            try {
              const taskBundle = await FhirClient.fetchJson(
                `${base}/Task?focus=ServiceRequest/${encodeURIComponent(sr.id)}&_count=50`
              );
              tasks.push(
                ...(taskBundle.entry || [])
                  .map(e => e.resource)
                  .filter(r => r?.resourceType === 'Task')
              );
            } catch (err) {
              console.warn('Failed to fetch tasks for SR', sr.id, err);
            }
          }

          const bundle = FhirHelpers.composeBundle(pt, srResources, tasks);
          currentBase = base;
          UIRendering.renderBundle(bundle, currentBase, selectedFillerOrg, elements.status);
          elements.status.textContent = 'Loaded ✓';
        } catch (err) {
          console.error(err);
          elements.status.textContent = 'Failed to load patient or requests.';
        }
      });
    }
  } catch (err) {
    console.error(err);
    elements.results.innerHTML =
      '<div class="res"><span>Search failed (CORS? see console)</span></div>';
  }
}

/**
 * Handle QR code detection
 * @param {string} value - Detected QR value
 */
function handleQrDetection(value) {
  if (!value) return;
  elements.qrStatus.textContent = 'QR found ✓';
  elements.bundleUrl.value = value;
  setMode('url');
  elements.loadUrlBtn.click();
}

/**
 * Initialize DOM element references
 */
function initElements() {
  elements.status = by('#status');
  elements.orgSelect = by('#orgSelect');
  elements.authManageBtn = by('#auth-manage');
  elements.authHint = by('#auth-hint');

  // URL mode
  elements.bundleUrl = by('#bundleUrl');
  elements.loadUrlBtn = by('#loadUrlBtn');

  // Search mode
  elements.baseUrl = by('#baseUrl');
  elements.patientQuery = by('#patientQuery');
  elements.results = by('#results');

  // QR mode
  elements.qrVideo = by('#qrVideo');
  elements.qrFile = by('#qrFile');
  elements.startScanBtn = by('#startScanBtn');
  elements.stopScanBtn = by('#stopScanBtn');
  elements.qrStatus = by('#qrStatus');

  // Mode tabs
  elements.modeBtns = {
    url: by('#mode-url'),
    search: by('#mode-search'),
    qr: by('#mode-qr')
  };
  elements.panes = {
    url: by('#pane-url'),
    search: by('#pane-search'),
    qr: by('#pane-qr')
  };
}

/**
 * Update auth hint text based on a URL
 * @param {string} url
 */
function updateAuthHint(url) {
  if (elements.authHint) {
    elements.authHint.textContent = authHintFor(url) || '';
  }
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
  // Auth button
  elements.authManageBtn?.addEventListener('click', () => {
    const url = (elements.bundleUrl?.value || elements.baseUrl?.value || '').trim();
    const msg = promptPasswordFor(url);
    if (msg === null) {
      elements.authHint.textContent = 'No auth needed for this server';
    } else {
      elements.authHint.textContent = msg;
      setTimeout(() => updateAuthHint(url), 1500);
    }
  });

  // Mode switching
  elements.modeBtns.url.addEventListener('click', () => setMode('url'));
  elements.modeBtns.search.addEventListener('click', () => setMode('search'));
  elements.modeBtns.qr.addEventListener('click', () => setMode('qr'));

  // URL input normalization
  elements.bundleUrl.addEventListener('blur', () => {
    const v = (elements.bundleUrl.value || '').trim();
    if (v) elements.bundleUrl.value = FhirHelpers.normalizeResourceUrl(v);
  });

  // Load button
  elements.loadUrlBtn.addEventListener('click', async () => {
    const raw = (elements.bundleUrl.value || '').trim();
    const url = FhirHelpers.normalizeResourceUrl(raw);
    if (!url) return;

    elements.bundleUrl.value = url; // reflect normalization

    updateAuthHint(url);
    try {
      await loadGroupTaskFromUrl(url);
    } catch (err) {
      console.error(err);
      elements.status.textContent = 'Load failed (CORS? wrong URL? see console).';
    }
  });

  elements.baseUrl.addEventListener('change', () => {
    updateAuthHint((elements.baseUrl.value || '').trim());
  });

  // Patient search with debounce
  let searchTimer = null;
  elements.patientQuery.addEventListener('input', () => {
    const q = elements.patientQuery.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 3) {
      elements.results.innerHTML = '';
      return;
    }
    searchTimer = setTimeout(() => runPatientSearch(q), CONFIG.UI.searchDebounceMs);
  });

  // QR scanner - camera
  elements.startScanBtn?.addEventListener('click', async () => {
    await QRScanner.startScan(
      elements.qrVideo,
      handleQrDetection,
      (err, msg) => {
        console.error(err);
        elements.qrStatus.textContent = msg;
      },
      msg => {
        elements.qrStatus.textContent = msg;
      }
    );
  });

  elements.stopScanBtn?.addEventListener('click', () => {
    QRScanner.stopScan();
    elements.qrStatus.textContent = 'Stopped.';
  });

  // QR scanner - file upload
  elements.qrFile?.addEventListener('change', async () => {
    const file = elements.qrFile.files?.[0];
    if (!file) return;

    await QRScanner.scanFromFile(
      file,
      handleQrDetection,
      (err, msg) => {
        console.error(err);
        elements.qrStatus.textContent = msg;
      },
      msg => {
        elements.qrStatus.textContent = msg;
      }
    );
  });
}

/**
 * Application entry point
 */
document.addEventListener('DOMContentLoaded', () => {
  initAuthFetch();
  initElements();
  initEventListeners();
});
