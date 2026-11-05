// Shared helpers for identifier check digits and validation results.

/** Upper-case a value and drop spaces, hyphens and slashes (as printed on cards). */
export function clean(value) {
  return String(value ?? '').toUpperCase().replace(/[\s\-/]/g, '');
}

export function isDigits(text) {
  return /^[0-9]+$/.test(text);
}

/** "1234" -> [1, 2, 3, 4] */
export function toDigits(text) {
  return Array.from(text, Number);
}

/** Sum of values[i] * weights[i] over the length of weights. */
export function weightedSum(values, weights) {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += values[i] * weights[i];
  return sum;
}

/**
 * Luhn sum, working from the right. When `hasCheckDigit` is false the rightmost
 * digit of `digits` is treated as the digit next to the check digit, so it is doubled.
 */
function luhnSum(digits, hasCheckDigit) {
  let sum = 0;
  const offset = hasCheckDigit ? 0 : 1;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[digits.length - 1 - i];
    if ((i + offset) % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum;
}

/** Luhn check digit (0-9) to append to a string of digits. */
export function luhnCheckDigit(base) {
  const sum = luhnSum(toDigits(base), false);
  return (10 - (sum % 10)) % 10;
}

/** True if a full digit string (check digit included) passes the Luhn test. */
export function luhnValid(full) {
  return luhnSum(toDigits(full), true) % 10 === 0;
}

/** Validation result helpers. `warnings` is for things that are odd but accepted. */
export const ok = (warnings = []) => ({ valid: true, warnings });
export const fail = (reason) => ({ valid: false, reason });
