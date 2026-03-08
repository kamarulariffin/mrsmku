#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from models_sql.core_documents import CoreDocument


CORE_COLLECTIONS = [
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


async def _get_pg_docs(session_factory, collection_name: str) -> List[Dict[str, Any]]:
    async with session_factory() as session:
        rows = await session.scalars(
            select(CoreDocument).where(CoreDocument.collection_name == collection_name)
        )
        out = []
        for row in rows.all():
            d = dict(row.document or {})
            d["_id"] = row.document_id
            out.append(d)
        return out


def _sum_field(docs: List[Dict[str, Any]], field: str) -> float:
    total = 0.0
    for d in docs:
        try:
            total += float(d.get(field, 0) or 0)
        except Exception:
            pass
    return round(total, 2)


async def main() -> None:
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

    try:
        report: Dict[str, Any] = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "collections": {},
            "checks": {},
            "ok": True,
        }

        for collection_name in CORE_COLLECTIONS:
            mongo_count = await mongo_db[collection_name].count_documents({})
            pg_docs = await _get_pg_docs(session_factory, collection_name)
            pg_count = len(pg_docs)
            report["collections"][collection_name] = {
                "mongo_count": mongo_count,
                "postgres_count": pg_count,
                "count_match": mongo_count == pg_count,
            }
            if mongo_count != pg_count:
                report["ok"] = False

        mongo_payments = await mongo_db["payments"].find({}).to_list(500000)
        pg_payments = await _get_pg_docs(session_factory, "payments")
        report["checks"]["payments_amount_sum"] = {
            "mongo": _sum_field(mongo_payments, "amount"),
            "postgres": _sum_field(pg_payments, "amount"),
        }
        if report["checks"]["payments_amount_sum"]["mongo"] != report["checks"]["payments_amount_sum"]["postgres"]:
            report["ok"] = False

        mongo_yuran = await mongo_db["student_yuran"].find({}).to_list(500000)
        pg_yuran = await _get_pg_docs(session_factory, "student_yuran")
        report["checks"]["student_yuran_total_amount_sum"] = {
            "mongo": _sum_field(mongo_yuran, "total_amount"),
            "postgres": _sum_field(pg_yuran, "total_amount"),
        }
        report["checks"]["student_yuran_paid_amount_sum"] = {
            "mongo": _sum_field(mongo_yuran, "paid_amount"),
            "postgres": _sum_field(pg_yuran, "paid_amount"),
        }
        if (
            report["checks"]["student_yuran_total_amount_sum"]["mongo"]
            != report["checks"]["student_yuran_total_amount_sum"]["postgres"]
        ):
            report["ok"] = False
        if (
            report["checks"]["student_yuran_paid_amount_sum"]["mongo"]
            != report["checks"]["student_yuran_paid_amount_sum"]["postgres"]
        ):
            report["ok"] = False

        mongo_yuran_payments = await mongo_db["yuran_payments"].find({}).to_list(500000)
        pg_yuran_payments = await _get_pg_docs(session_factory, "yuran_payments")
        report["checks"]["yuran_payments_amount_sum"] = {
            "mongo": _sum_field(mongo_yuran_payments, "amount"),
            "postgres": _sum_field(pg_yuran_payments, "amount"),
        }
        if (
            report["checks"]["yuran_payments_amount_sum"]["mongo"]
            != report["checks"]["yuran_payments_amount_sum"]["postgres"]
        ):
            report["ok"] = False

        mongo_accounting_transactions = await mongo_db["accounting_transactions"].find({}).to_list(500000)
        pg_accounting_transactions = await _get_pg_docs(session_factory, "accounting_transactions")
        report["checks"]["accounting_transactions_amount_sum"] = {
            "mongo": _sum_field(mongo_accounting_transactions, "amount"),
            "postgres": _sum_field(pg_accounting_transactions, "amount"),
        }
        if (
            report["checks"]["accounting_transactions_amount_sum"]["mongo"]
            != report["checks"]["accounting_transactions_amount_sum"]["postgres"]
        ):
            report["ok"] = False

        mongo_tabung_donations = await mongo_db["tabung_donations"].find({}).to_list(500000)
        pg_tabung_donations = await _get_pg_docs(session_factory, "tabung_donations")
        report["checks"]["tabung_donations_amount_sum"] = {
            "mongo": _sum_field(mongo_tabung_donations, "amount"),
            "postgres": _sum_field(pg_tabung_donations, "amount"),
        }
        if (
            report["checks"]["tabung_donations_amount_sum"]["mongo"]
            != report["checks"]["tabung_donations_amount_sum"]["postgres"]
        ):
            report["ok"] = False

        mongo_financial_ledger = await mongo_db["financial_ledger"].find({}).to_list(500000)
        pg_financial_ledger = await _get_pg_docs(session_factory, "financial_ledger")
        report["checks"]["financial_ledger_amount_sum"] = {
            "mongo": _sum_field(mongo_financial_ledger, "amount"),
            "postgres": _sum_field(pg_financial_ledger, "amount"),
        }
        if (
            report["checks"]["financial_ledger_amount_sum"]["mongo"]
            != report["checks"]["financial_ledger_amount_sum"]["postgres"]
        ):
            report["ok"] = False

        print(json.dumps(report, ensure_ascii=True, indent=2))
        if not report["ok"]:
            raise SystemExit(1)
    finally:
        mongo_client.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

