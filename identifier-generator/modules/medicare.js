// Medicare card number: 8 digits + check digit + issue number (+ IRN).
//   digit 1      2-6
//   digits 2-8   0-9
//   digit 9      check digit: (digits 1-8 x 1,3,7,9,1,3,7,9) mod 10
//   digit 10     card issue number, 1-9
//   digit 11     individual reference number (IRN), 1-9; some systems omit it

import { clean, isDigits, toDigits, weightedSum, ok, fail } from './checks.js';

const WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9];

const checkDigit = (first8) => weightedSum(toDigits(first8), WEIGHTS) % 10;

/** @param {{length?: 10 | 11}} options  length 10 leaves off the IRN. Default 11. */
export function generate(rng, { length = 11 } = {}) {
  const first8 = `${rng.digit(2, 6)}${rng.digits(7)}`;
  let out = `${first8}${checkDigit(first8)}${rng.digit(1, 9)}`;
  if (Number(length) !== 10) out += rng.digit(1, 9);
  return out;
}

export function validate(value) {
  const s = clean(value);
  if (!isDigits(s)) return fail('Use digits only. Spaces, hyphens and "/" are ignored.');
  if (s.length !== 10 && s.length !== 11) return fail(`Expected 10 or 11 digits, found ${s.length}.`);
  if (!/^[2-6]/.test(s)) return fail('The first digit must be 2 to 6.');
  if (checkDigit(s.slice(0, 8)) !== Number(s[8])) return fail('Check digit (digit 9) is wrong.');
  if (s[9] === '0') return fail('The issue number (digit 10) must be 1 to 9.');
  if (s.length === 11 && s[10] === '0') return fail('The IRN (digit 11) must be 1 to 9.');
  return ok(s.length === 10 ? ['No IRN given, so this does not identify one person on the card.'] : []);
}
