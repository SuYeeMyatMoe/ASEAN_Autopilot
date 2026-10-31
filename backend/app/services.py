"""Shared lookups and the citation filter used by routers."""

from fastapi import HTTPException
from sqlmodel import Session, select

from app import catalog
from app.models import Founder, Mission, Passport
from app.schemas import PassportItemLLM, PassportLLM


def get_founder(session: Session, founder_id: str) -> Founder:
    founder = session.get(Founder, founder_id)
    if not founder:
        raise HTTPException(404, "Founder profile not found. Start from the upload step.")
    return founder


def get_mission(session: Session, mission_id: str) -> Mission:
    mission = session.get(Mission, mission_id)
    if not mission:
        raise HTTPException(404, "Mission not found.")
    return mission


def latest_passport(session: Session, mission_id: str) -> Passport | None:
    return session.exec(
        select(Passport).where(Passport.mission_id == mission_id).order_by(Passport.created_at.desc())
    ).first()


def enforce_grounding(result: PassportLLM, retrieved: list[dict]) -> tuple[PassportLLM, list[str]]:
    """Drop items citing records Gemma was not given; add back any record it skipped."""
    allowed = {r["id"] for r in retrieved}
    notes = []
    kept: list[PassportItemLLM] = []
    seen = set()
    for item in result.items:
        if item.record_id not in allowed:
            notes.append(f"Dropped an item citing unknown source '{item.record_id}'.")
            continue
        if item.record_id in seen:
            continue
        seen.add(item.record_id)
        kept.append(item)
    for r in retrieved:
        if r["id"] not in seen:
            kept.append(
                PassportItemLLM(
                    record_id=r["id"],
                    why_it_applies="Not assessed by the model. Review this source manually.",
                    status="source_verification_pending",
                    next_action="Read the source and confirm whether it applies.",
                )
            )
    return result.model_copy(update={"items": kept}), notes


def hydrate_items(items: list[dict]) -> list[dict]:
    """Attach source metadata so the UI never shows a requirement without its source."""
    by_id = catalog.records_by_id()
    out = []
    for it in items:
        r = by_id.get(it["record_id"])
        if not r:
            continue
        out.append(
            {
                **it,
                "area": r["area"],
                "area_name": catalog.AREAS[r["area"]],
                "category": r["category"],
                "title": r["title"],
                "summary": r["summary"],
                "authority": r["authority"],
                "source_url": r["source_url"],
                "instrument": r["instrument"],
                "verification_status": r["verification_status"],
                "last_verified": r["last_verified"],
                "effective_date": r["effective_date"],
                "country": r["country"],
            }
        )
    return out


def cite(ids: list[str]) -> list[dict]:
    by_id = catalog.records_by_id()
    return [
        {
            "id": i,
            "title": by_id[i]["title"],
            "authority": by_id[i]["authority"],
            "source_url": by_id[i]["source_url"],
            "verification_status": by_id[i]["verification_status"],
            "last_verified": by_id[i]["last_verified"],
        }
        for i in ids
        if i in by_id
    ]
