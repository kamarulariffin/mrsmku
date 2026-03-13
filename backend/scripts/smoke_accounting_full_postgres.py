#!/usr/bin/env python3
"""
Role-aware smoke checks for Accounting Full module in postgres-only mode.

Default mode is read-only. Use --include-write for idempotent write checks.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime
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
    year: int,
    include_write: bool,
    superadmin: UserCreds,
    bendahari: UserCreds,
    juruaudit: UserCreds,
    parent: UserCreds,
) -> int:
    results: list[CheckResult] = []

    super_token = _login(base_url, superadmin)
    bendahari_token = _login(base_url, bendahari)
    juruaudit_token = _login(base_url, juruaudit)
    parent_token = _login(base_url, parent)

    if not all([super_token, bendahari_token, juruaudit_token, parent_token]):
        print("ERROR: one or more logins failed")
        print(f"  superadmin={bool(super_token)} bendahari={bool(bendahari_token)} juruaudit={bool(juruaudit_token)} parent={bool(parent_token)}")
        return 2

    # Dynamic IDs
    transaction_id = None
    captured: Dict[str, Any] = {}
    status, payload = _request_json(
        base_url,
        "GET",
        _query("/api/accounting-full/transactions", {"page": 1, "limit": 10}),
        token=super_token,
    )
    if status == 200 and isinstance(payload, dict):
        rows = payload.get("transactions") or payload.get("data") or []
        if rows:
            transaction_id = rows[0].get("id")

    read_cases = [
        ("categories_superadmin", "GET", "/api/accounting-full/categories", super_token, (200,)),
        ("chart_of_accounts", "GET", "/api/accounting-full/chart-of-accounts", super_token, (200,)),
        ("transactions", "GET", _query("/api/accounting-full/transactions", {"page": 1, "limit": 20}), super_token, (200,)),
        ("pending_verification", "GET", "/api/accounting-full/pending-verification", super_token, (200,)),
        ("period_locks", "GET", "/api/accounting-full/period-locks", super_token, (200,)),
        ("monthly_report", "GET", _query("/api/accounting-full/reports/monthly", {"year": year, "month": 1}), super_token, (200,)),
        ("annual_report", "GET", _query("/api/accounting-full/reports/annual", {"year": year}), super_token, (200,)),
        ("balance_sheet_report", "GET", "/api/accounting-full/reports/balance-sheet", super_token, (200,)),
        ("dashboard_stats", "GET", "/api/accounting-full/dashboard/stats", super_token, (200,)),
        ("audit_logs_superadmin", "GET", "/api/accounting-full/audit-logs", super_token, (200,)),
        ("summary", "GET", "/api/accounting-full/summary", super_token, (200,)),
        ("monthly_trend", "GET", "/api/accounting-full/monthly-trend", super_token, (200,)),
        ("bank_accounts", "GET", "/api/accounting-full/bank-accounts", super_token, (200,)),
        ("financial_years", "GET", "/api/accounting-full/financial-years", super_token, (200,)),
        ("financial_years_current", "GET", "/api/accounting-full/financial-years/current", super_token, (200,)),
        ("opening_balances", "GET", "/api/accounting-full/opening-balances", super_token, (200,)),
        ("agm_income_expenditure", "GET", "/api/accounting-full/agm/income-expenditure", super_token, (200,)),
        ("agm_balance_sheet", "GET", "/api/accounting-full/agm/balance-sheet", super_token, (200,)),
        ("agm_cash_flow", "GET", "/api/accounting-full/agm/cash-flow", super_token, (200,)),
        ("agm_executive_summary", "GET", "/api/accounting-full/agm/executive-summary", super_token, (200,)),
        ("agm_available_reports", "GET", "/api/accounting-full/agm/available-reports", super_token, (200,)),
        ("agm_trial_balance", "GET", "/api/accounting-full/agm/trial-balance?period_type=financial_year", super_token, (200,)),
        # Role matrix checks
        ("categories_bendahari", "GET", "/api/accounting-full/categories", bendahari_token, (200,)),
        ("categories_parent_forbidden", "GET", "/api/accounting-full/categories", parent_token, (403,)),
        ("audit_logs_juruaudit", "GET", "/api/accounting-full/audit-logs", juruaudit_token, (200,)),
        ("audit_logs_bendahari_forbidden", "GET", "/api/accounting-full/audit-logs", bendahari_token, (403,)),
        ("audit_logs_parent_forbidden", "GET", "/api/accounting-full/audit-logs", parent_token, (403,)),
        ("pending_verification_juruaudit", "GET", "/api/accounting-full/pending-verification", juruaudit_token, (200,)),
        ("pending_verification_bendahari_forbidden", "GET", "/api/accounting-full/pending-verification", bendahari_token, (403,)),
        ("pending_verification_parent_forbidden", "GET", "/api/accounting-full/pending-verification", parent_token, (403,)),
        ("bank_accounts_parent_forbidden", "GET", "/api/accounting-full/bank-accounts", parent_token, (403,)),
    ]

    if transaction_id:
        read_cases.append(
            ("transaction_detail", "GET", f"/api/accounting-full/transactions/{transaction_id}", super_token, (200,))
        )
        read_cases.append(
            ("transaction_journal", "GET", f"/api/accounting-full/transactions/{transaction_id}/journal", super_token, (200, 404))
        )

    for name, method, path, token, expected in read_cases:
        status, payload = _request_json(base_url, method, path, token=token)
        _append_check(results, name, method, path, expected, status, payload)
        if name in {
            "categories_superadmin",
            "chart_of_accounts",
            "transactions",
            "pending_verification",
            "period_locks",
            "monthly_report",
            "annual_report",
            "balance_sheet_report",
            "dashboard_stats",
            "audit_logs_superadmin",
            "summary",
            "monthly_trend",
            "bank_accounts",
            "financial_years",
            "financial_years_current",
            "opening_balances",
            "agm_income_expenditure",
            "agm_balance_sheet",
            "agm_cash_flow",
            "agm_executive_summary",
            "agm_available_reports",
            "agm_trial_balance",
            "transaction_detail",
            "transaction_journal",
        }:
            captured[name] = payload

    _append_assert(
        results,
        "accounting_categories_shape",
        "/api/accounting-full/categories",
        isinstance(captured.get("categories_superadmin"), list),
        detail=f"payload={_short_payload(captured.get('categories_superadmin'))}",
    )
    chart_payload = captured.get("chart_of_accounts")
    _append_assert(
        results,
        "accounting_chart_of_accounts_shape",
        "/api/accounting-full/chart-of-accounts",
        isinstance(chart_payload, list) or isinstance(chart_payload, dict),
        detail=f"payload={_short_payload(chart_payload)}",
    )
    tx_payload = captured.get("transactions")
    _append_assert(
        results,
        "accounting_transactions_shape",
        "/api/accounting-full/transactions?page=1&limit=20",
        isinstance(tx_payload, dict)
        and (isinstance(tx_payload.get("transactions"), list) or isinstance(tx_payload.get("data"), list)),
        detail=f"payload={_short_payload(tx_payload)}",
    )
    _append_assert(
        results,
        "accounting_pending_verification_shape",
        "/api/accounting-full/pending-verification",
        isinstance(captured.get("pending_verification"), (list, dict)),
        detail=f"payload={_short_payload(captured.get('pending_verification'))}",
    )
    _append_assert(
        results,
        "accounting_period_locks_shape",
        "/api/accounting-full/period-locks",
        isinstance(captured.get("period_locks"), (list, dict)),
        detail=f"payload={_short_payload(captured.get('period_locks'))}",
    )
    _append_assert(
        results,
        "accounting_monthly_report_shape",
        _query("/api/accounting-full/reports/monthly", {"year": year, "month": 1}),
        isinstance(captured.get("monthly_report"), dict),
        detail=f"payload={_short_payload(captured.get('monthly_report'))}",
    )
    _append_assert(
        results,
        "accounting_annual_report_shape",
        _query("/api/accounting-full/reports/annual", {"year": year}),
        isinstance(captured.get("annual_report"), dict),
        detail=f"payload={_short_payload(captured.get('annual_report'))}",
    )
    _append_assert(
        results,
        "accounting_balance_sheet_shape",
        "/api/accounting-full/reports/balance-sheet",
        isinstance(captured.get("balance_sheet_report"), dict),
        detail=f"payload={_short_payload(captured.get('balance_sheet_report'))}",
    )
    _append_assert(
        results,
        "accounting_dashboard_stats_shape",
        "/api/accounting-full/dashboard/stats",
        isinstance(captured.get("dashboard_stats"), dict),
        detail=f"payload={_short_payload(captured.get('dashboard_stats'))}",
    )
    _append_assert(
        results,
        "accounting_summary_shape",
        "/api/accounting-full/summary",
        isinstance(captured.get("summary"), dict),
        detail=f"payload={_short_payload(captured.get('summary'))}",
    )
    monthly_trend_payload = captured.get("monthly_trend")
    _append_assert(
        results,
        "accounting_monthly_trend_shape",
        "/api/accounting-full/monthly-trend",
        isinstance(monthly_trend_payload, list) or isinstance(monthly_trend_payload, dict),
        detail=f"payload={_short_payload(monthly_trend_payload)}",
    )
    _append_assert(
        results,
        "accounting_bank_accounts_shape",
        "/api/accounting-full/bank-accounts",
        isinstance(captured.get("bank_accounts"), list),
        detail=f"payload={_short_payload(captured.get('bank_accounts'))}",
    )
    _append_assert(
        results,
        "accounting_financial_years_shape",
        "/api/accounting-full/financial-years",
        isinstance(captured.get("financial_years"), list),
        detail=f"payload={_short_payload(captured.get('financial_years'))}",
    )
    _append_assert(
        results,
        "accounting_financial_year_current_shape",
        "/api/accounting-full/financial-years/current",
        isinstance(captured.get("financial_years_current"), dict),
        detail=f"payload={_short_payload(captured.get('financial_years_current'))}",
    )
    _append_assert(
        results,
        "accounting_opening_balances_shape",
        "/api/accounting-full/opening-balances",
        isinstance(captured.get("opening_balances"), (list, dict)),
        detail=f"payload={_short_payload(captured.get('opening_balances'))}",
    )
    _append_assert(
        results,
        "accounting_agm_exec_summary_shape",
        "/api/accounting-full/agm/executive-summary",
        isinstance(captured.get("agm_executive_summary"), dict),
        detail=f"payload={_short_payload(captured.get('agm_executive_summary'))}",
    )
    _append_assert(
        results,
        "accounting_agm_trial_balance_shape",
        "/api/accounting-full/agm/trial-balance?period_type=financial_year",
        isinstance(captured.get("agm_trial_balance"), (list, dict)),
        detail=f"payload={_short_payload(captured.get('agm_trial_balance'))}",
    )
    if transaction_id:
        _append_assert(
            results,
            "accounting_transaction_detail_shape",
            f"/api/accounting-full/transactions/{transaction_id}",
            isinstance(captured.get("transaction_detail"), dict),
            detail=f"payload={_short_payload(captured.get('transaction_detail'))}",
        )

    if include_write:
        perf_budget_ms = DEFAULT_PERF_BUDGET_MS
        status, payload = _request_json(
            base_url,
            "POST",
            "/api/accounting-full/categories/seed-defaults",
            token=super_token,
        )
        _append_check(
            results,
            "seed_default_categories_superadmin",
            "POST",
            "/api/accounting-full/categories/seed-defaults",
            (200,),
            status,
            payload,
        )
        status, payload = _request_json(
            base_url,
            "POST",
            "/api/accounting-full/categories/seed-defaults",
            token=bendahari_token,
        )
        _append_check(
            results,
            "seed_default_categories_bendahari_forbidden",
            "POST",
            "/api/accounting-full/categories/seed-defaults",
            (403,),
            status,
            payload,
        )
        status, payload = _request_json(
            base_url,
            "POST",
            "/api/accounting-full/categories/seed-defaults",
            token=parent_token,
        )
        _append_check(
            results,
            "seed_default_categories_parent_forbidden",
            "POST",
            "/api/accounting-full/categories/seed-defaults",
            (403,),
            status,
            payload,
        )

        writable_category_id = None
        writable_category_type = None
        categories_payload = captured.get("categories_superadmin")
        if isinstance(categories_payload, list):
            for row in categories_payload:
                if not isinstance(row, dict):
                    continue
                category_id = row.get("id")
                category_type = row.get("type")
                if category_id and category_type in {"income", "expense"} and row.get("is_active", True):
                    writable_category_id = category_id
                    writable_category_type = category_type
                    break

        _append_assert(
            results,
            "workflow_category_available",
            "/api/accounting-full/categories",
            bool(writable_category_id and writable_category_type),
            detail=f"payload={_short_payload(categories_payload)}",
        )

        workflow_tx_id = None
        if writable_category_id and writable_category_type:
            today_str = datetime.now().strftime("%Y-%m-%d")
            create_payload = {
                "type": writable_category_type,
                "category_id": writable_category_id,
                "amount": 321.45,
                "transaction_date": today_str,
                "description": "Smoke ACCA workflow check",
                "reference_number": f"SMK-{int(time.time())}",
                "source": "manual",
                "notes": "temporary smoke transaction",
            }
            status, payload = _request_json(
                base_url,
                "POST",
                "/api/accounting-full/transactions",
                token=bendahari_token,
                payload=create_payload,
            )
            _append_check(
                results,
                "workflow_create_transaction_bendahari",
                "POST",
                "/api/accounting-full/transactions",
                (200,),
                status,
                payload,
            )
            if status == 200 and isinstance(payload, dict):
                workflow_tx_id = payload.get("id")

        if workflow_tx_id:
            journal_path = f"/api/accounting-full/transactions/{workflow_tx_id}/journal"
            status, payload = _request_json(
                base_url,
                "GET",
                journal_path,
                token=super_token,
            )
            _append_check(
                results,
                "workflow_journal_exists_after_create",
                "GET",
                journal_path,
                (200,),
                status,
                payload,
            )
            _append_assert(
                results,
                "workflow_journal_shape_after_create",
                journal_path,
                isinstance(payload, dict)
                and payload.get("has_journal") is True
                and isinstance(payload.get("lines"), list),
                detail=f"payload={_short_payload(payload)}",
            )

            updated_amount = 411.55
            status, payload = _request_json(
                base_url,
                "PUT",
                f"/api/accounting-full/transactions/{workflow_tx_id}",
                token=bendahari_token,
                payload={
                    "amount": updated_amount,
                    "description": "Smoke ACCA workflow check updated",
                },
            )
            _append_check(
                results,
                "workflow_update_pending_transaction",
                "PUT",
                f"/api/accounting-full/transactions/{workflow_tx_id}",
                (200,),
                status,
                payload,
            )

            status, payload = _request_json(
                base_url,
                "GET",
                journal_path,
                token=super_token,
            )
            _append_check(
                results,
                "workflow_journal_exists_after_update",
                "GET",
                journal_path,
                (200,),
                status,
                payload,
            )
            journal_total_debit = None
            journal_total_credit = None
            if isinstance(payload, dict):
                try:
                    journal_total_debit = float(payload.get("total_debit"))
                except Exception:
                    journal_total_debit = None
                try:
                    journal_total_credit = float(payload.get("total_credit"))
                except Exception:
                    journal_total_credit = None
            _append_assert(
                results,
                "workflow_journal_synced_after_update",
                journal_path,
                journal_total_debit is not None
                and journal_total_credit is not None
                and abs(journal_total_debit - updated_amount) <= 0.01
                and abs(journal_total_credit - updated_amount) <= 0.01,
                detail=f"payload={_short_payload(payload)}",
            )

            status, payload = _request_json(
                base_url,
                "DELETE",
                f"/api/accounting-full/transactions/{workflow_tx_id}",
                token=bendahari_token,
            )
            _append_check(
                results,
                "workflow_delete_pending_transaction",
                "DELETE",
                f"/api/accounting-full/transactions/{workflow_tx_id}",
                (200,),
                status,
                payload,
            )

            status, payload = _request_json(
                base_url,
                "GET",
                journal_path,
                token=super_token,
            )
            _append_check(
                results,
                "workflow_journal_exists_after_delete",
                "GET",
                journal_path,
                (200,),
                status,
                payload,
            )
            _append_assert(
                results,
                "workflow_journal_void_after_delete",
                journal_path,
                isinstance(payload, dict)
                and payload.get("has_journal") is True
                and payload.get("status") == "void",
                detail=f"payload={_short_payload(payload)}",
            )

        perf_cases = [
            (
                "perf_accounting_transactions",
                "GET",
                _query("/api/accounting-full/transactions", {"page": 1, "limit": 20}),
                super_token,
                (200,),
            ),
            ("perf_accounting_dashboard_stats", "GET", "/api/accounting-full/dashboard/stats", super_token, (200,)),
            ("perf_accounting_summary", "GET", "/api/accounting-full/summary", super_token, (200,)),
            ("perf_accounting_monthly_trend", "GET", "/api/accounting-full/monthly-trend", super_token, (200,)),
            (
                "perf_accounting_annual_report",
                "GET",
                _query("/api/accounting-full/reports/annual", {"year": year}),
                super_token,
                (200,),
            ),
            ("perf_accounting_balance_sheet", "GET", "/api/accounting-full/reports/balance-sheet", super_token, (200,)),
            ("perf_accounting_agm_exec_summary", "GET", "/api/accounting-full/agm/executive-summary", super_token, (200,)),
        ]
        for name, method, path, token, expected in perf_cases:
            status, payload, elapsed_ms = _request_json_timed(
                base_url,
                method,
                path,
                token=token,
            )
            _append_perf_check(
                results,
                name,
                method,
                path,
                expected,
                status,
                payload,
                elapsed_ms,
                perf_budget_ms,
            )

    print(f"BASE_URL={base_url}")
    print(f"YEAR={year}")
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
    parser = argparse.ArgumentParser(description="Accounting Full module smoke test (postgres mode).")
    parser.add_argument("--base-url", default=os.getenv("BACKEND_URL", DEFAULT_BASE_URL))
    parser.add_argument("--year", type=int, default=int(os.getenv("ACCOUNTING_TEST_YEAR", datetime.now().year)))
    parser.add_argument("--include-write", action="store_true", help="Include idempotent write checks.")
    parser.add_argument("--superadmin-email", default=os.getenv("SUPERADMIN_EMAIL", "superadmin@muafakat.link"))
    parser.add_argument("--superadmin-password", default=os.getenv("SUPERADMIN_PASSWORD", "super123"))
    parser.add_argument("--bendahari-email", default=os.getenv("BENDAHARI_EMAIL", "bendahari@muafakat.link"))
    parser.add_argument("--bendahari-password", default=os.getenv("BENDAHARI_PASSWORD", "bendahari123"))
    parser.add_argument("--juruaudit-email", default=os.getenv("JURUAUDIT_EMAIL", "juruaudit@muafakat.link"))
    parser.add_argument("--juruaudit-password", default=os.getenv("JURUAUDIT_PASSWORD", "juruaudit123"))
    parser.add_argument("--parent-email", default=os.getenv("PARENT_EMAIL", "parent@muafakat.link"))
    parser.add_argument("--parent-password", default=os.getenv("PARENT_PASSWORD", "parent123"))
    args = parser.parse_args()

    return run_smoke(
        base_url=args.base_url.rstrip("/"),
        year=args.year,
        include_write=args.include_write,
        superadmin=UserCreds(args.superadmin_email, args.superadmin_password),
        bendahari=UserCreds(args.bendahari_email, args.bendahari_password),
        juruaudit=UserCreds(args.juruaudit_email, args.juruaudit_password),
        parent=UserCreds(args.parent_email, args.parent_password),
    )


if __name__ == "__main__":
    sys.exit(main())
