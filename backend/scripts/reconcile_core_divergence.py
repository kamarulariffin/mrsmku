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
from typing import Any, Dict, List, Tuple

from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from models_sql.core_documents import CoreDocument


DEFAULT_COLLECTIONS = ["notifications", "audit_logs"]
_MONGO_DATETIME_FIELDS = {
    "created_at",
    "updated_at",
    "expires_at",
    "verified_at",
    "performed_at",
    "last_payment_date",
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
    if isinstance(value, str) and (key_hint in _MONGO_DATETIME_FIELDS or key_hint.endswith("_at")):
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
    if "_id" not in out:
        raise ValueError("Document missing _id")
    out["_id"] = str(out["_id"])
    return out


def _payload_signature(doc: Dict[str, Any]) -> str:
    payload = {k: v for k, v in doc.items() if k != "_id"}
    return json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def _to_mongo_id(value: str) -> Any:
    try:
        return ObjectId(value)
    except Exception:
        return value


def _deserialize_for_mongo(value: Any, *, key_hint: str = "") -> Any:
    if isinstance(value, dict):
        return {k: _deserialize_for_mongo(v, key_hint=k) for k, v in value.items()}
    if isinstance(value, list):
        return [_deserialize_for_mongo(v, key_hint=key_hint) for v in value]
    if isinstance(value, str) and (key_hint in _MONGO_DATETIME_FIELDS or key_hint.endswith("_at")):
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(raw)
        except ValueError:
            return value
    return value


def _to_mongo_doc(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for key, value in normalized_doc.items():
        if key == "_id":
            out["_id"] = _to_mongo_id(str(value))
            continue
        out[key] = _deserialize_for_mongo(value, key_hint=key)
    return out


async def _fetch_mongo_docs(
    mongo_db,
    collection_name: str,
    max_docs: int,
) -> Dict[str, Dict[str, Any]]:
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


async def _upsert_to_mongo(
    mongo_db,
    collection_name: str,
    docs: List[Dict[str, Any]],
) -> int:
    changed = 0
    for doc in docs:
        mongo_doc = _to_mongo_doc(doc)
        await mongo_db[collection_name].replace_one({"_id": mongo_doc["_id"]}, mongo_doc, upsert=True)
        changed += 1
    return changed


async def _delete_from_mongo(
    mongo_db,
    collection_name: str,
    ids: List[str],
) -> int:
    if not ids:
        return 0
    mongo_ids = [_to_mongo_id(v) for v in ids]
    result = await mongo_db[collection_name].delete_many({"_id": {"$in": mongo_ids}})
    return int(result.deleted_count or 0)


async def _upsert_to_postgres(
    session_factory: async_sessionmaker,
    collection_name: str,
    docs: List[Dict[str, Any]],
) -> int:
    changed = 0
    async with session_factory() as session:
        for doc in docs:
            payload = dict(doc)
            doc_id = str(payload.pop("_id"))
            row = await session.get(
                CoreDocument,
                {"collection_name": collection_name, "document_id": doc_id},
            )
            if row is None:
                session.add(
                    CoreDocument(
                        collection_name=collection_name,
                        document_id=doc_id,
                        document=payload,
                    )
                )
            else:
                row.document = payload
            changed += 1
        await session.commit()
    return changed


async def _delete_from_postgres(
    session_factory: async_sessionmaker,
    collection_name: str,
    ids: List[str],
) -> int:
    if not ids:
        return 0
    async with session_factory() as session:
        result = await session.execute(
            delete(CoreDocument).where(
                CoreDocument.collection_name == collection_name,
                CoreDocument.document_id.in_(ids),
            )
        )
        await session.commit()
        return int(result.rowcount or 0)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Reconcile collection-level divergence between MongoDB and PostgreSQL core_documents. "
            "Dry-run by default."
        )
    )
    parser.add_argument(
        "--collections",
        nargs="+",
        default=DEFAULT_COLLECTIONS,
        help=f"Collections to reconcile (default: {' '.join(DEFAULT_COLLECTIONS)})",
    )
    parser.add_argument(
        "--source",
        choices=["postgres", "mongo"],
        default="postgres",
        help="Authoritative source side for reconciliation (default: postgres).",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply writes to target side. Without this flag script only reports changes.",
    )
    parser.add_argument(
        "--prune-target",
        action="store_true",
        help="Also delete documents present only on target side.",
    )
    parser.add_argument(
        "--max-docs",
        type=int,
        default=500000,
        help="Max docs fetched per Mongo collection (default: 500000).",
    )
    return parser.parse_args()


async def main() -> None:
    args = _parse_args()

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

    source_side = args.source
    target_side = "mongo" if source_side == "postgres" else "postgres"

    report: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": source_side,
        "target": target_side,
        "mode": "execute" if args.execute else "dry-run",
        "prune_target": bool(args.prune_target),
        "collections": {},
        "summary": {
            "collections": 0,
            "missing_in_target": 0,
            "changed_in_target": 0,
            "extra_in_target": 0,
            "upserted": 0,
            "deleted": 0,
        },
    }

    try:
        for collection_name in args.collections:
            if source_side == "postgres":
                source_docs = await _fetch_pg_docs(session_factory, collection_name)
                target_docs = await _fetch_mongo_docs(mongo_db, collection_name, args.max_docs)
            else:
                source_docs = await _fetch_mongo_docs(mongo_db, collection_name, args.max_docs)
                target_docs = await _fetch_pg_docs(session_factory, collection_name)

            source_ids = set(source_docs.keys())
            target_ids = set(target_docs.keys())

            missing_ids = sorted(source_ids - target_ids)
            common_ids = source_ids & target_ids
            changed_ids = sorted(
                doc_id
                for doc_id in common_ids
                if _payload_signature(source_docs[doc_id]) != _payload_signature(target_docs[doc_id])
            )
            extra_ids = sorted(target_ids - source_ids)

            to_upsert_ids = missing_ids + changed_ids
            to_upsert_docs = [source_docs[doc_id] for doc_id in to_upsert_ids]

            upserted = 0
            deleted = 0
            if args.execute:
                if target_side == "mongo":
                    upserted = await _upsert_to_mongo(mongo_db, collection_name, to_upsert_docs)
                    if args.prune_target:
                        deleted = await _delete_from_mongo(mongo_db, collection_name, extra_ids)
                else:
                    upserted = await _upsert_to_postgres(session_factory, collection_name, to_upsert_docs)
                    if args.prune_target:
                        deleted = await _delete_from_postgres(session_factory, collection_name, extra_ids)

            report["collections"][collection_name] = {
                "source_count": len(source_docs),
                "target_count": len(target_docs),
                "missing_in_target_count": len(missing_ids),
                "changed_in_target_count": len(changed_ids),
                "extra_in_target_count": len(extra_ids),
                "upserted": upserted,
                "deleted": deleted,
                "sample_ids": {
                    "missing_in_target": missing_ids[:10],
                    "changed_in_target": changed_ids[:10],
                    "extra_in_target": extra_ids[:10],
                },
            }

            report["summary"]["collections"] += 1
            report["summary"]["missing_in_target"] += len(missing_ids)
            report["summary"]["changed_in_target"] += len(changed_ids)
            report["summary"]["extra_in_target"] += len(extra_ids)
            report["summary"]["upserted"] += upserted
            report["summary"]["deleted"] += deleted

        print(json.dumps(report, ensure_ascii=True, indent=2))
    finally:
        mongo_client.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
