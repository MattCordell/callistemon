// modules/warnings.js — Per-test & group warnings, warning registry
'use strict';

window.App = window.App || {};

// ----- Warning helpers -----
App.ensureWarnSet = function(t) { if (!t.warnSet) t.warnSet = new Set(); return t.warnSet; };
App.setWarn = function(t, msg, on) {
  var ws = App.ensureWarnSet(t);
  var before = ws.size;
  if (on) ws.add(msg); else ws.delete(msg);
  return ws.size !== before;
};
App.warnText = function(t) {
  return t.warnSet && t.warnSet.size ? Array.from(t.warnSet).join(' \u2022 ') : '';
};

// ----- FHIR count helper (used by history checks) -----
App.fhirCount = async function(resourceType, params) {
  var tryDateParams = params.tryDateParams || ['authored', 'date', 'issued', 'effective', '_lastUpdated'];
  var codeParamOrder = [];
  if (params.code)      codeParamOrder.push({ k: 'code', v: params.code });
  if (params.codeBelow) codeParamOrder.push({ k: 'code:below', v: params.codeBelow });
  if (params.codeIn)    codeParamOrder.push({ k: 'code:in', v: params.codeIn });
  if (codeParamOrder.length === 0) codeParamOrder.push(null);

  for (var ci = 0; ci < codeParamOrder.length; ci++) {
    var codeParam = codeParamOrder[ci];
    for (var di = 0; di < tryDateParams.length; di++) {
      var dateParam = tryDateParams[di];
      try {
        var url = new URL(App.FHIR_BASE + '/' + resourceType);
        var base = params.base || {};
        Object.keys(base).forEach(function(k) { url.searchParams.append(k, base[k]); });
        url.searchParams.append('_summary', 'count');
        url.searchParams.append('_total', 'accurate');
        if (codeParam) url.searchParams.append(codeParam.k, codeParam.v);
        if (params.sinceISO) url.searchParams.append(dateParam, 'ge' + params.sinceISO);
        App.setDebugUrl(url.toString());
        var r = await fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
        if (!r.ok) continue;
        var j = await r.json();
        if (typeof j.total === 'number') return j.total;
        if (Array.isArray(j.entry)) return j.entry.length;
      } catch (e) { console.warn('count', resourceType, e); }
    }
  }
  return 0;
};

// ----- History-based checks -----
async function manualCountSRSubsumed(patientId, sinceISO) {
  try {
    var url = new URL(App.FHIR_BASE + '/ServiceRequest');
    url.searchParams.set('subject', 'Patient/' + patientId);
    url.searchParams.set('authored', 'ge' + sinceISO);
    url.searchParams.set('_elements', 'code');
    url.searchParams.set('_count', '200');
    App.setDebugUrl(url.toString());
    var r = await fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
    if (!r.ok) return 0;
    var j = await r.json();
    var entries = Array.isArray(j.entry) ? j.entry : [];
    var cnt = 0;
    for (var i = 0; i < entries.length; i++) {
      var res = entries[i].resource;
      var codings = (res && res.code && res.code.coding || []).filter(function(c) { return (c.system || '').indexOf('snomed') > -1 && c.code; });
      var hit = false;
      for (var ci = 0; ci < codings.length; ci++) {
        if (await App.snomedSubsumes(App.XRAY_PARENT, codings[ci].code)) { hit = true; break; }
      }
      if (hit) cnt++;
    }
    return cnt;
  } catch (e) { console.warn('manualCountSRSubsumed', e); return 0; }
}

async function hasRecentHbA1c(patientId) {
  var since = App.isoDateMonthsAgo(6);
  var base = { subject: 'Patient/' + patientId };

  var n = await App.fhirCount('ServiceRequest', {
    base: base,
    sinceISO: since,
    code: 'http://snomed.info/sct|' + App.HBA1C_CODE,
    tryDateParams: ['authored', '_lastUpdated']
  });
  if (n > 0) return true;

  try {
    var url = new URL(App.FHIR_BASE + '/ServiceRequest');
    url.searchParams.set('subject', 'Patient/' + patientId);
    url.searchParams.set('authored', 'ge' + since);
    url.searchParams.set('_elements', 'code');
    url.searchParams.set('_count', '200');
    App.setDebugUrl(url.toString());
    var r = await fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
    if (!r.ok) return false;
    var j = await r.json();
    var entries = Array.isArray(j.entry) ? j.entry : [];
    for (var i = 0; i < entries.length; i++) {
      var codings = (entries[i] && entries[i].resource && entries[i].resource.code && entries[i].resource.code.coding) || [];
      if (codings.some(function(c) { return (c.system || '').indexOf('snomed') > -1 && c.code === App.HBA1C_CODE; })) {
        return true;
      }
    }
  } catch (e) { console.warn('HbA1c fallback failed', e); }
  return false;
}

