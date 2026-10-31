"""Mission Companion: a multilingual, context-aware voice co-pilot.

Speech-to-text and text-to-speech run in the browser. This router does the
thinking: it assembles the founder's context (profile, mission, passport gaps,
saved items, referrals), retrieves official records, asks Gemma 4 for a short
spoken reply plus at most one platform action, then validates that action.
"""

from collections import Counter
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app import catalog
from app.db import get_session
from app.ingest.documents import ingest
from app.llm.gemma import get_gemma
from app.models import Milestone, ReferralRequest
from app.retrieval import rank
from app.services import cite, get_founder, get_mission, latest_passport

router = APIRouter(tags=["companion"])

LANGUAGES = {
    "en": "English",
    "ms": "Malay (Bahasa Melayu)",
    "id": "Indonesian (Bahasa Indonesia)",
    "th": "Thai",
    "vi": "Vietnamese",
    "fil": "Filipino",
    "km": "Khmer",
    "lo": "Lao",
    "my": "Burmese",
    "zh": "Chinese (Simplified)",
    "ta": "Tamil",
}

ACTIONS = {
    "none": "No action.",
    "open_page": "Open an app page. params.page is one of: passport, gaps, roadmap, compare, discover, desk, radar, map, mission, onboard.",
    "search_opportunities": "Show programmes, funding, partners or talent. params.kinds is a list from: programme, funding, partner, talent.",
    "compare_markets": "Compare markets. params.countries is a list of 2-3 codes from: ID, MY, SG.",
    "save_opportunity": "Save an ecosystem item to the tracker. params.id must be an id from ECOSYSTEM ITEMS.",
    "check_progress": "Show mission progress (the Mission page with the Impact Tracker).",
}
PAGES = {"passport", "gaps", "roadmap", "compare", "discover", "desk", "radar", "map", "mission", "onboard"}


class Turn(BaseModel):
    role: Literal["user", "companion"]
    text: str


class ChatIn(BaseModel):
    message: str
    language: str = "auto"
    mission_id: str | None = None
    founder_id: str | None = None
    page: str | None = None
    history: list[Turn] = []


class CompanionAction(BaseModel):
    type: Literal["none", "open_page", "search_opportunities", "compare_markets", "save_opportunity", "check_progress"] = "none"
    params: dict = {}
    label: str = Field("", description="Short confirmation shown to the user, in the reply language")


class CompanionLLM(BaseModel):
    reply: str = Field(description="What the companion says aloud. Plain sentences, no markdown, no lists, under 90 words.")
    language: str = Field("en", description="Language code of the reply, e.g. en, ms, id, th, vi")
    next_step: str = Field("", description="One concrete next step, under 15 words, in the reply language")
    citations: list[str] = []
    action: CompanionAction = CompanionAction()
    suggestions: list[str] = Field([], description="2 or 3 short follow-up questions the founder might ask, in the reply language")


class DocExplainLLM(BaseModel):
    summary: str = Field(description="Plain-language explanation, under 120 words, no markdown")
    language: str = "en"
    key_requirements: list[str] = []
    deadlines: list[str] = []
    documents_needed: list[str] = []
    authorities: list[str] = []
    next_step: str = ""


