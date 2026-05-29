// app.js — Boot, DOM wiring, event listeners. ES6 module entrypoint.

import { state } from './modules/state.js';
import {
  $, showStatus, showError, setDebugUrl, initDebugPanel,
} from './modules/utils.js';
import {
  R4_BASE, VS, SUPPLEMENT_URL, BOOST_URL, PROVIDER_SUPPLEMENTS,
} from './config.js';
import { roleSpecialties } from './clinicians.js';
import {
  setPtMode, searchPatientsByName, hidePtAC, clearPatientForm, setPatientLocked,
  updatePtToggleVisuals,
} from './modules/patient.js';
import {
  renderReasonTags, wireNotesAutocomplete, addReasonTag,
} from './modules/reason-tags.js';
import {
  setupSearch, setupCustomAdder, renderFavsForUser, renderSelectedTests, initBodySiteModal,
  addSelectedTest,
} from './modules/test-list.js';
import {
  computeAndRenderSuggestions, SUGGESTED_TESTS_META,
} from './modules/suggestions.js';
import { applyAllWarnings } from './modules/warnings.js';
import {
  preloadFastingCodes, preloadSiteSpecificCodes,
} from './modules/terminology.js';
import { populatePregnancyStatus, buildBundle } from './modules/bundle-builder.js';
import {
  initAuthFetch, maybePromptPasswordFor, initAuthManage,
  initQrModal, initSendButton,
} from './modules/server.js';
import {
  getAiSettings, initAiSettingsPanel,
} from './modules/settings-ai.js';
import {
  initOntoserverBackend, getActiveBackendName,
  searchConcepts, lookupConcept, getTools,
} from './modules/ontoserver-tools.js';
import { runAgent } from './modules/ai-agent.js';
import { suggestReasonCodes } from './modules/ai-reason-coding.js';
import {
  renderSuggestionReviewList, setLoadingState, renderEmptyState, renderErrorState,
} from './modules/ai-ui.js';

// JSON viewer instance — owned by this module (boot sets it). Domain modules
// like bundle-builder.js are no longer aware of it; the caller of buildBundle()
// is responsible for displaying the result.
let viewer;

function updateSpecialtyDisplay(name) {
  const sp = roleSpecialties[name];
  const el = document.getElementById('doctor-specialty');
  const text = sp ? ('Specialty: ' + sp.display) : '';
  el.textContent = text;
  if (text) el.classList.remove('hidden'); else el.classList.add('hidden');
}

// Manual test harness for the shared AI substrate (revealed by ?aitest=1).
// Exercises the Ontoserver tool surface and the agent loop without any feature
// UI. Stays behind the gate through phases 2-4.
function initAiTestHarness() {
  const section = document.getElementById('ai-test-harness');
  if (!section) return;
  section.classList.remove('hidden');

  const out = document.getElementById('ai-test-output');
  const searchBtn = document.getElementById('ai-test-search');
  const agentBtn = document.getElementById('ai-test-agent');

  const print = (label, data) => {
    const body = (typeof data === 'string') ? data : JSON.stringify(data, null, 2);
    out.textContent = label + '\n\n' + body;
  };

  searchBtn.addEventListener('click', async () => {
    searchBtn.classList.add('btn-disabled');
    out.textContent = 'Running search test…';
    try {
      const res = await searchConcepts({ query: 'diabetes', valueSetEcl: '< 404684003' });
      print('search_concepts → backend=' + getActiveBackendName() + ', count=' + res.length, res);
    } catch (e) {
      print('Search test failed', String((e && e.message) || e));
    } finally {
      searchBtn.classList.remove('btn-disabled');
    }
  });

  agentBtn.addEventListener('click', async () => {
    agentBtn.classList.add('btn-disabled');
    out.textContent = 'Running agent test… (makes OpenRouter calls)';
    const tools = getTools();
    const toolImpl = {
      search_concepts: (args) => searchConcepts(args),
      lookup_concept: (args) => lookupConcept(args),
    };
    try {
      const result = await runAgent({
        systemPrompt: "Return JSON array of SNOMED codes for 'type 2 diabetes mellitus'. Use search_concepts to verify.",
        userMessage: 'type 2 diabetes mellitus',
        tools,
        toolImpl,
        model: getAiSettings().OPENROUTER_MODEL,
      });
      const summary = 'runAgent → backend=' + getActiveBackendName()
        + (result.error ? (', error=' + result.error) : '')
        + ', transcript turns=' + result.transcript.length;
      print(summary, result.parsed != null ? result.parsed : (result.finalContent || '(no content)'));
    } catch (e) {
      print('Agent test failed', String((e && e.message) || e));
    } finally {
      agentBtn.classList.remove('btn-disabled');
    }
  });
}

