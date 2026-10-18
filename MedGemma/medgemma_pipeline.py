"""MedGemma coding pipeline: shared by test_medgemma.py (command line) and the AutoCoder web app.

See test_medgemma.py for an overview of the steps.
"""
import html
import json
import os
import re
import time
from pathlib import Path

import google.auth
import requests
from dotenv import load_dotenv
from google.auth.transport.requests import Request

# --- MedGemma (dedicated Vertex AI endpoint) ---
ENDPOINT_ID = "mg-endpoint-0c12b6ca-97e1-40e9-86c1-9ea493e41b64"
REGION = "us-central1"
PROJECT_NUMBER = "6515564380"  # project that owns the endpoint (used in the URL path)
# Endpoint details (not a prediction): the prediction host name and whether the model is running
ENDPOINT_INFO_URL = (
    f"https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT_NUMBER}"
    f"/locations/{REGION}/endpoints/{ENDPOINT_ID}"
)
MEDGEMMA_URL = None  # set by medgemma_url() from the endpoint's dedicatedEndpointDns, which changes on redeploy

# --- Ontoserver ---
ONTOSERVER_BASE = "https://r4.ontoserver.csiro.au/fhir"
VALUE_SET_URL = "http://snomed.info/sct?fhir_vs=ecl/^32570581000036105"
CANDIDATE_COUNT = 5  # results kept from each search
MAX_REWORDINGS = 2  # searched alongside the original term, so up to 3 searches per diagnosis

# --- WHO ICD-API (ICD-11 MMS) ---
load_dotenv(Path(__file__).with_name(".env"))
ICD_CLIENT_ID = os.environ.get("ICD_CLIENT_ID")
ICD_CLIENT_SECRET = os.environ.get("ICD_CLIENT_SECRET")
if not (ICD_CLIENT_ID and ICD_CLIENT_SECRET):
    raise SystemExit("Set ICD_CLIENT_ID and ICD_CLIENT_SECRET in MedGemma/.env (see .env.example)")
ICD_TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token"
ICD_BASE = "https://id.who.int"
ICD_RELEASE = os.environ.get("ICD_RELEASE")  # pin an MMS release in .env; otherwise the latest is used
ICD_FALLBACK_RELEASE = "2025-01"  # used if the latest release can't be read from the API
ICD_MMS_URL = None  # set by resolve_icd_release() before any ICD-API search

credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])


def ask_medgemma(prompt, max_tokens=1024, answer_prefix="", warn_if_cut=True, temperature=0.2):
    """Send one prompt to MedGemma and return the answer text.

    answer_prefix pre-fills the start of the answer; the returned text is what follows it.

    temperature sets how much the model's word choice varies (usual range 0 to 2).
    Lower is more repeatable, higher is more varied. It does not make the model more
    factual or add reasoning. Rough guide:
      0.0       always the single most likely word; same input gives the same output.
                Use for picking a number or label (choose_candidate).
      0.1-0.3   mostly repeatable with small wording changes. Use for extraction or
                reformatting where the content must not drift.
      0.4-0.7   noticeably varied. Use for brainstorming alternatives, such as synonyms
                (reword_term) or a differential that should go past the obvious answer.
      1.0       the model's own distribution (Google's suggested setting for Gemma models).
      above 1.2 erratic and often wrong; avoid.
    """
    payload = {
        "instances": [{
            "@requestFormat": "chatCompletions",
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": prompt}]},
                # Pre-fill an empty reasoning block (<unused94>thought ... <unused95>) so the model
                # answers directly; left alone, it often loops in its reasoning until max_tokens
                {"role": "assistant", "content": [{"type": "text", "text": "<unused94>thought\n<unused95>" + answer_prefix}]},
            ],
            "continue_final_message": True,
            "add_generation_prompt": False,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }]
    }
    global MEDGEMMA_URL
    url = medgemma_url()
    try:
        resp = requests.post(url, headers={"Authorization": f"Bearer {auth_token()}"}, json=payload, timeout=300)
    except requests.ConnectionError:
        MEDGEMMA_URL = None  # the endpoint may have been redeployed under a new host name: look it up next time
        raise
    if resp.status_code == 404:
        MEDGEMMA_URL = None  # undeployed, or redeployed under a new host while the old one still resolves
    resp.raise_for_status()
    choice = resp.json()["predictions"]["choices"][0]
    if warn_if_cut and choice.get("finish_reason") == "length":
        print("[Warning: MedGemma response was cut off at max_tokens]")
    content = choice["message"]["content"]
    if "<unused95>" in content:
        content = content.split("<unused95>", 1)[1]
    return content.strip()


