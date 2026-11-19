# Mental health assessment demonstrator

A browser-based demonstrator of a structured mental health assessment. It shows how SNOMED CT-AU, ECL value set bindings and HL7 FHIR R4 can support a mental health, alcohol and other drugs (MHAOD) assessment. The form is based on an example assessment template from a Queensland Health MHAOD clinician.

**Open it:** https://mattcordell.github.io/callistemon/mh-assessment/

**Synthetic data only.** The form covers forensic history, domestic violence, abuse, sexual history and substance use. Never enter real patient information. A banner on every page says so.

The full specification is in [SPEC.md](SPEC.md).

## What it demonstrates

- **Quick, natural coded entry.** Well-bound value sets give clinicians short chip lists and dropdowns, not code searches.
- **Traceable bindings.** Every coded field shows its observable, ECL, expansion size and review status.
- **Reusable output.** The same data entry produces a FHIR transaction Bundle that is posted to the Callistemon FHIR server.

## How to use it

1. **Choose a patient.** On the Context tab, search the FHIR server by name, or create a new patient.
2. **Or load the example.** Press **Load example** in the header. It fills the form with a synthetic moderate depressive presentation and creates a new example patient, unless you have already chosen an existing one.
3. **Fill in the form.** The 13 tabs follow the source template. The count on each tab shows how many fields hold a value.
4. **See the terminology.** Press **Terminology lens** to show the binding beside each coded field. In the Lens, select a value under "Selected" to see its concept details: the FSN, synonyms, parents and Interprets.
5. **Check every binding.** Open **Binding review** for a table of all fields, live expansion counts and warnings. You can export it as CSV.
6. **Submit.** On **Review and submit**, check the live Bundle preview, then POST it, download it, or download the Questionnaire.

## How bindings work

All tabs, sections, fields and bindings live in one file: [definition/assessment-definition.js](definition/assessment-definition.js). No code, ECL or display is written anywhere else in the app.

- **Implicit value sets.** Each field's `ecl` becomes an implicit value set URL in the SNOMED CT-AU edition: `http://snomed.info/sct/32506021000036107?fhir_vs=ecl/{URL-encoded ECL}`. The edition has no version, so the latest release is always used.
- **Server-side expansion.** The app expands the value set on Ontoserver (`https://tx.ontoserver.csiro.au/fhir`) and shows the Australian preferred term.
- **Automatic controls.** A field with `control: "auto"` picks its control from the expansion size:
  - 12 concepts or fewer: chips (checkboxes when the field allows several answers)
  - 13 to 60 concepts: a dropdown
  - more than 60 concepts: a typeahead that searches the server as you type
- **Empty means not recorded.** A field with nothing selected creates no resource and no QuestionnaireResponse item.
- **Placeholder status.** Every binding is a placeholder until reviewed. The status shows only in the Terminology Lens and the Binding Review, never in the clinician view.
- **Failure is contained.** If an expansion fails, that field is disabled and the error shows in the Lens. The rest of the form still works.

## How to edit the definition file

1. **Edit the field.** Change its `ecl`, `observable`, `label` or other properties in [definition/assessment-definition.js](definition/assessment-definition.js). The file is a JavaScript module, so comments can sit beside the ECL.
2. **Reload the page.** The form uses the new binding at once. No other change is needed.
3. **Run the Binding Review.** Check the new expansion count and any warnings.
4. **Mark it reviewed.** When you are happy with a binding, change its `status` from `"placeholder"` to `"reviewed"`.

### Field properties

