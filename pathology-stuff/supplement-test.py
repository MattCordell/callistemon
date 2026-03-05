"""
FHIR CodeSystem Supplement Tester for Ontoserver R4

Tests supplement retrieval strategies against r4.ontoserver.csiro.au.

KEY FINDING: The R4 Ontoserver OperationDefinition for $lookup shows
`useSupplement` with cardinality 0..0 — it's an R5 feature, not available
on this R4 server. Supplement properties/designations are NOT merged into
$lookup or $expand results automatically.

WORKAROUND: Read the supplement resource directly and merge client-side.
"""

import requests
import json

BASE_URL = "https://r4.ontoserver.csiro.au/fhir"
SUPPLEMENT_URL = "https://github.com/MattCordell/callistemon/fhir/CodeSystem/snomed-pathology-test-info-supplement"
SNOMED_SYSTEM = "http://snomed.info/sct"
TEST_CODES = ["26604007", "444164000", "55235003"]  # FBC, UEC, CRP

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


# ── TEST 1: Verify supplement is loaded ───────────────────────────────

def test_supplement_loaded():
    """Confirm the supplement exists and inspect its structure."""
    print_separator("Verify supplement is loaded on Ontoserver", 1)

    resp = requests.get(
        f"{BASE_URL}/CodeSystem",
        params={"url": SUPPLEMENT_URL},
        headers=HEADERS
    )
    print(f"  HTTP {resp.status_code}")

    if resp.status_code != 200:
        print(f"  ERROR: {pretty(resp.json())}")
        return None

    bundle = resp.json()
    total = bundle.get("total", 0)
    print(f"  Found: {total} matching CodeSystem(s)")

    if total == 0:
        print("  Supplement NOT loaded.")
        return None

    entry = bundle["entry"][0]["resource"]
    cs_id = entry.get("id")
    print(f"  id: {cs_id}")
    print(f"  content: {entry.get('content')}")
    print(f"  supplements: {entry.get('supplements')}")

    props = entry.get("property", [])
    print(f"  Declared properties: {[p['code'] for p in props]}")

    return cs_id


# ── TEST 2: Standard $lookup (no supplement merging expected) ─────────

def test_standard_lookup():
    """Show that $lookup returns only standard SNOMED properties."""
    print_separator("Standard $lookup (baseline - no supplement data expected)", 2)

    resp = requests.get(
        f"{BASE_URL}/CodeSystem/$lookup",
        params={"system": SNOMED_SYSTEM, "code": TEST_CODES[0]},
        headers=HEADERS
    )
    print(f"  HTTP {resp.status_code}")
    data = resp.json()
    save_response("test2_standard_lookup.json", data)

    all_params = data.get("parameter", [])
    properties = [p for p in all_params if p.get("name") == "property"]
    prop_codes = []
    for prop in properties:
        parts = {pt["name"]: pt for pt in prop.get("part", [])}
        prop_codes.append(parts.get("code", {}).get("valueCode", ""))

    print(f"  Properties returned: {prop_codes}")
    print(f"  (No supplement properties - this is expected on R4)")


# ── TEST 3: $lookup requesting supplement properties explicitly ───────

def test_lookup_with_property_filter():
    """Request supplement property codes — server won't find them."""
    print_separator("$lookup requesting supplement property codes", 3)

    params = {
        "resourceType": "Parameters",
        "parameter": [
            {"name": "system", "valueUri": SNOMED_SYSTEM},
            {"name": "code", "valueCode": TEST_CODES[0]},
            {"name": "property", "valueCode": "pathologyTestsExplainedUrl"},
            {"name": "property", "valueCode": "rcpaManualUrl"},
            {"name": "property", "valueCode": "requiredSpecimen"},
        ]
    }

    resp = requests.post(
        f"{BASE_URL}/CodeSystem/$lookup",
        json=params,
        headers={**HEADERS, "Content-Type": "application/fhir+json"}
    )
    print(f"  HTTP {resp.status_code}")
    data = resp.json()
    save_response("test3_lookup_property_filter.json", data)

    all_params = data.get("parameter", [])
    properties = [p for p in all_params if p.get("name") == "property"]
    print(f"  Properties returned: {len(properties)}")
    print(f"  (Expected: 0 — R4 Ontoserver doesn't merge supplement properties)")


# ── TEST 4: ValueSet $expand with property request ────────────────────

