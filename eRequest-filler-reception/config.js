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
        system: 'http://ns.electronichealth.net.au/id/hi/hpio/1.0',
        value: '8003621566684455'
      },
      resource: {
        resourceType: 'Organization',
        meta: {
          profile: [
            'http://hl7.org.au/fhir/StructureDefinition/au-organization',
            'http://hl7.org.au/fhir/erequesting/StructureDefinition/au-erequesting-organization'
          ]
        },
        active: true,
        type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/organization-type', code: 'prov', display: 'Healthcare Provider' }] }],
        name: 'Callistemon Diagnostic Services',
        identifier: [{
          type: { coding: [{ system: 'http://terminology.hl7.org.au/CodeSystem/v2-0203', code: 'NOI', display: 'National Organisation Identifier' }], text: 'HPI-O' },
          system: 'http://ns.electronichealth.net.au/id/hi/hpio/1.0',
          value: '8003621566684455'
        }],
        telecom: [{ system: 'phone', value: '(03) 5550 1234', use: 'work' }],
        address: [{
          use: 'work',
          line: ['12 Bottlebrush Ct'],
          city: 'Melbourne',
          state: 'VIC',
          postalCode: '3000',
          country: 'Australia'
        }]
      }
    },
    bb: {
      display: 'BB Diagnostics',
      identifier: {
        system: 'http://ns.electronichealth.net.au/id/hi/hpio/1.0',
        value: '8003621566689876'
      },
      resource: {
        resourceType: 'Organization',
        meta: {
          profile: [
            'http://hl7.org.au/fhir/StructureDefinition/au-organization',
            'http://hl7.org.au/fhir/erequesting/StructureDefinition/au-erequesting-organization'
          ]
        },
        active: true,
        type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/organization-type', code: 'prov', display: 'Healthcare Provider' }] }],
        name: 'BB Diagnostics',
        identifier: [{
          type: { coding: [{ system: 'http://terminology.hl7.org.au/CodeSystem/v2-0203', code: 'NOI', display: 'National Organisation Identifier' }], text: 'HPI-O' },
          system: 'http://ns.electronichealth.net.au/id/hi/hpio/1.0',
          value: '8003621566689876'
        }],
        telecom: [{ system: 'phone', value: '(02) 5550 5678', use: 'work' }],
        address: [{
          use: 'work',
          line: ['88 Grevillea Ave'],
          city: 'Sydney',
          state: 'NSW',
          postalCode: '2000',
          country: 'Australia'
        }]
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

  // Server Authentication
  // Credentials are stored in localStorage (per storageKey), never in source.
  AUTH_CONFIGS: [
    {
      match: 'smile.sparked-fhir.com',
      user: 'filler',
      storageKey: 'sparked_filler_pwd',
      nice: 'Sparked (filler)'
    }
  ],

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
