# AI-Enhanced eRequesting: Product Specification

**Project:** FHIR AU eRequesting Demo - AI-Enhanced Variant ("callistemon-ai" or similar)
**Feature set:** AI-driven clinical coding and test selection
**Prepared for:** Developer handover
**Date:** May 2026
**Version:** 1.0

---

## 1. Overview

This specification describes a new sister application to the existing callistemon eRequest Placer. The sister app is functionally equivalent to the original, with the following AI enhancements layered on top:

1. **AI-assisted reason coding** - SNOMED CT codes are derived from free-text clinical notes via an AI agent grounded in Ontoserver MCP, rather than manual autocomplete selection.
2. **AI-assisted test selection** - Requested procedures are derived from free-text input via the same AI agent pipeline, rather than selection from a combo box.

A third enhancement - AI-enhanced decision support - is out of scope for this document and will be specified separately.

The original app is retained unchanged as a reference implementation. The sister app should be built as a new standalone deployment, sharing assets where practical but not modifying the original codebase.

---

## 2. Relationship to Existing App

The sister app inherits all existing functionality of the eRequest Placer:

- Requesting clinician selection
- Patient search / creation
- FHIR bundle construction and server submission
- Pathology and radiology test panels
- Favourites and suggested tests
- Body site selection
- QR code / task group output
- All existing settings (FHIR server URL, auth)

The AI enhancements replace or supplement specific interaction points in the form. Where an AI-enhanced interaction is provided, the original manual mechanism should remain accessible as a fallback.

---

## 3. Shared AI Infrastructure

Both AI-enhanced features (reason coding and test selection) use the same underlying pipeline. This should be implemented as a shared module rather than duplicated.

### 3.1 Model Provider

**Openrouter** is the AI provider, using its OpenAI-compatible API surface.

- Base URL: `https://openrouter.ai/api/v1`
- The model identifier is configurable at runtime via the settings panel.
- Default model: `anthropic/claude-sonnet-4-5` (or current equivalent - developer to confirm at build time).
- The Openrouter API key is stored in the settings panel (client-side, consistent with existing FHIR server auth approach). Document the key exposure risk in a code comment.

### 3.2 Ontoserver MCP

Both features use the Ontoserver MCP server for terminology lookups.

- MCP server URL: `https://ontoserver.app/mcp`
- All SNOMED CT concept lookups must be performed via Ontoserver MCP. The agent must not rely on concept IDs from its training data.
- The `search_concepts` tool is the primary lookup method. `lookup_concept` may be used to confirm a specific ID when confidence is high.

### 3.3 ECL Scoping

Each feature (reason coding and test selection) has its own ECL expression that constrains the SNOMED hierarchy from which concepts may be drawn. These are separate configuration values because the appropriate hierarchies differ between clinical findings/conditions and procedures.

Both ECL values are:
- Configurable in the settings panel
- Set by the operator (developer/deployer), not expected to be changed by end users
- Hardcoded as defaults at build time (values to be provided by the product owner prior to development - see Section 9)
- Applied as the `valueSetEcl` parameter on all Ontoserver MCP `search_concepts` calls for their respective feature

### 3.4 Accuracy Principle

Both features apply the same accuracy-over-completeness principle: the agent must only return concepts it can confirm via Ontoserver within the ECL scope. If no confident in-scope match is found for a candidate concept, it is omitted entirely. The agent must not speculate, guess concept IDs, or return out-of-scope codes.

---

## 4. Feature A: AI-Assisted Reason Coding

### 4.1 Current Behaviour

The user types clinical notes, and the app performs a live FHIR ValueSet autocomplete lookup on Ontoserver to suggest SNOMED codes. The user manually selects codes from the suggestion list.

### 4.2 New Behaviour

The clinical notes field remains free-text. When the user triggers the AI coding step, the app calls the AI agent with the clinical notes and patient context. The agent uses the Ontoserver MCP (scoped to the reason coding ECL) to derive a validated set of SNOMED CT reason codes, which are then presented to the clinician for confirmation.

### 4.3 Trigger

