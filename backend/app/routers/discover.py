from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import catalog
from app.db import get_session
from app.llm import prompts, rules
from app.llm.gemma import get_gemma
from app.retrieval import rank
from app.schemas import CompareIn, CompareLLM, DiscoverIn, DiscoverLLM
from app.services import cite, get_founder, get_mission

router = APIRouter(tags=["discover"])


def _pool(target: str, kinds: list[str]) -> list[dict]:
    eco = catalog.ecosystem()
    items = eco["opportunities"] + eco["partners"] + eco["talent"]
    out = []
    for i in items:
        if i["kind"] not in kinds:
            continue
        if i["country"] == target or target in i.get("target_countries", []) or i["country"] == "ASEAN":
            out.append(i)
    return out


@router.post("/discover")
def discover(body: DiscoverIn, session: Session = Depends(get_session)):
    mission = get_mission(session, body.mission_id)
    founder = get_founder(session, mission.founder_id)
    dna = founder.dna
    pool = _pool(mission.target, body.kinds)
    query = " ".join([mission.objective, dna.get("industry", ""), dna.get("sector", ""), " ".join(dna.get("business_activities", []))])
    ranked = rank(query, pool)
    candidates = [i for i, _ in ranked[:14]]

    result, meta = get_gemma().generate_json(
        prompts.discover(dna, mission.objective, candidates),
        DiscoverLLM,
        fallback=lambda: rules.discover(query, ranked),
    )
    by_id = {i["id"]: i for i in pool}
    results = [{**by_id[p.id], "fit": p.fit, "reason": p.reason} for p in result.picks if p.id in by_id]
    return {"results": results, "meta": meta.as_dict()}


@router.post("/compare")
def compare(body: CompareIn, session: Session = Depends(get_session)):
    founder = get_founder(session, body.founder_id)
    countries = [c.upper() for c in body.countries][:4]
    if len(countries) < 2:
        raise HTTPException(422, "Pick at least two countries to compare.")
    sector = founder.dna.get("sector") or "all"
    records = [r for c in countries for r in catalog.records_for(c, sector) if r["country"] == c]

    result, meta = get_gemma().generate_json(
        prompts.compare(founder.dna, countries, catalog.AREAS, records),
        CompareLLM,
        fallback=lambda: rules.compare(countries, records),
    )
    allowed = {r["id"] for r in records}
    grid: dict[str, dict[str, dict]] = {c: {} for c in countries}
    for cell in result.cells:
        if cell.country not in grid or cell.area not in catalog.AREAS:
            continue
        ids = [i for i in cell.record_ids if i in allowed]
        grounded = bool(ids)
        grid[cell.country][cell.area] = {
            "highlight": cell.highlight if grounded else "Not yet sourced",
            "unknowns": cell.unknowns if grounded else (cell.unknowns or ["No verified record yet for this area"]),
            "sources": cite(ids),
        }
    for c in countries:
        for a in catalog.AREAS:
            grid[c].setdefault(a, {"highlight": "Not yet sourced", "unknowns": ["No verified record yet for this area"], "sources": []})
    return {
        "countries": [{"code": c, "name": catalog.COUNTRIES.get(c, {}).get("name", c)} for c in countries],
        "areas": catalog.AREAS,
        "grid": grid,
        "trade_offs": result.trade_offs,
        "open_questions": result.open_questions,
        "meta": meta.as_dict(),
    }
