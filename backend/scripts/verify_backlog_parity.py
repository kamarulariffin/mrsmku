#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
from decimal import Decimal, ROUND_DOWN
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Sequence

from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from models_sql.core_documents import CoreDocument


MODULE_PARITY_CONFIG: Dict[str, Dict[str, Any]] = {
    "marketplace": {
        "collections": [
            "financial_ledger",
            "flash_sale_products",
            "flash_sales",
            "marketplace_ads",
            "marketplace_bundles",
            "marketplace_category_rules",
            "marketplace_orders",
            "marketplace_payouts",
            "marketplace_products",
            "marketplace_settings",
            "marketplace_vendors",
            "product_boosts",
            "vendor_subscriptions",
            "vendor_wallets",
        ],
        "amount_checks": [
            {"collection": "marketplace_orders", "field": "total_amount"},
            {"collection": "marketplace_payouts", "field": "amount"},
            {"collection": "financial_ledger", "field": "amount"},
            {"collection": "vendor_wallets", "field": "available_balance"},
        ],
        "snapshot_collections": [
            "marketplace_orders",
            "marketplace_payouts",
            "marketplace_products",
            "vendor_wallets",
        ],
    },
    "koperasi_commission": {
        "collections": [
            "koop_orders",
            "koperasi_commission_payments",
            "koperasi_commissions",
            "koperasi_settings",
        ],
        "amount_checks": [
            {"collection": "koop_orders", "field": "total_amount"},
            {"collection": "koperasi_commissions", "field": "commission_amount"},
            {"collection": "koperasi_commission_payments", "field": "total_amount"},
        ],
        "snapshot_collections": [
            "koperasi_commissions",
            "koperasi_commission_payments",
            "koperasi_settings",
        ],
    },
    "student_import": {
        "collections": ["claim_codes"],
        "amount_checks": [],
        "snapshot_collections": ["claim_codes"],
    },
    "hostel": {
        "collections": [
            "hostel_blocks",
            "hostel_pbw_pbp_periods",
            "hostel_records",
            "movement_logs",
        ],
        "amount_checks": [],
        "snapshot_collections": [
            "hostel_records",
            "movement_logs",
            "hostel_pbw_pbp_periods",
        ],
    },
    "sickbay": {
        "collections": ["sickbay_records"],
        "amount_checks": [],
        "snapshot_collections": ["sickbay_records"],
    },
    "warden": {
        "collections": ["outing_rotation", "warden_calendar_events", "warden_schedules"],
        "amount_checks": [],
        "snapshot_collections": ["outing_rotation", "warden_calendar_events", "warden_schedules"],
    },
    "discipline": {
        "collections": ["offence_sections", "offences", "olat_cases", "olat_categories"],
        "amount_checks": [],
        "snapshot_collections": ["offences", "olat_cases", "olat_categories"],
    },
    "risk": {
        "collections": ["movement_logs", "offences", "olat_cases"],
        "amount_checks": [],
        "snapshot_collections": ["movement_logs", "offences", "olat_cases"],
    },
    "inventory": {
        "collections": [
            "central_inventory",
            "inventory_links",
            "inventory_movements",
            "koop_products",
            "merchandise_products",
            "pum_products",
            "vendors",
        ],
        "amount_checks": [
            {"collection": "central_inventory", "field": "stock"},
            {"collection": "merchandise_products", "field": "stock"},
            {"collection": "pum_products", "field": "stock"},
        ],
        "snapshot_collections": ["central_inventory", "inventory_movements", "inventory_links"],
    },
    "accounting": {
        "collections": [
            "commission_records",
            "koop_orders",
            "merchandise_orders",
            "merchandise_products",
            "pum_orders",
            "pum_products",
            "settings",
        ],
        "amount_checks": [
            {"collection": "commission_records", "field": "commission_amount"},
            {"collection": "koop_orders", "field": "total_amount"},
            {"collection": "merchandise_orders", "field": "total_amount"},
            {"collection": "pum_orders", "field": "total_amount"},
        ],
        "snapshot_collections": ["commission_records", "settings"],
    },
    "bank_accounts": {
        "collections": ["accounting_transactions", "bank_accounts", "financial_years", "opening_balances"],
        "amount_checks": [
            {"collection": "accounting_transactions", "field": "amount"},
            {"collection": "opening_balances", "field": "amount"},
        ],
        "snapshot_collections": ["accounting_transactions", "bank_accounts", "financial_years"],
    },
    "agm_reports": {
        "collections": [
            "accounting_categories",
            "accounting_transactions",
            "bank_accounts",
            "financial_years",
            "opening_balances",
        ],
        "amount_checks": [
            {"collection": "accounting_transactions", "field": "amount"},
            {"collection": "opening_balances", "field": "amount"},
        ],
        "snapshot_collections": ["accounting_categories", "accounting_transactions", "financial_years"],
    },
    "chatbox_faq": {
        "collections": ["chatbox_faq"],
        "amount_checks": [],
        "snapshot_collections": ["chatbox_faq"],
    },
    "pwa": {
        "collections": ["pwa_device_tokens"],
        "amount_checks": [],
        "snapshot_collections": ["pwa_device_tokens"],
    },
    "upload": {
        "collections": [],
        "amount_checks": [],
        "snapshot_collections": [],
        "note": "No persistent collection access in route file; validate via smoke checks.",
    },
}