The AI coding step is triggered explicitly by the user via a button adjacent to the Clinical Notes field (e.g. "Suggest codes"). The button shows a loading state during processing and is non-interactive until the response is received.

The trigger is disabled or hidden if the Clinical Notes field is empty.

### 4.4 Context Passed to Agent

| Field | Source | Notes |
|---|---|---|
| Clinical notes | Clinical Notes textarea | Primary input |
| Patient age | Derived from DOB | Approximate age in years |
| Patient sex | Gender field | male / female / other / unknown |
| Pregnancy status | Pregnancy Status dropdown | Include only if set |
| Reason coding ECL | Settings | Passed as scoping constraint |

### 4.5 System Prompt (informative)

> You are a clinical coding assistant. Your task is to derive a minimal, accurate set of SNOMED CT codes representing the clinical meaning of a clinician's free-text notes.
>
> Prioritise accuracy over completeness. Return only codes you are confident are correct. Do not speculate. Do not use concept IDs from memory.
>
> You have access to an Ontoserver MCP tool. Use `search_concepts` with the ECL expression `{reason_ecl}` to find and confirm every concept before including it. Only include a code if Ontoserver confirms it is valid, active, and within the ECL scope. If no match is found, omit the concept.
>
> Return a JSON array only, no prose or markdown formatting.

### 4.6 Output Format

```json
[
  {
    "code": "73211009",
    "display": "Diabetes mellitus",
    "system": "http://snomed.info/sct"
  }
]
```

An empty array is valid.

### 4.7 UI

- AI-suggested codes are displayed in the Reason Tags area, visually distinguished as AI-suggested.
- The clinician can accept or reject individual codes, or use accept-all / reject-all bulk actions.
- Codes are not added to reason tags without explicit clinician confirmation.
- Empty result: display a non-alarming inline message ("No codes could be confidently derived. Please add codes manually.").
- Error state: inline error with retry option. Must not block the rest of the form.
- The existing manual autocomplete remains available as a fallback.

---

## 5. Feature B: AI-Assisted Test Selection

### 5.1 Current Behaviour

The user selects pathology and radiology tests from combo boxes / panels. Tests are added to the request as SNOMED-coded ServiceRequest entries.

### 5.2 New Behaviour

The test selection area is supplemented with a free-text input where the user can describe the tests they want to request in natural language. When the user triggers encoding, the AI agent interprets this text (with the aid of pre-prompt context, see 5.4) and uses Ontoserver MCP (scoped to the test selection ECL) to derive a validated set of SNOMED CT procedure codes representing the requested tests. These are presented to the clinician for confirmation before being added to the request.

The existing combo box / panel test selection remains available alongside the free-text method.

### 5.3 Trigger

A button adjacent to the free-text input (e.g. "Encode tests"). Loading state and non-interactive behaviour during processing, identical to Feature A.

Disabled or hidden if the free-text input is empty.

### 5.4 Pre-Prompt Supplements

To improve coding accuracy, a set of pre-prompt supplements provide default context that the agent applies when the free text is ambiguous. These are fixed assumptions injected into the system prompt. They are not shown to the end user, but should be visible to the operator in settings or configuration.

The default pre-prompt supplements are:

| Context | Default assumption |
|---|---|
| Pathology specimen type, if not specified | Prefer serum, then blood, then urine (in that order) |

Additional supplements may be added in future. The supplements should be stored as a configurable text block in settings (see Section 9), not hardcoded in the prompt logic. This allows the operator to adjust assumptions without a code change.

### 5.5 Context Passed to Agent

| Field | Source | Notes |
|---|---|---|
| Free-text test description | Test free-text input | Primary input |
| Pre-prompt supplements | Settings | Default context assumptions |
| Patient age | Derived from DOB | Approximate age in years |
| Patient sex | Gender field | male / female / other / unknown |
| Pregnancy status | Pregnancy Status dropdown | Include only if set |
| Test selection ECL | Settings | Passed as scoping constraint |
| Already-selected tests | Current request | Optional context to avoid duplication |

### 5.6 System Prompt (informative)

