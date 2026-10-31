import logging
import os
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import catalog
from app.config import get_settings
from app.db import init_db
from app.llm.gemma import get_gemma
from app.routers import companion, desk, discover, founder, passport, restore, twin

logging.basicConfig(level=logging.INFO)
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="ASEAN Mission Control API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")


@api.get("/health")
def health():
    gemma = get_gemma()
    model, error = None, None
    if gemma.live:
        try:
            model = gemma.model
        except Exception as exc:
            error = str(exc)[:200]
    return {
        "ok": True,
        "mode": "live" if gemma.live else "demo",
        "model": model,
        "model_error": error,
        # Gemini scans uploads into text; Gemma 4 does the reasoning.
        "scan_model": (settings.gemini_scan_model or None) if gemma.live else None,
        "database": "postgres" if settings.resolved_database_url.startswith("postgresql") else "sqlite",
        # False on Vercel without DATABASE_URL: SQLite in /tmp is per instance and wiped on deploy.
        "persistent": not (settings.resolved_database_url.startswith("sqlite") and bool(os.environ.get("VERCEL"))),
        # Which commit is live, so a deploy can be confirmed from the browser.
        "build": (os.environ.get("VERCEL_GIT_COMMIT_SHA") or "local")[:7],
        "gemma_budget_ms": settings.gemma_budget_ms,
    }


@api.get("/meta")
def meta():
    return {"countries": catalog.COUNTRIES, "areas": catalog.AREAS}


@api.get("/models")
def list_models():
    gemma = get_gemma()
    if not gemma.live:
        return {"models": [], "note": "Set GEMINI_API_KEY to list Gemma 4 models."}
    return {"models": gemma.discover_models(), "selected": gemma.model}


for r in (founder.router, passport.router, discover.router, desk.router, twin.router, companion.router, restore.router):
    api.include_router(r)
app.include_router(api)
