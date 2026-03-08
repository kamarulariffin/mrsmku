#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List

from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from models_sql import Base
from models_sql.core_documents import CoreDocument


DEFAULT_COLLECTIONS = [
    "users",
    "students",
    "student_yuran",
    "set_yuran",
    "yuran_payments",
    "payments",
    "notifications",
    "audit_logs",
    "password_reset_tokens",
    "settings",
    "accounting_categories",
    "accounting_transactions",
    "accounting_audit_logs",
    "accounting_period_locks",
    "accounting_journal_entries",
    "accounting_journal_lines",
    "tabung_campaigns",
    "tabung_donations",
    "financial_ledger",
    "payment_reminders",
    "payment_reminder_preferences",
]


def _to_async_url(url: str) -> str:
    if url.startswith("postgresql+psycopg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def _normalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize(v) for v in value]
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


async def _upsert_collection(
    *,
    mongo_db,
    session_factory: async_sessionmaker,
    collection_name: str,
    truncate: bool,
    dry_run: bool,
) -> Dict[str, int]:
    if truncate and not dry_run:
        async with session_factory() as session:
            await session.execute(
                CoreDocument.__table__.delete().where(CoreDocument.collection_name == collection_name)
            )
            await session.commit()

    docs: List[Dict[str, Any]] = await mongo_db[collection_name].find({}).to_list(500000)
    inserted = 0
    updated = 0

    if dry_run:
        return {"source_count": len(docs), "inserted": 0, "updated": 0}

    async with session_factory() as session:
        for doc in docs:
            doc_id = str(doc.get("_id"))
            payload = _normalize(doc)
            payload.pop("_id", None)

            existing = await session.get(
                CoreDocument,
                {"collection_name": collection_name, "document_id": doc_id},
            )
            if existing is None:
                session.add(
                    CoreDocument(
                        collection_name=collection_name,
                        document_id=doc_id,
                        document=payload,
                    )
                )
                inserted += 1
            else:
                existing.document = payload
                updated += 1
        await session.commit()

    return {"source_count": len(docs), "inserted": inserted, "updated": updated}


async def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate core collections from MongoDB to PostgreSQL core_documents.")
    parser.add_argument("--truncate", action="store_true", help="Truncate target collection data before import.")
    parser.add_argument("--dry-run", action="store_true", help="Show source counts without writing to PostgreSQL.")
    parser.add_argument(
        "--collections",
        nargs="+",
        default=DEFAULT_COLLECTIONS,
        help=f"Collections to migrate (default: {' '.join(DEFAULT_COLLECTIONS)})",
    )
    args = parser.parse_args()

    load_dotenv()
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "mrsm_portal")
    database_url = _to_async_url(
        os.environ.get("DATABASE_URL", "postgresql+psycopg://kamarulariffin@localhost:5432/mrsm_portal")
    )

    mongo_client = AsyncIOMotorClient(mongo_url)
    mongo_db = mongo_client[db_name]

    engine = create_async_engine(database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        print(f"MongoDB: {mongo_url}/{db_name}")
        print(f"PostgreSQL: {database_url}")
        print(f"Collections: {', '.join(args.collections)}")
        print(f"Mode: {'dry-run' if args.dry_run else 'write'}")
        summary = {}
        for col in args.collections:
            res = await _upsert_collection(
                mongo_db=mongo_db,
                session_factory=session_factory,
                collection_name=col,
                truncate=args.truncate,
                dry_run=args.dry_run,
            )
            summary[col] = res
            print(
                f"[{col}] source={res['source_count']} inserted={res['inserted']} updated={res['updated']}"
            )
        print("Migration done.")
        print(summary)
    finally:
        mongo_client.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

