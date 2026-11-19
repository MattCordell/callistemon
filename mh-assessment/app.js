// Boot: views, settings, the form, the Terminology Lens and the Binding Review.
// Routes: #form/<tab-id> for the form, #review for the Binding Review.

import { getConfig, onConfigChange } from './config.js';
import { clearCache } from './modules/terminology.js';
import { mountBindingReview, runAll } from './modules/binding-review.js';
import { mountSettings } from './modules/settings.js';
import { mountForm, showTab, rerenderForm } from './modules/form.js';
import { mountLens, clearLensCache } from './modules/lens.js';
import { getPatient, setPatient } from './modules/state.js';
import { loadExample, formHasData } from './modules/example.js';
import { $ } from './modules/ui.js';

const DEFAULT_VIEW = 'form';
let reviewStarted = false;

function showView() {
  const [view, sub] = (location.hash || `#${DEFAULT_VIEW}`).slice(1).split('/');
  const known = ['form', 'review'].includes(view) ? view : DEFAULT_VIEW;
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== `view-${known}`; });
  document.querySelectorAll('.view-switch a').forEach(a => {
    a.setAttribute('aria-current', a.dataset.view === known ? 'page' : 'false');
  });
  document.body.dataset.view = known;
  if (known === 'form') showTab(sub);
  if (known === 'review' && !reviewStarted) {
    reviewStarted = true;
    runAll();
  }
}

mountForm($('#view-form'));
mountBindingReview($('#view-review'));
mountSettings($('#settings-dialog'), $('#open-settings'));
mountLens($('#lens-toggle'), $('#concept-drawer'));

let fhirBase = getConfig().FHIR_BASE;

// runAll() clears the cache itself; clear it here only when the review isn't running.
onConfigChange(cfg => {
  if (reviewStarted) runAll();
  else clearCache();
  clearLensCache();
  // A patient picked from the old FHIR server may not exist on the new one.
  if (cfg.FHIR_BASE !== fhirBase) {
    fhirBase = cfg.FHIR_BASE;
    if (getPatient()?.mode === 'existing') setPatient(null);
  }
  rerenderForm();
});

// FR-11: Load example.
const exampleBtn = $('#load-example');
const exampleStatus = $('#example-status');
let statusTimer = null;
exampleBtn.addEventListener('click', async () => {
  if (formHasData() && !confirm('Replace the current form with the example assessment?')) return;
  clearTimeout(statusTimer);
  exampleBtn.disabled = true;
  exampleStatus.textContent = 'Loading the example...';
  try {
    const { loaded, skipped, changed } = await loadExample();
    if (changed) {
      exampleStatus.textContent = 'The form or settings changed while the example was loading, so nothing was replaced. Press Load example again.';
    } else {
      rerenderForm();
      exampleStatus.textContent = `Example loaded: ${loaded} fields filled`
        + (skipped ? `, ${skipped} ${skipped === 1 ? 'value' : 'values'} skipped (see the browser console).` : '.');
    }
  } catch (err) {
    exampleStatus.textContent = `The example could not be loaded: ${err.message}`;
  } finally {
    exampleBtn.disabled = false;
    statusTimer = setTimeout(() => { exampleStatus.textContent = ''; }, 10000);
  }
});

window.addEventListener('hashchange', showView);
showView();
