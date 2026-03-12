/**
 * @module app
 * @description Main orchestrator for eDiagnosticReport — Laboratory
 *
 * Wires together all modules: FHIR client, backlog engine, UI rendering,
 * report builder, and autocomplete.
 */

import { CONFIG } from './config.js';
import { fetchAcceptedTasks, fetchServiceRequests, fetchPatient, ensureOrganization, submitTransactionBundle, fetchSiblingTasks } from './modules/fhir-client.js';
import { relRefString, isGroupTask } from './modules/fhir-helpers.js';
import { applyProviderOverrides } from './modules/test-definitions.js';
import { buildBacklog } from './modules/backlog-engine.js';
import { renderBacklog, renderPatientBanner, renderDataEntryForm, collectFormData, fillFormValues, showToast } from './modules/ui-rendering.js';
import { buildTransactionBundle } from './modules/report-builder.js';
import { generateValues } from './modules/autocomplete-engine.js';

// Provider-specific test configuration overrides
import { PROVIDER_OVERRIDES as OVERRIDES_CALLI } from './modules/provider-calli.js';
import { PROVIDER_OVERRIDES as OVERRIDES_BB } from './modules/provider-bb.js';

const PROVIDER_OVERRIDES_MAP = {
  calli: OVERRIDES_CALLI,
  bb: OVERRIDES_BB
};

// ── DOM element cache ───────────────────────────────────────────────
const el = {
  orgSelect:      document.getElementById('orgSelect'),
  serverPreset:   document.getElementById('serverPreset'),
  serverCustom:   document.getElementById('serverCustom'),
  loadBtn:        document.getElementById('loadBtn'),
  status:         document.getElementById('status'),
  backlogView:    document.getElementById('backlogView'),
  backlogList:    document.getElementById('backlogList'),
  entryView:      document.getElementById('entryView'),
  entryTitle:     document.getElementById('entry-title'),
  backBtn:        document.getElementById('backBtn'),
  avatar:         document.getElementById('avatar'),
  ptName:         document.getElementById('pt-name'),
  ptLine:         document.getElementById('pt-line'),
  ptDob:          document.getElementById('pt-dob'),
  ptAge:          document.getElementById('pt-age'),
  ptGender:       document.getElementById('pt-gender'),
  ptAddress:      document.getElementById('pt-address'),
  testForm:       document.getElementById('testForm'),
  autocompleteBtn: document.getElementById('autocompleteBtn'),
  submitBtn:      document.getElementById('submitBtn'),
  toast:          document.getElementById('toast')
};

// ── Application state ───────────────────────────────────────────────
let currentBacklog = [];
let currentEntry = null;
let currentPatient = null;
let currentGroup = null;
const patientCache = new Map();  // patientRef -> Patient resource

// ── Org Theme ───────────────────────────────────────────────────────
const ORG_LOGOS = {
  calli: `<svg width="168" height="44" viewBox="0 0 168 44" xmlns="http://www.w3.org/2000/svg" aria-label="Callistemon Diagnostic Services">
    <circle cx="22" cy="22" r="18" fill="rgba(16,185,129,.12)" stroke="#10b981" stroke-width="1.5"/>
    <path d="M22 11 C26.5 15.5 26.5 20 22 22 C17.5 20 17.5 15.5 22 11Z" fill="#10b981"/>
    <path d="M22 33 C17.5 28.5 17.5 24 22 22 C26.5 24 26.5 28.5 22 33Z" fill="#34d399" opacity=".75"/>
    <path d="M11 22 C15.5 17.5 20 17.5 22 22 C20 26.5 15.5 26.5 11 22Z" fill="#10b981" opacity=".6"/>
    <path d="M33 22 C28.5 26.5 24 26.5 22 22 C24 17.5 28.5 17.5 33 22Z" fill="#34d399" opacity=".5"/>
    <text x="48" y="18" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="800" fill="#10b981" letter-spacing=".3">Callistemon</text>
    <text x="48" y="33" font-family="system-ui,-apple-system,sans-serif" font-size="10.5" fill="#9ca3af">Diagnostic Services</text>
  </svg>`,
  bb: `<svg width="132" height="44" viewBox="0 0 132 44" xmlns="http://www.w3.org/2000/svg" aria-label="BB Diagnostics">
    <circle cx="22" cy="22" r="18" fill="rgba(249,115,22,.12)" stroke="#f97316" stroke-width="1.5"/>
    <text x="22" y="28" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="800" fill="#f97316" text-anchor="middle" letter-spacing="1">BB</text>
    <text x="48" y="18" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="800" fill="#f97316" letter-spacing=".3">BB</text>
    <text x="48" y="33" font-family="system-ui,-apple-system,sans-serif" font-size="10.5" fill="#9ca3af">Diagnostics</text>
  </svg>`
};

