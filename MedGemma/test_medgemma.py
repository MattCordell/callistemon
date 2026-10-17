"""Code clinical notes with MedGemma + Ontoserver (SNOMED CT) and the WHO ICD-API (ICD-11).

1. MedGemma proposes diagnoses as free text (no codes).
   The user then picks the preferred diagnosis from these options; only that one goes on to step 2.
2. Each diagnosis is searched in Ontoserver with ValueSet/$expand over an ECL value set.
3. MedGemma picks the best match from the real candidates (or none).
4. The same diagnosis is coded to ICD-11 (MMS) two ways, so the approaches can be compared:
   a. Autocode: the ICD-API picks the single best match itself.
   b. Search + MedGemma: ICD-API search returns candidates, then MedGemma picks one (or none).
   The chosen ICD-11 entity is then looked up for its title and definition.

MedGemma credentials are picked up from 'gcloud auth application-default login'.
ICD-API credentials are read from MedGemma/.env (see .env.example).
"""
import json
from pathlib import Path

from medgemma_pipeline import (
    choose_candidate, code_to_icd11, find_candidates, propose_diagnoses,
    resolve_icd_release, reword_term, search_ontoserver,
)

clinical_notes = """
Patient Demographics: 28-year-old male.
Reason for Presentation: mild anxiety and agitation.
Clinical History: History of Cocaine misuse.
Current Medicines: Ibuprofen (Herron Blue) (ibuprofen 200 mg) tablet
Physical Exam: tachycardia, hypertension. urine Toxicology results negative.
"""


def select_diagnosis(diagnoses):
    """Step 1b: show the proposed diagnoses as numbered options and let the user pick one.

    Asks again until the input is a valid option number. Returns the selected diagnosis.
    """
    print("Proposed diagnoses (most likely first):")
    for i, d in enumerate(diagnoses, 1):
        print(f"  {i}. {d}")
    while True:
        reply = input(f"Select your preferred diagnosis [1-{len(diagnoses)}]: ").strip()
        if reply.isdigit() and 1 <= int(reply) <= len(diagnoses):
            return diagnoses[int(reply) - 1]
        print(f"Please enter a single number from 1 to {len(diagnoses)}.")


resolve_icd_release()
print("Step 1: asking MedGemma for provisional diagnoses...")
diagnoses = [select_diagnosis(propose_diagnoses(clinical_notes))]

results = []
for term in diagnoses:
    print(f"Step 2/3: coding '{term}' to SNOMED CT...")
    search_terms = [term] + reword_term(term)
    candidates = find_candidates(search_terms, search_ontoserver)
    # Choose against the original term, so a reworded search can't shift the meaning
    chosen, raw_reply = choose_candidate(clinical_notes, term, candidates) if candidates else (None, None)
    print(f"Step 4: coding '{term}' to ICD-11...")
    results.append({
        "proposed_diagnosis": term,
        "search_terms": search_terms,
        "chosen": chosen,
        "medgemma_reply": raw_reply,
        "candidates": candidates,
        "icd11": code_to_icd11(clinical_notes, term, search_terms),
    })


def print_icd_details(details):
    print(f"        Title:      {details['title']}")
    definition = details["definition"]
    if definition:
        print(f"        Definition: {definition[:200]}{'...' if len(definition) > 200 else ''}")
    print(f"        Browser:    {details['browser_url']}")


print("\n--- Results ---")
for r in results:
    print(f"\nProposed by MedGemma: {r['proposed_diagnosis']}")
    search_labels = {t: f"S{i}" for i, t in enumerate(r["search_terms"], 1)}
    for t, label in search_labels.items():
        print(f"  Search {label}:          {t}")

    print("  SNOMED CT (Ontoserver search + MedGemma):")
    if r["chosen"]:
        print(f"    Chosen coding:    {r['chosen']['code']} | {r['chosen']['display']}")
    elif not r["candidates"]:
        print("    Chosen coding:    none (Ontoserver returned no candidates)")
    else:
        print(f"    Chosen coding:    none (MedGemma reply: {r['medgemma_reply']!r})")
    for i, c in enumerate(r["candidates"], 1):
        marker = "*" if c == r["chosen"] else " "
        found_by = ",".join(search_labels[t] for t in c["found_by"])
        print(f"      {marker} {i:>2}. {c['code']} | {c['display']}  [{found_by}]")

    icd = r["icd11"]
    print(f"  ICD-11 A, autocode (search text: {r['proposed_diagnosis']!r}):")
    auto = icd["autocode"]
    if auto:
        print(f"    Chosen coding:    {auto['code']} | {auto['display']}"
              f"  (match level {auto['match_level']}, score {auto['match_score']})")
        print_icd_details(auto["details"])
    else:
        print("    Chosen coding:    none (autocode found no match)")

    print("  ICD-11 B, ICD-API search + MedGemma:")
    if icd["search_chosen"]:
        print(f"    Chosen coding:    {icd['search_chosen']['code']} | {icd['search_chosen']['display']}")
        print_icd_details(icd["search_chosen"]["details"])
    elif not icd["search_candidates"]:
        print("    Chosen coding:    none (ICD-API returned no candidates)")
    else:
        print(f"    Chosen coding:    none (MedGemma reply: {icd['search_medgemma_reply']!r})")
    for i, c in enumerate(icd["search_candidates"], 1):
        marker = "*" if c == icd["search_chosen"] else " "
        found_by = ",".join(search_labels[t] for t in c["found_by"])
        print(f"      {marker} {i:>2}. {c['code']} | {c['display']}  [{found_by}]")

results_path = Path(__file__).with_name("medgemma_results.json")
with open(results_path, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)
print(f"\nFull results saved to {results_path}")
