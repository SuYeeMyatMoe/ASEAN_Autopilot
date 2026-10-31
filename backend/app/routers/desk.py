"""Market Access Desk (referrals + consultation packs), Radar, Assistant, Impact Tracker."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app import catalog
from app.db import get_session
from app.llm import prompts, rules
from app.llm.gemma import get_gemma
from app.models import Milestone, Mission, ReferralRequest
from app.retrieval import rank
from app.schemas import (
    AssistantIn,
    AssistantLLM,
    ConsultIn,
    ConsultPackLLM,
    MilestoneIn,
    RadarDiffIn,
    RadarDiffLLM,
    ReferralStatusIn,
)
from app.services import cite, get_founder, get_mission, latest_passport

router = APIRouter(tags=["desk"])


# ---------- Referral directory ----------
@router.get("/referrals")
def list_referrals(country: str | None = None, area: str | None = None):
    out = catalog.ecosystem()["referrals"]
    if country:
        out = [r for r in out if r["country"] == country.upper()]
    if area:
        out = [r for r in out if area.upper() in r["areas"]]
    return {"referrals": out, "areas": catalog.AREAS}


@router.post("/referrals/consult-pack")
def consult_pack(body: ConsultIn, session: Session = Depends(get_session)):
    mission = get_mission(session, body.mission_id)
    founder = get_founder(session, mission.founder_id)
    if not body.question.strip():
        raise HTTPException(422, "Describe the market-entry question you need help with.")
    pool = [r for r in catalog.records_for(mission.target, mission.sector) if r["country"] == mission.target]
    records = [r for r, _ in rank(body.question + " " + mission.objective, pool, 6)]
    referrals = [r for r in catalog.ecosystem()["referrals"] if r["country"] == mission.target]
    if body.referral_id:
        referrals.sort(key=lambda r: r["id"] != body.referral_id)

    pack, meta = get_gemma().generate_json(
        prompts.consult_pack(founder.dna, mission.objective, body.question, records, referrals),
        ConsultPackLLM,
        fallback=lambda: rules.consult_pack(founder.dna, mission.objective, body.question, records, referrals),
    )
    ref_by_id = {r["id"]: r for r in referrals}
    allowed = {r["id"] for r in records}
    data = pack.model_dump()
    data["sources"] = cite([i for i in pack.relevant_record_ids if i in allowed])
    data["referrals"] = [ref_by_id[i] for i in pack.suggested_referral_ids if i in ref_by_id] or referrals[:2]
    data["question"] = body.question
    return {"pack": data, "meta": meta.as_dict()}


@router.post("/referrals/requests")
def save_request(body: dict, session: Session = Depends(get_session)):
    mission = get_mission(session, body.get("mission_id", ""))
    referral_id = body.get("referral_id")
    if not referral_id:
        raise HTTPException(422, "Choose a referral channel.")
    req = ReferralRequest(mission_id=mission.id, referral_id=referral_id, pack=body.get("pack", {}))
    session.add(req)
    session.add(Milestone(mission_id=mission.id, kind="referral_prepared", label="Consultation package prepared", ref_id=referral_id))
    session.commit()
    session.refresh(req)
    return req.model_dump()


@router.get("/referrals/requests/{mission_id}")
def list_requests(mission_id: str, session: Session = Depends(get_session)):
    reqs = session.exec(select(ReferralRequest).where(ReferralRequest.mission_id == mission_id)).all()
    ref_by_id = {r["id"]: r for r in catalog.ecosystem()["referrals"]}
    return {"requests": [{**r.model_dump(), "referral": ref_by_id.get(r.referral_id)} for r in reqs]}


@router.patch("/referrals/requests/{request_id}")
def update_request(request_id: str, body: ReferralStatusIn, session: Session = Depends(get_session)):
    req = session.get(ReferralRequest, request_id)
    if not req:
        raise HTTPException(404, "Request not found.")
    req.status = body.status
    req.updated_at = datetime.now(timezone.utc)
    session.add(req)
    session.add(Milestone(mission_id=req.mission_id, kind="referral_status", label=body.status.replace("_", " ").capitalize(), ref_id=req.referral_id))
    session.commit()
    return req.model_dump()


# ---------- Regulatory Radar ----------
@router.get("/radar")
def list_radar():
    by_id = catalog.records_by_id()
    return {"items": [{**r, "record": cite([r["record_id"]])[0]} for r in catalog.ecosystem()["radar"] if r["record_id"] in by_id]}


@router.post("/radar/diff")
def radar_diff(body: RadarDiffIn, session: Session = Depends(get_session)):
    item = next((r for r in catalog.ecosystem()["radar"] if r["id"] == body.radar_id), None)
    if not item:
        raise HTTPException(404, "Radar item not found.")
    record = catalog.records_by_id()[item["record_id"]]
    old, new = item["versions"][-2], item["versions"][-1]
    diff, meta = get_gemma().generate_json(prompts.radar_diff(record, old, new), RadarDiffLLM, fallback=lambda: rules.radar_diff(old, new))

    # Only the requesting founder's missions: other founders' plans are private.
    affected = []
    missions = (
        session.exec(select(Mission).where(Mission.target == item["country"], Mission.founder_id == body.founder_id)).all()
        if body.founder_id
        else []
    )
    for m in missions:
        p = latest_passport(session, m.id)
        if p and any(i["record_id"] == item["record_id"] for i in p.payload["items"]):
            affected.append({"mission_id": m.id, "objective": m.objective, "target": m.target})
    return {"diff": diff.model_dump(), "old": old, "new": new, "record": cite([record["id"]])[0], "affected_missions": affected, "meta": meta.as_dict()}


# ---------- Assistant ----------
@router.post("/assistant")
def assistant(body: AssistantIn, session: Session = Depends(get_session)):
    if not body.question.strip():
        raise HTTPException(422, "Ask a question first.")
    dna, pool = None, catalog.regulatory()
    if body.mission_id:
        mission = get_mission(session, body.mission_id)
        dna = get_founder(session, mission.founder_id).dna
        pool = [r for r in pool if r["country"] in (mission.target, mission.origin, "ASEAN")]
    q = body.question.lower()
    mentioned = [code for code, c in catalog.COUNTRIES.items() if c["name"].lower() in q]
    if mentioned:
        pool = [r for r in catalog.regulatory() if r["country"] in mentioned + ["ASEAN"]]
    records = [r for r, s in rank(body.question, pool, 6) if s > 0]

    ans, meta = get_gemma().generate_json(prompts.assistant(body.question, dna, records), AssistantLLM, fallback=lambda: rules.assistant(records))
    allowed = {r["id"] for r in records}
    return {
        "answer": ans.answer,
        "citations": cite([c for c in ans.citations if c in allowed]),
        "needs_professional_review": ans.needs_professional_review,
        "meta": meta.as_dict(),
    }


# ---------- Impact Tracker ----------
@router.get("/milestones/{mission_id}")
def list_milestones(mission_id: str, session: Session = Depends(get_session)):
    rows = session.exec(select(Milestone).where(Milestone.mission_id == mission_id).order_by(Milestone.created_at.desc())).all()
    return {"milestones": [r.model_dump() for r in rows]}


@router.post("/milestones")
def add_milestone(body: MilestoneIn, session: Session = Depends(get_session)):
    get_mission(session, body.mission_id)
    m = Milestone(**body.model_dump())
    session.add(m)
    session.commit()
    session.refresh(m)
    return m.model_dump()
