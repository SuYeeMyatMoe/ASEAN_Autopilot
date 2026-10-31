import os

os.environ["GEMINI_API_KEY"] = ""
os.environ["DATABASE_URL"] = ""

import pytest
from fastapi.testclient import TestClient

from app import catalog
from app.engine.dependency import CycleError, layers, roadmap
from app.llm.gemma import Gemma, extract_json
from app.schemas import FounderDNA, PassportItemLLM, PassportLLM
from app.services import enforce_grounding


def test_seed_records_are_sourced():
    ids = set()
    for r in catalog.regulatory():
        assert r["id"] not in ids
        ids.add(r["id"])
        assert r["source_url"].startswith("https://"), r["id"]
        assert r["authority"], r["id"]
        assert r["area"] in catalog.AREAS, r["id"]
        assert r["verification_status"]
        for dep in r["depends_on"]:
            assert dep in {x["id"] for x in catalog.regulatory()}, f"{r['id']} -> {dep}"


def test_extract_json_handles_fences_and_prose():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Here you go: {"a": [1, 2]} hope it helps') == {"a": [1, 2]}
    with pytest.raises(ValueError):
        extract_json("no json here")


class FakeGemma(Gemma):
    def __init__(self, replies):
        super().__init__()
        self.replies = list(replies)
        self._model = "gemma-4-test"

    @property
    def live(self):
        return True

    def generate(self, prompt, images=None, temperature=0.2, fast=False, json_mode=False, deadline=None):
        self.last_model = self._model
        return self.replies.pop(0)


def test_json_repair_path():
    g = FakeGemma(['{"company_name": 5, "sector": "space"}', '{"company_name": "Nadi", "sector": "healthcare"}'])
    dna, meta = g.generate_json("x", FounderDNA, fallback=lambda: FounderDNA())
    assert dna.company_name == "Nadi"
    assert meta.source == "gemma" and "repaired" in meta.notes[0]


def test_skips_repair_when_budget_is_spent():
    import time

    g = FakeGemma(['{"company_name": 5}', '{"company_name": "Nadi"}'])
    # Request started long ago: no time left for a repair call, so return the rule-based result.
    dna, meta = g.generate_json("x", FounderDNA, fallback=lambda: FounderDNA(company_name="fallback"), started=time.monotonic() - 600)
    assert dna.company_name == "fallback" and meta.source == "fallback"


def test_mixture_of_experts_model_is_preferred():
    from app.llm.gemma import _model_rank

    models = ["gemma-4-31b-it", "gemma-4-e4b-it", "gemma-4-26b-a4b-it"]
    assert sorted(models, key=_model_rank, reverse=True)[0] == "gemma-4-26b-a4b-it"


def test_falls_back_when_repair_fails():
    g = FakeGemma(["nonsense", "still nonsense"])
    dna, meta = g.generate_json("x", FounderDNA, fallback=lambda: FounderDNA(company_name="fallback"))
    assert dna.company_name == "fallback" and meta.source == "fallback"


def test_grounding_drops_unknown_and_restores_skipped():
    retrieved = [r for r in catalog.regulatory() if r["id"] in ("ID-A-01", "ID-H-01")]
    llm = PassportLLM(
        summary="s",
        items=[
            PassportItemLLM(record_id="ID-A-01", why_it_applies="w", status="action_required", next_action="n"),
            PassportItemLLM(record_id="MADE-UP-99", why_it_applies="w", status="action_required", next_action="n"),
        ],
    )
    out, notes = enforce_grounding(llm, retrieved)
    ids = {i.record_id for i in out.items}
    assert ids == {"ID-A-01", "ID-H-01"}
    assert any("MADE-UP-99" in n for n in notes)
    assert next(i for i in out.items if i.record_id == "ID-H-01").status == "source_verification_pending"


def test_dependency_layers_respect_edges():
    recs = [r for r in catalog.regulatory() if r["country"] == "ID"]
    order = {r["id"]: i for i, layer in enumerate(layers(recs)) for r in layer}
    for r in recs:
        for dep in r["depends_on"]:
            assert order[dep] < order[r["id"]]
    stages = roadmap(recs)
    assert stages[0]["label"] == "Start here"
    assert any(s["parallel"] for s in stages)


def test_dependency_cycle_detected():
    recs = [
        {"id": "a", "category": "x", "depends_on": ["b"], "title": "", "area": "A", "authority": ""},
        {"id": "b", "category": "x", "depends_on": ["a"], "title": "", "area": "A", "authority": ""},
    ]
    with pytest.raises(CycleError):
        layers(recs)


