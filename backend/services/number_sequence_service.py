from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.dialects.postgresql import insert as pg_insert

from models_sql import NumberSequenceRecord


def _resolve_session_factory(db: Any):
    getter = getattr(db, "get_session_factory", None)
    if callable(getter):
        session_factory = getter()
        if session_factory is not None:
            return session_factory

    raw_getter = getattr(db, "get_raw_db", None)
    if callable(raw_getter):
        try:
            raw_db = raw_getter()
            getter = getattr(raw_db, "get_session_factory", None)
            if callable(getter):
                session_factory = getter()
                if session_factory is not None:
                    return session_factory
        except Exception:
            return None
    return None


async def next_sequence_value(
    db: Any,
    *,
    sequence_key: str,
    start_at: int = 1,
    step: int = 1,
) -> Optional[int]:
    """
    Atomically increments and returns next number for a sequence key in PostgreSQL.
    Returns None when no SQL session is available (caller should fallback).
    """
    session_factory = _resolve_session_factory(db)
    if session_factory is None:
        return None

    now = datetime.now(timezone.utc)
    normalized_start = max(int(start_at), 0)
    normalized_step = max(int(step), 1)

    stmt = (
        pg_insert(NumberSequenceRecord)
        .values(
            sequence_key=str(sequence_key),
            last_value=normalized_start,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_update(
            index_elements=[NumberSequenceRecord.sequence_key],
            set_={
                "last_value": NumberSequenceRecord.last_value + normalized_step,
                "updated_at": now,
            },
        )
        .returning(NumberSequenceRecord.last_value)
    )

    async with session_factory() as session:
        next_value = await session.scalar(stmt)
        await session.commit()
        if next_value is None:
            return None
        return int(next_value)

