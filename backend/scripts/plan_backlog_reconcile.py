#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from decimal import Decimal, ROUND_DOWN
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from models_sql.core_documents import CoreDocument


DEFAULT_COLLECTIONS = [
    "marketplace_settings",
    "koperasi_settings",
    "hostel_pbw_pbp_periods",
    "olat_categories",
    "vendors",
    "settings",
    "accounting_transactions",
    "financial_years",
    "accounting_categories",
    "bank_accounts",
    "chatbox_faq",
    "pwa_device_tokens",
]

_DATETIME_FIELDS = {
    "created_at",
    "updated_at",
    "expires_at",
    "verified_at",
    "performed_at",
    "last_payment_date",
    "start_date",
    "end_date",
    "due_date",
    "paid_at",
    "approved_at",
    "submitted_at",
    "reviewed_at",
    "last_seen",
}


def _to_async_url(url: str) -> str:
    if url.startswith("postgresql+psycopg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def _canonical_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    millis = int((Decimal(value.microsecond) / Decimal(1000)).to_integral_value(rounding=ROUND_DOWN))
    value = value.replace(microsecond=millis * 1000)
    return value.isoformat().replace("+00:00", "Z")


def _normalize(value: Any, *, key_hint: str = "") -> Any:
    if isinstance(value, dict):
        return {k: _normalize(v, key_hint=str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize(v, key_hint=key_hint) for v in value]
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return _canonical_datetime(value)
    if isinstance(value, str) and (key_hint in _DATETIME_FIELDS or key_hint.endswith("_at")):
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
            return _canonical_datetime(parsed)
        except ValueError:
            return value
    return value


def _normalize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = _normalize(doc)
    out["_id"] = str(out.get("_id"))
    return out


def _payload_signature(doc: Dict[str, Any]) -> str:
    payload = {k: v for k, v in doc.items() if k != "_id"}
    return json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


async def _fetch_mongo_docs(mongo_db, collection_name: str, max_docs: int) -> Dict[str, Dict[str, Any]]:
    docs = await mongo_db[collection_name].find({}).to_list(max_docs)
    out: Dict[str, Dict[str, Any]] = {}
    for doc in docs:
        normalized = _normalize_doc(doc)
        out[normalized["_id"]] = normalized
    return out


async def _fetch_pg_docs(
    session_factory: async_sessionmaker,
    collection_name: str,
) -> Dict[str, Dict[str, Any]]:
    async with session_factory() as session:
        rows = await session.scalars(
            select(CoreDocument).where(CoreDocument.collection_name == collection_name)
        )
        out: Dict[str, Dict[str, Any]] = {}
        for row in rows.all():
            doc = dict(row.document or {})
            doc["_id"] = row.document_id
            normalized = _normalize_doc(doc)
            out[normalized["_id"]] = normalized
        return out


def _classify(
    missing_in_postgres: int,
    missing_in_mongo: int,
    changed: int,
) -> str:
    if missing_in_postgres == 0 and missing_in_mongo == 0 and changed == 0:
        return "aligned"
    if missing_in_postgres > 0 and missing_in_mongo == 0 and changed == 0:
        return "mongo_ahead"
    if missing_in_mongo > 0 and missing_in_postgres == 0 and changed == 0:
        return "postgres_ahead"
    if missing_in_postgres > 0 and missing_in_mongo > 0 and changed == 0:
        return "id_drift"
    return "content_drift"


def _recommendation(classification: str) -> Dict[str, str]:
    if classification == "aligned":
        return {
            "cutover_postgres": "No action needed.",
            "hybrid_optional": "No action needed.",
        }
    if classification == "mongo_ahead":
        return {
            "cutover_postgres": "Sync Mongo -> Postgres (upsert), then re-run parity.",
            "hybrid_optional": "Optional: also sync Postgres -> Mongo after cutover checkpoint.",
        }
    if classification == "postgres_ahead":
        return {
            "cutover_postgres": "Likely acceptable for postgres cutover; review origin of postgres-only writes.",
            "hybrid_optional": "Sync Postgres -> Mongo if hybrid parity is required.",
        }
    if classification == "id_drift":
        return {
            "cutover_postgres": "Manual review required before pruning; choose source-of-truth for this collection.",
            "hybrid_optional": "Avoid auto-reconcile with prune until IDs are validated.",
        }
    return {
        "cutover_postgres": "Manual review required; changed payload detected on same IDs.",
        "hybrid_optional": "Choose source side explicitly before execute.",
    }


def _build_reconcile_command(source: str, collections: List[str]) -> str:
    if not collections:
        return ""
    args = " ".join(collections)
    return f"./venv/bin/python scripts/reconcile_core_divergence.py --source {source} --collections {args}"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Classify Mongo/Postgres divergence and suggest reconcile direction per collection."
    )
    parser.add_argument(
        "--collections",
        nargs="+",
        default=DEFAULT_COLLECTIONS,
        help=f"Collections to inspect (default: {' '.join(DEFAULT_COLLECTIONS)})",
    )
    parser.add_argument(
        "--max-docs",
        type=int,
        default=500000,
        help="Max docs fetched per Mongo collection (default: 500000).",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default="",
        help="Optional path to write JSON report.",
    )
    return parser.parse_args()


async def main() -> None:
    args = _parse_args()
    collections = list(dict.fromkeys(args.collections))

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

    report: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "collections": {},
        "summary": {
            "aligned": 0,
            "mongo_ahead": 0,
            "postgres_ahead": 0,
            "id_drift": 0,
            "content_drift": 0,
        },
        "command_suggestions": {},
    }

    mongo_to_postgres: List[str] = []
    postgres_to_mongo: List[str] = []
    manual_review: List[str] = []

    try:
        for collection_name in collections:
            mongo_docs = await _fetch_mongo_docs(mongo_db, collection_name, args.max_docs)
            pg_docs = await _fetch_pg_docs(session_factory, collection_name)

            mongo_ids = set(mongo_docs.keys())
            pg_ids = set(pg_docs.keys())

            missing_in_postgres = sorted(mongo_ids - pg_ids)
            missing_in_mongo = sorted(pg_ids - mongo_ids)
            changed_ids = sorted(
                doc_id
                for doc_id in (mongo_ids & pg_ids)
                if _payload_signature(mongo_docs[doc_id]) != _payload_signature(pg_docs[doc_id])
            )

            classification = _classify(
                missing_in_postgres=len(missing_in_postgres),
                missing_in_mongo=len(missing_in_mongo),
                changed=len(changed_ids),
            )
            recommendation = _recommendation(classification)

            if classification in {"mongo_ahead", "content_drift"}:
                mongo_to_postgres.append(collection_name)
            if classification in {"postgres_ahead", "content_drift"}:
                postgres_to_mongo.append(collection_name)
            if classification in {"id_drift", "content_drift"}:
                manual_review.append(collection_name)

            report["collections"][collection_name] = {
                "mongo_count": len(mongo_docs),
                "postgres_count": len(pg_docs),
                "missing_in_postgres_count": len(missing_in_postgres),
                "missing_in_mongo_count": len(missing_in_mongo),
                "changed_count": len(changed_ids),
                "classification": classification,
                "recommendation": recommendation,
                "sample_ids": {
                    "missing_in_postgres": missing_in_postgres[:10],
                    "missing_in_mongo": missing_in_mongo[:10],
                    "changed": changed_ids[:10],
                },
            }
            report["summary"][classification] += 1

        report["command_suggestions"] = {
            "dry_run_mongo_to_postgres": _build_reconcile_command("mongo", mongo_to_postgres),
            "dry_run_postgres_to_mongo": _build_reconcile_command("postgres", postgres_to_mongo),
            "manual_review_collections": manual_review,
        }

        text = json.dumps(report, ensure_ascii=True, indent=2)
        print(text)

        if args.output_json:
            output_path = Path(args.output_json)
            if not output_path.is_absolute():
                output_path = PROJECT_ROOT / output_path
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(text + "\n", encoding="utf-8")
    finally:
        mongo_client.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
