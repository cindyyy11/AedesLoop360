import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

ROOT = Path(__file__).resolve().parents[3]
URL = os.environ.get("AEDES_DATABASE_URL", f"sqlite:///{ROOT / 'aedes.db'}")
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
