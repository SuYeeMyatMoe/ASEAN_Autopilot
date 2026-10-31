"""User-generated records (stored in Supabase Postgres / local SQLite).

Reference data (regulatory records, agencies, opportunities) is versioned
JSON in app/seed and loaded by app.catalog.
"""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def _id() -> str:
    return uuid4().hex[:12]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Founder(SQLModel, table=True):
    id: str = Field(default_factory=_id, primary_key=True)
    company_name: str = ""
    dna: dict = Field(default_factory=dict, sa_column=Column(JSON))
    meta: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)


class Mission(SQLModel, table=True):
    id: str = Field(default_factory=_id, primary_key=True)
    founder_id: str = Field(index=True, foreign_key="founder.id")
    origin: str
    target: str
    objective: str
    sector: str = "all"
    created_at: datetime = Field(default_factory=_now)


class Passport(SQLModel, table=True):
    id: str = Field(default_factory=_id, primary_key=True)
    mission_id: str = Field(index=True, foreign_key="mission.id")
    payload: dict = Field(default_factory=dict, sa_column=Column(JSON))
    gaps: dict | None = Field(default=None, sa_column=Column(JSON))
    meta: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)


class ReferralRequest(SQLModel, table=True):
    id: str = Field(default_factory=_id, primary_key=True)
    mission_id: str = Field(index=True, foreign_key="mission.id")
    referral_id: str
    status: str = "referral_prepared"
    pack: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class Milestone(SQLModel, table=True):
    id: str = Field(default_factory=_id, primary_key=True)
    mission_id: str = Field(index=True, foreign_key="mission.id")
    kind: str  # requirement_reviewed | opportunity_saved | consultation_requested | ...
    label: str
    ref_id: str | None = None
    created_at: datetime = Field(default_factory=_now)
