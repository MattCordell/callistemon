# eDiagnosticReport-laboratory - Implementation Plan

## Context

Build a new app that simulates a pathology laboratory workflow. Users assume the role of one of two provider organisations, view a backlog of claimed ServiceRequests, enter test results via a config-driven data entry form, and post AU-compliant DiagnosticReport + Observation resources back to the FHIR server.

The app follows the established callistemon pattern: vanilla JS + Tailwind CSS + ES6 modules, no frameworks.

---

## File Structure

```
eDiagnosticReport-laboratory/
  index.html                        # Entry point (Tailwind CDN, dark theme)
  app.js                            # Main orchestrator
  config.js                         # Orgs, FHIR settings, profile URLs
  styles.css                        # Dark theme (purple/cyan accents)
  modules/
    fhir-client.js                  # HTTP operations with retry
    fhir-helpers.js                 # Pure FHIR utility functions
    formatters.js                   # Display formatting (reuse from filler-reception)
    ui-rendering.js                 # DOM rendering: backlog list + data entry form
    test-definitions.js             # Test configs (FBC, LFT, UEC) with observables
    backlog-engine.js               # Backlog query, super set detection & merging
    report-builder.js               # Builds FHIR transaction Bundle
    autocomplete-engine.js          # Random realistic value generation
```

---

## Design Decisions

### Test Configuration Format
**Single `test-definitions.js` ES module** exporting a JS array. Avoids async JSON fetching, consistent with project patterns. Can split later if test count grows past ~15.

### Test Super Set Membership
Each test definition has an optional `superSet: 'General Chemistry'` string property. Super set membership is detected at runtime by scanning all loaded definitions.

### Headings
**Plain strings, not LOINC-encoded.** Headings are display-only organisational labels for the form/report. They don't appear as coded elements in FHIR output.

### DiagnosticReport for Super Sets
When a super set is invoked, create a **single DiagnosticReport** with the super set's own SNOMED code (e.g., 166312007|Blood chemistry| for General Chemistry). The super set code is stored in the test-definitions config alongside the super set name.

### Observation Structure
**Flat result list** -- DiagnosticReport.result references individual Observations directly (no grouping Observation layer). Each observable gets its own Observation with a LOINC code.

### Backlog Loading
**Auto-query by org** -- on selecting an org and clicking "Load Backlog", the app queries the FHIR server for all accepted Tasks owned by that org. No URL/search/QR input needed.

### Effective DateTime
**Submission time (now)** -- effectiveDateTime on DiagnosticReport and Observations is set to the current timestamp when the user clicks Submit.

### Display Names (Original Text)
Each test, super set, and observable has two display properties:
- `display` -- the standard terminology display (SNOMED/LOINC), used in FHIR `coding[].display`
- `displayName` -- custom UI label (e.g., "FBC", "General Chemistry"), used in the UI and mapped to `CodeableConcept.text` in FHIR output

---

## Data Model: Test Definition

```js
// Individual test definition
{
  code: '26604007',
  system: 'http://snomed.info/sct',
  display: 'Full blood count',          // SNOMED display -> coding.display
  displayName: 'FBC',                   // Custom UI label -> CodeableConcept.text
  superSet: null,                       // or 'General Chemistry'
  headings: [
    {
      title: 'Red Cell Parameters',
      observables: [
        {
          display: 'Haemoglobin',                            // Custom UI label
          loincCode: '718-7',
          loincDisplay: 'Hemoglobin [Mass/volume] in Blood', // LOINC display -> coding.display
          unit: 'g/L',
          ucumCode: 'g/L',
          referenceRange: { low: 120, high: 160 },
          decimalPlaces: 0
        },
        // ...more observables
      ]
    }
  ]
}

// Super set definition (separate export)
export const SUPER_SETS = {
  'General Chemistry': {                   // key = superSet string used in test defs
    code: '166312007',
    system: 'http://snomed.info/sct',
    display: 'Blood chemistry',            // SNOMED display -> coding.display
    displayName: 'General Chemistry'       // Custom UI label -> CodeableConcept.text
  }
};
```

Observable deduplication within a super set uses `loincCode` as the unique key.

---

## Module Responsibilities

### `config.js`
- `FILLER_ORGS` -- copied from filler-reception (Callistemon + BB Diagnostics)
- FHIR server base URL (default `https://server.callistemon.site/fhir`)
- FHIR client settings (timeout, retry, headers)
- Profile URLs: `au-pathologyreport`, `au-core-diagnosticresult-path`
- Category codings (laboratory)

