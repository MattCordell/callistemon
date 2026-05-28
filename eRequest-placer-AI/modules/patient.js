// modules/patient.js — Patient search, autocomplete, form fill, lock/unlock

import { state } from './state.js';
import { $, formatAddress, setDebugUrl, showError, newUUID, uuidURN } from './utils.js';
import { PLACER_SYS } from '../config.js';

// ----- Lock fields if existing patient — pregnancy remains editable -----
export function setPatientLocked(locked) {
  const lockIds = ['patient-name', 'patient-dob', 'patient-gender'];
  lockIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = locked;
    el.classList.toggle('bg-gray-50', locked);
    el.classList.toggle('cursor-not-allowed', locked);
    el.title = locked ? 'Loaded from server; editing disabled' : '';
  });
  const preg = document.getElementById('pregnancy-status');
  if (preg) {
    preg.disabled = false;
    preg.classList.remove('bg-gray-50', 'cursor-not-allowed');
    preg.title = '';
  }
}

export function fillPatientForm(opts) {
  $('#patient-name').value = opts.nameText || '';
  document.getElementById('patient-dob').value = opts.birthDate || '';
  document.getElementById('patient-gender').value = opts.gender || 'unknown';
  document.getElementById('patient-photo').src = opts.photoUrl || 'defaultProfile.jpg';
  document.getElementById('patient-address').textContent = opts.addressText || '—';
}

export function clearPatientForm() {
  fillPatientForm({ nameText: '', birthDate: '', gender: 'unknown', photoUrl: 'defaultProfile.jpg', addressText: '—' });
  state.patientAddress = null;
  state.currentPatientResource = null;
  state.patientSourceServer = null;
}

export function hidePtAC() {
  const ac = $('#pt-ac');
  ac.classList.add('hidden');
  ac.innerHTML = '';
}

export function fillPatientFormFromResource(p) {
  const name = (p.name && p.name[0] && p.name[0].text) ||
    ([].concat(p.name && p.name[0] && p.name[0].given || [], p.name && p.name[0] && p.name[0].family || []).filter(Boolean).join(' ')) || '';
  let photoUrl = '';
  if (p.photo && p.photo.length > 0) {
    const ph = p.photo[0];
    if (ph.url) photoUrl = ph.url;
    else if (ph.data && ph.contentType) photoUrl = 'data:' + ph.contentType + ';base64,' + ph.data;
  }
  state.patientAddress = (Array.isArray(p.address) && p.address.length) ? p.address[0] : null;
  state.currentPatientResource = p;
  state.patientSourceServer = state.FHIR_BASE;
  fillPatientForm({
    nameText: name,
    birthDate: p.birthDate || '',
    gender: p.gender || 'unknown',
    photoUrl: photoUrl || 'defaultProfile.jpg',
    addressText: state.patientAddress ? formatAddress(state.patientAddress) : '—',
  });
  const pregSel = document.getElementById('pregnancy-status');
  if (pregSel) { pregSel.value = (p.gender === 'male') ? '60001007' : '152231000119106'; }
  setPatientLocked(true);
}

function renderPtAC(pats) {
  const ac = $('#pt-ac');
  ac.innerHTML = '';
  if (!pats.length) { hidePtAC(); return; }
  pats.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
    const nm = (p.name && p.name[0] && p.name[0].text) ||
      ([].concat(p.name && p.name[0] && p.name[0].given || [], p.name && p.name[0] && p.name[0].family || []).filter(Boolean).join(' ')) || '(no name)';
    const dob = p.birthDate || '—';
    const gender = p.gender || '—';
    li.innerHTML = '<div class="font-medium">' + nm + '</div><div class="text-xs text-gray-500">DOB: ' + dob + ' • Gender: ' + gender + '</div>';
    li.addEventListener('click', () => { fillPatientFormFromResource(p); hidePtAC(); });
    ac.appendChild(li);
  });
  ac.classList.remove('hidden');
}