# ---------- context ----------
def _context(session: Session, mission_id: str | None, founder_id: str | None) -> dict:
    ctx: dict = {"founder": None, "mission": None, "open_items": [], "status_counts": {}, "saved": [], "referrals": []}
    mission = None
    if mission_id:
        mission = get_mission(session, mission_id)
        founder_id = mission.founder_id
    if founder_id:
        f = get_founder(session, founder_id)
        d = f.dna
        ctx["founder"] = {
            k: d.get(k)
            for k in ("company_name", "origin_country", "industry", "sector", "stage", "business_activities", "data_handling", "expansion_objectives")
        }
    if mission:
        ctx["mission"] = {"origin": mission.origin, "target": mission.target, "objective": mission.objective}
        p = latest_passport(session, mission.id)
        if p:
            by_id = catalog.records_by_id()
            items = [i for i in p.payload["items"] if i.get("applies", True)]
            ctx["status_counts"] = dict(Counter(i["status"] for i in items))
            order = ["information_missing", "professional_review_required", "action_required"]
            open_items = sorted((i for i in items if i["status"] in order), key=lambda i: order.index(i["status"]))
            ctx["open_items"] = [
                {"record_id": i["record_id"], "title": by_id[i["record_id"]]["title"], "status": i["status"], "next_action": i["next_action"]}
                for i in open_items[:6]
                if i["record_id"] in by_id
            ]
        ctx["saved"] = [m.label for m in session.exec(select(Milestone).where(Milestone.mission_id == mission.id)).all()][-6:]
        ctx["referrals"] = [
            {"referral_id": r.referral_id, "status": r.status}
            for r in session.exec(select(ReferralRequest).where(ReferralRequest.mission_id == mission.id)).all()
        ]
    return ctx


def _eco_items(target: str | None) -> list[dict]:
    eco = catalog.ecosystem()
    items = eco["opportunities"] + eco["partners"] + eco["talent"]
    if target:
        items = [i for i in items if i["country"] in (target, "ASEAN") or target in i.get("target_countries", [])]
    return [{"id": i["id"], "kind": i["kind"], "name": i["name"], "country": i["country"], "sample": i.get("sample", False)} for i in items]


def _validate_action(a: CompanionAction, eco_ids: set[str]) -> CompanionAction:
    p = a.params or {}
    if a.type == "open_page" and p.get("page") not in PAGES:
        return CompanionAction()
    if a.type == "search_opportunities":
        kinds = [k for k in p.get("kinds", []) if k in {"programme", "funding", "partner", "talent"}]
        return a.model_copy(update={"params": {"kinds": kinds or ["programme", "funding", "partner", "talent"]}})
    if a.type == "compare_markets":
        cs = [c for c in p.get("countries", []) if c in ("ID", "MY", "SG")]
        return a.model_copy(update={"params": {"countries": cs if len(cs) >= 2 else ["MY", "ID", "SG"]}})
    if a.type == "save_opportunity" and p.get("id") not in eco_ids:
        return CompanionAction()
    return a


# ---------- deterministic fallback (no key / Gemma failure) ----------
def _fallback(message: str, ctx: dict, records: list[dict], eco: list[dict]) -> CompanionLLM:
    q = message.lower()
    action = CompanionAction()
    if any(w in q for w in ("compare", "bandingkan", "versus", " vs ")):
        action = CompanionAction(type="compare_markets", params={"countries": ["MY", "ID", "SG"]}, label="Opened Compare markets")
    elif any(w in q for w in ("fund", "grant", "investor", "dana", "geran", "programme", "program", "partner", "talent", "hire")):
        action = CompanionAction(type="search_opportunities", params={"kinds": ["programme", "funding", "partner", "talent"]}, label="Opened Discover")
    elif any(w in q for w in ("progress", "status", "kemajuan", "how far")):
        action = CompanionAction(type="check_progress", label="Opened your mission progress")

    first = ctx["open_items"][0] if ctx["open_items"] else None
    if first:
        reply = (
            "Let's take it one step at a time. "
            f"The most important open item is {first['title']}. {first['next_action']} "
            "I'll point you to the official source and the right adviser when you need one."
        )
        next_step = first["next_action"]
    elif records:
        r = records[0]
        reply = f"Here's a good place to start: {r['title']}, handled by {r['authority']}. {r['summary'].split('. ')[0]}."
        next_step = "Open your Launch Passport to see every requirement."
    else:
        reply = "Let's start with your startup. Upload your pitch deck or load the sample, then set your target market, and I'll guide you from there."
        next_step = "Build your Founder DNA."
    return CompanionLLM(
        reply=reply,
        language="en",
        next_step=next_step,
        citations=[first["record_id"]] if first else [r["id"] for r in records[:1]],
        action=action,
        suggestions=["What should I do first?", "Which licences might apply to me?", "Show me funding options"],
    )


