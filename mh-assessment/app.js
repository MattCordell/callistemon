// Boot: views, settings and the Binding Review.

import { onConfigChange } from './config.js';
import { clearCache } from './modules/terminology.js';
import { mountBindingReview, runAll } from './modules/binding-review.js';
import { mountSettings } from './modules/settings.js';
import { $ } from './modules/ui.js';

// Session 1 opens on the Binding Review, since the form arrives in session 2.
const DEFAULT_VIEW = 'review';
let reviewStarted = false;

function showView() {
  const view = (location.hash || `#${DEFAULT_VIEW}`).slice(1);
  const known = ['form', 'review'].includes(view) ? view : DEFAULT_VIEW;
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== `view-${known}`; });
  document.querySelectorAll('.view-switch a').forEach(a => {
    a.setAttribute('aria-current', a.dataset.view === known ? 'page' : 'false');
  });
  if (known === 'review' && !reviewStarted) {
    reviewStarted = true;
    runAll();
  }
}

mountBindingReview($('#view-review'));
mountSettings($('#settings-dialog'), $('#open-settings'));

// runAll() clears the cache itself; clear it here only when the review isn't running.
onConfigChange(() => {
  if (reviewStarted) runAll();
  else clearCache();
});

window.addEventListener('hashchange', showView);
showView();
