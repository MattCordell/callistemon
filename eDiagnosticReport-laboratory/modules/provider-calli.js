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
  },

  // ── TFT — Roche Cobas e801 platform ──────────────────────────────
  // TSH
  '3016-3': {
    referenceRange: { low: 0.35, high: 4.5 },
    method: 'Electrochemiluminescence immunoassay (ECLIA)'
  },
  // Free T4
  '14920-3': {
    referenceRange: { low: 9.0, high: 19.0 },
    method: 'Electrochemiluminescence immunoassay (ECLIA)'
  },
  // Free T3
  '14928-6': {
    referenceRange: { low: 3.5, high: 6.0 },
    method: 'Electrochemiluminescence immunoassay (ECLIA)'
  },

  // ── Iron Studies — mixed adult population ─────────────────────────
  // Iron
  '14798-3': {
    referenceRange: { low: 11, high: 29 }
  },
  // Ferritin
  '2276-4': {
    referenceRange: { low: 20, high: 250 }
  },
  // Transferrin
  '3034-6': {
    referenceRange: { low: 2.2, high: 3.8 }
  },
  // Transferrin saturation
  '14801-5': {
    referenceRange: { low: 15, high: 45 }
  },
  // TIBC
  '14800-7': {
    referenceRange: { low: 45, high: 72 }
  },

  // ── Coagulation — Stago STA-R analyser, HemosIL RecombiPlasTin 2G ─
  // PT
  '5902-2': {
    referenceRange: { low: 11.0, high: 14.0 },
    method: 'HemosIL RecombiPlasTin 2G'
  },
  // APTT
  '14979-9': {
    referenceRange: { low: 25, high: 35 },
    method: 'HemosIL APTT-SP'
  },
  // Fibrinogen — Clauss method
  '3255-7': {
    referenceRange: { low: 1.5, high: 4.0 },
    method: 'Clauss'
  },

  // ── Hepatitis B surface Ab — Roche Elecsys ───────────────────────
  '16935-9': {
    method: 'Electrochemiluminescence immunoassay (ECLIA)'
  }
};