// Feature A wiring: enable the Suggest-codes button when notes are present, run
// the agent on click, and route the review list's accept actions through
// addReasonTag (tagging them source:'ai' so they render as distinct indigo chips).
function initReasonCoding() {
  const notes = document.getElementById('clinical-notes');
  const btn = document.getElementById('ai-suggest-codes');
  const status = document.getElementById('ai-codes-status');
  const review = document.getElementById('ai-codes-review');
  if (!notes || !btn || !review) return;

  let isRunning = false;
  const setStatus = (text) => { if (status) status.textContent = text; };
  // Reflect the remaining review count; clears at 0 so the hint never lingers
  // after accept-all / reject-all (or the last individual accept/reject).
  const reviewCount = (n) => setStatus(n > 0 ? (n + ' suggestion' + (n === 1 ? '' : 's') + ' to review') : '');
  // Disabled while a run is in flight (prevents a concurrent submission even if
  // the user edits the notes mid-run) or when there is nothing to send.
  const updateBtnState = () => { btn.disabled = isRunning || !notes.value.trim(); };
  notes.addEventListener('input', updateBtnState);
  updateBtnState();

  async function run() {
    if (isRunning) return;
    isRunning = true;
    setLoadingState(btn, true, 'Deriving codes…');
    updateBtnState();
    setStatus('Deriving codes…');
    review.classList.add('hidden');
    review.replaceChildren();
    try {
      const { codes, error } = await suggestReasonCodes();
      if (error) {
        renderErrorState(review, error, run);
        setStatus('Could not derive codes');
      } else if (!codes.length) {
        renderEmptyState(review, 'No codes could be confidently derived. Please add codes manually.');
        setStatus('No codes derived');
      } else {
        renderSuggestionReviewList({
          container: review,
          items: codes,
          kind: 'reason',
          onAccept: (item) => addReasonTag({ ...item, source: 'ai' }),
          onAcceptAll: (items) => items.forEach((item) => addReasonTag({ ...item, source: 'ai' })),
          onCountChange: reviewCount, // keeps #ai-codes-status fresh; clears at 0
        });
      }
    } finally {
      isRunning = false;
      setLoadingState(btn, false);
      updateBtnState();
    }
  }

  btn.addEventListener('click', run);
}

