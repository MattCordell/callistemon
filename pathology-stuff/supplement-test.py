"""
FHIR CodeSystem Supplement Tester for Ontoserver R4

Tests supplement integration using the useSupplement parameter on $expand.

KEY FINDINGS:
- useSupplement on $expand WORKS: designations are searchable, properties
  returned as R5 backport extensions.
- useSupplement on $lookup is 0..0 (not supported on R4 or R5 Ontoserver).
- The supplement must have a versioned 'supplements' canonical reference
  e.g. "http://snomed.info/sct|http://snomed.info/sct/32506021000036107/version/20260228"
"""

import requests
import json

BASE_URL = "https://r4.ontoserver.csiro.au/fhir"
SUPPLEMENT_URL = "https://github.com/MattCordell/callistemon/fhir/CodeSystem/snomed-pathology-test-info-supplement"
SUPPLEMENT_REF = f"{SUPPLEMENT_URL}|1.0.0"
SNOMED_SYSTEM = "http://snomed.info/sct"
SPIA_VS = "https://www.rcpa.edu.au/fhir/ValueSet/spia-requesting-refset-3"
BOOST_VS = "http://snomed.info/sct?fhir_vs=refset/933412481000036103"
TEST_CODES = ["26604007", "444164000", "55235003"]  # FBC, UEC, CRP
SUPPLEMENT_PROPERTIES = ["pathologyTestsExplainedUrl", "rcpaManualUrl", "requiredSpecimen"]
R5_PROP_EXT = "http://hl7.org/fhir/5.0/StructureDefinition/extension-ValueSet.expansion.contains.property"

HEADERS = {"Accept": "application/fhir+json"}


def pretty(data: dict) -> str:
    return json.dumps(data, indent=2)


