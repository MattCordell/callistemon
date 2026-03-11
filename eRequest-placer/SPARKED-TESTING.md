# Sparked Server Testing — Issues & Fixes

Server: `https://smile.sparked-fhir.com/ereq/fhir/DEFAULT`

| # | Error | Fix | Status |
|---|-------|-----|--------|
| 1 | Wrong username/auth for Sparked server | Changed user from `$erequesting-admin` to `placer`, renamed storageKey | Fixed |
| 2 | `PGN` not in `order-identifier-type` value set (warning) | Attempted `PLAC`, reverted — AU eRequesting profiles **fix** the value to `PGN`; server-side inconsistency, warning persists | Known issue (server) |
| 3 | New Patient missing required `identifier` | Added generated identifier using `PLACER_SYS` + UUID | Fixed |
| 4 | ServiceRequest missing required `displaySequence` extension | Added extension with incrementing integer per ServiceRequest | Fixed |
| 5 | ServiceRequest missing required `encounter` | Added Encounter resource to bundle, referenced from each ServiceRequest | Fixed |
| 6 | Practitioner profile URL typo (`erequesting` vs `ereq`) | Corrected to `http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-practitioner` | Fixed |
| 7 | SNOMED display names differ from official preferred terms | Added `officialDisplay` for FHIR coding; UI keeps friendly names. Also fixed wrong code for "Serum pregnancy test" (`401324008` → `166434005`) | Fixed |
| 8 | `au-ereq-srr-02`: pregnancy `supportingInfo` must have status "pregnant" | Only reference pregnancy obs in `supportingInfo` when status is 77386006 (Pregnant) | Fixed |
