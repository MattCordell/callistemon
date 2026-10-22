/**
 * @module ucum
 * @description Thin wrapper over the NLM ucum-lhc library (loaded globally as `ucumPkg`
 * by a classic <script> tag) for conversion, validation and unit names.
 */

let utils = null;

function lib() {
  if (!utils) {
    if (!globalThis.ucumPkg) throw new Error('UCUM library (ucumPkg) is not loaded');
    utils = globalThis.ucumPkg.UcumLhcUtils.getInstance();
  }
  return utils;
}

/**
 * Convert a value between two UCUM units.
 * @param {number} value
 * @param {string} from - UCUM code
 * @param {string} to - UCUM code
 * @param {number|null} [molarMass] - g/mol, needed only for mass <-> mole conversions
 * @returns {number}
 */
export function convert(value, from, to, molarMass = null) {
  if (from === to) return value;
  const opts = molarMass ? { molecularWeight: molarMass } : {};
  const r = lib().convertUnitTo(from, value, to, opts);
  if (r.status !== 'succeeded') {
    const why = (r.msg || []).join(' ') || r.status;
    throw new Error(`Cannot convert ${from} to ${to}: ${why}`);
  }
  return r.toVal;
}

/** True when the code is a valid UCUM expression. */
export function isValid(code) {
  try {
    return lib().validateUnitString(code).status === 'valid';
  } catch {
    return false;
  }
}

const nameCache = new Map();

/** Human-readable UCUM name for a code, e.g. "[lb_av]" -> "pound". */
export function describe(code) {
  if (nameCache.has(code)) return nameCache.get(code);
  let name = code;
  try {
    const r = lib().validateUnitString(code);
    if (r.status === 'valid' && r.unit && r.unit.name) name = r.unit.name;
  } catch { /* keep code */ }
  nameCache.set(code, name);
  return name;
}
