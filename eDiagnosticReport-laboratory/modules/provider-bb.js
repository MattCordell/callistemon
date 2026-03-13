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
  },

  // ── TFT — Beckman Coulter Access 2 platform ───────────────────────
  // TSH
  '3016-3': {
    referenceRange: { low: 0.27, high: 4.2 },
    method: 'Chemiluminescent immunoassay (CLIA)'
  },
  // Free T4
  '14920-3': {
    referenceRange: { low: 12.0, high: 22.0 },
    method: 'Chemiluminescent immunoassay (CLIA)'
  },
  // Free T3
  '14928-6': {
    referenceRange: { low: 4.0, high: 7.5 },
    method: 'Chemiluminescent immunoassay (CLIA)'
  },

  // ── Iron Studies — mixed adult population ─────────────────────────
  // Iron
  '14798-3': {
    referenceRange: { low: 9, high: 32 }
  },
  // Ferritin
  '2276-4': {
    referenceRange: { low: 15, high: 280 }
  },
  // Transferrin
  '3034-6': {
    referenceRange: { low: 2.0, high: 3.6 }
  },
  // Transferrin saturation
  '14801-5': {
    referenceRange: { low: 20, high: 50 }
  },
  // TIBC
  '14800-7': {
    referenceRange: { low: 42, high: 68 }
  },

  // ── Coagulation — Instrumentation Laboratory ACL TOP, HemosIL SynthasIL
  // PT
  '5902-2': {
    referenceRange: { low: 12.0, high: 16.0 },
    method: 'HemosIL SynthasIL'
  },
  // APTT
  '14979-9': {
    referenceRange: { low: 28, high: 40 },
    method: 'HemosIL APTT-SP (LA sensitive)'
  },
  // Fibrinogen — Clauss method
  '3255-7': {
    referenceRange: { low: 2.0, high: 4.5 },
    method: 'Clauss'
  },

  // ── Hepatitis B surface Ab — Abbott Alinity i ────────────────────
  '16935-9': {
    method: 'Chemiluminescent microparticle immunoassay (CMIA)'
  }
};
