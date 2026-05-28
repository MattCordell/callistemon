# Development Plan — AI-Enhanced eRequest Placer

**Companion document to:** [ai-erequesting-spec.md](./ai-erequesting-spec.md) (product spec — *what* is being built).
**This document covers:** *how* it will be built — phasing, file layout, integration points, risks.
**Tracking:** GitHub issues labelled `ai-erequesting` (one per phase below).

---

## Context

The callistemon repo hosts a suite of static, GitHub-Pages-deployed FHIR demo apps under `https://mattcordell.github.io/callistemon/` (the unrelated `callistemon.site` referenced in module configs is the FHIR server backend, not the Pages site). The flagship [eRequest-placer/](../eRequest-placer/) lets a clinician build an AU eRequesting FHIR Transaction Bundle (Patient + Encounter + group Task + per-test Task + ServiceRequests + optional pregnancy Observation) and POST it to a configurable FHIR server.

The product spec calls for a **sister app at [./](./) (`eRequest-placer-AI/`)** that retains every behaviour of the original and layers three AI enhancements on top:

- **Feature A** — derive SNOMED CT reason codes from free-text clinical notes (replaces manual autocomplete).
- **Feature B** — derive SNOMED CT procedure codes from free-text test descriptions (supplements existing combo boxes).
- **Feature C** — pre-send decision support (appropriateness, suggestions, duplicates against prior ServiceRequests, context completeness) with a two-tier display (inline advisory + blocking modal for serious findings).

All three features share one AI pipeline: an Openrouter chat-completions call (OpenAI-compatible) that uses Ontoserver-backed `search_concepts` / `lookup_concept` tools, ECL-scoped per feature, with an accuracy-over-completeness principle.

The original `eRequest-placer` stays unchanged as the reference implementation. The new app deploys to `https://mattcordell.github.io/callistemon/eRequest-placer-AI/` as a self-contained static directory.

---

## Settled architectural decisions

These were decided up front and should not be re-litigated mid-phase:

1. **ES6 modules** (not `window.App` globals). Single `<script type="module" src="app.js">` entry. Imports/exports replace global namespace. Reference pattern: [../sup-sup/app.js](../sup-sup/app.js).
2. **Ontoserver: MCP first, REST fallback.** Probe `https://ontoserver.app/mcp` at boot; on failure, transparently use `https://tx.dev.hl7.org.au/fhir` `ValueSet/$expand` + `CodeSystem/$lookup` (the CORS-proven path used by the existing app). Single unified tool surface; agent loop unchanged either way.
3. **All three features in scope** (A + B + C in the same build).
4. **Copy files into [./](./) from [../eRequest-placer/](../eRequest-placer/) and refactor as we copy.** Do not modify the original.

---

## Implementation phases

### Phase 0 — Scaffold (mechanical ES6 refactor, zero behaviour change)

Copy everything from [../eRequest-placer/](../eRequest-placer/) into this directory and convert to modules:

- Replace ten `<script src="…">` tags in `index.html` with one `<script type="module" src="app.js">`.
- Translate every file from `window.App.foo = …` to `export function foo` / `export const foo`. Replace `App.foo(…)` call sites with explicit `import`s.
- Extract shared mutable state into a new `modules/state.js` (`reasonTags`, `selectedTests`, `ptMode`, `currentPatientResource`, `lastRequisitionId`, `activeProviderSupplement`, `viewer`, `FHIR_BASE`, `notesAnchor`). All modules import `state` from this leaf module to avoid circular imports through `app.js`.
- Convert the `app.js` IIFE to a top-level import block + `boot()` called from `DOMContentLoaded` (mirrors [../sup-sup/app.js](../sup-sup/app.js)).

**Files copied & refactored:** `index.html`, `config.js`, `clinicians.js`, `app.js`, all of `modules/*.js`.
**README note:** ES6 modules require an HTTP server; `file://` no longer works (browsers block module loads from `file:`).

**Verify:** serve via `python -m http.server 8000`, exercise the existing flows (patient search/create, reason autocomplete, pathology + radiology search, warnings, build + send bundle, QR). Compare a sent bundle byte-for-byte (ignoring UUIDs) against the original.

---

### Phase 1 — Shared AI infrastructure (spec §3, §6)

Build the substrate before any feature UI lands. Add to [./config.js](./config.js):

