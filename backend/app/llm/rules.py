"""Deterministic, non-LLM builders used in demo mode or when Gemma fails.

They are intentionally conservative: they lean on 'professional review' and
'information missing' rather than asserting anything.
"""

import re

from app import catalog
from app.retrieval import matched_terms
from app.schemas import (
    CompareCellLLM,
    CompareLLM,
    ConsultPackLLM,
    DiscoverLLM,
    DiscoverPickLLM,
    FounderDNA,
    PassportItemLLM,
    PassportLLM,
    RadarDiffLLM,
)

_COUNTRY_WORDS = {
    "malaysia": "MY", "kuala lumpur": "MY", "selangor": "MY", "indonesia": "ID", "jakarta": "ID",
    "singapore": "SG", "thailand": "TH", "bangkok": "TH", "vietnam": "VN", "philippines": "PH",
    "cambodia": "KH", "lao": "LA", "myanmar": "MM", "brunei": "BN",
}
_SECTOR_WORDS = [
    ("healthcare", ["health", "patient", "hospital", "clinic", "medical", "triage", "sepsis"]),
    ("fintech", ["payment", "lending", "fintech", "wallet", "bank", "insurance"]),
    ("education", ["edtech", "school", "learning", "student"]),
    ("logistics", ["logistics", "shipping", "freight", "delivery"]),
    ("agritech", ["farm", "agri", "crop"]),
    ("commerce", ["e-commerce", "marketplace", "retail"]),
]


def founder_dna(text: str) -> FounderDNA:
    t = text or ""
    low = t.lower()
    sector = next((s for s, words in _SECTOR_WORDS if any(w in low for w in words)), "all")
    countries = [code for word, code in _COUNTRY_WORDS.items() if word in low]
    origin = countries[0] if countries else ""
    targets = sorted({c for c in countries if c != origin})
    name = re.search(r"([A-Z][\w&.\- ]{1,40}?(?:Sdn Bhd|Pte Ltd|Ltd|Inc|PT [A-Z]\w+))", t)
    team = re.search(r"(\d{1,4})\s+(?:staff|employees|people)", low)
    sensitive = any(w in low for w in ["patient", "medical history", "health data", "biometric", "financial data", "vitals"])
    data = []
    if sensitive:
        data.append("Sensitive personal data (health or financial)")
    if "personal" in low or "names" in low:
        data.append("Personal data of end users")
    return FounderDNA(
        company_name=name.group(1).strip() if name else "",
        origin_country=origin,
        industry={"healthcare": "Healthcare technology", "all": "Technology"}.get(sector, sector.title()),
        sector=sector,
        business_model="SaaS" if "saas" in low else "",
        business_activities=[s.strip() for s in re.findall(r"Product: ([^.]+)\.", t)][:3],
        stage="Seed" if "seed" in low else "",
        team_size=int(team.group(1)) if team else None,
        hiring_plans="Plans to hire locally" if "hire" in low else "",
        products=re.findall(r"Product: ([\w ]+?),", t)[:3],
        data_handling=data,
        processes_sensitive_data=sensitive,
        existing_registrations=["Registered company in origin country"] if re.search(r"sdn bhd|pte ltd", low) else [],
        ip_assets=["Trademark registered in origin country"] if "trademark" in low else [],
        expansion_objectives=[g.strip()[:1].upper() + g.strip()[1:] for g in re.findall(r"Goal: ([^.]+)\.", t)],
        target_countries=targets,
        follow_up_questions=[
            "What local structure do you intend to use in the target market (subsidiary, distributor, partner)?",
            "What is the intended clinical or business use of the product, in one sentence?",
            "Where will personal data be stored and processed?",
            "Who owns the company today, and what share will foreign shareholders hold locally?",
        ],
    )


_STATUS_BY_CATEGORY = {
    "healthcare_licensing": "professional_review_required",
    "foreign_investment": "professional_review_required",
    "company_registration": "information_missing",
    "taxation": "action_required",
    "incentives": "action_required",
    "employment": "action_required",
    "immigration": "action_required",
    "intellectual_property": "action_required",
    "business_licensing": "action_required",
    "operations": "action_required",
}

_WHY = {
    "company_registration": "Operating locally, running pilots or hiring staff usually needs a registered presence, and you have no entity in this market yet.",
    "foreign_investment": "As a foreign-owned company, the ownership allowed depends on how your activities are classified here.",
    "healthcare_licensing": "Your product supports clinical decisions, so it may fall under health product or medical device rules depending on its intended use.",
    "business_licensing": "You plan to offer a software platform to users in this market.",
    "taxation": "A local entity, local revenue or fees paid back to your home company create tax registration and filing duties.",
    "incentives": "Your activity and stage may qualify for investment or R&D support in this market.",
    "employment": "You plan to hire locally and may bring existing staff over.",
    "immigration": "Founders or staff travelling or relocating to this market need the right visa or permit.",
    "intellectual_property": "Trademark rights are territorial, so protection at home does not cover this market.",
    "data_protection": "You process personal data of users in this market.",
    "operations": "Your plan involves pilots or contracts with local organisations.",
}

