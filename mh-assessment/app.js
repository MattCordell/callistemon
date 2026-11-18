// Boot: views, settings, the form, the Terminology Lens and the Binding Review.
// Routes: #form/<tab-id> for the form, #review for the Binding Review.

import { onConfigChange } from './config.js';
import { clearCache } from './modules/terminology.js';
import { mountBindingReview, runAll } from './modules/binding-review.js';
import { mountSettings } from './modules/settings.js';
import { mountForm, showTab, rerenderForm } from './modules/form.js';
import { mountLens } from './modules/lens.js';
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

// runAll() clears the cache itself; clear it here only when the review isn't running.
onConfigChange(() => {
  if (reviewStarted) runAll();
  else clearCache();
  rerenderForm();
});

window.addEventListener('hashchange', showView);
showView();
