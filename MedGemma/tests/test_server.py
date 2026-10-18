"""Tests for the AutoCoder server: abuse limits, MedGemma states and the wake button.

Google auth and every MedGemma, Vertex and ICD-API call are mocked, so these need no
network and never wake the model. Run from the MedGemma folder:
    .\\.venv\\Scripts\\python -m pytest tests
"""
import os
import sys
from pathlib import Path
from unittest import mock

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("ICD_CLIENT_ID", "test")
os.environ.setdefault("ICD_CLIENT_SECRET", "test")
with mock.patch("google.auth.default", return_value=(mock.Mock(valid=True, token="t"), "p")):
    import medgemma_pipeline as pipeline  # noqa: E402
    from autocoder import server  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

PAGE = {"Origin": "https://mattcordell.github.io"}
NOTES = {"notes": "Fever and cough", "temperature": 0.3}


def http_error(status, url="https://x.prediction.vertexai.goog/v1/predict"):
    resp = requests.Response()
    resp.status_code = status
    resp.url = url
    return requests.HTTPError(f"{status} error", response=resp)


@pytest.fixture(autouse=True)
def fresh_state(monkeypatch):
    """Each test starts with no calls, no wake-ups and an empty status cache."""
    server._calls.clear()
    server._wakes.clear()
    monkeypatch.setattr(server, "_last_not_ready", 0.0)
    monkeypatch.setattr(server, "_wake_started", 0.0)
    monkeypatch.setattr(server, "_last_answer", 0.0)
    monkeypatch.setattr(server, "_last_sweep", 0.0)
    server._status_cache.update(at=0.0, body=None)
    monkeypatch.setattr(pipeline, "propose_diagnoses_with_rationale", lambda notes, temperature: ([], ""))


@pytest.fixture
def client():
    return TestClient(server.app)  # no "with": skips the startup ICD-API call


def asleep(monkeypatch):
    monkeypatch.setattr(pipeline, "medgemma_replicas", lambda: 0)


# ---------- Origin check and hourly limit ----------

def test_other_origin_is_refused(client):
    assert client.post("/api/diagnose", json=NOTES, headers={"Origin": "https://evil.example"}).status_code == 403


def test_hourly_limit(client):
    for _ in range(server.RATE_LIMIT_PER_HOUR):
        assert client.post("/api/diagnose", json=NOTES, headers=PAGE).status_code == 200
    assert client.post("/api/diagnose", json=NOTES, headers=PAGE).status_code == 429


def test_faked_forwarded_for_does_not_change_the_caller(client):
    for i in range(server.RATE_LIMIT_PER_HOUR):
        headers = {**PAGE, "X-Forwarded-For": f"10.0.0.{i}, 203.0.113.9"}  # Cloud Run appends the real address
        assert client.post("/api/diagnose", json=NOTES, headers=headers).status_code == 200
    headers = {**PAGE, "X-Forwarded-For": "10.9.9.9, 203.0.113.9"}
    assert client.post("/api/diagnose", json=NOTES, headers=headers).status_code == 429
    assert list(server._calls) == ["203.0.113.9"]


def test_call_is_recorded_before_it_runs(client, monkeypatch):
    seen = []
    monkeypatch.setattr(pipeline, "propose_diagnoses_with_rationale",
                        lambda notes, temperature: (seen.append(sum(map(len, server._calls.values()))), ([], ""))[1])
    client.post("/api/diagnose", json=NOTES, headers=PAGE)
    assert seen == [1]  # a parallel request would already see this call


def test_waking_replies_do_not_count(client, monkeypatch):
    def not_ready(notes, temperature):
        raise http_error(429)
    monkeypatch.setattr(pipeline, "propose_diagnoses_with_rationale", not_ready)
    for _ in range(server.RATE_LIMIT_PER_HOUR + 5):
        r = client.post("/api/diagnose", json=NOTES, headers=PAGE)
        assert r.status_code == 503 and r.json()["detail"]["warming"]
    assert sum(map(len, server._calls.values())) == 0


def test_sweep_forgets_idle_addresses():
    server._calls["old"].append(1.0)
    server._wakes["old"].append(1.0)
    server._calls["new"].append(200_000.0)
    server.sweep(200_000.0)  # more than a day after the old entries
    assert list(server._calls) == ["new"] and not server._wakes


# ---------- MedGemma states ----------

def test_model_unavailable_maps_endpoint_errors():
    warming = server.model_unavailable(http_error(429))
    assert warming.status_code == 503 and warming.detail["warming"]
    offline = server.model_unavailable(http_error(404))
    assert offline.status_code == 503 and "offline" in offline.detail
    assert server.model_unavailable(http_error(404, url="https://id.who.int/icd/x")) is None  # not MedGemma
    assert server.model_unavailable(ValueError("x")) is None


