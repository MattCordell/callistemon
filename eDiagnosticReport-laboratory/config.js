/**
 * @module config
 * @description Application configuration and constants
 *
 * Centralized configuration for:
 * - Filler organization identifiers
 * - FHIR client configuration
 * - Profile URLs and category codings
 * - UI behavior settings
 */

export const CONFIG = {
  // Provider Organisation Management
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

  // FHIR Client
  FHIR: {
    defaultBase: 'https://server.callistemon.site/fhir',
    timeout: 30000,
    retryCount: 3,
    retryDelayInitial: 1000,
    retryDelayMax: 10000,
    pageSize: 200,
    headers: {
      'Accept': 'application/fhir+json',
      'Content-Type': 'application/fhir+json'
    }
  },

  // FHIR Profiles
  PROFILES: {
    pathologyReport: 'http://hl7.org.au/fhir/StructureDefinition/au-pathologyreport',
    pathologyResult: 'http://hl7.org.au/fhir/core/StructureDefinition/au-core-diagnosticresult-path'
  },

  // Category Codings
  CATEGORY: {
    laboratory: {
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'laboratory',
      display: 'Laboratory'
    },
    diagnosticServiceLab: {
      system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
      code: 'LAB',
      display: 'Laboratory'
    },
    pathologySnomedCode: '108252007'
  },

  // Business Status
  BUSINESS_STATUS: {
    resultsAvailable: {
      system: 'http://hl7.org.au/fhir/ereq/CodeSystem/au-erequesting-task-businessstatus',
      code: 'results-available',
      display: 'Results Available'
    }
  },

  // UI Behavior
  UI: {
    toastTimeout: 4200,
    submitRateLimit: 2000
  }
};
