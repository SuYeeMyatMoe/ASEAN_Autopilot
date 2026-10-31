import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import catalog
from app.config import get_settings
from app.db import init_db
from app.llm.gemma import get_gemma
from app.routers import companion, desk, discover, founder, passport, twin

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
        "database": "postgres" if settings.resolved_database_url.startswith("postgresql") else "sqlite",
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


for r in (founder.router, passport.router, discover.router, desk.router, twin.router, companion.router):
    api.include_router(r)
app.include_router(api)
