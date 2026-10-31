import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env"],
        extra="ignore",
    )

    gemini_api_key: str = ""
    # Gemma 4 26B A4B is a mixture-of-experts model: ~4B parameters active per token, so it
    # answers several times faster than the dense 31B with close to the same quality.
    # Set blank to auto-select (still prefers the MoE model), or pin another Gemma 4 id.
    gemma_model: str = "gemma-4-26b-a4b-it"
    # Per-attempt timeout for Gemma calls; on timeout the next Gemma 4 model is tried.
    gemma_timeout_ms: int = 30_000
    # Wall-clock budget for one structured answer (all attempts + repair). Well under the
    # 60 s Vercel function limit, leaving room for a cold start and the database, so a slow
    # model returns the rule-based result instead of a 504.
    gemma_budget_ms: int = 40_000
    gemma_fast_timeout_ms: int = 20_000
    # Gemma 4's thinking step roughly triples latency; off (minimal) by default.
    gemma_thinking: bool = False
    # Gemma 4 thinks before answering and thinking tokens count against this budget.
    gemma_max_output_tokens: int = 8192
    # Gemini model that scans uploaded files into text before Gemma reasons over them.
    # Empty = no scanning; Gemma reads the files directly.
    gemini_scan_model: str = "gemini-2.5-flash"
    gemini_scan_timeout_ms: int = 30_000
    # Force canned demo responses even when a key is present.
    demo_mode: bool = False
    # Supabase Postgres (transaction pooler, port 6543) in production.
    # Empty = local SQLite file for development.
    database_url: str = ""
    cors_origins: str = "*"

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
