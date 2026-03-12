# eDiagnosticReport — Laboratory

A browser-based pathology laboratory simulator that lets users act as a lab provider, view claimed pathology service requests, enter test results, and post AU-compliant DiagnosticReport + Observation resources to a FHIR R4 server.

## Quick Start

1. Open `index.html` in a browser.
2. Select a **provider organisation** from the dropdown (e.g. Callistemon Diagnostic Services).
3. Choose a **FHIR server** (or type a custom URL).
4. Click **Load Backlog** to fetch claimed pathology tasks.
5. Click **Enter Results** on a backlog item, fill in values (or click **Autocomplete**), then **Submit Results**.

---

## Architecture

```
eDiagnosticReport-laboratory/
  index.html                        Entry point
  app.js                            Main orchestrator — wires all modules together
  config.js                         Orgs, FHIR server presets, profile URLs, constants
  styles.css                        Dark theme styling

  modules/
    test-definitions.js             Master test panel definitions (FBC, LFT, UEC)
    provider-calli.js               Overrides for Callistemon Diagnostic Services
    provider-bb.js                  Overrides for BB Diagnostics
    backlog-engine.js               Backlog query, super set detection, observable merging
    report-builder.js               Builds FHIR transaction Bundles
    fhir-client.js                  HTTP operations with retry/fallback
    fhir-helpers.js                 Pure FHIR utility functions
    ui-rendering.js                 DOM rendering (backlog table, forms, toasts)
    autocomplete-engine.js          Random realistic value generation
    formatters.js                   Display formatting utilities
```

---

## Test Configuration

### Master Definitions

All test panels are defined in `modules/test-definitions.js`. This is the single source of truth for what tests exist and their default configuration.

Each test definition has:

| Field         | Description                                              |
|---------------|----------------------------------------------------------|
| `code`        | SNOMED CT code for the test/panel                        |
| `system`      | Code system URI (`http://snomed.info/sct`)               |
| `display`     | Standard SNOMED display text (used in FHIR `coding`)     |
| `displayName` | Short UI label (e.g. "FBC") — maps to `CodeableConcept.text` |
| `superSet`    | Super set membership string (e.g. `'General Chemistry'`) or `null` |
| `headings`    | Array of heading groups, each containing observables     |

Each observable within a heading has:

| Field            | Description                                          |
|------------------|------------------------------------------------------|
| `display`        | UI label (e.g. "Haemoglobin")                        |
| `loincCode`      | LOINC code (e.g. "718-7")                            |
| `loincDisplay`   | Full LOINC display text (used in FHIR `coding`)      |
| `unit`           | Display unit (e.g. "g/L")                            |
| `ucumCode`       | UCUM unit code for FHIR `valueQuantity`              |
| `referenceRange` | `{ low, high }` numeric bounds                       |
| `decimalPlaces`  | Rounding precision for values                        |
| `method`         | *(optional)* Method text — included in `Observation.method.text` when present |

### Adding a New Test Panel

Add an object to the `TEST_DEFINITIONS` array in `modules/test-definitions.js`:

```js
{
  code: '271236005',                    // SNOMED code
  system: 'http://snomed.info/sct',
  display: 'Serum lipids',             // SNOMED display
  displayName: 'Lipids',               // Short UI label
  superSet: 'General Chemistry',       // or null for standalone
  headings: [
    {
      title: 'Lipid Panel',
      observables: [
        {
          display: 'Total cholesterol',
          loincCode: '2093-3',
          loincDisplay: 'Cholesterol [Mass/volume] in Serum or Plasma',
          unit: 'mmol/L',
          ucumCode: 'mmol/L',
          referenceRange: { low: 0, high: 5.5 },
          decimalPlaces: 1
        }
        // ...more observables
      ]
    }
  ]
}
```

The new test will automatically:
- Appear in the backlog when a matching ServiceRequest is found (matched by SNOMED code)
- Generate a data entry form with the correct fields, units, and reference ranges
- Participate in super set merging if `superSet` is set

### Adding a New Super Set

Add an entry to the `SUPER_SETS` export in `modules/test-definitions.js`:

```js
export const SUPER_SETS = {
  'General Chemistry': { /* existing */ },
  'Haematology': {
    code: '252275004',
    system: 'http://snomed.info/sct',
    display: 'Haematology test',
    displayName: 'Haematology'
  }
};
```

