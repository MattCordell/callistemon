// modules/ontoserver-mcp.js — hand-rolled MCP Streamable-HTTP transport for the
// Ontoserver MCP server (no SDK — keeps the static deploy dependency-free).
//
// JSON-RPC 2.0 over a single POST endpoint. The server may answer with either
// `application/json` or a `text/event-stream` (SSE) body; both are handled. The
// session id returned by `initialize` is captured from the Mcp-Session-Id
// response header and echoed on every subsequent request.
//
// Tool contract (confirmed against the Ontoserver MCP product):
//   search_concepts({ system, query, valueset, limit }) -> {"results":[{code,display}]}
//   lookup_concept ({ system, code })                   -> {"display", ...}
// The unified searchConcepts/lookupConcept below translate the issue's
// { query, valueSetEcl, count } / { system, code } surface onto those tools and
// normalise the result to { code, display, system }[].

import { getAiSettings } from './settings-ai.js';
import { setDebugUrl } from './utils.js';

const JSONRPC = '2.0';
const PROTOCOL_VERSION = '2025-03-26';
const SCT = 'http://snomed.info/sct';

export class McpTransportError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message);
    this.name = 'McpTransportError';
    this.status = status ?? null;
    this.cause = cause ?? null;
  }
}

export class McpClient {
  constructor(url) {
    this.url = url;
    this.sessionId = null;
    this.nextId = 1;
    this.initialized = false;
  }

  async initialize({ signal } = {}) {
    const result = await this._request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'callistemon-ai', version: '1.0' },
    }, { signal });
    // Per the spec, follow a successful initialize with the initialized
    // notification. Failure here is non-fatal (best-effort).
    await this._notify('notifications/initialized', {}, { signal });
    this.initialized = true;
    return result;
  }

  async listTools({ signal } = {}) {
    const result = await this._request('tools/list', {}, { signal });
    return (result && result.tools) || [];
  }

  async callTool(name, args, { signal } = {}) {
    return this._request('tools/call', { name, arguments: args || {} }, { signal });
  }

  // ----- transport internals -----

  _headers() {
    const h = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
    return h;
  }

  async _request(method, params, { signal } = {}) {
    const payload = { jsonrpc: JSONRPC, id: this.nextId++, method, params };
    setDebugUrl(this.url + ' [mcp:' + method + ']');
    let resp;
    try {
      resp = await fetch(this.url, {
        method: 'POST', headers: this._headers(), body: JSON.stringify(payload), signal,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new McpTransportError('MCP transport error: ' + ((e && e.message) || e), { cause: e });
    }

    const sid = resp.headers.get('Mcp-Session-Id');
    if (sid) this.sessionId = sid;

    if (!resp.ok) {
      throw new McpTransportError('MCP HTTP ' + resp.status, { status: resp.status });
    }

    const message = await this._parseBody(resp);
    if (message && message.error) {
      const m = message.error.message || JSON.stringify(message.error);
      throw new McpTransportError('MCP JSON-RPC error: ' + m, { status: resp.status });
    }
    return message ? message.result : null;
  }

  async _notify(method, params, { signal } = {}) {
    const payload = { jsonrpc: JSONRPC, method, params }; // no id -> notification
    setDebugUrl(this.url + ' [mcp:' + method + ']');
    try {
      await fetch(this.url, {
        method: 'POST', headers: this._headers(), body: JSON.stringify(payload), signal,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      // notifications are fire-and-forget; a failure must not abort the session.
      console.warn('MCP notify failed (' + method + ')', e);
    }
  }

  async _parseBody(resp) {
    const ct = (resp.headers.get('Content-Type') || '').toLowerCase();
    const text = await resp.text();
    if (ct.includes('text/event-stream')) {
      const msg = parseLastSseJson(text);
      if (msg) return msg;
      throw new McpTransportError('MCP SSE body had no JSON data event');
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      // Some servers stream SSE without the matching content-type — try that too.
      const msg = parseLastSseJson(text);
      if (msg) return msg;
      throw new McpTransportError('MCP response was not valid JSON', { cause: e });
    }
  }
}

// Parse an SSE payload and return the JSON object from the last decodable
// `data:` block (ignores [DONE] sentinels and non-JSON keep-alives).
function parseLastSseJson(text) {
  const blocks = String(text).split(/\r?\n\r?\n/);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const dataLines = blocks[i].split(/\r?\n/).filter((l) => l.startsWith('data:'));
    if (!dataLines.length) continue;
    const data = dataLines.map((l) => l.slice(5).replace(/^ /, '')).join('\n').trim();
    if (!data || data === '[DONE]') continue;
    try { return JSON.parse(data); } catch (_e) { /* keep scanning earlier blocks */ }
  }
  return null;
}

/**
 * Reachability probe. Spins up a throwaway client and attempts `initialize`
 * within `timeoutMs`. Never throws — returns a boolean.
 */
export async function probeMcp(url, timeoutMs = 2000) {
  if (!url) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const client = new McpClient(url);
    await client.initialize({ signal: ctrl.signal });
    return true;
  } catch (_e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ----- shared, lazily-initialised client for the unified calls -----

let sharedClient = null;

async function getClient(signal) {
  const url = getAiSettings().MCP_URL;
  if (sharedClient && sharedClient.url === url && sharedClient.initialized) return sharedClient;
  const client = new McpClient(url);
  await client.initialize({ signal });
  sharedClient = client;
  return client;
}

// Extract the tool's textual JSON payload from a tools/call result.
// MCP wraps tool output in { content: [{ type:'text', text }], structuredContent? }.
function readToolJson(result) {
  if (!result) return null;
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
  }
  const content = Array.isArray(result.content) ? result.content : [];
  for (const part of content) {
    if (part && typeof part.text === 'string') {
      try { return JSON.parse(part.text); } catch (_e) { /* try next part */ }
    }
  }
  // Some servers return the payload directly as the result.
  if (Array.isArray(result.results) || Array.isArray(result)) return result;
  return null;
}

function normaliseConcepts(payload) {
  if (!payload) return [];
  // Ontoserver MCP shape: { results: [{ code, display }] }
  let list = null;
  if (Array.isArray(payload)) list = payload;
  else if (Array.isArray(payload.results)) list = payload.results;
  else if (payload.expansion && Array.isArray(payload.expansion.contains)) list = payload.expansion.contains;
  if (!list) return [];
  return list
    .filter((c) => c && c.code)
    .map((c) => ({ code: String(c.code), display: c.display || c.code, system: c.system || SCT }));
}

/** Unified concept search via MCP. Throws McpTransportError so the wrapper can fall back. */
export async function searchConcepts({ query, valueSetEcl, count } = {}, { signal } = {}) {
  const client = await getClient(signal);
  const valueset = SCT + '?fhir_vs=ecl/' + encodeURIComponent(valueSetEcl || '');
  const result = await client.callTool('search_concepts', {
    system: 'snomed',
    query: query || '',
    valueset,
    limit: count || 20,
  }, { signal });
  return normaliseConcepts(readToolJson(result));
}

/** Unified single-concept lookup via MCP. Throws McpTransportError on failure. */
export async function lookupConcept({ system, code } = {}, { signal } = {}) {
  const client = await getClient(signal);
  const result = await client.callTool('lookup_concept', {
    system: system && system !== SCT ? system : 'snomed',
    code,
  }, { signal });
  const payload = readToolJson(result);
  if (payload && (payload.display || payload.code)) {
    return [{ code: String(payload.code || code), display: payload.display || code, system: system || SCT }];
  }
  return [];
}
