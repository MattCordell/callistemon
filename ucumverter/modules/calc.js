/**
 * @module calc
 * @description Pure dose calculation for the UCUMverter demo. Every input quantity is
 * normalised to a canonical UCUM unit first, and each conversion is recorded in a
 * trace so the UI can show its working. DEMO ONLY - not for clinical use.
 */

import { convert } from './ucum.js';

/** Canonical units used internally. Inputs may arrive in any commensurable unit. */
export const CANONICAL = {
  weight: 'kg',
  height: 'cm',
  creatinine: 'umol/L',
  crcl: 'mL/min',
  doseRate: 'mg/kg',
  dose: 'mg',
  level: 'mg/L',
  concentration: 'mg/mL',
  volume: 'mL',
};

/**
 * Format a number to 4 significant figures without exponent noise. Rounding to 10
 * figures first removes floating-point residue (1077.4999999 vs 1077.5), so a value
 * shown after a unit round trip never flips at a rounding boundary.
 */
export function fmt(n) {
  if (n == null || !Number.isFinite(n)) return '-';
  return String(Number(Number(n.toPrecision(10)).toPrecision(4)));
}

/** Devine ideal body weight in kg. */
export function idealBodyWeightKg(sex, heightCm) {
  const base = sex === 'female' ? 45.5 : 50;
  return Math.max(base + 0.9 * (heightCm - 152), 1);
}

/**
 * Pick the dosing weight for a guideline's weight basis.
 * @returns {{kg:number, basis:string}}
 */
export function dosingWeight(weightBasis, actualKg, idealKg) {
  if (weightBasis === 'ideal') {
    return actualKg < idealKg
      ? { kg: actualKg, basis: 'actual (lower than ideal)' }
      : { kg: idealKg, basis: 'ideal' };
  }
  if (weightBasis === 'adjustedIfObese' && actualKg > 1.2 * idealKg) {
    return { kg: idealKg + 0.4 * (actualKg - idealKg), basis: 'adjusted (actual > 120% of ideal)' };
  }
  return { kg: actualKg, basis: 'actual' };
}

/** Cockcroft-Gault creatinine clearance (SI form) in mL/min. */
export function cockcroftGault(ageYears, sex, weightKg, creatinineUmolL) {
  const f = sex === 'female' ? 0.85 : 1;
  return ((140 - ageYears) * weightKg * f) / (0.815 * creatinineUmolL);
}

function hasValue(q) {
  return q && Number.isFinite(q.value) && q.value > 0 && q.unit;
}

/**
 * Run the full calculation.
 * @param {object} input
 * @param {{age:number, sex:string, weight:object, height:object, creatinine:object|null}} input.patient
 * @param {number} input.creatinineMolarMass
 * @param {object} input.guideline - one entry from guidelines.json
 * @param {{value:number, unit:string}} input.targetDose
 * @param {{value:number, unit:string}|null} input.level - measured drug level
 * @param {{value:number, unit:string}|null} input.targetLevel
 * @param {object|null} input.product - {code, display, boss, concentration:{value,ucum}|null, totalQuantity:{value,ucum}|null}
 * @param {object} input.out - output units {dose, volume, crcl, strength, weight}
 */
