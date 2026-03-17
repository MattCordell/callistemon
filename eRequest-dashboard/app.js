/**
 * @module app
 * @description Main application orchestrator
 *
 * Ties together all modules and manages application state:
 * - DOM element caching
 * - Event listeners
 * - Mode switching
 * - Data fetching workflows
 * - Filter management
 * - State change subscriptions
 */

import { CONFIG } from './config.js';
import { state } from './modules/state-manager.js';
import * as FhirClient from './modules/fhir-client.js';
import * as FhirHelpers from './modules/fhir-helpers.js';
import * as Terminology from './modules/terminology.js';
import * as FilterEngine from './modules/filter-engine.js';
import * as UIRendering from './modules/ui-rendering.js';

// ==================== DOM Element Cache ====================

const elements = {
  // Server selection
  serverUrl: null,
  txServer: null,
  fetchBtn: null,

  // Mode toggle
  modeIncoming: null,
  modePatients: null,

  // Filters
  categoryAll: null,
  categoryLab: null,
  categoryImaging: null,
  modalitySelect: null,
  anatomyInput: null,
  anatomyClear: null,

  // Search
  patientSearch: null,
  last7Checkbox: null,

  // Pagination
  loadMoreBtn: null
};

/**
 * Cache DOM element references
 */
function initElements() {
  elements.serverUrl = document.getElementById('server-url');
  elements.txServer = document.getElementById('tx-server');
  elements.fetchBtn = document.getElementById('fetch-btn');

  elements.modeIncoming = document.getElementById('mode-incoming');
  elements.modePatients = document.getElementById('mode-patients');

  elements.categoryAll = document.getElementById('category-all');
  elements.categoryLab = document.getElementById('category-lab');
  elements.categoryImaging = document.getElementById('category-imaging');
  elements.modalitySelect = document.getElementById('modality-select');
  elements.anatomyInput = document.getElementById('anatomy-input');
  elements.anatomyClear = document.getElementById('anatomy-clear');

  elements.patientSearch = document.getElementById('patient-search');
  elements.last7Checkbox = document.getElementById('last7-checkbox');

  elements.loadMoreBtn = document.getElementById('load-more-btn');
}

// ==================== Helper Functions ====================

/**
 * Get current server URLs from UI
 * @returns {{baseUrl: string, txBase: string}} Server URLs
 */
function getServerUrls() {
  const baseUrl = elements.serverUrl?.value?.trim() || '';
  const txBase = elements.txServer?.value?.trim() || CONFIG.DEFAULT_TX;

  return { baseUrl, txBase };
}

/**
 * Check if we can perform a search
 * @param {string} baseUrl - FHIR server base URL
 * @returns {boolean} True if search is valid
 */
