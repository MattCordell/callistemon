/**
 * @module patient
 * @description Random but plausible adult patient for the demo. Values are returned in
 * canonical units (kg, cm, umol/L); the UI converts them to whatever unit is selected.
 */

function normal(mean, sd) {
  // Box-Muller
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const between = (lo, hi) => lo + Math.random() * (hi - lo);

/** @returns {{age:number, sex:'male'|'female', weightKg:number, heightCm:number, creatinineUmolL:number}} */
export function randomPatient() {
  const sex = Math.random() < 0.5 ? 'male' : 'female';
  const age = Math.round(between(18, 90));
  const heightCm = Math.round(clamp(sex === 'male' ? normal(175, 7) : normal(162, 6), 145, 200));
  const bmi = clamp(normal(27, 5), 18, 40);
  const weightKg = Math.round(bmi * (heightCm / 100) ** 2 * 10) / 10;
  // Creatinine drifts up with age; mostly normal, sometimes impaired.
  const base = sex === 'male' ? 80 : 65;
  const ageEffect = Math.max(0, age - 40) * 0.8;
  const creatinineUmolL = Math.round(clamp(normal(base + ageEffect, 20), 50, 200));
  return { age, sex, weightKg, heightCm, creatinineUmolL };
}
