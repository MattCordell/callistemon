# FHIR AU eRequesting — Placer Demo

A browser-based requesting clinician (placer) demo for [AU eRequesting](https://build.fhir.org/ig/hl7au/au-fhir-erequesting/). Runs as static files on GitHub Pages — no build step required.

## File structure

```
index.html              HTML + CSS (no inline JS)
config.js               Terminology URLs, ValueSets, AU profiles, SNOMED codes
clinicians.js           Practitioner resources, specialties, favourites
app.js                  Boot sequence, DOM wiring, event listeners
modules/
  utils.js              UUID, formatAddress, date helpers, debug panel
  terminology.js        Ontoserver $expand, SNOMED $subsumes, fasting preload
  patient.js            Patient search, autocomplete, form fill
  reason-tags.js        Reason tag chips, clinical notes autocomplete
  warnings.js           Warning logic + warning registry
  suggestions.js        Suggestion rules + metadata, compute & render
  test-list.js          Selected tests state, add/remove/render, favourites
  bundle-builder.js     FHIR Transaction Bundle construction
  server.js             Send to server, QR modal, auth helpers
```

Scripts are loaded via `<script>` tags (not ES modules) so the app also works when opened as `file://`. All modules share state through the `window.App` namespace.

## How to add a new warning

Edit **`modules/warnings.js`**.

1. Define your warning message as a variable:

```js
var MY_NEW_WARN = 'Your warning message here';
```

2. Write an async apply function. It should loop over `App.selectedTests`, call `App.setWarn(test, message, condition)` for each test, and re-render if anything changed:

```js
async function applyMyNewWarning() {
  var changed = false;
  for (var i = 0; i < App.selectedTests.length; i++) {
    var t = App.selectedTests[i];
    var condition = /* your logic here, e.g. */ await App.snomedSubsumes('PARENT_CODE', t.code);
    changed = App.setWarn(t, MY_NEW_WARN, condition) || changed;
  }
  if (changed) App.renderSelectedTests();
}
```

3. Register it in the `App.warningRules` array at the bottom of the file:

```js
App.warningRules = [
  // ... existing rules ...
  { name: 'my-new-warning', apply: applyMyNewWarning }
];
```

That's it. The registry is called automatically whenever tests are added/removed or pregnancy status changes.

### Per-test history warnings

For warnings that check a patient's history (e.g. "already had this test recently"), add logic inside `App.checkTestHistoryWarning()` in the same file. This runs once per test when it's added.

## How to add a new test suggestion rule

Edit **`modules/suggestions.js`**.

1. Add metadata for any new suggested tests to `App.SUGGESTED_TESTS_META`:

```js
App.SUGGESTED_TESTS_META = {
  // ... existing entries ...
  "NEW_SNOMED_CODE": { display: "Test display name", kind: 'PATH' }  // or 'IMAG'
};
```

2. Add a rule to `App.SUGGESTION_RULES`. Each rule has parent SNOMED codes (matched via `$subsumes` against the patient's reason tags) and test codes to suggest:

```js
App.SUGGESTION_RULES = [
  // ... existing rules ...
  { parents: ['PARENT_SNOMED_CODE'], tests: ['NEW_SNOMED_CODE'] }
];
```

If *any* reason tag is a subtype of a parent code, all tests in that rule are suggested (minus any already selected).

## How to add a new clinician

Edit **`clinicians.js`**. Add entries to `App.practitionerResources`, `App.roleSpecialties`, and `App.userFavourites`, then add a matching `<option>` in the doctor-select dropdown in `index.html`.

## Running locally

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/eRequest-placer/`.