Then set `superSet: 'Haematology'` on any test definitions that belong to it. When 2+ tests in the same super set appear in the same requisition, they are automatically merged into a single backlog entry.

---

## Provider-Specific Overrides

Each provider organisation can customise test definitions without duplicating the master config. Override files are in `modules/provider-<code>.js`, where `<code>` matches the key in `config.js` `FILLER_ORGS`.

### How Overrides Work

Overrides are keyed by the **master LOINC code** of the observable to customise. Any observable property can be overridden — the override is shallow-merged onto the master, with `referenceRange` deep-merged so you can override just one bound.

```
Master definition (test-definitions.js)
  └── Albumin: loincCode '1751-7', no method
        │
        ├── provider-calli.js overrides '1751-7':
        │     loincCode → '61152-5', method → 'BCP dye binding'
        │
        └── provider-bb.js overrides '1751-7':
              loincCode → '61151-7', method → 'BCG dye binding'
```

### Override Examples

**Change the LOINC code and add a method** (different analytical technique):

```js
// modules/provider-bb.js
export const PROVIDER_OVERRIDES = {
  '1751-7': {
    loincCode: '61151-7',
    loincDisplay: 'Albumin [Mass/volume] in Serum or Plasma by Bromocresol green (BCG) dye binding method',
    method: 'BCG dye binding'
  }
};
```

**Override just the reference range:**

```js
'1920-8': {
  referenceRange: { low: 5, high: 30 }
}
```

**Add only a method** (same LOINC, same ranges):

```js
'2951-2': {
  method: 'ISE'
}
```

**Override a single reference range bound** (deep-merged with master):

```js
'14682-9': {
  referenceRange: { high: 100 }    // low stays as master default
}
```

### Adding a New Provider

1. Create `modules/provider-<code>.js`:

```js
export const PROVIDER_OVERRIDES = {
  // overrides go here
};
```

2. Add the organisation to `config.js` under `FILLER_ORGS` with the matching key.

3. Register the overrides in `app.js`:

```js
import { PROVIDER_OVERRIDES as OVERRIDES_NEW } from './modules/provider-new.js';

const PROVIDER_OVERRIDES_MAP = {
  calli: OVERRIDES_CALLI,
  bb: OVERRIDES_BB,
  new: OVERRIDES_NEW        // add here
};
```

4. Add an `<option>` to the org dropdown in `index.html`.

---

## FHIR Output

Resources are posted as a FHIR transaction Bundle. The app produces:

### DiagnosticReport
- Profile: `au-pathologyreport`
- `code`: SNOMED code from the test definition (or super set SNOMED if merged)
- `basedOn`: references to all covered ServiceRequests
- `result`: references to individual Observations

### Observation (one per filled result field)
- Profile: `au-core-diagnosticresult-path`
- `code`: LOINC coding from the observable config
- `valueQuantity`: numeric value with UCUM unit
- `referenceRange`: low/high bounds (when defined)
- `method.text`: analytical method string (when defined in provider override)

### Task Updates
- Each diagnostic Task is marked `status: completed` with `businessStatus: results-available`
- Group Task is marked completed when all sibling tasks in the requisition are done

---

## Super Set Behaviour

Tests can declare membership in a super set via the `superSet` property. When **2 or more** tests in the same requisition belong to the same super set, they are merged into a single backlog entry:

- Observables are deduplicated by LOINC code (first occurrence wins)
- Headings with the same title are combined
- A single DiagnosticReport is created with the super set's SNOMED code
- All covered ServiceRequests are referenced in `basedOn`

If only **1** test in a super set appears in a requisition, it is treated as a standalone entry.

---

## Key Design Decisions

- **Vanilla JS + ES6 modules** — no build step, no framework dependencies
- **Config-driven forms** — the data entry UI is generated entirely from test definitions
- **Master + overrides pattern** — avoids duplicating entire test configs per provider; overrides are small and focused
- **Flat Observation model** — DiagnosticReport references individual Observations directly (no grouping Observation layer)
- **Submission timestamp** — `effectiveDateTime` is set to the moment the user clicks Submit
- **Transaction with fallback** — the FHIR Bundle is posted as a transaction; if the server doesn't support transactions, individual requests are sent as a fallback
