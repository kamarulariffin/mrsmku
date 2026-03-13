#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - optional in minimal runtime
    def load_dotenv(*_args, **_kwargs):
        return False
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from repositories.core_store import CoreStore  # noqa: E402


DEFAULT_COLLECTIONS = [
    "tenant_user_memberships",
    "tenant_module_settings",
    "users",
    "students",
    "settings",
    "rbac_config",
    "set_yuran",
    "student_yuran",
    "payments",
    "yuran_payments",
    "payment_center_cart",
    "payment_receipts",
    "ar_print_jobs",
    "ar_notification_report_log",
    "accounting_transactions",
    "accounting_categories",
    "bank_accounts",
    "financial_years",
    "financial_ledger",
    "accounting_audit_logs",
    "accounting_period_locks",
    "accounting_journal_entries",
    "accounting_journal_lines",
    "bank_reconciliation_profiles",
    "bank_reconciliation_statements",
    "bank_reconciliation_items",
    "tabung_campaigns",
    "tabung_donations",
    "donation_campaigns",
    "infaq_campaigns",
    "payment_reminders",
    "payment_reminder_preferences",
    "email_templates",
    "email_logs",
    "push_subscriptions",
    "push_logs",
    "pwa_device_tokens",
    "chatbox_faq",
    "chatbox_responses",
    "chatbox_suggestions",
    "ai_chat_history",
    "vendors",
    "marketplace_settings",
    "koperasi_settings",
    "hostel_blocks",
    "hostel_pbw_pbp_periods",
    "offence_sections",
    "olat_categories",
    "bus_companies",
    "buses",
    "bus_routes",
    "bus_trips",
    "bus_bookings",
    "bus_live_locations",
    "scheduler_logs",
    "agm_events",
    "notifications",
    "audit_logs",
    "tenant_onboarding_jobs",
    "institution_onboarding_requests",
]


