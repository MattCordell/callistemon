/**
 * @module config
 * @description Application configuration and constants
 *
 * Centralized configuration for:
 * - Filler organization identifiers
 * - Terminology server settings
 * - FHIR client configuration
 * - UI behavior settings
 * - QR scanner configuration
 */

export const CONFIG = {
  // Filler Organization Management
  FILLER_ORGS: {
    calli: {
      display: 'Callistemon Diagnostic Services',
      identifier: {
        system: 'https://ids.callistemon.health/org',
        value: 'callistemon-ds'
      }
    },
    bb: {
      display: 'BB Diagnostics',
      identifier: {
        system: 'https://ids.callistemon.health/org',
        value: 'bb-diagnostics'
      }
    }
  },

  // Terminology Services
  TERMINOLOGY: {
    txBase: 'https://tx.ontoserver.csiro.au/fhir',
    snomedSystem: 'http://snomed.info/sct',
    codes: {
      radiographicAncestor: '363680008',  // Radiographic imaging procedure (procedure)
      notPregnant: '60001007'            // Not pregnant
    },
    ecl: {
      fasting: '^1072351000168102 {{ term = "fasting" }}'
    }
  },

  // FHIR Client
  FHIR: {
    timeout: 30000,           // 30 seconds
    retryCount: 3,
    retryDelayInitial: 1000,  // 1 second
    retryDelayMax: 10000,     // 10 seconds
    pageSize: 200,
    headers: {
      'Accept': 'application/fhir+json',
      'Content-Type': 'application/fhir+json'
    }
  },

  // UI Behavior
  UI: {
    toastTimeout: 4200,        // milliseconds
    searchDebounceMs: 300,     // patient search debounce
    claimRateLimit: 2000       // prevent double-clicking (milliseconds)
  },

  // QR Scanner
  QR: {
    qrbox: 250,
    fps: 10,
    aspectRatio: 1.0
  }
};