| Property | Required | Meaning |
|---|---|---|
| `id` | yes | Stable identifier. Also the QuestionnaireResponse and Questionnaire `linkId`. |
| `tab`, `section` | yes | Where the field appears on the form. |
| `label` | no | Display label. If omitted, the AU preferred term of `observable` is used. |
| `observable` | for coded Observations | `{ code, display }`, plus `system` if it is not SNOMED CT. Becomes `Observation.code`. |
| `ecl` | for coded fields | ECL for the answer value set, written with pipes and terms. |
| `valueSet` | no | A canonical value set URL, for bindings that are not ECL. |
| `options` | no | Inline `[{ system, code, display }]` for local or FHIR-internal codes. |
| `control` | yes | `auto`, `select`, `multiselect`, `typeahead`, `text`, `textarea`, `integer`, `boolean`, `date` or `repeating-group`. |
| `cardinality` | yes | `single` or `multiple`. |
| `output` | yes | The FHIR target, for example `observation-qa`, `condition`, `family-history` or `qr-only`. |
| `category` | for Observations | Observation category code. |
| `columns` | for repeating groups | The sub-fields of each row. Each column has its own binding. |
| `aucdi` | no | AUCDI Release 3 data group, shown as a badge. |
| `sensitive` | no | `true` for sensitive sections. Shows a visual marker only. |
| `icd11` | no | `true` to show the unreviewed ICD-11 entities for the chosen concept. Set on diagnoses, differential diagnoses and family history conditions. |
| `status` | yes | `placeholder` or `reviewed`. |
| `notes` | no | Notes shown in the Lens and the Binding Review. |

The comment at the top of the definition file lists the remaining optional properties, such as `role`, `scale`, `helper` and `seedRows`.

### Example entry

```js
{
  id: "nv-libido",
  tab: "neurovegetative",
  section: "Neurovegetative disturbance",
  // label omitted: uses the AU preferred term of the observable
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

### Example data

`EXAMPLE_SCENARIO`, at the end of the definition file, holds the example assessment. Coded values are given by code only. When you press **Load example**, each code is checked against the field's current binding with `$validate-code`. A code that is no longer in the binding is skipped, and a warning is written to the browser console. So if you change a binding, the example follows it rather than overriding it.

## FHIR output

- **Transaction Bundle.** The Bundle holds a new Patient (if one was created), an Encounter, a QuestionnaireResponse, and the extracted resources. These are Observations, Conditions, a FamilyMemberHistory, MedicationStatements and AllergyIntolerances. SPEC.md section 7 and Appendix A give the full mapping.
- **Server.** The Bundle is posted to `https://server.callistemon.site/fhir`, a plain HAPI R4 server with no profiles and no SNOMED CT loaded. Resources are shaped to AU Core where a profile exists, but they make no profile claims.
- **Questionnaire.** **Download Questionnaire** generates a FHIR Questionnaire from the definition file. It has one group per tab and one item per field. Each item's `code` is the observable, and its `answerValueSet` is the implicit ECL value set URL. Its canonical URL is `https://callistemon.site/fhir/Questionnaire/mhaod-assessment`, which the QuestionnaireResponse references.

## ICD-11 unreviewed display

When you choose a diagnosis, a differential diagnosis or a family history condition, the form lists the ICD-11 entities whose draft research map points to that exact SNOMED CT concept. It does not look at broader concepts.

- **Draft map.** The map is an unreviewed research map that runs from ICD-11 to SNOMED CT. Reading it backwards is a display aid only. It is not a SNOMED CT to ICD-11 map. Every panel carries an "Unreviewed research map" badge that says so.
- **What each row shows.** The MMS code (or the Foundation URI if the entity has no MMS code), the description, the relationship, the map status, and links to the WHO ICD-11 browser.
- **Not in FHIR.** ICD-11 codes are never written into the FHIR resources.

### Refreshing the map file

The app reads [data/ICD11_Ch6_SCT_combined_map.tsv](data/ICD11_Ch6_SCT_combined_map.tsv). It is a trimmed copy of the full research map. It keeps only the columns the display needs, and only rows that have a `Target Code`. The app finds columns by header name, so their order does not matter.

To rebuild it from a new full map in PowerShell, run this from the repo root:

```powershell
$cols = 'Source Code','Description','FoundationURI','MMS Code','MMS BrowserURL','Foundation BrowserURL','Relationship','Map Status','Target Code','Display'
Import-Csv -Path "$HOME\Downloads\ICD11_Ch6_SCT_combined_map.tsv" -Delimiter "`t" |
  Where-Object { $_.'Target Code' } |
  Select-Object $cols |
  Export-Csv -Path .\mh-assessment\data\ICD11_Ch6_SCT_combined_map.tsv -Delimiter "`t" -NoTypeInformation -Encoding UTF8
