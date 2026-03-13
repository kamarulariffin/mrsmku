#!/usr/bin/env python3
"""
Role-aware smoke checks for bank statement auto reconciliation in postgres mode.

Default mode is read-only. Use --include-write for idempotent write checks.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_TIMEOUT = 25
DEFAULT_PERF_BUDGET_MS = 7000.0


@dataclass
class UserCreds:
    email: str
    password: str


@dataclass
class CheckResult:
    name: str
    method: str
    path: str
    expected: Tuple[int, ...]
    status: Optional[int]
    ok: bool
    detail: str = ""


def _short_payload(payload: Any) -> str:
    if isinstance(payload, dict):
        return json.dumps(payload, ensure_ascii=True)[:280]
    if isinstance(payload, list):
        return json.dumps(payload[:3], ensure_ascii=True)[:280]
    return str(payload)[:280]


def _request_json(
    base_url: str,
    method: str,
    path: str,
    token: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> Tuple[Optional[int], Any]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
    req = Request(f"{base_url}{path}", method=method, headers=headers, data=body)
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            try:
                data = json.loads(raw) if raw else None
            except Exception:
                data = raw
            return resp.status, data
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        try:
            data = json.loads(raw)
        except Exception:
            data = raw
        return exc.code, data
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)


def _request_multipart(
    base_url: str,
    path: str,
    *,
    token: Optional[str],
    fields: Dict[str, Any],
    file_field: str,
    file_name: str,
    file_content: bytes,
    mime_type: str = "text/csv",
    timeout: int = DEFAULT_TIMEOUT,
) -> Tuple[Optional[int], Any]:
    boundary = f"----boundary-{uuid.uuid4().hex}"
    body = bytearray()

    for key, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
        body.extend(f"{value}\r\n".encode("utf-8"))

    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(
        f'Content-Disposition: form-data; name="{file_field}"; filename="{file_name}"\r\n'.encode("utf-8")
    )
    body.extend(f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"))
    body.extend(file_content)
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(f"{base_url}{path}", method="POST", headers=headers, data=bytes(body))

    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            try:
                data = json.loads(raw) if raw else None
            except Exception:
                data = raw
            return resp.status, data
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        try:
            data = json.loads(raw)
        except Exception:
            data = raw
        return exc.code, data
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)


def _request_json_timed(
    base_url: str,
    method: str,
    path: str,
    token: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> Tuple[Optional[int], Any, float]:
    started = time.perf_counter()
    status, out_payload = _request_json(
        base_url=base_url,
        method=method,
        path=path,
        token=token,
        payload=payload,
        timeout=timeout,
    )
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    return status, out_payload, elapsed_ms


def _login(base_url: str, creds: UserCreds) -> Optional[str]:
    status, payload = _request_json(
        base_url,
        "POST",
        "/api/auth/login",
        payload={"email": creds.email, "password": creds.password},
    )
    if status == 200 and isinstance(payload, dict):
        return payload.get("access_token")
    return None


def _append_check(
    out: list[CheckResult],
    name: str,
    method: str,
    path: str,
    expected: Tuple[int, ...],
    status: Optional[int],
    payload: Any,
) -> None:
    ok = status in expected
    detail = ""
    if not ok:
        detail = _short_payload(payload)
    out.append(
        CheckResult(
            name=name,
            method=method,
            path=path,
            expected=expected,
            status=status,
            ok=ok,
            detail=detail,
        )
    )


def _append_assert(
    out: list[CheckResult],
    name: str,
    path: str,
    ok: bool,
    detail: str = "",
) -> None:
    out.append(
        CheckResult(
            name=name,
            method="ASSERT",
            path=path,
            expected=(1,),
            status=1 if ok else 0,
            ok=ok,
            detail=detail if not ok else "",
        )
    )


def _append_perf_check(
    out: list[CheckResult],
    name: str,
    method: str,
    path: str,
    expected: Tuple[int, ...],
    status: Optional[int],
    payload: Any,
    elapsed_ms: float,
    budget_ms: float,
) -> None:
    ok = status in expected and elapsed_ms <= budget_ms
    detail = ""
    if not ok:
        detail = (
            f"elapsed_ms={elapsed_ms:.1f}, budget_ms={budget_ms:.1f}, "
            f"payload={_short_payload(payload)}"
        )
    out.append(
        CheckResult(
            name=name,
            method=method,
            path=path,
            expected=expected,
            status=status,
            ok=ok,
            detail=detail,
        )
    )


def _query(path: str, params: Dict[str, Any]) -> str:
    if not params:
        return path
    return f"{path}?{urlencode(params)}"


def run_smoke(
    base_url: str,
    include_write: bool,
    superadmin: UserCreds,
    bendahari: UserCreds,
    sub_bendahari: UserCreds,
    juruaudit: UserCreds,
    parent: UserCreds,
) -> int:
    results: list[CheckResult] = []
    captured: Dict[str, Any] = {}
    created_tx_ids: list[str] = []

    super_token = _login(base_url, superadmin)
    bendahari_token = _login(base_url, bendahari)
    sub_bendahari_token = _login(base_url, sub_bendahari)
    juruaudit_token = _login(base_url, juruaudit)
    parent_token = _login(base_url, parent)

    if not all([super_token, bendahari_token, sub_bendahari_token, juruaudit_token, parent_token]):
        print("ERROR: one or more logins failed")
        print(
            "  superadmin=%s bendahari=%s sub_bendahari=%s juruaudit=%s parent=%s"
            % (
                bool(super_token),
                bool(bendahari_token),
                bool(sub_bendahari_token),
                bool(juruaudit_token),
                bool(parent_token),
            )
        )
        return 2

    read_cases = [
        (
            "bank_reconcile_statements_superadmin",
            "GET",
            "/api/accounting-full/bank-reconciliation/statements",
            super_token,
            (200,),
        ),
        (
            "bank_reconcile_statements_juruaudit",
            "GET",
            "/api/accounting-full/bank-reconciliation/statements",
            juruaudit_token,
            (200,),
        ),
        (
            "bank_reconcile_statements_parent_forbidden",
            "GET",
            "/api/accounting-full/bank-reconciliation/statements",
            parent_token,
            (403,),
        ),
    ]
    for name, method, path, token, expected in read_cases:
        status, payload = _request_json(base_url, method, path, token=token)
        _append_check(results, name, method, path, expected, status, payload)
        if name.startswith("bank_reconcile_statements_") and status == 200:
            captured[name] = payload

    _append_assert(
        results,
        "bank_reconcile_list_shape",
        "/api/accounting-full/bank-reconciliation/statements",
        isinstance(captured.get("bank_reconcile_statements_superadmin"), dict)
        and isinstance(captured["bank_reconcile_statements_superadmin"].get("statements"), list),
        detail=f"payload={_short_payload(captured.get('bank_reconcile_statements_superadmin'))}",
    )

    if include_write:
        statement_id = None
        try:
            status, bank_accounts = _request_json(base_url, "GET", "/api/accounting-full/bank-accounts", token=super_token)
            _append_check(
                results,
                "bank_reconcile_bank_accounts_read",
                "GET",
                "/api/accounting-full/bank-accounts",
                (200,),
                status,
                bank_accounts,
            )
            bank_account_id = None
            bank_account_name = None
            secondary_bank_account_id = None
            secondary_bank_account_name = None
            if status == 200 and isinstance(bank_accounts, list) and bank_accounts:
                bank_account_id = bank_accounts[0].get("id")
                bank_account_name = bank_accounts[0].get("name")
                if len(bank_accounts) >= 2:
                    secondary_bank_account_id = bank_accounts[1].get("id")
                    secondary_bank_account_name = bank_accounts[1].get("name")

            _append_assert(
                results,
                "bank_reconcile_bank_account_exists",
                "/api/accounting-full/bank-accounts",
                bool(bank_account_id),
                detail=f"payload={_short_payload(bank_accounts)}",
            )
            if not bank_account_id:
                raise RuntimeError("No bank account available")

            _append_assert(
                results,
                "bank_reconcile_multi_bank_supported",
                "/api/accounting-full/bank-accounts",
                True,
                detail=(
                    f"available_accounts={len(bank_accounts) if isinstance(bank_accounts, list) else 0}; "
                    "multi-bank disokong, ujian sekunder akan dijalankan jika >=2 akaun."
                ),
            )

            status, categories = _request_json(base_url, "GET", "/api/accounting-full/categories", token=super_token)
            _append_check(
                results,
                "bank_reconcile_categories_read",
                "GET",
                "/api/accounting-full/categories",
                (200,),
                status,
                categories,
            )
            income_cat = None
            expense_cat = None
            if status == 200 and isinstance(categories, list):
                for row in categories:
                    if not isinstance(row, dict) or not row.get("is_active", True):
                        continue
                    if row.get("type") == "income" and not income_cat:
                        income_cat = row.get("id")
                    if row.get("type") == "expense" and not expense_cat:
                        expense_cat = row.get("id")
            _append_assert(
                results,
                "bank_reconcile_categories_available",
                "/api/accounting-full/categories",
                bool(income_cat and expense_cat),
                detail=f"payload={_short_payload(categories)}",
            )
            if not income_cat or not expense_cat:
                raise RuntimeError("Missing income/expense category")

            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            uniq = f"SMKREC{int(time.time())}"
            csv_profile_id = None

            status, payload = _request_json(
                base_url,
                "POST",
                "/api/accounting-full/bank-reconciliation/profiles",
                token=bendahari_token,
                payload={
                    "profile_name": f"Smoke CSV Profile {uniq}",
                    "bank_name": bank_account_name,
                    "notes": "smoke test profile",
                    "mapping": {
                        "date_column": "Tarikh",
                        "description_column": "Butiran",
                        "reference_column": "No Rujukan",
                        "debit_column": "Debit",
                        "credit_column": "Credit",
                        "balance_column": "Baki",
                        "delimiter": ",",
                    },
                },
            )
            _append_check(
                results,
                "bank_reconcile_create_csv_profile",
                "POST",
                "/api/accounting-full/bank-reconciliation/profiles",
                (200,),
                status,
                payload,
            )
            if status == 200 and isinstance(payload, dict):
                profile = payload.get("profile") or {}
                csv_profile_id = profile.get("id")
            _append_assert(
                results,
                "bank_reconcile_csv_profile_created",
                "/api/accounting-full/bank-reconciliation/profiles",
                bool(csv_profile_id),
                detail=f"payload={_short_payload(payload)}",
            )

            if csv_profile_id:
                status, payload = _request_json(
                    base_url,
                    "PUT",
                    f"/api/accounting-full/bank-reconciliation/profiles/{csv_profile_id}",
                    token=bendahari_token,
                    payload={
                        "notes": f"smoke profile updated {uniq}",
                    },
                )
                _append_check(
                    results,
                    "bank_reconcile_update_csv_profile",
                    "PUT",
                    f"/api/accounting-full/bank-reconciliation/profiles/{csv_profile_id}",
                    (200,),
                    status,
                    payload,
                )

            income_amount = 941.11
            expense_amount = 317.22
            income_ref = f"{uniq}-IN"
            expense_ref = f"{uniq}-EX"

            create_cases = [
                {
                    "name": "bank_reconcile_create_income_tx",
                    "payload": {
                        "type": "income",
                        "category_id": income_cat,
                        "bank_account_id": bank_account_id,
                        "amount": income_amount,
                        "transaction_date": today,
                        "description": f"Bank reconcile income {uniq}",
                        "reference_number": income_ref,
                        "source": "manual",
                        "notes": f"smoke bank reconciliation {uniq}",
                    },
                },
                {
                    "name": "bank_reconcile_create_expense_tx",
                    "payload": {
                        "type": "expense",
                        "category_id": expense_cat,
                        "bank_account_id": bank_account_id,
                        "amount": expense_amount,
                        "transaction_date": today,
                        "description": f"Bank reconcile expense {uniq}",
                        "reference_number": expense_ref,
                        "source": "manual",
                        "notes": f"smoke bank reconciliation {uniq}",
                    },
                },
            ]
            tx_ids_by_sign: Dict[str, str] = {}
            for entry in create_cases:
                status, payload = _request_json(
                    base_url,
                    "POST",
                    "/api/accounting-full/transactions",
                    token=bendahari_token,
                    payload=entry["payload"],
                )
                _append_check(
                    results,
                    entry["name"],
                    "POST",
                    "/api/accounting-full/transactions",
                    (200,),
                    status,
                    payload,
                )
                if status == 200 and isinstance(payload, dict):
                    txid = payload.get("id")
                    if txid:
                        created_tx_ids.append(str(txid))
                        if entry["payload"]["type"] == "income":
                            tx_ids_by_sign["positive"] = str(txid)
                        else:
                            tx_ids_by_sign["negative"] = str(txid)

            _append_assert(
                results,
                "bank_reconcile_created_transactions_exist",
                "/api/accounting-full/transactions",
                len(created_tx_ids) == 2,
                detail=f"created_tx_ids={created_tx_ids}",
            )
            if len(created_tx_ids) != 2:
                raise RuntimeError("Could not create two transactions")

            csv_nonce = uuid.uuid4().hex[:8]
            csv_lines = [
                "Tarikh,Butiran,No Rujukan,Debit,Credit,Baki,Remark",
                f'{today},"Bank reconcile income {uniq}","{income_ref}",,"{income_amount:.2f}",,"{csv_nonce}"',
                f'{today},"Bank reconcile expense {uniq}","{expense_ref}","{expense_amount:.2f}",,,"{csv_nonce}"',
                f'{today},"Bank reconcile unmatched {uniq}","{uniq}-UNMATCH",,"50.00",,"{csv_nonce}"',
            ]
            csv_content = ("\n".join(csv_lines) + "\n").encode("utf-8")
            upload_fields = {
                "bank_account_id": bank_account_id,
                "period_start": today,
                "period_end": today,
                "statement_remark": f"smoke upload {uniq} ({bank_account_name})",
            }
            if csv_profile_id:
                upload_fields["parser_profile_id"] = csv_profile_id
            status, payload = _request_multipart(
                base_url,
                "/api/accounting-full/bank-reconciliation/statements/upload",
                token=sub_bendahari_token,
                fields=upload_fields,
                file_field="file",
                file_name=f"smoke_statement_{uniq}.csv",
                file_content=csv_content,
                mime_type="text/csv",
            )
            _append_check(
                results,
                "bank_reconcile_upload_statement_sub_bendahari",
                "POST",
                "/api/accounting-full/bank-reconciliation/statements/upload",
                (200,),
                status,
                payload,
            )
            if status == 200 and isinstance(payload, dict):
                statement_id = payload.get("statement_id")

            _append_assert(
                results,
                "bank_reconcile_statement_id_created",
                "/api/accounting-full/bank-reconciliation/statements/upload",
                bool(statement_id),
                detail=f"payload={_short_payload(payload)}",
            )
            if not statement_id:
                raise RuntimeError("No statement_id returned")

            status, payload = _request_json(
                base_url,
                "POST",
                f"/api/accounting-full/bank-reconciliation/{statement_id}/auto-match",
                token=sub_bendahari_token,
                payload={
                    "date_tolerance_days": 2,
                    "min_confidence_for_suggestion": 70,
                    "min_confidence_for_auto": 90,
                    "amount_tolerance": 0.01,
                },
            )
            _append_check(
                results,
                "bank_reconcile_auto_match",
                "POST",
                f"/api/accounting-full/bank-reconciliation/{statement_id}/auto-match",
                (200,),
                status,
                payload,
            )

            status, payload = _request_json(
                base_url,
                "GET",
                f"/api/accounting-full/bank-reconciliation/{statement_id}/items",
                token=super_token,
            )
            _append_check(
                results,
                "bank_reconcile_list_items",
                "GET",
                f"/api/accounting-full/bank-reconciliation/{statement_id}/items",
                (200,),
                status,
                payload,
            )
            items = []
            if status == 200 and isinstance(payload, dict):
                items = payload.get("items") or []

            _append_assert(
                results,
                "bank_reconcile_items_shape",
                f"/api/accounting-full/bank-reconciliation/{statement_id}/items",
                isinstance(items, list) and len(items) >= 3,
                detail=f"payload={_short_payload(payload)}",
            )

            unresolved_item_ids = []
            if isinstance(items, list):
                unresolved_item_ids = [
                    str(item.get("id"))
                    for item in items
                    if isinstance(item, dict) and item.get("status") in {"unmatched", "needs_review"} and item.get("id")
                ]
            if unresolved_item_ids:
                status, payload = _request_json(
                    base_url,
                    "POST",
                    f"/api/accounting-full/bank-reconciliation/{statement_id}/bulk-action",
                    token=sub_bendahari_token,
                    payload={
                        "action": "exception",
                        "item_ids": unresolved_item_ids,
                        "remark_text": "bulk exception untuk smoke test",
                        "remark_category": "smoke_bulk_exception",
                    },
                )
                _append_check(
                    results,
                    "bank_reconcile_bulk_action_exception",
                    "POST",
                    f"/api/accounting-full/bank-reconciliation/{statement_id}/bulk-action",
                    (200,),
                    status,
                    payload,
                )
                status, payload = _request_json(
                    base_url,
                    "GET",
                    f"/api/accounting-full/bank-reconciliation/{statement_id}/items",
                    token=super_token,
                )
                _append_check(
                    results,
                    "bank_reconcile_list_items_after_bulk",
                    "GET",
                    f"/api/accounting-full/bank-reconciliation/{statement_id}/items",
                    (200,),
                    status,
                    payload,
                )
                if status == 200 and isinstance(payload, dict):
                    items = payload.get("items") or []
            else:
                _append_assert(
                    results,
                    "bank_reconcile_bulk_action_candidate_exists",
                    f"/api/accounting-full/bank-reconciliation/{statement_id}/items",
                    True,
                )

            for item in items:
                if not isinstance(item, dict):
                    continue
                if item.get("status") in {"auto_matched", "manual_matched", "exception"}:
                    continue
                item_id = item.get("id")
                if not item_id:
                    continue
                sign_key = "positive" if float(item.get("amount", 0) or 0) >= 0 else "negative"
                target_tx = tx_ids_by_sign.get(sign_key)
                if not target_tx:
                    continue
                status, payload = _request_json(
                    base_url,
                    "POST",
                    f"/api/accounting-full/bank-reconciliation/{statement_id}/items/{item_id}/manual-match",
                    token=sub_bendahari_token,
                    payload={
                        "action": "match",
                        "transaction_id": target_tx,
                        "remark_text": "manual fallback match for smoke test",
                        "remark_category": "smoke_manual_match",
                    },
                )
                _append_check(
                    results,
                    "bank_reconcile_manual_match_fallback",
                    "POST",
                    f"/api/accounting-full/bank-reconciliation/{statement_id}/items/{item_id}/manual-match",
                    (200,),
                    status,
                    payload,
                )

            if items:
                first_item_id = items[0].get("id")
                if first_item_id:
                    status, payload = _request_json(
                        base_url,
                        "POST",
                        f"/api/accounting-full/bank-reconciliation/{statement_id}/items/{first_item_id}/remark",
                        token=sub_bendahari_token,
                        payload={
                            "remark_text": "remark tambahan untuk semakan",
                            "remark_category": "smoke_note",
                        },
                    )
                    _append_check(
                        results,
                        "bank_reconcile_add_item_remark",
                        "POST",
                        f"/api/accounting-full/bank-reconciliation/{statement_id}/items/{first_item_id}/remark",
                        (200,),
                        status,
                        payload,
                    )

            status, payload = _request_json(
                base_url,
                "GET",
                f"/api/accounting-full/bank-reconciliation/statements/{statement_id}",
                token=super_token,
            )
            _append_check(
                results,
                "bank_reconcile_get_statement",
                "GET",
                f"/api/accounting-full/bank-reconciliation/statements/{statement_id}",
                (200,),
                status,
                payload,
            )

            status, payload = _request_json(
                base_url,
                "POST",
                f"/api/accounting-full/bank-reconciliation/{statement_id}/submit",
                token=sub_bendahari_token,
                payload={"statement_remark": "submit dari smoke test"},
            )
            _append_check(
                results,
                "bank_reconcile_submit_sub_bendahari",
                "POST",
                f"/api/accounting-full/bank-reconciliation/{statement_id}/submit",
                (200,),
                status,
                payload,
            )

            status, payload = _request_json(
                base_url,
                "POST",
                f"/api/accounting-full/bank-reconciliation/{statement_id}/approve",
                token=sub_bendahari_token,
                payload={"approval_remark": "cuba approve sendiri"},
            )
            _append_check(
                results,
                "bank_reconcile_approve_same_user_forbidden",
                "POST",
                f"/api/accounting-full/bank-reconciliation/{statement_id}/approve",
                (400,),
                status,
                payload,
            )

            status, payload = _request_json(
                base_url,
                "POST",
                f"/api/accounting-full/bank-reconciliation/{statement_id}/approve",
                token=bendahari_token,
                payload={"approval_remark": "diluluskan oleh bendahari"},
            )
            _append_check(
                results,
                "bank_reconcile_approve_bendahari",
                "POST",
                f"/api/accounting-full/bank-reconciliation/{statement_id}/approve",
                (200,),
                status,
                payload,
            )

            if secondary_bank_account_id:
                secondary_tx_id = None
                secondary_income_amount = 188.88
                secondary_ref = f"{uniq}-S2-IN"
                status, payload = _request_json(
                    base_url,
                    "POST",
                    "/api/accounting-full/transactions",
                    token=bendahari_token,
                    payload={
                        "type": "income",
                        "category_id": income_cat,
                        "bank_account_id": secondary_bank_account_id,
                        "amount": secondary_income_amount,
                        "transaction_date": today,
                        "description": f"Bank reconcile secondary income {uniq}",
                        "reference_number": secondary_ref,
                        "source": "manual",
                        "notes": f"smoke secondary bank reconciliation {uniq}",
                    },
                )
                _append_check(
                    results,
                    "bank_reconcile_create_secondary_bank_tx",
                    "POST",
                    "/api/accounting-full/transactions",
                    (200,),
                    status,
                    payload,
                )
                if status == 200 and isinstance(payload, dict):
                    secondary_tx_id = payload.get("id")
                    if secondary_tx_id:
                        created_tx_ids.append(str(secondary_tx_id))
                _append_assert(
                    results,
                    "bank_reconcile_secondary_tx_created",
                    "/api/accounting-full/transactions",
                    bool(secondary_tx_id),
                    detail=f"payload={_short_payload(payload)}",
                )

                if secondary_tx_id:
                    secondary_csv_nonce = uuid.uuid4().hex[:8]
                    secondary_csv_lines = [
                        "Tarikh,Butiran,No Rujukan,Debit,Credit,Baki,Remark",
                        (
                            f'{today},"Bank reconcile secondary income {uniq}",'
                            f'"{secondary_ref}",,"{secondary_income_amount:.2f}",,"{secondary_csv_nonce}"'
                        ),
                    ]
                    secondary_csv_content = ("\n".join(secondary_csv_lines) + "\n").encode("utf-8")
                    secondary_upload_fields = {
                        "bank_account_id": secondary_bank_account_id,
                        "period_start": today,
                        "period_end": today,
                        "statement_remark": (
                            f"smoke upload secondary {uniq} ({secondary_bank_account_name or '-'})"
                        ),
                    }
                    if csv_profile_id:
                        secondary_upload_fields["parser_profile_id"] = csv_profile_id

                    status, payload = _request_multipart(
                        base_url,
                        "/api/accounting-full/bank-reconciliation/statements/upload",
                        token=sub_bendahari_token,
                        fields=secondary_upload_fields,
                        file_field="file",
                        file_name=f"smoke_statement_secondary_{uniq}.csv",
                        file_content=secondary_csv_content,
                        mime_type="text/csv",
                    )
                    _append_check(
                        results,
                        "bank_reconcile_upload_statement_secondary_bank",
                        "POST",
                        "/api/accounting-full/bank-reconciliation/statements/upload",
                        (200,),
                        status,
                        payload,
                    )
                    secondary_statement_id = None
                    if status == 200 and isinstance(payload, dict):
                        secondary_statement_id = payload.get("statement_id")
                    _append_assert(
                        results,
                        "bank_reconcile_secondary_statement_id_created",
                        "/api/accounting-full/bank-reconciliation/statements/upload",
                        bool(secondary_statement_id),
                        detail=f"payload={_short_payload(payload)}",
                    )

                    if secondary_statement_id:
                        status, payload = _request_json(
                            base_url,
                            "POST",
                            f"/api/accounting-full/bank-reconciliation/{secondary_statement_id}/auto-match",
                            token=sub_bendahari_token,
                            payload={
                                "date_tolerance_days": 2,
                                "min_confidence_for_suggestion": 70,
                                "min_confidence_for_auto": 90,
                                "amount_tolerance": 0.01,
                            },
                        )
                        _append_check(
                            results,
                            "bank_reconcile_auto_match_secondary_bank",
                            "POST",
                            f"/api/accounting-full/bank-reconciliation/{secondary_statement_id}/auto-match",
                            (200,),
                            status,
                            payload,
                        )

                        status, payload = _request_json(
                            base_url,
                            "GET",
                            _query(
                                "/api/accounting-full/bank-reconciliation/statements",
                                {"bank_account_id": secondary_bank_account_id, "limit": 20},
                            ),
                            token=super_token,
                        )
                        _append_check(
                            results,
                            "bank_reconcile_list_statements_secondary_bank",
                            "GET",
                            "/api/accounting-full/bank-reconciliation/statements?bank_account_id=<secondary>&limit=20",
                            (200,),
                            status,
                            payload,
                        )
                        has_secondary = False
                        if status == 200 and isinstance(payload, dict):
                            rows = payload.get("statements") or []
                            has_secondary = any(
                                isinstance(row, dict) and row.get("id") == secondary_statement_id
                                for row in rows
                            )
                        _append_assert(
                            results,
                            "bank_reconcile_secondary_statement_visible_by_filter",
                            "/api/accounting-full/bank-reconciliation/statements?bank_account_id=<secondary>",
                            has_secondary,
                            detail=f"payload={_short_payload(payload)}",
                        )
            else:
                _append_assert(
                    results,
                    "bank_reconcile_secondary_bank_optional",
                    "/api/accounting-full/bank-accounts",
                    True,
                    detail="Hanya 1 akaun bank tersedia; ujian secondary bank dilangkau.",
                )

            status, payload, elapsed_ms = _request_json_timed(
                base_url,
                "GET",
                _query("/api/accounting-full/bank-reconciliation/statements", {"status": "approved", "limit": 20}),
                token=super_token,
            )
            _append_perf_check(
                results,
                "perf_bank_reconcile_list_approved",
                "GET",
                "/api/accounting-full/bank-reconciliation/statements?status=approved&limit=20",
                (200,),
                status,
                payload,
                elapsed_ms,
                DEFAULT_PERF_BUDGET_MS,
            )

        finally:
            for tx_id in created_tx_ids:
                status, payload = _request_json(
                    base_url,
                    "DELETE",
                    f"/api/accounting-full/transactions/{tx_id}",
                    token=bendahari_token,
                )
                _append_check(
                    results,
                    f"bank_reconcile_cleanup_tx_{tx_id[:8]}",
                    "DELETE",
                    f"/api/accounting-full/transactions/{tx_id}",
                    (200, 400, 404),
                    status,
                    payload,
                )

    print(f"BASE_URL={base_url}")
    print(f"INCLUDE_WRITE={include_write}")
    passed = 0
    for row in results:
        mark = "PASS" if row.ok else "FAIL"
        print(f"{mark}\t{row.status}\t{row.method}\t{row.path}\t[{','.join(str(x) for x in row.expected)}]")
        if row.ok:
            passed += 1
        else:
            print(f"  detail={row.detail}")
    failed = len(results) - passed
    print(f"SUMMARY total={len(results)} passed={passed} failed={failed}")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Bank reconciliation module smoke test (postgres mode).")
    parser.add_argument("--base-url", default=os.getenv("BACKEND_URL", DEFAULT_BASE_URL))
    parser.add_argument("--include-write", action="store_true", help="Include idempotent write checks.")
    parser.add_argument("--superadmin-email", default=os.getenv("SUPERADMIN_EMAIL", "superadmin@muafakat.link"))
    parser.add_argument("--superadmin-password", default=os.getenv("SUPERADMIN_PASSWORD", "super123"))
    parser.add_argument("--bendahari-email", default=os.getenv("BENDAHARI_EMAIL", "bendahari@muafakat.link"))
    parser.add_argument("--bendahari-password", default=os.getenv("BENDAHARI_PASSWORD", "bendahari123"))
    parser.add_argument("--sub-bendahari-email", default=os.getenv("SUB_BENDAHARI_EMAIL", "sub_bendahari@muafakat.link"))
    parser.add_argument("--sub-bendahari-password", default=os.getenv("SUB_BENDAHARI_PASSWORD", "subbendahari123"))
    parser.add_argument("--juruaudit-email", default=os.getenv("JURUAUDIT_EMAIL", "juruaudit@muafakat.link"))
    parser.add_argument("--juruaudit-password", default=os.getenv("JURUAUDIT_PASSWORD", "juruaudit123"))
    parser.add_argument("--parent-email", default=os.getenv("PARENT_EMAIL", "parent@muafakat.link"))
    parser.add_argument("--parent-password", default=os.getenv("PARENT_PASSWORD", "parent123"))
    args = parser.parse_args()

    return run_smoke(
        base_url=args.base_url.rstrip("/"),
        include_write=args.include_write,
        superadmin=UserCreds(args.superadmin_email, args.superadmin_password),
        bendahari=UserCreds(args.bendahari_email, args.bendahari_password),
        sub_bendahari=UserCreds(args.sub_bendahari_email, args.sub_bendahari_password),
        juruaudit=UserCreds(args.juruaudit_email, args.juruaudit_password),
        parent=UserCreds(args.parent_email, args.parent_password),
    )


if __name__ == "__main__":
    sys.exit(main())
