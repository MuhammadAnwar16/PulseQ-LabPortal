"""Database engine + session factory (SQLAlchemy 2-style, sync)."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Declarative base shared by every model."""


connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    # Allow SQLite to be used from FastAPI's threadpool without
    # "SQLite objects created in a thread can only be used in that same thread".
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


import time
import logging
from sqlalchemy import event
from sqlalchemy.engine import Engine

logger = logging.getLogger("pulseq.database")


@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    context._query_start_time = time.time()


@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    total_time = time.time() - context._query_start_time
    duration_ms = total_time * 1000
    if duration_ms > 100:
        logger.warning(f"Slow query detected ({duration_ms:.2f}ms): {statement} | Params: {parameters}")


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a scoped session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables. Import models so they register on Base.metadata."""
    from app import db_models  # noqa: F401  (ensures tables are registered)

    Base.metadata.create_all(bind=engine)
