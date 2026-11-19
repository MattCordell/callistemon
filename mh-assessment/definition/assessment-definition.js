// MHAOD assessment definition: the single source of truth for tabs, sections,
// fields and terminology bindings. No codes, ECL or displays may appear
// anywhere else in the app.
//
// Schema: SPEC.md section 5.2, plus these optional additions:
//   observable.system  Code system of the observable. Defaults to SNOMED CT.
//   valueSet           Canonical value set URL, for bindings that are not ECL.
//   options            Inline [{ system, code, display }] for local or FHIR-internal codes.
//   columns            Sub-fields of a "repeating-group". Each column has its own binding.
//   role               On a column: what the FHIR extraction does with it. One of
//                      code, clinicalStatus, verificationStatus, rank, dosage, reaction,
//                      relationship, onsetAge, substance, status.
//   min, max           Bounds for integer fields.
//   helper             A short line shown under the field.
//   seedRows           Starting row labels for a repeating group.
//   patientElement     Target element for output "patient".
//   conditionCategory, clinicalStatus, verificationStatus   For output "condition".
//                      clinicalStatus is the default when a row has no status column value.
//                      Also clinicalStatus for output "allergy".
//   encounterRank      On an option: Encounter.diagnosis.rank when that option is chosen.
//   componentCode      The local component code for output "substance-use".
//   info               Field: text for a clinician-facing info pop beside the label.
//   scale              Field: true to group answers into the SCALE_BANDS below
//                      (chips under band labels, dropdowns as option groups).
//   Tab properties:    info (info pop by the tab heading), note (always-visible note at the
//                      top of the tab), sectionInfo { sectionName: always-visible note }.
//
// All bindings are placeholders from SPEC.md Appendix B (checked 18 Nov 2026).
// ECL is copied exactly from Appendix B.

const LOINC = 'http://loinc.org';
// Placeholder system for local codes until real ones are agreed.
const LOCAL = 'https://callistemon.site/fhir/CodeSystem/mh-assessment';
const V3_ROLE = 'http://terminology.hl7.org/CodeSystem/v3-RoleCode';
const COND_CLINICAL = 'http://terminology.hl7.org/CodeSystem/condition-clinical';
const COND_VER = 'http://terminology.hl7.org/CodeSystem/condition-ver-status';
const COND_CAT = 'http://terminology.hl7.org/CodeSystem/condition-category';
const ALLERGY_VER = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification';
const ALLERGY_CLINICAL = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical';

const CLINICAL_ACTIVE = { system: COND_CLINICAL, code: 'active', display: 'Active' };
const CLINICAL_INACTIVE = { system: COND_CLINICAL, code: 'inactive', display: 'Inactive' };

// Shared ECL, kept identical where Appendix B says "same binding as".
const ECL_MOOD = '(< 106131003 |Mood finding| MINUS << 64572001 |Disease|) MINUS (<< 416383008 |Disturbance in affect| OR 80608005 |Appropriate affect|)';
const ECL_CONCENTRATION = '< 365759009 |Finding related to ability to concentrate|';
const ECL_MENTAL_DISORDER = '<< 74732009 |Mental disorder|';
const ECL_MEDICINES = '^ 929360071000036103 |Medicinal product unit of use reference set|';

const IMPACT_OPTIONS = [
  { system: LOCAL, code: 'none', display: 'None' },
  { system: LOCAL, code: 'mild', display: 'Mild' },
  { system: LOCAL, code: 'moderate', display: 'Moderate' },
  { system: LOCAL, code: 'severe', display: 'Severe' }
];

