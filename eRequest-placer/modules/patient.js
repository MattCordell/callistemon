// modules/patient.js — Patient search, autocomplete, form fill, lock/unlock
'use strict';

window.App = window.App || {};

App.ptMode = 'search';
App.currentPatientResource = null;
App.patientAddress = null;

// ----- Lock fields if existing patient — pregnancy remains editable -----
App.setPatientLocked = function(locked) {
  var lockIds = ['patient-name', 'patient-dob', 'patient-gender'];
  lockIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.disabled = locked;
    el.classList.toggle('bg-gray-50', locked);
    el.classList.toggle('cursor-not-allowed', locked);
    el.title = locked ? 'Loaded from server; editing disabled' : '';
  });
  var preg = document.getElementById('pregnancy-status');
  if (preg) {
    preg.disabled = false;
    preg.classList.remove('bg-gray-50', 'cursor-not-allowed');
    preg.title = '';
  }
};

App.fillPatientForm = function(opts) {
  var nameInp = App.$('#patient-name');
  nameInp.value = opts.nameText || '';
  document.getElementById('patient-dob').value = opts.birthDate || '';
  document.getElementById('patient-gender').value = opts.gender || 'unknown';
  document.getElementById('patient-photo').src = opts.photoUrl || 'defaultProfile.jpg';
  document.getElementById('patient-address').textContent = opts.addressText || '\u2014';
};

App.clearPatientForm = function() {
  App.fillPatientForm({ nameText: '', birthDate: '', gender: 'unknown', photoUrl: 'defaultProfile.jpg', addressText: '\u2014' });
  App.patientAddress = null;
  App.currentPatientResource = null;
};

App.hidePtAC = function() {
  var ac = App.$('#pt-ac');
  ac.classList.add('hidden');
  ac.innerHTML = '';
};

App.fillPatientFormFromResource = function(p) {
  var name = (p.name && p.name[0] && p.name[0].text) ||
    ([].concat(p.name && p.name[0] && p.name[0].given || [], p.name && p.name[0] && p.name[0].family || []).filter(Boolean).join(' ')) || '';
  var photoUrl = '';
  if (p.photo && p.photo.length > 0) {
    var ph = p.photo[0];
    if (ph.url) photoUrl = ph.url;
    else if (ph.data && ph.contentType) photoUrl = 'data:' + ph.contentType + ';base64,' + ph.data;
  }
  App.patientAddress = (Array.isArray(p.address) && p.address.length) ? p.address[0] : null;
  App.currentPatientResource = p;
  App.fillPatientForm({
    nameText: name,
    birthDate: p.birthDate || '',
    gender: p.gender || 'unknown',
    photoUrl: photoUrl || 'defaultProfile.jpg',
    addressText: App.patientAddress ? App.formatAddress(App.patientAddress) : '\u2014'
  });
  var pregSel = document.getElementById('pregnancy-status');
  if (pregSel) { pregSel.value = (p.gender === 'male') ? '60001007' : '152231000119106'; }
  App.setPatientLocked(true);
};

function renderPtAC(pats) {
  var ac = App.$('#pt-ac');
  ac.innerHTML = '';
  if (!pats.length) { App.hidePtAC(); return; }
  pats.forEach(function(p) {
    var li = document.createElement('li');
    li.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
    var nm = (p.name && p.name[0] && p.name[0].text) ||
      ([].concat(p.name && p.name[0] && p.name[0].given || [], p.name && p.name[0] && p.name[0].family || []).filter(Boolean).join(' ')) || '(no name)';
    var dob = p.birthDate || '\u2014';
    var gender = p.gender || '\u2014';
    li.innerHTML = '<div class="font-medium">' + nm + '</div><div class="text-xs text-gray-500">DOB: ' + dob + ' \u2022 Gender: ' + gender + '</div>';
    li.addEventListener('click', function() { App.fillPatientFormFromResource(p); App.hidePtAC(); });
    ac.appendChild(li);
  });
  ac.classList.remove('hidden');
}

App.searchPatientsByName = async function(q) {
  if (!q || q.trim().length < 2) { App.hidePtAC(); return; }
  try {
    var url = new URL(App.FHIR_BASE + '/Patient');
    url.searchParams.set('name', q.trim());
    url.searchParams.set('_count', '20');
    App.setDebugUrl(url.toString());
    var r = await fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
    if (!r.ok) throw new Error('FHIR ' + r.status);
    var j = await r.json();
    var pats = (j.entry || []).map(function(e) { return e.resource; }).filter(function(r) { return r.resourceType === 'Patient'; });
    var seen = new Set();
    var unique = [];
    for (var i = 0; i < pats.length; i++) {
      var p = pats[i];
      if (p.id && !seen.has(p.id)) { seen.add(p.id); unique.push(p); }
    }
    renderPtAC(unique.slice(0, 10));
  } catch (e) { console.warn(e); App.hidePtAC(); App.showError('Could not search Patient on FHIR server.'); }
};

App.updatePtToggleVisuals = function() {
  var btnSearch = App.$('#ptBtnSearch');
  var btnNew = App.$('#ptBtnNew');
  var isSearch = (App.ptMode === 'search');
  btnSearch.classList.toggle('is-active', isSearch);
  btnNew.classList.toggle('is-active', !isSearch);
  btnSearch.setAttribute('aria-pressed', String(isSearch));
  btnNew.setAttribute('aria-pressed', String(!isSearch));
};

App.setPtMode = function(mode) {
  App.ptMode = mode;
  if (mode === 'new') {
    App.hidePtAC();
    App.clearPatientForm();
    App.setPatientLocked(false);
  }
  App.updatePtToggleVisuals();
};

// ----- Patient resource builder (for new patients) -----
App.buildPatientResourceFromForm = function() {
  var nameInp = App.$('#patient-name');
  var name = (nameInp.value || '').trim() || 'John Citizen';
  var parts = name.split(/\s+/);
  var given = parts[0] || 'John';
  var family = parts.length > 1 ? parts[parts.length - 1] : 'Citizen';
  var imgSrc = document.getElementById('patient-photo').src || 'defaultProfile.jpg';
  var patient = {
    resourceType: 'Patient',
    meta: { profile: [
      'http://hl7.org.au/fhir/StructureDefinition/au-patient',
      'http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-patient'
    ] },
    identifier: [{ system: App.PLACER_SYS, value: App.newUUID() }],
    name: [{ use: 'official', family: family, given: [given] }],
    gender: document.getElementById('patient-gender').value || 'unknown',
    birthDate: document.getElementById('patient-dob').value || ''
  };
  if (imgSrc && imgSrc.indexOf('defaultProfile.jpg') === -1) {
    if (imgSrc.indexOf('data:') === 0) {
      var parts2 = imgSrc.split(',');
      var contentType = (parts2[0].match(/data:(.*);base64/) || [])[1] || 'image/jpeg';
      var base64 = parts2[1] || '';
      patient.photo = [{ contentType: contentType, data: base64 }];
    } else {
      patient.photo = [{ url: imgSrc }];
    }
  }
  if (App.patientAddress) { patient.address = [App.patientAddress]; }
  return patient;
};

App.providePatientRefAndEntry = function() {
  if (App.currentPatientResource && App.currentPatientResource.id) {
    return { patientRef: 'Patient/' + App.currentPatientResource.id, entry: null };
  }
  var newPat = App.buildPatientResourceFromForm();
  var full = App.uuidURN();
  return { patientRef: full, entry: { fullUrl: full, resource: newPat, request: { method: 'POST', url: 'Patient' } } };
};