> You are a clinical test coding assistant. Your task is to derive a set of SNOMED CT procedure codes representing the diagnostic tests described in the clinician's free-text input.
>
> Apply the following default assumptions where the input is ambiguous:
> {pre_prompt_supplements}
>
> Prioritise accuracy over completeness. Do not speculate. Do not use concept IDs from memory.
>
> You have access to an Ontoserver MCP tool. Use `search_concepts` with the ECL expression `{test_ecl}` to find and confirm every concept. Only include a code if Ontoserver confirms it is valid, active, and within the ECL scope. If no match is found, omit the concept.
>
> Return a JSON array only, no prose or markdown formatting.

### 5.7 Output Format

Same structure as Feature A:

```json
[
  {
    "code": "26604007",
    "display": "Full blood count",
    "system": "http://snomed.info/sct"
  }
]
```

An empty array is valid.

### 5.8 UI

- AI-suggested tests are displayed as a review list, visually distinguished from manually selected tests.
- Each suggested test shows its display term and concept ID.
- The clinician can accept or reject individual tests, or use accept-all / reject-all.
- Accepted tests are added to the Selected Tests list in the same way as manually selected tests. No changes to FHIR bundle construction are required.
- Empty result and error states follow the same pattern as Feature A.
- The free-text input and AI encoding are additive to, not a replacement for, the existing combo box / panel test selection.

---

## 6. Settings / Configuration

Extend the existing settings panel to include all AI-related configuration:

| Setting | Description | User-editable |
|---|---|---|
| Openrouter API key | API key for Openrouter | Yes |
| AI model | Model identifier string | Yes |
| Reason coding ECL | ECL expression for Feature A concept scope | Operator only (no UI restriction required; just not expected to be changed by end users) |
| Test selection ECL | ECL expression for Feature B concept scope | Operator only |
| Pre-prompt supplements | Default context assumptions for test selection | Operator only |
| AI features enabled | Master toggle to disable all AI features | Yes |

All settings persist in the same way as the existing FHIR server URL (localStorage or equivalent).

ECL fields accept free text. No client-side ECL validation is required, though Ontoserver errors caused by malformed ECL should surface to the user in a readable way.

---

## 7. Default ECL Values

The following ECL expressions are the hardcoded defaults, applied at build time if no operator override is set. These constrain the SNOMED CT hierarchies from which each feature may draw codes.

| Feature | Default ECL |
|---|---|
| Reason coding (Feature A) | `< 404684003 \|Clinical finding\|` |
| Test selection (Feature B) | `< 71388002 \|Procedure\|` |

The developer should surface a visible warning or disabled state for AI features if the relevant ECL field is cleared to empty at runtime.

---

## 8. FHIR Compliance

The sister app is required to remain fully compliant with the same FHIR specifications as the original app. This includes:

- AU eRequesting FHIR Implementation Guide
- FHIR AU Base profiles where applicable
- All existing resource types, search parameters, and bundle structure

The AI enhancements (Features A, B, and C) must not alter the FHIR bundle structure or the content of transmitted resources, except:
- Reason codes derived via Feature A are added to the request in the same way as manually selected reason codes.
- Tests accepted via Feature B are added to the Selected Tests list in the same way as manually selected tests.
- An acknowledgement note may be appended per Feature C, Section C.10.

The developer should treat the original app's FHIR interactions as the reference implementation and validate parity before completing each feature. Any new FHIR queries introduced (e.g. the prior ServiceRequest lookup in Feature C) must conform to the relevant profile and use the existing configured FHIR server and auth settings.

---

## 9. Non-Functional Requirements

