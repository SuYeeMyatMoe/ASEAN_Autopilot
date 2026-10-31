"""Re-create a founder, mission and passport the browser still has but this server lost.

Without DATABASE_URL the API stores data in SQLite under /tmp. On Vercel that file is
per instance and wiped on every deploy, so a request can land on an instance that has
never seen the mission ("Mission not found."). The browser keeps a copy of its own
records and posts them here; anything missing is inserted under the same ids, and
records that already exist are never overwritten.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, ValidationError
from sqlmodel import Session

from app import catalog
from app.db import get_session
from app.models import Founder, Mission, Passport
from app.schemas import FounderDNA, PassportItemLLM, PassportLLM
from app.services import latest_passport

router = APIRouter(tags=["restore"])

ID = Field(pattern=r"^[a-f0-9]{6,32}$")


class FounderIn(BaseModel):
    founder_id: str = ID
    dna: dict
    meta: dict = {}


class MissionIn(BaseModel):
    id: str = ID
    founder_id: str = ID
    origin: str = Field(max_length=8)
    target: str = Field(max_length=8)
    objective: str = Field(max_length=4000)
    sector: str = Field("all", max_length=64)


class PassportIn(BaseModel):
    passport_id: str = ID
    mission_id: str = ID
    summary: str = ""
    items: list[dict] = Field(default_factory=list, max_length=60)
    missing_information: list[str] = []
    recommended_next_actions: list[str] = []
    meta: dict = {}
    created_at: datetime | None = None


class RestoreIn(BaseModel):
    founder: FounderIn | None = None
    mission: MissionIn | None = None
    passport: PassportIn | None = None


@router.post("/restore")
def restore(body: RestoreIn, session: Session = Depends(get_session)):
    restored: list[str] = []

    f = body.founder
    if f and not session.get(Founder, f.founder_id):
        try:
            dna = FounderDNA.model_validate(f.dna)
        except ValidationError:
            dna = None
        if dna:
            session.add(Founder(id=f.founder_id, company_name=dna.company_name, dna=dna.model_dump(), meta=f.meta))
            session.flush()
            restored.append("founder")

    m = body.mission
    if m and not session.get(Mission, m.id) and session.get(Founder, m.founder_id):
        session.add(
            Mission(id=m.id, founder_id=m.founder_id, origin=m.origin.upper(), target=m.target.upper(), objective=m.objective, sector=m.sector)
        )
        session.flush()
        restored.append("mission")

    p = body.passport
    if p and session.get(Mission, p.mission_id) and not latest_passport(session, p.mission_id) and not session.get(Passport, p.passport_id):
        known = catalog.records_by_id()
        items = []
        for raw in p.items:
            try:
                item = PassportItemLLM.model_validate(raw)  # drops the display fields added by hydrate_items
            except ValidationError:
                continue
            if item.record_id in known:
                items.append(item)
        if items:
            payload = PassportLLM(
                summary=p.summary,
                items=items,
                missing_information=p.missing_information[:20],
                recommended_next_actions=p.recommended_next_actions[:20],
            )
            session.add(
                Passport(
                    id=p.passport_id,
                    mission_id=p.mission_id,
                    payload=payload.model_dump(),
                    meta=p.meta,
                    created_at=p.created_at or datetime.now(timezone.utc),
                )
            )
            restored.append("passport")

    session.commit()
    return {"restored": restored}
