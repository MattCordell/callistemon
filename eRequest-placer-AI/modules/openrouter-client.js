// modules/openrouter-client.js — OpenRouter chat-completions client with hybrid
// key handling (managed proxy by default, user-supplied key on override).
//
// Route is decided per-call from current settings, so flipping the "Use my own
// OpenRouter key" toggle takes effect on the next call with no page reload:
//   - default  -> POST ${PROXY_BASE_URL}/chat/completions, NO Authorization
//                 (the Cloudflare Worker proxy injects the key upstream)
//   - override -> POST ${OPENROUTER_BASE}/chat/completions with
//                 Authorization: Bearer <userKey>

import { getAiSettings } from './settings-ai.js';
import { setDebugUrl } from './utils.js';

/**
 * Thrown for any non-success outcome. `kind` lets callers branch:
 *   'transport'    — fetch itself failed (network/CORS)
 *   'http'         — non-retryable HTTP error (4xx other than auth, or 5xx after retry)
 *   'parse'        — 2xx body was not valid JSON
 *   'rate-limited' — 429 (after the single retry)
 *   'unauthorized' — 401/403
 *   'not-configured'— default proxy route selected but the proxy isn't deployed yet
 */
export class OpenRouterError extends Error {
  constructor(message, { status, body, kind } = {}) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status ?? null;
    this.body = body ?? null;
    this.kind = kind || 'http';
  }
}

const RETRY_DELAY_MS = 1000;

/**
 * Run one chat-completion turn.
 * @param {object}   opts
 * @param {string}  [opts.model]    — overrides the settings model
 * @param {Array}    opts.messages  — OpenAI-format message array
 * @param {Array}   [opts.tools]    — OpenAI tool descriptors (omitted if empty)
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<object>} the parsed OpenAI-format response
 */
export async function chatCompletion({ model, messages, tools, signal } = {}) {
  const s = getAiSettings();
  const useOwnKey = !!s.USE_OWN_OPENROUTER_KEY;

  const base = ((useOwnKey ? s.OPENROUTER_BASE : s.PROXY_BASE_URL) || '').replace(/\/+$/, '');
  const url = base + '/chat/completions';

  const headers = {
    'Content-Type': 'application/json',
    // OpenRouter attribution headers (harmless on the proxy route too).
    'HTTP-Referer': (typeof location !== 'undefined' && location.origin) || 'https://callistemon',
    'X-Title': 'callistemon-ai',
  };

  if (useOwnKey) {
    const key = (s.OPENROUTER_API_KEY || '').trim();
    if (!key) {
      throw new OpenRouterError(
        'No OpenRouter API key set. Enter one in AI Settings, or untick "Use my own OpenRouter key" to use the managed proxy.',
        { kind: 'unauthorized' });
    }
    headers.Authorization = 'Bearer ' + key;
  } else if (!s.PROXY_DEPLOYED) {
    // Refuse the proxy route until issue #20 deploys the worker: PROXY_BASE_URL is
    // an unclaimed workers.dev placeholder, so POSTing clinical free-text there is
    // a data-egress risk. Steer the user to their own key for now.
    throw new OpenRouterError(
      'The managed AI proxy is not deployed yet. Tick "Use my own OpenRouter key" in AI Settings and add a key to use the demo.',
      { kind: 'not-configured' });
  }

  const payload = {
    model: model || s.OPENROUTER_MODEL,
    messages,
    temperature: 0.2,
    stream: false,
  };
  if (Array.isArray(tools) && tools.length) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }
  const body = JSON.stringify(payload);

  // One retry on 429/5xx with a fixed backoff; no retry on other statuses.
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    setDebugUrl(url + ' [openrouter:' + payload.model + (useOwnKey ? '' : ' via proxy') + ']');

    let resp;
    try {
      resp = await fetch(url, { method: 'POST', headers, body, signal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new OpenRouterError('Network error contacting ' + url, {
        kind: 'transport', body: String((e && e.message) || e),
      });
    }

    if (resp.ok) {
      let json;
      try { json = await resp.json(); }
      catch (e) {
        throw new OpenRouterError('OpenRouter returned a non-JSON success body', {
          status: resp.status, kind: 'parse', body: String((e && e.message) || e),
        });
      }
      return json;
    }

    const status = resp.status;
    const errBody = await safeReadText(resp);

    if ((status === 429 || status >= 500) && attempt < 2) {
      await delay(RETRY_DELAY_MS, signal);
      continue;
    }
    if (status === 401 || status === 403) {
      throw new OpenRouterError(unauthorizedMessage(useOwnKey, status), {
        status, kind: 'unauthorized', body: errBody,
      });
    }
    if (status === 429) {
      throw new OpenRouterError('OpenRouter rate limit reached (429). Try again shortly, or top up credits / switch model in AI Settings.', {
        status, kind: 'rate-limited', body: errBody,
      });
    }
    throw new OpenRouterError('OpenRouter request failed (' + status + ')', {
      status, kind: 'http', body: errBody,
    });
  }
}

function unauthorizedMessage(useOwnKey, status) {
  if (useOwnKey) {
    return 'OpenRouter rejected your API key (' + status + '). Check the key in AI Settings.';
  }
  return 'The AI proxy rejected the request (' + status + '). It may be down or rate-limited. ' +
    'You can tick "Use my own OpenRouter key" in AI Settings to call OpenRouter directly.';
}

async function safeReadText(resp) {
  try { return await resp.text(); } catch (_e) { return ''; }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(makeAbortError()); return; }
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => { clearTimeout(t); reject(makeAbortError()); }, { once: true });
    }
  });
}

function makeAbortError() {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}
