/**
 * @module app
 * @description UCUMverter entry point: loads the JSON configs, wires the panels and
 * recalculates whenever any value or unit changes. DEMO ONLY - not for clinical use.
 */

import { CONFIG } from './config.js';
import { calculate, fmt } from './modules/calc.js';
import { convert, isValid } from './modules/ucum.js';
import { loadMedicines, toUcumProduct } from './modules/terminology.js';
import { randomPatient } from './modules/patient.js';
import { $, esc, fillSelect, fillUnitSelect, QuantityField, renderTrace } from './modules/ui.js';

const state = {
  guidelines: [],
  renal: null,
  units: null,
  unitMap: {},
  guideline: null,
  products: [],
  product: null,
  medsSource: null,
};

const fields = {};
const outSelects = {};

function setStatus(msg, kind = '') {
  const el = $('status');
  el.textContent = msg || '';
  el.className = `status ${kind}`;
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  return res.json();
}

const analyteMolarMass = () => {
  const g = state.guideline;
  const s = g && g.substances && g.substances[g.analyte];
  return s ? s.molarMass : null;
};

/** Unit set for a LOINC code, from units.json. */
function unitSetFor(loinc) {
  const name = state.units.loincUnits[loinc];
  return name ? state.units.labUnitSets[name] : null;
}

/** All unit codes offered by a list of LOINC codes (mass and molar variants merged). */
function unitsForLoincs(codes) {
  const seen = [];
  codes.forEach(c => (unitSetFor(c)?.options || []).forEach(u => { if (!seen.includes(u)) seen.push(u); }));
  return seen;
}

/** The LOINC code whose unit set contains this unit (used to show mass vs molar codes). */
function loincForUnit(codes, unit) {
  return codes.find(c => unitSetFor(c)?.options.includes(unit)) || null;
}

// ---------------------------------------------------------------- setup

function buildFields() {
  const U = state.units;
  const make = (id, opts) => new QuantityField({ input: $(id), select: $(`${id}-unit`), onChange: recalc, ...opts });

  fields.weight = make('weight');
  fields.height = make('height');
  fields.creatinine = make('creatinine', { molarMass: () => state.renal.molarMass });
  fields.targetDose = make('target-dose');
  fields.level = make('level', { molarMass: analyteMolarMass });
  fields.targetLevel = make('target-level', { molarMass: analyteMolarMass });

  fields.weight.setOptions(U.patient.weight.options, U.patient.weight.default);
  fields.height.setOptions(U.patient.height.options, U.patient.height.default);
  const crLoincs = state.renal.loinc.map(l => l.code);
  fields.creatinine.setOptions(unitsForLoincs(crLoincs), unitSetFor(crLoincs[0]).default);
  fields.targetDose.setOptions(U.doseRate.options, U.doseRate.default);

  for (const [key, id] of [['dose', 'out-dose-unit'], ['volume', 'out-volume-unit'], ['crcl', 'out-crcl-unit'],
    ['weight', 'out-weight-unit'], ['strength', 'strength-unit']]) {
    const sel = $(id);
    fillUnitSelect(sel, U.outputs[key].options, U.outputs[key].default);
    sel.addEventListener('change', recalc);
    outSelects[key] = sel;
  }

  $('age').addEventListener('input', recalc);
  $('sex').addEventListener('change', recalc);
  $('guideline').addEventListener('change', () => selectGuideline($('guideline').value));
  $('loinc').addEventListener('change', onLoincChange);
  $('product').addEventListener('change', () => {
    state.product = state.products.find(p => p.code === $('product').value) || null;
    renderProduct();
    recalc();
  });
  $('btn-random').addEventListener('click', () => { applyRandomPatient(); recalc(); });
  $('btn-shuffle').addEventListener('click', shuffleUnits);
}

function checkUnits() {
  const U = state.units;
  const all = [
    ...U.patient.weight.options, ...U.patient.height.options, ...U.doseRate.options,
    ...Object.values(U.outputs).flatMap(o => o.options),
    ...Object.values(U.labUnitSets).flatMap(s => s.options),
    ...Object.values(state.unitMap).map(m => m.ucum),
  ];
  const bad = [...new Set(all)].filter(u => !isValid(u));
  if (bad.length) setStatus(`Invalid UCUM codes in config: ${bad.join(', ')}`, 'error');
}

// ---------------------------------------------------------------- guideline + lab

async function selectGuideline(id) {
  const g = state.guidelines.find(x => x.id === id);
  state.guideline = g;

  fields.targetDose.set(g.targetDose.value, g.targetDose.unit);

  const loincs = g.loinc.map(l => l.code);
  fields.targetLevel.setOptions(unitsForLoincs(loincs), g.targetLevel.unit);
  fields.targetLevel.set(g.targetLevel.value, g.targetLevel.unit);
  $('target-range').textContent = g.targetLevel.rangeText || '';

  // A level from the previous drug means nothing here, so start with a fresh one.
  fillSelect($('loinc'), g.loinc.map(l => ({ value: l.code, label: `${l.code}  ${l.display}` })));
  fields.level.set(null);
  onLoincChange();
  randomLevel();

  renderGuidelineFacts();
  recalc();
  await loadProducts(g);
}