def test_status_states(client, monkeypatch):
    asleep(monkeypatch)
    assert client.get("/api/status").json() == {"state": "asleep"}
    server.mark_waking()
    body = client.get("/api/status").json()
    assert body["state"] == "waking" and body["waking_for"] == 0
    server.model_answered()  # replica count still 0, but it has answered
    assert client.get("/api/status").json() == {"state": "ready"}
    monkeypatch.setattr(pipeline, "medgemma_replicas", lambda: None)
    server._status_cache["at"] = 0.0
    assert client.get("/api/status").json() == {"state": "offline"}


def test_retries_do_not_restart_the_wake_countdown(monkeypatch):
    asleep(monkeypatch)
    server.mark_waking()
    server._wake_started -= 90
    server.mark_waking()
    assert server.status()["waking_for"] == 90


# ---------- Wake button ----------

def test_wake_starts_a_wake_up_and_counts_it(client, monkeypatch):
    asleep(monkeypatch)
    monkeypatch.setattr(pipeline, "ask_medgemma", mock.Mock(side_effect=http_error(429)))
    assert client.post("/api/wake", headers=PAGE).json()["state"] == "waking"
    assert sum(map(len, server._wakes.values())) == 1


def test_wake_when_already_up_is_not_counted(client, monkeypatch):
    asleep(monkeypatch)  # replica count lagging
    monkeypatch.setattr(pipeline, "ask_medgemma", mock.Mock(return_value=""))
    assert client.post("/api/wake", headers=PAGE).json()["state"] == "ready"
    assert not server._wakes


def test_wake_does_nothing_unless_asleep(client, monkeypatch):
    monkeypatch.setattr(pipeline, "medgemma_replicas", lambda: 1)
    ask = mock.Mock()
    monkeypatch.setattr(pipeline, "ask_medgemma", ask)
    for _ in range(server.RATE_LIMIT_PER_HOUR + 1):  # also: wake presses don't use up the hourly limit
        assert client.post("/api/wake", headers=PAGE).json()["state"] == "ready"
    ask.assert_not_called()
    assert not server._calls


def test_wake_limit_per_address(client, monkeypatch):
    asleep(monkeypatch)
    monkeypatch.setattr(pipeline, "ask_medgemma", mock.Mock(side_effect=http_error(429)))
    for _ in range(server.WAKES_PER_IP_PER_DAY):
        monkeypatch.setattr(server, "_last_not_ready", 0.0)  # pretend it fell asleep again
        server._status_cache["at"] = 0.0
        assert client.post("/api/wake", headers=PAGE).status_code == 200
    monkeypatch.setattr(server, "_last_not_ready", 0.0)
    assert client.post("/api/wake", headers=PAGE).status_code == 429


def test_wake_failure_is_a_502_not_a_500(client, monkeypatch):
    asleep(monkeypatch)
    monkeypatch.setattr(pipeline, "ask_medgemma", mock.Mock(side_effect=requests.ConnectionError("no host")))
    r = client.post("/api/wake", headers=PAGE)
    assert r.status_code == 502 and "no host" in r.json()["detail"]


# ---------- Pipeline ----------

def test_404_clears_the_cached_host(monkeypatch):
    monkeypatch.setattr(pipeline, "MEDGEMMA_URL", "https://old.prediction.vertexai.goog/predict")
    resp = requests.Response()
    resp.status_code = 404
    resp.url = pipeline.MEDGEMMA_URL
    monkeypatch.setattr(pipeline.requests, "post", mock.Mock(return_value=resp))
    with pytest.raises(requests.HTTPError):
        pipeline.ask_medgemma("Hi")
    assert pipeline.MEDGEMMA_URL is None


@pytest.mark.parametrize("uri", [
    "http://id.who.int/icd/release/11/2026-01/mms/142052508/unspecified & http://id.who.int/icd/release/11/2026-01/mms/339929010",
    "http://id.who.int/icd/release/11/2026-01/mms/142052508/unspecified / http://id.who.int/icd/release/11/2026-01/mms/339929010",
    "http://id.who.int/icd/release/11/2026-01/mms/142052508/unspecified",
])
def test_icd_lookup_uses_the_stem_of_a_combined_code(monkeypatch, uri):
    icd_get = mock.Mock(return_value={})
    monkeypatch.setattr(pipeline, "icd_get", icd_get)
    pipeline.lookup_icd_entity(uri)
    icd_get.assert_called_once_with("https://id.who.int/icd/release/11/2026-01/mms/142052508/unspecified")