def test_demo_journey_end_to_end():
    from app.main import app

    with TestClient(app) as c:
        f = c.post("/api/founder/sample").json()
        assert f["dna"]["sector"] == "healthcare"
        m = c.post("/api/mission", json={"founder_id": f["founder_id"], "target": "ID", "objective": "Run a hospital AI pilot in Jakarta"}).json()
        p = c.post(f"/api/passport/{m['id']}").json()
        assert p["items"] and all(i["source_url"] for i in p["items"])
        health = next(i for i in p["items"] if i["record_id"] == "ID-C-01")
        assert health["status"] == "professional_review_required"
        assert c.post("/api/mission", json={"founder_id": f["founder_id"], "target": "VN", "objective": "x"}).status_code == 200
        vn = c.get(f"/api/founder/{f['founder_id']}").json()["missions"][-1]
        assert c.post(f"/api/passport/{vn['id']}").status_code == 404


def test_bare_list_is_wrapped_into_schema():
    from app.llm.gemma import coerce_to_schema
    from app.schemas import DiscoverLLM

    items = [{"record_id": "ID-A-01", "why_it_applies": "w", "status": "action_required", "next_action": "n"}]
    assert PassportLLM.model_validate(coerce_to_schema(items, PassportLLM)).items[0].record_id == "ID-A-01"
    picks = [{"id": "OPP-01", "fit": "high", "reason": "r"}]
    assert DiscoverLLM.model_validate(coerce_to_schema(picks, DiscoverLLM)).picks[0].id == "OPP-01"
    assert coerce_to_schema({"a": 1}, PassportLLM) == {"a": 1}


class _FakeModels:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def generate_content(self, model, contents, config):
        self.calls.append((model, contents))
        out = self.outcomes.pop(0)
        if isinstance(out, Exception):
            raise out
        return type("Resp", (), {"text": out})()


def _scanner(outcomes, model="gemini-test"):
    from app.config import Settings
    from app.llm.scanner import GeminiScanner

    s = GeminiScanner(Settings(gemini_api_key="k", gemini_scan_model=model))
    s._client = type("C", (), {"models": _FakeModels(outcomes)})()
    return s


def _png() -> bytes:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buf, format="PNG")
    return buf.getvalue()


def test_scanner_sends_pdf_image_and_office_text_to_gemini():
    from app.ingest.documents import ingest

    files = [
        ("deck.pdf", "application/pdf", b"%PDF-1.4 not really parsed"),
        ("slide.png", "image/png", _png()),
        ("notes.txt", "text/plain", b"We sell hospital triage software."),
        ("old.doc", "application/msword", b"x"),
    ]
    s = _scanner(["--- deck.pdf ---\nNadi Health"])
    result = s.scan(files, ingest(files))
    assert result.ok and result.model == "gemini-test"
    assert result.files == ["deck.pdf", "slide.png", "notes.txt"]
    sent = s.client.models.calls[0][1]
    assert any("hospital triage" in p for p in sent if isinstance(p, str))


def test_scanner_falls_back_to_next_model_then_gives_up():
    import httpx

    from app.ingest.documents import ingest

    files = [("notes.txt", "text/plain", b"hello")]
    s = _scanner([httpx.TimeoutException("slow"), "--- notes.txt ---\nhello"])
    assert s.scan(files, ingest(files)).model == "gemini-flash-latest"

    s = _scanner([httpx.TimeoutException("slow"), httpx.TimeoutException("slow")])
    result = s.scan(files, ingest(files))
    assert not result.ok and "read the files directly" in result.notes[0]


def test_read_uploads_uses_scan_text_and_drops_images(monkeypatch):
    from app.llm import scanner

    monkeypatch.setattr(scanner, "_scanner", _scanner(["--- slide.png ---\nNadi Health triage app"]))
    up = scanner.read_uploads([("slide.png", "image/png", _png())])
    assert up.scan_model == "gemini-test" and up.images == [] and "Nadi" in up.text

    monkeypatch.setattr(scanner, "_scanner", _scanner([], model=""))  # scanning off
    up = scanner.read_uploads([("slide.png", "image/png", _png())])
    assert up.scan_model is None and len(up.images) == 1


def test_founder_upload_without_key_still_works():
    from app.main import app

    with TestClient(app) as c:
        r = c.post("/api/founder/extract", files={"files": ("about.txt", b"Nadi Health builds hospital triage software in Malaysia.", "text/plain")})
        assert r.status_code == 200
        assert r.json()["meta"]["scan_model"] is None


def test_passport_runs_batches_in_parallel(monkeypatch):
    """Records are split across parallel Gemma calls and merged back without losing any."""
    from types import SimpleNamespace

    from app.routers import passport as pp
    from app.schemas import PassportItemLLM, PassportLLM

    records = [r for r in catalog.regulatory() if r["country"] == "ID"][:7]
    calls = []

    class Stub:
        live = False

        def generate_json(self, prompt, schema, fallback, started=None, **kw):
            batch = [r for r in records if f'"id": "{r["id"]}"' in prompt]
            calls.append(len(batch))
            items = [PassportItemLLM(record_id=r["id"], why_it_applies="x", status="action_required", next_action="Do it") for r in batch]
            return PassportLLM(items=items, missing_information=["Structure"], recommended_next_actions=["Register"]), GenMeta(source="gemma", model="gemma-4-26b-a4b-it")

    from app.llm.gemma import GenMeta

    monkeypatch.setattr(pp, "get_gemma", lambda: Stub())
    founder = SimpleNamespace(dna={}, meta={})
    mission = SimpleNamespace(objective="Run a pilot", target="ID")
    result, meta = pp._assess(founder, mission, records, 0.0)
    assert sorted(calls) == [1, 3, 3] and sum(calls) == len(records)
    assert [i.record_id for i in result.items] == [r["id"] for r in records]
    assert result.missing_information == ["Structure"] and meta.source == "gemma"
    assert "7 requirements" in pp._summary(result.items, "Indonesia")


