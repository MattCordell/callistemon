// Healthcare identifiers issued by the HI Service: IHI, HPI-I and HPI-O.
// All three are 16 digits: a 6-digit issuer prefix, 9 digits, then a Luhn check digit.
//   IHI    800360
//   HPI-I  800361
//   HPI-O  800362
// Source: HL7 AU Base IG profiles au-ihi, au-hpii, au-hpio.

import { clean, isDigits, luhnCheckDigit, luhnValid, ok, fail } from './checks.js';

export function createHiType(prefix, name) {
  return {
    generate(rng) {
      const base = `${prefix}${rng.digits(9)}`;
      return `${base}${luhnCheckDigit(base)}`;
    },
    validate(value) {
      const s = clean(value);
      if (!isDigits(s)) return fail('Use digits only. Spaces and hyphens are ignored.');
      if (s.length !== 16) return fail(`A ${name} has 16 digits, found ${s.length}.`);
      if (!s.startsWith(prefix)) return fail(`A ${name} starts with ${prefix}.`);
      if (!luhnValid(s)) return fail('Luhn check digit (digit 16) is wrong.');
      return ok();
    },
  };
}

export const ihi = createHiType('800360', 'IHI');
export const hpii = createHiType('800361', 'HPI-I');
export const hpio = createHiType('800362', 'HPI-O');
