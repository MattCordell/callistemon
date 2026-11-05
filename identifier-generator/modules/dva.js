// DVA file number (the number on a Veteran Card). There is no check digit.
//   state letter   N (NSW and ACT), S (SA and NT), W, T, V, Q
//   war code       0-3 letters (none for WW1)
//   file number    digits; we generate 7 - (war code length), which gives 8 characters
//   dependant      optional letter on the end; veterans have none
// HL7 AU Base IG allows at most 9 characters in all.
// The generated shape matches all 10 RAMD sample numbers.

import { WAR_CODES } from '../config/war-codes.js';
import { clean, ok, fail } from './checks.js';

const STATES = 'NSWTVQ';
const DEPENDANT_LETTERS = 'ABCD';

export function generate(rng) {
  const state = rng.pick(STATES);
  const warCode = rng.pick(WAR_CODES);
  const digits = rng.digits(7 - warCode.length);
  const dependant = rng.next() < 0.75 ? rng.pick(DEPENDANT_LETTERS) : '';
  return `${state}${warCode}${digits}${dependant}`;
}

export function validate(value) {
  const s = clean(value);
  const m = /^([A-Z])([A-Z]{0,3})([0-9]{1,6})([A-Z]?)$/.exec(s);
  if (!m) return fail('Expected a state letter, an optional war code (1-3 letters), up to 6 digits, and an optional dependant letter.');
  const [, state, warCode, digits] = m;
  if (!STATES.includes(state)) return fail(`The first letter must be one of ${STATES.split('').join(', ')}.`);
  if (s.length > 9) return fail(`At most 9 characters are allowed, found ${s.length}.`);
  const warnings = [];
  if (warCode && !WAR_CODES.includes(warCode)) warnings.push(`War code ${warCode} is not in our list. DVA adds codes over time.`);
  if (warCode && digits.length !== 7 - warCode.length) {
    warnings.push(`A ${warCode.length}-letter war code usually has ${7 - warCode.length} digits, found ${digits.length}.`);
  }
  return ok(warnings);
}