function applyOrgTheme(key) {
  document.body.dataset.theme = key;
  const logoEl = document.getElementById('org-logo');
  if (logoEl) logoEl.innerHTML = ORG_LOGOS[key] || '';
}

// ── Event Listeners ─────────────────────────────────────────────────
applyOrgTheme(el.orgSelect?.value || 'calli');
el.orgSelect?.addEventListener('change', () => applyOrgTheme(el.orgSelect.value));
el.loadBtn.addEventListener('click', loadBacklog);
el.backBtn.addEventListener('click', showBacklogView);
el.autocompleteBtn.addEventListener('click', handleAutocomplete);
el.submitBtn.addEventListener('click', handleSubmit);
el.serverPreset.addEventListener('change', () => {
  if (el.serverPreset.value) el.serverCustom.value = '';
});

// ── Helpers ─────────────────────────────────────────────────────────
function getBaseUrl() {
  const custom = el.serverCustom.value.trim();
  const preset = el.serverPreset.value;
  return custom || preset || '';
}

function populateServerPresets() {
  CONFIG.FHIR_SERVERS.forEach(url => {
    const opt = document.createElement('option');
    opt.value = url;
    opt.textContent = url;
    el.serverPreset.appendChild(opt);
  });
  el.serverPreset.value = CONFIG.FHIR_SERVERS[0];
}

// ── Load Backlog ────────────────────────────────────────────────────
async function loadBacklog() {
  const base = getBaseUrl();
  if (!base) {
    showToast(el.toast, 'Please enter a FHIR server URL.', 'warn');
    return;
  }

  const orgKey = el.orgSelect.value;
  const org = CONFIG.FILLER_ORGS[orgKey];
  if (!org) return;

  el.loadBtn.disabled = true;
  el.status.textContent = 'Loading\u2026';
  el.backlogList.innerHTML = '';

  try {
    // 1. Fetch accepted tasks for this org
    const { tasks, groupTasks } = await fetchAcceptedTasks(base, org);
    el.status.textContent = `Found ${tasks.length} task(s). Fetching details\u2026`;

    if (!tasks.length) {
      el.backlogList.innerHTML = '<div class="empty">No claimed pathology requests found for this organisation.</div>';
      el.status.textContent = '';
      el.loadBtn.disabled = false;
      return;
    }

    // 2. Fetch ServiceRequests for each task
    const srMap = await fetchServiceRequests(base, tasks);
    el.status.textContent = `Loaded ${srMap.size} service request(s). Building backlog\u2026`;

    // 3. Build the backlog (with super set detection + provider overrides)
    const testDefs = applyProviderOverrides(PROVIDER_OVERRIDES_MAP[orgKey]);
    currentBacklog = buildBacklog(tasks, srMap, groupTasks, testDefs);

    // 4. Fetch patients for display
    const patientRefs = new Set();
    for (const group of currentBacklog) {
      for (const entry of group.entries) {
        if (entry.patientRef) patientRefs.add(entry.patientRef);
      }
    }

    for (const ref of patientRefs) {
      if (!patientCache.has(ref)) {
        try {
          const patient = await fetchPatient(base, ref);
          if (patient) patientCache.set(ref, patient);
        } catch (e) {
          console.warn('Failed to fetch patient:', ref, e);
        }
      }
    }

    // 5. Render the backlog
    renderBacklog(el.backlogList, currentBacklog, patientCache, onEntrySelected);
    el.status.textContent = `${currentBacklog.reduce((n, g) => n + g.entries.length, 0)} backlog item(s) ready.`;

  } catch (err) {
    console.error('Load backlog failed:', err);
    showToast(el.toast, `Load failed: ${err.message}`, 'err');
    el.status.textContent = 'Load failed.';
  } finally {
    el.loadBtn.disabled = false;
  }
}