### `modules/test-definitions.js`
- Exports `TEST_DEFINITIONS` array with FBC, LFT, UEC
- Exports `SUPER_SETS` object with super set metadata (SNOMED codes, display names)
- Each test with full observable list: LOINC codes, UCUM units, reference ranges
- Source data: SPIA spreadsheets in `pathology-stuff/SPIA/`

### `modules/backlog-engine.js`
- `buildBacklog(tasks, serviceRequests, testDefs)`:
  1. Filter to pathology SRs with matching test definition
  2. Group by requisition (`Task.groupIdentifier.value`)
  3. Within each requisition, detect super set: if 2+ SRs map to tests in same `superSet`, merge into single backlog entry
  4. Return structured backlog items
- `mergeObservables(testDefs)`: union of all headings/observables, dedup by LOINC code

### `modules/report-builder.js`
- `buildTransactionBundle(formData, context)`:
  - Creates individual Observation per filled field (LOINC code, valueQuantity, referenceRange)
  - Creates single DiagnosticReport with result refs to all individual Observations (flat list)
  - For standalone tests: DiagnosticReport.code = test SNOMED code, text = displayName
  - For super sets: DiagnosticReport.code = super set SNOMED code (e.g., 166312007|Blood chemistry|), text = displayName
  - DiagnosticReport.basedOn = all covered ServiceRequest references
  - Creates Task PUT entries (status=completed, businessStatus=results-available)
  - All new resources use `urn:uuid:` fullUrls
  - Profiles: `au-pathologyreport` on DiagnosticReport, `au-core-diagnosticresult-path` on Observations

### `modules/autocomplete-engine.js`
- `generateValues(observables)`: for each observable, random value within reference range (normal distribution around midpoint, within ~2 SD)
- Returns map of `loincCode -> value`

### `modules/fhir-client.js`
- Adapted from filler-reception pattern (retry, backoff, timeout)
- `fetchAcceptedTasks(base, orgRef)` -- query Tasks owned by org with status=accepted
- `fetchServiceRequests(base, taskList)` -- resolve SR references from tasks
- `fetchPatient(base, patientRef)` -- fetch patient resource
- `ensureOrganization(base, orgConfig)` -- reuse pattern from filler-reception
- `submitTransactionBundle(base, bundle)` -- POST transaction, fallback to individual requests
- `fetchSiblingTasks(base, groupIdentifier)` -- check if all tasks in requisition are completed

### `modules/fhir-helpers.js`
- Pure functions adapted from filler-reception
- `groupTasksByRequisition(tasks)`, `srSnomedCode(sr)`, reference normalisation

### `modules/formatters.js`
- Reuse from filler-reception: `escapeHtml`, `fmtName`, `fmtDateTime`, `calcAge`, status/priority badges

### `modules/ui-rendering.js`
- `renderBacklog(items, onSelect)` -- backlog table
- `renderPatientBanner(patient)` -- patient identity card
- `renderDataEntryForm(entry)` -- config-driven form with heading groups + field rows
- `showToast(msg, tone)` -- notification toasts
- Navigation between backlog view and data entry view

### `app.js`
- DOM caching, event listeners
- Org selection -> load backlog workflow
- Backlog item selection -> data entry form
- Autocomplete button -> fill fields
- Submit -> build bundle -> POST -> update tasks -> refresh backlog

---

## FHIR Resource Construction

### DiagnosticReport (one per backlog entry)
```
profile: http://hl7.org.au/fhir/StructureDefinition/au-pathologyreport
status: final
category: LAB (http://terminology.hl7.org/CodeSystem/v2-0074)
code:
  coding: SNOMED test code (standalone) or super set SNOMED code
  text: displayName (custom UI label / original text)
subject: Patient reference
effectiveDateTime: submission timestamp (now)
basedOn: ServiceRequest reference(s) -- all SRs covered by this report
performer: Organization reference
result: [individual Observation references -- flat list, no grouping layer]
```

### Individual Observation (one per observable)
```
profile: http://hl7.org.au/fhir/core/StructureDefinition/au-core-diagnosticresult-path
status: final
category: laboratory (http://terminology.hl7.org/CodeSystem/observation-category)
code:
  coding: LOINC code + loincDisplay
  text: display (custom UI label)
subject: Patient reference
effectiveDateTime: submission timestamp (same as DiagnosticReport)
performer: Organization reference
valueQuantity: { value, unit, system: http://unitsofmeasure.org, code: UCUM }
referenceRange: [{ low: {value, unit, system, code}, high: {value, unit, system, code} }]
```

