/**
 * @module config
 * @description Sup-Sup configuration constants
 */

export const CONFIG = {
  DEFAULT_TX_BASE: 'https://tx.ontoserver.csiro.au/fhir',
  ALTERNATE_TX_BASES: [
    'https://tx.ontoserver.csiro.au/fhir',
    'https://r4.ontoserver.csiro.au/fhir',
    'https://tx.dev.hl7.org.au/fhir',
  ],
  SNOMED: {
    SYSTEM: 'http://snomed.info/sct',
    USE_PREFERRED: '900000000000548007',
    USE_SYNONYM: '900000000000013009',
  },
  EXPAND_COUNT: 5000,
};
