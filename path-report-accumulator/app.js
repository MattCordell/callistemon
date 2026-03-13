/**
 * @module app
 * @description Main orchestrator for the Pathology Report Accumulator
 */

import { CONFIG } from './config.js';
import { findPatientsWithMultipleReports, searchPatientByName } from './modules/patient-finder.js';
import { fetchReportsForPatient, fetchObservationsForReport, buildReportData, selectCompanionReports } from './modules/report-loader.js';
import { buildCumulativeTable } from './modules/row-grouper.js';
import { renderPatientList, renderReportList, renderPatientBanner, showToast } from './modules/ui-panels.js';
import { renderCumulativeTable } from './modules/ui-table.js';

// ── State ─────────────────────────────────────────────────────
let currentBase = CONFIG.FHIR.defaultBase;
let patients = [];
let allReports = [];       // DiagnosticReport[] for selected patient
let currentReportData = null;
let companionReportData = [];
let displayMode = CONFIG.DISPLAY_MODES.COMPACT;
let sortOrder = 'desc';    // 'desc' = newest left (default)
let searchMode = false;    // false = browse, true = search

// ── DOM refs ──────────────────────────────────────────────────
const $serverPreset = document.getElementById('serverPreset');
const $serverCustom = document.getElementById('serverCustom');
const $loadBtn = document.getElementById('loadBtn');
const $status = document.getElementById('status');
const $patientList = document.getElementById('patientList');
const $reportList = document.getElementById('reportList');
const $patientBanner = document.getElementById('patientBanner');
const $tableToolbar = document.getElementById('tableToolbar');
const $modeButtons = document.getElementById('modeButtons');
const $sortToggle = document.getElementById('sortToggle');
const $cumulativeTable = document.getElementById('cumulativeTable');
const $toast = document.getElementById('toast');
const $browseAllBtn = document.getElementById('browseAllBtn');
const $searchBtn = document.getElementById('searchBtn');
const $patientSearch = document.getElementById('patientSearch');

// ── Init ──────────────────────────────────────────────────────
function init() {
  populateServerPresets();
  wireEvents();
  handleLoad();
}

function populateServerPresets() {
  for (const url of CONFIG.FHIR_SERVERS) {
    const opt = document.createElement('option');
    opt.value = url;
    opt.textContent = url.replace(/^https?:\/\//, '').replace(/\/fhir\/?$/, '');
    if (url === CONFIG.FHIR.defaultBase) opt.selected = true;
    $serverPreset.appendChild(opt);
  }
  $serverCustom.value = CONFIG.FHIR.defaultBase;
}

function getBase() {
  return ($serverCustom.value || $serverPreset.value || CONFIG.FHIR.defaultBase).replace(/\/$/, '');
}

function setStatus(msg) {
  $status.textContent = msg;
}

// ── Events ────────────────────────────────────────────────────
function wireEvents() {
  $serverPreset.addEventListener('change', () => {
    if ($serverPreset.value) {
      $serverCustom.value = $serverPreset.value;
      handleLoad();
    }
  });

  $serverCustom.addEventListener('change', () => handleLoad());

  $loadBtn.addEventListener('click', handleLoad);

  // Browse / Search toggle
  $browseAllBtn.addEventListener('click', () => {
    searchMode = false;
    $browseAllBtn.classList.add('active');
    $searchBtn.classList.remove('active');
    $patientSearch.classList.add('hidden');
  });

  $searchBtn.addEventListener('click', () => {
    searchMode = true;
    $searchBtn.classList.add('active');
    $browseAllBtn.classList.remove('active');
    $patientSearch.classList.remove('hidden');
    $patientSearch.focus();
  });

  $patientSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLoad();
  });

  // Display mode buttons
  $modeButtons.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $modeButtons.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.remove('active');
        b.classList.add('text-gray-400');
      });
      btn.classList.add('active');
      btn.classList.remove('text-gray-400');
      displayMode = btn.dataset.mode;
      rerenderTable();
    });
  });

  // Sort toggle
  $sortToggle.addEventListener('click', () => {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    $sortToggle.innerHTML = sortOrder === 'desc'
      ? 'Newest &#8594; Oldest'
      : 'Oldest &#8594; Newest';
    rerenderTable();
  });
}

// ── Load patients ─────────────────────────────────────────────
async function handleLoad() {
  currentBase = getBase();
  resetState();

  try {
    $loadBtn.disabled = true;
    if (searchMode && $patientSearch.value.trim()) {
      patients = await searchPatientByName(currentBase, $patientSearch.value.trim(), setStatus);
    } else {
      patients = await findPatientsWithMultipleReports(currentBase, setStatus);
    }
    renderPatientList($patientList, patients, onPatientSelected);
  } catch (err) {
    console.error('Load failed:', err);
    setStatus('Error: ' + err.message);
    showToast($toast, 'Failed to load patients: ' + err.message, 'err');
  } finally {
    $loadBtn.disabled = false;
  }
}

function resetState() {
  allReports = [];
  currentReportData = null;
  companionReportData = [];
  $reportList.innerHTML = '<p class="text-gray-500 text-xs p-3">Select a patient</p>';
  $patientBanner.innerHTML = '';
  $tableToolbar.classList.add('hidden');
  $cumulativeTable.innerHTML = '<p class="text-gray-500 text-sm p-4">Select a patient and report to view cumulative results</p>';
}

// ── Patient selected ──────────────────────────────────────────
async function onPatientSelected(entry) {
  const patient = entry.patient;
  renderPatientBanner($patientBanner, patient);

  const patRef = `Patient/${patient.id}`;
  setStatus('Fetching reports…');

  try {
    allReports = await fetchReportsForPatient(currentBase, patRef);
    renderReportList($reportList, allReports, onReportSelected);
    setStatus(`${allReports.length} reports loaded`);
    $tableToolbar.classList.add('hidden');
    $cumulativeTable.innerHTML = '<p class="text-gray-500 text-sm p-4">Select a report to view cumulative results</p>';
  } catch (err) {
    console.error('Report fetch failed:', err);
    setStatus('Error loading reports');
    showToast($toast, 'Failed to load reports: ' + err.message, 'err');
  }
}

// ── Report selected ───────────────────────────────────────────
async function onReportSelected(report, idx) {
  setStatus('Loading observations…');
  $tableToolbar.classList.remove('hidden');

  try {
    // Fetch observations for the current report
    const currentObs = await fetchObservationsForReport(currentBase, report);
    currentReportData = buildReportData(report, currentObs);

    // Select companion reports
    const companions = selectCompanionReports(allReports, idx);
    setStatus(`Loading ${companions.length} companion reports…`);

    // Fetch observations for each companion
    companionReportData = [];
    for (const comp of companions) {
      const obs = await fetchObservationsForReport(currentBase, comp);
      companionReportData.push(buildReportData(comp, obs));
    }

    setStatus('Ready');
    rerenderTable();
  } catch (err) {
    console.error('Observation fetch failed:', err);
    setStatus('Error loading observations');
    showToast($toast, 'Failed to load observations: ' + err.message, 'err');
  }
}

// ── Render table ──────────────────────────────────────────────
function rerenderTable() {
  if (!currentReportData) return;
  const tableModel = buildCumulativeTable(currentReportData, companionReportData, displayMode);
  renderCumulativeTable($cumulativeTable, tableModel, sortOrder);
}

// ── Boot ──────────────────────────────────────────────────────
init();
