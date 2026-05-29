// Cloudflare Worker proxying OpenRouter chat completions for callistemon AI apps.
//
// Holds the OpenRouter API key as a server-side secret so static GitHub Pages
// apps (e.g. eRequest-placer-AI) can use the AI features without each visitor
// bringing their own key. The browser POSTs to this worker with NO auth header;
// the worker adds `Authorization: Bearer <secret>` and forwards to OpenRouter.
//
// Secrets (set via `wrangler secret put`):
//   OPENROUTER_API_KEY   The actual sk-or-v1-... key
//
// Bindings (configured in wrangler.toml):
//   RATE_KV              KV namespace used for per-IP rate-limit counters
//
// See README.md in this directory for the full deploy + verification runbook.

const ALLOWED_ORIGINS = new Set([
  'https://mattcordell.github.io',
  // 'http://localhost:8000', // uncomment for local dev (the app's documented dev server)
]);

const RATE_LIMIT_PER_HOUR = 50; // per source IP

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders(origin) });
    }

    // Origin allowlist (best-effort — Origin is set by browsers, spoofable by other clients)
    if (!ALLOWED_ORIGINS.has(origin)) {
      return new Response('Origin not allowed', { status: 403, headers: corsHeaders(origin) });
    }

    // Per-IP rate limiting via KV. KV is eventually consistent, so this is an
    // approximate (best-effort) limit — adequate for bounding casual abuse of a
    // demo, not a hard quota.
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const rateKey = `rl:${ip}:${hour}`;
    const current = parseInt((await env.RATE_KV.get(rateKey)) || '0', 10);
    if (current >= RATE_LIMIT_PER_HOUR) {
      return jsonResponse(429, { error: 'Rate limit exceeded' }, origin);
    }
    await env.RATE_KV.put(rateKey, String(current + 1), { expirationTtl: 3700 });

    // Buffer the request body before forwarding. The chat-completion payload is
    // small JSON, and buffering sidesteps the streaming-passthrough pitfalls of
    // forwarding `request.body` directly (some runtimes require a `duplex` hint
    // when the init contains a stream body). A buffered string is unambiguous.
    const reqBody = await request.text();

    // Model allowlist. This managed proxy bills the DEPLOYER's key, so it serves
    // FREE models only (slug ending in ":free"); paid models require the user's
    // own key via the direct route. The Origin check above is spoofable by any
    // non-browser client, so this server-side guard is the real bound preventing
    // someone from billing an expensive model to the deployer.
    let parsed;
    try {
      parsed = JSON.parse(reqBody);
    } catch (_e) {
      return jsonResponse(400, { error: 'Invalid JSON body' }, origin);
    }
    if (typeof parsed.model !== 'string' || !parsed.model.endsWith(':free')) {
      return jsonResponse(400, {
        error: 'Only free models (slug ending in ":free") are allowed via the managed proxy. Use your own OpenRouter key for paid models.',
      }, origin);
    }

    // Forward to OpenRouter
    let upstream;
    try {
      upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': origin,
          'X-Title': 'callistemon-ai',
        },
        body: reqBody,
      });
    } catch (_e) {
      // Don't echo the internal error detail back to the caller.
      return jsonResponse(502, { error: 'Upstream unreachable' }, origin);
    }

    // Pass body + status through; replace headers (preserve content-type, add CORS)
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        ...corsHeaders(origin),
      },
    });
  },
};

function jsonResponse(status, obj, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Allow the attribution headers too, so any client sending OpenRouter-style
    // headers passes preflight (the app itself only sends them on the direct route).
    'Access-Control-Allow-Headers': 'Content-Type, HTTP-Referer, X-Title',
    'Access-Control-Max-Age': '86400',
    // ACAO is origin-dependent; Vary prevents a shared cache reusing it cross-origin.
    'Vary': 'Origin',
  };
}