MODULE_ALIASES: Dict[str, List[str]] = {
    "batch_1": ["marketplace", "koperasi_commission", "student_import"],
    "batch_2": ["hostel", "sickbay", "warden", "discipline", "risk"],
    "batch_3": ["inventory", "accounting", "bank_accounts", "agm_reports"],
    "batch_4": ["chatbox_faq", "pwa", "upload"],
    "backlog_all": list(MODULE_PARITY_CONFIG.keys()),
}

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
    if isinstance(value, str):
        should_try_datetime = key_hint.endswith("_at") or key_hint in _DATETIME_FIELDS
        if should_try_datetime:
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
    serialized = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _get_path_value(doc: Dict[str, Any], field_path: str) -> Any:
    current: Any = doc
    for token in field_path.split("."):
        if isinstance(current, dict):
            current = current.get(token)
            continue
        if isinstance(current, list) and token.isdigit():
            idx = int(token)
            if 0 <= idx < len(current):
                current = current[idx]
                continue
        return None
    return current


def _sum_field(docs: List[Dict[str, Any]], field_path: str) -> float:
    total = 0.0
    for doc in docs:
        value = _get_path_value(doc, field_path)
        if isinstance(value, list):
            for item in value:
                try:
                    total += float(item or 0)
                except Exception:
                    continue
            continue
        try:
            total += float(value or 0)
        except Exception:
            continue
    return round(total, 2)


def _build_etl_command(collections: Sequence[str]) -> str:
    if not collections:
        return ""
    parts = ["./venv/bin/python", "scripts/migrate_core_to_postgres.py", "--collections", *collections]
    return " ".join(parts)


def _expand_modules(raw_items: Sequence[str]) -> List[str]:
    expanded: List[str] = []
    for item in raw_items:
        key = str(item).strip()
        if not key:
            continue
        if key in MODULE_ALIASES:
            expanded.extend(MODULE_ALIASES[key])
            continue
        expanded.append(key)

    deduped: List[str] = []
    seen = set()
    for module_name in expanded:
        if module_name in seen:
            continue
        seen.add(module_name)
        deduped.append(module_name)
    return deduped


async def _get_pg_count(session_factory: async_sessionmaker, collection_name: str) -> int:
    async with session_factory() as session:
        value = await session.scalar(
            select(func.count())
            .select_from(CoreDocument)
            .where(CoreDocument.collection_name == collection_name)
        )
        return int(value or 0)


async def _get_pg_docs(
    session_factory: async_sessionmaker,
    collection_name: str,
    max_docs: int,
) -> List[Dict[str, Any]]:
    async with session_factory() as session:
        rows = await session.scalars(
            select(CoreDocument)
            .where(CoreDocument.collection_name == collection_name)
            .order_by(CoreDocument.document_id.asc())
            .limit(max_docs)
        )
        out: List[Dict[str, Any]] = []
        for row in rows.all():
            doc = dict(row.document or {})
            doc["_id"] = row.document_id
            out.append(_normalize_doc(doc))
        return out


