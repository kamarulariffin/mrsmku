from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from db.config import DATABASE_URL, is_postgres_mode
from models_sql import Base
from repositories.chatbox_relational_store import bootstrap_relational_chatbox_tables
from repositories.notifications_relational_store import bootstrap_relational_notification_tables
from repositories.pwa_relational_store import bootstrap_relational_pwa_tables
from repositories.tabung_relational_store import bootstrap_relational_tabung_tables
from repositories.yuran_relational_store import bootstrap_relational_yuran_tables

logger = logging.getLogger(__name__)

_engine = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def _to_async_url(url: str) -> str:
    if url.startswith("postgresql+psycopg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


async def init_postgres() -> None:
    global _engine, _session_factory

    if _session_factory is not None:
        return
    if not is_postgres_mode():
        return

    async_url = _to_async_url(DATABASE_URL)
    _engine = create_async_engine(async_url, pool_pre_ping=True)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False, autoflush=False)

    # Base schema for phased core migration storage.
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Keep existing migrated documents usable after introducing typed relational tables.
    await bootstrap_relational_yuran_tables(_session_factory)
    await bootstrap_relational_tabung_tables(_session_factory)
    await bootstrap_relational_pwa_tables(_session_factory)
    await bootstrap_relational_chatbox_tables(_session_factory)
    await bootstrap_relational_notification_tables(_session_factory)

    logger.info("PostgreSQL initialized for DB_ENGINE=%s", DATABASE_URL)


async def close_postgres() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


def get_session_factory() -> Optional[async_sessionmaker[AsyncSession]]:
    return _session_factory