function onLoincChange() {
  const code = $('loinc').value;
  const set = unitSetFor(code);
  const before = fields.level.get();
  fields.level.setOptions(set.options, set.default);
  if (before) {
    try {
      fields.level.set(before.value, before.unit);
    } catch {
      fields.level.set(null);
    }
  }
  const g = state.guideline;
  const molarNote = set.kind === 'molar' && !analyteMolarMass() ? ' No molar mass configured, so molar values cannot be compared.' : '';
  $('loinc-hint').textContent = `${set.kind === 'molar' ? 'Substance (molar)' : 'Mass'} concentration code for ${g.substances[g.analyte].display}.${molarNote}`;
  recalc();
}

function renderGuidelineFacts() {
  const g = state.guideline;
  const sub = (c) => g.substances[c]?.display || c;
  const basis = { actual: 'Actual body weight', ideal: 'Ideal body weight (or actual if lower)', adjustedIfObese: 'Adjusted body weight if obese' }[g.weightBasis];
  const rows = [
    ['Weight basis', basis],
    ['Dose expressed as', sub(g.doseSubstance)],
    ['Maximum dose', g.maxDose ? `${g.maxDose.value} ${g.maxDose.unit}` : 'None'],
    ['Drug ECL', `<code class="ecl">${esc(g.drugEcl)}</code>`],
    ['Status', g.draft ? '<span class="badge badge-warn">Draft - for review</span>' : 'Reviewed'],
  ];
  $('guideline-facts').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${k === 'Drug ECL' || k === 'Status' ? v : esc(v)}</dd>`).join('');
}

// ---------------------------------------------------------------- products

async function loadProducts(g) {
  const sel = $('product');
  fillSelect(sel, [], { placeholder: 'Loading AMT medicines...' });
  sel.disabled = true;
  state.products = [];
  state.product = null;
  renderProduct();
  setStatus('Expanding ECL and reading AMT strengths from Ontoserver...');

  const res = await loadMedicines(g);
  if (state.guideline !== g) return; // user moved on

  state.medsSource = res.source;
  state.products = res.items.map(p => toUcumProduct(p, state.unitMap));
  const badge = $('med-source');
  badge.textContent = res.source === 'live' ? 'Live: Ontoserver' : 'Offline snapshot';
  badge.className = `badge ${res.source === 'live' ? 'badge-ok' : 'badge-warn'}`;
  setStatus(res.source === 'live' ? '' : `Ontoserver unavailable (${res.error}). Using the offline medicines snapshot.`, res.source === 'live' ? '' : 'warn');

  fillSelect(sel, state.products.map(p => ({
    value: p.code,
    label: p.usable ? p.display : `${p.display} (unmapped unit)`,
    disabled: !p.usable,
  })), { placeholder: state.products.length ? 'Choose a medicine' : 'No medicines found' });
  sel.disabled = false;
  // Default to the largest unit of use, so the first result isn't "53 ampoules".
  const size = (p) => (p.totalQuantity ? convert(p.totalQuantity.value, p.totalQuantity.ucum, 'mg') : 0);
  const first = state.products.filter(p => p.usable).sort((a, b) => size(b) - size(a))[0];
  if (first) sel.value = first.code;
  state.product = first || null;
  renderProduct();
  recalc();
}

function renderProduct() {
  const el = $('product-strength');
  const row = $('strength-row');
  const p = state.product;
  if (!p) { el.innerHTML = ''; row.hidden = true; return; }
  const g = state.guideline;
  const q = (label, x) => x
    ? `<li><span>${label}</span> ${esc(fmt(x.value))} <code>${esc(x.snomedUnit)} |${esc(x.snomedDisplay)}|</code> &rarr; UCUM <code>${esc(x.ucum)}</code></li>`
    : '';
  const boss = g.substances[p.boss]?.display || p.boss || 'unknown';
  el.innerHTML = `<p class="hint">SNOMED CT <code>${esc(p.code)}</code></p>
    <ul>
      <li><span>BoSS</span> ${esc(boss)} <code>${esc(p.boss || '')}</code></li>
      ${q('Concentration', p.concentration)}
      ${q('Quantity per unit', p.totalQuantity)}
    </ul>`;
  row.hidden = !p.concentration;
}

// ---------------------------------------------------------------- patient + shuffle

function applyRandomPatient() {
  const pt = randomPatient();
  $('age').value = pt.age;
  $('sex').value = pt.sex;
  fields.weight.set(pt.weightKg, 'kg');
  fields.height.set(pt.heightCm, 'cm');
  fields.creatinine.set(pt.creatinineUmolL, 'umol/L');
  randomLevel();
}

/** A measured level near the target, so the level adjustment has something to do. */
function randomLevel() {
  const target = fields.targetLevel.get();
  if (!target) return;
  try {
    const inLevelUnit = convert(target.value, target.unit, fields.level.unit, analyteMolarMass());
    fields.level.set(Number((inLevelUnit * (0.6 + Math.random())).toPrecision(2)));
  } catch {
    fields.level.set(null);
  }
}

function shuffleUnits() {
  Object.values(fields).forEach(f => f.shuffle());
  Object.values(outSelects).forEach(sel => {
    const opts = [...sel.options].map(o => o.value).filter(v => v !== sel.value);
    if (opts.length) sel.value = opts[Math.floor(Math.random() * opts.length)];
  });
  recalc();
}

// ---------------------------------------------------------------- calculate + render

function recalc() {
  if (!state.guideline) return;
  const crUnit = fields.creatinine.unit;
  $('creatinine-loinc').textContent = loincForUnit(state.renal.loinc.map(l => l.code), crUnit) || '-';

  const out = Object.fromEntries(Object.entries(outSelects).map(([k, s]) => [k, s.value]));
  const r = calculate({
    patient: {
      age: parseFloat($('age').value),
      sex: $('sex').value,
      weight: fields.weight.get(),
      height: fields.height.get(),
      creatinine: fields.creatinine.get(),
    },
    creatinineMolarMass: state.renal.molarMass,
    guideline: state.guideline,
    targetDose: fields.targetDose.get(),
    level: fields.level.get(),
    targetLevel: fields.targetLevel.get(),
    product: state.product && state.product.usable ? state.product : null,
    out,
  });
  render(r);
}

function render(r) {
  const errs = $('errors');
  errs.hidden = !r.errors.length;
  errs.innerHTML = r.errors.map(esc).join('<br>');
  const warns = $('warnings');
  warns.hidden = !r.warnings.length;
  warns.innerHTML = r.warnings.map(w => `&#9888; ${esc(w)}`).join('<br>');

  $('dose-substance').textContent = r.doseSubstance ? `(as ${r.doseSubstance.display})` : '';
  $('out-dose').textContent = r.dose ? fmt(r.dose.value) : '-';
  const bossDiffers = r.doseBoss && r.bossSubstance && r.doseSubstance && r.bossSubstance !== r.doseSubstance;
  $('out-dose-boss').textContent = bossDiffers ? `= ${fmt(r.doseBoss.value)} ${r.doseBoss.unit} as ${r.bossSubstance.display} (product BoSS)` : '';

  $('out-volume').textContent = r.volume ? fmt(r.volume.value) : '-';
  $('out-volume-note').textContent = state.product && !state.product.concentration ? 'No concentration in AMT for this product' : '';

  $('out-units').textContent = r.units ? String(r.units.rounded) : '-';
  $('out-units-note').textContent = r.units ? `exactly ${fmt(r.units.exact)} x ${fmt(r.units.eachMg)} mg` : (state.product && !state.product.totalQuantity ? 'No quantity per unit in AMT for this product' : '');

  $('out-weight').textContent = r.dosingWeight ? fmt(r.dosingWeight.value) : '-';
  $('out-weight-note').textContent = r.dosingWeightBasis ? `${r.dosingWeightBasis}; ideal ${fmt(r.ibwKg)} kg` : '';
  $('out-crcl').textContent = r.crcl ? fmt(r.crcl.value) : '-';
  $('strength-value').textContent = r.strength ? fmt(r.strength.value) : '-';

  renderTrace($('trace'), r.trace);
  $('steps').innerHTML = r.steps.map(s => `<li><strong>${esc(s.label)}:</strong> ${esc(s.text)}</li>`).join('');
}

// ---------------------------------------------------------------- start

async function init() {
  try {
    if (!globalThis.ucumPkg) throw new Error('The UCUM library did not load. Check your network connection and reload.');
    const [gl, units, map] = await Promise.all([
      loadJson(CONFIG.FILES.guidelines), loadJson(CONFIG.FILES.units), loadJson(CONFIG.FILES.unitMap),
    ]);
    state.guidelines = gl.guidelines;
    state.renal = gl.renal.creatinine;
    state.units = units;
    state.unitMap = map.map;
    checkUnits();
    buildFields();
    fillSelect($('guideline'), state.guidelines.map(g => ({ value: g.id, label: g.name })));
    const loading = selectGuideline(state.guidelines[0].id);
    applyRandomPatient();
    recalc();
    await loading;
  } catch (e) {
    console.error(e);
    setStatus(e.message, 'error');
  }
}

// Exposed for debugging in the console
window.ucumverter = { state, fields, convert };

init();
