// modules/warnings.js — Per-test & group warnings, warning registry

import { state } from './state.js';
import { setDebugUrl, isoDateMonthsAgo, isoDateDaysAgo } from './utils.js';
import {
  XRAY_PARENT, HBA1C_CODE, OBSTETRIC_PARENT, NOT_PREGNANT_CODE, PREG_CODES_WARN,
} from '../config.js';
import { snomedSubsumes } from './terminology.js';
import { renderSelectedTests } from './test-list.js';

// ----- Warning helpers -----
export function ensureWarnSet(t) { if (!t.warnSet) t.warnSet = new Set(); return t.warnSet; }

export function setWarn(t, msg, on) {
  const ws = ensureWarnSet(t);
  const before = ws.size;
  if (on) ws.add(msg); else ws.delete(msg);
  return ws.size !== before;
}

export function warnText(t) {
  return t.warnSet && t.warnSet.size ? Array.from(t.warnSet).join(' • ') : '';
}

// ----- FHIR count helper (used by history checks) -----
export async function fhirCount(resourceType, params) {
  const tryDateParams = params.tryDateParams || ['authored', 'date', 'issued', 'effective', '_lastUpdated'];
  const codeParamOrder = [];
  if (params.code)      codeParamOrder.push({ k: 'code', v: params.code });
  if (params.codeBelow) codeParamOrder.push({ k: 'code:below', v: params.codeBelow });
  if (params.codeIn)    codeParamOrder.push({ k: 'code:in', v: params.codeIn });
  if (codeParamOrder.length === 0) codeParamOrder.push(null);

  for (let ci = 0; ci < codeParamOrder.length; ci++) {
    const codeParam = codeParamOrder[ci];
    for (let di = 0; di < tryDateParams.length; di++) {
      const dateParam = tryDateParams[di];
      try {
        const url = new URL(state.FHIR_BASE + '/' + resourceType);
        const base = params.base || {};
        Object.keys(base).forEach((k) => { url.searchParams.append(k, base[k]); });
        url.searchParams.append('_summary', 'count');
        url.searchParams.append('_total', 'accurate');
        if (codeParam) url.searchParams.append(codeParam.k, codeParam.v);
        if (params.sinceISO) url.searchParams.append(dateParam, 'ge' + params.sinceISO);
        setDebugUrl(url.toString());
        const r = await fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
        if (!r.ok) continue;
        const j = await r.json();
        if (typeof j.total === 'number') return j.total;
        if (Array.isArray(j.entry)) return j.entry.length;
      } catch (e) { console.warn('count', resourceType, e); }
    }
  }
  return 0;
}

// ----- History-based checks -----
async function manualCountSRSubsumed(patientId, sinceISO) {
  try {
    const url = new URL(state.FHIR_BASE + '/ServiceRequest');
    url.searchParams.set('subject', 'Patient/' + patientId);
    url.searchParams.set('authored', 'ge' + sinceISO);
    url.searchParams.set('_elements', 'code');
    url.searchParams.set('_count', '200');
    setDebugUrl(url.toString());
    const r = await fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
    if (!r.ok) return 0;
    const j = await r.json();
    const entries = Array.isArray(j.entry) ? j.entry : [];
    let cnt = 0;
    for (let i = 0; i < entries.length; i++) {
      const res = entries[i].resource;
      const codings = (res && res.code && res.code.coding || []).filter((c) => (c.system || '').indexOf('snomed') > -1 && c.code);
      let hit = false;
      for (let ci = 0; ci < codings.length; ci++) {
        if (await snomedSubsumes(XRAY_PARENT, codings[ci].code)) { hit = true; break; }
      }
      if (hit) cnt++;
    }
    return cnt;
  } catch (e) { console.warn('manualCountSRSubsumed', e); return 0; }
}

async function hasRecentHbA1c(patientId) {
  const since = isoDateMonthsAgo(6);
  const base = { subject: 'Patient/' + patientId };

  const n = await fhirCount('ServiceRequest', {
    base,
    sinceISO: since,
    code: 'http://snomed.info/sct|' + HBA1C_CODE,
    tryDateParams: ['authored', '_lastUpdated'],
  });
  if (n > 0) return true;

  try {
    const url = new URL(state.FHIR_BASE + '/ServiceRequest');
    url.searchParams.set('subject', 'Patient/' + patientId);
    url.searchParams.set('authored', 'ge' + since);
    url.searchParams.set('_elements', 'code');
    url.searchParams.set('_count', '200');
    setDebugUrl(url.toString());
    const r = await fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
    if (!r.ok) return false;
    const j = await r.json();
    const entries = Array.isArray(j.entry) ? j.entry : [];
    for (let i = 0; i < entries.length; i++) {
      const codings = (entries[i] && entries[i].resource && entries[i].resource.code && entries[i].resource.code.coding) || [];
      if (codings.some((c) => (c.system || '').indexOf('snomed') > -1 && c.code === HBA1C_CODE)) {
        return true;
      }
    }
  } catch (e) { console.warn('HbA1c fallback failed', e); }
  return false;
}

