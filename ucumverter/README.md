# UCUMverter

A browser demo of UCUM unit conversion. It uses a therapeutic drug monitoring (TDM) dose calculator as the example. Every quantity can be entered or shown in any allowed unit, and the calculated dose stays the same, because each value is converted to a canonical UCUM unit before any arithmetic.

**Demonstration only. Not for clinical use.** The guideline values are drafts and the dose model is deliberately simplified.

## Quick start

The app loads its JSON config with `fetch`, so it needs to be served over http. Opening `index.html` from disk (`file://`) won't work.

1. From the repo root, run `python -m http.server 8000`.
2. Open `http://localhost:8000/ucumverter/`.
3. Pick a guideline, then press **Random patient** and **Shuffle units** a few times. The dose, volume and units needed stay the same, and the conversion trace shows each conversion.

To run the tests, open `http://localhost:8000/ucumverter/test.html`.

## How it works

1. **Patient:** age, sex, weight, height and serum creatinine. The creatinine LOINC code shown switches between `14682-9` (molar) and `2160-0` (mass) to match the unit you choose.
2. **Clinical guideline:** a target dose (for example 7 `mg/kg`), a weight basis, an optional maximum dose and the drug ECL.
3. **Lab result:** a LOINC-coded measured drug level, with unit choices that match the LOINC property (mass or substance concentration).
4. **Drug selection:** AMT products from the guideline ECL. Each product's strength is read from SNOMED CT-AU concrete domains with `$lookup`, and its SNOMED unit concepts are mapped to UCUM.

The calculation in [modules/calc.js](modules/calc.js) runs in this order:

| Step | Rule |
|---|---|
| Ideal body weight | Devine: male `50 + 0.9 x (cm - 152)`, female `45.5 + 0.9 x (cm - 152)` |
| Dosing weight | `actual`, `ideal` (or actual if lower), or `adjustedIfObese` (`IBW + 0.4 x (ABW - IBW)` when ABW is over 120% of IBW) |
| Creatinine clearance | Cockcroft-Gault, using the lower of actual and ideal weight. Display only |
| Base dose | target dose x dosing weight |
| Level adjustment | x (target level / measured level), assuming linear kinetics |
| Maximum dose | cap, if the guideline has one |
| Salt conversion | if the product's basis of strength substance (BoSS) differs from the guideline dose substance, convert mass to mol to mass with the configured molar masses (for example phenytoin sodium to phenytoin) |
| Volume | dose / concentration, when AMT gives a concentration |
| Units needed | dose / quantity per unit, rounded up, when AMT gives a total quantity |

UCUM conversion uses the NLM [ucum-lhc](https://github.com/lhncbc/ucum-lhc) library (version 7.1.10, loaded from jsdelivr). Mass and molar conversions pass the substance's molar mass.

## Architecture

```
ucumverter/
  index.html                  Entry point: patient, three numbered panels, result
  app.js                      Loads config, wires the panels, recalculates on every change
  config.js                   Terminology server, SNOMED CT-AU edition, AMT attribute ids
  styles.css                  Layout and theme
  test.html                   Browser test runner

  config/
    guidelines.json           Clinical guidelines (draft) and creatinine settings
    units.json                Unit choices for every field, and lab unit sets keyed by LOINC
    snomed-ucum-map.json      SNOMED CT unit concept -> UCUM code (1:1)
    medicines.json            Offline snapshot of AMT products (generated)

  modules/
    calc.js                   Pure calculation with a conversion trace
    ucum.js                   Wrapper over ucum-lhc: convert, validate, describe
    terminology.js            ECL expansion, strength $lookup, offline fallback
    patient.js                Random plausible adult patient
    ui.js                     Unit dropdowns, value + unit fields, trace table

  tests/
    calc.tests.js             Test cases run by test.html

  tools/
    build-medicines.ps1       Rebuilds config/medicines.json from Ontoserver
```

## Config files

### guidelines.json

Each guideline has:

| Field | Meaning |
|---|---|
| `targetDose` | `{value, unit}`, for example `{7, "mg/kg"}` |
| `weightBasis` | `actual`, `ideal` or `adjustedIfObese` |
| `maxDose` | `{value, unit}` or `null` |
| `doseSubstance` | SNOMED CT substance the dose is expressed as |
| `analyte` | SNOMED CT substance the lab measures |
| `substances` | `{code: {display, molarMass}}` for the dose substance, analyte and any product BoSS. `molarMass` in g/mol, or `null` |
| `drugEcl` | ECL for the AMT products (medicinal product unit of use) |
| `loinc` | `[{code, display}]` for the TDM tests |
| `targetLevel` | `{value, unit, rangeText}` |
| `crclWarnBelow` | `{value, unit}` or `null` |

Up to 5 guidelines are intended. To add one, add an entry here, add its LOINC codes to `loincUnits` in `units.json`, then rebuild the medicines snapshot.

### units.json

Every unit is a UCUM code, and the dropdowns show the code with its UCUM name. Lab units are grouped into unit sets (`massConc`, `molarConc`, and so on). Each LOINC code points to one set in `loincUnits`.

### snomed-ucum-map.json

A 1:1 map from the SNOMED CT unit concepts used in AMT strengths to UCUM codes. A product whose strength uses an unmapped unit is listed but disabled.

## Medicines and the offline snapshot

When you choose a guideline, the app expands its ECL on `https://tx.ontoserver.csiro.au/fhir` and reads each product's strength with `CodeSystem/$lookup`:

| Attribute | Meaning |
|---|---|
| `999000021000168100` | Has concentration strength value |
| `999000031000168102` | Has concentration strength unit |
| `999000041000168106` | Has total quantity value |
| `999000051000168108` | Has total quantity unit |
| `732943007` | Has basis of strength substance |

If Ontoserver can't be reached, the app uses `config/medicines.json` and shows an **Offline snapshot** badge. Rebuild the snapshot after you change any ECL:

```powershell
powershell -ExecutionPolicy Bypass -File .\ucumverter\tools\build-medicines.ps1
```