function canSearch(baseUrl) {
  return !!(baseUrl && /^https?:\/\//i.test(baseUrl));
}

// ==================== Event Handlers ====================

/**
 * Handle server preset selection
 */
function handleServerUrlChange() {
  updateServerState();
}

/**
 * Update server state
 */
function updateServerState() {
  const { baseUrl, txBase } = getServerUrls();
  state.setState('config.baseUrl', baseUrl);
  state.setState('config.txBase', txBase);
}

/**
 * Handle fetch button click
 */
async function handleFetchClick() {
  const { baseUrl, txBase } = getServerUrls();

  if (!canSearch(baseUrl)) {
    UIRendering.showError('Please enter a valid FHIR server URL');
    return;
  }

  state.setState('config.baseUrl', baseUrl);
  state.setState('config.txBase', txBase);
  state.setState('ui.loading', true);
  state.setState('ui.error', '');

  try {
    const helpers = {
      normalizePatientRef: FhirHelpers.normalizePatientRef,
      srPatientRef: FhirHelpers.srPatientRef
    };

    const bundle = await FhirClient.fetchServiceRequests(baseUrl, helpers);
    const processed = FhirHelpers.processBundle(bundle, true, {});

    state.setState('data.patientMap', processed.patientMap);
    state.setState('data.taskBySrId', processed.taskBySrId);
    state.setState('data.resByRef', processed.resByRef);
    state.setState('data.nextLink', processed.nextLink);
    state.setState('selection.patientRef', '');
    state.setState('data.srList', processed.srList);
  } catch (error) {
    console.error('Fetch failed:', error);
    state.setState('ui.error', error.message || 'An unexpected error occurred');
  } finally {
    state.setState('ui.loading', false);
  }
}

/**
 * Handle load more button click
 */
async function handleLoadMoreClick() {
  const nextLink = state.getState('data.nextLink');
  if (!nextLink) return;

  state.setState('ui.loading', true);
  state.setState('ui.error', '');

  try {
    const helpers = {
      normalizePatientRef: FhirHelpers.normalizePatientRef,
      srPatientRef: FhirHelpers.srPatientRef
    };

    const bundle = await FhirClient.fetchNextPage(nextLink, helpers);
    const currentState = state.getState('data');
    const processed = FhirHelpers.processBundle(bundle, false, currentState);

    state.setState('data.patientMap', processed.patientMap);
    state.setState('data.taskBySrId', processed.taskBySrId);
    state.setState('data.resByRef', processed.resByRef);
    state.setState('data.nextLink', processed.nextLink);
    state.setState('data.srList', processed.srList);
  } catch (error) {
    console.error('Load more failed:', error);
    state.setState('ui.error', error.message || 'Failed to load more results');
  } finally {
    state.setState('ui.loading', false);
  }
}

/**
 * Handle mode change
 * @param {string} mode - Mode to switch to: 'incoming' | 'patients'
 */
function handleModeChange(mode) {
  state.setState('ui.mode', mode);
}

/**
 * Handle category filter change
 * @param {string} category - Category: 'all' | 'lab' | 'imaging'
 */
function handleCategoryChange(category) {
  state.setState('filters.categoryFilter', category);
}

/**
 * Handle modality selection change
 */
async function handleModalityChange() {
  const selected = elements.modalitySelect?.value || '';
  state.setState('filters.modality.selected', selected);

  if (!selected) {
    state.setState('filters.modality.codes', new Set());
    return;
  }

  const txBase = state.getState('config.txBase');
  state.setState('filters.modality.loading', true);
  state.setState('filters.modality.error', false);

  try {
    const ecl = `<<${selected}`;
    const codes = await Terminology.expandECL(txBase, ecl);
    state.setState('filters.modality.codes', codes);
  } catch (error) {
    console.error('Modality ECL expansion failed:', error);
    state.setState('filters.modality.error', true);
    state.setState('filters.modality.codes', new Set());
  } finally {
    state.setState('filters.modality.loading', false);
  }
}

/**
 * Handle anatomy input change (with debouncing)
 */
let anatomyDebounceTimer = null;

function handleAnatomyInput() {
  const query = elements.anatomyInput?.value?.trim() || '';
  state.setState('filters.anatomy.query', query);
  state.setState('filters.anatomy.menuOpen', false);

  clearTimeout(anatomyDebounceTimer);

  if (query.length < CONFIG.UI.AUTOCOMPLETE_MIN_CHARS) {
    state.setState('filters.anatomy.options', []);
    return;
  }

  anatomyDebounceTimer = setTimeout(async () => {
    const txBase = state.getState('config.txBase');
    state.setState('filters.anatomy.loading', true);
    state.setState('filters.anatomy.error', '');

    try {
      const options = await Terminology.expandValueSet(
        txBase,
        CONFIG.VALUESETS.AU_BODY_SITE,
        query,
        CONFIG.UI.AUTOCOMPLETE_MAX_RESULTS
      );

      state.setState('filters.anatomy.options', options);
      state.setState('filters.anatomy.menuOpen', options.length > 0);
    } catch (error) {
      console.error('Anatomy search failed:', error);
      state.setState('filters.anatomy.error', 'Search failed');
    } finally {
      state.setState('filters.anatomy.loading', false);
    }
  }, CONFIG.UI.AUTOCOMPLETE_DEBOUNCE_MS);
}

/**
 * Handle anatomy option selection
 * @param {string} code - Selected anatomy code
 * @param {string} display - Selected anatomy display
 */
async function handleAnatomySelect(code, display) {
  state.setState('filters.anatomy.query', display);
  state.setState('filters.anatomy.selected', code);
  state.setState('filters.anatomy.menuOpen', false);

  if (elements.anatomyInput) {
    elements.anatomyInput.value = display;
    elements.anatomyInput.focus();
  }

  // Expand the selected anatomy code
  const txBase = state.getState('config.txBase');
  state.setState('filters.anatomy.loading', true);

  try {
    const ecl = `<<${code}`;
    const codes = await Terminology.expandECL(txBase, ecl);
    state.setState('filters.anatomy.codes', codes);
  } catch (error) {
    console.error('Anatomy ECL expansion failed:', error);
    state.setState('filters.anatomy.codes', new Set([code])); // Fallback to just the code
  } finally {
    state.setState('filters.anatomy.loading', false);
  }
}

/**
 * Handle anatomy clear
 */
function handleAnatomyClear() {
  state.setState('filters.anatomy.query', '');
  state.setState('filters.anatomy.selected', '');
  state.setState('filters.anatomy.codes', new Set());
  state.setState('filters.anatomy.options', []);
  state.setState('filters.anatomy.menuOpen', false);

  if (elements.anatomyInput) {
    elements.anatomyInput.value = '';
  }
}

/**
 * Handle patient search input
 */
function handlePatientSearchInput() {
  const query = elements.patientSearch?.value || '';
  state.setState('search.patientSearch', query);
}

/**
 * Handle last 7 days checkbox change
 */
function handleLast7Change() {
  const checked = elements.last7Checkbox?.checked || false;
  state.setState('search.last7Only', checked);
}

/**
 * Handle patient row click
 * @param {string} patientRef - Patient reference
 */
function handlePatientRowClick(patientRef) {
  state.setState('selection.patientRef', patientRef);
}

/**
 * Handle incoming row click
 * @param {string} patientRef - Patient reference
 */
function handleIncomingRowClick(patientRef) {
  state.setState('selection.patientRef', patientRef);
  state.setState('ui.mode', 'patients');
}

// ==================== State Change Subscriptions ====================

/**
 * Subscribe to state changes and update UI
 */
function subscribeToStateChanges() {
  state.subscribe((path, value, fullState) => {
    // Data or filter changes → re-render incoming table
    if (path === 'data.srList' || path.startsWith('filters.')) {
      if (fullState.ui.mode === 'incoming') {
        const filtered = FilterEngine.applyAllFilters(fullState);
        UIRendering.renderIncomingTable(filtered, handleIncomingRowClick);
      }
    }

    // Search changes → re-render patient table
    if (path === 'search.patientSearch' || path === 'search.last7Only' || path === 'data.srList') {
      if (fullState.ui.mode === 'patients') {
        const patientRows = FilterEngine.buildPatientRows(
          fullState.data.srList,
          fullState.data.patientMap,
          fullState.search.patientSearch,
          fullState.search.last7Only
        );
        UIRendering.renderPatientTable(
          patientRows,
          fullState.selection.patientRef,
          handlePatientRowClick
        );
      }
    }

    // Mode change → switch views and render
    if (path === 'ui.mode') {
      UIRendering.showActiveTab(value);

      if (value === 'incoming') {
        const filtered = FilterEngine.applyAllFilters(fullState);
        UIRendering.renderIncomingTable(filtered, handleIncomingRowClick);
      } else {
        const patientRows = FilterEngine.buildPatientRows(
          fullState.data.srList,
          fullState.data.patientMap,
          fullState.search.patientSearch,
          fullState.search.last7Only
        );
        UIRendering.renderPatientTable(
          patientRows,
          fullState.selection.patientRef,
          handlePatientRowClick
        );
      }
    }

    // Patient selection → update sidebar
    if (path === 'selection.patientRef' || path === 'data.srList') {
      const patientRef = fullState.selection.patientRef;
      const patient = fullState.data.patientMap[patientRef];
      const allRows = FilterEngine.buildIncomingRows(
        fullState.data.srList,
        fullState.data.patientMap,
        fullState.data.taskBySrId,
        fullState.data.resByRef
      );
      const patientSRs = allRows.filter(r => r.patientRef === patientRef);

      UIRendering.renderPatientSidebar(
        patient,
        patientSRs,
        fullState.data.taskBySrId,
        fullState.config.baseUrl
      );
    }

    // Error state → show/hide error
    if (path === 'ui.error') {
      value ? UIRendering.showError(value) : UIRendering.clearError();
    }

    // Loading state → update UI
    if (path === 'ui.loading') {
      UIRendering.showLoading(value);
    }

    // Pagination → update pagination UI
    if (path === 'data.nextLink' || path === 'ui.loading') {
      UIRendering.updatePagination(fullState.data.nextLink, fullState.ui.loading);
    }

    // Category filter → update button states
    if (path === 'filters.categoryFilter') {
      UIRendering.updateCategoryButtons(value);
    }

    // Modality filter → update UI
    if (path.startsWith('filters.modality.')) {
      UIRendering.updateModalityUI(fullState.filters.modality);
    }

    // Anatomy filter → update UI
    if (path.startsWith('filters.anatomy.')) {
      UIRendering.updateAnatomyUI(fullState.filters.anatomy);

      if (path === 'filters.anatomy.options') {
        UIRendering.renderAnatomyOptions(value, handleAnatomySelect);
      }
    }
  });
}

// ==================== Event Listener Setup ====================

/**
 * Initialize all event listeners
 */
function initEventListeners() {
  // Server selection
  elements.serverUrl?.addEventListener('change', handleServerUrlChange);
  elements.fetchBtn?.addEventListener('click', handleFetchClick);

  // Mode toggle
  elements.modeIncoming?.addEventListener('click', () => handleModeChange('incoming'));
  elements.modePatients?.addEventListener('click', () => handleModeChange('patients'));

  // Category filters
  elements.categoryAll?.addEventListener('click', () => handleCategoryChange('all'));
  elements.categoryLab?.addEventListener('click', () => handleCategoryChange('lab'));
  elements.categoryImaging?.addEventListener('click', () => handleCategoryChange('imaging'));

  // Modality filter
  elements.modalitySelect?.addEventListener('change', handleModalityChange);
  document.getElementById('modality-clear')?.addEventListener('click', () => {
    if (elements.modalitySelect) {
      elements.modalitySelect.value = '';
      handleModalityChange();
    }
  });

  // Anatomy filter
  elements.anatomyInput?.addEventListener('input', handleAnatomyInput);
  elements.anatomyClear?.addEventListener('click', handleAnatomyClear);

  // Close anatomy menu on outside click
  document.addEventListener('click', (e) => {
    const anatomyMenu = document.getElementById('anatomy-menu');
    const anatomyInput = elements.anatomyInput;
    if (anatomyMenu && anatomyInput && !anatomyMenu.contains(e.target) && e.target !== anatomyInput) {
      state.setState('filters.anatomy.menuOpen', false);
    }
  });

  // Patient search
  elements.patientSearch?.addEventListener('input', handlePatientSearchInput);
  elements.last7Checkbox?.addEventListener('change', handleLast7Change);

  // Pagination
  elements.loadMoreBtn?.addEventListener('click', handleLoadMoreClick);
}

// ==================== Time Updater ====================

/**
 * Start periodic time since updater
 */
function startTimeUpdater() {
  setInterval(() => {
    const currentState = state.getState();
    if (currentState.ui.mode === 'incoming') {
      const filtered = FilterEngine.applyAllFilters(currentState);
      UIRendering.updateTimeSinceColumns(filtered);
    }
  }, CONFIG.UI.TICK_INTERVAL_MS);
}

// ==================== Application Initialization ====================

/**
 * Initialize application
 */
function init() {
  initElements();
  UIRendering.populateServerSelects();
  subscribeToStateChanges();
  initEventListeners();
  startTimeUpdater();

  // Default to callistemon server and fetch on load
  if (elements.serverUrl) {
    elements.serverUrl.value = CONFIG.FHIR_SERVERS[0];
  }
  handleFetchClick();

  // Auto-refresh every 15 seconds
  setInterval(handleFetchClick, 15000);

  console.log('eRequest Dashboard v7.0 initialized');
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', init);
