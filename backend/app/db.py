from collections.abc import Iterator

from sqlalchemy.pool import NullPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

_settings = get_settings()
_url = _settings.resolved_database_url

if _url.startswith("sqlite"):
    engine = create_engine(_url, connect_args={"check_same_thread": False})
else:
    # Supabase transaction pooler (pgBouncer): no client-side pool, no prepared statements.
    engine = create_engine(_url, poolclass=NullPool, connect_args={"prepare_threshold": None})


def init_db() -> None:
    from app import models  # noqa: F401  register tables

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
