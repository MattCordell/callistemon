# MHAOD Assessment Demonstrator: Task Specification

Version 0.1 (for development) | November 2026
Owner: Matt Cordell, CSIRO Australian National Release Centre
Target folder: `callistemon/mh-assessment/` (rename freely)

---

## 1. Purpose

Build a browser-based demonstrator showing clinicians how SNOMED CT-AU, ECL-based value set bindings and HL7 FHIR can support a structured mental health assessment. The form is based on an example assessment template supplied by a Queensland Health Mental Health Alcohol and Other Drugs (MHAOD) clinician.

The demonstrator must make three things visible:

1. Coded data entry can be quick and clinically natural when value sets are well bound.
2. Every coded field is traceable to its terminology binding (observable, ECL, expansion).
3. The same data entry produces standards-based FHIR resources that can be shared and reused.

- **Primary goal:** an interactive UI clinicians can use.
- **Secondary goal:** build a FHIR transaction Bundle and POST it to the Callistemon server.
- **Audience:** clinicians, informaticians and terminologists.

This is a demonstrator. No automated tests, no production hardening, synthetic data only.

---

## 2. Constraints

- **Hosting.** A static site on GitHub Pages inside the Callistemon repo (`.nojekyll` at the repo root, one folder per demonstrator). No server-side code.
- **Stack.** Developer's choice. Prefer no build step (plain ES modules, optionally a small UI library from a CDN) to match the repo's existing layout. If a build step is used, serve the built output from this folder and do not change other demonstrators or existing repo workflows without agreement.
- **FHIR version.** R4.
- **FHIR server.** `https://server.callistemon.site/fhir`. It is a vanilla HAPI server with no profiles loaded and no SNOMED CT loaded. Do not rely on server-side validation, profile enforcement or terminology subsumption.
- **Terminology server.** `https://tx.ontoserver.csiro.au/fhir`.
- **SNOMED CT edition.** SNOMED CT-AU for all bindings: `http://snomed.info/sct/32506021000036107`. Use no version suffix, so the latest release is always targeted. Display the Australian preferred term returned by the server.
- **Configuration.** Server URLs and edition live in one config module and can be overridden from a Settings panel at runtime.
- **Language.** Australian English in all UI text.
- **Data.** Synthetic data only. Show a persistent banner saying so. The form includes forensic history, domestic violence, abuse, sexual history and substance use, so this is non-negotiable.

---

## 3. Scope

### 3.1 In scope (v1)

- Patient selection from Callistemon, or creation of a new patient.
- A tabbed assessment form covering all sections of the source template (section 6.3).
- Fully coded "hero" sections: Symptoms, Neurovegetative, Risk, Mental State Examination (MSE), Substance use, Diagnosis and differential, Family psychiatric history.
- Lightly coded or free-text sections for everything else. Coded pickers for past history, medications and allergies are a SHOULD.
- One definition file that holds every field and binding (section 5).
- A Terminology Lens overlay and a Binding Review tab.
- AUCDI Release 3 badges on the fields that correspond to an AUCDI data group.
- An unreviewed ICD-11 display against SNOMED diagnoses.
- Live FHIR Bundle preview, download, and POST as a transaction.
- An example data loader for quick demos.

### 3.2 Out of scope

The items in section 11 go to the backlog as GitHub issues. Do not implement them.

---

## 4. Architecture

Four parts, kept in separate modules:

1. **Definition file.** The single source of truth for tabs, sections, fields and bindings.
2. **Terminology client.** Calls to Ontoserver: `ValueSet/$expand`, `CodeSystem/$lookup` and `ValueSet/$validate-code`, with in-memory caching.
3. **UI.** The form renderer, the Terminology Lens and the Binding Review tab.
4. **FHIR layer.** The QuestionnaireResponse builder, resource extraction, Bundle assembly and the server client.

Data flows like this:

1. The definition drives the form.
2. User input is held in memory, keyed by field id.
3. Input is assembled into a QuestionnaireResponse plus extracted resources.
4. These form a transaction Bundle, shown in the preview pane.
5. The Bundle is POSTed to Callistemon.

No binding information (codes, ECL, displays) may be hard-coded anywhere except the definition file. Matt will edit bindings directly in that file.

---

## 5. Definition file

### 5.1 Location and format