def _to_async_url(url: str) -> str:
    if url.startswith("postgresql+psycopg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def _id_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _norm_code(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_unix_seconds(value: Any) -> float:
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return 0.0
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(raw)
            dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
        except ValueError:
            return 0.0
    return 0.0


@dataclass(frozen=True)
class TenantPair:
    tenant_id: str
    tenant_code: str


@dataclass
class UpdateCandidate:
    collection: str
    query_id: Any
    doc_id: str
    tenant: TenantPair
    source: str


@dataclass
class CollectionReport:
    total: int = 0
    already_valid: int = 0
    invalid_existing: int = 0
    unresolved: int = 0
    updates_planned: int = 0
    updates_applied: int = 0
    source_counts: Dict[str, int] = field(default_factory=dict)
    sample_unresolved_ids: List[str] = field(default_factory=list)
    captured_unresolved_ids: List[str] = field(default_factory=list)
    sample_updated_ids: List[str] = field(default_factory=list)


ResolverFn = Callable[[Dict[str, Any], "BackfillState"], Tuple[Optional[TenantPair], str]]


class BackfillState:
    def __init__(
        self,
        docs_by_collection: Dict[str, List[Dict[str, Any]]],
        max_samples: int = 20,
        default_tenant_pair: Optional[TenantPair] = None,
        assign_unresolved_to_default: bool = False,
        capture_unresolved: bool = False,
        unresolved_capture_limit: int = 0,
    ):
        self.docs_by_collection = docs_by_collection
        self.max_samples = max(5, max_samples)
        self.default_tenant_pair = default_tenant_pair
        self.assign_unresolved_to_default = bool(assign_unresolved_to_default)
        self.capture_unresolved = bool(capture_unresolved)
        self.unresolved_capture_limit = max(0, int(unresolved_capture_limit or 0))
        self.tenant_code_by_id: Dict[str, str] = {}
        self.tenant_id_by_code: Dict[str, str] = {}
        self.membership_pair_by_user: Dict[str, TenantPair] = {}
        self.pairs_by_collection: Dict[str, Dict[str, TenantPair]] = defaultdict(dict)
        self.student_yuran_by_set: Dict[str, List[str]] = defaultdict(list)

    def build_base_indexes(self) -> None:
        tenants = self.docs_by_collection.get("tenants", [])
        for tenant in tenants:
            tenant_id = _id_text(tenant.get("_id"))
            tenant_code = _norm_code(tenant.get("tenant_code"))
            if not tenant_id or not tenant_code:
                continue
            self.tenant_code_by_id[tenant_id] = tenant_code
            self.tenant_id_by_code[tenant_code] = tenant_id
            self.pairs_by_collection["tenants"][tenant_id] = TenantPair(tenant_id=tenant_id, tenant_code=tenant_code)

        if self.default_tenant_pair:
            self.tenant_code_by_id.setdefault(
                self.default_tenant_pair.tenant_id,
                self.default_tenant_pair.tenant_code,
            )
            self.tenant_id_by_code.setdefault(
                self.default_tenant_pair.tenant_code,
                self.default_tenant_pair.tenant_id,
            )
            self.pairs_by_collection["tenants"][self.default_tenant_pair.tenant_id] = self.default_tenant_pair

        memberships = self.docs_by_collection.get("tenant_user_memberships", [])
        best_score_by_user: Dict[str, Tuple[int, int, float]] = {}
        for row in memberships:
            user_id = _id_text(row.get("user_id"))
            if not user_id:
                continue
            pair = self.canonical_pair(row.get("tenant_id"), row.get("tenant_code"))
            if pair is None:
                continue
            status = str(row.get("status") or "").strip().lower()
            status_rank = {"active": 3, "invited": 2, "pending": 1}.get(status, 0)
            primary_rank = 1 if bool(row.get("is_primary")) else 0
            updated_rank = _to_unix_seconds(row.get("updated_at") or row.get("created_at"))
            score = (status_rank, primary_rank, updated_rank)
            if user_id not in best_score_by_user or score > best_score_by_user[user_id]:
                best_score_by_user[user_id] = score
                self.membership_pair_by_user[user_id] = pair

        student_yuran_rows = self.docs_by_collection.get("student_yuran", [])
        for row in student_yuran_rows:
            set_id = _id_text(row.get("set_yuran_id"))
            row_id = _id_text(row.get("_id"))
            if set_id and row_id:
                self.student_yuran_by_set[set_id].append(row_id)

    def canonical_pair(self, tenant_id: Any, tenant_code: Any) -> Optional[TenantPair]:
        tenant_id_text = _id_text(tenant_id)
        tenant_code_text = _norm_code(tenant_code)
        if tenant_id_text and tenant_id_text in self.tenant_code_by_id:
            return TenantPair(
                tenant_id=tenant_id_text,
                tenant_code=self.tenant_code_by_id[tenant_id_text],
            )
        if tenant_code_text and tenant_code_text in self.tenant_id_by_code:
            canonical_id = self.tenant_id_by_code[tenant_code_text]
            return TenantPair(
                tenant_id=canonical_id,
                tenant_code=self.tenant_code_by_id.get(canonical_id, tenant_code_text),
            )
        return None

    def lookup_pair(self, collection: str, doc_id: Any) -> Optional[TenantPair]:
        key = _id_text(doc_id)
        if not key:
            return None
        return self.pairs_by_collection.get(collection, {}).get(key)

    def remember_pair(self, collection: str, doc_id: Any, pair: TenantPair) -> None:
        key = _id_text(doc_id)
        if not key:
            return
        self.pairs_by_collection[collection][key] = pair


def _has_any_tenant_hint(doc: Dict[str, Any]) -> bool:
    return bool(_id_text(doc.get("tenant_id")) or _norm_code(doc.get("tenant_code")))


def _needs_update(doc: Dict[str, Any], pair: TenantPair) -> bool:
    current_id = _id_text(doc.get("tenant_id"))
    current_code = _norm_code(doc.get("tenant_code"))
    return current_id != pair.tenant_id or current_code != pair.tenant_code


def _resolve_from_user(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    user_id = _id_text(doc.get("_id"))
    by_membership = state.membership_pair_by_user.get(user_id)
    if by_membership:
        return by_membership, "membership"
    by_code = state.canonical_pair(None, doc.get("tenant_code"))
    if by_code:
        return by_code, "tenant_code_field"
    return None, ""


def _resolve_from_student(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("users", doc.get("parent_id"))
    if pair:
        return pair, "parent_user"
    pair = state.lookup_pair("users", doc.get("created_by"))
    if pair:
        return pair, "created_by"
    return None, ""


def _resolve_from_set_yuran(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("users", doc.get("created_by"))
    if pair:
        return pair, "created_by"
    set_id = _id_text(doc.get("_id"))
    for student_yuran_id in state.student_yuran_by_set.get(set_id, []):
        pair = state.lookup_pair("student_yuran", student_yuran_id)
        if pair:
            return pair, "linked_student_yuran"
    return None, ""


def _resolve_from_student_yuran(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("students", doc.get("student_id"))
    if pair:
        return pair, "student"
    pair = state.lookup_pair("users", doc.get("parent_id"))
    if pair:
        return pair, "parent_user"
    pair = state.lookup_pair("set_yuran", doc.get("set_yuran_id"))
    if pair:
        return pair, "set_yuran"
    pair = state.lookup_pair("users", doc.get("created_by"))
    if pair:
        return pair, "created_by"
    return None, ""


def _resolve_from_payments(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("student_yuran", doc.get("fee_id"))
    if pair:
        return pair, "student_yuran_fee"
    pair = state.lookup_pair("users", doc.get("user_id"))
    if pair:
        return pair, "user"
    return None, ""


def _resolve_from_yuran_payments(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("student_yuran", doc.get("student_yuran_id"))
    if pair:
        return pair, "student_yuran"
    pair = state.lookup_pair("students", doc.get("student_id"))
    if pair:
        return pair, "student"
    pair = state.lookup_pair("users", doc.get("parent_id"))
    if pair:
        return pair, "parent_user"
    pair = state.lookup_pair("users", doc.get("created_by"))
    if pair:
        return pair, "created_by"
    return None, ""


def _resolve_from_accounting_transaction(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("users", doc.get("created_by"))
    if pair:
        return pair, "created_by"
    source_ref = doc.get("source_ref") if isinstance(doc.get("source_ref"), dict) else {}
    if source_ref:
        for key in ("student_yuran_id", "yuran_id", "fee_id"):
            pair = state.lookup_pair("student_yuran", source_ref.get(key))
            if pair:
                return pair, f"source_ref.{key}"
        for key in ("payment_id",):
            pair = state.lookup_pair("payments", source_ref.get(key))
            if pair:
                return pair, f"source_ref.{key}"
        for key in ("donation_id", "tabung_donation_id"):
            pair = state.lookup_pair("tabung_donations", source_ref.get(key))
            if pair:
                return pair, f"source_ref.{key}"
    return None, ""


def _resolve_from_accounting_audit(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("accounting_transactions", doc.get("transaction_id"))
    if pair:
        return pair, "transaction"
    pair = state.lookup_pair("users", doc.get("performed_by"))
    if pair:
        return pair, "performed_by"
    return None, ""


def _resolve_from_accounting_period_lock(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("users", doc.get("locked_by"))
    if pair:
        return pair, "locked_by"
    pair = state.lookup_pair("users", doc.get("unlocked_by"))
    if pair:
        return pair, "unlocked_by"
    return None, ""


def _resolve_from_accounting_journal_entry(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("accounting_transactions", doc.get("transaction_id"))
    if pair:
        return pair, "transaction"
    pair = state.lookup_pair("users", doc.get("created_by"))
    if pair:
        return pair, "created_by"
    pair = state.lookup_pair("users", doc.get("verified_by"))
    if pair:
        return pair, "verified_by"
    return None, ""


def _resolve_from_accounting_journal_line(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("accounting_journal_entries", doc.get("journal_entry_id"))
    if pair:
        return pair, "journal_entry"
    pair = state.lookup_pair("accounting_transactions", doc.get("transaction_id"))
    if pair:
        return pair, "transaction"
    return None, ""


def _resolve_from_tabung_campaign(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("users", doc.get("created_by"))
    if pair:
        return pair, "created_by"
    return None, ""


def _resolve_from_tabung_donation(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("users", doc.get("user_id"))
    if pair:
        return pair, "user"
    pair = state.lookup_pair("students", doc.get("student_id"))
    if pair:
        return pair, "student"
    pair = state.lookup_pair("tabung_campaigns", doc.get("campaign_id"))
    if pair:
        return pair, "campaign"
    return None, ""


def _resolve_from_payment_reminder(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("users", doc.get("user_id"))
    if pair:
        return pair, "user"
    pair = state.lookup_pair("students", doc.get("student_id"))
    if pair:
        return pair, "student"
    pair = state.lookup_pair("student_yuran", doc.get("item_id"))
    if pair:
        return pair, "item_student_yuran"
    return None, ""


def _resolve_from_notification(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("users", doc.get("user_id"))
    if pair:
        return pair, "user"
    metadata = doc.get("metadata") if isinstance(doc.get("metadata"), dict) else {}
    pair = state.lookup_pair("students", metadata.get("student_id"))
    if pair:
        return pair, "metadata.student_id"
    pair = state.lookup_pair("student_yuran", metadata.get("item_id"))
    if pair:
        return pair, "metadata.item_id"
    return None, ""


def _resolve_from_audit_log(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.lookup_pair("users", doc.get("user_id"))
    if pair:
        return pair, "user"
    return None, ""


def _resolve_generic(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    # 1) explicit tenant fields on the same document (canonicalized)
    pair = state.canonical_pair(doc.get("tenant_id"), doc.get("tenant_code"))
    if pair:
        return pair, "tenant_fields"

    # 2) user-linked ownership hints
    for field_name in (
        "user_id",
        "parent_id",
        "created_by",
        "updated_by",
        "performed_by",
        "locked_by",
        "unlocked_by",
        "requested_by",
        "approved_by",
        "reviewed_by",
        "admin_user_id",
        "driver_id",
        "vendor_user_id",
    ):
        pair = state.lookup_pair("users", doc.get(field_name))
        if pair:
            return pair, f"user_ref.{field_name}"

    # 3) domain-linked hints by known references
    ref_candidates = (
        ("student_id", "students"),
        ("item_id", "student_yuran"),
        ("student_yuran_id", "student_yuran"),
        ("fee_id", "student_yuran"),
        ("set_yuran_id", "set_yuran"),
        ("transaction_id", "accounting_transactions"),
        ("journal_entry_id", "accounting_journal_entries"),
        ("campaign_id", "tabung_campaigns"),
        ("donation_id", "tabung_donations"),
        ("bank_account_id", "bank_accounts"),
        ("category_id", "accounting_categories"),
        ("vendor_id", "vendors"),
        ("company_id", "bus_companies"),
        ("bus_id", "buses"),
        ("route_id", "bus_routes"),
        ("trip_id", "bus_trips"),
    )
    for field_name, collection_name in ref_candidates:
        pair = state.lookup_pair(collection_name, doc.get(field_name))
        if pair:
            return pair, f"ref.{field_name}"

    # 4) nested generic maps
    for nested_field in ("metadata", "payload", "source_ref"):
        nested = doc.get(nested_field)
        if not isinstance(nested, dict):
            continue
        nested_pair, nested_source = _resolve_generic(nested, state)
        if nested_pair:
            return nested_pair, f"{nested_field}.{nested_source}"
    return None, ""


def _resolve_from_tenant_fields(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.canonical_pair(doc.get("tenant_id"), doc.get("tenant_code"))
    if pair:
        return pair, "tenant_fields"
    preferred = doc.get("preferred_tenant_code")
    pair = state.canonical_pair(None, preferred)
    if pair:
        return pair, "preferred_tenant_code"
    return None, ""


def _resolve_from_membership(doc: Dict[str, Any], state: BackfillState) -> Tuple[Optional[TenantPair], str]:
    pair = state.canonical_pair(doc.get("tenant_id"), doc.get("tenant_code"))
    if pair:
        return pair, "tenant_fields"
    user_pair = state.lookup_pair("users", doc.get("user_id"))
    if user_pair:
        return user_pair, "user"
    return None, ""


RESOLVERS: Dict[str, ResolverFn] = {
    "tenant_user_memberships": _resolve_from_membership,
    "tenant_module_settings": _resolve_from_tenant_fields,
    "users": _resolve_from_user,
    "students": _resolve_from_student,
    "set_yuran": _resolve_from_set_yuran,
    "student_yuran": _resolve_from_student_yuran,
    "payments": _resolve_from_payments,
    "yuran_payments": _resolve_from_yuran_payments,
    "accounting_transactions": _resolve_from_accounting_transaction,
    "accounting_audit_logs": _resolve_from_accounting_audit,
    "accounting_period_locks": _resolve_from_accounting_period_lock,
    "accounting_journal_entries": _resolve_from_accounting_journal_entry,
    "accounting_journal_lines": _resolve_from_accounting_journal_line,
    "tabung_campaigns": _resolve_from_tabung_campaign,
    "tabung_donations": _resolve_from_tabung_donation,
    "payment_reminders": _resolve_from_payment_reminder,
    "payment_reminder_preferences": _resolve_from_payment_reminder,
    "notifications": _resolve_from_notification,
    "audit_logs": _resolve_from_audit_log,
    "tenant_onboarding_jobs": _resolve_from_tenant_fields,
    "institution_onboarding_requests": _resolve_from_tenant_fields,
}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill tenant_id and tenant_code across core collections. "
            "Dry-run by default."
        )
    )
    parser.add_argument(
        "--collections",
        nargs="+",
        default=DEFAULT_COLLECTIONS,
        help=f"Collections to process (default: {' '.join(DEFAULT_COLLECTIONS)})",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Persist updates to DB. Without this flag script only reports.",
    )
    parser.add_argument(
        "--max-docs",
        type=int,
        default=300000,
        help="Maximum docs fetched per collection (default: 300000).",
    )
    parser.add_argument(
        "--report-json",
        default="",
        help="Optional output path for JSON report.",
    )
    parser.add_argument(
        "--fail-on-unresolved",
        action="store_true",
        help="Exit with code 2 when unresolved records remain.",
    )
    parser.add_argument(
        "--default-tenant-id",
        default="",
        help="Optional fallback tenant_id (use with --default-tenant-code).",
    )
    parser.add_argument(
        "--default-tenant-code",
        default="",
        help="Optional fallback tenant_code (use with --default-tenant-id).",
    )
    parser.add_argument(
        "--assign-unresolved-to-default",
        action="store_true",
        help=(
            "When enabled, unresolved records are assigned to the fallback tenant "
            "(requires --default-tenant-id and --default-tenant-code)."
        ),
    )
    parser.add_argument(
        "--capture-unresolved",
        action="store_true",
        help="Include unresolved IDs in report output (bounded by --unresolved-capture-limit).",
    )
    parser.add_argument(
        "--unresolved-capture-limit",
        type=int,
        default=2000,
        help="Maximum unresolved IDs captured per collection when --capture-unresolved is set.",
    )
    parser.add_argument(
        "--allow-nonexistent-default-tenant",
        action="store_true",
        help=(
            "Allow execute mode even when fallback tenant is not present in tenants collection. "
            "Use with caution."
        ),
    )
    return parser.parse_args()


async def _load_docs(db: CoreStore, collection_name: str, max_docs: int) -> List[Dict[str, Any]]:
    try:
        rows = await db[collection_name].find({}).to_list(max_docs)
        return list(rows or [])
    except Exception:
        return []


async def _process_collection(
    db: CoreStore,
    collection_name: str,
    docs: Sequence[Dict[str, Any]],
    resolver: ResolverFn,
    state: BackfillState,
    execute: bool,
    now_iso: str,
) -> CollectionReport:
    report = CollectionReport(total=len(docs))
    updates: List[UpdateCandidate] = []

    for doc in docs:
        doc_id = _id_text(doc.get("_id"))
        existing_pair = state.canonical_pair(doc.get("tenant_id"), doc.get("tenant_code"))
        if existing_pair:
            state.remember_pair(collection_name, doc.get("_id"), existing_pair)
            if _needs_update(doc, existing_pair):
                updates.append(
                    UpdateCandidate(
                        collection=collection_name,
                        query_id=doc.get("_id"),
                        doc_id=doc_id,
                        tenant=existing_pair,
                        source="canonicalize_existing",
                    )
                )
            else:
                report.already_valid += 1
            continue

        if _has_any_tenant_hint(doc):
            report.invalid_existing += 1

        resolved_pair, source = resolver(doc, state)
        if (
            not resolved_pair
            and state.assign_unresolved_to_default
            and state.default_tenant_pair is not None
        ):
            resolved_pair = state.default_tenant_pair
            source = "default_tenant_fallback"
        if not resolved_pair:
            report.unresolved += 1
            if len(report.sample_unresolved_ids) < state.max_samples:
                report.sample_unresolved_ids.append(doc_id)
            if (
                state.capture_unresolved
                and len(report.captured_unresolved_ids) < state.unresolved_capture_limit
            ):
                report.captured_unresolved_ids.append(doc_id)
            continue

        state.remember_pair(collection_name, doc.get("_id"), resolved_pair)
        if _needs_update(doc, resolved_pair):
            updates.append(
                UpdateCandidate(
                    collection=collection_name,
                    query_id=doc.get("_id"),
                    doc_id=doc_id,
                    tenant=resolved_pair,
                    source=source or "resolved",
                )
            )

    report.updates_planned = len(updates)
    for row in updates:
        report.source_counts[row.source] = int(report.source_counts.get(row.source, 0)) + 1
        if len(report.sample_updated_ids) < state.max_samples:
            report.sample_updated_ids.append(row.doc_id)

    if execute and updates:
        applied = 0
        for candidate in updates:
            payload = {
                "tenant_id": candidate.tenant.tenant_id,
                "tenant_code": candidate.tenant.tenant_code,
                "tenant_backfilled_at": now_iso,
                "tenant_backfill_source": candidate.source,
            }
            result = await db[collection_name].update_one({"_id": candidate.query_id}, {"$set": payload})
            modified = int(getattr(result, "modified_count", 0) or 0)
            if modified == 0 and int(getattr(result, "matched_count", 0) or 0) > 0:
                modified = 1
            applied += modified
        report.updates_applied = applied
    return report


def _build_summary(
    mode: str,
    collections: List[str],
    reports: Dict[str, CollectionReport],
    skipped: List[str],
    include_captured_unresolved: bool,
) -> Dict[str, Any]:
    summary = {
        "mode": mode,
        "collections_processed": len(collections),
        "collections_skipped": skipped,
        "totals": {
            "records": 0,
            "already_valid": 0,
            "invalid_existing": 0,
            "unresolved": 0,
            "updates_planned": 0,
            "updates_applied": 0,
        },
        "collections": {},
    }
    for name in collections:
        report = reports[name]
        summary["totals"]["records"] += report.total
        summary["totals"]["already_valid"] += report.already_valid
        summary["totals"]["invalid_existing"] += report.invalid_existing
        summary["totals"]["unresolved"] += report.unresolved
        summary["totals"]["updates_planned"] += report.updates_planned
        summary["totals"]["updates_applied"] += report.updates_applied
        summary["collections"][name] = {
            "total": report.total,
            "already_valid": report.already_valid,
            "invalid_existing": report.invalid_existing,
            "unresolved": report.unresolved,
            "updates_planned": report.updates_planned,
            "updates_applied": report.updates_applied,
            "source_counts": report.source_counts,
            "sample_unresolved_ids": report.sample_unresolved_ids,
            "sample_updated_ids": report.sample_updated_ids,
        }
        if include_captured_unresolved:
            summary["collections"][name]["captured_unresolved_ids"] = report.captured_unresolved_ids
    return summary


async def main() -> int:
    args = _parse_args()
    load_dotenv()

    default_tenant_id = _id_text(args.default_tenant_id)
    default_tenant_code = _norm_code(args.default_tenant_code)
    if bool(default_tenant_id) != bool(default_tenant_code):
        raise RuntimeError("Both --default-tenant-id and --default-tenant-code must be provided together.")
    if args.assign_unresolved_to_default and not default_tenant_id:
        raise RuntimeError(
            "--assign-unresolved-to-default requires --default-tenant-id and --default-tenant-code."
        )
    default_tenant_pair = (
        TenantPair(tenant_id=default_tenant_id, tenant_code=default_tenant_code)
        if default_tenant_id and default_tenant_code
        else None
    )

    database_url = _to_async_url(
        os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://kamarulariffin@localhost:5432/mrsm_portal",
        )
    )
    engine = create_async_engine(database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    db = CoreStore(
        session_factory=session_factory,
        mongo_db=None,
        mirror_writes=False,
        postgres_all_collections=True,
    )

    now_iso = _iso_now()
    selected_collections = [c.strip() for c in (args.collections or []) if c and c.strip()]
    if "tenants" not in selected_collections:
        selected_collections = ["tenants", *selected_collections]

    docs_by_collection: Dict[str, List[Dict[str, Any]]] = {}
    skipped: List[str] = []

    try:
        for collection_name in selected_collections:
            if not db.uses_postgres(collection_name):
                skipped.append(collection_name)
                continue
            rows = await _load_docs(db, collection_name, args.max_docs)
            docs_by_collection[collection_name] = rows

        if "tenants" not in docs_by_collection:
            raise RuntimeError("Collection tenants is not available in postgres mode.")

        tenant_master_code_by_id: Dict[str, str] = {}
        tenant_master_id_by_code: Dict[str, str] = {}
        for tenant in docs_by_collection.get("tenants", []):
            tenant_id = _id_text(tenant.get("_id"))
            tenant_code = _norm_code(tenant.get("tenant_code"))
            if not tenant_id or not tenant_code:
                continue
            tenant_master_code_by_id[tenant_id] = tenant_code
            tenant_master_id_by_code[tenant_code] = tenant_id

        state = BackfillState(
            docs_by_collection=docs_by_collection,
            max_samples=20,
            default_tenant_pair=default_tenant_pair,
            assign_unresolved_to_default=bool(args.assign_unresolved_to_default),
            capture_unresolved=bool(args.capture_unresolved),
            unresolved_capture_limit=int(args.unresolved_capture_limit),
        )
        state.build_base_indexes()
        if not state.tenant_code_by_id:
            raise RuntimeError(
                "No tenant master records found in tenants collection. "
                "Provide --default-tenant-id and --default-tenant-code for bootstrap fallback."
            )

        default_tenant_exists = True
        if default_tenant_pair is not None:
            expected_code = tenant_master_code_by_id.get(default_tenant_pair.tenant_id, "")
            expected_id = tenant_master_id_by_code.get(default_tenant_pair.tenant_code, "")
            default_tenant_exists = (
                expected_code == default_tenant_pair.tenant_code
                and expected_id == default_tenant_pair.tenant_id
            )
            if (
                args.execute
                and not default_tenant_exists
                and not args.allow_nonexistent_default_tenant
            ):
                raise RuntimeError(
                    "Fallback tenant does not exist in tenants collection. "
                    "Create tenant master first, or pass --allow-nonexistent-default-tenant explicitly."
                )

        process_order: List[str] = []
        for name in selected_collections:
            if name == "tenants":
                continue
            if name not in docs_by_collection:
                continue
            process_order.append(name)

        reports: Dict[str, CollectionReport] = {}
        for collection_name in process_order:
            resolver = RESOLVERS.get(collection_name, _resolve_generic)
            docs = docs_by_collection.get(collection_name, [])
            report = await _process_collection(
                db=db,
                collection_name=collection_name,
                docs=docs,
                resolver=resolver,
                state=state,
                execute=bool(args.execute),
                now_iso=now_iso,
            )
            reports[collection_name] = report

        summary = _build_summary(
            mode="execute" if args.execute else "dry-run",
            collections=process_order,
            reports=reports,
            skipped=sorted(set(skipped)),
            include_captured_unresolved=bool(args.capture_unresolved),
        )
        summary["generated_at"] = now_iso
        summary["database_url"] = database_url
        summary["default_tenant"] = (
            {
                "tenant_id": default_tenant_pair.tenant_id,
                "tenant_code": default_tenant_pair.tenant_code,
                "exists_in_tenant_master": bool(default_tenant_exists),
                "assign_unresolved_to_default": bool(args.assign_unresolved_to_default),
                "allow_nonexistent_default_tenant": bool(args.allow_nonexistent_default_tenant),
            }
            if default_tenant_pair
            else None
        )

        if args.report_json:
            report_path = Path(args.report_json).expanduser()
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(json.dumps(summary, ensure_ascii=True, indent=2), encoding="utf-8")

        print(json.dumps(summary, ensure_ascii=True, indent=2))
        unresolved = int(summary["totals"]["unresolved"])
        if args.fail_on_unresolved and unresolved > 0:
            return 2
        return 0
    finally:
        await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
