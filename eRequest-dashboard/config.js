/**
 * @module config
 * @description Application configuration and constants
 *
 * Centralized configuration for:
 * - FHIR server presets
 * - Terminology server settings
 * - SNOMED codes and modality options
 * - ValueSet canonical URLs
 * - UI behavior settings
 * - FHIR query parameters
 */

export const CONFIG = {
  // FHIR Server Presets
  FHIR_SERVERS: [
    'https://server.callistemon.site/fhir',
    'https://server.fire.ly',
    'https://hapi.fhir.org/baseR4',
    'https://pyroserver.azurewebsites.net/pyro',
    'https://smile.sparked-fhir.com/ereq/fhir/DEFAULT',
    'https://erequesting.aidbox.beda.software/fhir'
  ],

  // Terminology Servers
  TX_SERVERS: [
    'https://tx.ontoserver.csiro.au/fhir',
    'https://r4.ontoserver.csiro.au/fhir',
    'https://healthterminologies.gov.au/fhir'
  ],
  DEFAULT_TX: 'https://tx.ontoserver.csiro.au/fhir',

  // SNOMED Codes
  SNOMED: {
    LAB_CATEGORY: '108252007',
    IMAGING_CATEGORY: '363679005',
    SNOMED_SYSTEM: 'http://snomed.info/sct'
  },

  // Modality Options (SNOMED codes for imaging modalities)
  MODALITIES: [
    { code: '34945008', display: 'Angiocardiography' },
    { code: '77477000', display: 'Computed tomography' },
    { code: '44491008', display: 'Fluoroscopy' },
    { code: '1753581000168106', display: 'Imaging procedure with contrast' },
    { code: '719259006', display: 'Imaging procedure without contrast' },
    { code: '113091000', display: 'Magnetic resonance imaging' },
    { code: '71651007', display: 'Mammography' },
    { code: '169283005', display: 'Medical photography' },
    { code: '373205008', display: 'Nuclear medicine imaging' },
    { code: '168537006', display: 'Plain X-ray' },
    { code: '363680008', display: 'Radiographic imaging procedure' },
    { code: '367385006', display: 'Total body scan' },
    { code: '16310003', display: 'Ultrasound' },
    { code: '371576000', display: 'Video imaging' }
  ],

  // ValueSets
  VALUESETS: {
    AU_BODY_SITE: 'https://healthterminologies.gov.au/fhir/ValueSet/body-site-1'
  },

  // UI Behavior
  UI: {
    PAGE_SIZE: 25,
    AUTOCOMPLETE_MIN_CHARS: 3,
    AUTOCOMPLETE_DEBOUNCE_MS: 300,
    AUTOCOMPLETE_MAX_RESULTS: 5,
    TICK_INTERVAL_MS: 60000 // Update "time since" every minute
  },

  // FHIR Query Parameters
  FHIR_QUERY: {
    COUNT: 25,
    INCLUDES: [
      'ServiceRequest:subject',
      'ServiceRequest:performer'
    ],
    ITERATE_INCLUDES: [
      'PractitionerRole:practitioner',
      'PractitionerRole:organization'
    ],
    REVINCLUDE: [
      'Task:based-on',
      'Task:focus'
    ],
    SORT: '-authored,-_lastUpdated'
  }
};