### Task Updates
```
PUT Task/{id}
status: completed
businessStatus: results-available
lastModified: now
```

### Group Task Completion
After submitting, check if all sibling tasks in the requisition are completed. If yes, PUT the Group Task with status=completed.

---

## UI Flow

### Screen 1: Backlog
- Header: app title + org selector dropdown + FHIR server URL
- "Load Backlog" button
- Table: Patient | Test Name | Requisition ID | Authored Date | Action
  - Super set entries show the super set displayName (e.g., "General Chemistry")
  - Standalone tests show their displayName (e.g., "FBC")

### Screen 2: Data Entry
- Patient banner (name, DOB, age, gender)
- Test/super set displayName header
- For each heading: styled section header
- For each observable: `[Label] [Input] [Unit] [Ref: low-high]`
- Buttons: "Autocomplete" | "Submit Results" | "Back to Backlog"

---

## Build Order

- [x] **Phase 1 - Scaffolding**
  - [x] `index.html` -- HTML layout with org selector, server URL input, backlog container, data entry container
  - [x] `styles.css` -- dark theme styles (copy base from filler-reception, add form styles)
  - [x] `config.js` -- FILLER_ORGS, FHIR settings, profile URLs, category codes
  - [x] `modules/formatters.js` -- copy/adapt from filler-reception
- [x] **Phase 2 - Test Definitions**
  - [x] `modules/test-definitions.js` -- FBC, LFT, UEC with full observable lists (LOINC, UCUM, reference ranges)
  - [x] Populated from SPIA spreadsheets in `pathology-stuff/SPIA/`
- [x] **Phase 3 - FHIR Layer**
  - [x] `modules/fhir-client.js` -- HTTP operations, fetchAcceptedTasks, ensureOrganization, submitTransactionBundle
  - [x] `modules/fhir-helpers.js` -- groupTasksByRequisition, srSnomedCode, reference normalisation
- [x] **Phase 4 - Backlog Logic**
  - [x] `modules/backlog-engine.js` -- buildBacklog, super set detection, mergeObservables
- [x] **Phase 5 - UI Rendering**
  - [x] `modules/ui-rendering.js` -- renderBacklog, renderPatientBanner, renderDataEntryForm, showToast
- [x] **Phase 6 - Report Builder**
  - [x] `modules/report-builder.js` -- buildTransactionBundle (DiagnosticReport + Observations + Task updates)
- [x] **Phase 7 - Autocomplete**
  - [x] `modules/autocomplete-engine.js` -- generateValues with realistic random data
- [x] **Phase 8 - Orchestrator**
  - [x] `app.js` -- wire all modules together, DOM caching, event listeners, workflows
- [x] **Phase 9 - Polish & Integration**
  - [ ] Edge cases: no matching test definition, empty backlog, submission errors
  - [x] Add entry to root `index.html`
  - [ ] End-to-end testing with live FHIR server

---

## Verification

- [ ] Load app, select an org, verify backlog shows claimed pathology tasks
- [ ] Test with a single FBC ServiceRequest -> verify standalone entry with displayName "FBC"
- [ ] Test with LFT + UEC in same requisition -> verify "General Chemistry" super set entry
- [ ] Test with only LFT (no UEC) -> verify LFT appears as standalone
- [ ] Open data entry form -> verify correct fields per test/super set
- [ ] Click Autocomplete -> verify all fields populated with realistic values
- [ ] Submit -> verify DiagnosticReport + Observations posted to FHIR server
- [ ] Verify Task status updated to completed
- [ ] Verify Group Task marked completed when all sibling tasks done
- [ ] Verify posted resources pass AU Core profile validation

---

## Key Reference Files
- `eRequest-filler-reception/config.js` -- org definitions to reuse
- `eRequest-filler-reception/modules/fhir-client.js` -- HTTP patterns to follow
- `eRequest-filler-reception/modules/fhir-helpers.js` -- FHIR utilities to adapt
- `eRequest-filler-reception/modules/ui-rendering.js` -- claim/task update patterns
- `pathology-stuff/SPIA/` -- LOINC codes, reference ranges, units for test observables
