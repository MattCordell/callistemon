/**
 * @module config
 * @description UCUMverter configuration constants
 */

export const CONFIG = {
  TX_BASE: 'https://tx.ontoserver.csiro.au/fhir',
  SNOMED_SYSTEM: 'http://snomed.info/sct',
  // SNOMED CT-AU edition (AMT lives here)
  SNOMED_EDITION: 'http://snomed.info/sct/32506021000036107',
  EXPAND_COUNT: 200,
  LOOKUP_CONCURRENCY: 6,
  FETCH_TIMEOUT_MS: 10000,
  FILES: {
    guidelines: 'config/guidelines.json',
    units: 'config/units.json',
    unitMap: 'config/snomed-ucum-map.json',
    medicines: 'config/medicines.json',
  },
  // AMT concrete-domain attributes used to read product strength
  AMT: {
    CONC_VALUE: '999000021000168100',
    CONC_UNIT: '999000031000168102',
    TOTAL_VALUE: '999000041000168106',
    TOTAL_UNIT: '999000051000168108',
    BOSS: '732943007',
  },
};