_NEXT_ACTION = {
    "company_registration": "Decide the intended local operating structure and confirm it with a corporate lawyer.",
    "foreign_investment": "Map each planned activity to a business classification code and check the ownership limit.",
    "healthcare_licensing": "Describe the product's intended use and ask a health regulatory consultant whether it is a medical device.",
    "business_licensing": "Check whether the platform must register as an electronic system operator.",
    "taxation": "Book a session with a local tax adviser on registration, VAT and cross-border fees.",
    "incentives": "Shortlist incentives that match your activity and confirm eligibility with the provider.",
    "employment": "Decide which roles will be local hires and which will be transfers, then check permit needs.",
    "immigration": "List who needs to travel or relocate and match each person to a visa category.",
    "intellectual_property": "Search and file your trademark in the target market before launch.",
    "data_protection": "Map what personal data you collect, where it is stored and whether it leaves the country.",
    "operations": "Confirm the contracting entity and data sharing terms for pilots.",
}


def passport(dna: dict, objective: str, records: list[dict]) -> PassportLLM:
    items = []
    sensitive = dna.get("processes_sensitive_data")
    for r in records:
        status = _STATUS_BY_CATEGORY.get(r["category"], "professional_review_required")
        if r["category"] == "data_protection":
            status = "professional_review_required" if sensitive else "action_required"
        evidence, missing = [], []
        if r["category"] == "intellectual_property" and dna.get("ip_assets"):
            evidence += dna["ip_assets"]
            missing.append("Protection in the target market")
        if r["category"] == "data_protection" and dna.get("data_handling"):
            evidence += dna["data_handling"]
            missing.append("Data storage location and transfer mechanism")
        if r["category"] == "company_registration":
            evidence += dna.get("existing_registrations", [])
            missing.append("Intended local business structure")
        if r["category"] == "healthcare_licensing":
            missing.append("Regulatory classification of the product")
        items.append(
            PassportItemLLM(
                record_id=r["id"],
                why_it_applies=(
                    "You process sensitive health data, which carries stricter obligations than ordinary personal data."
                    if r["category"] == "data_protection" and sensitive
                    else _WHY.get(r["category"], "This source may apply to your planned activities.")
                ),
                status=status,
                evidence_available=evidence,
                missing=missing,
                next_action=_NEXT_ACTION.get(r["category"], "Confirm with the responsible authority."),
            )
        )
    return PassportLLM(
        summary="Rule-based passport built from the source records. Connect Gemma 4 for a personalised analysis.",
        items=items,
        missing_information=["Intended local business structure", "Product regulatory classification", "Data storage and transfer arrangements"],
        recommended_next_actions=["Clarify business activities", "Verify sector-specific requirements", "Identify the relevant local authority"],
    )


def discover(query: str, ranked: list[tuple[dict, float]]) -> DiscoverLLM:
    picks = []
    for item, score in ranked[:8]:
        if score <= 0:
            continue
        terms = matched_terms(query, item)
        fit = "high" if score > 3 else "medium" if score > 1 else "low"
        reason = f"Matches your profile on: {', '.join(terms)}." if terms else "Related to your sector and target market."
        picks.append(DiscoverPickLLM(id=item["id"], fit=fit, reason=reason))
    return DiscoverLLM(picks=picks)


def compare(countries: list[str], records: list[dict]) -> CompareLLM:
    cells = []
    for c in countries:
        for area in catalog.AREAS:
            recs = [r for r in records if r["country"] == c and r["area"] == area]
            if recs:
                first = recs[0]["summary"].split(". ")[0].rstrip(".") + "."
                cells.append(CompareCellLLM(country=c, area=area, highlight=first, record_ids=[r["id"] for r in recs]))
            else:
                cells.append(CompareCellLLM(country=c, area=area, highlight="Not yet sourced", unknowns=["No verified record yet for this area"]))
    return CompareLLM(
        cells=cells,
        trade_offs=["Compare structures, sector licensing and data rules side by side; the right market depends on your objective."],
        open_questions=["Which market gives you the earliest pilot customer?", "Where must your data be stored?"],
    )


def consult_pack(dna: dict, objective: str, question: str, records: list[dict], referrals: list[dict]) -> ConsultPackLLM:
    return ConsultPackLLM(
        issue_summary=question,
        founder_profile=" ".join(
            filter(
                None,
                [
                    f"{dna.get('company_name') or 'The startup'} is a",
                    (dna.get("stage") or "").lower(),
                    (dna.get("industry") or "technology").lower(),
                    f"company based in {catalog.COUNTRIES.get(dna.get('origin_country', ''), {}).get('name', 'ASEAN')}.",
                ],
            )
        ),
        business_activities=dna.get("business_activities", []),
        relevant_record_ids=[r["id"] for r in records[:4]],
        questions_to_ask=[
            "Does our product, as described, fall within a regulated category in this market?",
            "Which local entity must hold any required permit or registration?",
            "What documents do you need from us to give a definitive view?",
            "What is the realistic timeline and cost for the approvals involved?",
        ],
        documents_to_bring=["Company registration certificate", "Product description and intended use", "Data flow diagram"],
        missing_information=["Intended local structure", "Product classification"],
        suggested_referral_ids=[
            ref["id"] for ref in referrals if set(ref["areas"]) & {r["area"] for r in records[:4]}
        ][:3],
    )


def radar_diff(old: dict, new: dict) -> RadarDiffLLM:
    return RadarDiffLLM(
        summary=new["text"].split(". ")[0] + ".",
        what_changed=[s.strip().rstrip(".") + "." for s in new["text"].split(". ")[1:3] if s.strip()],
        stage_change=f"{old['stage']} to {new['stage']}",
        review_tasks=["Re-check data protection items in your passport", "Confirm obligations with data protection counsel"],
    )