def auth_token():
    """Google access token for Vertex AI (refreshed when it expires)."""
    if not credentials.valid:
        credentials.refresh(Request())
    return credentials.token


def endpoint_info():
    """The endpoint's details from Vertex AI. Reading them does not wake the model."""
    resp = requests.get(ENDPOINT_INFO_URL, headers={"Authorization": f"Bearer {auth_token()}"}, timeout=15)
    resp.raise_for_status()
    return resp.json()


def medgemma_url():
    """MedGemma's prediction URL. The host name comes from the endpoint, since a redeploy can change it."""
    global MEDGEMMA_URL
    if not MEDGEMMA_URL:
        dns = endpoint_info()["dedicatedEndpointDns"]
        MEDGEMMA_URL = f"https://{dns}/v1/projects/{PROJECT_NUMBER}/locations/{REGION}/endpoints/{ENDPOINT_ID}:predict"
    return MEDGEMMA_URL


def medgemma_replicas():
    """Number of MedGemma replicas running (0 when scaled to zero), or None if no model is deployed.

    Reads the endpoint's details, so it does not wake the model.
    """
    models = endpoint_info().get("deployedModels", [])
    if not models:
        return None
    return models[0].get("status", {}).get("availableReplicaCount", 0)


def parse_terms(text):
    """Read the quoted strings from a JSON array reply, dropping duplicates.

    The model can repeat its list until max_tokens, so this tolerates a cut-off array
    rather than requiring valid JSON. Returns an empty list if no strings are found.
    """
    terms = []
    for term in re.findall(r'"([^"\n]+)"', text):
        if term.lower() not in (t.lower() for t in terms):
            terms.append(term)
    return terms


DIAGNOSES_MARKER = "DIAGNOSES:"
MAX_DIAGNOSES = 3


def propose_diagnoses(notes):
    """Step 1: MedGemma reasons over the notes, then proposes a ranked differential as plain text.

    The reasoning is written in the visible answer (the hidden thought block is still pre-filled
    empty, see ask_medgemma). Only the JSON array after DIAGNOSES_MARKER is used as the diagnoses.
    """
    prompt = f"""You are an expert clinician. Read these clinical notes:

{notes}

First, reason briefly: list the key findings, the pattern they form together, and what could
explain that pattern. Do not simply restate the chief complaint.

Then give the {MAX_DIAGNOSES} most likely diagnoses, ranked from most to least likely. Each must be
an underlying cause or condition that explains the findings, not a symptom.
Use short, standard clinical terms (for example "Type 2 diabetes mellitus").
Each item must be different. Do not include any codes.

End your reply with one line that starts with "{DIAGNOSES_MARKER}" followed by a JSON array of
strings, for example: {DIAGNOSES_MARKER} ["term one", "term two", "term three"]"""
    reply = ask_medgemma(prompt, max_tokens=1000, temperature=0.5)  # varied enough to look past the obvious
    reasoning, marker, answer = reply.rpartition(DIAGNOSES_MARKER)
    terms = parse_terms(answer)[:MAX_DIAGNOSES] if marker else []
    if not terms:
        raise ValueError(f"No diagnoses found in MedGemma reply:\n{reply}")
    print(f"\nMedGemma reasoning:\n{reasoning.strip()}\n")
    return terms


