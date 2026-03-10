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
import { buildBacklog } from './modules/backlog-engine.js';
import { renderBacklog, renderPatientBanner, renderDataEntryForm, collectFormData, fillFormValues, showToast } from './modules/ui-rendering.js';
import { buildTransactionBundle } from './modules/report-builder.js';
import { generateValues } from './modules/autocomplete-engine.js';

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

// ── Event Listeners ─────────────────────────────────────────────────
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

    // 3. Build the backlog (with super set detection)
    currentBacklog = buildBacklog(tasks, srMap, groupTasks);

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