export function calculate(input) {
  const { patient, guideline: g, out } = input;
  const res = { trace: [], steps: [], warnings: [], errors: [] };

  const norm = (what, q, to, molarMass = null) => {
    const value = convert(q.value, q.unit, to, molarMass);
    res.trace.push({ what, from: { value: q.value, unit: q.unit }, to: { value, unit: to }, molarMass });
    return value;
  };
  const step = (label, text) => res.steps.push({ label, text });
  const substance = (code) => (g.substances && g.substances[code]) || null;

  // 1. Patient
  if (!Number.isFinite(patient.age) || !hasValue(patient.weight) || !hasValue(patient.height)) {
    res.errors.push('Enter the patient age, weight and height.');
    return res;
  }
  let weightKg, heightCm;
  try {
    weightKg = norm('Weight', patient.weight, CANONICAL.weight);
    heightCm = norm('Height', patient.height, CANONICAL.height);
  } catch (e) {
    res.errors.push(e.message);
    return res;
  }

  // 2. Ideal and dosing weight
  res.ibwKg = idealBodyWeightKg(patient.sex, heightCm);
  step('Ideal body weight', `${patient.sex === 'female' ? '45.5' : '50'} + 0.9 x (${fmt(heightCm)} cm - 152) = ${fmt(res.ibwKg)} kg`);
  const dw = dosingWeight(g.weightBasis, weightKg, res.ibwKg);
  res.dosingWeightKg = dw.kg;
  res.dosingWeightBasis = dw.basis;
  res.dosingWeight = { value: convert(dw.kg, 'kg', out.weight), unit: out.weight };
  step('Dosing weight', `${dw.basis}: ${fmt(dw.kg)} kg`);

  // 3. Creatinine clearance (display only)
  if (hasValue(patient.creatinine)) {
    try {
      const scr = norm('Creatinine', patient.creatinine, CANONICAL.creatinine, input.creatinineMolarMass);
      const cgWeight = Math.min(weightKg, res.ibwKg);
      const crcl = cockcroftGault(patient.age, patient.sex, cgWeight, scr);
      res.crcl = { mLmin: crcl, value: convert(crcl, CANONICAL.crcl, out.crcl), unit: out.crcl };
      step('Creatinine clearance', `(140 - ${patient.age}) x ${fmt(cgWeight)} kg${patient.sex === 'female' ? ' x 0.85' : ''} / (0.815 x ${fmt(scr)} umol/L) = ${fmt(crcl)} mL/min`);
      if (g.crclWarnBelow) {
        const limit = convert(g.crclWarnBelow.value, g.crclWarnBelow.unit, CANONICAL.crcl);
        if (crcl < limit) {
          res.warnings.push(`Creatinine clearance ${fmt(crcl)} mL/min is below ${fmt(limit)} mL/min. This guideline may not apply (shown for information only).`);
        }
      }
    } catch (e) {
      res.warnings.push(`Creatinine clearance not calculated: ${e.message}`);
    }
  }

  // 4. Base dose
  if (!hasValue(input.targetDose)) {
    res.errors.push('Enter a target dose.');
    return res;
  }
  let dose;
  try {
    const rate = norm('Target dose', input.targetDose, CANONICAL.doseRate);
    dose = rate * dw.kg;
    res.baseDoseMg = dose;
    step('Base dose', `${fmt(rate)} mg/kg x ${fmt(dw.kg)} kg = ${fmt(dose)} mg`);
  } catch (e) {
    res.errors.push(e.message);
    return res;
  }

  // 5. Level adjustment (proportional, assumes linear kinetics)
  res.levelFactor = 1;
  if (hasValue(input.level) && hasValue(input.targetLevel)) {
    const analyte = substance(g.analyte);
    const mm = analyte ? analyte.molarMass : null;
    try {
      const measured = norm('Measured level', input.level, CANONICAL.level, mm);
      const target = norm('Target level', input.targetLevel, CANONICAL.level, mm);
      res.levelFactor = target / measured;
      const before = dose;
      dose = dose * res.levelFactor;
      step('Level adjustment', `${fmt(before)} mg x (${fmt(target)} mg/L / ${fmt(measured)} mg/L) = ${fmt(dose)} mg`);
    } catch (e) {
      res.warnings.push(`Level adjustment skipped: ${e.message}`);
    }
  } else {
    step('Level adjustment', 'None (enter both a measured level and a target level)');
  }

  // Maximum dose cap
  if (hasValue(g.maxDose)) {
    const maxMg = norm('Maximum dose', g.maxDose, CANONICAL.dose);
    if (dose > maxMg) {
      step('Maximum dose', `${fmt(dose)} mg capped to ${fmt(maxMg)} mg`);
      dose = maxMg;
      res.capped = true;
      res.warnings.push(`Dose capped at the guideline maximum of ${fmt(g.maxDose.value)} ${g.maxDose.unit}.`);
    }
  }
  res.doseMg = dose;
  res.doseSubstance = substance(g.doseSubstance);
  res.dose = { value: convert(dose, CANONICAL.dose, out.dose), unit: out.dose };

  // 6-7. Product: salt conversion, volume and units
  const p = input.product;
  if (!p) return res;

  let doseBoss = dose;
  if (p.boss && g.doseSubstance && p.boss !== g.doseSubstance) {
    const from = substance(g.doseSubstance);
    const to = substance(p.boss);
    if (from && to && from.molarMass && to.molarMass) {
      const mmol = norm(`Dose as ${from.display}`, { value: dose, unit: 'mg' }, 'mmol', from.molarMass);
      doseBoss = norm(`Dose as ${to.display}`, { value: mmol, unit: 'mmol' }, 'mg', to.molarMass);
      step('Salt conversion', `${fmt(dose)} mg ${from.display} = ${fmt(mmol)} mmol = ${fmt(doseBoss)} mg ${to.display}`);
    } else {
      res.warnings.push('The product strength substance differs from the guideline dose substance, and no molar mass is configured. No salt conversion applied.');
    }
  }
  res.doseBossMg = doseBoss;
  res.bossSubstance = substance(p.boss);
  res.doseBoss = { value: convert(doseBoss, CANONICAL.dose, out.dose), unit: out.dose };

  if (p.concentration) {
    const conc = norm('Concentration', { value: p.concentration.value, unit: p.concentration.ucum }, CANONICAL.concentration);
    const mL = doseBoss / conc;
    res.strength = { value: convert(conc, CANONICAL.concentration, out.strength), unit: out.strength };
    res.volume = { mL, value: convert(mL, CANONICAL.volume, out.volume), unit: out.volume };
    step('Volume', `${fmt(doseBoss)} mg / ${fmt(conc)} mg/mL = ${fmt(mL)} mL`);
  }
  if (p.totalQuantity) {
    const each = norm('Quantity per unit', { value: p.totalQuantity.value, unit: p.totalQuantity.ucum }, CANONICAL.dose);
    const exact = doseBoss / each;
    res.units = { exact, rounded: Math.ceil(exact - 1e-9), eachMg: each };
    step('Units needed', `${fmt(doseBoss)} mg / ${fmt(each)} mg each = ${fmt(exact)}, round up to ${res.units.rounded}`);
  }
  return res;
}
