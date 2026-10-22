/**
 * @module calc.tests
 * @description Test cases for UCUMverter, run by test.html in the browser.
 * Each test gets `loadJson(path)` so it can read the config files.
 */

import { calculate, idealBodyWeightKg, cockcroftGault, fmt } from '../modules/calc.js';
import { convert, isValid } from '../modules/ucum.js';
import { parseStrength, toUcumProduct } from '../modules/terminology.js';

const OUT = { dose: 'mg', volume: 'mL', crcl: 'mL/min', strength: 'mg/mL', weight: 'kg' };

function close(actual, expected, tol = 1e-6, what = 'value') {
  const ok = Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
  if (!ok) throw new Error(`${what}: expected ${expected}, got ${actual}`);
}
function equal(actual, expected, what = 'value') {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
}

async function guideline(loadJson, id) {
  const gl = await loadJson('config/guidelines.json');
  return gl.guidelines.find(g => g.id === id);
}

const q = (value, unit) => ({ value, unit });
const product = (boss, conc, total) => ({
  code: 'test', display: 'test', boss,
  concentration: conc ? { value: conc, ucum: 'mg/mL' } : null,
  totalQuantity: total ? { value: total, ucum: 'mg' } : null,
});

export const tests = [
  {
    name: 'All UCUM codes in the config files are valid',
    async fn(loadJson) {
      const units = await loadJson('config/units.json');
      const map = await loadJson('config/snomed-ucum-map.json');
      const gl = await loadJson('config/guidelines.json');
      const codes = [
        ...units.patient.weight.options, ...units.patient.height.options, ...units.doseRate.options,
        ...Object.values(units.outputs).flatMap(o => o.options),
        ...Object.values(units.labUnitSets).flatMap(s => s.options),
        ...Object.values(map.map).map(m => m.ucum),
        ...gl.guidelines.flatMap(g => [g.targetDose.unit, g.targetLevel.unit, g.maxDose?.unit, g.crclWarnBelow?.unit]).filter(Boolean),
      ];
      const bad = [...new Set(codes)].filter(c => !isValid(c));
      if (bad.length) throw new Error(`Invalid: ${bad.join(', ')}`);
    },
  },
  {
    name: 'Every guideline LOINC code has a unit set',
    async fn(loadJson) {
      const units = await loadJson('config/units.json');
      const gl = await loadJson('config/guidelines.json');
      const codes = [...gl.guidelines.flatMap(g => g.loinc), ...gl.renal.creatinine.loinc].map(l => l.code);
      const missing = codes.filter(c => !units.labUnitSets[units.loincUnits[c]]);
      if (missing.length) throw new Error(`No unit set for ${missing.join(', ')}`);
    },
  },
  {
    name: 'Display rounding ignores floating-point residue',
    fn() {
      equal(fmt(2312.5), fmt(2312.4999999999993), 'x.5 boundary');
      equal(fmt(0.1 + 0.2), '0.3', '0.1 + 0.2');
      equal(fmt(123456), '123500', 'no exponent');
    },
  },
  {
    name: 'Ideal body weight and Cockcroft-Gault',
    fn() {
      close(idealBodyWeightKg('male', 180), 75.2, 1e-9, 'IBW male');
      close(idealBodyWeightKg('female', 160), 52.7, 1e-9, 'IBW female');
      close(cockcroftGault(40, 'male', 75.2, 90), 7520 / 73.35, 1e-9, 'CrCl');
    },
  },
  {
    name: 'Molar round trips (creatinine, phenytoin, digoxin)',
    fn() {
      close(convert(1, 'mg/dL', 'umol/L', 113.12), 88.4017, 1e-5, 'creatinine 1 mg/dL');
      close(convert(40, 'umol/L', 'mg/L', 252.27), 10.0908, 1e-9, 'phenytoin 40 umol/L');
      close(convert(1, 'nmol/L', 'ug/L', 780.94), 0.78094, 1e-9, 'digoxin 1 nmol/L');
      close(convert(convert(15, 'mg/L', 'umol/L', 252.27), 'umol/L', 'mg/L', 252.27), 15, 1e-9, 'phenytoin round trip');
    },
  },
  {
    name: 'Gentamicin worked example (level adjustment, volume, ampoules)',
    async fn(loadJson) {
      const r = calculate({
        patient: { age: 40, sex: 'male', weight: q(80, 'kg'), height: q(180, 'cm'), creatinine: q(90, 'umol/L') },
        creatinineMolarMass: 113.12,
        guideline: await guideline(loadJson, 'gentamicin-extended-interval'),
        targetDose: q(7, 'mg/kg'), level: q(18, 'mg/L'), targetLevel: q(20, 'mg/L'),
        product: product('387321007', 40, 80), out: OUT,
      });
      equal(r.errors.length, 0, 'errors');
      close(r.dosingWeightKg, 80, 1e-9, 'dosing weight');
      close(r.baseDoseMg, 560, 1e-9, 'base dose');
      close(r.doseMg, 560 * 20 / 18, 1e-9, 'adjusted dose');
      close(r.volume.mL, 560 * 20 / 18 / 40, 1e-9, 'volume');
      equal(r.units.rounded, 8, 'ampoules');
      close(r.crcl.mLmin, 7520 / 73.35, 1e-6, 'CrCl');
    },
  },
  {
    name: 'Same gentamicin dose in every unit combination (invariance)',
    async fn(loadJson) {
      const g = await guideline(loadJson, 'gentamicin-extended-interval');
      const units = await loadJson('config/units.json');
      const run = (wU, hU, dU, lU, cU) => calculate({
        patient: {
          age: 40, sex: 'male',
          weight: q(convert(80, 'kg', wU), wU),
          height: q(convert(180, 'cm', hU), hU),
          creatinine: q(convert(90, 'umol/L', cU, 113.12), cU),
        },
        creatinineMolarMass: 113.12,
        guideline: g,
        targetDose: q(convert(7, 'mg/kg', dU), dU),
        level: q(convert(18, 'mg/L', lU), lU),
        targetLevel: q(20, 'mg/L'),
        product: product('387321007', 40, 80), out: OUT,
      });
      const expected = 560 * 20 / 18;
      const crUnits = ['umol/L', 'mmol/L', 'mg/dL', 'mg/L'];
      let n = 0;
      for (const wU of units.patient.weight.options)
        for (const hU of units.patient.height.options)
          for (const dU of units.doseRate.options)
            for (const lU of units.labUnitSets.massConc.options) {
              const cU = crUnits[n++ % crUnits.length];
              const r = run(wU, hU, dU, lU, cU);
              close(r.doseMg, expected, 1e-9, `dose with ${wU}, ${hU}, ${dU}, ${lU}`);
              close(r.crcl.mLmin, 7520 / 73.35, 1e-6, `CrCl with ${cU}`);
            }
      if (n < 100) throw new Error(`only ${n} combinations`);
    },
  },
  {
    name: 'Vancomycin dose is capped at 3 g',
    async fn(loadJson) {
      const r = calculate({
        patient: { age: 50, sex: 'male', weight: q(150, 'kg'), height: q(180, 'cm'), creatinine: null },
        creatinineMolarMass: 113.12,
        guideline: await guideline(loadJson, 'vancomycin-loading'),
        targetDose: q(25, 'mg/kg'), level: null, targetLevel: q(15, 'mg/L'),
        product: product('372735009', null, 1000), out: OUT,
      });
      equal(r.capped, true, 'capped');
      close(r.doseMg, 3000, 1e-9, 'dose');
      equal(r.units.rounded, 3, 'vials');
      equal(r.volume, undefined, 'volume');
    },
  },
  {
    name: 'Phenytoin sodium dose converts to phenytoin for a phenytoin product (salt)',
    async fn(loadJson) {
      const r = calculate({
        patient: { age: 50, sex: 'male', weight: q(70, 'kg'), height: q(175, 'cm'), creatinine: null },
        creatinineMolarMass: 113.12,
        guideline: await guideline(loadJson, 'phenytoin-loading'),
        targetDose: q(15, 'mg/kg'), level: null, targetLevel: q(15, 'mg/L'),
        product: product('387220006', null, 50), out: OUT,
      });
      close(r.doseMg, 1050, 1e-9, 'dose as phenytoin sodium');
      close(r.doseBossMg, 1050 * 252.27 / 274.25, 1e-9, 'dose as phenytoin');
      equal(r.units.rounded, 20, 'chewable tablets');
      close(convert(convert(100, 'mg', 'mmol', 274.25), 'mmol', 'mg', 252.27), 91.986, 1e-4, '100 mg sodium salt');
    },
  },
  {
    name: 'Phenytoin molar level drives the adjustment',
    async fn(loadJson) {
      const r = calculate({
        patient: { age: 50, sex: 'male', weight: q(70, 'kg'), height: q(175, 'cm'), creatinine: null },
        creatinineMolarMass: 113.12,
        guideline: await guideline(loadJson, 'phenytoin-loading'),
        targetDose: q(15, 'mg/kg'), level: q(40, 'umol/L'), targetLevel: q(15, 'mg/L'),
        product: product('387416005', 50, 100), out: OUT,
      });
      close(r.levelFactor, 15 / 10.0908, 1e-9, 'factor');
      close(r.doseMg, 1050 * 15 / 10.0908, 1e-9, 'dose');
      equal(r.doseBossMg, r.doseMg, 'no salt conversion for a phenytoin sodium product');
    },
  },
  {
    name: 'Digoxin worked example (ideal weight, ug/kg, nmol/L)',
    async fn(loadJson) {
      const r = calculate({
        patient: { age: 70, sex: 'female', weight: q(70, 'kg'), height: q(160, 'cm'), creatinine: q(100, 'umol/L') },
        creatinineMolarMass: 113.12,
        guideline: await guideline(loadJson, 'digoxin-loading'),
        targetDose: q(10, 'ug/kg'), level: q(0.6, 'nmol/L'), targetLevel: q(1, 'nmol/L'),
        product: product('387461009', null, 0.25), out: { ...OUT, dose: 'ug' },
      });
      close(r.dosingWeightKg, 52.7, 1e-9, 'dosing weight');
      close(r.doseMg, 0.527 / 0.6, 1e-9, 'dose mg');
      close(r.dose.value, 527 / 0.6, 1e-6, 'dose ug');
      equal(r.units.rounded, 4, 'tablets');
    },
  },
  {
    name: 'Strength is parsed from a $lookup response and mapped to UCUM',
    async fn(loadJson) {
      const params = {
        resourceType: 'Parameters',
        parameter: [
          { name: 'code', valueCode: '37847011000036106' },
          { name: 'property', part: [
            { name: 'code', valueCode: '609096000' },
            { name: 'subproperty', part: [{ name: 'code', valueCode: '999000031000168102' }, { name: 'value', valueCode: '258798001' }] },
            { name: 'subproperty', part: [{ name: 'code', valueCode: '999000051000168108' }, { name: 'value', valueCode: '258684004' }] },
            { name: 'subproperty', part: [{ name: 'code', valueCode: '999000021000168100' }, { name: 'value', valueDecimal: 0.25 }] },
            { name: 'subproperty', part: [{ name: 'code', valueCode: '732943007' }, { name: 'value', valueCode: '387461009' }] },
            { name: 'subproperty', part: [{ name: 'code', valueCode: '999000041000168106' }, { name: 'value', valueDecimal: 0.5 }] },
          ] },
        ],
      };
      const s = parseStrength(params);
      equal(s.boss, '387461009', 'boss');
      equal(s.concentration.value, 0.25, 'concentration');
      equal(s.totalQuantity.snomedUnit, '258684004', 'total unit');
      const map = (await loadJson('config/snomed-ucum-map.json')).map;
      const p = toUcumProduct({ code: 'x', display: 'x', ...s }, map);
      equal(p.concentration.ucum, 'mg/mL', 'ucum conc');
      equal(p.usable, true, 'usable');
      const bad = toUcumProduct({ code: 'y', display: 'y', boss: null, concentration: { value: 1, snomedUnit: '999' }, totalQuantity: null }, map);
      equal(bad.usable, false, 'unmapped is unusable');
    },
  },
];