async function countRecentXRays(patientId) {
  var since = App.isoDateDaysAgo(30);
  var base = { subject: 'Patient/' + patientId };

  var n = await App.fhirCount('ServiceRequest', {
    base: base, sinceISO: since,
    codeBelow: 'http://snomed.info/sct|' + App.XRAY_PARENT,
    codeIn: 'http://snomed.info/sct?fhir_vs=ecl/<<' + App.XRAY_PARENT + "&count=5000",
    tryDateParams: ['authored', '_lastUpdated']
  });
  if (n === 0) {
    n = await manualCountSRSubsumed(patientId, since);
  }
  if (n >= 3) return n;

  n += await App.fhirCount('DiagnosticReport', {
    base: base, sinceISO: since,
    codeBelow: 'http://snomed.info/sct|' + App.XRAY_PARENT,
    codeIn: 'http://snomed.info/sct?fhir_vs=ecl/<<' + App.XRAY_PARENT,
    tryDateParams: ['issued', 'effective', 'date', '_lastUpdated']
  });

  return n;
}

// ----- Individual warning functions -----

var GROUP_RAD_WARN = 'Requested tests involve substantial radiation exposure';
var PREG_RAD_WARN = 'Caution: radiographic imaging ordered for a patient who may be pregnant';
var OBSTETRIC_NOT_PREG_WARN = 'Obstetric investigation ordered for a patient who is not pregnant \u2014 test may not be applicable';

App.checkTestHistoryWarning = async function(test) {
  try {
    var pid = App.currentPatientResource && App.currentPatientResource.id;
    if (!pid) return false;
    if (!test.code) return false;
    var changed = false;

    if (test.code === App.HBA1C_CODE) {
      var hasHb = await hasRecentHbA1c(pid);
      changed = App.setWarn(test, 'Patient has already had a HbA1c recently', hasHb) || changed;
    }

    var isXray = await App.snomedSubsumes(App.XRAY_PARENT, test.code);
    if (isXray) {
      var cnt = await countRecentXRays(pid);
      changed = App.setWarn(test, 'Patient has already had ' + cnt + ' recent X-Rays', cnt >= 1) || changed;
    }
    return changed;
  } catch (e) { console.warn('history warn', e); return false; }
};

async function applyRadiationGroupWarning() {
  var codes = App.selectedTests.map(function(t) { return t.code; }).filter(Boolean);
  var xrayCount = 0;
  for (var i = 0; i < codes.length; i++) {
    if (await App.snomedSubsumes(App.XRAY_PARENT, codes[i])) xrayCount++;
  }
  var on = xrayCount >= 3;
  var changed = false;
  App.selectedTests.forEach(function(t) { changed = App.setWarn(t, GROUP_RAD_WARN, on) || changed; });
  if (changed) App.renderSelectedTests();
}

async function applyPregnancyRadiationWarning() {
  var pregSel = document.getElementById('pregnancy-status');
  var pregCode = pregSel ? pregSel.value : '';
  var isPregnant = App.PREG_CODES_WARN.has(pregCode);
  var changed = false;
  for (var i = 0; i < App.selectedTests.length; i++) {
    var t = App.selectedTests[i];
    if (!t.code) { changed = App.setWarn(t, PREG_RAD_WARN, false) || changed; continue; }
    var isXray = await App.snomedSubsumes(App.XRAY_PARENT, t.code);
    changed = App.setWarn(t, PREG_RAD_WARN, isPregnant && isXray) || changed;
  }
  if (changed) App.renderSelectedTests();
}

async function applyObstetricNotPregnantWarning() {
  var pregSel = document.getElementById('pregnancy-status');
  var pregCode = pregSel ? pregSel.value : '';
  var isNotPregnant = (pregCode === App.NOT_PREGNANT_CODE);
  var changed = false;
  for (var i = 0; i < App.selectedTests.length; i++) {
    var t = App.selectedTests[i];
    if (!t.code) { changed = App.setWarn(t, OBSTETRIC_NOT_PREG_WARN, false) || changed; continue; }
    var isObstetric = await App.snomedSubsumes(App.OBSTETRIC_PARENT, t.code);
    changed = App.setWarn(t, OBSTETRIC_NOT_PREG_WARN, isNotPregnant && isObstetric) || changed;
  }
  if (changed) App.renderSelectedTests();
}

// ----- Warning registry -----
// To add a new warning: push a new entry to this array and write the apply function above.
App.warningRules = [
  { name: 'radiation-group',       apply: applyRadiationGroupWarning },
  { name: 'pregnancy-radiation',   apply: applyPregnancyRadiationWarning },
  { name: 'obstetric-not-pregnant', apply: applyObstetricNotPregnantWarning }
];

App.applyAllWarnings = function() {
  App.warningRules.forEach(function(w) { w.apply(); });
};