```

PowerShell puts every value in quotes. The app removes them, so this output and an unquoted copy give identical results.

## Known content gaps

These are SNOMED CT content observations from SPEC.md Appendix C. The bindings are implemented as written; the app does not work around them.

- **Mood and affect are conflated.** 106131003 |Mood finding| has the synonym "Affect finding" and interprets 285854004 |Emotion|. The mental state examination needs mood (subjective) to be distinct from affect (observed). The affect MINUS in the mood bindings removes only one concept, Loss of affect. Hypoaffectivity (33314005) and Incongruity of mood (276247002), arguably affect observations, remain under Mood finding.
- **Mood finding is a mixed hierarchy.** It has 706 active descendants, including disorders and about 50 fear and phobia concepts, such as Fear of birds and Dental phobia. Euthymic mood and Depressed mood are not under 365107007 |Level of mood - finding|, so a narrower root does not work either.
- **No suicidal ideation observable.** 3161000175102 |Suicide risk| is the closest available. 6471006 |Suicidal thoughts| interprets 311465003 |Cognitive functions|, not suicide risk.
- **No normal insight finding.** There is no "good" or "normal insight" finding.
- **Anhedonia has no specific observable** and no normal concept.
- **HoNOS has no code.** No SNOMED CT observable was found for HoNOS, and no LOINC code was found on the terminology server, although HoNOS is core to NOCC reporting. The demonstrator uses a local code.
- **Per-substance status coverage is thin.** For example, "Ex-cannabis user" exists but there is no current-user equivalent, so a structured substance-use pattern is needed.
- **The substance use observable says "misuse".** 363908000 |Details of drug misuse behavior| is the only observable available.
- **Stressor content is scattered.** A search for "psychosocial stressor" returns only 29657007 |Deferred diagnosis on Axis IV|.
- **Behaviour finding is too broad** to bind a mental state examination field directly.

## Backlog

These items are out of scope for v1 and are tracked as GitHub issues:

- [#44 SDC and Smart Forms round-trip](https://github.com/MattCordell/callistemon/issues/44)
- [#45 Reporting view (METEOR, NOCC, AOD NMDS)](https://github.com/MattCordell/callistemon/issues/45)
- [#46 Security labels on sensitive resources](https://github.com/MattCordell/callistemon/issues/46)
- [#47 Encounter and EpisodeOfCare modelling](https://github.com/MattCordell/callistemon/issues/47)
- [#48 Clinical summary view](https://github.com/MattCordell/callistemon/issues/48)
- [#49 AU Core validation](https://github.com/MattCordell/callistemon/issues/49)
- [#50 Interprets consistency report](https://github.com/MattCordell/callistemon/issues/50)

## Files

| Path | Purpose |
|---|---|
| `index.html`, `app.js`, `styles.css` | Page shell, start-up and styles |
| `config.js` | Server URLs, edition and UI settings. The Settings panel can override the servers and edition. |
| `definition/assessment-definition.js` | Every tab, field, binding and the example scenario |
| `modules/terminology.js` | Ontoserver client: `$expand`, `$lookup` and `$validate-code`, with caching |
| `modules/form.js`, `controls.js`, `typeahead.js`, `patient.js` | The clinical form |
| `modules/lens.js`, `binding-review.js` | Terminology Lens and Binding Review |
| `modules/qr-builder.js`, `extract.js`, `bundle.js`, `submit.js`, `fhir-client.js` | FHIR output and submission |
| `modules/questionnaire.js` | Questionnaire generation |
| `modules/icd11.js`, `data/` | ICD-11 unreviewed display |
| `modules/example.js` | Example data loader |

There is no build step. The page is plain ES modules served by GitHub Pages. To run it locally, serve the repo root with any static web server, for example `python -m http.server`, and open `/mh-assessment/`.
