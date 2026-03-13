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
 * Observables may carry resultType: 'text' for qualitative/narrative results.
 * These render as text inputs and produce FHIR valueString observations.
 * A sampleValue may be provided for use by the autocomplete engine.
 *
 * Source data:
 * - RCPA SPIA Chemical Pathology RS_Feb 2026
 * - RCPA SPIA Haematology Transfusion RS_Feb 2026
 * - RCPA SPIA Blood Gas IM_Dec 2025
 * - RCPA SPIA Microbiology Serology Molecular RS_Dec 2025
 * - RCPA SPIA Cytopathology IM_Dec 2025
 * - RCPA SPIA Immunopathology Terminology RS_Dec 2025
 * - RCPA SPIA Microbiology Urine MCS and Salmonella MCS IM_Dec 2025
 * - RCPA SPIA Chemical Pathology Harmonised Reference Intervals_Dec 2024
 * - RCPA SPIA Requesting Pathology RS_Mar 2026
 * - RCPA Top 50 Priority Tests for SPIA adoption_Dec 2024
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
            loincCode: '1751-7',
            loincDisplay: 'Albumin [Mass/volume] in Serum or Plasma',
            unit: 'g/L',
            ucumCode: 'g/L',
            referenceRange: { low: 35, high: 50 },
            decimalPlaces: 0
          }
        ]
      }
    ]
  },

  // ── Calcium Magnesium Phosphate ───────────────────────────────────
  {
    code: '828431000168100',
    system: 'http://snomed.info/sct',
    display: 'Total serum calcium, magnesium and phosphate measurement',
    displayName: 'CMP',
    superSet: 'General Chemistry',
    headings: [
      {
        title: 'Minerals',
        observables: [
          {
            display: 'Calcium',
            loincCode: '2000-8',
            loincDisplay: 'Calcium [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: 2.10, high: 2.60 },
            decimalPlaces: 2
          },
          {
            display: 'Magnesium',
            loincCode: '2601-3',
            loincDisplay: 'Magnesium [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: 0.70, high: 1.10 },
            decimalPlaces: 2
          },
          {
            display: 'Phosphate',
            loincCode: '14879-1',
            loincDisplay: 'Phosphate [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: 0.75, high: 1.50 },
            decimalPlaces: 2
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
  },

  // ── Lipids (Fasting) ──────────────────────────────────────────────
  {
    code: '252150008',
    system: 'http://snomed.info/sct',
    display: 'Fasting lipid profile',
    displayName: 'Lipids (Fasting)',
    superSet: null,
    headings: [
      {
        title: 'Lipid Profile',
        observables: [
          {
            display: 'Total cholesterol',
            loincCode: '14647-2',
            loincDisplay: 'Cholesterol [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { high: 5.5 },
            decimalPlaces: 1
          },
          {
            display: 'HDL cholesterol',
            loincCode: '14646-4',
            loincDisplay: 'Cholesterol in HDL [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: 1.0 },
            decimalPlaces: 1
          },
          {
            display: 'LDL cholesterol',
            loincCode: '22748-8',
            loincDisplay: 'Cholesterol in LDL [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { high: 3.0 },
            decimalPlaces: 1
          },
          {
            display: 'Non-HDL cholesterol',
            loincCode: '70204-3',
            loincDisplay: 'Cholesterol non HDL [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { high: 4.0 },
            decimalPlaces: 1
          },
          {
            display: 'Chol/HDL ratio',
            loincCode: '32309-7',
            loincDisplay: 'Cholesterol.total/Cholesterol in HDL [Molar ratio] in Serum or Plasma',
            unit: '',
            ucumCode: '1',
            referenceRange: { high: 5.0 },
            decimalPlaces: 1
          },
          {
            display: 'Triglycerides',
            loincCode: '30524-3',
            loincDisplay: 'Triglyceride [Moles/volume] in Serum or Plasma --12 hours fasting',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { high: 2.0 },
            decimalPlaces: 1
          }
        ]
      }
    ]
  },

  // ── Lipids (Random) ───────────────────────────────────────────────
  {
    code: '104780002',
    system: 'http://snomed.info/sct',
    display: 'Lipids measurement',
    displayName: 'Lipids (Random)',
    superSet: null,
    headings: [
      {
        title: 'Lipid Profile',
        observables: [
          {
            display: 'Total cholesterol',
            loincCode: '14647-2',
            loincDisplay: 'Cholesterol [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { high: 5.5 },
            decimalPlaces: 1
          },
          {
            display: 'HDL cholesterol',
            loincCode: '14646-4',
            loincDisplay: 'Cholesterol in HDL [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: 1.0 },
            decimalPlaces: 1
          },
          {
            display: 'LDL cholesterol',
            loincCode: '22748-8',
            loincDisplay: 'Cholesterol in LDL [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { high: 3.0 },
            decimalPlaces: 1
          },
          {
            display: 'Non-HDL cholesterol',
            loincCode: '70204-3',
            loincDisplay: 'Cholesterol non HDL [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { high: 4.0 },
            decimalPlaces: 1
          },
          {
            display: 'Chol/HDL ratio',
            loincCode: '32309-7',
            loincDisplay: 'Cholesterol.total/Cholesterol in HDL [Molar ratio] in Serum or Plasma',
            unit: '',
            ucumCode: '1',
            referenceRange: { high: 5.0 },
            decimalPlaces: 1
          },
          {
            display: 'Triglycerides',
            loincCode: '14927-8',
            loincDisplay: 'Triglyceride [Moles/volume] in Serum or Plasma',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { high: 2.0 },
            decimalPlaces: 1
          }
        ]
      }
    ]
  },

  // ── Thyroid Function Tests ─────────────────────────────────────────
  {
    code: '35650009',
    system: 'http://snomed.info/sct',
    display: 'Thyroid function test',
    displayName: 'TFT',
    superSet: null,
    headings: [
      {
        title: 'Thyroid Function',
        observables: [
          {
            display: 'TSH',
            loincCode: '3016-3',
            loincDisplay: 'Thyrotropin [Units/volume] in Serum or Plasma',
            unit: 'mIU/L',
            ucumCode: 'm[IU]/L',
            referenceRange: { low: 0.4, high: 4.0 },
            decimalPlaces: 2
          },
          {
            display: 'Free T4',
            loincCode: '14920-3',
            loincDisplay: 'Thyroxine (T4) free [Moles/volume] in Serum or Plasma',
            unit: 'pmol/L',
            ucumCode: 'pmol/L',
            referenceRange: { low: 10, high: 20 },
            decimalPlaces: 1
          },
          {
            display: 'Free T3',
            loincCode: '14928-6',
            loincDisplay: 'Triiodothyronine (T3) Free [Moles/volume] in Serum or Plasma',
            unit: 'pmol/L',
            ucumCode: 'pmol/L',
            referenceRange: { low: 3.5, high: 6.5 },
            decimalPlaces: 1
          }
        ]
      }
    ]
  },

  // ── Iron Studies ──────────────────────────────────────────────────
  {
    code: '269820002',
    system: 'http://snomed.info/sct',
    display: 'Serum iron tests',
    displayName: 'Iron Studies',
    superSet: null,
    headings: [
      {
        title: 'Iron Studies',
        observables: [
          {
            display: 'Iron',
            loincCode: '14798-3',
            loincDisplay: 'Iron [Moles/volume] in Serum or Plasma',
            unit: '\u00b5mol/L',
            ucumCode: 'umol/L',
            referenceRange: { low: 10, high: 30 },
            decimalPlaces: 0
          },
          {
            display: 'Ferritin',
            loincCode: '2276-4',
            loincDisplay: 'Ferritin [Mass/volume] in Serum or Plasma',
            unit: '\u00b5g/L',
            ucumCode: 'ug/L',
            referenceRange: { low: 30, high: 300 },
            decimalPlaces: 0
          },
          {
            display: 'Transferrin',
            loincCode: '3034-6',
            loincDisplay: 'Transferrin [Mass/volume] in Serum or Plasma',
            unit: 'g/L',
            ucumCode: 'g/L',
            referenceRange: { low: 2.0, high: 3.6 },
            decimalPlaces: 1
          },
          {
            display: 'Transferrin saturation',
            loincCode: '14801-5',
            loincDisplay: 'Iron saturation [Molar fraction] in Serum or Plasma',
            unit: '%',
            ucumCode: '%',
            referenceRange: { low: 20, high: 45 },
            decimalPlaces: 0
          },
          {
            display: 'TIBC',
            loincCode: '14800-7',
            loincDisplay: 'Iron binding capacity [Moles/volume] in Serum or Plasma',
            unit: '\u00b5mol/L',
            ucumCode: 'umol/L',
            referenceRange: { low: 45, high: 70 },
            decimalPlaces: 0
          }
        ]
      }
    ]
  },

  // ── Blood Gas (Arterial) ──────────────────────────────────────────
  {
    code: '91308007',
    system: 'http://snomed.info/sct',
    display: 'Blood gases, arterial measurement',
    displayName: 'Blood Gas (Art)',
    superSet: null,
    headings: [
      {
        title: 'Acid-Base',
        observables: [
          {
            display: 'pH',
            loincCode: '2744-1',
            loincDisplay: 'pH of Arterial blood',
            unit: '',
            ucumCode: '[pH]',
            referenceRange: { low: 7.35, high: 7.45 },
            decimalPlaces: 2
          },
          {
            display: 'pCO\u2082',
            loincCode: '2019-8',
            loincDisplay: 'Carbon dioxide [Partial pressure] in Arterial blood',
            unit: 'mmHg',
            ucumCode: 'mm[Hg]',
            referenceRange: { low: 35, high: 45 },
            decimalPlaces: 0
          },
          {
            display: 'Bicarbonate',
            loincCode: '1960-4',
            loincDisplay: 'Bicarbonate [Moles/volume] in Arterial blood',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: 22, high: 26 },
            decimalPlaces: 0
          },
          {
            display: 'Base excess',
            loincCode: '1925-7',
            loincDisplay: 'Base excess in Arterial blood by calculation',
            unit: 'mmol/L',
            ucumCode: 'mmol/L',
            referenceRange: { low: -2, high: 2 },
            decimalPlaces: 0
          }
        ]
      },
      {
        title: 'Oxygenation',
        observables: [
          {
            display: 'pO\u2082',
            loincCode: '2703-7',
            loincDisplay: 'Oxygen [Partial pressure] in Arterial blood',
            unit: 'mmHg',
            ucumCode: 'mm[Hg]',
            referenceRange: { low: 80, high: 100 },
            decimalPlaces: 0
          },
          {
            display: 'O\u2082 saturation',
            loincCode: '2708-6',
            loincDisplay: 'Oxygen saturation in Arterial blood',
            unit: '%',
            ucumCode: '%',
            referenceRange: { low: 94, high: 100 },
            decimalPlaces: 0
          }
        ]
      }
    ]
  },

  // ── Antinuclear Antibodies ────────────────────────────────────────
  {
    code: '359788000',
    system: 'http://snomed.info/sct',
    display: 'ANA measurement',
    displayName: 'ANA',
    superSet: null,
    headings: [
      {
        title: 'Antinuclear Antibodies',
        observables: [
          {
            display: 'ANA screen',
            loincCode: '8061-4',
            loincDisplay: 'Nuclear Ab [Presence] in Serum',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'Positive'
          },
          {
            display: 'ANA titre',
            loincCode: '29953-7',
            loincDisplay: 'Nuclear Ab [Titer] in Serum',
            unit: 'titre',
            ucumCode: '{titre}',
            resultType: 'text',
            sampleValue: '1:160'
          },
          {
            display: 'ANA pattern',
            loincCode: '14611-8',
            loincDisplay: 'Nuclear Ab pattern [Interpretation] in Serum',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'Homogeneous'
          }
        ]
      }
    ]
  },

  // ── Hepatitis B Surface Antibody ──────────────────────────────────
  {
    code: '65911000',
    system: 'http://snomed.info/sct',
    display: 'Hepatitis B surface antibody measurement',
    displayName: 'Hepatitis B Ab',
    superSet: null,
    headings: [
      {
        title: 'Hepatitis B Serology',
        observables: [
          {
            display: 'Hepatitis B surface Ab',
            loincCode: '16935-9',
            loincDisplay: 'Hepatitis B virus surface Ab [Units/volume] in Serum',
            unit: 'IU/L',
            ucumCode: '[IU]/L',
            referenceRange: { low: 10 },
            decimalPlaces: 0
          }
        ]
      }
    ]
  },

  // ── Blood Culture ─────────────────────────────────────────────────
  {
    code: '30088009',
    system: 'http://snomed.info/sct',
    display: 'Blood culture',
    displayName: 'Blood Culture',
    superSet: null,
    headings: [
      {
        title: 'Culture',
        observables: [
          {
            display: 'Culture result',
            loincCode: '600-7',
            loincDisplay: 'Bacteria identified in Blood by Culture',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'No growth after 5 days'
          }
        ]
      }
    ]
  },

  // ── MCS Genital ───────────────────────────────────────────────────
  {
    code: '401287001',
    system: 'http://snomed.info/sct',
    display: 'Genital microscopy, culture and sensitivities',
    displayName: 'MCS Genital',
    superSet: null,
    headings: [
      {
        title: 'Microscopy',
        observables: [
          {
            display: 'Gram stain',
            loincCode: '664-3',
            loincDisplay: 'Microscopic observation [Identifier] in Genital specimen by Gram stain',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'No organisms seen on Gram stain'
          }
        ]
      },
      {
        title: 'Culture',
        observables: [
          {
            display: 'Organisms identified',
            loincCode: '634-6',
            loincDisplay: 'Bacteria identified in Genital specimen by Culture',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'No significant growth'
          }
        ]
      }
    ]
  },

  // ── MCS Urine ─────────────────────────────────────────────────────
  {
    code: '401324008',
    system: 'http://snomed.info/sct',
    display: 'Urinary microscopy, culture and sensitivities',
    displayName: 'MCS Urine',
    superSet: null,
    headings: [
      {
        title: 'Microscopy',
        observables: [
          {
            display: 'WBC count',
            loincCode: '30405-5',
            loincDisplay: 'Leukocytes [#/volume] in Urine',
            unit: '\u00d710\u2076/L',
            ucumCode: '10*6/L',
            referenceRange: { low: 0, high: 10 },
            decimalPlaces: 0
          },
          {
            display: 'RBC count',
            loincCode: '30391-7',
            loincDisplay: 'Erythrocytes [#/volume] in Urine',
            unit: '\u00d710\u2076/L',
            ucumCode: '10*6/L',
            referenceRange: { low: 0, high: 5 },
            decimalPlaces: 0
          },
          {
            display: 'Epithelial cells',
            loincCode: '30383-4',
            loincDisplay: 'Epithelial cells [#/volume] in Urine',
            unit: '\u00d710\u2076/L',
            ucumCode: '10*6/L',
            decimalPlaces: 0
          }
        ]
      },
      {
        title: 'Culture',
        observables: [
          {
            display: 'Colony count',
            loincCode: '19090-0',
            loincDisplay: 'Colony count [#/volume] in Urine',
            unit: 'CFU/mL',
            ucumCode: '/mL',
            referenceRange: { high: 100000 },
            decimalPlaces: 0
          },
          {
            display: 'Organisms identified',
            loincCode: '630-4',
            loincDisplay: 'Bacteria identified in Urine by Culture',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'No significant growth'
          }
        ]
      }
    ]
  },

  // ── Blood Group and Antibody Screen ───────────────────────────────
  {
    code: '20099001',
    system: 'http://snomed.info/sct',
    display: 'Blood typing, ABO, Rho(D) and red blood cell antibody screening',
    displayName: 'Blood Group & Ab Screen',
    superSet: null,
    headings: [
      {
        title: 'Blood Group',
        observables: [
          {
            display: 'ABO and Rh group',
            loincCode: '882-1',
            loincDisplay: 'ABO and Rh group [Type] in Blood',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'A Positive'
          }
        ]
      },
      {
        title: 'Antibody Screen',
        observables: [
          {
            display: 'Red cell antibody screen',
            loincCode: '890-4',
            loincDisplay: 'Blood group antibody screen [Presence] in Serum or Plasma',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'Negative'
          }
        ]
      }
    ]
  },

  // ── Coagulation Profile ───────────────────────────────────────────
  {
    code: '3116009',
    system: 'http://snomed.info/sct',
    display: 'Blood coagulation panel',
    displayName: 'Coagulation',
    superSet: null,
    headings: [
      {
        title: 'Coagulation',
        observables: [
          {
            display: 'PT',
            loincCode: '5902-2',
            loincDisplay: 'Prothrombin time (PT)',
            unit: 's',
            ucumCode: 's',
            referenceRange: { low: 12, high: 15 },
            decimalPlaces: 1
          },
          {
            display: 'INR',
            loincCode: '6301-6',
            loincDisplay: 'INR in Platelet poor plasma by Coagulation assay',
            unit: '',
            ucumCode: '1',
            referenceRange: { low: 0.8, high: 1.2 },
            decimalPlaces: 1
          },
          {
            display: 'APTT',
            loincCode: '14979-9',
            loincDisplay: 'aPTT in Platelet poor plasma by Coagulation assay',
            unit: 's',
            ucumCode: 's',
            referenceRange: { low: 25, high: 38 },
            decimalPlaces: 0
          },
          {
            display: 'Fibrinogen',
            loincCode: '3255-7',
            loincDisplay: 'Fibrinogen [Mass/volume] in Platelet poor plasma by Coagulation assay',
            unit: 'g/L',
            ucumCode: 'g/L',
            referenceRange: { low: 2.0, high: 4.0 },
            decimalPlaces: 1
          }
        ]
      }
    ]
  },

  // ── Cervical Co-test ──────────────────────────────────────────────
  {
    code: '1257431000168105',
    system: 'http://snomed.info/sct',
    display: 'Cervical screening test for human papillomavirus and liquid based cytology',
    displayName: 'Cervical Co-test',
    superSet: null,
    headings: [
      {
        title: 'HPV',
        observables: [
          {
            display: 'HPV result',
            loincCode: '77399-4',
            loincDisplay: 'Human papillomavirus DNA [Presence] in Cervix by NAA with probe detection',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'HPV not detected'
          }
        ]
      },
      {
        title: 'Cytology',
        observables: [
          {
            display: 'Cytology result',
            loincCode: '19762-4',
            loincDisplay: 'General categories [Interpretation] of Cervical or vaginal smear by Cyto stain',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'Negative for intraepithelial lesion or malignancy'
          }
        ]
      }
    ]
  },

  // ── Histology ─────────────────────────────────────────────────────
  {
    code: '252416005',
    system: 'http://snomed.info/sct',
    display: 'Histopathology test',
    displayName: 'Histology',
    superSet: null,
    headings: [
      {
        title: 'Histopathology',
        observables: [
          {
            display: 'Macroscopic description',
            loincCode: '22634-0',
            loincDisplay: 'Pathology report gross observation',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'Received in formalin: a segment of sigmoid colon measuring 20 cm in length with a 3 cm polypoid lesion.'
          },
          {
            display: 'Microscopic description',
            loincCode: '22635-7',
            loincDisplay: 'Pathology report microscopic observation',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'Sections show moderately differentiated adenocarcinoma invading through the muscularis propria. Margins clear.'
          },
          {
            display: 'Diagnosis',
            loincCode: '34574-4',
            loincDisplay: 'Pathology report final diagnosis',
            unit: '',
            ucumCode: '',
            resultType: 'text',
            sampleValue: 'Sigmoid colon: Moderately differentiated adenocarcinoma, pT3 N0.'
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
 * Apply provider-specific overrides to the master test definitions.
 *
 * Returns a deep copy of TEST_DEFINITIONS with any matching observables
 * patched from the overrides map. Overrides are keyed by the master LOINC
 * code of the observable to customise; values are partial observable objects
 * whose properties are merged onto the master observable.
 *
 * @param {Object} overrides - Map of masterLoincCode -> partial observable props
 * @returns {Array} Customised copy of TEST_DEFINITIONS
 */
export function applyProviderOverrides(overrides) {
  if (!overrides || Object.keys(overrides).length === 0) {
    return TEST_DEFINITIONS;
  }

  return TEST_DEFINITIONS.map(testDef => ({
    ...testDef,
    headings: testDef.headings.map(heading => ({
      ...heading,
      observables: heading.observables.map(obs => {
        const patch = overrides[obs.loincCode];
        if (!patch) return obs;
        return {
          ...obs,
          ...patch,
          // Deep-merge referenceRange if the patch only overrides one bound
          ...(patch.referenceRange ? {
            referenceRange: { ...obs.referenceRange, ...patch.referenceRange }
          } : {})
        };
      })
    }))
  }));
}

/**
 * Get all observables from a test definition as a flat array.
 * @param {Object} testDef
 * @returns {Array}
 */
export function flatObservables(testDef) {
  return testDef.headings.flatMap(h => h.observables);
}
