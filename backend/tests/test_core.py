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

    def generate(self, prompt, images=None, temperature=0.2):
        return self.replies.pop(0)


def test_json_repair_path():
    g = FakeGemma(['{"company_name": 5, "sector": "space"}', '{"company_name": "Nadi", "sector": "healthcare"}'])
    dna, meta = g.generate_json("x", FounderDNA, fallback=lambda: FounderDNA())
    assert dna.company_name == "Nadi"
    assert meta.source == "gemma" and "repaired" in meta.notes[0]


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
