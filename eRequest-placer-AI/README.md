# FHIR AU eRequesting — AI-Enhanced Placer Demo

A browser-based requesting clinician (placer) demo for [AU eRequesting](https://build.fhir.org/ig/hl7au/au-fhir-erequesting/). Sister of [eRequest-placer/](../eRequest-placer/) with AI-driven enhancements layered on top.

This app is **functionally identical** to its sibling right now — Phase 0 is a mechanical refactor of the source app from `<script>` tags + `window.App` globals to **ES6 modules**. AI features (reason coding, test selection, decision support) land in subsequent phases tracked by GitHub issues [`label:ai-erequesting`](https://github.com/MattCordell/callistemon/issues?q=label%3Aai-erequesting). See [PLAN.md](./PLAN.md) for the development plan and [ai-erequesting-spec.md](./ai-erequesting-spec.md) for the product spec.

## Running locally

ES6 modules cannot be loaded from `file://` — you **must** serve via HTTP:

```
python -m http.server 8000
```

Then open `http://localhost:8000/eRequest-placer-AI/`.

## File structure

```
index.html              HTML + CSS, single <script type="module" src="app.js">
config.js               Terminology URLs, ValueSets, AU profiles, SNOMED codes (named exports)
clinicians.js           Practitioner resources, specialties, favourites (named exports)
app.js                  Top-level imports + boot() called from DOMContentLoaded
modules/
  state.js              Shared mutable state (single object — see below)
  utils.js              UUID, formatAddress, date helpers, debug panel
  terminology.js        Ontoserver $expand, SNOMED $subsumes, fasting / site-specific preload
  patient.js            Patient search, autocomplete, form fill
  reason-tags.js        Reason tag chips, clinical notes autocomplete
  warnings.js           Warning logic + warning registry
  suggestions.js        Suggestion rules + metadata, compute & render
  test-list.js          Selected tests state, add/remove/render, favourites, body site
  bundle-builder.js     FHIR Transaction Bundle construction
  server.js             Send to server, QR modal, auth helpers
```

Every module declares its public surface with `export`; consumers `import` what they need by name. The browser resolves the import graph from `app.js` automatically.

## Shared state

State that lives across modules (the selected tests, the reason tags, the resolved FHIR base URL, etc.) is held in a single object exported from `modules/state.js`:

```js
import { state } from './modules/state.js';

state.selectedTests.push(...);   // module-shared mutation, visible to all importers
state.FHIR_BASE = newBase;       // applied by clicking "Use this server"
```

State that's only used inside one module stays inside that module (e.g. the subsumes cache in `terminology.js`, the body-site modal target in `test-list.js`).

## How to add a new warning

Edit **`modules/warnings.js`**.

1. Define your warning message:

```js
const MY_NEW_WARN = 'Your warning message here';
```

2. Write an async apply function. It should loop over `state.selectedTests`, call `setWarn(test, message, condition)` for each test, and re-render if anything changed:

```js
async function applyMyNewWarning() {
  let changed = false;
  for (let i = 0; i < state.selectedTests.length; i++) {
    const t = state.selectedTests[i];
    const condition = /* your logic, e.g. */ await snomedSubsumes('PARENT_CODE', t.code);
    changed = setWarn(t, MY_NEW_WARN, condition) || changed;
  }
  if (changed) renderSelectedTests();
}
```

3. Register it in the exported `warningRules` array at the bottom of the file:

```js
export const warningRules = [
  // ... existing rules ...
  { name: 'my-new-warning', apply: applyMyNewWarning },
];
```

The registry is called automatically whenever tests are added/removed or pregnancy status changes.

### Per-test history warnings

For warnings that check a patient's history (e.g. "already had this test recently"), add logic inside `checkTestHistoryWarning()` in the same file. This runs once per test when it's added.

## How to add a new test suggestion rule

Edit **`modules/suggestions.js`**.

1. Add metadata for any new suggested tests to `SUGGESTED_TESTS_META`:

```js
export const SUGGESTED_TESTS_META = {
  // ... existing entries ...
  'NEW_SNOMED_CODE': { display: 'Test display name', kind: 'PATH' },  // or 'IMAG'
};
```

2. Add a rule to `SUGGESTION_RULES`. Each rule has parent SNOMED codes (matched via `$subsumes` against the patient's reason tags) and test codes to suggest:

```js
export const SUGGESTION_RULES = [
  // ... existing rules ...
  { parents: ['PARENT_SNOMED_CODE'], tests: ['NEW_SNOMED_CODE'] },
];
```

If *any* reason tag is a subtype of a parent code, all tests in that rule are suggested (minus any already selected).

## How to add a new clinician

Edit **`clinicians.js`**. Add entries to `practitionerResources`, `roleSpecialties`, and `userFavourites`, then add a matching `<option>` in the doctor-select dropdown in `index.html`.

## Decision support: agent patient-history tool

Feature C (decision support) gives the agent a read-only `query_patient_history` tool
(`modules/patient-history-tool.js`) so history-dependent rules are actionable — e.g.
"don't repeat a test resulted recently" (Observation / DiagnosticReport), "flag a test
with no documented indication" (Condition), or "avoid this test on medication X"
(MedicationRequest). The agent decides what to pull per rule; the app no longer has to
pre-fetch a fixed set.

It is a thin local function (no MCP server) reusing the existing authed `fetch`, with
guardrails enforced in the impl regardless of what the model asks:

- **read-only** — GET only;
- **allow-list** — `Observation`, `Condition`, `MedicationRequest`, `DiagnosticReport`, `ServiceRequest`;
- **patient-scoped** — every query is forced to `subject=Patient/{id}`; the model cannot widen it;
- **`_count` capped** and a **per-evaluation query budget** to bound latency / cost;
- offered only when the patient is server-resolved; every query is logged to the debug panel.

To adjust the limits, edit the constants (`ALLOWED_TYPES`, `MAX_COUNT`, `QUERY_BUDGET`) at the
top of `modules/patient-history-tool.js`.

> **Data egress note.** Enabling decision support sends clinical context to the LLM. This tool
> expands that to the patient's actual lab values, diagnoses, medications, and reports
> (summarised, with no name/MRN). On the default proxy route with a free-tier model that data
> reaches a provider that may log it. For real patient data, use the "Use my own OpenRouter key"
> route with a paid/non-logging model. See spec §9.

## What's next

This directory is the scaffold for the AI-enhanced sister of `eRequest-placer`. Phase 1+ work introduces:

- **Phase 1** — shared AI infrastructure (Openrouter client, Ontoserver MCP transport with REST fallback, generic agent loop, AI settings UI).
- **Phase 2** — Feature A: AI-assisted reason coding from free-text clinical notes.
- **Phase 3** — Feature B: AI-assisted test selection from free-text descriptions.
- **Phase 4** — Feature C: pre-send decision support (advisory inline panel + blocking modal for serious findings).
- **Phase 5** — polish: master AI toggle, accessibility, acceptance walk-through.

See [PLAN.md](./PLAN.md) and the issues tagged `ai-erequesting`.
