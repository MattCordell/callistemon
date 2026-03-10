/**
 * @module test-definitions
 * @description Test panel configurations for pathology laboratory reporting.
 *
 * Each test definition includes:
 * - SNOMED CT code and display for the test/panel
 * - Custom displayName for UI (maps to CodeableConcept.text in FHIR)
 * - Optional superSet membership
 * - Headings with grouped observables (LOINC coded, UCUM units, reference ranges)
 *
 * Source data: RCPA SPIA Haematology and Chemical Pathology reference sets (Feb 2026),
 * RCPA SPIA Harmonised Reference Intervals (Dec 2024).
 */

export const TEST_DEFINITIONS = [
  // ── Full Blood Count ──────────────────────────────────────────────
  {
    code: '26604007',
    system: 'http://snomed.info/sct',
    display: 'Full blood count',
    displayName: 'FBC',
    superSet: null,
    headings: [
      {
        title: 'Red Cell Parameters',
        observables: [
          {
            display: 'Haemoglobin',
            loincCode: '718-7',
            loincDisplay: 'Hemoglobin [Mass/volume] in Blood',
            unit: 'g/L',
            ucumCode: 'g/L',
            referenceRange: { low: 120, high: 170 },
            decimalPlaces: 0
          },
          {
            display: 'Red cell count',
            loincCode: '789-8',
            loincDisplay: 'Erythrocytes [#/volume] in Blood by Automated count',
            unit: '\u00d710\u00b9\u00b2/L',
            ucumCode: '10*12/L',
            referenceRange: { low: 3.8, high: 5.5 },
            decimalPlaces: 2
          },
          {
            display: 'Haematocrit',
            loincCode: '4544-3',
            loincDisplay: 'Hematocrit [Volume Fraction] of Blood by Automated count',
            unit: 'L/L',
            ucumCode: 'L/L',
            referenceRange: { low: 0.36, high: 0.54 },
            decimalPlaces: 2
          },
          {
            display: 'MCV',
            loincCode: '787-2',
            loincDisplay: 'MCV [Entitic volume] by Automated count',
            unit: 'fL',
            ucumCode: 'fL',
            referenceRange: { low: 80, high: 100 },
            decimalPlaces: 1
          },
          {
            display: 'MCH',
            loincCode: '785-6',
            loincDisplay: 'MCH [Entitic mass] by Automated count',
            unit: 'pg',
            ucumCode: 'pg',
            referenceRange: { low: 27.0, high: 33.0 },
            decimalPlaces: 1
          },
          {
            display: 'MCHC',
            loincCode: '786-4',
            loincDisplay: 'MCHC [Mass/volume] by Automated count',
            unit: 'g/L',
            ucumCode: 'g/L',
            referenceRange: { low: 310, high: 360 },
            decimalPlaces: 0
          },
          {
            display: 'RDW',
            loincCode: '788-0',
            loincDisplay: 'Erythrocyte distribution width [Ratio] by Automated count',
            unit: '%',
            ucumCode: '%',
            referenceRange: { low: 11.0, high: 15.0 },
            decimalPlaces: 1
          }
        ]
      },
      {
        title: 'White Cell Parameters',
        observables: [
          {
            display: 'White cell count',
            loincCode: '6690-2',
            loincDisplay: 'Leukocytes [#/volume] in Blood by Automated count',
            unit: '\u00d710\u2079/L',
            ucumCode: '10*9/L',
            referenceRange: { low: 4.0, high: 11.0 },
            decimalPlaces: 1
          },
          {
            display: 'Neutrophils',
            loincCode: '751-8',
            loincDisplay: 'Neutrophils [#/volume] in Blood by Automated count',
            unit: '\u00d710\u2079/L',
            ucumCode: '10*9/L',
            referenceRange: { low: 2.0, high: 7.5 },
            decimalPlaces: 1
          },
          {
            display: 'Lymphocytes',
            loincCode: '731-0',
            loincDisplay: 'Lymphocytes [#/volume] in Blood by Automated count',
            unit: '\u00d710\u2079/L',
            ucumCode: '10*9/L',
            referenceRange: { low: 1.0, high: 4.0 },
            decimalPlaces: 1
          },
          {
            display: 'Monocytes',
            loincCode: '742-7',
            loincDisplay: 'Monocytes [#/volume] in Blood by Automated count',
            unit: '\u00d710\u2079/L',
            ucumCode: '10*9/L',
            referenceRange: { low: 0.2, high: 1.0 },
            decimalPlaces: 1
          },
          {
            display: 'Eosinophils',
            loincCode: '711-2',
            loincDisplay: 'Eosinophils [#/volume] in Blood by Automated count',
            unit: '\u00d710\u2079/L',
            ucumCode: '10*9/L',
            referenceRange: { low: 0.0, high: 0.5 },
            decimalPlaces: 1
          }
        ]
      },
      {
        title: 'Platelets',
        observables: [
          {
            display: 'Platelet count',
            loincCode: '777-3',
            loincDisplay: 'Platelets [#/volume] in Blood by Automated count',
            unit: '\u00d710\u2079/L',
            ucumCode: '10*9/L',
            referenceRange: { low: 150, high: 400 },
            decimalPlaces: 0
          }
        ]
      }
    ]
  },

  // ── Liver Function Test ───────────────────────────────────────────
  {
    code: '26958001',
    system: 'http://snomed.info/sct',
    display: 'Liver function test',
    displayName: 'LFT',
    superSet: 'General Chemistry',
    headings: [
      {
        title: 'Bilirubin',
        observables: [
          {
            display: 'Total bilirubin',
            loincCode: '1975-2',
            loincDisplay: 'Bilirubin.total [Mass/volume] in Serum or Plasma',
            unit: '\u00b5mol/L',
            ucumCode: 'umol/L',
            referenceRange: { low: 2, high: 20 },
            decimalPlaces: 0
          },
          {
            display: 'Conjugated bilirubin',
            loincCode: '1968-7',
            loincDisplay: 'Bilirubin.direct [Mass/volume] in Serum or Plasma',
            unit: '\u00b5mol/L',
            ucumCode: 'umol/L',
            referenceRange: { low: 0, high: 4 },
            decimalPlaces: 0
          }
        ]
      },
      {
        title: 'Enzymes',
        observables: [
          {
            display: 'ALT',
            loincCode: '1742-6',
            loincDisplay: 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma',
            unit: 'U/L',
            ucumCode: '[IU]/L',
            referenceRange: { low: 0, high: 35 },
            decimalPlaces: 0
          },
          {
            display: 'AST',
            loincCode: '1920-8',
            loincDisplay: 'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma',
            unit: 'U/L',
            ucumCode: '[IU]/L',
            referenceRange: { low: 0, high: 35 },
            decimalPlaces: 0
          },
          {
            display: 'ALP',
            loincCode: '6768-6',
            loincDisplay: 'Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma',
            unit: 'U/L',
            ucumCode: '[IU]/L',
            referenceRange: { low: 30, high: 110 },
            decimalPlaces: 0
          },
          {
            display: 'GGT',
            loincCode: '2324-2',
            loincDisplay: 'Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma',
            unit: 'U/L',
            ucumCode: '[IU]/L',
            referenceRange: { low: 5, high: 50 },
            decimalPlaces: 0
          }
        ]
      },
      {
        title: 'Proteins',
        observables: [
          {
            display: 'Total protein',
            loincCode: '2885-2',
            loincDisplay: 'Protein [Mass/volume] in Serum or Plasma',
            unit: 'g/L',
            ucumCode: 'g/L',
            referenceRange: { low: 60, high: 80 },
            decimalPlaces: 0
          },
          {
            display: 'Albumin',
            loincCode: '61151-7',
            loincDisplay: 'Albumin [Mass/volume] in Serum or Plasma by Bromocresol purple (BCP) dye binding method',
            unit: 'g/L',
            ucumCode: 'g/L',
            referenceRange: { low: 35, high: 50 },
            decimalPlaces: 0
          }
        ]
      }
    ]
  },

  // ── Urea, Electrolytes and Creatinine ─────────────────────────────
  {
    code: '444164000',
    system: 'http://snomed.info/sct',
    display: 'Urea, electrolytes and creatinine measurement',
    displayName: 'UEC',
    superSet: 'General Chemistry',
    headings: [
      {
        title: 'Electrolytes',
        observables: [
          {
            display: 'Sodium',
            loincCode: '2951-2',
            loincDisplay: 'Sodium [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: 135, high: 145 },
            decimalPlaces: 0
          },
          {
            display: 'Potassium',
            loincCode: '6298-4',
            loincDisplay: 'Potassium [Moles/volume] in Blood',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: 3.5, high: 5.2 },
            decimalPlaces: 1
          },
          {
            display: 'Chloride',
            loincCode: '2075-0',
            loincDisplay: 'Chloride [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: 95, high: 110 },
            decimalPlaces: 0
          },
          {
            display: 'Bicarbonate',
            loincCode: '1963-8',
            loincDisplay: 'Bicarbonate [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: 22, high: 32 },
            decimalPlaces: 0
          }
        ]
      },
      {
        title: 'Renal Function',
        observables: [
          {
            display: 'Urea',
            loincCode: '3094-0',
            loincDisplay: 'Urea nitrogen [Mass/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: 2.5, high: 8.0 },
            decimalPlaces: 1
          },
          {
            display: 'Creatinine',
            loincCode: '14682-9',
            loincDisplay: 'Creatinine [Moles/volume] in Serum or Plasma',
            unit: '\u00b5mol/L',
            ucumCode: 'umol/L',
            referenceRange: { low: 45, high: 110 },
            decimalPlaces: 0
          },
          {
            display: 'eGFR',
            loincCode: '98979-8',
            loincDisplay: 'Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI 2021)',
            unit: 'mL/min/1.73m\u00b2',
            ucumCode: 'mL/min/{1.73_m2}',
            referenceRange: { low: 60, high: 120 },
            decimalPlaces: 0
          }
        ]
      }
    ]
  }
];

/**
 * Super Set definitions.
 * Key must match the `superSet` string used in TEST_DEFINITIONS above.
 */
export const SUPER_SETS = {
  'General Chemistry': {
    code: '166312007',
    system: 'http://snomed.info/sct',
    display: 'Blood chemistry',
    displayName: 'General Chemistry'
  }
};

/**
 * Lookup a test definition by SNOMED code.
 * @param {string} snomedCode
 * @returns {Object|undefined}
 */
export function findTestByCode(snomedCode) {
  return TEST_DEFINITIONS.find(t => t.code === snomedCode);
}

/**
 * Get all observables from a test definition as a flat array.
 * @param {Object} testDef
 * @returns {Array}
 */
export function flatObservables(testDef) {
  return testDef.headings.flatMap(h => h.observables);
}
