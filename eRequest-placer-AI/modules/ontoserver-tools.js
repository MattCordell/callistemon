// modules/ontoserver-tools.js — backend selection + unified Ontoserver surface.
//
// Probes MCP once at boot; on success uses MCP, otherwise REST. Per-call, if an
// MCP request fails it sticky-falls-back to REST and stays there for the rest of
// the session (the boot probe can pass while individual calls later CORS-fail).
// getTools() returns the OpenAI tool descriptors the agent advertises to the
// model; the names (search_concepts / lookup_concept) match spec §3.2.

import { getAiSettings } from './settings-ai.js';
import { probeMcp } from './ontoserver-mcp.js';
import * as mcp from './ontoserver-mcp.js';
import * as rest from './ontoserver-rest.js';

// 'unknown' until initOntoserverBackend() resolves the boot probe. Any concept
// call made before then (e.g. a quick ?aitest=1 click) falls through to REST —
// harmless, but it means MCP can be skipped for those early calls even when live.
let backend = 'unknown'; // 'mcp' | 'rest' | 'unknown'

/** Probe MCP and set the active backend. Returns the resolved backend name. */
export async function initOntoserverBackend() {
  const url = getAiSettings().MCP_URL;
  let ok = false;
  try { ok = await probeMcp(url); } catch (_e) { ok = false; }
  backend = ok ? 'mcp' : 'rest';
  return backend;
}

/** 'mcp' | 'rest' | 'unknown' */
export function getActiveBackendName() { return backend; }

function stickyFallback(label, err) {
  console.warn('Ontoserver MCP ' + label + ' failed; sticky fallback to REST', err);
  backend = 'rest';
}

/** Unified concept search; delegates to the active backend with REST fallback. */
export async function searchConcepts(args, opts) {
  if (backend === 'mcp') {
    try {
      return await mcp.searchConcepts(args, opts);
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      stickyFallback('searchConcepts', e);
    }
  }
  return rest.searchConcepts(args, opts);
}

/** Unified single-concept lookup; delegates to the active backend with REST fallback. */
export async function lookupConcept(args, opts) {
  if (backend === 'mcp') {
    try {
      return await mcp.lookupConcept(args, opts);
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      stickyFallback('lookupConcept', e);
    }
  }
  return rest.lookupConcept(args, opts);
}

/** OpenAI-format tool descriptors advertised to the model. */
export function getTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'search_concepts',
        description: 'Search SNOMED CT for concepts matching a free-text term, constrained to an ECL value set. '
          + 'Returns matching concepts as {code, display, system}. Always use this to confirm a concept exists '
          + 'and is within scope before including it in your answer. Do not rely on concept IDs from memory.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Free-text term to search for, e.g. "type 2 diabetes".' },
            valueSetEcl: { type: 'string', description: 'ECL expression constraining the searchable SNOMED hierarchy.' },
            count: { type: 'integer', description: 'Maximum number of results to return (default 20).' },
          },
          required: ['query', 'valueSetEcl'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lookup_concept',
        description: 'Look up a specific SNOMED CT concept by system and code to confirm its display term and that '
          + 'it is valid and active. Use when you already have a candidate code and want to verify it.',
        parameters: {
          type: 'object',
          properties: {
            system: { type: 'string', description: 'Code system URI, e.g. http://snomed.info/sct.' },
            code: { type: 'string', description: 'The concept code to look up.' },
          },
          required: ['system', 'code'],
        },
      },
    },
  ];
}