def _prompt(body: ChatIn, ctx: dict, records: list[dict], eco: list[dict]) -> str:
    import json

    lang = LANGUAGES.get(body.language)
    lang_rule = (
        f"Always reply in {lang}." if lang else "Reply in the same language the founder used in their latest message."
    )
    history = "\n".join(f"{t.role}: {t.text}" for t in body.history[-6:])
    slim = [{k: r[k] for k in ("id", "country", "area", "title", "summary", "authority")} for r in records]
    return (
        "You are Mission Companion, a calm, friendly voice co-pilot inside ASEAN Mission Control. "
        "You help startup founders expand across ASEAN. Explain, don't overwhelm. Guide, don't confuse. "
        "Take one step at a time.\n"
        "Rules:\n"
        f"- {lang_rule} Keep official names (agencies, laws) in their original form.\n"
        "- Your reply is read aloud: plain short sentences, no markdown, no bullet lists, no URLs, under 90 words.\n"
        "- Use the founder context so you never ask for details you already have.\n"
        "- For regulatory facts use ONLY the SOURCE RECORDS and put their ids in citations. If they don't cover it, say it needs checking with the authority.\n"
        "- You give guidance, not legal, tax or immigration advice. Suggest a professional when judgement is needed.\n"
        "- If the founder seems stressed, reassure them briefly, then give the single next step.\n"
        "- If OPEN ITEMS exist and the founder asks what to do, start from the first one.\n"
        "- Choose at most one action when the founder asks you to do something (show, open, compare, save, check progress). Otherwise action.type is none.\n"
        f"ACTIONS: {json.dumps(ACTIONS)}\n\n"
        f"CURRENT PAGE: {body.page or 'unknown'}\n"
        f"FOUNDER CONTEXT: {json.dumps(ctx, ensure_ascii=False)}\n"
        f"ECOSYSTEM ITEMS: {json.dumps(eco, ensure_ascii=False)}\n"
        f"SOURCE RECORDS: {json.dumps(slim, ensure_ascii=False)}\n\n"
        f"CONVERSATION SO FAR:\n{history or '(none)'}\n\nFOUNDER: {body.message}"
    )


@router.get("/companion/languages")
def languages():
    return {"languages": LANGUAGES}


@router.post("/companion/chat")
def chat(body: ChatIn, session: Session = Depends(get_session)):
    if not body.message.strip():
        raise HTTPException(422, "Say or type a question first.")
    ctx = _context(session, body.mission_id, body.founder_id)
    target = ctx["mission"]["target"] if ctx["mission"] else None
    origin = ctx["mission"]["origin"] if ctx["mission"] else None
    countries = {c for c in (target, origin) if c} | {"ASEAN"}
    pool = [r for r in catalog.regulatory() if not ctx["mission"] or r["country"] in countries]
    q = " ".join([body.message] + [t.text for t in body.history[-2:] if t.role == "user"])
    records = [r for r, s in rank(q, pool, 6) if s > 0]
    eco = _eco_items(target)

    out, meta = get_gemma().generate_json(
        _prompt(body, ctx, records, eco),
        CompanionLLM,
        fallback=lambda: _fallback(body.message, ctx, records, eco),
        fast=True,
    )
    allowed = {r["id"] for r in records} | {i["record_id"] for i in ctx["open_items"]}
    action = _validate_action(out.action, {i["id"] for i in eco})
    return {
        "reply": out.reply,
        "language": out.language if out.language in LANGUAGES else "en",
        "next_step": out.next_step,
        "citations": cite([c for c in out.citations if c in allowed]),
        "action": action.model_dump(),
        "suggestions": out.suggestions[:3],
        "meta": meta.as_dict(),
    }


