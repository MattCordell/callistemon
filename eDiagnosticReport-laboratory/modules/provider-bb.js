/**
 * @module provider-bb
 * @description Provider-specific test overrides for BB Diagnostics.
 *
 * Overrides are keyed by the master LOINC code of the observable to customise.
 * Any observable property can be overridden: loincCode, loincDisplay, unit,
 * ucumCode, referenceRange, decimalPlaces, method.
 */

export const PROVIDER_OVERRIDES = {
  // Albumin — BCG method
  '1751-7': {
    loincCode: '61151-7',
    loincDisplay: 'Albumin [Mass/volume] in Serum or Plasma by Bromocresol green (BCG) dye binding method',
    method: 'BCG dye binding'
  },
  // Sodium — ISE method
  '2951-2': {
    method: 'ISE'
  },
  // AST — tighter upper bound
  '1920-8': {
    referenceRange: { low: 5, high: 35 }
  }
};
