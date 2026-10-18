// AutoCoder configuration: terminology server and one value set per field,
// so each field can be tuned on its own.
window.AC_CONFIG = {
  TX_BASE: 'https://r4.ontoserver.csiro.au/fhir',

  // AutoCoder API: the Cloud Run service when hosted on GitHub Pages, otherwise
  // the local server that also serves this page (see DEPLOY.md)
  API_BASE: location.hostname.endsWith('github.io') ? 'https://autocoder-6515564380.us-central1.run.app' : '',

  // MedGemma scales to zero when idle; retry while it wakes up
  WAKE_RETRY_MS: 20000,
  WAKE_GIVE_UP_MS: 15 * 60 * 1000,
  STATUS_POLL_MS: 15000,  // how often the MedGemma state badge is refreshed
  WAKE_EXPECTED_S: 300,   // typical wake-up time (measured about 4.5 min); the countdown starts here

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