def test_restore_recreates_lost_records(tmp_path, monkeypatch):
    """A browser can re-seed a server instance that lost its SQLite file."""
    from fastapi.testclient import TestClient
    from sqlmodel import Session, SQLModel, create_engine

    from app.db import get_session
    from app.main import app

    engine = create_engine(f"sqlite:///{tmp_path / 'a.db'}", connect_args={"check_same_thread": False})
    other = create_engine(f"sqlite:///{tmp_path / 'b.db'}", connect_args={"check_same_thread": False})
    from app import models  # noqa: F401

    for e in (engine, other):
        SQLModel.metadata.create_all(e)
    current = {"engine": engine}

    def session_override():
        with Session(current["engine"]) as s:
            yield s

    app.dependency_overrides[get_session] = session_override
    try:
        c = TestClient(app)
        f = c.post("/api/founder/sample").json()
        m = c.post("/api/mission", json={"founder_id": f["founder_id"], "target": "ID", "objective": "Run a hospital pilot in Jakarta"}).json()
        p = c.post(f"/api/passport/{m['id']}").json()

        current["engine"] = other  # a fresh instance that has never seen these records
        assert c.get(f"/api/passport/{m['id']}/roadmap").status_code == 404
        body = {"founder": f, "mission": m, "passport": p}
        assert c.post("/api/restore", json=body).json()["restored"] == ["founder", "mission", "passport"]
        assert c.get(f"/api/passport/{m['id']}/roadmap").status_code == 200
        assert c.get(f"/api/passport/{m['id']}").json()["passport_id"] == p["passport_id"]
        # Restoring again is a no-op and never overwrites.
        assert c.post("/api/restore", json=body).json()["restored"] == []
        assert c.post("/api/restore", json={"mission": {**m, "id": "../etc"}}).status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_restore_header_reseeds_the_instance_serving_the_retry(tmp_path):
    """A retry that lands on yet another fresh instance restores from its own header."""
    import base64
    import gzip
    import json

    from fastapi.testclient import TestClient
    from sqlmodel import Session, SQLModel, create_engine

    from app.db import get_session
    from app.main import app
    from app import models  # noqa: F401

    engines = [create_engine(f"sqlite:///{tmp_path / f'{n}.db'}", connect_args={"check_same_thread": False}) for n in "abc"]
    for e in engines:
        SQLModel.metadata.create_all(e)
    current = {"engine": engines[0]}

    def session_override():
        with Session(current["engine"]) as s:
            yield s

    app.dependency_overrides[get_session] = session_override
    try:
        c = TestClient(app)
        f = c.post("/api/founder/sample").json()
        m = c.post("/api/mission", json={"founder_id": f["founder_id"], "target": "ID", "objective": "Run a hospital pilot in Jakarta"}).json()
        p = c.post(f"/api/passport/{m['id']}").json()
        snap = {"founder": {"founder_id": f["founder_id"], "dna": f["dna"], "meta": f["meta"]}, "mission": m, "passport": p}

        def enc(kind: str, raw: bytes) -> str:
            return f"{kind}." + base64.urlsafe_b64encode(raw).decode().rstrip("=")

        current["engine"] = engines[1]
        assert c.get(f"/api/passport/{m['id']}/roadmap").status_code == 404
        gz = enc("gz", gzip.compress(json.dumps(snap).encode()))
        r = c.get(f"/api/passport/{m['id']}/roadmap", headers={"X-AMC-Restore": gz})
        assert r.status_code == 200 and r.json()["stages"]

        current["engine"] = engines[2]
        plain = enc("b64", json.dumps({"founder": snap["founder"]}).encode())
        assert c.get(f"/api/founder/{f['founder_id']}", headers={"X-AMC-Restore": plain}).status_code == 200

        # An unreadable header is ignored, not an error.
        assert c.get(f"/api/mission/{m['id']}", headers={"X-AMC-Restore": "gz.not-base64!"}).status_code == 404
        bomb = enc("gz", gzip.compress(b" " * 2_000_000))
        assert c.get(f"/api/mission/{m['id']}", headers={"X-AMC-Restore": bomb}).status_code == 404
    finally:
        app.dependency_overrides.clear()