export const DEFINITION = {
  id: 'mhaod-assessment',
  title: 'Mental health assessment',

  tabs: [
    { id: 'context', label: 'Context' },
    { id: 'presenting-complaint', label: 'Presenting complaint' },
    { id: 'symptoms', label: 'Symptoms' },
    { id: 'neurovegetative', label: 'Neurovegetative' },
    {
      id: 'risk', label: 'Risk',
      note: 'This tab is a recording aid only. It is not a risk assessment tool.'
    },
    {
      id: 'stressors', label: 'Stressors and impact',
      sectionInfo: {
        'Outcome measures': 'HoNOS is a licensed instrument. Only the total score is recorded here; item content is not reproduced.'
      }
    },
    { id: 'past-history', label: 'Past history' },
    { id: 'substance-use', label: 'Substance use' },
    { id: 'family-forensic', label: 'Family and forensic' },
    { id: 'personal-history', label: 'Personal history' },
    {
      id: 'mental-state', label: 'Mental state',
      sectionInfo: {
        'MMSE': 'The MMSE is a licensed instrument. Only domain subscores and the total are recorded here; item content is not reproduced.'
      }
    },
    {
      id: 'diagnosis', label: 'Diagnosis',
      info: 'DSM-5 (2013) removed the multiaxial system. Diagnoses are recorded as principal, additional or differential. Content formerly on Axes III to V is captured in Past history, Stressors and impact, and the outcome measures.'
    },
    { id: 'review', label: 'Review and submit' }
  ],

  // QuestionnaireResponse.questionnaire. Placeholder canonical until FR-12
  // generates the Questionnaire (session 4), which will use the same URL.
  questionnaireUrl: 'https://callistemon.site/fhir/Questionnaire/mhaod-assessment',

  // FR-2: Encounter class. Default AMB, selectable from v3 ActEncounterCode.
  encounter: {
    classValueSet: 'http://terminology.hl7.org/ValueSet/v3-ActEncounterCode',
    classDefault: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' }
  },

  fields: [
    // ---------------------------------------------------------------- 1 Context
    {
      id: 'ctx-given-name', tab: 'context', section: 'Patient',
      label: 'Given name', control: 'text', cardinality: 'single',
      output: 'patient', patientElement: 'name.given', status: 'placeholder'
    },
    {
      id: 'ctx-family-name', tab: 'context', section: 'Patient',
      label: 'Family name', control: 'text', cardinality: 'single',
      output: 'patient', patientElement: 'name.family', status: 'placeholder'
    },
    {
      id: 'ctx-birth-date', tab: 'context', section: 'Patient',
      label: 'Date of birth', control: 'date', cardinality: 'single',
      output: 'patient', patientElement: 'birthDate', status: 'placeholder'
    },
    {
      id: 'ctx-gender', tab: 'context', section: 'Patient',
      label: 'Administrative gender',
      valueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender',
      control: 'select', cardinality: 'single',
      output: 'patient', patientElement: 'gender',
      aucdi: 'Sex and gender summary', status: 'placeholder'
    },
    {
      id: 'ctx-marital-status', tab: 'context', section: 'Patient',
      label: 'Marital status',
      valueSet: 'http://hl7.org/fhir/ValueSet/marital-status',
      control: 'select', cardinality: 'single',
      output: 'patient', patientElement: 'maritalStatus', status: 'placeholder',
      info: 'These are the FHIR (HL7 v3) marital status codes. National reporting uses the METEOR "Person - marital status" codes, so a mapping would be needed. The mapping is not implemented in this demonstrator.',
      notes: 'FHIR v3 MaritalStatus. National reporting uses METEOR "Person - marital status" codes; a mapping would be needed (not implemented).'
    },
    {
      id: 'ctx-legal-status', tab: 'context', section: 'Legal status',
      label: 'Mental health legal status',
      observable: null,
      options: [
        { system: LOCAL, code: 'voluntary', display: 'Voluntary' },
        { system: LOCAL, code: 'involuntary', display: 'Involuntary' }
      ],
      control: 'select', cardinality: 'single',
      output: 'observation-qa', category: 'survey', status: 'placeholder',
      notes: 'Local CodeSystem. Values to be confirmed against METEOR "mental health legal status". Observable TBC. Category TBC.'
    },
    {
      id: 'ctx-care-responsibilities', tab: 'context', section: 'Care responsibilities and dependants',
      label: 'Care responsibilities and dependants', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'ctx-employment', tab: 'context', section: 'Employment',
      label: 'Employment', control: 'textarea', cardinality: 'single',
      output: 'qr-only', aucdi: 'Occupation summary', status: 'placeholder'
    },

    // ---------------------------------------------------- 2 Presenting complaint
    {
      id: 'pc-complaint', tab: 'presenting-complaint', section: 'Presenting complaint',
      label: 'Presenting complaint', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder',
      helper: "Record in the consumer's own words. This field is intentionally not coded.",
      notes: 'Never coded: coding would impose an interpretation (FR-8).'
    },
    {
      id: 'pc-hpc', tab: 'presenting-complaint', section: 'History of presenting complaint',
      label: 'History of presenting complaint', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'pc-previous-treatment', tab: 'presenting-complaint', section: 'Previous treatment',
      label: 'Previous treatment', control: 'textarea', cardinality: 'single',
      output: 'qr-only', aucdi: 'Psychosocial therapy', status: 'placeholder'
    },

    // -------------------------------------------------------------- 3 Symptoms
    {
      id: 'sx-psychotic', tab: 'symptoms', section: 'Psychotic symptoms',
      observable: { code: '363895008', display: 'Psychotic symptom' },
      ecl: '< 279315008 |Psychotic symptom finding|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'survey', status: 'placeholder'
    },
    {
      id: 'sx-mood', tab: 'symptoms', section: 'Mood symptoms',
      observable: { code: '1155968006', display: 'Mood' },
      ecl: ECL_MOOD,
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'survey', status: 'placeholder',
      notes: 'About 291 concepts; typeahead. The Disease exclusion removes about 414 disorders (major depression, bipolar, panic disorder and so on). About 50 fear and phobia concepts remain. Diurnal variation of mood (247800004) is already a descendant, via Stability of mood.'
    },
    {
      id: 'sx-anxiety', tab: 'symptoms', section: 'Anxiety symptoms',
      observable: { code: '405051006', display: 'Level of anxiety' },
      ecl: '<< 48694002 |Anxiety|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'survey', status: 'placeholder'
    },

    // ------------------------------------------------------- 4 Neurovegetative
    {
      id: 'nv-sleep', tab: 'neurovegetative', section: 'Neurovegetative disturbance',
      observable: { code: '258158006', display: 'Sleep' },
      ecl: '< 106168000 |Finding related to sleep| MINUS << 64572001 |Disease|',
      control: 'auto', cardinality: 'multiple', scale: true,
      output: 'observation-qa', category: 'survey', status: 'placeholder',
      notes: 'Multiple select. Includes Early morning waking (401236004).'
    },
    {
      id: 'nv-appetite', tab: 'neurovegetative', section: 'Neurovegetative disturbance',
      observable: { code: '364663004', display: 'Appetite observable' },
      ecl: '< 289161009 |Finding of appetite|',
      control: 'auto', cardinality: 'single', scale: true,
      output: 'observation-qa', category: 'survey', status: 'placeholder'
    },
    {
      id: 'nv-weight', tab: 'neurovegetative', section: 'Neurovegetative disturbance',
      observable: { code: '248346009', display: 'Weight change' },
      ecl: '< 365921005 |Weight change finding|',
      control: 'auto', cardinality: 'single', scale: true,
      output: 'observation-qa', category: 'survey', status: 'placeholder'
    },
    {
      id: 'nv-concentration', tab: 'neurovegetative', section: 'Neurovegetative disturbance',
      observable: { code: '247760006', display: 'Ability to concentrate' },
      ecl: ECL_CONCENTRATION,
      control: 'auto', cardinality: 'single', scale: true,
      output: 'observation-qa', category: 'survey', status: 'placeholder',
      notes: 'Includes Normal concentration.'
    },
    {
      id: 'nv-energy', tab: 'neurovegetative', section: 'Neurovegetative disturbance',
      observable: { code: '406202006', display: 'Energy observable' },
      ecl: '< 301325005 |Finding of general energy|',
      control: 'auto', cardinality: 'single', scale: true,
      output: 'observation-qa', category: 'survey', status: 'placeholder',
      notes: 'Three "Able to ... energy" concepts may warrant a MINUS.'
    },
    {
      id: 'nv-anhedonia', tab: 'neurovegetative', section: 'Neurovegetative disturbance',
      label: 'Anhedonia',
      observable: { code: '285854004', display: 'Emotion' },
      ecl: '<< 28669007 |Anhedonia| OR << 247796005 |Loss of capacity for enjoyment| OR << 430641005 |Markedly diminished pleasure|',
      control: 'auto', cardinality: 'single', scale: true,
      output: 'observation-qa', category: 'survey', status: 'placeholder',
      notes: 'No specific observable and no normal concept found. Label set explicitly because the observable PT is "Emotion".'
    },
    {
      id: 'nv-libido', tab: 'neurovegetative', section: 'Neurovegetative disturbance',
      observable: { code: '248095000', display: 'Libido' },
      ecl: '< 365965002 |Libido - finding|',
      control: 'auto', cardinality: 'single', scale: true,
      output: 'observation-qa', category: 'survey', status: 'placeholder'
    },

    // ------------------------------------------------------------------ 5 Risk
    {
      id: 'risk-ideation', tab: 'risk', section: 'Suicidal ideation',
      label: 'Suicidal ideation',
      observable: { code: '3161000175102', display: 'Suicide risk' },
      ecl: '<< 6471006 |Suicidal thoughts| OR << 225457007 |Feeling suicidal|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'survey', status: 'placeholder',
      notes: 'Multiple select. Label set explicitly: the observable AU PT is "Suicide risk", which would read as a risk rating field.'
    },
    {
      id: 'risk-dsh-history', tab: 'risk', section: 'Deliberate self-harm',
      label: 'History of deliberate self-harm',
      observable: null,
      ecl: '<< 314550003 |H/O: deliberate self harm|',
      control: 'boolean', cardinality: 'single',
      output: 'observation-qa', category: 'survey', status: 'placeholder',
      notes: 'Observable TBC (none identified). Boolean control: ticking records the concept.'
    },
    {
      id: 'risk-notes', tab: 'risk', section: 'Notes',
      label: 'Risk notes', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },

    // -------------------------------------------------- 6 Stressors and impact
    {
      id: 'st-stressors', tab: 'stressors', section: 'Stressors',
      label: 'Stressors',
      observable: { code: '364706004', display: 'Life event observable' },
      ecl: '< 365574009 |Life event finding|',
      control: 'typeahead', cardinality: 'multiple',
      output: 'observation-qa', category: 'social-history', status: 'placeholder',
      notes: 'Typeahead. Likely incomplete: stressor content is scattered across hierarchies.'
    },
    {
      id: 'st-impact-self', tab: 'stressors', section: 'Impact',
      label: 'Impact on self', options: IMPACT_OPTIONS,
      control: 'select', cardinality: 'single', output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'st-impact-family', tab: 'stressors', section: 'Impact',
      label: 'Impact on family', options: IMPACT_OPTIONS,
      control: 'select', cardinality: 'single', output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'st-impact-work', tab: 'stressors', section: 'Impact',
      label: 'Impact on work or school', options: IMPACT_OPTIONS,
      control: 'select', cardinality: 'single', output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'st-impact-social', tab: 'stressors', section: 'Impact',
      label: 'Social impact', options: IMPACT_OPTIONS,
      control: 'select', cardinality: 'single', output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'st-honos-total', tab: 'stressors', section: 'Outcome measures',
      label: 'HoNOS total score',
      observable: { system: LOCAL, code: 'honos-total', display: 'HoNOS total score' },
      control: 'integer', cardinality: 'single', min: 0, max: 48,
      output: 'observation-score', category: 'survey', status: 'placeholder',
      notes: 'Local code. No SNOMED observable found, and no LOINC code found on this server. Score only; item content is licensed and not reproduced.'
    },

    // ---------------------------------------------------------- 7 Past history
    {
      id: 'ph-psych-history', tab: 'past-history', section: 'Past psychiatric history',
      label: 'Past psychiatric diagnoses',
      control: 'repeating-group', cardinality: 'multiple',
      output: 'condition', conditionCategory: { system: COND_CAT, code: 'problem-list-item' },
      // Used when a row has no clinical status chosen.
      clinicalStatus: CLINICAL_INACTIVE,
      aucdi: 'Problem/Diagnosis summary', status: 'placeholder',
      columns: [
        {
          id: 'ph-psych-dx', role: 'code', label: 'Diagnosis',
          ecl: ECL_MENTAL_DISORDER,
          control: 'typeahead', cardinality: 'single', status: 'placeholder',
          notes: 'The AU preferred term of 74732009 is "Mental illness", a nice demonstration of AU preferred terms.'
        },
        {
          id: 'ph-psych-dx-status', role: 'clinicalStatus', label: 'Clinical status',
          options: [
            { system: COND_CLINICAL, code: 'inactive', display: 'Inactive' },
            { system: COND_CLINICAL, code: 'resolved', display: 'Resolved' }
          ],
          control: 'select', cardinality: 'single', status: 'placeholder'
        }
      ]
    },
    {
      id: 'ph-admissions', tab: 'past-history', section: 'Past psychiatric history',
      label: 'Admissions', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'ph-mha-history', tab: 'past-history', section: 'Past psychiatric history',
      label: 'Previously treated under the Mental Health Act', control: 'boolean', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'ph-mha-details', tab: 'past-history', section: 'Past psychiatric history',
      label: 'Mental Health Act history details', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'ph-psychiatrists', tab: 'past-history', section: 'Past psychiatric history',
      label: 'Treating psychiatrists', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'ph-pmhx', tab: 'past-history', section: 'Past medical history',
      label: 'Past medical history',
      ecl: '< 404684003 |Clinical finding|',
      control: 'typeahead', cardinality: 'multiple',
      output: 'condition', conditionCategory: { system: COND_CAT, code: 'problem-list-item' },
      clinicalStatus: CLINICAL_ACTIVE,
      aucdi: 'Problem/Diagnosis summary', status: 'placeholder',
      notes: 'Typeahead. Coded picker is a SHOULD. Extracted with clinical status Active (default; no status picker).'
    },
    {
      id: 'ph-medication-list', tab: 'past-history', section: 'Current medications',
      label: 'Current medications',
      control: 'repeating-group', cardinality: 'multiple',
      output: 'medication-statement', aucdi: 'Medication use statement', status: 'placeholder',
      columns: [
        {
          id: 'ph-medications', role: 'code', label: 'Medication',
          ecl: ECL_MEDICINES,
          control: 'typeahead', cardinality: 'single', status: 'placeholder',
          notes: 'Matt to confirm the AMT scope (for example whether to add the MP or TPUU reference sets).'
        },
        {
          id: 'ph-medication-dosage', role: 'dosage', label: 'Dosage',
          control: 'text', cardinality: 'single', status: 'placeholder'
        }
      ]
    },
    {
      id: 'ph-allergy-list', tab: 'past-history', section: 'Allergies',
      label: 'Allergies and adverse reactions',
      control: 'repeating-group', cardinality: 'multiple',
      output: 'allergy', aucdi: 'Adverse reaction risk summary', status: 'placeholder',
      clinicalStatus: { system: ALLERGY_CLINICAL, code: 'active', display: 'Active' },
      columns: [
        {
          id: 'ph-allergies', role: 'code', label: 'Substance',
          ecl: '< 105590001 |Substance| OR ' + ECL_MEDICINES,
          control: 'typeahead', cardinality: 'single', status: 'placeholder',
          notes: 'Alternative: the NCTS Adverse Reaction Agent value set, if it is available on the terminology server.'
        },
        {
          id: 'ph-allergy-verification', role: 'verificationStatus', label: 'Verification',
          options: [
            { system: ALLERGY_VER, code: 'unconfirmed', display: 'Unconfirmed' },
            { system: ALLERGY_VER, code: 'confirmed', display: 'Confirmed' }
          ],
          control: 'select', cardinality: 'single', status: 'placeholder'
        },
        {
          id: 'ph-allergy-reaction', role: 'reaction', label: 'Reaction',
          ecl: '^ 142341000036103 |Clinical manifestation reference set|',
          control: 'typeahead', cardinality: 'single', status: 'placeholder'
        }
      ]
    },

    // --------------------------------------------------------- 8 Substance use
    {
      id: 'su-tobacco', tab: 'substance-use', section: 'Tobacco',
      label: 'Tobacco smoking status',
      observable: { system: LOINC, code: '72166-2', display: 'Tobacco smoking status' },
      valueSet: 'https://healthterminologies.gov.au/fhir/ValueSet/smoking-status-1',
      control: 'auto', cardinality: 'single',
      output: 'smoking-status', category: 'social-history',
      aucdi: 'Tobacco smoking summary', status: 'placeholder',
      notes: 'NCTS Smoking Status value set, as bound by AU Core Smoking Status. Matt to confirm.'
    },
    {
      id: 'su-alcohol', tab: 'substance-use', section: 'Alcohol',
      label: 'Alcohol consumption status',
      observable: null,
      ecl: '783261004 |Lifetime non-drinker| OR 219006 |Current drinker| OR 82581004 |Former drinker|',
      control: 'auto', cardinality: 'single',
      output: 'observation-qa', category: 'social-history',
      aucdi: 'Alcohol consumption summary', status: 'placeholder',
      notes: 'Observable TBC. Values are AUCDI R3 proposed set, written here as an ECL disjunction.'
    },
    {
      id: 'su-substance', tab: 'substance-use', section: 'Other substances',
      label: 'Other substances',
      observable: { code: '363908000', display: 'Details of drug misuse behavior' },
      componentCode: { system: LOCAL, code: 'substance', display: 'Substance' },
      control: 'repeating-group', cardinality: 'multiple',
      output: 'substance-use', category: 'social-history',
      aucdi: 'Substance use summary', status: 'placeholder',
      seedRows: ['Cannabis', 'Amphetamines', 'MDMA', 'Heroin', 'LSD', 'Cocaine'],
      notes: '"Misuse" wording is not neutral; flag for review. Seed row codes to be supplied by Matt.',
      columns: [
        {
          id: 'su-substance-substance', role: 'substance', label: 'Substance',
          ecl: '< 105590001 |Substance|',
          control: 'typeahead', cardinality: 'single', status: 'placeholder'
        },
        {
          id: 'su-substance-status', role: 'status', label: 'Use status',
          ecl: '417284009 |Current substance user| OR 44870007 |Former substance user|',
          control: 'auto', cardinality: 'single', status: 'placeholder',
          notes: '"Never used" concept TBC. Written here as an ECL disjunction of the Appendix B codes.'
        }
      ]
    },
    {
      id: 'su-idu-consequences', tab: 'substance-use', section: 'Injecting drug use',
      label: 'Consequences of injecting drug use', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },

    // --------------------------------------------------- 9 Family and forensic
    {
      id: 'fh-history', tab: 'family-forensic', section: 'Family psychiatric history',
      label: 'Family psychiatric history',
      control: 'repeating-group', cardinality: 'multiple',
      output: 'family-history', status: 'placeholder',
      columns: [
        {
          id: 'fh-relationship', role: 'relationship', label: 'Relationship',
          options: [
            { system: V3_ROLE, code: 'MTH', display: 'mother' },
            { system: V3_ROLE, code: 'FTH', display: 'father' },
            { system: V3_ROLE, code: 'SIB', display: 'sibling' },
            { system: V3_ROLE, code: 'SON', display: 'natural son' },
            { system: V3_ROLE, code: 'DAU', display: 'natural daughter' },
            { system: V3_ROLE, code: 'GRMTH', display: 'grandmother' },
            { system: V3_ROLE, code: 'GRFTH', display: 'grandfather' },
            { system: V3_ROLE, code: 'AUNT', display: 'aunt' },
            { system: V3_ROLE, code: 'UNCLE', display: 'uncle' }
          ],
          control: 'select', cardinality: 'single', status: 'placeholder',
          notes: 'v3 RoleCode examples from SPEC.md 7.3. The full v3 FamilyMember value set has about 105 codes.'
        },
        {
          id: 'fh-condition', role: 'code', label: 'Condition',
          ecl: ECL_MENTAL_DISORDER,
          control: 'typeahead', cardinality: 'single', status: 'placeholder'
        },
        {
          id: 'fh-onset-age', role: 'onsetAge', label: 'Age at onset (years)',
          control: 'integer', cardinality: 'single', min: 0, max: 120, status: 'placeholder'
        }
      ]
    },
    {
      id: 'fx-charges', tab: 'family-forensic', section: 'Forensic history',
      label: 'Charges', control: 'textarea', cardinality: 'single',
      output: 'qr-only', sensitive: true, status: 'placeholder'
    },
    {
      id: 'fx-incarceration', tab: 'family-forensic', section: 'Forensic history',
      label: 'Incarceration', control: 'textarea', cardinality: 'single',
      output: 'qr-only', sensitive: true, status: 'placeholder'
    },
    {
      id: 'fx-domestic-violence', tab: 'family-forensic', section: 'Forensic history',
      label: 'Domestic violence', control: 'textarea', cardinality: 'single',
      output: 'qr-only', sensitive: true, status: 'placeholder'
    },

    // ----------------------------------------------------- 10 Personal history
    {
      id: 'pers-early-development', tab: 'personal-history', section: 'Early development',
      label: 'Early development', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'pers-family-relationships', tab: 'personal-history', section: 'Family relationships',
      label: 'Family relationships', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'pers-childhood-education', tab: 'personal-history', section: 'Childhood and education',
      label: 'Childhood and education', control: 'textarea', cardinality: 'single',
      output: 'qr-only', aucdi: 'Education summary', status: 'placeholder'
    },
    {
      id: 'pers-social-supports', tab: 'personal-history', section: 'Social supports',
      label: 'Social supports', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'pers-employment-history', tab: 'personal-history', section: 'Employment history',
      label: 'Employment history', control: 'textarea', cardinality: 'single',
      output: 'qr-only', aucdi: 'Occupation summary', status: 'placeholder'
    },
    {
      id: 'pers-housing', tab: 'personal-history', section: 'Social circumstances',
      label: 'Housing', control: 'textarea', cardinality: 'single',
      output: 'qr-only', aucdi: 'Housing summary', status: 'placeholder'
    },
    {
      id: 'pers-living-arrangements', tab: 'personal-history', section: 'Social circumstances',
      label: 'Living arrangements', control: 'textarea', cardinality: 'single',
      output: 'qr-only', aucdi: 'Living arrangement summary', status: 'placeholder'
    },
    {
      id: 'pers-finances', tab: 'personal-history', section: 'Social circumstances',
      label: 'Finances', control: 'textarea', cardinality: 'single',
      output: 'qr-only', aucdi: 'Financial summary', status: 'placeholder'
    },
    {
      id: 'pers-adls', tab: 'personal-history', section: 'Social circumstances',
      label: 'Activities of daily living', control: 'textarea', cardinality: 'single',
      output: 'qr-only', aucdi: 'Functional ability', status: 'placeholder'
    },
    {
      id: 'pers-psychosexual', tab: 'personal-history', section: 'Psychosexual history',
      label: 'Psychosexual history', control: 'textarea', cardinality: 'single',
      output: 'qr-only', sensitive: true, status: 'placeholder'
    },
    {
      id: 'pers-trauma', tab: 'personal-history', section: 'Trauma and abuse',
      label: 'Trauma and abuse history', control: 'textarea', cardinality: 'single',
      output: 'qr-only', sensitive: true, status: 'placeholder'
    },
    {
      id: 'pers-premorbid-personality', tab: 'personal-history', section: 'Premorbid personality',
      label: 'Premorbid personality', control: 'textarea', cardinality: 'single',
      output: 'qr-only', status: 'placeholder'
    },

    // ---------------------------------------------------------- 11 Mental state
    {
      id: 'mse-appearance', tab: 'mental-state', section: 'Appearance and behaviour',
      observable: { code: '703248002', display: 'Appearance' },
      ecl: '< 301305006 |Finding of general observation of appearance|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder'
    },
    {
      id: 'mse-behaviour', tab: 'mental-state', section: 'Appearance and behaviour',
      observable: { code: '363896009', display: 'Behavior observable' },
      ecl: '< 844005 |Behaviour finding|',
      control: 'typeahead', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder',
      notes: 'Far too broad (includes substance use and sleep behaviour). Typeahead until refined.'
    },
    {
      id: 'mse-speech', tab: 'mental-state', section: 'Speech',
      observable: { code: '363918005', display: 'Speech observable' },
      ecl: '< 106132005 |Speech finding|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder'
    },
    {
      id: 'mse-mood', tab: 'mental-state', section: 'Mood and affect',
      observable: { code: '1155968006', display: 'Mood' },
      ecl: ECL_MOOD,
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder',
      notes: 'Same binding as sx-mood. The affect MINUS keeps mood and affect disjoint, pending clinician feedback.'
    },
    {
      id: 'mse-affect', tab: 'mental-state', section: 'Mood and affect',
      observable: { code: '4065008', display: 'Affect' },
      ecl: '<< 416383008 |Disturbance in affect| OR 80608005 |Appropriate affect|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder',
      notes: '10 concepts. Affect findings are scattered in the hierarchy.'
    },
    {
      id: 'mse-thought-form', tab: 'mental-state', section: 'Thought',
      observable: { code: '247642000', display: 'Thought process' },
      ecl: '< 365252004 |Thought process - finding|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder'
    },
    {
      id: 'mse-thought-content', tab: 'mental-state', section: 'Thought',
      observable: { code: '363877005', display: 'Thought content' },
      ecl: '< 83507006 |Finding of thought content|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder'
    },
    {
      id: 'mse-perception', tab: 'mental-state', section: 'Perception',
      observable: { code: '81742003', display: 'Perception' },
      ecl: '< 247699008 |Psychological finding of perception|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder'
    },
    {
      id: 'mse-orientation', tab: 'mental-state', section: 'Cognition',
      observable: { code: '43173001', display: 'Orientation' },
      ecl: '< 311470005 |Finding related to orientation|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder',
      notes: '21 concepts.'
    },
    {
      id: 'mse-memory', tab: 'mental-state', section: 'Cognition',
      observable: { code: '363888004', display: 'Memory performance' },
      ecl: '< 106136008 |Memory finding|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder'
    },
    {
      id: 'mse-attention', tab: 'mental-state', section: 'Cognition',
      label: 'Attention and concentration',
      observable: { code: '247760006', display: 'Ability to concentrate' },
      ecl: ECL_CONCENTRATION,
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder',
      notes: 'Same binding as nv-concentration.'
    },
    {
      id: 'mse-insight', tab: 'mental-state', section: 'Insight and judgement',
      observable: { code: '27026000', display: 'Insight' },
      ecl: '<< 12200008 |Impaired insight| OR 710031000220100 |Partial insight|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder',
      notes: 'No "good insight" finding exists.'
    },
    {
      id: 'mse-judgement', tab: 'mental-state', section: 'Insight and judgement',
      observable: { code: '61254005', display: 'Judgement' },
      ecl: '< 365837000 |Judgement - finding|',
      control: 'auto', cardinality: 'multiple',
      output: 'observation-qa', category: 'exam', status: 'placeholder',
      notes: 'Observable status of 61254005 not verified; Binding Review will check it.'
    },
    // MMSE: scores only. Item wording is licensed and not reproduced.
    {
      id: 'mse-mmse-orientation-time', tab: 'mental-state', section: 'MMSE',
      label: 'Orientation to time', control: 'integer', cardinality: 'single', min: 0, max: 5,
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'mse-mmse-orientation-place', tab: 'mental-state', section: 'MMSE',
      label: 'Orientation to place', control: 'integer', cardinality: 'single', min: 0, max: 5,
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'mse-mmse-registration', tab: 'mental-state', section: 'MMSE',
      label: 'Registration', control: 'integer', cardinality: 'single', min: 0, max: 3,
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'mse-mmse-attention', tab: 'mental-state', section: 'MMSE',
      label: 'Attention and calculation', control: 'integer', cardinality: 'single', min: 0, max: 5,
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'mse-mmse-recall', tab: 'mental-state', section: 'MMSE',
      label: 'Recall', control: 'integer', cardinality: 'single', min: 0, max: 3,
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'mse-mmse-language', tab: 'mental-state', section: 'MMSE',
      label: 'Language', control: 'integer', cardinality: 'single', min: 0, max: 8,
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'mse-mmse-copying', tab: 'mental-state', section: 'MMSE',
      label: 'Copying', control: 'integer', cardinality: 'single', min: 0, max: 1,
      output: 'qr-only', status: 'placeholder'
    },
    {
      id: 'mse-mmse-total', tab: 'mental-state', section: 'MMSE',
      observable: { code: '447316007', display: 'Mini-mental state examination score' },
      control: 'integer', cardinality: 'single', min: 0, max: 30,
      output: 'observation-score', category: 'survey', status: 'placeholder',
      notes: 'Integer, 0 to 30.'
    },

    // ------------------------------------------------------------- 12 Diagnosis
    {
      id: 'dx-diagnoses', tab: 'diagnosis', section: 'Diagnoses',
      label: 'Diagnoses',
      control: 'repeating-group', cardinality: 'multiple',
      output: 'condition', conditionCategory: { system: COND_CAT, code: 'encounter-diagnosis' },
      clinicalStatus: CLINICAL_ACTIVE,
      aucdi: 'Problem/Diagnosis summary', status: 'placeholder',
      columns: [
        {
          id: 'dx-diagnosis', role: 'code', label: 'Diagnosis',
          ecl: ECL_MENTAL_DISORDER,
          control: 'typeahead', cardinality: 'single', status: 'placeholder',
          notes: 'The AU preferred term is "Mental illness", a nice demonstration of AU preferred terms.'
        },
        {
          id: 'dx-diagnosis-rank', role: 'rank', label: 'Principal or additional',
          options: [
            // encounterRank: Encounter.diagnosis.rank for this choice.
            { system: LOCAL, code: 'principal', display: 'Principal', encounterRank: 1 },
            { system: LOCAL, code: 'additional', display: 'Additional', encounterRank: 2 }
          ],
          control: 'select', cardinality: 'single', status: 'placeholder'
        },
        {
          id: 'dx-diagnosis-verification', role: 'verificationStatus', label: 'Verification',
          options: [
            { system: COND_VER, code: 'confirmed', display: 'Confirmed' },
            { system: COND_VER, code: 'provisional', display: 'Provisional' }
          ],
          control: 'select', cardinality: 'single', status: 'placeholder'
        }
      ]
    },
    {
      id: 'dx-differential', tab: 'diagnosis', section: 'Differential diagnoses',
      label: 'Differential diagnoses',
      ecl: ECL_MENTAL_DISORDER,
      control: 'typeahead', cardinality: 'multiple',
      output: 'condition', conditionCategory: { system: COND_CAT, code: 'encounter-diagnosis' },
      clinicalStatus: CLINICAL_ACTIVE,
      verificationStatus: { system: COND_VER, code: 'differential', display: 'Differential' },
      aucdi: 'Problem/Diagnosis summary', status: 'placeholder'
    }
  ]
};

