"""Pydantic contracts: what Gemma must return, and what the API serves."""

from typing import Literal

from pydantic import BaseModel, Field

Status = Literal[
    "information_available",
    "action_required",
    "professional_review_required",
    "information_missing",
    "source_verification_pending",
]


# ---------- Founder DNA ----------
class FounderDNA(BaseModel):
    company_name: str = ""
    origin_country: str = Field("", description="ISO 3166 alpha-2, e.g. MY")
    industry: str = ""
    sector: Literal["healthcare", "fintech", "education", "logistics", "agritech", "commerce", "all"] = "all"
    business_model: str = ""
    business_activities: list[str] = []
    stage: str = ""
    team_size: int | None = None
    hiring_plans: str = ""
    products: list[str] = []
    data_handling: list[str] = Field([], description="Kinds of data processed, e.g. patient health records")
    processes_sensitive_data: bool = False
    ownership_notes: str = ""
    existing_registrations: list[str] = []
    ip_assets: list[str] = []
    expansion_objectives: list[str] = []
    target_countries: list[str] = []
    follow_up_questions: list[str] = Field([], description="Questions whose answers are missing from the material")


# ---------- Passport (Gemma output) ----------
class PassportItemLLM(BaseModel):
    record_id: str
    applies: bool = True
    why_it_applies: str
    status: Status
    evidence_available: list[str] = []
    missing: list[str] = []
    next_action: str


class PassportLLM(BaseModel):
    summary: str
    items: list[PassportItemLLM]
    missing_information: list[str] = []
    recommended_next_actions: list[str] = []


# ---------- Discovery ----------
class DiscoverPickLLM(BaseModel):
    id: str
    fit: Literal["high", "medium", "low"]
    reason: str


class DiscoverLLM(BaseModel):
    picks: list[DiscoverPickLLM]


# ---------- Compare ----------
class CompareCellLLM(BaseModel):
    country: str
    area: str
    highlight: str
    unknowns: list[str] = []
    record_ids: list[str] = []


class CompareLLM(BaseModel):
    cells: list[CompareCellLLM]
    trade_offs: list[str] = []
    open_questions: list[str] = []


# ---------- Consultation pack ----------
class ConsultPackLLM(BaseModel):
    issue_summary: str
    founder_profile: str
    business_activities: list[str] = []
    relevant_record_ids: list[str] = []
    questions_to_ask: list[str]
    documents_to_bring: list[str] = []
    missing_information: list[str] = []
    suggested_referral_ids: list[str] = []


# ---------- Radar ----------
class RadarDiffLLM(BaseModel):
    summary: str
    what_changed: list[str]
    stage_change: str
    review_tasks: list[str] = []
    recommend_professional: bool = True


# ---------- Assistant ----------
class AssistantLLM(BaseModel):
    answer: str
    citations: list[str] = []
    needs_professional_review: bool = True


# ---------- API requests ----------
class MissionIn(BaseModel):
    founder_id: str
    target: str
    objective: str
    origin: str | None = None


class DiscoverIn(BaseModel):
    mission_id: str
    kinds: list[str] = ["programme", "funding", "partner", "talent"]


class CompareIn(BaseModel):
    founder_id: str
    countries: list[str] = ["ID", "SG"]


class ConsultIn(BaseModel):
    mission_id: str
    question: str
    referral_id: str | None = None


class ReferralStatusIn(BaseModel):
    status: Literal[
        "referral_prepared",
        "contact_provided",
        "consultation_requested",
        "appointment_pending",
        "consultation_completed",
        "documents_requested",
        "follow_up_required",
        "resolved",
        "escalated",
    ]


class RadarDiffIn(BaseModel):
    radar_id: str
    founder_id: str | None = None


class AssistantIn(BaseModel):
    question: str
    mission_id: str | None = None


class MilestoneIn(BaseModel):
    mission_id: str
    kind: str
    label: str
    ref_id: str | None = None