def propose_diagnoses_with_rationale(notes, temperature=0.3):
    """Step 1 for the AutoCoder web app: as propose_diagnoses, but each diagnosis has a short rationale.

    temperature is set by the slider in Part 2 (0.1 focused to 0.9 varied).
    Returns a list of {"term", "rationale"}, plus MedGemma's overall reasoning text.
    """
    prompt = f"""You are an expert clinician. Read this clinical record:

{notes}

First, reason briefly: list the key findings, the pattern they form together, and what could
explain that pattern. Do not simply restate the chief complaint.

Then give the {MAX_DIAGNOSES} most likely diagnoses, ranked from most to least likely. Each must be
an underlying cause or condition that explains the findings, not a symptom.
Use short, standard clinical terms (for example "Type 2 diabetes mellitus").
Each item must be different. Do not include any codes.
Each item must name exactly one condition. Do not hedge by combining alternatives in one item,
for example do not write "Cocaine intoxication/withdrawal" or "Cocaine intoxication or withdrawal".
If both are likely, list them as separate items, such as "Cocaine intoxication" and "Cocaine withdrawal".
For each diagnosis, give a rationale of 1 or 2 short sentences: which findings support it
and anything that argues against it. Do not use double quotes inside the rationale.

End your reply with one line that starts with "{DIAGNOSES_MARKER}" followed by a JSON array of
objects, for example:
{DIAGNOSES_MARKER} [{{"diagnosis": "term one", "rationale": "why"}}, {{"diagnosis": "term two", "rationale": "why"}}]"""
    reply = ask_medgemma(prompt, max_tokens=1400, temperature=temperature)
    reasoning, marker, answer = reply.rpartition(DIAGNOSES_MARKER)
    diagnoses = []
    if marker:
        # Tolerant parse: the array may be cut off, so read each diagnosis/rationale pair directly
        pairs = re.findall(
            r'"diagnosis"\s*:\s*"([^"\n]+)"\s*(?:,\s*"rationale"\s*:\s*"((?:[^"\\\n]|\\.)*)")?', answer
        )
        for term, rationale in pairs:
            if term.lower() not in (d["term"].lower() for d in diagnoses):
                diagnoses.append({"term": term.strip(), "rationale": rationale.replace('\\"', '"').strip()})
    if not diagnoses:
        raise ValueError(f"No diagnoses found in MedGemma reply:\n{reply}")
    return diagnoses[:MAX_DIAGNOSES], reasoning.strip()


def reword_term(term):
    """Ask MedGemma for alternative wordings of a diagnosis that keep the same meaning."""
    prompt = f"""You are an expert clinical terminologist.

Diagnosis: "{term}"

Give up to {MAX_REWORDINGS} alternative ways to write this exact diagnosis, as a terminology
search might phrase it. Use synonyms, standard clinical names, or expanded abbreviations.
Every alternative must mean exactly the same thing: do not make it broader, narrower,
or add or remove any detail (such as cause, body site, severity, or type).
Each alternative must be different from the diagnosis and from each other.
Output only a JSON array of strings."""
    rewordings = parse_terms(ask_medgemma(prompt, max_tokens=150, temperature=0.4))
    return [t for t in rewordings if t.lower() != term.lower()][:MAX_REWORDINGS]


def find_candidates(search_terms, search):
    """Step 2: run every search term through a search function and combine the results.

    Each candidate appears once (deduplicated by code), with the search terms that found it.
    """
    candidates = {}
    for search_term in search_terms:
        print(f"    searching '{search_term}'...")
        for c in search(search_term):
            candidates.setdefault(c["code"], {**c, "found_by": []})["found_by"].append(search_term)
    return list(candidates.values())


