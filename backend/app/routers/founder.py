import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session, select

from app.db import get_session
from app.llm import prompts, rules
from app.llm.gemma import get_gemma
from app.llm.scanner import read_uploads
from app.models import Founder, Mission
from app.schemas import FounderDNA, MissionIn
from app.services import get_founder

router = APIRouter(tags=["founder"])

MAX_UPLOAD_BYTES = 4 * 1024 * 1024  # Vercel function body limit is 4.5 MB


@router.post("/founder/extract")
async def extract_founder(
    files: list[UploadFile] = File(default=[]),
    notes: str = Form(default=""),
    session: Session = Depends(get_session),
):
    started = time.monotonic()
    payload = []
    total = 0
    for f in files:
        data = await f.read()
        total += len(data)
        payload.append((f.filename or "upload", f.content_type or "", data))
    if total > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Uploads are limited to 4 MB in total. Compress images or upload fewer pages.")
    if not payload and not notes.strip():
        raise HTTPException(422, "Add at least one file or a short description of your startup.")

    # Gemini scans the files into text; Gemma 4 builds the profile from it.
    up = read_uploads(payload)
    text = "\n\n".join(filter(None, [notes.strip(), up.text]))
    if not text.strip() and not up.images:
        raise HTTPException(422, " ".join(up.warnings) or "None of the files could be read. Try PDF, Word, PowerPoint or an image.")
    dna, meta = get_gemma().generate_json(
        prompts.founder_dna(text, len(up.images), scanned=bool(up.scan_model)),
        FounderDNA,
        fallback=lambda: rules.founder_dna(text),
        images=up.images,
        started=started,
    )
    if meta.source != "gemma" and not text.strip():
        # Images can only be read by a model; don't invent a profile from nothing.
        raise HTTPException(
            503,
            "Gemma 4 couldn't read your images just now (the model is busy). Try again in a minute, "
            "or add a short description of your startup in the text box.",
        )
    meta.scan_model = up.scan_model
    meta.notes.extend(up.warnings)
    founder = Founder(
        company_name=dna.company_name,
        dna=dna.model_dump(),
        # Keep what the files actually said so later steps (passport, discover, companion) can use it.
        meta={**meta.as_dict(), "files": up.filenames, "image_count": len(up.images), "source_excerpt": text[:6000]},
    )
    session.add(founder)
    session.commit()
    session.refresh(founder)
    return {"founder_id": founder.id, "dna": founder.dna, "meta": founder.meta}


@router.post("/founder/sample")
def sample_founder(session: Session = Depends(get_session)):
    """Load the demo healthtech founder without uploading anything."""
    from app import catalog

    text = catalog.ecosystem()["sample_founder_text"]
    dna, meta = get_gemma().generate_json(prompts.founder_dna(text, 0), FounderDNA, fallback=lambda: rules.founder_dna(text))
    founder = Founder(
        company_name=dna.company_name,
        dna=dna.model_dump(),
        meta={**meta.as_dict(), "files": ["sample profile"], "image_count": 0, "source_excerpt": text},
    )
    session.add(founder)
    session.commit()
    session.refresh(founder)
    return {"founder_id": founder.id, "dna": founder.dna, "meta": founder.meta}


@router.get("/founder/{founder_id}")
def read_founder(founder_id: str, session: Session = Depends(get_session)):
    f = get_founder(session, founder_id)
    missions = session.exec(select(Mission).where(Mission.founder_id == founder_id)).all()
    return {"founder_id": f.id, "dna": f.dna, "meta": f.meta, "missions": [m.model_dump() for m in missions]}


@router.patch("/founder/{founder_id}")
def update_founder(founder_id: str, dna: FounderDNA, session: Session = Depends(get_session)):
    f = get_founder(session, founder_id)
    f.dna = dna.model_dump()
    f.company_name = dna.company_name
    session.add(f)
    session.commit()
    return {"founder_id": f.id, "dna": f.dna, "meta": f.meta}


@router.post("/mission")
def create_mission(body: MissionIn, session: Session = Depends(get_session)):
    f = get_founder(session, body.founder_id)
    if not body.objective.strip():
        raise HTTPException(422, "Describe what you want to achieve in the target market.")
    m = Mission(
        founder_id=f.id,
        origin=(body.origin or f.dna.get("origin_country") or "MY").upper(),
        target=body.target.upper(),
        objective=body.objective.strip(),
        sector=f.dna.get("sector") or "all",
    )
    session.add(m)
    session.commit()
    session.refresh(m)
    return m.model_dump()


@router.get("/mission/{mission_id}")
def read_mission(mission_id: str, session: Session = Depends(get_session)):
    from app.services import get_mission

    m = get_mission(session, mission_id)
    f = get_founder(session, m.founder_id)
    return {"mission": m.model_dump(), "founder": {"founder_id": f.id, "dna": f.dna, "meta": f.meta}}
