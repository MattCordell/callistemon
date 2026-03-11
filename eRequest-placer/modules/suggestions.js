// modules/suggestions.js — Suggestion rules, metadata, compute & render
'use strict';

window.App = window.App || {};

// Suggested tests metadata (demo only)
App.SUGGESTED_TESTS_META = {
  "269820002": { display: "Serum iron tests", kind: 'PATH' },
  "313440008": { display: "Serum TSH measurement", kind: 'PATH' },
  "26604007":  { display: "Full blood count", kind: 'PATH' },
  "166434005": { display: "Serum pregnancy test (B-HCG)", kind: 'PATH' },
  "45036003":  { display: "Ultrasound of abdomen", kind: 'IMAG' },
  "241601008": { display: "MRI of head", kind: 'IMAG' },
  "3621000087107": { display: "Plain X-ray of left hand", kind: 'IMAG' },
  "3631000087109": { display: "Plain X-ray of right hand", kind: 'IMAG' },
  "43396009": { display: "HbA1c (glycated haemoglobin)", kind: 'PATH' }
};

// To add a new suggestion rule: push a new entry with parent SNOMED codes and test codes.
App.SUGGESTION_RULES = [
  { parents: ['359752005'], tests: ['269820002', '313440008', '26604007', '43396009'] },
  { parents: ['276319003', '609624008'], tests: ['166434005', '45036003'] },
  { parents: ['82271004'], tests: ['241601008'] },
  { parents: ['125599006'], tests: ['3621000087107', '3631000087109'] }
];

App.suggestedRenderToken = 0;

App.computeSuggestions = async function() {
  var codes = (App.reasonTags || [])
    .filter(function(t) { return (t.system || 'http://snomed.info/sct').includes('snomed'); })
    .map(function(t) { return t.code; });
  if (!codes.length) return [];
  var suggestions = new Set();
  for (var ri = 0; ri < App.SUGGESTION_RULES.length; ri++) {
    var rule = App.SUGGESTION_RULES[ri];
    var match = false;
    for (var pi = 0; pi < rule.parents.length; pi++) {
      for (var ci = 0; ci < codes.length; ci++) {
        if (await App.snomedSubsumes(rule.parents[pi], codes[ci])) { match = true; break; }
      }
      if (match) break;
    }
    if (match) { rule.tests.forEach(function(tc) { suggestions.add(tc); }); }
  }
  var selectedCodes = new Set(App.selectedTests.map(function(t) { return t.code; }).filter(Boolean));
  return Array.from(suggestions).filter(function(c) { return !selectedCodes.has(c); });
};

App.renderSuggestedTestsMirrored = async function() {
  var token = ++App.suggestedRenderToken;
  var list = await App.computeSuggestions();
  if (token !== App.suggestedRenderToken) return;

  var pathCont = document.getElementById('suggested-tests-mirror-path');
  var radCont  = document.getElementById('suggested-tests-mirror-rad');
  var pathEmpty = document.getElementById('suggested-tests-empty-path');
  var radEmpty  = document.getElementById('suggested-tests-empty-rad');

  function fill(container, emptyEl) {
    container.innerHTML = '';
    if (!list.length) { emptyEl.classList.remove('hidden'); return; }
    emptyEl.classList.add('hidden');
    var seen = new Set();
    list.forEach(function(code) {
      if (seen.has(code)) return; seen.add(code);
      var meta = App.SUGGESTED_TESTS_META[code] || { display: code, kind: 'PATH' };
      var chip = document.createElement('span');
      chip.className = 'inline-flex items-center gap-1.5 border border-emerald-100 bg-emerald-50 text-emerald-800 rounded-full px-2 py-0.5 text-xs';
      var label = document.createElement('span');
      label.textContent = meta.display;
      var add = document.createElement('button');
      add.type = 'button'; add.textContent = '\uFF0B'; add.title = 'Add test';
      add.onclick = function() { App.addSelectedTest({ system: 'http://snomed.info/sct', code: code, display: meta.display, kind: meta.kind }); };
      chip.appendChild(label); chip.appendChild(add); container.appendChild(chip);
    });
  }

  fill(pathCont, pathEmpty);
  fill(radCont, radEmpty);
};

App.computeAndRenderSuggestions = function() { App.renderSuggestedTestsMirrored(); };
