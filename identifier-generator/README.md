# Identifier Generator

A browser demo and small JavaScript library that makes and checks synthetic Australian health identifiers. Use it to fill demos with fresh Medicare, DVA, IHI, HPI-I, HPI-O, provider, prescriber and AHPRA numbers.

**Demonstration only. The values are synthetic but not guaranteed to be non-real.** See [Limits](#limits).

## Quick start

The page loads ES modules, so it needs to be served over http. Opening `index.html` from disk (`file://`) won't work.

1. Run `python ucumverter/tools/serve.py` from the repo root. It serves the whole repo with browser caching turned off.
2. Open `http://localhost:8000/identifier-generator/`.
3. Pick a type, press **Generate**, and copy one value or the whole list as a plain list, JSON or FHIR Identifier JSON. The **Validate** tab checks any value you paste, and **Rules and limits** lists the formats. The tab shows in the URL, so `#validate` and `#rules` link straight to those tabs.

## Use it as a library

The modules have no dependencies and run in browsers and Node. `package.json` sets `"type": "module"` so Node accepts the imports.

```js
import { generate, validate, toFhirIdentifier, TYPES } from './modules/registry.js';

generate('ihi', { count: 5, seed: 42 });      // ['8003...', ...]  same seed, same list
generate('medicare', { count: 3, length: 10 }); // 10 digits, no IRN
validate('ihi', '8003609928383098');           // { valid: true, warnings: [] }
validate('medicare-provider', '532698GK');     // { valid: true, warnings: [] }
toFhirIdentifier('ihi', '8003609928383098');   // { system: 'http://ns.electronichealth.net.au/id/hi/ihi/1.0', value: '...' }
```

Type ids: `medicare`, `dva`, `ihi`, `hpii`, `hpio`, `medicare-provider`, `pbs-prescriber`, `ahpra`, `hospital-provider`.

- `generate` returns values that are unique within one call and never returns a value listed in `config/reserved.js`. It keeps no record between calls (see [Limits](#limits)).
- `validate` returns `{ valid: true, warnings }` or `{ valid: false, reason }`. A warning means "accepted, but unusual", for example an unknown DVA war code.
- `toFhirIdentifier` leaves `system` out for the hospital provider number, because the HL7 AU Base IG defines none.

## The rules

| Type | Format | Check |
|---|---|---|
| Medicare card number | 10 or 11 digits. Digit 1 is 2-6. Digit 10 is the issue number, digit 11 the IRN | Digit 9 = (digits 1-8 x 1,3,7,9,1,3,7,9) mod 10 |
| DVA file number | State letter (N,S,W,T,V,Q) + war code (1-3 letters) + digits + optional dependant letter, up to 9 characters | None |
| IHI | 16 digits, prefix 800360 | Luhn |
| HPI-I | 16 digits, prefix 800361 | Luhn |
| HPI-O | 16 digits, prefix 800362 | Luhn |
| Medicare provider number | 6-digit stem + location character + check letter | (stem + location value) x 3,5,8,4,2,1,6, mod 11, mapped to a letter |
| Hospital PBS provider number | Same as Medicare provider number, stem starts with 0 | Same |
| PBS prescriber number | 7 digits | Mod 10 (weights 1,3,7,9,1,3), or mod 11 (weights 0,5,8,4,2,1) when the first digit is 0 |
| AHPRA registration number | 3-letter profession code + 10 digits | None |

Where sources disagree, the generator produces the strictest valid subset so every validator accepts the output:

- Generated provider location characters never include 0, I, O, S or Z. The validator still accepts 0 with a warning, because the RAMD tool emits it.
- A prescriber number that starts with 0 and gives check value 10 is never generated. No source says what that check digit should be, so the validator rejects it.

## Limits

- **Not guaranteed non-real.** No public specification reserves a test-only range for these identifiers. Official test data from the Digital Health Agency and Services Australia is available to registered vendors, but it is gated and aimed at conformance testing. This project does not use it.
- **Crowded spaces.** An 8-digit Medicare base has roughly 50 million combinations and millions of cards are in use, so a valid value can match a real one. This is the author's estimate, not a sourced figure.
- **No record of past runs.** Separate calls can repeat a value. The odds are low at demo volumes: the expected number of duplicate pairs reaches 1 at roughly 1,400 prescriber numbers, 2,500 hospital provider numbers, 7,500 Medicare provider numbers or 45,000 IHI-style numbers. When bulk-loading a FHIR server, use a conditional create (`If-None-Exist: identifier=<system>|<value>`) and regenerate on a `200` response. Not tested against `server.callistemon.site`.
- **Reserved list.** `config/reserved.js` holds the 90 demo values in [Identifiers.md](../Identifiers.md). If you hard-code an identifier into any sub-project, record it in both places.
- **Third-party sources.** The HL7 AU Base IG is authoritative for IHI, HPI-I, HPI-O and AHPRA formats. The Medicare, provider, prescriber and DVA rules come from [curmi.com](https://curmi.com/australian-health-identifiers/) and third-party validators.
- **RAMD sample that fails.** Hospital number `0971047H` in Identifiers.md fails the Medicare provider algorithm (it should end in F). The other 89 of the 90 samples pass this library's validators.

## Architecture

```
identifier-generator/
  index.html  app.js  styles.css   Demo page
  package.json                     {"type":"module"} for Node
  modules/
    registry.js                    TYPES, generate(), validate(), toFhirIdentifier()
    random.js                      Seedable random numbers (mulberry32)
    checks.js                      Luhn, weighted sums, validation result helpers
    medicare.js  hi.js  provider.js  prescriber.js  ahpra.js  dva.js
  config/
    reserved.js                    Demo values never emitted
    war-codes.js                   60 DVA war codes
    ahpra-professions.js           14 AHPRA profession codes
```

The config lists are `.js` modules rather than JSON so they import the same way in browsers and Node, with no `fetch` or import attributes.