export async function searchPatientsByName(q) {
  if (!q || q.trim().length < 2) { hidePtAC(); return; }
  try {
    const url = new URL(state.FHIR_BASE + '/Patient');
    url.searchParams.set('name', q.trim());
    url.searchParams.set('_count', '20');
    setDebugUrl(url.toString());
    const r = await fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
    if (!r.ok) throw new Error('FHIR ' + r.status);
    const j = await r.json();
    const pats = (j.entry || []).map((e) => e.resource).filter((res) => res.resourceType === 'Patient');
    const seen = new Set();
    const unique = [];
    for (let i = 0; i < pats.length; i++) {
      const p = pats[i];
      if (p.id && !seen.has(p.id)) { seen.add(p.id); unique.push(p); }
    }
    renderPtAC(unique.slice(0, 10));
  } catch (e) {
    console.warn(e);
    hidePtAC();
    showError('Could not search Patient on FHIR server.');
  }
}

export function updatePtToggleVisuals() {
  const btnSearch = $('#ptBtnSearch');
  const btnNew = $('#ptBtnNew');
  const isSearch = (state.ptMode === 'search');
  btnSearch.classList.toggle('is-active', isSearch);
  btnNew.classList.toggle('is-active', !isSearch);
  btnSearch.setAttribute('aria-pressed', String(isSearch));
  btnNew.setAttribute('aria-pressed', String(!isSearch));
}

export function setPtMode(mode) {
  state.ptMode = mode;
  if (mode === 'new') {
    hidePtAC();
    clearPatientForm();
    setPatientLocked(false);
  }
  updatePtToggleVisuals();
}

// ----- Patient resource builder (for new patients) -----
export function buildPatientResourceFromForm() {
  const nameInp = $('#patient-name');
  const name = (nameInp.value || '').trim() || 'John Citizen';
  const parts = name.split(/\s+/);
  const given = parts[0] || 'John';
  const family = parts.length > 1 ? parts[parts.length - 1] : 'Citizen';
  const imgSrc = document.getElementById('patient-photo').src || 'defaultProfile.jpg';
  const patient = {
    resourceType: 'Patient',
    meta: { profile: ['http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-patient'] },
    identifier: [{ system: PLACER_SYS, value: newUUID() }],
    name: [{ use: 'official', family, given: [given] }],
    gender: document.getElementById('patient-gender').value || 'unknown',
    birthDate: document.getElementById('patient-dob').value || '',
  };
  if (imgSrc && imgSrc.indexOf('defaultProfile.jpg') === -1) {
    if (imgSrc.indexOf('data:') === 0) {
      const parts2 = imgSrc.split(',');
      const contentType = (parts2[0].match(/data:(.*);base64/) || [])[1] || 'image/jpeg';
      const base64 = parts2[1] || '';
      patient.photo = [{ contentType, data: base64 }];
    } else {
      patient.photo = [{ url: imgSrc }];
    }
  }
  if (state.patientAddress) { patient.address = [state.patientAddress]; }
  return patient;
}

export function providePatientRefAndEntry() {
  if (state.currentPatientResource && state.currentPatientResource.id) {
    // If the patient was loaded from a different server, include it in the bundle
    // so the target server can create its own copy.
    const crossServer = state.patientSourceServer &&
      state.patientSourceServer.replace(/\/+$/, '') !== state.FHIR_BASE.replace(/\/+$/, '');
    if (crossServer) {
      const pat = JSON.parse(JSON.stringify(state.currentPatientResource));
      delete pat.id;
      delete pat.meta;
      const full = uuidURN();
      return { patientRef: full, entry: { fullUrl: full, resource: pat, request: { method: 'POST', url: 'Patient' } } };
    }
    return { patientRef: 'Patient/' + state.currentPatientResource.id, entry: null };
  }
  const newPat = buildPatientResourceFromForm();
  const full = uuidURN();
  return { patientRef: full, entry: { fullUrl: full, resource: newPat, request: { method: 'POST', url: 'Patient' } } };
}
