import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import catalog
from app.db import get_session
from app.engine.dependency import roadmap
from app.llm import prompts, rules
from app.llm.gemma import GenMeta, get_gemma
from app.models import Passport
from app.retrieval import rank
from app.schemas import PassportLLM
from app.services import enforce_grounding, founder_materials, get_founder, get_mission, hydrate_items, latest_passport

router = APIRouter(tags=["passport"])

MAX_RECORDS = 18
# Records are assessed in parallel batches: Gemma's latency is driven by how much it writes,
# so three calls of ~6 items finish ~3x sooner than one call of 18. Three keeps the burst
# within the Gemini API's per-minute token limit for Gemma.
PARALLEL_CALLS = 3

STATUS_PHRASES = {
    "action_required": "need action",
    "professional_review_required": "need professional review",
    "information_missing": "need more information from you",
    "source_verification_pending": "need the source checked",
    "information_available": "are already covered by your materials",
}


def _dedupe(values: list[str], limit: int) -> list[str]:
    seen, out = set(), []
    for v in values:
        key = v.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(v.strip())
    return out[:limit]


def _summary(items, country: str) -> str:
    applicable = [i for i in items if i.applies]
    counts = Counter(i.status for i in applicable)
    parts = [f"{counts[s]} {phrase}" for s, phrase in STATUS_PHRASES.items() if counts[s]]
    head = f"{len(applicable)} requirements to check for entering {country}, matched to your profile and uploaded files"
    return f"{head}: {', '.join(parts)}." if parts else f"{head}."


def _assess(founder, mission, records: list[dict], started: float) -> tuple[PassportLLM, GenMeta]:
    """Ask Gemma 4 about each batch of records at the same time and merge the answers."""
    gemma = get_gemma()
    materials = founder_materials(founder)
    size = max(1, -(-len(records) // PARALLEL_CALLS))
    batches = [records[i : i + size] for i in range(0, len(records), size)]
    if gemma.live:
        try:  # create the shared client (and pick the model) once, before the threads start
            gemma.client, gemma.model
        except Exception:
            pass  # each call then falls back on its own

    def run(batch: list[dict]):
        return gemma.generate_json(
            prompts.passport(founder.dna, mission.objective, mission.target, batch, materials),
            PassportLLM,
            fallback=lambda: rules.passport(founder.dna, mission.objective, batch),
            started=started,
        )

    with ThreadPoolExecutor(max_workers=len(batches) or 1) as pool:
        results = list(pool.map(run, batches))

    live = [m for _, m in results if m.source == "gemma"]
    if live:
        meta = GenMeta(source="gemma", model=live[0].model)
        if len(live) < len(results):
            meta.notes.append(f"{len(results) - len(live)} of {len(results)} sections used the rule-based result because Gemma 4 did not answer in time.")
    else:
        meta = GenMeta(source=results[0][1].source if results else "fallback")
    meta.notes.extend(_dedupe([n for _, m in results for n in m.notes], 6))

    merged = PassportLLM(
        items=[item for r, _ in results for item in r.items],
        missing_information=_dedupe([x for r, m in results if m.source == "gemma" for x in r.missing_information], 8)
        or _dedupe([x for r, _ in results for x in r.missing_information], 8),
        recommended_next_actions=_dedupe([x for r, m in results if m.source == "gemma" for x in r.recommended_next_actions], 6)
        or _dedupe([x for r, _ in results for x in r.recommended_next_actions], 6),
    )
    if not live:
        merged.summary = results[0][0].summary if results else ""
    return merged, meta


def _serialise(p: Passport) -> dict:
    items = hydrate_items(p.payload["items"])
    return {
        "passport_id": p.id,
        "mission_id": p.mission_id,
        "summary": p.payload.get("summary", ""),
        "items": items,
        "missing_information": p.payload.get("missing_information", []),
        "recommended_next_actions": p.payload.get("recommended_next_actions", []),
        "status_counts": Counter(i["status"] for i in items if i.get("applies", True)),
        "meta": p.meta,
        "created_at": p.created_at.isoformat(),
    }


@router.post("/passport/{mission_id}")
def generate_passport(mission_id: str, session: Session = Depends(get_session)):
    started = time.monotonic()
    mission = get_mission(session, mission_id)
    founder = get_founder(session, mission.founder_id)
    pool = catalog.records_for(mission.target, mission.sector)
    if not any(r["country"] == mission.target for r in pool):
        raise HTTPException(
            404, f"{catalog.COUNTRIES.get(mission.target, {}).get('name', mission.target)} is not covered yet. Verified records exist for Indonesia, Malaysia and Singapore."
        )
    query = " ".join(
        [
            mission.objective,
            " ".join(founder.dna.get("business_activities", [])),
            " ".join(founder.dna.get("data_handling", [])),
            founder.dna.get("materials_summary", ""),
        ]
    )
    records = [r for r, _ in rank(query, pool, MAX_RECORDS)]

    result, meta = _assess(founder, mission, records, started)
    result, notes = enforce_grounding(result, records)
    if not result.summary.strip():
        country = catalog.COUNTRIES.get(mission.target, {}).get("name", mission.target)
        result.summary = _summary(result.items, country)
    meta.notes.extend(notes)
    p = Passport(mission_id=mission.id, payload=result.model_dump(), meta=meta.as_dict())
    session.add(p)
    session.commit()
    session.refresh(p)
    return _serialise(p)


@router.get("/passport/{mission_id}")
def read_passport(mission_id: str, session: Session = Depends(get_session)):
    get_mission(session, mission_id)
    p = latest_passport(session, mission_id)
    if not p:
        raise HTTPException(404, "No passport yet for this mission.")
    return _serialise(p)


@router.get("/passport/{mission_id}/roadmap")
def read_roadmap(mission_id: str, session: Session = Depends(get_session)):
    get_mission(session, mission_id)
    p = latest_passport(session, mission_id)
    if not p:
        raise HTTPException(404, "Generate the passport first.")
    applicable = {i["record_id"]: i for i in p.payload["items"] if i.get("applies", True)}
    by_id = catalog.records_by_id()
    records = [by_id[rid] for rid in applicable if rid in by_id and by_id[rid]["country"] != "ASEAN"]
    stages = roadmap(records)
    for stage in stages:
        for step in stage["steps"]:
            item = applicable[step["record_id"]]
            step["status"] = item["status"]
            step["next_action"] = item["next_action"]
    return {"mission_id": mission_id, "stages": stages}
