// app.js — Boot, DOM wiring, event listeners
'use strict';

(function() {
  // ----- FHIR server base URL -----
  App.FHIR_BASE = document.getElementById('fhir-base').value || 'https://server.callistemon.site/fhir';

  // ----- Auth + fetch monkey-patch -----
  App.initAuthFetch();
  App.maybePromptPasswordFor(App.FHIR_BASE);
  App.initAuthManage();

  // Apply FHIR base button
  document.getElementById('apply-fhir-base').addEventListener('click', function() {
    App.FHIR_BASE = document.getElementById('fhir-base').value.replace(/\/+$/, '');
    App.showStatus('Now using: ' + App.FHIR_BASE);
    App.maybePromptPasswordFor(App.FHIR_BASE);
  });

  // ----- JSON viewer -----
  try {
    App.viewer = new JSONViewer();
    App.$('#json-viewer').appendChild(App.viewer.getContainer());
  } catch (e) {
    console.warn('JSONViewer fallback', e);
    App.viewer = {
      show: function(o) {
        App.$('#json-viewer').innerHTML = '<pre class="mono text-xs whitespace-pre-wrap"></pre>';
        App.$('#json-viewer pre').textContent = JSON.stringify(o, null, 2);
      }
    };
  }

  // ----- Debug panel -----
  App.initDebugPanel();

  // ----- Server panel toggle -----
  (function() {
    var panel = document.getElementById('server-panel');
    var toggle = document.getElementById('server-toggle');
    var close = document.getElementById('server-close');
    if (toggle) toggle.addEventListener('click', function() { panel.classList.toggle('hidden'); });
    if (close) close.addEventListener('click', function() { panel.classList.add('hidden'); });
  })();

  // ----- Server preset handlers -----
  (function() {
    var sel = document.getElementById('server-preset');
    var apply = document.getElementById('apply-preset');
    var inp = document.getElementById('fhir-base');
    if (sel && apply && inp) {
      sel.addEventListener('change', function() { inp.value = this.value; });
      apply.addEventListener('click', function() { inp.value = sel.value; });
    }
  })();

  // ----- Patient mode toggle -----
  App.$('#ptBtnSearch').addEventListener('click', function() { App.setPtMode('search'); });
  App.$('#ptBtnNew').addEventListener('click', function() { App.setPtMode('new'); });

  App.$('#patient-name').addEventListener('input', function() {
    if (App.ptMode === 'search') { App.searchPatientsByName(App.$('#patient-name').value); }
    else { App.hidePtAC(); }
  });
  document.addEventListener('click', function(e) {
    var ac = App.$('#pt-ac');
    if (!ac.contains(e.target) && e.target !== App.$('#patient-name')) App.hidePtAC();
  });

  // ----- Tabs: Pathology / Radiology -----
  document.getElementById('pathology-tab').addEventListener('click', function() {
    document.getElementById('pathology-tab').classList.add('border-b-2', 'border-blue-600', 'font-semibold');
    document.getElementById('radiology-tab').classList.remove('border-b-2', 'border-blue-600', 'font-semibold');
    document.getElementById('pathology-panel').classList.remove('hidden');
    document.getElementById('radiology-panel').classList.add('hidden');
  });
  document.getElementById('radiology-tab').addEventListener('click', function() {
    document.getElementById('radiology-tab').classList.add('border-b-2', 'border-blue-600', 'font-semibold');
    document.getElementById('pathology-tab').classList.remove('border-b-2', 'border-blue-600', 'font-semibold');
    document.getElementById('radiology-panel').classList.remove('hidden');
    document.getElementById('pathology-panel').classList.add('hidden');
  });

  // ----- Doctor select -----
  document.getElementById('doctor-select').addEventListener('change', function(e) {
    App.renderFavsForUser(e.target.value);
    App.updateSpecialtyDisplay(e.target.value);
  });

  // ----- Search boxes -----
  App.setupSearch('#pathology-search', '#pathology-results', App.VS.PATH, 'PATH', {
    base: App.R4_BASE,
    includeDesignations: true,
    useSupplement: App.SUPPLEMENT_URL + '|1.0.0',
    properties: ['pathologyTestsExplainedUrl', 'rcpaManualUrl', 'requiredSpecimen'],
    boost: App.BOOST_URL,
    count: '15'
  });
  App.setupSearch('#radiology-search', '#radiology-results', App.VS.IMAG, 'IMAG');

  // ----- Custom adders -----
  App.setupCustomAdder('#pathology-custom', '#pathology-custom-add', 'PATH');
  App.setupCustomAdder('#radiology-custom', '#radiology-custom-add', 'IMAG');

  // ----- Specialty label -----
  App.updateSpecialtyDisplay = function(name) {
    var sp = App.roleSpecialties[name];
    var el = document.getElementById('doctor-specialty');
    var text = sp ? ('Specialty: ' + sp.display) : '';
    el.textContent = text;
    if (text) { el.classList.remove('hidden'); } else { el.classList.add('hidden'); }
  };

  // ----- Build bundle button -----
  document.getElementById('build-bundle').addEventListener('click', function() { App.buildBundle(); });

  // ----- Copy bundle to clipboard -----
  (function() {
    var btn = document.getElementById('copy-bundle');
    if (btn) {
      btn.addEventListener('click', async function(ev) {
        ev.stopPropagation();
        try {
          var data = window.__lastBundle ? JSON.stringify(window.__lastBundle, null, 2) : (document.getElementById('json-viewer').innerText || '');
          if (!data) return;
          await navigator.clipboard.writeText(data);
          var old = btn.textContent; btn.textContent = 'Copied!'; setTimeout(function() { btn.textContent = old; }, 1200);
        } catch (e) { console.warn('copy failed', e); }
      });
    }
  })();

  // ----- Notes autocomplete -----
  App.wireNotesAutocomplete();

  // ----- Pregnancy status -----
  App.populatePregnancyStatus();
  document.getElementById('pregnancy-status').addEventListener('change', function() { App.applyAllWarnings(); });

  // ----- QR modal -----
  App.initQrModal();

  // ----- Send button -----
  App.initSendButton();

  // ----- Copy server response -----
  document.getElementById('copy-server-response').addEventListener('click', async function(e) {
    e.preventDefault();
    e.stopPropagation();
    var text = document.getElementById('server-response').textContent || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      var btn = e.currentTarget;
      var orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = orig; }, 1200);
    } catch (_e) {}
  });

  // ----- New Request (clear all, keep server) -----
  var newRequestBtn = document.getElementById('new-request-btn');
  newRequestBtn.addEventListener('click', function() {
    App.clearPatientForm();
    App.setPatientLocked(false);
    App.ptMode = 'search';
    App.updatePtToggleVisuals();
    App.selectedTests = [];
    App.renderSelectedTests();
    App.reasonTags = [];
    App.renderReasonTags();
    document.getElementById('clinical-notes').value = '';
    document.getElementById('pregnancy-status').value = '';
    document.getElementById('json-viewer').innerHTML = '';
    document.getElementById('server-response').textContent = '';
    document.getElementById('error-box').classList.add('hidden');
    document.getElementById('status-box').classList.add('hidden');
    App.lastRequisitionId = null;
    var doc = document.getElementById('doctor-select').value || 'Dr Confident Cane Toad';
    App.renderFavsForUser(doc);
    newRequestBtn.classList.add('hidden');
  });

  // ----- Boot -----
  var defaultDoctor = document.getElementById('doctor-select').value || 'Dr Confident Cane Toad';
  App.renderFavsForUser(defaultDoctor);
  App.updateSpecialtyDisplay(defaultDoctor);
  App.computeAndRenderSuggestions();
  App.updatePtToggleVisuals();
  App.preloadFastingCodes();

  if (location.protocol === 'file:') App.showStatus('Running as file:// \u2014 some browsers block fetch. Use a local server for full functionality.');

  // Connectivity check
  (async function() {
    try {
      var pingUrl = App.R4_BASE + '?url=' + encodeURIComponent(App.VS.PATH) + '&count=20&filter=' + encodeURIComponent('glucose');
      App.setDebugUrl(pingUrl);
      var ping = await fetch(pingUrl, { headers: { Accept: 'application/fhir+json' } });
      if (!ping.ok) throw new Error(ping.status);
    } catch (_e) { App.showError('Cannot reach RCPA terminology server. See console for details.'); }
  })();
})();