- All AI calls are non-blocking. The form must remain interactive during processing.
- No clinical notes or patient data are logged or stored beyond what already occurs in the existing app.
- **PHI egress to the LLM (decision support).** Feature C sends clinical context to the model. With the `query_patient_history` tool (issue #25) this expands beyond the clinician's notes and prior-request *codes* to the patient's actual **lab values (Observation), diagnoses (Condition), medications (MedicationRequest), and reports (DiagnosticReport)** — gated behind the decision-support toggle and offered only when a patient is resolved. Summaries omit direct identifiers (no name/MRN), but results, diagnoses, and meds are sensitive. On the default proxy route with a free-tier model, that data flows through the deployer's key to a provider that may log/retain it. **Adopters handling real patient data should use the own-key route with a paid/non-logging model (or self-hosted inference) for decision support**, and treat this as the same demo/reference risk posture as the API key and FHIR tokens (§9.1).
- The Openrouter API key is stored client-side. This is consistent with the existing FHIR server auth model. The risk should be documented in a code comment.
- Both AI features degrade gracefully if Openrouter or Ontoserver MCP is unavailable.
- The shared AI module (Section 3) must be testable independently of the UI.
- The app is a static client-side application with no server-side build pipeline at runtime. All logic runs in the browser.

### 9.1 Hosting

The sister app is hosted on GitHub Pages, consistent with the existing callistemon apps. This has the following implications for the developer:

- The app must be fully static: plain HTML, CSS, and JavaScript with no server-side runtime. No Node.js server, no backend proxy.
- All API calls (Openrouter, Ontoserver MCP, FHIR server) are made directly from the browser via . CORS must be supported by the target services - this is already the case for the existing Ontoserver and FHIR server integrations and is supported by Openrouter.
- The app should be deployed as a subdirectory of the existing GitHub Pages site (e.g. ) to keep it alongside the reference implementation.
- The repository structure should mirror the existing  directory. The developer should confirm the exact path with the product owner before scaffolding.
- There is no CI/CD pipeline requirement beyond a standard GitHub Pages deployment from the repository. The developer may introduce a simple build step (e.g. for bundling or minification) provided the output remains a static site deployable via GitHub Pages without additional configuration.
- The Openrouter API key exposure risk is the same as the existing FHIR server auth tokens: acceptable for a demo/reference app, to be documented and noted to any production adopters.

---

## 10. Acceptance Criteria

**Shared infrastructure:**
1. The app calls Openrouter using the configured model and API key.
2. All SNOMED concept lookups use Ontoserver MCP `search_concepts` with the relevant ECL applied.
3. No concept is returned unless confirmed by Ontoserver within the ECL scope.
4. Model, API key, both ECL expressions, and pre-prompt supplements are all configurable in the settings panel.

**Feature A - Reason coding:**
5. A clinician can trigger AI reason code suggestions from the Clinical Notes field with a single action.
6. Suggested codes are presented for clinician review before being added as reason tags.
7. The clinician can accept or reject individual codes or bulk-accept/reject.
8. Empty result and error states are handled gracefully.
9. The existing manual autocomplete remains available.

**Feature B - Test selection:**
10. A clinician can enter free-text test descriptions and trigger encoding with a single action.
11. Pre-prompt supplements are applied automatically when specimen type or other context is unspecified.
12. Suggested tests are presented for clinician review before being added to the request.
13. The clinician can accept or reject individual tests or bulk-accept/reject.
14. Accepted tests are added to the Selected Tests list identically to manually selected tests.
15. Empty result and error states are handled gracefully.
16. The existing combo box / panel test selection remains available alongside the free-text method.

---

## 11. Out of Scope for This Document

- Changes to FHIR bundle structure beyond the additions noted in Section 8
- Server-side components or proxies
- Authentication beyond the existing FHIR server auth model

---

*End of specification*

---

# Feature C: AI-Enhanced Decision Support

**Version:** 1.0
**Date:** May 2026

---

## C.1 Overview

Decision support runs as a distinct pipeline from Features A and B. Where A and B assist the clinician in constructing the request, decision support evaluates the request as a whole before it is sent, providing advisory feedback and, where warranted, a blocking review step.

The intent is to support - not replace - clinical judgement. All decision support output is advisory. The clinician retains the ability to proceed with or modify their request in all cases.

The clinical context is **general practice / primary care**.

---

## C.2 What Decision Support Evaluates

The decision support agent evaluates the completed request against four dimensions:

| Dimension | Description |
|---|---|
| Appropriateness | Whether the selected tests are clinically appropriate given the documented clinical notes and patient context |
| Test suggestions | Additional tests the clinician may not have considered, given the clinical picture |
| Duplicate detection | Tests that appear redundant or duplicative, either within the current request or against prior requests retrieved from the FHIR server |
| Context completeness | Whether the clinical notes provide sufficient context for the requested tests to be meaningfully actioned by the receiving service |

---

## C.3 Trigger

Decision support is triggered when the clinician attempts to send the request (i.e. at the point the existing "Send to FHIR Server" action is invoked), after the FHIR bundle has been constructed but before it is transmitted.

It is not triggered on every form change. It should not run unless at least one test has been selected and clinical notes have been entered.

If the AI service is unavailable, decision support is silently skipped and the send proceeds normally. The clinician should not be blocked by a decision support outage.

---

## C.4 Clinical Knowledge Source

The agent's clinical reasoning is grounded in two sources:

1. **AI model's general clinical training** - provides broad clinical and pathology knowledge appropriate for a GP context.

2. **Operator-maintained guidelines summary** - a curated text block injected into the system prompt. This allows the operator to encode context-specific rules, local formulary preferences, or guideline summaries (e.g. RACGP, MBS appropriateness criteria, local health network policies) without a code change.

The guidelines summary is stored in the settings panel as a free-text field. It is injected verbatim into the system prompt as a named section. The agent is instructed to treat it as authoritative where it conflicts with its general training.

An empty guidelines summary is valid. The feature operates on general clinical training alone if no summary is provided.

---

## C.5 Prior Request Context

Where a patient is identified in the current request, the app should query the configured FHIR server for prior ServiceRequests for that patient before invoking the decision support agent. These are passed to the agent as context for duplicate detection.

Implementation notes:
- Query: `ServiceRequest?subject={patientId}&_sort=-authored&_count=20` (or equivalent, developer to confirm against the target FHIR profile)
- Only ServiceRequests with a status of `active`, `completed`, or `on-hold` need be included.
- If the query fails or returns no results, proceed without prior request context. This must not block the decision support call.
- The prior requests are passed as a summarised list (test code + display + authored date), not as raw FHIR JSON, to limit prompt size.

The app must remain compliant with the AU eRequesting FHIR specification and any relevant FHIR AU base profiles when constructing this query.

---

## C.6 Context Passed to the Agent

| Field | Source | Notes |
|---|---|---|
| Selected tests | Current FHIR bundle (ServiceRequests) | Code + display term for each |
| Clinical notes | Clinical Notes field | |
| Reason tags | Accepted reason codes | Code + display term |
| Patient age | Derived from DOB | Approximate age in years |
| Patient sex | Gender field | male / female / other / unknown |
| Pregnancy status | Pregnancy Status dropdown | Include only if set |
| Prior requests | FHIR server query | Summarised list; omit if unavailable |
| Guidelines summary | Settings | Injected as authoritative context |

---

## C.7 System Prompt (informative)

> You are a clinical decision support assistant for a general practice requesting clinician. You will be given a draft pathology or radiology request and must evaluate it across four dimensions: appropriateness, missed tests, duplicates, and context completeness.
>
> Apply the following clinical guidelines and local rules as authoritative:
> {guidelines_summary}
>
> For each finding, assign a severity:
> - **advisory** - informational, non-urgent, clinician may proceed without action
> - **serious** - warrants clinician review before sending; one or more of the following applies:
>   - the test is clinically inappropriate for the patient's demographics
>   - the combination of tests or implied diagnoses carries potential clinical risk
>   - critical context is missing that would affect how the request is actioned by the receiving service
>   - a high-risk test has been ordered without documented clinical justification
>
> Return a JSON object only, in the format specified. No prose, no markdown.

---

## C.8 Output Format

The agent returns a structured JSON object:

```json
{
  "overall_severity": "advisory | serious | none",
  "findings": [
    {
      "severity": "advisory | serious",
      "dimension": "appropriateness | suggestion | duplicate | context",
      "summary": "Brief plain-English summary (1-2 sentences, shown to clinician)",
      "detail": "Optional longer explanation for the review panel",
      "related_tests": ["26604007", "444164000"]
    }
  ]
}
```

- `overall_severity` is `serious` if any finding is serious, otherwise `advisory` if any findings exist, otherwise `none`.
- `findings` may be an empty array.
- `summary` must be written for a clinician audience - plain English, no jargon, no alarm language.
- `related_tests` contains SNOMED concept IDs from the current request that the finding relates to. May be empty.

---

## C.9 Presentation: Two-Tier Display

### Tier 1 - Inline advisory panel

Displayed immediately after the decision support call completes, alongside the existing request form. Non-blocking.

- Shown whenever `overall_severity` is `advisory` or `serious`.
- Displays all findings as a compact list, each with its `summary` text and a severity indicator.
- `suggestion` dimension findings include a one-click "Add test" affordance where the suggested test can be identified as a SNOMED code (optional enhancement - developer to assess feasibility).
- The clinician can dismiss the panel and proceed to send without acting on any finding.
- If `overall_severity` is `none`, no panel is shown and the send proceeds normally.

### Tier 2 - Blocking review modal

Displayed in place of the send action when `overall_severity` is `serious`. The request is not transmitted until the clinician explicitly acknowledges.

The modal:
- Lists all serious findings with their `summary` and `detail` text.
- Presents two actions: "Review and edit request" (returns to form) and "Proceed anyway" (sends the request as-is, with acknowledgement recorded).
- The "Proceed anyway" action must require an explicit affirmative gesture (e.g. checkbox confirmation "I have reviewed these findings and wish to proceed") before the send button is enabled.
- Advisory findings are also shown in the modal (below serious findings) for completeness, but do not require acknowledgement.

### Error and unavailability states

- If the decision support call fails or times out, display a brief inline notice ("Decision support unavailable - please review your request before sending") and allow the send to proceed. Do not block.
- If decision support was skipped due to missing clinical notes or no selected tests, no notice is shown.

---

## C.10 Acknowledgement Logging

When a clinician proceeds through a serious-flag blocking review, the acknowledgement should be recorded. At minimum, append a note to the FHIR bundle's `ServiceRequest.note` field indicating that decision support flags were reviewed and overridden by the requesting clinician. The exact wording is developer discretion.

This keeps the FHIR output informative without requiring any changes to the bundle structure or server profile compliance.

---

## C.11 Settings / Configuration

Add the following to the settings panel (extending Section 6 of the main spec):

| Setting | Description | User-editable |
|---|---|---|
| Clinical guidelines summary | Free-text operator-maintained guidelines block injected into the decision support prompt | Operator only |
| Decision support enabled | Toggle to disable Feature C entirely | Yes |

---

## C.12 FHIR Compliance Notes

Decision support introduces new **read-only** FHIR interactions: a query for prior ServiceRequests (C.5), and — once the patient is resolved — agent-initiated history queries via the `query_patient_history` tool (issue #25). These must:

- Use the FHIR server configured in the existing settings panel.
- Conform to the AU eRequesting FHIR profile and any relevant AU Base profiles for the resource being searched.
- Respect any auth configuration already in place for the FHIR server connection.
- Appear in the existing terminology/FHIR call debug log (the "recent calls" panel already present in the app).

Agent-initiated history queries are read-only (GET), restricted to an allow-list of resource types (`Observation`, `Condition`, `MedicationRequest`, `DiagnosticReport`, `ServiceRequest`), always scoped to the current `subject=Patient/{id}`, `_count`-capped, and subject to a per-evaluation query budget.

No FHIR resources are written or modified beyond the existing bundle submission, except the optional note appended per C.10.

---

## C.13 Acceptance Criteria

1. Decision support is triggered when the clinician attempts to send a request with at least one test and clinical notes present.
2. The agent is called with the full context defined in C.6, including prior requests where available from the FHIR server.
3. The guidelines summary from settings is injected into the system prompt.
4. Advisory findings are displayed in a non-blocking inline panel before the request is sent.
5. When any serious finding is present, the send action is replaced by a blocking review modal.
6. The modal requires explicit acknowledgement before the request can be sent.
7. Acknowledgement of serious flags is recorded in the FHIR bundle note.
8. If decision support is unavailable, the send proceeds normally with a brief notice.
9. The prior ServiceRequest query conforms to the AU eRequesting FHIR profile.
10. Decision support can be disabled entirely via the settings panel.

---

*End of Feature C specification*