```js
export const AI_DEFAULTS = {
  OPENROUTER_BASE: 'https://openrouter.ai/api/v1',
  OPENROUTER_MODEL: 'anthropic/claude-sonnet-4-5',
  MCP_URL: 'https://ontoserver.app/mcp',
  REST_TX_BASE: 'https://tx.dev.hl7.org.au/fhir',
  REASON_ECL: '< 404684003 |Clinical finding|',
  TEST_ECL: '< 71388002 |Procedure|',
  PRE_PROMPT_SUPPLEMENTS: 'When a pathology specimen type is not specified, prefer serum, then blood, then urine (in that order).',
  GUIDELINES_SUMMARY: '',
  AI_FEATURES_ENABLED: true,
  DECISION_SUPPORT_ENABLED: true,
};
```

New modules under [./modules/](./modules/):

- **`settings-ai.js`** — localStorage-backed `getAiSettings()` / `setAiSetting()` over `AI_DEFAULTS`. Extends the existing `#server-panel` popout with an "AI Settings" `<details>` block (do not introduce a new floating button). API key, model, two ECLs, pre-prompt supplements, guidelines summary, two toggle checkboxes. Document API-key risk in a JSDoc comment. Fires `CustomEvent('ai-enabled-changed')` on toggle.
- **`openrouter-client.js`** — `chatCompletion({ model, messages, tools, signal })` → POST to `${OPENROUTER_BASE}/chat/completions`, OpenAI-format response. Non-streaming. Headers include `Authorization: Bearer <key>`, `HTTP-Referer`, `X-Title`. One retry on 429/5xx. `setDebugUrl(url)` before fetch so calls appear in the existing debug panel.
- **`ontoserver-mcp.js`** — `class McpClient` with `initialize()`, `listTools()`, `callTool(name, args)`; JSON-RPC over POST, captures `Mcp-Session-Id`. Handles both `application/json` and `text/event-stream` responses (parse last `data:` event). Exports `probeMcp(url, timeoutMs)` (returns boolean), plus `searchConcepts({query, valueSetEcl, count})` and `lookupConcept({system, code})` normalised to `{code, display, system}[]`. Throws `McpTransportError` on any failure so the wrapper can fall back. `setDebugUrl` on every POST.
- **`ontoserver-rest.js`** — identical surface, REST backend. `searchConcepts` uses `${REST_TX_BASE}/ValueSet/$expand?url=http://snomed.info/sct?fhir_vs=ecl/{ecl}&filter={q}&count={n}&includeDesignations=true`; `lookupConcept` uses `${REST_TX_BASE}/CodeSystem/$lookup?system=…&code=…`. Maps `expansion.contains` → `{code, display, system}`. Surface `OperationOutcome.diagnostics` on errors. The expand pattern is already used in [../eRequest-placer/modules/terminology.js](../eRequest-placer/modules/terminology.js) — reuse it.
- **`ontoserver-tools.js`** — `initOntoserverBackend()` runs `probeMcp` at boot, stores `backend = 'mcp' | 'rest'`. Exposes the unified `searchConcepts` / `lookupConcept` (delegates; on first MCP failure during a call, sticky-fall-back to REST). Exports `getTools()` returning OpenAI tool descriptors with names `search_concepts` and `lookup_concept` (snake_case, matching spec §3.2). `getActiveBackendName()` for the debug banner.
- **`ai-agent.js`** — generic `runAgent({systemPrompt, userMessage, tools, toolImpl, model, maxIterations=8, signal})`. Iterates: model call → if `tool_calls`, dispatch each via `toolImpl[name](JSON.parse(args))`, push tool messages, loop; otherwise parse final JSON (try strict `JSON.parse`, then ```json fence extract, then balanced bracket extract). Returns `{finalContent, parsed, transcript}`. Cancellable via `AbortController`.

**Manual test harness:** add a `#ai-test-harness` block in `index.html`, revealed only by `?aitest=1`. Buttons that exercise `searchConcepts` and `runAgent` end-to-end. Used during phases 1–4; left behind the `?aitest=1` gate at the end.

**Verify:** open `?aitest=1`, set Openrouter key in settings, click both test buttons. Confirm: an Openrouter POST in DevTools, MCP POSTs (or REST GETs) interleaved with tool_call responses, all URLs land in the debug panel, `getActiveBackendName()` matches reality. Force REST by setting a temporary localStorage flag and re-test.

---

### Phase 2 — Feature A: reason coding (spec §4, §10.5-9)

- **New `modules/ai-reason-coding.js`** — `suggestReasonCodes()` reads `#clinical-notes`, derives age from `#patient-dob`, reads `#patient-gender` and `#pregnancy-status`, loads `REASON_ECL` from settings, composes the spec §4.5 system prompt with `{reason_ecl}` substituted, calls `runAgent` with `getTools()` and a `toolImpl` that **coerces `valueSetEcl` to `REASON_ECL`** server-side regardless of what the agent passes. Validates each parsed entry; **confirms each in scope** via a final `searchConcepts({query: display, valueSetEcl: REASON_ECL})` (drop anything not present) to enforce spec §10.3 even against hallucinations. Returns `{codes, error}`.
- **New `modules/ai-ui.js`** — shared UI helpers used by A/B/C:
  - `renderSuggestionReviewList({container, items, onAccept, onReject, onAcceptAll, onRejectAll, kind})` with `kind ∈ {reason, test, finding}` controlling chip styling. AI-suggested reason chips use `bg-indigo-50 border-indigo-200 text-indigo-800` + ✨ icon (visually distinct from existing `bg-emerald-50` manual chips at [../eRequest-placer/modules/reason-tags.js](../eRequest-placer/modules/reason-tags.js)).
  - `setLoadingState(btn, isLoading, text)`, `renderEmptyState`, `renderErrorState(container, msg, onRetry)`.
  - Stubs for the Tier-1 advisory panel and Tier-2 modal (filled in Phase 4).
- **`index.html` additions:** below `#clinical-notes`, a button row `<button id="ai-suggest-codes" class="… ai-feature-controls">✨ Suggest codes</button>` plus `<div id="ai-codes-review" class="hidden">`. The `.ai-feature-controls` class is the master-toggle hook.
- **`reason-tags.js` extension:** export a small `addReasonTag({system, code, display})` helper to share between manual autocomplete and AI acceptance.
- **`app.js` wiring:** input listener disables the button when notes are empty; click → loading state → `suggestReasonCodes()` → render review list. Accept individual / accept-all routes through `addReasonTag`.

**Verify:** spec §10.5-9 — type clinical notes, click Suggest codes, accept individual + accept-all, manual autocomplete still works on the same textarea, empty input keeps button disabled, clearing the API key surfaces an inline retry error without blocking the rest of the form.

---

### Phase 3 — Feature B: test selection (spec §5, §10.10-16)

- **New `modules/ai-test-selection.js`** — `suggestTests()` reads `#ai-test-input` free text, gathers age/sex/pregnancy + summarised already-selected tests (`code + display + kind`), loads `TEST_ECL` + `PRE_PROMPT_SUPPLEMENTS`, composes the spec §5.6 system prompt with both substitutions, runs the agent with `valueSetEcl` coerced to `TEST_ECL`, validates and confirms in-scope. Each result includes `kind ∈ {PATH, IMAG}` (asked of the agent; default `PATH` on absence).
- **`index.html` additions:** new card above the Pathology/Radiology tabs with `<textarea id="ai-test-input">` and `<button id="ai-encode-tests" class="… ai-feature-controls">Encode tests</button>` plus `<div id="ai-tests-review">`. Existing combo box / panel selection untouched (spec §5.8).
- **`app.js` wiring:** accept individually / bulk-accept calls existing `addSelectedTest(...)` — routes through every existing supplement-fetch, warning, body-site, and rendering path. **No FHIR bundle changes.**

**Verify:** spec §10.10-16 — enter free-text tests, accepted tests appear in `#selected-tests` identically to manual ones (priority, supplement props, fasting warnings, body-site modal trigger). Pre-prompt supplement biases ambiguous "iron studies" to serum. Inspect a built bundle — ServiceRequests indistinguishable from manually selected.

---

### Phase 4 — Feature C: decision support (spec §C.1-13)

- **New `modules/prior-requests.js`** — `fetchAndSummarisePrior(patientId)`: GETs `${FHIR_BASE}/ServiceRequest?subject=Patient/{id}&_sort=-authored&_count=20`, filters `status ∈ {active, completed, on-hold}`, returns compact `[{code, display, system, authored}]`. On failure or empty, returns `[]` (must not block). `setDebugUrl` on the URL. If the server 4xxs on `_sort=-authored`, retry once with `-_lastUpdated`. The existing fetch monkey-patch in [../eRequest-placer/modules/server.js](../eRequest-placer/modules/server.js) means FHIR auth is applied automatically.
- **New `modules/ai-decision-support.js`** — `evaluateRequest(bundle)`: extracts SRs (code+display), reasonCodes, clinical notes, resolves patient id from `state.currentPatientResource`. Composes spec §C.7 system prompt with `{guidelines_summary}`. Returns `{result: DecisionResult | null, error}` where `result` matches spec §C.8 shape (`overall_severity`, `findings[].severity`, `dimension`, `summary`, `detail`, `related_tests`). `shouldRunDecisionSupport(bundle, notes)` gates on toggle + ≥1 test + notes present. `appendAcknowledgementNote(bundle, seriousFindings)` mutates the bundle, adding a `note[]` entry to every ServiceRequest summarising the override (spec §C.10).
- **`ai-ui.js` extension** — `renderAdvisoryPanel({container, findings, onAddTest, onDismiss})` (Tier 1) and `openSeriousReviewModal({findings, advisoryFindings})` returning a Promise resolved by edit/proceed (Tier 2: focus-trap modal, `aria-modal=true`, mandatory checkbox before Proceed enables).
- **`server.js` refactor** — change `initSendButton()` to `initSendButton({ preSendHook = async () => ({proceed: true}) } = {})`. The hook receives the built bundle, may mutate it (for the ack note), and returns `{proceed: boolean}`. If `false`, abort send and unset the sending overlay.
- **`app.js` wiring** — pass a `preSendHook` that:
  1. If `!shouldRunDecisionSupport(bundle, notes)` → `{proceed: true}`.
  2. Run `evaluateRequest(bundle)`. On error or `overall_severity === 'none'` → optionally show a brief "decision support unavailable" status, proceed.
  3. Always render the Tier-1 advisory panel into `#ai-advisory-panel`.
  4. If `overall_severity === 'serious'`, await the Tier-2 modal. On `edit`, `{proceed: false}`. On `proceed`, `appendAcknowledgementNote(bundle, …)` and `{proceed: true}`.
- **`index.html` additions:** `<div id="ai-advisory-panel" class="hidden ai-feature-controls">` above Selected Tests, and a modal backdrop `#ai-serious-backdrop` mirroring the existing `#body-site-backdrop` markup.

**Verify:** spec §C.13 — server-resolved patient + notes + tests + Send → see Openrouter and prior-requests calls in the debug panel; force an advisory finding (Tier 1 only) and a serious one (Tier 2 modal, checkbox required, proceed appends ack note to every SR.note in the posted bundle); decision-support toggle off bypasses entirely; clearing the API key surfaces "decision support unavailable" and proceeds; empty notes / zero tests skips silently.

---

### Phase 5 — Polish & verification

- Master AI toggle: `settings-ai.js` fires `ai-enabled-changed`; `app.js` listens and toggles the `hidden` class on every `.ai-feature-controls` element. Original manual flows (autocomplete, combo boxes, send) untouched.
- ECL empty guards: if `REASON_ECL` is blank, disable `#ai-suggest-codes` with a tooltip; same for `TEST_ECL` and the test card (spec §7).
- Debug panel banner: print the active Ontoserver backend (`mcp` / `rest`) and the resolved Openrouter model once at boot.
- Accessibility: `aria-label`s on icon-only buttons, `<ul role="list">` for review lists, focus-trap + return-focus on the serious modal, `aria-live="polite"` for loading status, 4.5:1 contrast on indigo chips.
- Extend [./README.md](./README.md): file structure (new modules listed), AI features section (key setup, ECL defaults, MCP/REST selection logic, decision-support behaviour), "how to extend" with the agent pattern, running locally (`python -m http.server`).
- Walk through every numbered acceptance criterion (spec §10 1-16 and §C.13 1-10), tick each off, note any deviations.

---

## Critical files

**New** (under [./modules/](./modules/)):

- `state.js` — single source of mutable shared state
- `settings-ai.js` — localStorage + settings UI
- `openrouter-client.js` — chat completions + tool calling
- `ontoserver-mcp.js` — MCP Streamable-HTTP transport
- `ontoserver-rest.js` — REST fallback (CORS-proven path)
- `ontoserver-tools.js` — backend selection + unified tool surface
- `ai-agent.js` — generic agent loop
- `ai-reason-coding.js` — Feature A
- `ai-test-selection.js` — Feature B
- `ai-decision-support.js` — Feature C
- `prior-requests.js` — prior SR query (spec §C.5)
- `ai-ui.js` — review lists, advisory panel, serious modal

**Modified during Phase 0 copy** (the same ten files as eRequest-placer, refactored): `index.html`, `config.js`, `clinicians.js`, `app.js`, `modules/{utils,terminology,patient,reason-tags,warnings,suggestions,test-list,bundle-builder,server}.js`. Key non-mechanical changes during later phases:
- `modules/server.js` — `initSendButton({preSendHook})` parameterised (Phase 4)
- `modules/reason-tags.js` — extract `addReasonTag` export (Phase 2)
- `app.js` — `DOMContentLoaded` boot, master-toggle listener, `preSendHook` wiring

## Patterns to reuse (do not reinvent)

- `expandFromOntoserver` request shape — see [../eRequest-placer/modules/terminology.js](../eRequest-placer/modules/terminology.js). Same headers, same SNOMED `fhir_vs=ecl/…` convention for `ontoserver-rest.js`.
- Settings popout structure (`#server-panel`, `#server-toggle`, `#server-close`) — extend, don't duplicate. See [../eRequest-placer/app.js](../eRequest-placer/app.js).
- Auth monkey-patch on `window.fetch` — see [../eRequest-placer/modules/server.js](../eRequest-placer/modules/server.js). This applies automatically to the prior-requests query in Phase 4.
- Debug panel API (`setDebugUrl`) — see [../eRequest-placer/modules/utils.js](../eRequest-placer/modules/utils.js). Every new fetch must call it.
- ES6 module + `state` object orchestrator pattern — see [../sup-sup/app.js](../sup-sup/app.js).

## Risks & unknowns

1. **MCP CORS at `https://ontoserver.app/mcp`** — the fallback handles failure transparently. The boot banner surfaces which backend is live.
2. **Model identifier** — `anthropic/claude-sonnet-4-5` is the spec default. Settings allow runtime swap. Verify availability on Openrouter at build time.
3. **MCP tool names** — spec assumes `search_concepts` / `lookup_concept`. `listTools()` at probe time should confirm; if Ontoserver MCP names differ, translate inside `ontoserver-mcp.js` keeping the unified surface.
4. **Agent JSON output reliability** — defensive extractor handles fences and stray prose; surface true parse failure as the empty/error state per spec §4.7.
5. **`_sort=-authored` server support** — fall back to `-_lastUpdated` once if rejected.
6. **`file://` no longer works** — locked ES6-modules decision. Document in README.
7. **Ack-note placement** — appended to every ServiceRequest's `note[]` in the bundle. Flag if a different convention (single SR, Provenance) is preferred.

---

## Verification — end-to-end (after Phase 5)

1. **Smoke** — `python -m http.server 8000` in repo root, open `/eRequest-placer-AI/`. Open settings popout, paste an Openrouter API key. Confirm boot banner shows backend + model.
2. **Phase-0 parity** — Disable AI features (master toggle off). Walk every interaction in the original app's README; bundle output should be byte-identical (UUIDs aside) to a corresponding `eRequest-placer/` send.
3. **Feature A** — Clinical notes: "Type 2 diabetes with microalbuminuria, eGFR declining." Click Suggest codes. Expect `44054006`, `90708001` (or equivalent), all indigo, all individually accept/rejectable. Verify final bundle's `reasonCode` array contains accepted codes only.
4. **Feature B** — Free text: "FBC, fasting lipids, LFTs, urine MCS, chest X-ray." Click Encode tests. Accept all. Verify mixed PATH+IMAG ServiceRequests appear with priority controls, supplement props, and fasting warnings firing where appropriate.
5. **Feature C** — Use a server-resolved patient with prior requests. Build a request that should be flagged. Confirm Tier-1 panel appears with advisory finding. Then build a serious case and confirm the modal blocks send, checkbox is required, proceed appends the ack note, the posted bundle's ServiceRequest.note contains the ack.
6. **Failure modes** — Clear the Openrouter key; each feature degrades to a retry-able inline error without breaking the form. Force REST; backend banner updates; everything still works.
7. **Acceptance walkthrough** — Tick every line of spec §10 (1-16) and §C.13 (1-10).
