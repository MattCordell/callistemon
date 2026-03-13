/**
 * @module config
 * @description Application configuration and constants
 */

export const CONFIG = {
  FHIR_SERVERS: [
    'https://server.callistemon.site/fhir',
    'https://server.fire.ly',
    'https://hapi.fhir.org/baseR4',
    'https://pyroserver.azurewebsites.net/pyro',
    'https://smile.sparked-fhir.com/ereq/fhir/DEFAULT',
    'https://erequesting.aidbox.beda.software/fhir'
  ],

  FHIR: {
    defaultBase: 'https://server.callistemon.site/fhir',
    timeout: 30000,
    retryCount: 3,
    retryDelayInitial: 1000,
    retryDelayMax: 10000,
    pageSize: 200,
    headers: {
      'Accept': 'application/fhir+json'
    }
  },

  DISPLAY_MODES: {
    COMPACT: 'compact',
    SIMPLE: 'simple',
    LAB_SPECIFIC: 'lab-specific',
    METHOD_SPECIFIC: 'method-specific'
  },

  CATEGORY: {
    diagnosticServiceLab: {
      system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
      code: 'LAB',
      display: 'Laboratory'
    }
  },

  UI: {
    maxCompanionReports: 4,
    toastTimeout: 4200
  }
};
