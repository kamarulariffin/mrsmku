#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List

import psycopg
from dotenv import load_dotenv
from pymongo import MongoClient


def _to_sync_pg_url(url: str) -> str:
    if url.startswith("postgresql+psycopg://"):
        return "postgresql://" + url[len("postgresql+psycopg://") :]
    return url


def _run_pg_rule(cur, *, execute: bool, where_sql: str, params: List[Any]) -> int:
    if execute:
        cur.execute(f"DELETE FROM core_documents WHERE {where_sql}", params)
        return cur.rowcount
    cur.execute(f"SELECT count(*) FROM core_documents WHERE {where_sql}", params)
    return int(cur.fetchone()[0])


def _run_mongo_rule(collection, *, execute: bool, query: Dict[str, Any]) -> int:
    if execute:
        result = collection.delete_many(query)
        return int(result.deleted_count)
    return int(collection.count_documents(query))


def _parse_iso_datetime(value: str, *, arg_name: str) -> datetime:
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SystemExit(f"Invalid {arg_name}: {value}. Use ISO 8601, e.g. 2026-03-07T00:00:00+00:00") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _compose_pg_where(base_sql: str, base_params: List[Any], *, from_dt: datetime = None, to_dt: datetime = None):
    clauses = [f"({base_sql})"]
    params = list(base_params)
    if from_dt is not None:
        clauses.append("updated_at >= %s")
        params.append(from_dt)
    if to_dt is not None:
        clauses.append("updated_at <= %s")
        params.append(to_dt)
    return " AND ".join(clauses), params


