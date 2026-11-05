// PBS prescriber number: 6 digits + check digit (7 digits in all).
//   first digit 1-9: check = (digits 1-6 x 1,3,7,9,1,3) mod 10
//   first digit 0:   check = (digits 1-6 x 0,5,8,4,2,1) mod 11
// With a leading 0, mod 11 can give 10. No source says what the check digit is then,
// so we never generate such a number and the validator reports it as undefined.

import { clean, isDigits, toDigits, weightedSum, ok, fail } from './checks.js';

const WEIGHTS_MOD_10 = [1, 3, 7, 9, 1, 3];
const WEIGHTS_MOD_11 = [0, 5, 8, 4, 2, 1];

/** Check digit for 6 digits, or null when it is undefined (mod 11 gave 10). */
function checkDigit(six) {
  const digits = toDigits(six);
  if (digits[0] === 0) {
    const value = weightedSum(digits, WEIGHTS_MOD_11) % 11;
    return value === 10 ? null : value;
  }
  return weightedSum(digits, WEIGHTS_MOD_10) % 10;
}

export function generate(rng) {
  for (;;) {
    const six = rng.digits(6);
    const check = checkDigit(six);
    if (check !== null) return `${six}${check}`;
  }
}

export function validate(value) {
  const s = clean(value);
  if (!isDigits(s)) return fail('Use digits only.');
  if (s.length !== 7) return fail(`Expected 7 digits, found ${s.length}.`);
  const check = checkDigit(s.slice(0, 6));
  if (check === null) {
    return fail('A leading 0 with check value 10 has no defined check digit in the sources we found.');
  }
  if (check !== Number(s[6])) return fail(`Check digit (digit 7) is wrong, expected ${check}.`);
  return ok();
}
