// Entry point for the library. Works in the browser and in Node (ES modules, no dependencies).
//
//   import { generate, validate, toFhirIdentifier, TYPES } from './modules/registry.js';
//   generate('ihi', { count: 5, seed: 42 });       // ['8003...', ...]
//   validate('ihi', '8003609928383098');            // { valid: true, warnings: [] }
//   toFhirIdentifier('ihi', '8003609928383098');    // { system, value }
//
// SYNTHETIC DATA: values pass the published format and check-digit rules, but nothing
// guarantees they do not belong to a real person or provider.

import { createRng } from './random.js';
import { clean } from './checks.js';
import { RESERVED } from '../config/reserved.js';
import * as medicare from './medicare.js';
import { ihi, hpii, hpio } from './hi.js';
import * as provider from './provider.js';
import * as prescriber from './prescriber.js';
import * as ahpra from './ahpra.js';
import * as dva from './dva.js';

const NS = 'http://ns.electronichealth.net.au/id';

/**
 * `system` is the FHIR Identifier.system from the HL7 AU Base IG, or null where the IG
 * defines none (hospital provider number).
 */
export const TYPES = [
  { id: 'medicare', label: 'Medicare card number', example: '32788511952', system: `${NS}/medicare-number`,
    generate: medicare.generate, validate: medicare.validate },
  { id: 'dva', label: 'DVA file number', example: 'QRD27794D', system: `${NS}/dva`,
    generate: dva.generate, validate: dva.validate },
  { id: 'ihi', label: 'IHI (individual)', example: '8003608833357361', system: `${NS}/hi/ihi/1.0`,
    generate: ihi.generate, validate: ihi.validate },
  { id: 'hpii', label: 'HPI-I (provider)', example: '8003619900015717', system: `${NS}/hi/hpii/1.0`,
    generate: hpii.generate, validate: hpii.validate },
  { id: 'hpio', label: 'HPI-O (organisation)', example: '8003621566684455', system: `${NS}/hi/hpio/1.0`,
    generate: hpio.generate, validate: hpio.validate },
  { id: 'medicare-provider', label: 'Medicare provider number', example: '2426621B', system: `${NS}/medicare-provider-number`,
    generate: provider.generateProvider, validate: provider.validate },
  { id: 'pbs-prescriber', label: 'PBS prescriber number', example: '5946189', system: `${NS}/medicare-prescriber-number`,
    generate: prescriber.generate, validate: prescriber.validate },
  { id: 'ahpra', label: 'AHPRA registration number', example: 'MED0000932846', system: 'http://hl7.org.au/id/ahpra-registration-number',
    generate: ahpra.generate, validate: ahpra.validate },
  { id: 'hospital-provider', label: 'Hospital PBS provider number', example: '0518057W', system: null,
    generate: provider.generateHospital, validate: provider.validate },
];

const BY_ID = new Map(TYPES.map((t) => [t.id, t]));
const RESERVED_SET = new Set(RESERVED.map(clean));

function typeOf(typeId) {
  const type = BY_ID.get(typeId);
  if (!type) throw new Error(`Unknown identifier type "${typeId}". Use one of: ${TYPES.map((t) => t.id).join(', ')}`);
  return type;
}

/** True if the value is recorded as reserved in Identifiers.md. */
export function isReserved(value) {
  return RESERVED_SET.has(clean(value));
}

/**
 * Generate synthetic identifiers.
 * @param {string} typeId  one of TYPES[].id
 * @param {{count?: number, seed?: string|number, length?: 10|11}} options
 *        `seed` makes the output repeatable. `length` applies to Medicare numbers only.
 * @returns {string[]} unique values, never ones listed in config/reserved.js
 */
export function generate(typeId, { count = 1, seed, ...typeOptions } = {}) {
  const type = typeOf(typeId);
  // Mix the type into the seed so one seed does not give the same digits in every type.
  const hasSeed = seed !== undefined && seed !== null && seed !== '';
  const rng = createRng(hasSeed ? `${typeId}:${seed}` : undefined);
  const wanted = Math.max(0, Math.floor(Number(count)) || 0);
  const seen = new Set();
  const out = [];
  let attempts = 0;
  const maxAttempts = wanted * 100 + 100;
  while (out.length < wanted && attempts++ < maxAttempts) {
    const value = type.generate(rng, typeOptions);
    if (seen.has(value) || RESERVED_SET.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** Check a value against the rules for a type. Returns { valid, reason? , warnings? }. */
export function validate(typeId, value) {
  return typeOf(typeId).validate(value);
}

/** FHIR Identifier for a value. `system` is left out where the AU Base IG defines none. */
export function toFhirIdentifier(typeId, value) {
  const type = typeOf(typeId);
  return type.system ? { system: type.system, value } : { value };
}
