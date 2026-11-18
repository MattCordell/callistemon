// Patient context (FR-1): search, select or create a patient, and the patient
// banner shown on every tab. New-patient fields come from the definition
// (output "patient"); this module finds them by patientElement, not by id.

import { DEFINITION } from '../definition/assessment-definition.js';
import { getPatient, setPatient, getAnswer, subscribe } from './state.js';
import { searchPatients, patientName, patientUrl } from './fhir-client.js';
import { esc, html, formatDateAU, ageFrom } from './ui.js';

const patientFields = () => DEFINITION.fields.filter(f => f.output === 'patient');
const fieldFor = element => patientFields().find(f => f.patientElement === element);
const answerFor = element => {
  const f = fieldFor(element);
  return f ? getAnswer(f.id) : undefined;
};

const capitalise = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// ---------------------------------------------------------------- picker

// Renders the Patient section of the Context tab. `renderTopField` renders
// a definition field bound to form state (passed in to avoid a module cycle).
export function renderPatientSection(sectionName, fields, renderTopField) {
  const section = html(`
    <section class="form-section patient-section">
      <h3>${esc(sectionName)}</h3>
      <div class="patient-body"></div>
    </section>`);
  const body = section.querySelector('.patient-body');
  let lastQuery = '';
  let lastResults = null;

  function draw() {
    const p = getPatient();
    if (!p) drawSearch();
    else if (p.mode === 'existing') drawCard(p.resource);
    else drawNew();
  }

  function drawSearch() {
    body.innerHTML = `
      <form class="patient-search" role="search" aria-label="Find a patient">
        <label class="field-label" for="patient-query">Find a patient on the FHIR server</label>
        <div class="inline-row">
          <input type="search" id="patient-query" class="input" placeholder="Name, for example Dingo" value="${esc(lastQuery)}">
          <button type="submit" class="btn">Search</button>
          <span class="muted">or</span>
          <button type="button" class="btn btn-secondary" data-act="new">New patient</button>
        </div>
      </form>
      <div class="patient-results" aria-live="polite"></div>`;
    if (lastResults) drawResults(lastResults);

    body.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const q = body.querySelector('#patient-query').value.trim();
      if (!q) return;
      lastQuery = q;
      const out = body.querySelector('.patient-results');
      out.innerHTML = '<p class="muted"><span class="spinner" aria-hidden="true"></span> Searching...</p>';
      try {
        lastResults = await searchPatients(q);
        drawResults(lastResults);
      } catch (err) {
        lastResults = null;
        out.innerHTML = `<p class="text-warn">Search failed: ${esc(err.message)}</p>`;
      }
    });
  }

  function drawResults(results) {
    const out = body.querySelector('.patient-results');
    if (!out) return;
    if (!results.length) {
      out.innerHTML = '<p class="muted">No patients found. Try another name, or create a new patient.</p>';
      return;
    }
    out.innerHTML = `<ul class="patient-list">${results.map((p, i) => `
      <li>
        <button type="button" class="patient-pick" data-i="${i}">${esc(patientName(p))}</button>
        <span class="muted small">${esc([
          p.birthDate ? `DOB ${formatDateAU(p.birthDate)}` : '',
          capitalise(p.gender),
          `id ${p.id}`
        ].filter(Boolean).join(' · '))}</span>
      </li>`).join('')}</ul>`;
    out.querySelectorAll('.patient-pick').forEach(btn => btn.addEventListener('click', () => {
      setPatient({ mode: 'existing', resource: results[Number(btn.dataset.i)] });
    }));
  }

  function drawCard(p) {
    const age = ageFrom(p.birthDate);
    const marital = p.maritalStatus?.coding?.[0]?.display || p.maritalStatus?.text || '';
    body.innerHTML = `
      <div class="patient-card">
        <div class="patient-card-head">
          <strong>${esc(patientName(p))}</strong>
          <span class="tag tag-ok">Existing patient</span>
        </div>
        <dl class="patient-dl">
          <dt>Date of birth</dt><dd>${esc(formatDateAU(p.birthDate) || 'Not recorded')}</dd>
          <dt>Age</dt><dd>${age == null ? 'Unknown' : `${age} years`}</dd>
          <dt>Gender</dt><dd>${esc(capitalise(p.gender) || 'Not recorded')}</dd>
          <dt>Marital status</dt><dd>${esc(marital || 'Not recorded')}</dd>
          <dt>Server id</dt><dd><a href="${esc(patientUrl(p.id))}" target="_blank" rel="noopener">${esc(p.id)}</a></dd>
        </dl>
        <button type="button" class="btn btn-secondary" data-act="change">Change patient</button>
      </div>`;
  }

  function drawNew() {
    body.innerHTML = `
      <div class="patient-new">
        <div class="patient-card-head">
          <strong>New patient</strong>
          <span class="tag">Created when the assessment is submitted</span>
        </div>
        <div class="field-stack"></div>
        <button type="button" class="btn btn-secondary" data-act="change">Find an existing patient instead</button>
      </div>`;
    const stack = body.querySelector('.field-stack');
    fields.forEach(f => stack.append(renderTopField(f)));
  }

  body.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'new') setPatient({ mode: 'new' });
    if (act === 'change') setPatient(null);
  });

  const unsubscribe = subscribe(change => {
    if (!section.isConnected && change.type) {
      unsubscribe();
      return;
    }
    if (change.type === 'patient') draw();
  });

  draw();
  return section;
}

// ---------------------------------------------------------------- banner

// The banner redraws as new-patient details are typed, so it is not a live
// region. liveEl announces only changes to the patient selection.
export function mountBanner(el, liveEl) {
  const patientIds = new Set(patientFields().map(f => f.id));
  const draw = () => { el.innerHTML = bannerHtml(); };
  subscribe(change => {
    if (change.type === 'patient' || patientIds.has(change.id)) draw();
    if (change.type === 'patient' && liveEl) liveEl.textContent = selectionMessage();
  });
  draw();
}

function selectionMessage() {
  const p = getPatient();
  if (!p) return 'No patient selected.';
  if (p.mode === 'existing') return `Patient selected: ${patientName(p.resource)}.`;
  return 'New patient. Enter their details in the Patient section.';
}

function bannerHtml() {
  const p = getPatient();
  if (!p) {
    return `<span class="pb-empty">No patient selected.</span> <a href="#form/context">Find or create a patient</a>`;
  }
  let name, dob, gender, tag;
  if (p.mode === 'existing') {
    const r = p.resource;
    name = patientName(r);
    dob = r.birthDate;
    gender = capitalise(r.gender);
    tag = `<span class="tag tag-ok">Existing &middot; id ${esc(r.id)}</span>`;
  } else {
    const family = (answerFor('name.family') || '').trim();
    const given = (answerFor('name.given') || '').trim();
    name = [family.toUpperCase(), given].filter(Boolean).join(', ') || 'New patient (name not entered)';
    dob = answerFor('birthDate');
    gender = answerFor('gender')?.display ? capitalise(answerFor('gender').display) : '';
    tag = '<span class="tag">New patient</span>';
  }
  const age = ageFrom(dob);
  const parts = [
    `<span class="pb-name">${esc(name)}</span>`,
    dob ? `<span>DOB ${esc(formatDateAU(dob))}</span>` : '',
    age != null ? `<span>Age ${age}</span>` : '',
    gender ? `<span>${esc(gender)}</span>` : '',
    tag,
    '<a href="#form/context" class="pb-change">Change</a>'
  ];
  return parts.filter(Boolean).join('');
}