def search_ontoserver(term):
    """Step 2: search the ECL value set for concepts matching the term."""
    resp = requests.get(
        f"{ONTOSERVER_BASE}/ValueSet/$expand",
        params={"url": VALUE_SET_URL, "filter": term, "count": CANDIDATE_COUNT},
        headers={"Accept": "application/fhir+json"},
        timeout=60,
    )
    resp.raise_for_status()
    contains = resp.json().get("expansion", {}).get("contains", [])
    return [{"code": c["code"], "display": c["display"]} for c in contains]


_icd_token = {"value": None, "expires_at": 0.0}


def icd_get(url, params=None):
    """GET from the ICD-API with an OAuth2 client-credentials token (cached until it expires)."""
    if time.time() >= _icd_token["expires_at"]:
        resp = requests.post(
            ICD_TOKEN_URL,
            data={
                "client_id": ICD_CLIENT_ID,
                "client_secret": ICD_CLIENT_SECRET,
                "scope": "icdapi_access",
                "grant_type": "client_credentials",
            },
            timeout=60,
        )
        resp.raise_for_status()
        body = resp.json()
        _icd_token["value"] = body["access_token"]
        _icd_token["expires_at"] = time.time() + body.get("expires_in", 3600) - 60
    resp = requests.get(
        url,
        params=params,
        headers={
            "Authorization": f"Bearer {_icd_token['value']}",
            "Accept": "application/json",
            "API-Version": "v2",
            "Accept-Language": "en",
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def resolve_icd_release():
    """Choose the ICD-11 MMS release: ICD_RELEASE if set, else the API's latest, else the fallback."""
    global ICD_MMS_URL, ICD_RELEASE
    if not ICD_RELEASE:
        try:
            latest = icd_get(f"{ICD_BASE}/icd/release/11/mms").get("latestRelease", "")
            match = re.search(r"/release/11/([^/]+)/mms", latest)
            ICD_RELEASE = match.group(1) if match else None
        except requests.RequestException as e:
            print(f"[Warning: could not read the latest ICD-11 release: {e}]")
        if not ICD_RELEASE:
            print(f"[Warning: using fallback ICD-11 release {ICD_FALLBACK_RELEASE}]")
            ICD_RELEASE = ICD_FALLBACK_RELEASE
    ICD_MMS_URL = f"{ICD_BASE}/icd/release/11/{ICD_RELEASE}/mms"
    print(f"ICD-11 MMS release: {ICD_RELEASE}")


def strip_markup(text):
    """Remove any HTML highlighting tags from an ICD-API title."""
    return html.unescape(re.sub(r"<[^>]+>", "", text or "")).strip()


def autocode_icd(term):
    """ICD-11 approach A: the ICD-API picks the single best MMS match for the text itself.

    Returns the match (code, title, match quality, entity URI), or None if nothing matched.
    """
    data = icd_get(f"{ICD_MMS_URL}/autocode", {"searchText": term})
    if not data.get("theCode"):
        return None
    return {
        "code": data["theCode"],
        "display": strip_markup(data.get("matchingText")),
        "uri": data.get("linearizationURI"),
        "match_level": data.get("matchLevel"),
        "match_score": data.get("matchScore"),
    }


def search_icd(term):
    """ICD-11 approach B, step 1: search the MMS linearization for candidate entities.

    Entities without a code (such as blocks) are dropped, since they cannot be coded to.
    """
    data = icd_get(
        f"{ICD_MMS_URL}/search",
        {"q": term, "useFlexisearch": "true", "flatResults": "true", "highlightingEnabled": "false"},
    )
    candidates = [
        {"code": e["theCode"], "display": strip_markup(e.get("title")), "uri": e.get("id")}
        for e in data.get("destinationEntities", [])
        if e.get("theCode")
    ]
    return candidates[:CANDIDATE_COUNT]


def lookup_icd_entity(uri):
    """Get the details of an ICD-11 MMS entity from its URI.

    A hit for a combined code (main entity plus extension) has an id like '<stem uri> / <extension uri>'
    or '<stem uri> & <extension uri>'. Only the stem is a URI that can be fetched, so use that.
    """
    stem_uri = re.split(r"\s+[/&]\s+", uri)[0].strip()
    data = icd_get(stem_uri.replace("http://", "https://", 1))
    return {
        "code": data.get("code"),
        "title": strip_markup(data.get("title", {}).get("@value")),
        "definition": strip_markup(data.get("definition", {}).get("@value")),
        "browser_url": data.get("browserUrl"),
    }


def choose_candidate(notes, term, candidates):
    """Step 3: MedGemma picks the best candidate for the term, or none.

    With notes=None the choice is made on the term alone (AutoCoder web app), so findings
    in the notes cannot pull the choice towards a related condition.
    """
    options = "\n".join(f"{i}. {c['display']}" for i, c in enumerate(candidates, 1))
    if notes:
        prompt = f"""You are an expert clinical coder. Clinical notes:

{notes}

Proposed diagnosis: "{term}"

Which option below best represents this diagnosis for this patient?
{options}

Reply with only the option number. Reply 0 if none of the options fit."""
    else:
        prompt = f"""You are an expert clinical coder.

Diagnosis: "{term}"

Which option below best captures the meaning of this diagnosis? Do not choose a related but different condition.
{options}

Reply with only the option number. Reply 0 if none of the options fit."""
    # Pre-fill "Option " so the model writes the number straight away instead of explaining
    reply = ask_medgemma(prompt, max_tokens=4, answer_prefix="Option ", warn_if_cut=False, temperature=0.0)
    match = re.match(r"\s*(\d+)", reply)
    index = int(match.group(1)) if match else 0
    if 1 <= index <= len(candidates):
        return candidates[index - 1], reply
    return None, reply


def code_to_icd11(notes, term, search_terms):
    """Step 4: code a diagnosis to ICD-11 with both approaches, so they can be compared."""
    autocoded = autocode_icd(term)
    if autocoded:
        autocoded["details"] = lookup_icd_entity(autocoded["uri"])

    candidates = find_candidates(search_terms, search_icd)
    chosen, raw_reply = choose_candidate(notes, term, candidates) if candidates else (None, None)
    if chosen:
        chosen["details"] = lookup_icd_entity(chosen["uri"])
    return {
        "autocode": autocoded,
        "search_chosen": chosen,
        "search_medgemma_reply": raw_reply,
        "search_candidates": candidates,
    }




def autocode(term):
    """Code one endorsed diagnosis to SNOMED CT and ICD-11 (as the test script's run loop does).

    Only the term is used: the clinical notes are not passed on, so MedGemma picks the code that
    means the same as the endorsed diagnosis, not a related condition mentioned in the notes.
    ICD-11 approach B (search + MedGemma) is marked best when it found a code; otherwise A (autocode).
    """
    search_terms = [term] + reword_term(term)
    candidates = find_candidates(search_terms, search_ontoserver)
    # Choose against the original term, so a reworded search can't shift the meaning
    chosen, _ = choose_candidate(None, term, candidates) if candidates else (None, None)
    icd = code_to_icd11(None, term, search_terms)
    icd_a, icd_b = icd["autocode"], icd["search_chosen"]
    return {
        "term": term,
        "search_terms": search_terms,
        "snomed": {"code": chosen["code"], "display": chosen["display"]} if chosen else None,
        "snomed_candidates": len(candidates),
        "icd_release": ICD_RELEASE,
        "icd_a": icd_a,
        "icd_b": icd_b,
        "icd_b_candidates": len(icd["search_candidates"]),
        "icd_best": "B" if icd_b else ("A" if icd_a else None),
        "icd_agree": bool(icd_a and icd_b and icd_a["code"] == icd_b["code"]),
    }
