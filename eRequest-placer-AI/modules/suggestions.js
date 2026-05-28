// modules/suggestions.js — Suggestion rules, metadata, compute & render.
//
// Renders chips with `data-suggested-code` attributes; the click handler that
// actually adds a test lives in app.js (event delegation). This keeps this
// module free of any import from test-list.js — a cycle that would otherwise
// get worse in Phase 2/3 when ai-ui.js adds more edges.

import { state } from './state.js';
import { snomedSubsumes } from './terminology.js';

// Suggested tests metadata (demo only)
export const SUGGESTED_TESTS_META = {
  '269820002': { display: 'Serum iron tests', kind: 'PATH' },
  '313440008': { display: 'Serum TSH measurement', kind: 'PATH' },
  '26604007':  { display: 'Full blood count', kind: 'PATH' },
  '166434005': { display: 'Serum pregnancy test (B-HCG)', kind: 'PATH' },
  '45036003':  { display: 'Ultrasound of abdomen', kind: 'IMAG' },
  '241601008': { display: 'MRI of head', kind: 'IMAG' },
  '3621000087107': { display: 'Plain X-ray of left hand', kind: 'IMAG' },
  '3631000087109': { display: 'Plain X-ray of right hand', kind: 'IMAG' },
  '43396009': { display: 'HbA1c (glycated haemoglobin)', kind: 'PATH' },
};

// To add a new suggestion rule: push a new entry with parent SNOMED codes and test codes.
export const SUGGESTION_RULES = [
  { parents: ['359752005'], tests: ['269820002', '313440008', '26604007', '43396009'] },
  { parents: ['276319003', '609624008'], tests: ['166434005', '45036003'] },
  { parents: ['82271004'], tests: ['241601008'] },
  { parents: ['125599006'], tests: ['3621000087107', '3631000087109'] },
];

let suggestedRenderToken = 0;

export async function computeSuggestions() {
  const codes = (state.reasonTags || [])
    .filter((t) => (t.system || 'http://snomed.info/sct').includes('snomed'))
    .map((t) => t.code);
  if (!codes.length) return [];
  const suggestions = new Set();
  for (let ri = 0; ri < SUGGESTION_RULES.length; ri++) {
    const rule = SUGGESTION_RULES[ri];
    let match = false;
    for (let pi = 0; pi < rule.parents.length; pi++) {
      for (let ci = 0; ci < codes.length; ci++) {
        if (await snomedSubsumes(rule.parents[pi], codes[ci])) { match = true; break; }
      }
      if (match) break;
    }
    if (match) { rule.tests.forEach((tc) => suggestions.add(tc)); }
  }
  const selectedCodes = new Set(state.selectedTests.map((t) => t.code).filter(Boolean));
  return Array.from(suggestions).filter((c) => !selectedCodes.has(c));
}

export async function computeAndRenderSuggestions() {
  const token = ++suggestedRenderToken;
  const list = await computeSuggestions();
  if (token !== suggestedRenderToken) return;

  const pathCont = document.getElementById('suggested-tests-mirror-path');
  const radCont  = document.getElementById('suggested-tests-mirror-rad');
  const pathEmpty = document.getElementById('suggested-tests-empty-path');
  const radEmpty  = document.getElementById('suggested-tests-empty-rad');

  function fill(container, emptyEl) {
    container.innerHTML = '';
    if (!list.length) { emptyEl.classList.remove('hidden'); return; }
    emptyEl.classList.add('hidden');
    const seen = new Set();
    list.forEach((code) => {
      if (seen.has(code)) return; seen.add(code);
      const meta = SUGGESTED_TESTS_META[code] || { display: code, kind: 'PATH' };
      const chip = document.createElement('span');
      chip.className = 'inline-flex items-center gap-1.5 border border-emerald-100 bg-emerald-50 text-emerald-800 rounded-full px-2 py-0.5 text-xs';
      const label = document.createElement('span');
      label.textContent = meta.display;
      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = '+';
      add.title = 'Add test';
      // Marker for the delegated click handler in app.js. No onclick here:
      // attaching addSelectedTest directly would re-introduce the test-list cycle.
      add.dataset.suggestedCode = code;
      chip.appendChild(label); chip.appendChild(add); container.appendChild(chip);
    });
  }

  fill(pathCont, pathEmpty);
  fill(radCont, radEmpty);
}