def save_response(filename: str, data: dict):
    with open(filename, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  -> Saved to {filename}")


def print_separator(title: str, num: int):
    print(f"\n{'=' * 70}")
    print(f"  TEST {num}: {title}")
    print(f"{'=' * 70}")


def extract_r5_properties(concept: dict) -> dict:
    """Extract supplement properties from R5 backport extensions on a concept."""
    props = {}
    for ext in concept.get("extension", []):
        if ext.get("url") != R5_PROP_EXT:
            continue
        sub_exts = ext.get("extension", [])
        code_ext = next((e for e in sub_exts if e.get("url") == "code"), None)
        value_ext = next((e for e in sub_exts if e.get("url") == "value"), None)
        if not code_ext:
            continue
        code = code_ext.get("valueCode", "")
        value = (
            (value_ext.get("valueString") if value_ext else None)
            or (value_ext.get("valueCode") if value_ext else None)
            or ""
        )
        if code in SUPPLEMENT_PROPERTIES:
            props[code] = value
    return props


# ── TEST 1: Verify supplement is loaded ───────────────────────────────

def test_supplement_loaded():
    print_separator("Verify supplement is loaded on Ontoserver", 1)

    resp = requests.get(
        f"{BASE_URL}/CodeSystem",
        params={"url": SUPPLEMENT_URL},
        headers=HEADERS
    )
    print(f"  HTTP {resp.status_code}")

    bundle = resp.json()
    total = bundle.get("total", 0)
    print(f"  Found: {total} matching CodeSystem(s)")

    if total == 0:
        print("  Supplement NOT loaded.")
        return False

    entry = bundle["entry"][0]["resource"]
    print(f"  id: {entry.get('id')}")
    print(f"  content: {entry.get('content')}")
    print(f"  supplements: {entry.get('supplements')}")
    print(f"  Declared properties: {[p['code'] for p in entry.get('property', [])]}")
    return True


# ── TEST 2: $expand with useSupplement + explicit properties ─────────

def test_expand_with_supplement_properties():
    """$expand requesting specific supplement properties via useSupplement."""
    print_separator("$expand with useSupplement + explicit property params", 2)

    params = [
        ("url", SPIA_VS),
        ("filter", "full blood"),
        ("count", "3"),
        ("includeDesignations", "true"),
        ("useSupplement", SUPPLEMENT_REF),
        ("property", "pathologyTestsExplainedUrl"),
        ("property", "rcpaManualUrl"),
        ("property", "requiredSpecimen"),
    ]

    resp = requests.get(f"{BASE_URL}/ValueSet/$expand", params=params, headers=HEADERS)
    print(f"  HTTP {resp.status_code}")
    data = resp.json()
    save_response("test2_expand_supplement_props.json", data)

    if resp.status_code != 200:
        print(f"  ERROR: {pretty(data)}")
        return

    for c in data.get("expansion", {}).get("contains", []):
        print(f"\n  {c['code']} - {c.get('display')}")
        props = extract_r5_properties(c)
        if props:
            print(f"  Supplement properties ({len(props)}):")
            for code, val in props.items():
                print(f"    {code}: {val}")
        else:
            print(f"  (no supplement properties for this code)")


# ── TEST 3: $expand filter search for supplement designation ──────────

def test_expand_filter_supplement_designation():
    """Search for 'UEC' — a synonym only in the supplement."""
    print_separator("$expand filter 'UEC' (supplement-only synonym)", 3)

    params = [
        ("url", SPIA_VS),
        ("filter", "UEC"),
        ("count", "5"),
        ("includeDesignations", "true"),
        ("useSupplement", SUPPLEMENT_REF),
        ("property", "pathologyTestsExplainedUrl"),
        ("property", "rcpaManualUrl"),
        ("property", "requiredSpecimen"),
    ]

    resp = requests.get(f"{BASE_URL}/ValueSet/$expand", params=params, headers=HEADERS)
    print(f"  HTTP {resp.status_code}")
    data = resp.json()
    save_response("test3_expand_filter_UEC.json", data)

    if resp.status_code != 200:
        print(f"  ERROR: {pretty(data)}")
        return

    contains = data.get("expansion", {}).get("contains", [])
    print(f"  Results for 'UEC': {len(contains)}")
    for c in contains:
        print(f"\n  {c['code']} - {c.get('display')}")

        # Show designations (should include UEC, EUC from supplement)
        for d in c.get("designation", []):
            use = d.get("use", {})
            print(f"    DESIG [{use.get('display', '')}]: {d.get('value')}")

        props = extract_r5_properties(c)
        if props:
            print(f"  Supplement properties:")
            for code, val in props.items():
                print(f"    {code}: {val}")


# ── TEST 4: $expand with boost ────────────────────────────────────────

def test_expand_with_boost():
    """$expand with useSupplement and _boost for common pathology tests."""
    print_separator("$expand with useSupplement + _boost", 4)

    params = [
        ("url", SPIA_VS),
        ("filter", "blood"),
        ("count", "5"),
        ("includeDesignations", "true"),
        ("useSupplement", SUPPLEMENT_REF),
        ("property", "pathologyTestsExplainedUrl"),
        ("property", "rcpaManualUrl"),
        ("property", "requiredSpecimen"),
        ("_boost", BOOST_VS),
    ]

    resp = requests.get(f"{BASE_URL}/ValueSet/$expand", params=params, headers=HEADERS)
    print(f"  HTTP {resp.status_code}")
    data = resp.json()
    save_response("test4_expand_boost.json", data)

    if resp.status_code != 200:
        print(f"  ERROR: {pretty(data)}")
        return

    for c in data.get("expansion", {}).get("contains", []):
        props = extract_r5_properties(c)
        has_supp = " (has supplement)" if props else ""
        print(f"  {c['code']} - {c.get('display')}{has_supp}")


# ── TEST 5: $expand for multiple codes with supplement ────────────────

def test_expand_inline_valueset():
    """Expand an inline ValueSet for specific codes with useSupplement."""
    print_separator("$expand inline ValueSet with useSupplement", 5)

    params = {
        "resourceType": "Parameters",
        "parameter": [
            {
                "name": "valueSet",
                "resource": {
                    "resourceType": "ValueSet",
                    "compose": {
                        "include": [{
                            "system": SNOMED_SYSTEM,
                            "concept": [{"code": c} for c in TEST_CODES]
                        }]
                    }
                }
            },
            {"name": "includeDesignations", "valueBoolean": True},
            {"name": "useSupplement", "valueCanonical": SUPPLEMENT_REF},
            {"name": "property", "valueString": "pathologyTestsExplainedUrl"},
            {"name": "property", "valueString": "rcpaManualUrl"},
            {"name": "property", "valueString": "requiredSpecimen"},
        ]
    }

    resp = requests.post(
        f"{BASE_URL}/ValueSet/$expand",
        json=params,
        headers={**HEADERS, "Content-Type": "application/fhir+json"}
    )
    print(f"  HTTP {resp.status_code}")
    data = resp.json()
    save_response("test5_expand_inline.json", data)

    if resp.status_code != 200:
        print(f"  ERROR: {pretty(data)}")
        return

    for c in data.get("expansion", {}).get("contains", []):
        print(f"\n  {c['code']} - {c.get('display')}")
        props = extract_r5_properties(c)
        if props:
            for code, val in props.items():
                print(f"    {code}: {val}")
        else:
            print(f"    (no supplement properties)")

        # Count designations
        desigs = c.get("designation", [])
        print(f"    Designations: {len(desigs)}")


if __name__ == "__main__":
    loaded = test_supplement_loaded()
    if not loaded:
        print("\nSupplement not found — cannot continue.")
        exit(1)

    test_expand_with_supplement_properties()
    test_expand_filter_supplement_designation()
    test_expand_with_boost()
    test_expand_inline_valueset()

    print("\n" + "=" * 70)
    print("  ALL TESTS COMPLETE")
    print("  Key: useSupplement on $expand works for both designations")
    print("  and properties (via R5 backport extensions on R4).")
    print("=" * 70)
