/**
 * @module fhir-client
 * @description FHIR HTTP operations and network interactions
 *
 * Provides functions for:
 * - FHIR GET requests with error handling
 * - ServiceRequest fetching with 2-level fallback strategy
 * - Individual patient fetching
 * - Pagination handling
 *
 * @requires config
 */

import { CONFIG } from '../config.js';

/**
 * Base FHIR GET request
 * @param {string} base - FHIR server base URL
 * @param {string} pathWithQuery - Path and query string
 * @returns {Promise<Object>} FHIR response (Bundle or Resource)
 * @throws {Error} If request fails
 */
export async function fhirGET(base, pathWithQuery) {
  const url = base.replace(/\/$/, '') + '/' + pathWithQuery.replace(/^\//, '');
  const res = await fetch(url, { headers: { Accept: 'application/fhir+json' } });

  if (!res.ok) {
    let text = '';
    try {
      text = await res.text();
    } catch {}
    throw new Error(`FHIR GET ${url} -> ${res.status}${text ? ': ' + text : ''}`);
  }

  return res.json();
}

/**
 * Build ServiceRequest query with all _include and _revinclude parameters
 * @returns {URLSearchParams} Query parameters
 * @private
 */
function buildFullQuery() {
  const query = new URLSearchParams();
  query.set('_count', String(CONFIG.FHIR_QUERY.COUNT));

  CONFIG.FHIR_QUERY.INCLUDES.forEach(inc => query.append('_include', inc));
  CONFIG.FHIR_QUERY.ITERATE_INCLUDES.forEach(inc => query.append('_include:iterate', inc));
  CONFIG.FHIR_QUERY.REVINCLUDE.forEach(inc => query.append('_revinclude', inc));

  query.append('_lastUpdated', 'ge1900-01-01');
  query.append('_sort', CONFIG.FHIR_QUERY.SORT);

  return query;
}

/**
 * Build basic ServiceRequest query (fallback)
 * @returns {URLSearchParams} Query parameters
 * @private
 */
function buildBasicQuery() {
  const query = new URLSearchParams();
  query.set('_count', String(CONFIG.FHIR_QUERY.COUNT));
  query.set('_lastUpdated', 'ge1900-01-01');
  return query;
}

/**
 * Check if error indicates server doesn't support advanced parameters
 * @param {Error} error - Error object
 * @returns {boolean} True if it's a parameter support error
 * @private
 */
function isServerCapabilityError(error) {
  const errorMsg = String(error?.message || error || '').toLowerCase();
  return errorMsg.includes('not-supported') ||
         errorMsg.includes('not supported') ||
         errorMsg.includes('400');
}

/**
 * Fetch missing patients from bundle
 * @param {string} baseUrl - FHIR server base URL
 * @param {Object} bundle - FHIR Bundle
 * @param {Function} normalizePatientRef - Function to normalize patient references
 * @param {Function} srPatientRef - Function to get patient reference from SR
 * @returns {Promise<void>} Modifies bundle in place
 */
async function fetchMissingPatients(baseUrl, bundle, normalizePatientRef, srPatientRef) {
  const patientRefs = new Set();
  const entries = (bundle?.entry) || [];

  // Collect unique patient references from ServiceRequests
  for (const entry of entries) {
    const sr = entry?.resource;
    if (sr?.resourceType === 'ServiceRequest') {
      const pref = normalizePatientRef(srPatientRef(sr));
      if (pref) patientRefs.add(pref);
    }
  }

  // Fetch patients individually
  for (const pref of patientRefs) {
    try {
      const patientId = pref.replace('Patient/', '');
      const patient = await fhirGET(baseUrl, 'Patient/' + patientId);
      if (patient) {
        if (!bundle.entry) bundle.entry = [];
        bundle.entry.push({ resource: patient });
      }
    } catch (e) {
      console.warn(`Failed to fetch patient ${pref}:`, e);
    }
  }
}

/**
 * Check if bundle has Patient resources
 * @param {Object} bundle - FHIR Bundle
 * @returns {boolean} True if bundle contains patients
 * @private
 */
function bundleHasPatients(bundle) {
  return (bundle?.entry || []).some(e => e.resource?.resourceType === 'Patient');
}

/**
 * Fetch ServiceRequests with 2-level fallback strategy
 *
 * Level 1: Try full query with _include and _revinclude
 * Level 2: Fallback to basic query + fetch missing patients
 *
 * @param {string} baseUrl - FHIR server base URL
 * @param {Object} helpers - Helper functions object
 * @param {Function} helpers.normalizePatientRef - Normalize patient reference
 * @param {Function} helpers.srPatientRef - Get patient reference from SR
 * @returns {Promise<Object>} FHIR Bundle
 * @throws {Error} If all fetch attempts fail
 */
export async function fetchServiceRequests(baseUrl, helpers) {
  let bundle;

  try {
    // Level 1: Try full query with all includes
    const fullQuery = buildFullQuery();
    bundle = await fhirGET(baseUrl, 'ServiceRequest?' + fullQuery.toString());

    // Check if server honored _include for patients
    if (bundle?.entry && !bundleHasPatients(bundle)) {
      await fetchMissingPatients(baseUrl, bundle, helpers.normalizePatientRef, helpers.srPatientRef);
    }

    return bundle;
  } catch (error) {
    // Level 2: Fallback to basic query if server doesn't support advanced parameters
    if (isServerCapabilityError(error)) {
      console.log('Server doesn\'t support advanced parameters, falling back to basic query');

      try {
        const basicQuery = buildBasicQuery();
        bundle = await fhirGET(baseUrl, 'ServiceRequest?' + basicQuery.toString());

        // Fetch patients separately
        if (bundle?.entry) {
          await fetchMissingPatients(baseUrl, bundle, helpers.normalizePatientRef, helpers.srPatientRef);
        }

        return bundle;
      } catch (fallbackError) {
        console.error('Basic query also failed:', fallbackError);
        throw new Error('Failed to fetch ServiceRequests. Check server URL and CORS settings.');
      }
    }

    // Re-throw if it's not a parameter support issue
    throw error;
  }
}

/**
 * Fetch next page of results using pagination link
 * @param {string} nextLink - Next page URL from bundle.link
 * @param {Object} helpers - Helper functions object
 * @param {Function} helpers.normalizePatientRef - Normalize patient reference
 * @param {Function} helpers.srPatientRef - Get patient reference from SR
 * @returns {Promise<Object>} FHIR Bundle
 */
export async function fetchNextPage(nextLink, helpers) {
  const res = await fetch(nextLink, { headers: { Accept: 'application/fhir+json' } });

  if (!res.ok) {
    throw new Error(`FHIR GET next -> ${res.status}`);
  }

  const bundle = await res.json();

  // For fallback servers, we might need to fetch patients separately
  if (bundle?.entry && !bundleHasPatients(bundle)) {
    const baseUrl = new URL(nextLink).origin;
    await fetchMissingPatients(baseUrl, bundle, helpers.normalizePatientRef, helpers.srPatientRef);
  }

  return bundle;
}

/**
 * Fetch individual patient by ID
 * @param {string} baseUrl - FHIR server base URL
 * @param {string} patientId - Patient ID
 * @returns {Promise<Object>} Patient resource
 */
export async function fetchPatient(baseUrl, patientId) {
  return fhirGET(baseUrl, 'Patient/' + patientId);
}