// Bands for fields with `scale: true` (SPEC.md section 8: make "high and low"
// visible). Each answer's AU preferred term is matched against the words below,
// at the start of a word and ignoring case. Bands are tried in this order and
// the first match wins; unmatched answers go to "Other". Reduced and Increased
// are tried before Normal so terms such as "Abnormal weight loss" are not read
// as normal. Display order is Reduced, Normal, Increased, Other.
export const SCALE_BANDS = [
  {
    id: 'reduced', label: 'Reduced',
    words: ['reduced', 'decrease', 'loss', 'lack', 'low', 'poor', 'impaired', 'unable', 'inhibited',
      'diminished', 'no interest', 'cannot', 'lethargy']
  },
  {
    id: 'increased', label: 'Increased',
    words: ['increased', 'excess', 'hyper', 'gain', 'always', 'morbid']
  },
  {
    id: 'normal', label: 'Normal',
    words: ['normal', 'able to', 'appropriate']
  }
];
export const SCALE_DISPLAY_ORDER = ['reduced', 'normal', 'increased', 'other'];
export const SCALE_OTHER_LABEL = 'Other';

// ECL used by the Binding Review checks (FR-6), kept here so no ECL lives in code.
export const REVIEW_CHECKS = {
  observableEcl: '< 363787002 |Observable entity|',
  // Codes in this system are local placeholders and cannot be looked up.
  localSystem: LOCAL
};

// FHIR code systems and units the FHIR layer writes (SPEC.md section 7).
// Kept here so no code system or code appears in the app code.
export const FHIR_CODES = {
  observationCategory: 'http://terminology.hl7.org/CodeSystem/observation-category',
  // FamilyMemberHistory.condition.onsetAge, in years.
  ageYears: { system: 'http://unitsofmeasure.org', code: 'a', unit: 'years' },
  localSystem: LOCAL
};

// SNOMED CT metadata codes the app reads from $lookup results. They are not
// answer bindings, but they live here so that no SNOMED CT code is in code.
export const SNOMED_METADATA = {
  // Description types, used to pick out the FSN and synonyms.
  fsnUse: { code: '900000000000003001', display: 'Fully specified name' },
  synonymUse: { code: '900000000000013009', display: 'Synonym' },
  // Attributes the concept detail drawer shows.
  interprets: { code: '363714003', display: 'Interprets' },
  hasInterpretation: { code: '363713009', display: 'Has interpretation' }
};