@router.get("/companion/brief")
def brief(mission_id: str | None = None, founder_id: str | None = None, session: Session = Depends(get_session)):
    """Proactive guidance: what needs attention right now. Deterministic, no model call."""
    ctx = _context(session, mission_id, founder_id)
    nudges = []
    if not ctx["founder"]:
        nudges.append({"kind": "start", "text": "Start by building your Founder DNA so I can tailor everything to you.", "page": "onboard"})
    elif not ctx["mission"]:
        nudges.append({"kind": "start", "text": "Set a target market and goal so I can build your Launch Passport.", "page": "mission"})
    elif not ctx["status_counts"]:
        nudges.append({"kind": "start", "text": "Generate your Launch Passport to see which requirements apply.", "page": "passport"})
    else:
        sc = ctx["status_counts"]
        if sc.get("information_missing"):
            n = sc["information_missing"]
            nudges.append({"kind": "missing", "text": f"{n} requirement{'s' if n > 1 else ''} need details from you before they can be assessed.", "page": "gaps"})
        if sc.get("professional_review_required"):
            n = sc["professional_review_required"]
            nudges.append({"kind": "review", "text": f"{n} item{'s' if n > 1 else ''} should be confirmed by a local professional.", "page": "desk"})
        if ctx["open_items"]:
            nudges.append({"kind": "next", "text": f"Next step: {ctx['open_items'][0]['next_action']}", "page": "roadmap"})
        pending = [r for r in ctx["referrals"] if r["status"] in ("documents_requested", "follow_up_required")]
        if pending:
            nudges.append({"kind": "followup", "text": f"{len(pending)} referral{'s need' if len(pending) > 1 else ' needs'} your follow-up.", "page": "desk"})
    radar = [r for r in catalog.ecosystem()["radar"] if ctx["mission"] and r["country"] == ctx["mission"]["target"]]
    if radar:
        nudges.append({"kind": "radar", "text": "A monitored regulation in your target market changed recently.", "page": "radar"})
    return {"nudges": nudges[:4], "has_mission": bool(ctx["mission"])}


@router.post("/companion/document")
async def explain_document(
    file: UploadFile = File(...),
    question: str = Form(default=""),
    language: str = Form(default="en"),
    mission_id: str | None = Form(default=None),
    session: Session = Depends(get_session),
):
    data = await file.read()
    if len(data) > 4 * 1024 * 1024:
        raise HTTPException(413, "Documents are limited to 4 MB.")
    doc = ingest([(file.filename or "document", file.content_type or "", data)])
    if not doc.text_blocks and not doc.images:
        raise HTTPException(422, " ".join(doc.warnings) or "I couldn't read that file. Try a PDF, image or text file.")
    ctx = _context(session, mission_id, None)
    lang = LANGUAGES.get(language, "the language of the document")
    prompt = (
        "You are Mission Companion. Explain this government document, form, funding requirement or regulatory guideline "
        "to a startup founder in plain language. Extract key requirements, deadlines, documents needed and named authorities "
        "exactly as stated; do not invent any. Say what it means for the founder's mission. "
        f"Write in {lang}. You give guidance, not legal advice.\n\n"
        f"FOUNDER QUESTION: {question or 'What does this document mean for me?'}\n"
        f"FOUNDER CONTEXT: {ctx}\n\nDOCUMENT TEXT:\n{doc.combined_text or '(see image)'}"
    )

    def fallback() -> DocExplainLLM:
        text = doc.combined_text
        first = " ".join(text.split()[:60]) if text else "This looks like an image of a document."
        return DocExplainLLM(
            summary=f"Here's the start of the document: {first}... Connect Gemma 4 for a full plain-language explanation.",
            next_step="Read the original document and confirm the details with the issuing authority.",
        )

    out, meta = get_gemma().generate_json(prompt, DocExplainLLM, fallback=fallback, images=doc.images)
    return {"explanation": out.model_dump(), "filename": file.filename, "original_excerpt": doc.combined_text[:1500], "meta": meta.as_dict()}
