from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import catalog
from app.db import get_session
from app.engine.dependency import roadmap
from app.llm import prompts, rules
from app.llm.gemma import get_gemma
from app.models import Passport
from app.retrieval import rank
from app.schemas import PassportLLM
from app.services import enforce_grounding, founder_materials, get_founder, get_mission, hydrate_items, latest_passport

router = APIRouter(tags=["passport"])

MAX_RECORDS = 18


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

    result, meta = get_gemma().generate_json(
        prompts.passport(founder.dna, mission.objective, mission.target, records, founder_materials(founder)),
        PassportLLM,
        fallback=lambda: rules.passport(founder.dna, mission.objective, records),
    )
    result, notes = enforce_grounding(result, records)
    if not result.summary.strip():
        country = catalog.COUNTRIES.get(mission.target, {}).get("name", mission.target)
        applicable = sum(1 for i in result.items if i.applies)
        result.summary = f"{applicable} requirements to check for entering {country}, matched to your profile and uploaded files."
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