async def _get_mongo_docs(mongo_db, collection_name: str, max_docs: int) -> List[Dict[str, Any]]:
    docs = await mongo_db[collection_name].find({}).sort("_id", 1).to_list(max_docs)
    return [_normalize_doc(doc) for doc in docs]


async def _run_module_parity(
    *,
    module_name: str,
    module_cfg: Dict[str, Any],
    mongo_db,
    session_factory: async_sessionmaker,
    max_docs: int,
    snapshot_size: int,
    amount_epsilon: float,
) -> Dict[str, Any]:
    collections = list(dict.fromkeys(module_cfg.get("collections", [])))
    report: Dict[str, Any] = {
        "ok": True,
        "note": module_cfg.get("note"),
        "etl": {
            "collections": collections,
            "migrate_command": _build_etl_command(collections),
        },
        "collections": {},
        "checks": {
            "amount": {},
            "snapshot": {},
        },
    }

    if not collections:
        report["collections"] = {}
        report["checks"] = {"amount": {}, "snapshot": {}}
        return report

    mongo_count_cache: Dict[str, int] = {}
    pg_count_cache: Dict[str, int] = {}
    mongo_doc_cache: Dict[str, List[Dict[str, Any]]] = {}
    pg_doc_cache: Dict[str, List[Dict[str, Any]]] = {}

    async def _load_docs(collection_name: str) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        if collection_name not in mongo_doc_cache:
            mongo_doc_cache[collection_name] = await _get_mongo_docs(mongo_db, collection_name, max_docs)
        if collection_name not in pg_doc_cache:
            pg_doc_cache[collection_name] = await _get_pg_docs(session_factory, collection_name, max_docs)
        return mongo_doc_cache[collection_name], pg_doc_cache[collection_name]

    for collection_name in collections:
        mongo_count = await mongo_db[collection_name].count_documents({})
        pg_count = await _get_pg_count(session_factory, collection_name)
        mongo_count_cache[collection_name] = int(mongo_count)
        pg_count_cache[collection_name] = int(pg_count)

        truncated = (mongo_count > max_docs) or (pg_count > max_docs)
        count_match = int(mongo_count) == int(pg_count)

        report["collections"][collection_name] = {
            "mongo_count": int(mongo_count),
            "postgres_count": int(pg_count),
            "count_match": count_match,
            "truncated_for_doc_checks": bool(truncated),
        }
        if not count_match or truncated:
            report["ok"] = False

    for check in module_cfg.get("amount_checks", []):
        collection_name = str(check["collection"])
        field_name = str(check["field"])
        check_name = f"{collection_name}.{field_name}.sum"
        mongo_docs, pg_docs = await _load_docs(collection_name)
        mongo_sum = _sum_field(mongo_docs, field_name)
        pg_sum = _sum_field(pg_docs, field_name)
        delta = round(mongo_sum - pg_sum, 2)
        match = abs(delta) <= amount_epsilon
        report["checks"]["amount"][check_name] = {
            "mongo": mongo_sum,
            "postgres": pg_sum,
            "delta": delta,
            "epsilon": amount_epsilon,
            "match": match,
        }
        if not match:
            report["ok"] = False

    for collection_name in module_cfg.get("snapshot_collections", []):
        mongo_docs, pg_docs = await _load_docs(collection_name)
        mongo_map = {str(doc["_id"]): doc for doc in mongo_docs}
        pg_map = {str(doc["_id"]): doc for doc in pg_docs}

        mongo_ids = set(mongo_map.keys())
        pg_ids = set(pg_map.keys())
        intersection_ids = sorted(mongo_ids & pg_ids)
        sample_ids = intersection_ids[: max(0, snapshot_size)]

        mismatched_ids: List[str] = []
        for doc_id in sample_ids:
            if _payload_signature(mongo_map[doc_id]) != _payload_signature(pg_map[doc_id]):
                mismatched_ids.append(doc_id)

        missing_in_postgres = sorted(mongo_ids - pg_ids)
        missing_in_mongo = sorted(pg_ids - mongo_ids)
        match = (
            len(mismatched_ids) == 0
            and len(missing_in_postgres) == 0
            and len(missing_in_mongo) == 0
        )

        report["checks"]["snapshot"][collection_name] = {
            "sample_size": len(sample_ids),
            "sample_limit": snapshot_size,
            "intersection_count": len(intersection_ids),
            "mismatched_sample_count": len(mismatched_ids),
            "missing_in_postgres_count": len(missing_in_postgres),
            "missing_in_mongo_count": len(missing_in_mongo),
            "mismatched_sample_ids": mismatched_ids[:20],
            "missing_in_postgres_ids": missing_in_postgres[:20],
            "missing_in_mongo_ids": missing_in_mongo[:20],
            "match": match,
        }
        if not match:
            report["ok"] = False

    return report


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Parity report for backlog modules (MongoDB vs PostgreSQL core_documents) "
            "with module-level ETL command hints."
        )
    )
    parser.add_argument(
        "--modules",
        nargs="+",
        default=["backlog_all"],
        help="Module names and/or alias groups (default: backlog_all).",
    )
    parser.add_argument(
        "--list-modules",
        action="store_true",
        help="Print available module names and alias groups.",
    )
    parser.add_argument(
        "--show-etl-plan",
        action="store_true",
        help="Only print module -> collections -> ETL command plan, without DB reads.",
    )
    parser.add_argument(
        "--max-docs",
        type=int,
        default=500000,
        help="Max docs fetched per collection for amount/snapshot checks (default: 500000).",
    )
    parser.add_argument(
        "--snapshot-size",
        type=int,
        default=50,
        help="How many intersecting doc IDs to compare per snapshot collection (default: 50).",
    )
    parser.add_argument(
        "--amount-epsilon",
        type=float,
        default=0.01,
        help="Allowed absolute delta for amount checks (default: 0.01).",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default="",
        help="Optional output file path for JSON report.",
    )
    return parser.parse_args()