function boot() {
  // ----- FHIR server base URL -----
  state.FHIR_BASE = document.getElementById('fhir-base').value || 'https://server.callistemon.site/fhir';

  // ----- Auth + fetch monkey-patch -----
  initAuthFetch();
  maybePromptPasswordFor(state.FHIR_BASE);
  initAuthManage();

  // Apply FHIR base button
  document.getElementById('apply-fhir-base').addEventListener('click', () => {
    state.FHIR_BASE = document.getElementById('fhir-base').value.replace(/\/+$/, '');
    showStatus('Now using: ' + state.FHIR_BASE);
    maybePromptPasswordFor(state.FHIR_BASE);
  });

  // ----- JSON viewer (CDN global) -----
  try {
    viewer = new JSONViewer();
    $('#json-viewer').appendChild(viewer.getContainer());
  } catch (e) {
    console.warn('JSONViewer fallback', e);
    viewer = {
      show(o) {
        $('#json-viewer').innerHTML = '<pre class="mono text-xs whitespace-pre-wrap"></pre>';
        $('#json-viewer pre').textContent = JSON.stringify(o, null, 2);
      },
    };
  }

  // ----- Debug panel -----
  initDebugPanel();

  // ----- Server panel toggle -----
  {
    const panel = document.getElementById('server-panel');
    const toggle = document.getElementById('server-toggle');
    const close = document.getElementById('server-close');
    if (toggle) toggle.addEventListener('click', () => panel.classList.toggle('hidden'));
    if (close) close.addEventListener('click', () => panel.classList.add('hidden'));
  }

  // ----- AI settings panel (extends #server-panel; no new floating button) -----
  initAiSettingsPanel();

  // ----- Ontoserver backend probe + one-line debug banner (backend + model) -----
  (async () => {
    let backend = 'unknown';
    try { backend = await initOntoserverBackend(); } catch (_e) { backend = 'rest'; }
    const banner = document.getElementById('ai-backend-banner');
    if (banner) {
      banner.textContent = 'AI: Ontoserver backend = ' + backend + ' · model = ' + getAiSettings().OPENROUTER_MODEL;
    }
  })();

  // ----- AI test harness (revealed only by ?aitest=1) -----
  if (location.search.includes('aitest=1')) initAiTestHarness();

  // ----- Server preset handlers -----
  {
    const sel = document.getElementById('server-preset');
    const apply = document.getElementById('apply-preset');
    const inp = document.getElementById('fhir-base');
    if (sel && apply && inp) {
      sel.addEventListener('change', function() { inp.value = this.value; });
      apply.addEventListener('click', () => { inp.value = sel.value; });
    }
  }

  // ----- Patient mode toggle -----
  $('#ptBtnSearch').addEventListener('click', () => setPtMode('search'));
  $('#ptBtnNew').addEventListener('click', () => setPtMode('new'));

  $('#patient-name').addEventListener('input', () => {
    if (state.ptMode === 'search') { searchPatientsByName($('#patient-name').value); }
    else { hidePtAC(); }
  });
  document.addEventListener('click', (e) => {
    const ac = $('#pt-ac');
    if (!ac.contains(e.target) && e.target !== $('#patient-name')) hidePtAC();
  });

  // ----- Tabs: Pathology / Radiology -----
  document.getElementById('pathology-tab').addEventListener('click', () => {
    document.getElementById('pathology-tab').classList.add('border-b-2', 'border-blue-600', 'font-semibold');
    document.getElementById('radiology-tab').classList.remove('border-b-2', 'border-blue-600', 'font-semibold');
    document.getElementById('pathology-panel').classList.remove('hidden');
    document.getElementById('radiology-panel').classList.add('hidden');
  });
  document.getElementById('radiology-tab').addEventListener('click', () => {
    document.getElementById('radiology-tab').classList.add('border-b-2', 'border-blue-600', 'font-semibold');
    document.getElementById('pathology-tab').classList.remove('border-b-2', 'border-blue-600', 'font-semibold');
    document.getElementById('radiology-panel').classList.remove('hidden');
    document.getElementById('pathology-panel').classList.add('hidden');
  });

  // ----- Doctor select -----
  document.getElementById('doctor-select').addEventListener('change', (e) => {
    renderFavsForUser(e.target.value);
    updateSpecialtyDisplay(e.target.value);
  });

  // ----- Search boxes -----
  const pathOpts = {
    base: R4_BASE,
    includeDesignations: true,
    useSupplement: [SUPPLEMENT_URL],
    properties: ['pathologyTestsExplainedUrl', 'rcpaManualUrl', 'requiredSpecimen', 'collectionCentreRequirements'],
    boost: BOOST_URL,
    count: '15',
  };
  setupSearch('#pathology-search', '#pathology-results', VS.PATH, 'PATH', pathOpts);
  setupSearch('#radiology-search', '#radiology-results', VS.IMAG, 'IMAG');

  // ----- Preferred provider radio buttons -----
  {
    const container = document.getElementById('provider-supplement-selector');
    PROVIDER_SUPPLEMENTS.forEach((p, i) => {
      const label = document.createElement('label');
      label.className = 'flex items-center gap-1.5 cursor-pointer';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'provider-supplement';
      radio.value = p.id;
      radio.className = 'accent-blue-600';
      if (i === 0) radio.checked = true;
      radio.addEventListener('change', () => {
        state.activeProviderSupplement = p.url || null;
        const base = SUPPLEMENT_URL;
        pathOpts.useSupplement = p.url ? [base, p.url] : [base];
        const searchEl = document.querySelector('#pathology-search');
        if (searchEl.value.length >= 2) searchEl.dispatchEvent(new Event('input'));
      });
      const text = document.createTextNode(p.label);
      label.appendChild(radio);
      label.appendChild(text);
      container.appendChild(label);
    });
  }

  // ----- Custom adders -----
  setupCustomAdder('#pathology-custom', '#pathology-custom-add', 'PATH');
  setupCustomAdder('#radiology-custom', '#radiology-custom-add', 'IMAG');

  // ----- Build bundle button -----
  document.getElementById('build-bundle').addEventListener('click', () => {
    const { bundle } = buildBundle();
    viewer.show(bundle);
  });

  // ----- Delegated click handler for the `+` buttons on suggested-tests chips.
  // suggestions.js renders chips with data-suggested-code attributes; binding
  // the handler here (rather than inside that module) breaks an import cycle
  // with test-list.js that would otherwise grow in later phases.
  ['suggested-tests-mirror-path', 'suggested-tests-mirror-rad'].forEach((id) => {
    const cont = document.getElementById(id);
    if (!cont) return;
    cont.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-suggested-code]');
      if (!btn || !cont.contains(btn)) return;
      const code = btn.dataset.suggestedCode;
      const meta = SUGGESTED_TESTS_META[code] || { display: code, kind: 'PATH' };
      addSelectedTest({ system: 'http://snomed.info/sct', code, display: meta.display, kind: meta.kind });
    });
  });

  // ----- Copy bundle to clipboard -----
  {
    const btn = document.getElementById('copy-bundle');
    if (btn) {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        try {
          const data = window.__lastBundle ? JSON.stringify(window.__lastBundle, null, 2) : (document.getElementById('json-viewer').innerText || '');
          if (!data) return;
          await navigator.clipboard.writeText(data);
          const old = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = old; }, 1200);
        } catch (e) { console.warn('copy failed', e); }
      });
    }
  }

  // ----- Notes autocomplete -----
  wireNotesAutocomplete();

  // ----- Feature A: AI reason coding -----
  initReasonCoding();

  // ----- Pregnancy status -----
  populatePregnancyStatus();
  document.getElementById('pregnancy-status').addEventListener('change', () => applyAllWarnings());

  // ----- QR modal -----
  initQrModal();

  // ----- Send button -----
  // `onBundleBuilt` updates the JSON viewer so users who skip "Build" still see
  // the bundle they sent. Phase 4 will additionally pass `preSendHook` here for
  // decision-support gating.
  initSendButton({ onBundleBuilt: (bundle) => viewer.show(bundle) });

  // ----- Copy server response -----
  document.getElementById('copy-server-response').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = document.getElementById('server-response').textContent || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const btn = e.currentTarget;
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1200);
    } catch (_e) { /* clipboard blocked */ }
  });

  // ----- New Request (clear all, keep server) -----
  const newRequestBtn = document.getElementById('new-request-btn');
  newRequestBtn.addEventListener('click', () => {
    clearPatientForm();
    setPatientLocked(false);
    state.ptMode = 'search';
    updatePtToggleVisuals();
    state.selectedTests = [];
    renderSelectedTests();
    state.reasonTags = [];
    renderReasonTags();
    document.getElementById('clinical-notes').value = '';
    document.getElementById('pregnancy-status').value = '';
    document.getElementById('json-viewer').innerHTML = '';
    document.getElementById('server-response').textContent = '';
    document.getElementById('error-box').classList.add('hidden');
    document.getElementById('status-box').classList.add('hidden');
    state.lastRequisitionId = null;
    const doc = document.getElementById('doctor-select').value || 'Dr Confident Cane Toad';
    renderFavsForUser(doc);
    newRequestBtn.classList.add('hidden');
  });

  // ----- Initial render -----
  const defaultDoctor = document.getElementById('doctor-select').value || 'Dr Confident Cane Toad';
  renderFavsForUser(defaultDoctor);
  updateSpecialtyDisplay(defaultDoctor);
  computeAndRenderSuggestions();
  updatePtToggleVisuals();
  preloadFastingCodes();
  preloadSiteSpecificCodes();
  initBodySiteModal();

  if (location.protocol === 'file:') {
    showStatus('Running as file:// — ES6 modules require a local server. Use python -m http.server.');
  }

  // Connectivity check
  (async () => {
    try {
      const pingUrl = R4_BASE + '?url=' + encodeURIComponent(VS.PATH) + '&count=20&filter=' + encodeURIComponent('glucose');
      setDebugUrl(pingUrl);
      const ping = await fetch(pingUrl, { headers: { Accept: 'application/fhir+json' } });
      if (!ping.ok) throw new Error(ping.status);
    } catch (_e) { showError('Cannot reach RCPA terminology server. See console for details.'); }
  })();
}

document.addEventListener('DOMContentLoaded', boot);
