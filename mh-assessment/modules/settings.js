// Settings panel: override server URLs and the SNOMED CT edition at runtime.

import { DEFAULTS, EDITABLE_KEYS, getConfig, setConfig, resetConfig } from '../config.js';
import { $, esc } from './ui.js';

const LABELS = {
  FHIR_BASE: 'FHIR server base URL',
  TX_BASE: 'Terminology server base URL',
  SNOMED_EDITION: 'SNOMED CT edition URI (no version, so the latest release is used)'
};

export function mountSettings(dialog, openButton) {
  dialog.innerHTML = `
    <form method="dialog" class="settings-form">
      <h2>Settings</h2>
      ${EDITABLE_KEYS.map(key => `
        <label class="field">
          <span>${esc(LABELS[key])}</span>
          <input type="url" name="${key}" spellcheck="false" placeholder="${esc(DEFAULTS[key])}">
          <small class="muted">Default: ${esc(DEFAULTS[key])}. Leave blank to use the default.</small>
        </label>`).join('')}
      <p class="muted small">Changes are saved in this browser only. Saving clears the terminology cache, reloads the form's value lists (your answers are kept) and re-runs the Binding Review if it is open.</p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-action="reset">Reset to defaults</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
        <button type="submit" class="btn" value="save">Save</button>
      </div>
    </form>`;

  const form = $('form', dialog);

  openButton.addEventListener('click', () => {
    const cfg = getConfig();
    EDITABLE_KEYS.forEach(key => { form.elements[key].value = cfg[key]; });
    dialog.showModal();
  });

  form.addEventListener('submit', () => {
    const values = {};
    EDITABLE_KEYS.forEach(key => { values[key] = form.elements[key].value; });
    setConfig(values);
  });

  dialog.addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (action === 'cancel') dialog.close();
    if (action === 'reset') {
      resetConfig();
      dialog.close();
    }
  });
}