def _compose_mongo_query(or_conditions: List[Dict[str, Any]], *, from_dt: datetime = None, to_dt: datetime = None):
    mongo_query: Dict[str, Any] = {"$or": or_conditions}
    time_range: Dict[str, Any] = {}
    if from_dt is not None:
        time_range["$gte"] = from_dt
    if to_dt is not None:
        time_range["$lte"] = to_dt
    if time_range:
        mongo_query = {"$and": [mongo_query, {"created_at": time_range}]}
    return mongo_query


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Cleanup E2E migration artifacts across PostgreSQL core_documents and MongoDB side-effect collections."
    )
    parser.add_argument("--set-id", help="Target set_yuran document ID")
    parser.add_argument("--yuran-id", help="Target student_yuran document ID")
    parser.add_argument("--receipt-number", help="Target yuran_payments receipt number")
    parser.add_argument("--marker", help="Unique marker used in set_yuran name/message/details")
    parser.add_argument("--marker-prefix", help="Prefix marker for batch cleanup, e.g. PG-MIG-SET-")
    parser.add_argument("--from-datetime", help="Lower bound timestamp (ISO 8601)")
    parser.add_argument("--to-datetime", help="Upper bound timestamp (ISO 8601)")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply deletion. Without this flag, the script only reports matched counts.",
    )
    args = parser.parse_args()

    if not any([args.set_id, args.yuran_id, args.receipt_number, args.marker, args.marker_prefix]):
        raise SystemExit(
            "Provide at least one filter: --set-id / --yuran-id / --receipt-number / --marker / --marker-prefix"
        )
    from_dt = _parse_iso_datetime(args.from_datetime, arg_name="--from-datetime") if args.from_datetime else None
    to_dt = _parse_iso_datetime(args.to_datetime, arg_name="--to-datetime") if args.to_datetime else None
    if from_dt is not None and to_dt is not None and from_dt > to_dt:
        raise SystemExit("--from-datetime must be earlier than or equal to --to-datetime")

    load_dotenv()
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "mrsm_portal")
    pg_url = _to_sync_pg_url(
        os.environ.get("DATABASE_URL", "postgresql://kamarulariffin@localhost:5432/mrsm_portal")
    )

    summary: Dict[str, Any] = {
        "mode": "execute" if args.execute else "dry_run",
        "filters": {
            "set_id": args.set_id,
            "yuran_id": args.yuran_id,
            "receipt_number": args.receipt_number,
            "marker": args.marker,
            "marker_prefix": args.marker_prefix,
            "from_datetime": from_dt.isoformat() if from_dt else None,
            "to_datetime": to_dt.isoformat() if to_dt else None,
        },
        "postgres": {},
        "mongo": {},
    }

    # ---------- PostgreSQL core_documents ----------
    with psycopg.connect(pg_url) as conn:
        with conn.cursor() as cur:
            if args.set_id:
                where_sql, params = _compose_pg_where(
                    "collection_name='set_yuran' AND document_id=%s",
                    [args.set_id],
                    from_dt=from_dt,
                    to_dt=to_dt,
                )
                summary["postgres"]["set_yuran_by_id"] = _run_pg_rule(
                    cur,
                    execute=args.execute,
                    where_sql=where_sql,
                    params=params,
                )
            if args.marker:
                where_sql, params = _compose_pg_where(
                    "collection_name='set_yuran' AND document->>'nama'=%s",
                    [args.marker],
                    from_dt=from_dt,
                    to_dt=to_dt,
                )
                summary["postgres"]["set_yuran_by_marker"] = _run_pg_rule(
                    cur,
                    execute=args.execute,
                    where_sql=where_sql,
                    params=params,
                )
                where_sql, params = _compose_pg_where(
                    "collection_name='notifications' AND document->>'message' ILIKE %s",
                    [f"%{args.marker}%"],
                    from_dt=from_dt,
                    to_dt=to_dt,
                )
                summary["postgres"]["notifications_by_marker"] = _run_pg_rule(
                    cur,
                    execute=args.execute,
                    where_sql=where_sql,
                    params=params,
                )
                where_sql, params = _compose_pg_where(
                    "collection_name='audit_logs' AND document->>'details' ILIKE %s",
                    [f"%{args.marker}%"],
                    from_dt=from_dt,
                    to_dt=to_dt,
                )
                summary["postgres"]["audit_logs_by_marker"] = _run_pg_rule(
                    cur,
                    execute=args.execute,
                    where_sql=where_sql,
                    params=params,
                )
            if args.marker_prefix:
                where_sql, params = _compose_pg_where(
                    "collection_name='set_yuran' AND document->>'nama' ILIKE %s",
                    [f"{args.marker_prefix}%"],
                    from_dt=from_dt,
                    to_dt=to_dt,
                )
                summary["postgres"]["set_yuran_by_marker_prefix"] = _run_pg_rule(
                    cur,
                    execute=args.execute,
                    where_sql=where_sql,
                    params=params,
                )
                where_sql, params = _compose_pg_where(
                    "collection_name='notifications' AND document->>'message' ILIKE %s",
                    [f"%{args.marker_prefix}%"],
                    from_dt=from_dt,
                    to_dt=to_dt,
                )
                summary["postgres"]["notifications_by_marker_prefix"] = _run_pg_rule(
                    cur,
                    execute=args.execute,
                    where_sql=where_sql,
                    params=params,
                )
                where_sql, params = _compose_pg_where(
                    "collection_name='audit_logs' AND document->>'details' ILIKE %s",
                    [f"%{args.marker_prefix}%"],
                    from_dt=from_dt,
                    to_dt=to_dt,
                )
                summary["postgres"]["audit_logs_by_marker_prefix"] = _run_pg_rule(
                    cur,
                    execute=args.execute,
                    where_sql=where_sql,
                    params=params,
                )
            if args.yuran_id:
                where_sql, params = _compose_pg_where(
                    "collection_name='student_yuran' AND document_id=%s",
                    [args.yuran_id],
                    from_dt=from_dt,
                    to_dt=to_dt,
                )
                summary["postgres"]["student_yuran_by_id"] = _run_pg_rule(
                    cur,
                    execute=args.execute,
                    where_sql=where_sql,
                    params=params,
                )
                where_sql, params = _compose_pg_where(
                    "collection_name='yuran_payments' AND document->>'student_yuran_id'=%s",
                    [args.yuran_id],
                    from_dt=from_dt,
                    to_dt=to_dt,
                )
                summary["postgres"]["yuran_payments_by_student_yuran_id"] = _run_pg_rule(
                    cur,
                    execute=args.execute,
                    where_sql=where_sql,
                    params=params,
                )
            if args.receipt_number:
                where_sql, params = _compose_pg_where(
                    "collection_name='yuran_payments' AND document->>'receipt_number'=%s",
                    [args.receipt_number],
                    from_dt=from_dt,
                    to_dt=to_dt,
                )
                summary["postgres"]["yuran_payments_by_receipt"] = _run_pg_rule(
                    cur,
                    execute=args.execute,
                    where_sql=where_sql,
                    params=params,
                )
            if args.execute:
                conn.commit()

    # ---------- MongoDB side effects ----------
    mongo_client = MongoClient(mongo_url)
    db = mongo_client[db_name]
    try:
        tx_or = []
        je_or = []
        if args.receipt_number:
            tx_or.append({"reference_number": args.receipt_number})
            je_or.append({"reference_number": args.receipt_number})
        if args.yuran_id:
            tx_or.append({"source_ref.student_yuran_id": args.yuran_id})
            je_or.append({"source_ref.student_yuran_id": args.yuran_id})
        if args.marker:
            marker_regex = {"$regex": re.escape(args.marker), "$options": "i"}
            tx_or.append({"description": marker_regex})
            je_or.append({"description": marker_regex})
        if args.marker_prefix:
            marker_prefix_regex = {"$regex": re.escape(args.marker_prefix), "$options": "i"}
            tx_or.append({"description": marker_prefix_regex})
            je_or.append({"description": marker_prefix_regex})

        tx_ids: List[Any] = []
        tx_numbers: List[str] = []
        if tx_or:
            tx_query = _compose_mongo_query(tx_or, from_dt=from_dt, to_dt=to_dt)
            tx_docs = list(db.accounting_transactions.find(tx_query, {"_id": 1, "transaction_number": 1}))
            tx_ids = [d["_id"] for d in tx_docs]
            tx_numbers = [d.get("transaction_number") for d in tx_docs if d.get("transaction_number")]
            summary["mongo"]["accounting_transactions"] = _run_mongo_rule(
                db.accounting_transactions,
                execute=args.execute,
                query=tx_query,
            )
        else:
            summary["mongo"]["accounting_transactions"] = 0

        audit_or = []
        if tx_ids:
            audit_or.append({"transaction_id": {"$in": tx_ids}})
        if tx_numbers:
            audit_or.append({"transaction_number": {"$in": tx_numbers}})
        if audit_or:
            summary["mongo"]["accounting_audit_logs"] = _run_mongo_rule(
                db.accounting_audit_logs,
                execute=args.execute,
                query={"$or": audit_or},
            )
        else:
            summary["mongo"]["accounting_audit_logs"] = 0

        je_ids: List[Any] = []
        if je_or:
            je_query = _compose_mongo_query(je_or, from_dt=from_dt, to_dt=to_dt)
            je_docs = list(db.accounting_journal_entries.find(je_query, {"_id": 1}))
            je_ids = [d["_id"] for d in je_docs]
            summary["mongo"]["accounting_journal_entries"] = _run_mongo_rule(
                db.accounting_journal_entries,
                execute=args.execute,
                query=je_query,
            )
        else:
            summary["mongo"]["accounting_journal_entries"] = 0

        if je_ids:
            summary["mongo"]["accounting_journal_lines"] = _run_mongo_rule(
                db.accounting_journal_lines,
                execute=args.execute,
                query={"journal_entry_id": {"$in": je_ids}},
            )
        else:
            summary["mongo"]["accounting_journal_lines"] = 0
    finally:
        mongo_client.close()

    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
