You are building a static FHIR demonstrator in the folder mh-assessment/ of the callistemon repo, served by GitHub Pages. SPEC.md in this folder is the source of truth. Read it fully before planning.

Ground rules:
- Work only inside mh-assessment/. The only exception is adding a link card to the repo's root index.html in session 4, following the existing cards' style. Do not modify other demonstrators or existing workflows.
- Before choosing a stack, look at one or two existing demonstrators in the repo for conventions (structure, styling, how they configure the FHIR server). Prefer no build step.
- All terminology bindings (codes, ECL, displays) live only in definition/assessment-definition.js. Never hard-code code lists anywhere else.
- Terminology server: https://tx.ontoserver.csiro.au/fhir. SNOMED CT-AU edition http://snomed.info/sct/32506021000036107, no version. FHIR server: https://server.callistemon.site/fhir (vanilla HAPI R4, no profiles, no SNOMED loaded).
- This is a demonstrator: no automated tests, no production hardening. Keep code readable and modular.
- Synthetic data only. Australian English in UI text.
- Do not "fix" terminology content in code. If a binding returns odd results, surface it in the Binding Review and mention it in your summary.
- End each session with a short summary: what was built, deviations from SPEC.md and why, and open questions. Then stop.