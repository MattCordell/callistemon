/**
 * @module autocomplete-engine
 * @description Generates random realistic values for pathology observables.
 *
 * Uses a normal distribution centred on the midpoint of the reference range,
 * with ~95% of values falling within the range (2 SD).
 */

/**
 * Generate random values for all observables in the given headings.
 *
 * @param {Array} headings - Array of heading objects with observables
 * @returns {Map<string, number>} Map of loincCode -> generated value
 */
export function generateValues(headings) {
  const values = new Map();

  for (const heading of headings) {
    for (const obs of heading.observables) {
      const { low, high } = obs.referenceRange || {};
      if (low == null && high == null) continue;

      const lo = low ?? 0;
      const hi = high ?? (lo * 2);
      const mid = (lo + hi) / 2;
      const sd = (hi - lo) / 4; // 2 SD covers the range

      let value = gaussianRandom(mid, sd);

      // Clamp to a reasonable range (allow slight out-of-range for realism)
      const floor = lo - sd;
      const ceiling = hi + sd;
      value = Math.max(floor >= 0 ? floor : 0, Math.min(ceiling, value));

      // Round to the appropriate decimal places
      const dp = obs.decimalPlaces || 0;
      const factor = Math.pow(10, dp);
      value = Math.round(value * factor) / factor;

      values.set(obs.loincCode, value);
    }
  }

  return values;
}

/**
 * Generate a normally distributed random number using the Box-Muller transform.
 * @param {number} mean
 * @param {number} stddev
 * @returns {number}
 */
function gaussianRandom(mean, stddev) {
  let u1 = Math.random();
  let u2 = Math.random();
  // Avoid log(0)
  while (u1 === 0) u1 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}
