// AHPRA registration number: 3 uppercase letters (profession) + 10 digits, 13 characters.
// There is no check digit. Source: HL7 AU Base IG au-ahpraregistrationnumber
// (regex ^[A-Z]{3}[0-9]{10}$). Profession codes are a third-party list.
//
// We generate "0" followed by 9 random digits, like the HL7 AU example MED0000932846.

import { AHPRA_PROFESSIONS } from '../config/ahpra-professions.js';
import { clean, ok, fail } from './checks.js';

const CODES = Object.keys(AHPRA_PROFESSIONS);

export function generate(rng) {
  return `${rng.pick(CODES)}0${rng.digits(9)}`;
}

export function validate(value) {
  const s = clean(value);
  if (!/^[A-Z]{3}[0-9]{10}$/.test(s)) return fail('Expected 3 letters followed by 10 digits, for example MED0000932846.');
  const warnings = [];
  if (!AHPRA_PROFESSIONS[s.slice(0, 3)]) warnings.push(`Profession code ${s.slice(0, 3)} is not in our list.`);
  return ok(warnings);
}
