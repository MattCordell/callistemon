/**
 * @module provider-calli
 * @description Provider-specific test overrides for Callistemon Diagnostic Services.
 *
 * Overrides are keyed by the master LOINC code of the observable to customise.
 * Any observable property can be overridden: loincCode, loincDisplay, unit,
 * ucumCode, referenceRange, decimalPlaces, method.
 *
 * An empty object means this provider uses all master defaults.
 */

export const PROVIDER_OVERRIDES = {
  // Albumin — BCP method
  '1751-7': {
    loincCode: '61152-5',
    loincDisplay: 'Albumin [Mass/volume] in Serum or Plasma by Bromocresol purple (BCP) dye binding method',
    method: 'BCP dye binding'
  },
  // Sodium — AAS method
  '2951-2': {
    method: 'AAS'
  },
  // AST — tighter upper bound
  '1920-8': {
    referenceRange: { low: 5, high: 30 }
  }
};