async function countRecentXRays(patientId) {
  const since = isoDateDaysAgo(30);
  const base = { subject: 'Patient/' + patientId };

  let n = await fhirCount('ServiceRequest', {
    base, sinceISO: since,
    codeBelow: 'http://snomed.info/sct|' + XRAY_PARENT,
    codeIn: 'http://snomed.info/sct?fhir_vs=ecl/<<' + XRAY_PARENT + '&count=5000',
    tryDateParams: ['authored', '_lastUpdated'],
  });
  if (n === 0) {
    n = await manualCountSRSubsumed(patientId, since);
  }
  if (n >= 3) return n;

  n += await fhirCount('DiagnosticReport', {
    base, sinceISO: since,
    codeBelow: 'http://snomed.info/sct|' + XRAY_PARENT,
    codeIn: 'http://snomed.info/sct?fhir_vs=ecl/<<' + XRAY_PARENT,
    tryDateParams: ['issued', 'effective', 'date', '_lastUpdated'],
  });

  return n;
}

// ----- Individual warning functions -----

const GROUP_RAD_WARN = 'Requested tests involve substantial radiation exposure';
const PREG_RAD_WARN = 'Caution: radiographic imaging ordered for a patient who may be pregnant';
const OBSTETRIC_NOT_PREG_WARN = 'Obstetric investigation ordered for a patient who is not pregnant — test may not be applicable';

export async function checkTestHistoryWarning(test) {
  try {
    const pid = state.currentPatientResource && state.currentPatientResource.id;
    if (!pid) return false;
    if (!test.code) return false;
    let changed = false;

    if (test.code === HBA1C_CODE) {
      const hasHb = await hasRecentHbA1c(pid);
      changed = setWarn(test, 'Patient has already had a HbA1c recently', hasHb) || changed;
    }

    const isXray = await snomedSubsumes(XRAY_PARENT, test.code);
    if (isXray) {
      const cnt = await countRecentXRays(pid);
      changed = setWarn(test, 'Patient has already had ' + cnt + ' recent X-Rays', cnt >= 1) || changed;
    }
    return changed;
  } catch (e) { console.warn('history warn', e); return false; }
}

async function applyRadiationGroupWarning() {
  const xrayFlags = [];
  for (let i = 0; i < state.selectedTests.length; i++) {
    const code = state.selectedTests[i].code;
    xrayFlags.push(code ? await snomedSubsumes(XRAY_PARENT, code) : false);
  }
  const xrayCount = xrayFlags.filter(Boolean).length;
  const on = xrayCount >= 3;
  let changed = false;
  state.selectedTests.forEach((t, idx) => {
    changed = setWarn(t, GROUP_RAD_WARN, on && xrayFlags[idx]) || changed;
  });
  if (changed) renderSelectedTests();
}

async function applyPregnancyRadiationWarning() {
  const pregSel = document.getElementById('pregnancy-status');
  const pregCode = pregSel ? pregSel.value : '';
  const isPregnant = PREG_CODES_WARN.has(pregCode);
  let changed = false;
  for (let i = 0; i < state.selectedTests.length; i++) {
    const t = state.selectedTests[i];
    if (!t.code) { changed = setWarn(t, PREG_RAD_WARN, false) || changed; continue; }
    const isXray = await snomedSubsumes(XRAY_PARENT, t.code);
    changed = setWarn(t, PREG_RAD_WARN, isPregnant && isXray) || changed;
  }
  if (changed) renderSelectedTests();
}

async function applyObstetricNotPregnantWarning() {
  const pregSel = document.getElementById('pregnancy-status');
  const pregCode = pregSel ? pregSel.value : '';
  const isNotPregnant = (pregCode === NOT_PREGNANT_CODE);
  let changed = false;
  for (let i = 0; i < state.selectedTests.length; i++) {
    const t = state.selectedTests[i];
    if (!t.code) { changed = setWarn(t, OBSTETRIC_NOT_PREG_WARN, false) || changed; continue; }
    const isObstetric = await snomedSubsumes(OBSTETRIC_PARENT, t.code);
    changed = setWarn(t, OBSTETRIC_NOT_PREG_WARN, isNotPregnant && isObstetric) || changed;
  }
  if (changed) renderSelectedTests();
}

// ----- Warning registry -----
// To add a new warning: push a new entry to this array and write the apply function above.
export const warningRules = [
  { name: 'radiation-group',         apply: applyRadiationGroupWarning },
  { name: 'pregnancy-radiation',     apply: applyPregnancyRadiationWarning },
  { name: 'obstetric-not-pregnant',  apply: applyObstetricNotPregnantWarning },
];

export function applyAllWarnings() {
  warningRules.forEach((w) => w.apply());
}
