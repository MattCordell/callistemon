# callistemon-ai-proxy

A minimal Cloudflare Worker that proxies OpenRouter chat-completion requests for
the callistemon static apps (starting with `eRequest-placer-AI`).

## Why this exists

GitHub Pages can't run server-side code, but putting the OpenRouter API key in
browser-readable JS is unacceptable — DevTools would leak it, and every visitor
would burn the deployer's credits. This Worker is the smallest piece of
server-side code that lets visitors use the AI features without each bringing
their own key:

- holds `OPENROUTER_API_KEY` as a Cloudflare **secret** (never in source);
- accepts `POST /chat/completions` from an allow-listed origin with **no** auth
  header;
- adds `Authorization: Bearer <secret>` and forwards to OpenRouter;
- applies an Origin allowlist + per-IP hourly rate limit to bound abuse.

The app's hybrid client (`eRequest-placer-AI/modules/openrouter-client.js`) uses
this proxy as the **default** route. Users who prefer their own key can tick
"Use my own OpenRouter key" in AI Settings to bypass the proxy entirely.

## Files

| File            | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `worker.js`     | The Worker source. Edit `ALLOWED_ORIGINS` to change allowlist. |
| `wrangler.toml` | Worker name, entrypoint, KV binding.                           |
| `.gitignore`    | Excludes `node_modules/`, `.wrangler/`, `.dev.vars`.           |

## Prerequisites

- A Cloudflare account (free tier — Workers free plan allows 100K requests/day).
- An OpenRouter API key (`sk-or-v1-...`).
- Wrangler CLI: `npm install -g wrangler`.

## Deploy

Run these from this directory (`ai-proxy/`):

```sh
# 1. Authenticate Wrangler with your Cloudflare account (opens a browser).
wrangler login

# 2. Create the KV namespace for rate-limit counters.
#    (On wrangler < 3.60 the command is `wrangler kv:namespace create RATE_KV`.)
wrangler kv namespace create RATE_KV
#    Copy the returned id into the `id = "..."` field in wrangler.toml.

# 3. Store the OpenRouter key as a secret (paste the sk-or-v1-... key when prompted).
wrangler secret put OPENROUTER_API_KEY

# 4. Deploy.
wrangler deploy
```

Note the published URL, e.g. `https://callistemon-ai-proxy.<account>.workers.dev`.

## Wire the app to the deployed URL

Once the Worker is live and verified (below), update
`eRequest-placer-AI/config.js` `AI_DEFAULTS`:

```js
PROXY_BASE_URL: 'https://callistemon-ai-proxy.<account>.workers.dev',
PROXY_DEPLOYED: true,
```

`PROXY_DEPLOYED` gates the proxy route in `openrouter-client.js`: while `false`,
the client refuses to POST clinical free-text to the (placeholder) proxy host.
Only flip it to `true` after the deploy is verified.

## Verify

1. **Happy path** — from DevTools on a tab whose origin is
   `https://mattcordell.github.io`:
   ```js
   await fetch('<proxy-url>/chat/completions', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       model: 'google/gemma-4-31b-it:free',
       messages: [{ role: 'user', content: 'ping' }],
     }),
   }).then(r => r.text());
   ```
   Expect a chat-completion JSON response.
2. **Foreign origin** — repeat from a non-allow-listed origin (e.g.
   `https://example.com`): expect **403**.
3. **Rate limit** — hit the proxy 51 times within one hour from the same IP:
   expect **429** on the 51st.
4. **Secret hygiene** — inspect the deployed source in the Cloudflare dashboard:
   confirm no API key in source and that the `OPENROUTER_API_KEY` secret is set.

## Local development

`wrangler dev` runs the Worker on `http://localhost:8787` using the same code
path. Uncomment the `http://localhost:8000` line in `ALLOWED_ORIGINS`
(`worker.js`) for the duration of local testing — that's the origin of the app's
documented dev server (`python -m http.server 8000`).

## Out of scope (intentionally)

This proxy is deliberately minimal. Do **not** add streaming support, response
caching, or model routing — those are application concerns and would bloat the
Worker. Authentication is Origin + rate-limit only; if abuse becomes a real
problem, add a shared-secret query parameter the app supplies and the Worker
checks (still spoofable by anyone who reads the deployed app JS, but raises the
bar another notch).
