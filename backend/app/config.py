import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    gemini_api_key: str = ""
    # Leave blank to auto-select the best available Gemma 4 model for the key.
    gemma_model: str = ""
    # Per-request timeout for Gemma calls; on timeout the rule-based fallback is used.
    gemma_timeout_ms: int = 40_000
    gemma_fast_timeout_ms: int = 20_000
    # Gemma 4 thinks before answering and thinking tokens count against this budget.
    gemma_max_output_tokens: int = 8192
    # Force canned demo responses even when a key is present.
    demo_mode: bool = False
    # Supabase Postgres (transaction pooler, port 6543) in production.
    # Empty = local SQLite file for development.
    database_url: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def resolved_database_url(self) -> str:
        url = self.database_url
        if not url:
            # Vercel functions have a read-only filesystem except /tmp (data won't persist there).
            folder = Path("/tmp") if os.environ.get("VERCEL") else BACKEND_DIR
            return f"sqlite:///{(folder / 'mission_control.db').as_posix()}"
        # Supabase hands out postgres:// or postgresql:// URLs; pin the psycopg 3 driver.
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix) :]
        return url

    @property
    def live(self) -> bool:
        return bool(self.gemini_api_key) and not self.demo_mode


@lru_cache
def get_settings() -> Settings:
    return Settings()
