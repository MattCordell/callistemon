// Shared JSON GET used by the terminology client and the FHIR client.
//
// Only the Accept header is sent: Ontoserver's CORS policy allows
// "content-type, accept" and nothing else, and a bare GET avoids a preflight.
// The timeout covers the whole request, including reading the body.

import { getConfig } from '../config.js';

// makeError(message, { status, outcome, url }) builds the caller's error type.
// serverName is used in messages, for example "terminology server".
export async function fetchJson(url, { makeError, serverName }) {
  const { FETCH_TIMEOUT_MS } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const timedOut = () => makeError(
    `Timed out after ${Math.round(FETCH_TIMEOUT_MS / 1000)} s waiting for the ${serverName}`, { url });

  try {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/fhir+json' },
        signal: controller.signal
      });
    } catch (err) {
      if (err.name === 'AbortError') throw timedOut();
      throw makeError(
        `Network error: could not reach the ${serverName} (offline, wrong URL or CORS)`, { url });
    }

    let body = null;
    try {
      body = await response.json();
    } catch (err) {
      if (err.name === 'AbortError') throw timedOut();
      // Otherwise the body was not JSON; the checks below report it.
    }

    if (!response.ok || body?.resourceType === 'OperationOutcome') {
      const message = outcomeText(body) || `HTTP ${response.status} ${response.statusText}`;
      throw makeError(message, { status: response.status, outcome: body, url });
    }
    if (body === null || typeof body !== 'object') {
      throw makeError(`The ${serverName} returned a response that is not JSON`, { status: response.status, url });
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export function outcomeText(outcome) {
  if (!outcome || outcome.resourceType !== 'OperationOutcome') return '';
  return (outcome.issue || [])
    .map(i => i.details?.text || i.diagnostics || i.code)
    .filter(Boolean)
    .join(' | ');
}