`mh-assessment/definition/assessment-definition.js`, a JavaScript module so comments can sit beside the ECL. A plain JSON file is acceptable if the developer prefers, as long as it remains a single file that is easy to edit by hand.

### 5.2 Field properties

| Property | Required | Meaning |
|---|---|---|
| `id` | yes | Stable identifier. Also used as the QuestionnaireResponse `linkId`. |
| `tab`, `section` | yes | Placement in the form. |
| `label` | no | Display label. If omitted, use the AU preferred term of `observable`, fetched with `$lookup` and cached. |
| `observable` | for coded Observation fields | `{ code, display }`. Becomes `Observation.code`. |
| `ecl` | for coded fields | ECL expression for the answer value set, written in plain text with pipes and terms. |
| `control` | yes | `auto`, `select`, `multiselect`, `typeahead`, `text`, `textarea`, `integer`, `boolean`, `date` or `repeating-group`. |
| `cardinality` | yes | `single` or `multiple`. |
| `output` | yes | The FHIR target: `observation-qa`, `observation-score`, `condition`, `family-history`, `medication-statement`, `allergy`, `smoking-status`, `substance-use`, `patient` or `qr-only`. |
| `category` | for Observations | Observation category code. |
| `aucdi` | no | AUCDI R3 data group name for the badge, for example `"Housing summary"`. |
| `sensitive` | no | `true` for sections such as forensic history and abuse. Shows a visual marker only in v1. |
| `status` | yes | `placeholder` or `reviewed`. |
| `notes` | no | Free-text notes shown in the Terminology Lens and Binding Review. |

### 5.3 Example entry

```js
{
  id: "nv-libido",
  tab: "neurovegetative",
  section: "Neurovegetative disturbance",
  // label omitted: uses AU PT of the observable
  observable: { code: "248095000", display: "Libido" },
  ecl: "< 365965002 |Libido - finding|",
  control: "auto",
  cardinality: "single",
  output: "observation-qa",
  category: "survey",
  status: "placeholder",
  notes: "Includes Normal libido, so 'assessed and normal' is recordable."
}
```

### 5.4 Behaviour rules

- **Implicit value sets.** Each `ecl` is used as an implicit value set URL: `http://snomed.info/sct/32506021000036107?fhir_vs=ecl/{URL-encoded ECL}`.
- **Automatic controls.** `control: "auto"` picks the control from the expansion total:
  - 12 or fewer concepts: chips or radio buttons (checkboxes if `multiple`).
  - 13 to 60 concepts: a dropdown.
  - More than 60 concepts: a typeahead using the `$expand` `filter` parameter.
- **Placeholder text.** Dropdowns show the field label as placeholder text. There is no non-selectable grouper concept.
- **Empty fields.** Nothing selected means nothing recorded: no Observation, and the item is omitted from the QuestionnaireResponse.
- **Placeholder flag.** Fields with `status: "placeholder"` show a small placeholder marker in the Terminology Lens and Binding Review only, not in the clinician view.

---

## 6. Functional requirements

### FR-1 Patient context

- Search Callistemon patients by name (`Patient?name=`), list the results, and select one. The README's example synthetic patients should be findable.
- Create a new patient with given name, family name, date of birth, administrative gender and marital status. Marital status uses `Patient.maritalStatus` bound to the FHIR v3 MaritalStatus value set.
- Show an info pop on marital status explaining that national reporting uses the METEOR "Person - marital status" codes, and that a mapping would be needed. Do not implement the mapping.
- A new patient is included in the transaction Bundle (section 7.4) rather than created separately.
- Show a patient banner (name, date of birth, age) on every tab.

### FR-2 Encounter

- Each assessment creates one Encounter: status `finished`, class `AMB` from v3 ActCode by default (selectable), subject, and period start set to the assessment date and time.
- All extracted resources reference this Encounter.

### FR-3 Form layout

Tabs, in this order:

| # | Tab | Contents |
|---|---|---|
| 1 | Context | Patient, marital status, legal status (voluntary or involuntary), care responsibilities and dependants, employment |
| 2 | Presenting complaint | Presenting complaint (consumer's own words), history of presenting complaint, previous treatment |
| 3 | Symptoms | Psychotic, mood (including diurnal variation), anxiety |
| 4 | Neurovegetative | Sleep, appetite, weight, concentration, energy, anhedonia, libido |
| 5 | Risk | Suicidal ideation, history of deliberate self-harm, notes |
| 6 | Stressors and impact | Stressors, impact on self, family, work or school and social, HoNOS total |
| 7 | Past history | Past psychiatric diagnoses, admissions, Mental Health Act history, treating psychiatrists, past medical history, current medications, allergies |
| 8 | Substance use | Tobacco, alcohol, other substances (per-substance grid), consequences of injecting drug use |
| 9 | Family and forensic | Family psychiatric history (repeating), forensic history (charges, incarceration, domestic violence) |
| 10 | Personal history | Early development, family relationships, childhood and education, social supports, employment history, social circumstances, psychosexual history, premorbid personality |
| 11 | Mental state | Appearance, behaviour, speech, mood, affect, thought form, thought content, perception, cognition (orientation, memory, attention and concentration), insight, judgement, MMSE |
| 12 | Diagnosis | Diagnoses (principal and additional), differential diagnoses |
| 13 | Review and submit | Bundle preview, download, POST, results |

The Binding Review tab is visually separate (for example a toggle or a distinct style), since it is a terminologist's view rather than part of the clinical form.

Each tab shows a simple completion indicator (count of fields with values).

### FR-4 Coded controls

- **Selections.** Single and multiple selection per the definition. Multiple selections render as removable chips.
- **Typeahead.** Debounce input, call `$expand` with `filter` and a small `count`, and show the AU preferred term.
- **Repeating groups.** Used for family history, the substance grid, diagnoses and medications. Each row can be added and removed.
- **Free text.** Free-text fields are plain textareas with no coding.

### FR-5 Terminology Lens

A global toggle. When on, each coded field shows an unobtrusive overlay or side panel with:

- the observable (code and AU preferred term)
- the ECL, with a copy button
- the expansion total
- the binding status (placeholder or reviewed)
- the AUCDI badge, if any
- the field notes

Clicking a selected value opens a concept detail panel populated by `$lookup`. It shows the FSN, AU preferred term, synonyms, parents, and any defining Interprets or Has interpretation attributes.

The clinician view stays clean when the lens is off.

### FR-6 Binding Review tab

This tab is primarily for Matt. It lists every field in the definition file as a table with these columns: tab, field id, label, observable, ECL, expansion total, first 10 members, status, notes.

It runs these checks and shows them as warnings:

- the expansion is empty, or the ECL fails to parse (show the server's error message)
- the expansion has more than 500 concepts (likely too broad)
- an `observable` code is not a descendant of `363787002 |Observable entity|` (check with `$validate-code` against `<363787002`)
- an `observable` code or any enumerated code in the ECL is inactive

It also needs:

- a "Re-run all" button
- export of the results as CSV

Should (optional): an Interprets consistency check that flags expansion members whose Interprets value is missing or differs from the field's observable. This is informational only; bindings stay as written.

### FR-7 AUCDI badges

Fields with an `aucdi` property show a small badge reading "AUCDI R3: {data group}", with a tooltip explaining that the field corresponds to that Australian Clinical Data for Interoperability Release 3 data group. Suggested assignments are in Appendix A.

### FR-8 Clinical content rules

- **Presenting complaint.** Free text in the consumer's own words. It is stored only in the QuestionnaireResponse and never coded, because coding it would impose an interpretation. Place a short helper line under the field: "Record in the consumer's own words. This field is intentionally not coded."
- **Diagnosis.** No DSM Axis I to V. Show an info pop on the Diagnosis tab: "DSM-5 (2013) removed the multiaxial system. Diagnoses are recorded as principal, additional or differential. Content formerly on Axes III to V is captured in Past history, Stressors and impact, and the outcome measures."
- **Instruments.** MMSE and HoNOS capture scores only, never item wording. Show an info note that the instruments are licensed and that item content is not reproduced.
  - MMSE: domain subscores are numeric inputs stored in the QuestionnaireResponse only. The total is extracted as an Observation.
  - HoNOS: total score only in v1.
- **Risk tab.** Show a note that this is a recording aid only, not a risk assessment tool.

### FR-9 ICD-11 display (unreviewed)

- Matt will place `ICD11_Ch6_SCT_combined_map.tsv` in `mh-assessment/data/`.
- Load it at runtime and index rows by the `Target Code` column.
- When a diagnosis, differential or family history condition is selected, show the ICD-11 entities whose map targets that exact SNOMED concept:
  - the MMS code if present, otherwise the Foundation URI
  - the description
  - the relationship
  - the map status
  - links using the `MMS BrowserURL` or `Foundation BrowserURL` columns
- Always show a prominent "Unreviewed research map" badge, with a tooltip explaining that the map is draft and runs from ICD-11 to SNOMED CT. The reverse lookup is a display aid, not a SNOMED CT to ICD-11 map.
- Exact concept matches only. Do not walk ancestors.
- The ICD-11 display is UI only. Do not write ICD-11 codes into FHIR resources in v1.

### FR-10 Bundle preview and submission

- **Preview.** A live, read-only JSON view of the transaction Bundle that updates as the form changes. Provide collapsible resources and a copy button. Show it on the Review tab, and optionally as a slide-out panel available from any tab.
- **Download.** Download the Bundle as a JSON file.
- **POST.** Send the Bundle to the configured FHIR base URL.
- **On success:** list the created resources with their server ids, each linking to the resource URL on the server.
- **On failure:** show the HTTP status and a readable rendering of any OperationOutcome.

### FR-11 Example data

A "Load example" button fills the form with a coherent synthetic scenario for demos. A suggested scenario is a moderate depressive presentation with melancholic features:

- early morning waking, diurnal variation of mood
- reduced appetite, weight loss, reduced libido
- lack of energy, poor concentration
- low mood, restricted affect
- one stressor
- a family history of depression
- current tobacco smoker

Example values must come from the current bindings (resolve by code at load time). Skip any value no longer in the expansion and log a console warning.

### FR-12 Questionnaire generation (SHOULD)

- Generate a FHIR Questionnaire from the definition file: one item per field.
  - `item.code` = the observable
  - `answerValueSet` = the implicit ECL value set URL
  - groups per tab
- Give it a stable canonical URL and offer it as a download.
- The QuestionnaireResponse references this canonical.
- SDC rendering fidelity and testing in the Smart Forms renderer are out of scope (see the backlog).

---

## 7. FHIR representation

### 7.1 General rules

- **References.** All clinical resources reference the Patient and the Encounter.
- **Timestamps.** `effectiveDateTime`, `recordedDate` and `authored` use the assessment date and time.
- **Codings.** Every coding carries `system` (`http://snomed.info/sct`), `version` (the AU edition URI, so the edition is explicit) and `display` (the AU preferred term). `CodeableConcept.text` carries the field label.
- **Profiles.** The server has no profiles loaded, so do not add `meta.profile` claims. Shape resources to the AU Core profile where one exists, as noted in Appendix A, so a later validation exercise is meaningful.

### 7.2 Coded observations (option A pattern)

This is the agreed pattern for `output: "observation-qa"` fields:

- `Observation.status` = `final`
- `Observation.category` = the field's `category`
- `Observation.code` = the field's observable
- `Observation.valueCodeableConcept` = the selected finding
- `Observation.derivedFrom` = a reference to the QuestionnaireResponse

Example: `code` = 248095000 |Libido|, `valueCodeableConcept` = 8357008 |Reduced libido|.

The redundancy between the observable and the finding is accepted deliberately, because it preserves the pre-coordinated meaning. Do not substitute qualifier values.

For multiple selection, create one Observation per selected finding, each with the same `code`, because `value[x]` holds a single value.

### 7.3 Other output types

| `output` | FHIR shape |
|---|---|
| `observation-score` | Observation with `code` = the score observable and `valueInteger`. |
| `condition` | Condition. The definition sets the category and status (Appendix A). Diagnoses use `category` = `encounter-diagnosis`. `verificationStatus` is `confirmed`, `provisional` or `differential`; differentials always use `differential`. |
| `family-history` | FamilyMemberHistory: `status` = `completed`, `relationship` from v3 RoleCode (for example MTH, FTH, SIB, SON, DAU, GRMTH, GRFTH, AUNT, UNCLE), `condition.code` from the binding, optional `condition.onsetAge`. |
| `medication-statement` | MedicationStatement: `status` = `active`, `medicationCodeableConcept` from the binding, optional dosage text. Shape to AU Core MedicationStatement. |
| `allergy` | AllergyIntolerance: `code` from the binding, `clinicalStatus` = `active`, `verificationStatus` = `unconfirmed` or `confirmed`, optional reaction manifestation as text. Shape to AU Core AllergyIntolerance. |
| `smoking-status` | Shape to AU Core Smoking Status: `code` = LOINC 72166-2, `valueCodeableConcept` from the binding. Matt to confirm the codes. |
| `substance-use` | One Observation per substance row. `code` = the substance use observable, `valueCodeableConcept` = the status finding, and one `component` whose code is a local `substance` code and whose `valueCodeableConcept` is the SNOMED substance. Matt will settle this pattern against the AUCDI Substance use summary; keep it isolated in one function so it is easy to change. |
| `patient` | Patient (new patients only). |
| `qr-only` | Stored only in the QuestionnaireResponse. |

The QuestionnaireResponse holds every answered field:

- `status` = `completed`
- `questionnaire` = the canonical from FR-12 (or a placeholder canonical if FR-12 is not done)
- items grouped by tab, each answer typed appropriately (`valueCoding`, `valueString`, `valueInteger`, `valueBoolean`, `valueDate`)

### 7.4 Transaction Bundle

- `Bundle.type` = `transaction`.
- Every new resource gets a `urn:uuid:` `fullUrl` and a `request` of method `POST` with url = the resource type.
- Internal references use the `urn:uuid` values.
- A new Patient is the first entry. An existing Patient is referenced by its server id and is not included.
- Order: Patient (if new), Encounter, QuestionnaireResponse, then extracted resources.

---

## 8. UI guidance

- Clinician-first. The default view should look like a clean clinical form, not a terminology tool. Terminology detail appears only through the Lens and the Binding Review tab.
- Make the "high and low" nature of neurovegetative fields visible. For example, order the chips from reduced through normal to increased where the expansion allows.
- The neurovegetative tab is the best showcase. Give it particular care.
- Responsive enough for a laptop or a large tablet. Phone layout is not required.
- Respect light and dark mode if it is cheap to do.
- Use clear loading and error states for terminology calls. A failed expansion shows the field disabled with the error available in the Lens. It never blocks the rest of the form.
- Hold state in memory. Optionally persist a draft to `localStorage`, with a "Clear draft" button.

---

## 9. Delivery plan

Work in four sessions. Stop at the end of each session with a short summary of what was built, any deviations from this spec, and open questions.

| Session | Build | Done when |
|---|---|---|
| 1. Foundations | Folder scaffold, config, definition file populated from Appendix B, terminology client, Binding Review tab | The Binding Review lists every field with live counts and warnings from Ontoserver (AU edition), and CORS against both servers is confirmed. **Stop for Matt to review and edit bindings.** |
| 2. Form | Tabs, auto controls, repeating groups, patient search and create, Terminology Lens, AUCDI badges, info pops, synthetic data banner | Every tab renders from the definition file; coded fields work against Ontoserver; the Lens shows binding detail. |
| 3. FHIR | QuestionnaireResponse builder, extraction per section 7 and Appendix A, transaction Bundle, live preview, download, POST, result and error display | A completed example assessment POSTs successfully to Callistemon, and the created resources are viewable on the server. |
| 4. Polish | ICD-11 unreviewed display, example data loader, Questionnaire generation (SHOULD), README for the folder, link card on the Callistemon landing page, backlog issues | The demonstrator is usable end to end from the GitHub Pages URL. |

---

## 10. Overall acceptance

- Every coded field draws its values from Ontoserver using the ECL in the definition file. No code lists are hard-coded elsewhere.
- Changing a field's ECL in the definition file and reloading changes the values offered, with no other code change.
- An empty field produces no resource.
- A completed example assessment POSTs to Callistemon as one transaction and returns created ids.
- The Lens and Binding Review expose every binding.
- The synthetic data banner is always visible.

---

## 11. Backlog (create as GitHub issues, do not implement)

Create one issue per item using `gh issue create` if available, otherwise write them to `mh-assessment/BACKLOG.md`.

1. **SDC and Smart Forms round-trip.** Render the generated Questionnaire in the CSIRO Smart Forms renderer and compare fidelity, including answerValueSet ECL bindings and extraction.
2. **Reporting view.** Show which national reporting items could be derived from the coded data: METEOR mental health legal status, NOCC and HoNOS, the AOD treatment services NMDS drug of concern. Use illustrative hand-made ConceptMaps.
3. **Security labels.** Add `meta.security` sensitivity and confidentiality labels to resources from sensitive sections (psychiatric, substance use, domestic violence and abuse). Codes to be confirmed.
4. **Encounter and EpisodeOfCare.** Model episode logic (community mental health, admitted, AOD episodes) alongside the Encounter.
5. **Clinical summary view.** A read-back summary generated from the coded data, grouped by section.
6. **AU Core validation.** Once profiles are loaded on Callistemon, add `meta.profile` and a `$validate` step.
7. **Interprets consistency report.** Only if not delivered in FR-6.

---

## Appendix A: Section to FHIR mapping

| Tab / field | Output | Resource notes | AUCDI R3 badge |
|---|---|---|---|
| Patient demographics | `patient` | Patient (existing or new) | Sex and gender summary (gender field only) |
| Marital status | `patient` | `Patient.maritalStatus`, v3 MaritalStatus | none |
| Legal status | `observation-qa` | Local CodeSystem, values to be confirmed against METEOR "mental health legal status" | none |
| Care responsibilities, employment | `qr-only` | Free text | Occupation summary (employment) |
| Presenting complaint | `qr-only` | Never coded | none |
| History of presenting complaint, previous treatment | `qr-only` | Free text | Psychosocial therapy (previous treatment) |
| Symptoms (psychotic, mood, anxiety) | `observation-qa` | category `survey`, multiple | none |
| Neurovegetative fields | `observation-qa` | category `survey`, single (sleep multiple) | none |
| Risk: suicidal ideation, self-harm history | `observation-qa` | category `survey` | none |
| Stressors | `observation-qa` | category `social-history`, multiple | none |
| Impact domains | `qr-only` | Select: none, mild, moderate, severe | none |
| HoNOS total | `observation-score` | Local code, no SNOMED or LOINC code found | none |
| Past psychiatric diagnoses | `condition` | `problem-list-item`, clinicalStatus `inactive` or `resolved` | Problem/Diagnosis summary |
| Admissions, MHA history, psychiatrists | `qr-only` | Free text plus boolean | none |
| Past medical history | `condition` (SHOULD) | `problem-list-item` | Problem/Diagnosis summary |
| Current medications | `medication-statement` (SHOULD) | AU Core MedicationStatement shape | Medication use statement |
| Allergies | `allergy` (SHOULD) | AU Core AllergyIntolerance shape | Adverse reaction risk summary |
| Tobacco | `smoking-status` | AU Core Smoking Status shape | Tobacco smoking summary |
| Alcohol | `observation-qa` | category `social-history` | Alcohol consumption summary |
| Other substances | `substance-use` | Per-substance rows | Substance use summary |
| Consequences of IDU | `qr-only` | Free text | none |
| Family psychiatric history | `family-history` | Repeating rows | none |
| Forensic history | `qr-only`, `sensitive` | Free text | none |
| Personal history: education | `qr-only` | Free text | Education summary |
| Personal history: employment history | `qr-only` | Free text | Occupation summary |
| Personal history: housing | `qr-only` | Free text | Housing summary |
| Personal history: living arrangements | `qr-only` | Free text | Living arrangement summary |
| Personal history: finances | `qr-only` | Free text | Financial summary |
| Personal history: ADLs | `qr-only` | Free text | Functional ability |
| Other personal history subsections | `qr-only` | Free text; psychosexual history and trauma marked `sensitive` | none |
| MSE domains | `observation-qa` | category `exam`, multiple | none |
| MMSE domain subscores | `qr-only` | Integers | none |
| MMSE total | `observation-score` | 447316007, `valueInteger` 0 to 30 | none |
| Diagnoses | `condition` | `encounter-diagnosis`, `confirmed` or `provisional` | Problem/Diagnosis summary |
| Differential diagnoses | `condition` | `encounter-diagnosis`, `differential` | Problem/Diagnosis summary |

---

## Appendix B: Placeholder bindings

All codes were checked on Ontoserver against the SNOMED CT-AU edition (latest) on 18 November 2026. All bindings have status `placeholder`; Matt will review and replace them. "Count" is the active expansion size where it was checked.

### B.1 Neurovegetative (single select unless noted)

| Field id | Observable | ECL | Count | Notes |
|---|---|---|---|---|
| `nv-sleep` | 258158006 \|Sleep\| | `< 106168000 \|Finding related to sleep\| MINUS << 64572001 \|Disease\|` | 71 | Multiple select. Includes Early morning waking (401236004). |
| `nv-appetite` | 364663004 \|Appetite observable\| | `< 289161009 \|Finding of appetite\|` | not checked | |
| `nv-weight` | 248346009 \|Weight change\| | `< 365921005 \|Weight change finding\|` | not checked | |
| `nv-concentration` | 247760006 \|Ability to concentrate\| | `< 365759009 \|Finding related to ability to concentrate\|` | 6 | Includes Normal concentration. |
| `nv-energy` | 406202006 \|Energy observable\| | `< 301325005 \|Finding of general energy\|` | 8 | Three "Able to ... energy" concepts may warrant a MINUS. |
| `nv-anhedonia` | 285854004 \|Emotion\| | `<< 28669007 \|Anhedonia\| OR << 247796005 \|Loss of capacity for enjoyment\| OR << 430641005 \|Markedly diminished pleasure\|` | not checked | No specific observable and no normal concept found. |
| `nv-libido` | 248095000 \|Libido\| | `< 365965002 \|Libido - finding\|` | 10 | |

### B.2 Symptoms (multiple select)

| Field id | Observable | ECL | Notes |
|---|---|---|---|
| `sx-psychotic` | 363895008 \|Psychotic symptom\| | `< 279315008 \|Psychotic symptom finding\|` | |
| `sx-mood` | 1155968006 \|Mood\| | `(< 106131003 \|Mood finding\| MINUS << 64572001 \|Disease\|) MINUS (<< 416383008 \|Disturbance in affect\| OR 80608005 \|Appropriate affect\|)` | About 291 concepts; typeahead. The Disease exclusion removes about 414 disorders (major depression, bipolar, panic disorder and so on). About 50 fear and phobia concepts remain. Diurnal variation of mood (247800004) is already a descendant, via Stability of mood. |
| `sx-anxiety` | 405051006 \|Level of anxiety\| | `<< 48694002 \|Anxiety\|` | |

### B.3 Risk

| Field id | Observable | ECL | Notes |
|---|---|---|---|
| `risk-ideation` | 3161000175102 \|Suicide risk\| | `<< 6471006 \|Suicidal thoughts\| OR << 225457007 \|Feeling suicidal\|` | Multiple select. Set `label: "Suicidal ideation"`: the observable's AU preferred term is "Suicide risk", which would read as a risk rating field. |
| `risk-dsh-history` | TBC (none identified) | `<< 314550003 \|H/O: deliberate self harm\|` | Boolean control: ticking records the concept. |

### B.4 Stressors and impact

| Field id | Observable | ECL | Notes |
|---|---|---|---|
| `st-stressors` | 364706004 \|Life event observable\| | `< 365574009 \|Life event finding\|` | Typeahead. Likely incomplete: stressor content is scattered across hierarchies. |
| `st-honos-total` | Local code | n/a | No SNOMED observable found, and no LOINC code found on this server. |

### B.5 Mental state examination (multiple select)

| Field id | Observable | ECL | Notes |
|---|---|---|---|
| `mse-appearance` | 703248002 \|Appearance\| | `< 301305006 \|Finding of general observation of appearance\|` | |
| `mse-behaviour` | 363896009 \|Behavior observable\| | `< 844005 \|Behaviour finding\|` | Far too broad (includes substance use and sleep behaviour). Typeahead until refined. |
| `mse-speech` | 363918005 \|Speech observable\| | `< 106132005 \|Speech finding\|` | |
| `mse-mood` | 1155968006 \|Mood\| | `(< 106131003 \|Mood finding\| MINUS << 64572001 \|Disease\|) MINUS (<< 416383008 \|Disturbance in affect\| OR 80608005 \|Appropriate affect\|)` | Same binding as `sx-mood`. The affect MINUS keeps mood and affect disjoint, pending clinician feedback. |
| `mse-affect` | 4065008 \|Affect\| | `<< 416383008 \|Disturbance in affect\| OR 80608005 \|Appropriate affect\|` | 10 concepts. Affect findings are scattered in the hierarchy. |
| `mse-thought-form` | 247642000 \|Thought process\| | `< 365252004 \|Thought process - finding\|` | |
| `mse-thought-content` | 363877005 \|Thought content\| | `< 83507006 \|Finding of thought content\|` | |
| `mse-perception` | 81742003 \|Perception\| | `< 247699008 \|Psychological finding of perception\|` | |
| `mse-orientation` | 43173001 \|Orientation\| | `< 311470005 \|Finding related to orientation\|` | 21 concepts. |
| `mse-memory` | 363888004 \|Memory performance\| | `< 106136008 \|Memory finding\|` | |
| `mse-attention` | 247760006 \|Ability to concentrate\| | `< 365759009 \|Finding related to ability to concentrate\|` | Same binding as `nv-concentration`. |
| `mse-insight` | 27026000 \|Insight\| | `<< 12200008 \|Impaired insight\| OR 710031000220100 \|Partial insight\|` | No "good insight" finding exists. |
| `mse-judgement` | 61254005 \|Judgement\| | `< 365837000 \|Judgement - finding\|` | Observable status of 61254005 not verified; Binding Review will check it. |
| `mse-mmse-total` | 447316007 \|Mini-mental state examination score\| | n/a | Integer, 0 to 30. |

### B.6 Substance use

| Field id | Observable / code | ECL / values | Notes |
|---|---|---|---|
| `su-tobacco` | LOINC 72166-2 | AU Core Smoking Status value set | Matt to confirm. |
| `su-alcohol` | TBC | 783261004 \|Lifetime non-drinker\|, 219006 \|Current drinker\|, 82581004 \|Former drinker\| | Values are AUCDI R3's proposed set. |
| `su-substance` (status) | 363908000 \|Details of drug misuse behavior\| | 417284009 \|Current substance user\|, 44870007 \|Former substance user\|, "never used" TBC | "Misuse" wording is not neutral; flag for review. |
| `su-substance` (substance) | local `substance` component code | `< 105590001 \|Substance\|` (typeahead) | Seed rows by label: cannabis, amphetamines, MDMA, heroin, LSD, cocaine. Matt to supply the codes. |

### B.7 Diagnoses, history, medications, allergies

| Field id | ECL | Notes |
|---|---|---|
| `dx-diagnosis`, `dx-differential`, `ph-psych-dx`, `fh-condition` | `<< 74732009 \|Mental disorder\|` | The AU preferred term is "Mental illness", a nice demonstration of AU preferred terms. |
| `ph-pmhx` | `< 404684003 \|Clinical finding\|` | Typeahead. |
| `ph-medications` | `^ 929360071000036103 \|Medicinal product unit of use reference set\|` | Matt to confirm the AMT scope (for example whether to add the MP or TPUU reference sets). |
| `ph-allergies` | `< 105590001 \|Substance\| OR ^ 929360071000036103 \|Medicinal product unit of use reference set\|` | Alternative: the NCTS Adverse Reaction Agent value set, if it is available on the terminology server. |

---

## Appendix C: Content observations (for Matt, not for the developer to work around)

The developer should implement bindings as written and not compensate for these in code.

- **Mood and affect are conflated.** 106131003 |Mood finding| has the synonym "Affect finding" and interprets 285854004 |Emotion|. The MSE depends on mood (subjective) being distinct from affect (observed). The affect MINUS in the mood bindings only removes one concept (Loss of affect). Hypoaffectivity (33314005) and Incongruity of mood (276247002), arguably affect observations, remain under Mood finding.
- **Mood finding is a mixed hierarchy.** It has 706 active descendants, including disorders and about 50 fear and phobia concepts (for example Fear of birds, Dental phobia). Euthymic mood and Depressed mood are not under 365107007 |Level of mood - finding|, so a narrower root does not work either.
- **No suicidal ideation observable.** 3161000175102 |Suicide risk| is the closest available. 6471006 |Suicidal thoughts| interprets 311465003 |Cognitive functions|, not suicide risk.
- **No normal insight finding.** There is no "good" or "normal insight" finding.
- **Anhedonia has no specific observable** and no normal concept.
- **HoNOS has no code.** No SNOMED observable was found for HoNOS, and no LOINC code was found on this server, despite HoNOS being core to NOCC reporting.
- **Per-substance status coverage is thin.** For example, "Ex-cannabis user" exists but there is no current-user equivalent. The structured substance-use pattern is needed.
- **The substance use observable says "misuse".** 363908000 |Details of drug misuse behavior| is the available observable.
- **Stressor content is scattered.** A search for "psychosocial stressor" returns only 29657007 |Deferred diagnosis on Axis IV|.
- **Behaviour finding is too broad** to bind an MSE field directly.
