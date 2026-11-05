// Medicare provider number: 6-digit stem + practice location character + check character.
// The hospital PBS provider number uses the same algorithm (the RAMD samples all have a stem that starts with 0).
//
// Check character:
//   sequence = 6 stem digits, then the location value (PLV)
//   weights  = 3, 5, 8, 4, 2, 1, 6
//   check    = sum(sequence x weights) mod 11, mapped 0=Y 1=X 2=W 3=T 4=L 5=K 6=J 7=H 8=F 9=B 10=A
// Location value: 0-9 map to 0-9; letters A-Y (without I, O, S, Z) map to 10-31 in order.
//
// Sources disagree on whether 0 is a valid location character, so we never generate it
// but still accept it when validating.

import { clean, isDigits, toDigits, weightedSum, ok, fail } from './checks.js';

const LOCATION_LETTERS = 'ABCDEFGHJKLMNPQRTUVWXY'; // values 10..31
const CHECK_CHARS = 'YXWTLKJHFBA'; // index = mod 11 result
const WEIGHTS = [3, 5, 8, 4, 2, 1, 6];

/** 0-9 and A-Y (no I, O, S, Z) -> 0-31. Returns -1 for anything else. */
function locationValue(ch) {
  if (/^[0-9]$/.test(ch)) return Number(ch);
  const i = LOCATION_LETTERS.indexOf(ch);
  return i === -1 ? -1 : 10 + i;
}

function checkChar(stem, location) {
  const sequence = [...toDigits(stem), locationValue(location)];
  return CHECK_CHARS[weightedSum(sequence, WEIGHTS) % 11];
}

/** Location characters we generate: 1-9 and the valid letters. Never 0. */
const GENERATED_LOCATIONS = `123456789${LOCATION_LETTERS}`;

function build(rng, stem) {
  const location = rng.pick(GENERATED_LOCATIONS);
  return `${stem}${location}${checkChar(stem, location)}`;
}

/** Medicare provider number, stem 100000-999999. */
export function generateProvider(rng) {
  return build(rng, `${rng.digit(1, 9)}${rng.digits(5)}`);
}

/** Hospital PBS provider number, stem starting with 0. */
export function generateHospital(rng) {
  return build(rng, `0${rng.digits(5)}`);
}

export function validate(value) {
  let s = clean(value);
  const warnings = [];
  if (s.length === 7) {
    // A 5-digit stem is written without its leading zero. Add it back before checking.
    s = `0${s}`;
    warnings.push('7 characters given, so a leading 0 was added to the stem.');
  }
  if (s.length !== 8) return fail(`Expected 8 characters (6-digit stem, location, check), found ${s.length}.`);
  const stem = s.slice(0, 6);
  const location = s[6];
  const check = s[7];
  if (!isDigits(stem)) return fail('The first 6 characters must be digits.');
  if (locationValue(location) === -1) {
    return fail('The location character (7th) must be 0-9 or a letter other than I, O, S or Z.');
  }
  if (!CHECK_CHARS.includes(check)) return fail('The check character (8th) must be one of A B F H J K L T W X Y.');
  if (checkChar(stem, location) !== check) {
    return fail(`Check character is wrong, expected ${checkChar(stem, location)}.`);
  }
  if (location === '0') warnings.push('Location character 0 is not accepted by every source.');
  return ok(warnings);
}
