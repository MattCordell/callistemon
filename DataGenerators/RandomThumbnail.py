# Pollinations-only Thumbnail Generator
# https://www.desktophut.com/page/free-ai-image-generator

# Uses **only** Pollinations image API to generate a novel image per prompt,
# then returns a FHIR Attachment (PNG). No other fallbacks.
#
# Endpoint pattern:
#   https://image.pollinations.ai/prompt/<URL_ENCODED_PROMPT>?width=...&height=...&seed=...&model=...&token=...&nologo=true
#
# Quick setup:
#   pip install pillow requests
#   # (optional) set a token if you have one
#   export POLLINATIONS_TOKEN="YOUR_TOKEN"
#   # (optional) model/seed env overrides
#   export POLLINATIONS_MODEL="flux"
#   export POLLINATIONS_SEED="42"
#
# Public API:
#   make_thumbnail_attachment(prompt: str, size: int = 128) -> dict (FHIR Attachment)

import base64, hashlib, io, os, json
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

import requests
from PIL import Image

POLLINATIONS_BASE = "https://image.pollinations.ai/prompt"
DEFAULT_SIZE = 128
DEFAULT_MODEL = os.environ.get("POLLINATIONS_MODEL", "flux")
DEFAULT_TOKEN = os.environ.get("POLLINATIONS_TOKEN", "")
DEFAULT_SEED = os.environ.get("POLLINATIONS_SEED", "")  # empty => let service choose

# ---------------- Utilities ---------------- #

def _center_crop_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    if w == h:
        return img
    s = min(w, h)
    left = (w - s) // 2
    top = (h - s) // 2
    return img.crop((left, top, left + s, top + s))

# ---------------- Pollinations backend (only) ---------------- #

def _pollinations_txt2img(prompt: str, gen_size: int, *, model: Optional[str] = None, seed: Optional[str] = None, token: Optional[str] = None, nologo: bool = True) -> Image.Image:
    model = (model or DEFAULT_MODEL).strip()
    token = (token if token is not None else DEFAULT_TOKEN).strip()
    seed = (seed if seed is not None else DEFAULT_SEED).strip()

    gen_size = int(max(64, min(1024, gen_size)))
    enc_prompt = quote(prompt, safe="")

    params = {
        "width": str(gen_size),
        "height": str(gen_size),
        "model": model,
        "nologo": "true" if nologo else "false",
    }
    if seed:
        params["seed"] = seed
    if token:
        params["token"] = token

    # Build query string
    q = "&".join(f"{k}={quote(v, safe='')}" for k, v in params.items())
    url = f"{POLLINATIONS_BASE}/{enc_prompt}?{q}"

    r = requests.get(url, timeout=120)
    r.raise_for_status()
    img = Image.open(io.BytesIO(r.content)).convert("RGB")
    img = _center_crop_square(img).resize((gen_size, gen_size), Image.LANCZOS)
    return img

# ---------------- Public API ---------------- #

def _slug(text: str, max_len: int = 40) -> str:
    s = ''.join(ch if ch.isalnum() or ch in ('-', '_', ' ') else '-' for ch in text.lower()).strip().replace(' ', '-')
    return (s[:max_len] or "thumbnail").strip('-')

def make_thumbnail_attachment(prompt: str, size: int = DEFAULT_SIZE) -> dict:
    """
    Generate a PNG thumbnail using Pollinations and return a FHIR R4 Attachment:
      contentType, data (base64), size, hash (sha1 base64), title, creation
    """
    img = _pollinations_txt2img(prompt, size)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    raw = buf.getvalue()

    sha1 = hashlib.sha1(raw).digest()
    return {
        "contentType": "image/png",
        "data": base64.b64encode(raw).decode("ascii"),
        "size": len(raw),
        "hash": base64.b64encode(sha1).decode("ascii"),
        "title": f"thumb-{_slug(prompt)}.png",
        "creation": datetime.now(timezone.utc).isoformat(),
    }

# ---------------- Example ---------------- #
if __name__ == "__main__":
    example_prompt = "16 bit pixel art - Humble Magpie face"
    att = make_thumbnail_attachment(example_prompt, size=128)
    patient = {
        "resourceType": "Patient",
        "name": [{"use": "official", "family": "Example", "given": ["Magpie"]}],
        "photo": [att],
    }
    print(json.dumps(patient)[:260] + "…")
