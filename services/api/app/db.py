import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def _resolve_root() -> Path:
    """Prefer the monorepo root; fall back to services/api when fixtures were copied for Vercel."""
    api_root = Path(__file__).resolve().parents[1]
    repo_root = Path(__file__).resolve().parents[3]
    for candidate in (repo_root, api_root):
        if (candidate / "fixtures" / "four_block_scenario.json").is_file():
            return candidate
    return repo_root


def _default_database_url(root: Path) -> str:
    # Vercel functions have an ephemeral writable filesystem under /tmp only.
    if os.environ.get("VERCEL") == "1":
        return "sqlite:////tmp/aedes-vercel.db"
    return f"sqlite:///{root / 'aedes.db'}"


ROOT = _resolve_root()
URL = os.environ.get("AEDES_DATABASE_URL", _default_database_url(ROOT))
engine = create_engine(
    URL,
    **({"connect_args": {"check_same_thread": False}} if URL.startswith("sqlite") else {}),
)


if URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def configure_sqlite(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=10000")


SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def uid() -> str:
    return str(uuid4())


def now() -> datetime:
    return datetime.now(timezone.utc)


def session():
    with SessionLocal() as db:
        yield db
