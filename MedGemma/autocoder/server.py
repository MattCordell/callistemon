"""AutoCoder demonstrator: serves the web page and wraps the MedGemma coding pipeline.

Run from the MedGemma folder:
    .\\.venv\\Scripts\\python -m uvicorn autocoder.server:app --port 8000
"""
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so medgemma_pipeline imports
import medgemma_pipeline as pipeline  # noqa: E402

STATIC_DIR = Path(__file__).with_name("static")

app = FastAPI(title="AutoCoder")


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


@app.get("/api/health")
def health():
    return {"ok": True, "icd_release": pipeline.ICD_RELEASE}


@app.post("/api/diagnose")
def diagnose(body: NotesIn):
    """Part 2: MedGemma proposes up to 3 diagnoses, each with a rationale."""
    if not body.notes.strip():
        raise HTTPException(400, "The clinical notes are empty.")
    try:
        diagnoses, reasoning = pipeline.propose_diagnoses_with_rationale(
            body.notes, temperature=min(max(body.temperature, 0.1), 0.9))
    except Exception as e:  # demonstrator: pass any failure back to the page
        raise HTTPException(502, f"MedGemma request failed: {e}")
    return {"diagnoses": diagnoses, "reasoning": reasoning}


@app.post("/api/code")
def code(body: CodeIn):
    """Part 3: code the endorsed diagnosis (the term only, not the notes) to SNOMED CT and ICD-11."""
    if not body.term.strip():
        raise HTTPException(400, "No diagnosis to code.")
    try:
        return pipeline.autocode(body.term)
    except Exception as e:  # demonstrator: pass any failure back to the page
        raise HTTPException(502, f"Coding failed: {e}")


# Mounted last so the /api routes above take precedence
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