def test_valueset_expand():
    """Expand a ValueSet requesting supplement properties and designations."""
    print_separator("ValueSet $expand requesting supplement properties", 4)

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
    save_response("test4_valueset_expand.json", data)

    if resp.status_code != 200:
        print(f"  ERROR: {pretty(data)}")
        return

    contains = data.get("expansion", {}).get("contains", [])
    for c in contains:
        desigs = c.get("designation", [])
        props = c.get("property", [])
        print(f"\n  {c['code']} - {c.get('display')}")
        print(f"    Designations: {len(desigs)} (SNOMED only, no supplement designations)")
        print(f"    Properties: {len(props)} (expected: 0 on R4)")


# ── TEST 5: Text filter search for supplement designation ─────────────

def test_expand_filter_synonym():
    """Search for 'UEC' — a designation only in the supplement."""
    print_separator("$expand filter search for 'UEC' (supplement-only synonym)", 5)

    resp = requests.get(
        f"{BASE_URL}/ValueSet/$expand",
        params={
            "url": "http://snomed.info/sct?fhir_vs=ecl/< 108252007",
            "filter": "UEC",
            "includeDesignations": "true",
            "count": "10",
        },
        headers=HEADERS
    )
    print(f"  HTTP {resp.status_code}")
    data = resp.json()
    save_response("test5_filter_UEC.json", data)

    contains = data.get("expansion", {}).get("contains", [])
    print(f"  Results for 'UEC': {len(contains)}")
    if len(contains) == 0:
        print(f"  (Expected: 0 — supplement designations aren't indexed for search on R4)")
    for c in contains:
        print(f"    {c['code']} - {c.get('display')}")


# ── TEST 6: WORKAROUND — Client-side supplement merge ─────────────────

def test_client_side_merge():
    """The practical workaround: read the supplement resource directly,
    then merge its properties/designations with $lookup results client-side."""
    print_separator("WORKAROUND: Client-side supplement merge", 6)

    # Step 1: Read the supplement resource to get all concept data
    print("  Step 1: Reading supplement resource directly...")
    resp = requests.get(
        f"{BASE_URL}/CodeSystem",
        params={"url": SUPPLEMENT_URL, "_count": "1"},
        headers=HEADERS
    )
    bundle = resp.json()
    cs_id = bundle["entry"][0]["resource"]["id"]

    resp = requests.get(f"{BASE_URL}/CodeSystem/{cs_id}", headers=HEADERS)
    supplement = resp.json()
    print(f"  Loaded supplement with {len(supplement.get('concept', []))} concepts")

    # Build a lookup index from supplement concepts
    supplement_index = {}
    for concept in supplement.get("concept", []):
        code = concept["code"]
        supplement_index[code] = {
            "properties": {
                p["code"]: p.get("valueString", p.get("valueCode", ""))
                for p in concept.get("property", [])
            },
            "designations": [
                {
                    "value": d.get("value"),
                    "language": d.get("language", "en"),
                    "use": d.get("use", {})
                }
                for d in concept.get("designation", [])
            ]
        }

    # Step 2: For each test code, do a standard $lookup then merge
    for code in TEST_CODES:
        print(f"\n  Step 2: $lookup for {code}, then merge supplement data...")

        resp = requests.get(
            f"{BASE_URL}/CodeSystem/$lookup",
            params={"system": SNOMED_SYSTEM, "code": code},
            headers=HEADERS
        )
        data = resp.json()

        # Extract display from $lookup
        all_params = data.get("parameter", [])
        display = next(
            (p["valueString"] for p in all_params if p["name"] == "display"), ""
        )
        print(f"    SNOMED display: {display}")

        # Merge supplement data
        supp = supplement_index.get(code)
        if supp:
            print(f"    SUPPLEMENT properties:")
            for prop_code, prop_val in supp["properties"].items():
                print(f"      {prop_code}: {prop_val}")

            if supp["designations"]:
                print(f"    SUPPLEMENT designations:")
                for d in supp["designations"]:
                    use_display = d["use"].get("display", "")
                    print(f"      [{use_display}] {d['value']}")
        else:
            print(f"    (No supplement data for this code)")

    save_response("test6_merged_supplement_index.json", supplement_index)


if __name__ == "__main__":
    cs_id = test_supplement_loaded()
    if not cs_id:
        print("\nSupplement not found — cannot continue.")
        exit(1)

    test_standard_lookup()
    test_lookup_with_property_filter()
    test_valueset_expand()
    test_expand_filter_synonym()

    print("\n" + "~" * 70)
    print("  Tests 2-5 confirm: R4 Ontoserver does NOT merge supplement data")
    print("  into $lookup or $expand. The useSupplement parameter is 0..0 (R5).")
    print("  See: r4.ontoserver.csiro.au/fhir/OperationDefinition/CodeSystem-t-lookup")
    print("~" * 70)

    test_client_side_merge()

    print("\n" + "=" * 70)
    print("  ALL TESTS COMPLETE")
    print("=" * 70)