async def main() -> None:
    args = _parse_args()

    if args.list_modules:
        payload = {
            "modules": sorted(MODULE_PARITY_CONFIG.keys()),
            "aliases": MODULE_ALIASES,
        }
        print(json.dumps(payload, ensure_ascii=True, indent=2))
        return

    selected_modules = _expand_modules(args.modules or [])
    if not selected_modules:
        raise SystemExit("No module selected.")

    unknown = [name for name in selected_modules if name not in MODULE_PARITY_CONFIG]
    if unknown:
        raise SystemExit(f"Unknown module(s): {', '.join(sorted(unknown))}")

    if args.show_etl_plan:
        etl_plan = {
            module_name: {
                "collections": MODULE_PARITY_CONFIG[module_name].get("collections", []),
                "migrate_command": _build_etl_command(MODULE_PARITY_CONFIG[module_name].get("collections", [])),
            }
            for module_name in selected_modules
        }
        print(json.dumps({"modules": selected_modules, "etl_plan": etl_plan}, ensure_ascii=True, indent=2))
        return

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
            "selected_modules": selected_modules,
            "max_docs": int(args.max_docs),
            "snapshot_size": int(args.snapshot_size),
            "amount_epsilon": float(args.amount_epsilon),
            "modules": {},
            "ok": True,
        }

        for module_name in selected_modules:
            module_report = await _run_module_parity(
                module_name=module_name,
                module_cfg=MODULE_PARITY_CONFIG[module_name],
                mongo_db=mongo_db,
                session_factory=session_factory,
                max_docs=int(args.max_docs),
                snapshot_size=int(args.snapshot_size),
                amount_epsilon=float(args.amount_epsilon),
            )
            report["modules"][module_name] = module_report
            if not module_report.get("ok", False):
                report["ok"] = False

        text = json.dumps(report, ensure_ascii=True, indent=2)
        print(text)

        if args.output_json:
            output_path = Path(args.output_json)
            if not output_path.is_absolute():
                output_path = PROJECT_ROOT / output_path
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(text + "\n", encoding="utf-8")

        if not report["ok"]:
            raise SystemExit(1)
    finally:
        mongo_client.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
