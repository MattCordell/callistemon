// Review and submit tab (FR-10): assessment details, live Bundle preview,
// copy, download, POST, and the result or error display.

import { DEFINITION } from '../definition/assessment-definition.js';
import { getConfig } from '../config.js';
import { getAssessment, setAssessment, setPatient, subscribe } from './state.js';
import { expand } from './terminology.js';
import { postTransaction, parseLocation, resourceUrl, FhirError } from './fhir-client.js';
import { buildBundle } from './bundle.js';
import { buildQuestionnaire } from './questionnaire.js';
import { resetUuids } from './fhir-codes.js';
import { esc, html, debounce, copyText, downloadText } from './ui.js';

const REBUILD_MS = 300;

export function renderSubmitPanel() {
  const root = html(`
    <div class="submit-panel">
      <section class="form-section">
        <h3>Assessment details</h3>
        <div class="assessment-details">
          <label class="field">
            <span class="field-label">Assessment date and time</span>
            <input type="datetime-local" class="input" data-assessment-time>
            <span class="field-helper">Used for the Encounter start and every recorded time.</span>
          </label>
          <label class="field">
            <span class="field-label">Encounter class</span>
            <select class="input" data-encounter-class><option>Loading...</option></select>
            <span class="field-helper" data-class-note></span>
          </label>
        </div>
      </section>

      <section class="form-section">
        <h3>Submit to the FHIR server</h3>
        <p class="submit-summary" data-summary aria-live="polite"><span class="spinner" aria-hidden="true"></span> Building the Bundle...</p>
        <div data-blockers></div>
        <div data-warnings></div>
        <div class="submit-actions">
          <button type="button" class="btn" data-post disabled>POST transaction</button>
          <button type="button" class="btn btn-secondary" data-download disabled>Download JSON</button>
          <button type="button" class="btn btn-secondary" data-copy disabled>Copy JSON</button>
          <span class="small muted" data-copy-status aria-live="polite"></span>
        </div>
        <p class="small muted" data-target></p>
        <div class="submit-result" data-result aria-live="polite"></div>
      </section>

      <section class="form-section">
        <h3>Questionnaire</h3>
        <p class="small muted">The QuestionnaireResponse references a Questionnaire generated from the definition file:
          one item per field, grouped by tab, with each coded field's ECL as its answer value set.</p>
        <div class="submit-actions">
          <button type="button" class="btn btn-secondary" data-questionnaire>Download Questionnaire</button>
          <span class="small muted" data-questionnaire-status aria-live="polite"></span>
        </div>
        <p class="small muted">Canonical URL: <code>${esc(DEFINITION.questionnaireUrl)}</code></p>
      </section>

      <section class="form-section">
        <h3>Bundle preview <button type="button" class="btn-link preview-toggle" data-toggle-all>Expand all</button></h3>
        <div class="bundle-preview" data-preview></div>
      </section>
    </div>`);

  const $ = sel => root.querySelector(sel);
  let current = null;      // latest build result
  let buildSeq = 0;
  let posting = false;
  const open = new Set();  // keys of expanded preview entries

  // ---- assessment details
  const timeInput = $('[data-assessment-time]');
  timeInput.value = getAssessment().dateTime;
  timeInput.addEventListener('input', () => setAssessment({ dateTime: timeInput.value }));
  loadEncounterClasses($('[data-encounter-class]'), $('[data-class-note]'));

  // ---- build and preview
  // Builds from the current form state and returns the result (null on error).
  // Only the newest build updates the display.
  async function rebuild() {
    const seq = ++buildSeq;
    let built;
    try {
      built = await buildBundle();
    } catch (err) {
      if (seq === buildSeq) {
        current = null;
        $('[data-summary]').innerHTML = `<span class="text-warn">Could not build the Bundle: ${esc(err.message)}</span>`;
        updateButtons();
      }
      return null;
    }
    if (seq === buildSeq) {
      current = built;
      drawSummary(built);
      drawPreview(built);
      updateButtons();
    }
    return built;
  }
  const scheduleRebuild = debounce(rebuild, REBUILD_MS);

  // POST, Copy and Download use a build made at the moment of the click, so a
  // change made in the last few hundred milliseconds is never left out.
  function freshBuild() {
    scheduleRebuild.cancel();
    return rebuild();
  }

  function drawSummary({ entries, warnings, blockers }) {
    const counts = new Map();
    for (const e of entries) counts.set(e.resource.resourceType, (counts.get(e.resource.resourceType) || 0) + 1);
    const parts = [...counts].map(([type, n]) => `${n} ${type}`);
    $('[data-summary]').textContent = `Transaction Bundle with ${entries.length} ${entries.length === 1 ? 'resource' : 'resources'}: ${parts.join(', ')}.`;
    $('[data-blockers]').innerHTML = blockers.length
      ? `<div class="notice notice-warn" role="alert"><strong>Before you can submit:</strong><ul>${blockers.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
          <p class="small">Until then, Copy and Download give a draft that is not a valid Bundle.</p></div>`
      : '';
    $('[data-warnings]').innerHTML = warnings.length
      ? `<div class="notice"><strong>Not extracted:</strong><ul>${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>`
      : '';
    $('[data-target]').textContent = `Posts to ${getConfig().FHIR_BASE}`;
  }

  function drawPreview({ entries }) {
    const preview = $('[data-preview]');
    preview.innerHTML = entries.map(e => `
      <details class="bundle-entry" data-key="${esc(e.key)}"${open.has(e.key) ? ' open' : ''}>
        <summary>
          <span class="entry-type">${esc(e.resource.resourceType)}</span>
          <span class="entry-label">${esc(e.label)}</span>
        </summary>
        <pre class="json">${esc(JSON.stringify(e.resource, null, 2))}</pre>
        <p class="small muted entry-url">fullUrl ${esc(e.fullUrl)}</p>
      </details>`).join('');
    updateToggleAll();
  }

  $('[data-preview]').addEventListener('toggle', e => {
    const d = e.target;
    if (!d.matches?.('details[data-key]')) return;
    if (d.open) open.add(d.dataset.key);
    else open.delete(d.dataset.key);
    updateToggleAll();
  }, true);

  function updateToggleAll() {
    const all = [...root.querySelectorAll('details[data-key]')];
    const allOpen = all.length > 0 && all.every(d => d.open);
    $('[data-toggle-all]').textContent = allOpen ? 'Collapse all' : 'Expand all';
  }

  $('[data-toggle-all]').addEventListener('click', () => {
    const all = [...root.querySelectorAll('details[data-key]')];
    const openAll = !all.every(d => d.open);
    all.forEach(d => { d.open = openAll; });
  });

  function updateButtons() {
    const ready = !!current;
    $('[data-copy]').disabled = !ready;
    $('[data-download]').disabled = !ready;
    const post = $('[data-post]');
    post.disabled = !ready || posting || current.blockers.length > 0;
    post.textContent = posting ? 'Posting...' : 'POST transaction';
  }

  // ---- copy and download
  // A Bundle with blockers is a draft: it is marked as one, not presented as valid.
  const bundleJson = built => JSON.stringify(built.bundle, null, 2);
  const isDraft = built => built.blockers.length > 0;

  $('[data-copy]').addEventListener('click', async () => {
    const built = await freshBuild();
    if (!built) return;
    const ok = await copyText(bundleJson(built));
    const status = $('[data-copy-status]');
    status.textContent = !ok ? 'Copy failed. Use Download instead.'
      : isDraft(built) ? 'Copied a draft. It is not a valid Bundle yet.' : 'Copied.';
    setTimeout(() => { status.textContent = ''; }, 4000);
  });

  $('[data-download]').addEventListener('click', async () => {
    const built = await freshBuild();
    if (!built) return;
    const name = `mh-assessment-bundle-${isDraft(built) ? 'DRAFT-not-valid-' : ''}${stamp()}.json`;
    downloadText(name, bundleJson(built), 'application/fhir+json');
  });

  // ---- Questionnaire (FR-12)
  $('[data-questionnaire]').addEventListener('click', async () => {
    const btn = $('[data-questionnaire]');
    const status = $('[data-questionnaire-status]');
    btn.disabled = true;
    status.textContent = 'Building the Questionnaire...';
    try {
      const q = await buildQuestionnaire();
      downloadText(`mh-assessment-questionnaire-${q.version}.json`, JSON.stringify(q, null, 2), 'application/fhir+json');
      status.textContent = '';
    } catch (err) {
      status.textContent = `Could not build the Questionnaire: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });

  // ---- POST
  $('[data-post]').addEventListener('click', async () => {
    if (posting) return;
    posting = true;
    updateButtons();
    const out = $('[data-result]');
    out.innerHTML = '<p class="muted"><span class="spinner" aria-hidden="true"></span> Preparing the Bundle...</p>';
    const sent = await freshBuild();
    if (!sent || sent.blockers.length) {
      posting = false;
      updateButtons();
      out.innerHTML = sent ? '<p class="text-warn">The Bundle cannot be submitted yet. See the items above.</p>' : '';
      return;
    }
    out.innerHTML = '<p class="muted"><span class="spinner" aria-hidden="true"></span> Sending the transaction...</p>';
    try {
      const response = await postTransaction(sent.bundle);
      // The next POST must not reuse these ids in the preview.
      resetUuids();
      drawSuccess(out, sent, response);
    } catch (err) {
      drawError(out, err, sent);
    } finally {
      posting = false;
      updateButtons();
      scheduleRebuild();
    }
  });

  function drawSuccess(out, sent, response) {
    const rows = (response.entry || []).map((entry, i) => {
      const loc = parseLocation(entry.response?.location);
      const req = sent.entries[i];
      return {
        type: loc?.type || req?.resource.resourceType || '?',
        id: loc?.id || '',
        status: entry.response?.status || '',
        label: req?.label || '',
        resource: req?.resource
      };
    });
    const created = rows.filter(r => r.id);
    const newPatient = rows.find(r => r.type === 'Patient' && r.id && sent.entries.some(e => e.key === 'patient'));
    out.innerHTML = `
      <div class="notice notice-ok" role="status">
        <strong>Transaction accepted.</strong> ${created.length} ${created.length === 1 ? 'resource' : 'resources'} created on the server.
        Posting again creates new copies.
      </div>
      <table class="result-table">
        <thead><tr><th>Resource</th><th>Server id</th><th>Status</th><th>Content</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td>${esc(r.type)}</td>
            <td>${r.id ? `<a href="${esc(resourceUrl(r.type, r.id))}" target="_blank" rel="noopener">${esc(r.id)}</a>` : '<span class="muted">none</span>'}</td>
            <td>${esc(r.status)}</td>
            <td>${esc(r.label)}</td>
          </tr>`).join('')}</tbody>
      </table>
      ${newPatient ? `
        <p class="small">The new patient now exists on the server.
          <button type="button" class="btn-link" data-use-patient>Use this patient for the next assessment</button>
          so posting again does not create a second patient.</p>` : ''}`;

    out.querySelector('[data-use-patient]')?.addEventListener('click', () => {
      setPatient({ mode: 'existing', resource: { ...newPatient.resource, id: newPatient.id } });
    });
  }

  // The outcome is known only when the FHIR server itself answered: an
  // OperationOutcome, or a 4xx refusal. After a timeout, a network drop or a
  // 5xx from a proxy, the transaction may still have been saved.
  function drawError(out, err, sent) {
    const code = err instanceof FhirError ? err.status : 0;
    const status = code ? `HTTP ${code}` : 'no response';
    const issues = err.outcome?.resourceType === 'OperationOutcome' ? (err.outcome.issue || []) : [];
    const known = issues.length > 0 || (code >= 400 && code < 500);
    const check = checkUrl(sent);
    out.innerHTML = `
      <div class="notice notice-warn" role="alert">
        ${known ? `
          <strong>The transaction failed (${esc(status)}).</strong>
          ${issues.length ? 'The server explained why in the table below.' : esc(err.message)}
          <br><span class="small">Nothing was created: a transaction succeeds or fails as a whole.</span>` : `
          <strong>The result is unknown (${esc(status)}).</strong>
          <br><span class="small">${esc(err.message)}</span>
          <br>The server may have saved the transaction before the connection failed.
          Check the server before you post again, or you may create a second copy of every resource.
          ${check ? `<br><a href="${esc(check.url)}" target="_blank" rel="noopener">${esc(check.text)}</a>` : ''}`}
      </div>
      ${issues.length ? `
        <table class="result-table outcome-table">
          <caption>OperationOutcome from the server</caption>
          <thead><tr><th>Severity</th><th>Code</th><th>Details</th><th>Location</th></tr></thead>
          <tbody>${issues.map(i => `
            <tr class="sev-${esc(i.severity)}">
              <td>${esc(i.severity)}</td>
              <td>${esc(i.code)}</td>
              <td>${esc(i.details?.text || i.diagnostics || '')}${i.details?.text && i.diagnostics ? `<br><span class="small muted">${esc(i.diagnostics)}</span>` : ''}</td>
              <td>${esc([...(i.expression || []), ...(i.location || [])].join(', '))}</td>
            </tr>`).join('')}</tbody>
        </table>` : ''}`;
  }

  // ---- live updates
  const unsubscribe = subscribe(() => {
    if (!root.isConnected) {
      // The panel was replaced (for example after a settings change).
      unsubscribe();
      scheduleRebuild.cancel();
      return;
    }
    if (getAssessment().dateTime !== timeInput.value && document.activeElement !== timeInput) {
      timeInput.value = getAssessment().dateTime;
    }
    scheduleRebuild();
  });
  rebuild();
  return root;
}

// A server search that shows whether an uncertain POST was saved: the
// patient's latest Encounters, or for a new patient, patients with that family name.
function checkUrl(sent) {
  const base = getConfig().FHIR_BASE;
  const resources = sent?.entries.map(e => e.resource) || [];
  const subject = resources.find(r => r.resourceType === 'Encounter')?.subject?.reference || '';
  if (subject.startsWith('Patient/')) {
    return {
      url: `${base}/Encounter?subject=${encodeURIComponent(subject)}&_sort=-_lastUpdated`,
      text: "Check this patient's latest Encounters"
    };
  }
  const family = resources.find(r => r.resourceType === 'Patient')?.name?.[0]?.family;
  if (family) {
    return {
      url: `${base}/Patient?family=${encodeURIComponent(family)}&_sort=-_lastUpdated`,
      text: `Check for patients named ${family}`
    };
  }
  return { url: `${base}/Encounter?_sort=-_lastUpdated&_count=10`, text: 'Check the latest Encounters on the server' };
}

// Encounter class dropdown (FR-2): v3 ActEncounterCode, default from the definition.
async function loadEncounterClasses(select, note) {
  const { classValueSet, classDefault } = DEFINITION.encounter;
  const chosen = () => getAssessment().encounterClass || classDefault;
  let members = [];
  try {
    const res = await expand({ valueSet: classValueSet }, { count: 100 });
    members = res.contains.filter(m => !m.inactive);
    note.textContent = '';
  } catch (err) {
    note.textContent = `Classes could not be loaded (${err.message}). The default is used.`;
  }
  if (!members.some(m => m.code === chosen().code && m.system === chosen().system)) {
    members = [chosen(), ...members];
  }
  select.innerHTML = members.map((m, i) => {
    const sel = m.code === chosen().code && m.system === chosen().system ? ' selected' : '';
    return `<option value="${i}"${sel}>${esc(m.display || m.code)} (${esc(m.code)})</option>`;
  }).join('');
  select.onchange = () => {
    const m = members[Number(select.value)];
    if (m) setAssessment({ encounterClass: { system: m.system, code: m.code, display: m.display } });
  };
}

function stamp(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
