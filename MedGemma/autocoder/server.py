"""AutoCoder demonstrator: serves the web page and wraps the MedGemma coding pipeline.

Run from the MedGemma folder:
    .\\.venv\\Scripts\\python -m uvicorn autocoder.server:app --port 8000

Hosted: the page is on GitHub Pages and this server runs on Cloud Run (see DEPLOY.md).
"""
import sys
import time
from collections import defaultdict
from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so medgemma_pipeline imports
import medgemma_pipeline as pipeline  # noqa: E402

STATIC_DIR = Path(__file__).with_name("static")

# Pages allowed to call the API from a browser. Not a security boundary (non-browser
# clients can send any Origin); the rate limit below bounds what they can cost.
ALLOWED_ORIGINS = ["https://mattcordell.github.io", "http://localhost:8000", "http://127.0.0.1:8000"]
RATE_LIMIT_PER_HOUR = 30  # API calls per client IP; in memory, so Cloud Run runs at most 1 instance

app = FastAPI(title="AutoCoder")

_calls = defaultdict(list)  # client IP -> times of recent API calls


def client_ip(request):
    """Cloud Run puts the caller's address first in X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",")[0].strip() if forwarded else request.client.host


@app.middleware("http")
async def guard_api(request: Request, call_next):
    """Origin check and per-IP hourly limit on the API calls that reach MedGemma."""
    if request.method == "POST" and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        if origin and origin not in ALLOWED_ORIGINS:
            return JSONResponse({"detail": "This page is not allowed to use the AutoCoder API."}, 403)
        now = time.time()
        recent = [t for t in _calls[client_ip(request)] if now - t < 3600]
        if len(recent) >= RATE_LIMIT_PER_HOUR:
            return JSONResponse({"detail": "Too many requests from your address. Try again in an hour."}, 429)
        response = await call_next(request)
        if response.status_code != 503:  # "waking up" replies are retried by the page, so they don't count
            recent.append(now)
        _calls[client_ip(request)] = recent
        return response
    return await call_next(request)


@app.middleware("http")
async def no_stale_files(request, call_next):
    """Make the browser check for a newer page, script or config on every load (a demo that changes often)."""
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.on_event("startup")
def startup():
    pipeline.resolve_icd_release()


class NotesIn(BaseModel):
    notes: str
    temperature: float = 0.3


class CodeIn(BaseModel):
    term: str


WAKES_PER_IP_PER_DAY = 5  # "Wake up" button presses that start a wake-up; in memory, like the hourly limit
WAKES_PER_DAY = 20  # all callers together: a ceiling on GPU time from the button (each wake-up is >= 30 min)
_wakes = defaultdict(list)  # client IP -> times this caller started a wake-up
WAKING_FOR = 20 * 60  # seconds after a "not ready" reply during which a sleeping model counts as waking
STATUS_CACHE_FOR = 10  # seconds; many open pages share one endpoint lookup
_last_not_ready = 0.0  # when MedGemma last answered "not ready" (a wake-up is under way)
_status_cache = {"at": 0.0, "body": None}


def model_unavailable(e):
    """Turn MedGemma endpoint states into messages the page can act on, or None for other errors.

    The endpoint scales to zero when idle: while it starts up it answers 429, and the page retries.
    """
    global _last_not_ready
    if not isinstance(e, requests.HTTPError) or e.response is None or pipeline.MEDGEMMA_URL not in e.response.url:
        return None
    if e.response.status_code == 429:
        _last_not_ready = time.time()
        _status_cache["at"] = 0.0  # show "Waking" straight away
        return HTTPException(503, {"warming": True,
                                   "message": "MedGemma is waking up. This can take a few minutes."})
    if e.response.status_code == 404:
        return HTTPException(503, "MedGemma is offline at the moment. It runs during demo sessions only.")
    return None


@app.get("/api/health")
def health():
    return {"ok": True, "icd_release": pipeline.ICD_RELEASE}


@app.get("/api/status")
def status():
    """MedGemma state for the page's badge: ready, waking, asleep, offline or unknown. Does not wake it."""
    now = time.time()
    if now - _status_cache["at"] < STATUS_CACHE_FOR:
        return _status_cache["body"]
    try:
        replicas = pipeline.medgemma_replicas()
    except Exception as e:  # demonstrator: report the lookup failure rather than break the page
        print(f"[Warning: could not read MedGemma status: {e}]")
        replicas = "unknown"
    if replicas == "unknown":
        state = "unknown"
    elif replicas is None:
        state = "offline"
    elif replicas > 0:
        state = "ready"
    else:
        state = "waking" if now - _last_not_ready < WAKING_FOR else "asleep"
    _status_cache.update(at=now, body={"state": state})
    return _status_cache["body"]


@app.post("/api/wake")
def wake(request: Request):
    """Start MedGemma waking up, for the page's "Wake up" button. Only a real wake-up counts towards the limits."""
    global _last_not_ready
    _status_cache["at"] = 0.0
    if status()["state"] != "asleep":
        return status()  # already waking, ready or offline: nothing to do
    now = time.time()
    ip = client_ip(request)
    mine = [t for t in _wakes[ip] if now - t < 86400]
    everyone = [t for times in _wakes.values() for t in times if now - t < 86400]
    if len(mine) >= WAKES_PER_IP_PER_DAY:
        raise HTTPException(429, f"You can wake MedGemma {WAKES_PER_IP_PER_DAY} times a day. Try again tomorrow.")
    if len(everyone) >= WAKES_PER_DAY:
        raise HTTPException(429, "MedGemma has been woken too often today. Try again tomorrow.")
    try:
        pipeline.ask_medgemma("Hi", max_tokens=1, warn_if_cut=False)  # while asleep this is refused, which starts the wake-up
    except requests.HTTPError as e:
        if e.response is None or e.response.status_code != 429:
            raise HTTPException(502, f"Could not wake MedGemma: {e}")
    _wakes[ip] = mine + [now]
    _last_not_ready = now
    _status_cache["at"] = 0.0
    return status()


@app.post("/api/diagnose")
def diagnose(body: NotesIn):
    """Part 2: MedGemma proposes up to 3 diagnoses, each with a rationale."""
    if not body.notes.strip():
        raise HTTPException(400, "The clinical notes are empty.")
    try:
        diagnoses, reasoning = pipeline.propose_diagnoses_with_rationale(
            body.notes, temperature=min(max(body.temperature, 0.1), 0.9))
    except Exception as e:  # demonstrator: pass any failure back to the page
        raise model_unavailable(e) or HTTPException(502, f"MedGemma request failed: {e}")
    return {"diagnoses": diagnoses, "reasoning": reasoning}


@app.post("/api/code")
def code(body: CodeIn):
    """Part 3: code the endorsed diagnosis (the term only, not the notes) to SNOMED CT and ICD-11."""
    if not body.term.strip():
        raise HTTPException(400, "No diagnosis to code.")
    try:
        return pipeline.autocode(body.term)
    except Exception as e:  # demonstrator: pass any failure back to the page
        raise model_unavailable(e) or HTTPException(502, f"Coding failed: {e}")


# Added last so it is the outermost layer: guard_api's refusals still carry CORS headers the page can read
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Content-Type"])

# Mounted last so the /api routes above take precedence
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
