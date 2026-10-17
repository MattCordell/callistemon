// AutoCoder configuration: terminology server and one value set per field,
// so each field can be tuned on its own.
window.AC_CONFIG = {
  TX_BASE: 'https://r4.ontoserver.csiro.au/fhir',

  // Plain FHIR value set (not ECL)
  GENDER_VS: 'http://hl7.org/fhir/ValueSet/administrative-gender',

  // SNOMED CT ECL per field
  ECL: {
    reason: '<404684003 |Clinical finding|',
    clinical: '<404684003 |Clinical finding|',
    meds: '^929360031000036100',
  },

  SEARCH_COUNT: 20,   // results requested from $expand
  MAX_CHIPS: 8,       // match chips shown under a notes field
  MIN_CHARS: 3,       // characters needed before a search runs
  DEBOUNCE_MS: 250,
};