// ── Entry Selection ─────────────────────────────────────────────────
function onEntrySelected(entry, patient, group) {
  currentEntry = entry;
  currentPatient = patient;
  currentGroup = group;

  // Populate patient banner
  renderPatientBanner(el, patient);

  // Render the data entry form
  renderDataEntryForm(el.testForm, entry);

  // Show entry view, hide backlog
  showEntryView();
}

function showBacklogView() {
  el.backlogView.classList.remove('hidden');
  el.entryView.classList.add('hidden');
  currentEntry = null;
  currentPatient = null;
  currentGroup = null;
}

function showEntryView() {
  el.backlogView.classList.add('hidden');
  el.entryView.classList.remove('hidden');
}

// ── Autocomplete ────────────────────────────────────────────────────
function handleAutocomplete() {
  if (!currentEntry) return;
  const values = generateValues(currentEntry.headings);
  fillFormValues(el.testForm, values);
  showToast(el.toast, 'Fields populated with sample values.', 'ok');
}

// ── Initialise ──────────────────────────────────────────────────────
populateServerPresets();
loadBacklog();

// ── Submit Results ──────────────────────────────────────────────────
let submitting = false;

async function handleSubmit() {
  if (!currentEntry || submitting) return;

  const formData = collectFormData(el.testForm);
  if (formData.size === 0) {
    showToast(el.toast, 'Please enter at least one result value.', 'warn');
    return;
  }

  const base = getBaseUrl();
  const orgKey = el.orgSelect.value;
  const org = CONFIG.FILLER_ORGS[orgKey];

  submitting = true;
  el.submitBtn.disabled = true;
  el.submitBtn.textContent = 'Submitting\u2026';

  try {
    // Ensure the org exists on the server
    const orgRef = await ensureOrganization(base, org);

    // Check if all sibling tasks will be complete after this submission
    let allSiblingsComplete = false;
    if (currentGroup?.groupTask && currentGroup.requisitionId) {
      try {
        const siblings = await fetchSiblingTasks(base, currentGroup.requisitionId);
        const diagnosticSiblings = siblings.filter(t => !isGroupTask(t));
        const currentTaskIds = new Set(currentEntry.tasks.map(t => t.id));
        const othersComplete = diagnosticSiblings
          .filter(t => !currentTaskIds.has(t.id))
          .every(t => t.status === 'completed');
        allSiblingsComplete = othersComplete;
      } catch (e) {
        console.warn('Could not check sibling task completion:', e);
      }
    }

    // Build the transaction bundle
    const bundle = buildTransactionBundle(formData, {
      entry: currentEntry,
      patient: currentPatient,
      orgRef,
      groupTask: currentGroup?.groupTask || null,
      allSiblingsComplete
    });

    // Submit to the FHIR server
    await submitTransactionBundle(base, bundle);

    showToast(el.toast, `Report submitted successfully for ${currentEntry.displayName}.`, 'ok');

    // Return to backlog and reload
    showBacklogView();
    await loadBacklog();

  } catch (err) {
    console.error('Submit failed:', err);
    showToast(el.toast, `Submit failed: ${err.message}`, 'err');
  } finally {
    submitting = false;
    el.submitBtn.disabled = false;
    el.submitBtn.textContent = 'Submit Results';
  }
}
