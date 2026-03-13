#!/usr/bin/env python3
"""
Role-aware smoke checks for legacy accounting module in postgres mode.

Default mode is read-only. Use --include-write to run extended validation
and performance checks (no persistent write mutation required).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_TIMEOUT = 30
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
        return json.dumps(payload, ensure_ascii=True)[:300]
    return str(payload)[:300]


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
            raw = resp.read().decode("utf-8", errors="ignore")
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


def run_smoke(
    base_url: str,
    include_write: bool,
    superadmin: UserCreds,
    parent: UserCreds,
) -> int:
    results: list[CheckResult] = []

    super_token = _login(base_url, superadmin)
    parent_token = _login(base_url, parent)
    if not super_token:
        print("ERROR: superadmin login failed")
        return 2
    if not parent_token:
        print("ERROR: parent login failed")
        return 2

    captured: Dict[str, Any] = {}

    read_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
        ("accounting_summary_superadmin", "GET", "/api/accounting/summary", super_token, (200,), None),
        (
            "accounting_summary_date_filtered",
            "GET",
            "/api/accounting/summary?start_date=2026-01-01&end_date=2026-12-31",
            super_token,
            (200,),
            None,
        ),
        ("accounting_summary_parent_forbidden", "GET", "/api/accounting/summary", parent_token, (403,), None),
        ("accounting_monthly_trend_superadmin", "GET", "/api/accounting/monthly-trend?months=6", super_token, (200,), None),
        ("accounting_monthly_trend_parent_forbidden", "GET", "/api/accounting/monthly-trend?months=6", parent_token, (403,), None),
        ("accounting_transactions_superadmin", "GET", "/api/accounting/transactions?limit=20", super_token, (200,), None),
        (
            "accounting_transactions_module_filtered",
            "GET",
            "/api/accounting/transactions?limit=10&module=marketplace",
            super_token,
            (200,),
            None,
        ),
        ("accounting_transactions_parent_forbidden", "GET", "/api/accounting/transactions?limit=20", parent_token, (403,), None),
        ("accounting_commission_breakdown_superadmin", "GET", "/api/accounting/commission-breakdown", super_token, (200,), None),
        (
            "accounting_commission_breakdown_date_filtered",
            "GET",
            "/api/accounting/commission-breakdown?start_date=2026-01-01&end_date=2026-12-31",
            super_token,
            (200,),
            None,
        ),
        (
            "accounting_commission_breakdown_parent_forbidden",
            "GET",
            "/api/accounting/commission-breakdown",
            parent_token,
            (403,),
            None,
        ),
    ]

    for name, method, path, token, expected, req_payload in read_cases:
        status, out_payload = _request_json(base_url, method, path, token=token, payload=req_payload)
        _append_check(results, name, method, path, expected, status, out_payload)
        if name in {
            "accounting_summary_superadmin",
            "accounting_monthly_trend_superadmin",
            "accounting_transactions_superadmin",
            "accounting_commission_breakdown_superadmin",
        }:
            captured[name] = out_payload

    summary_payload = captured.get("accounting_summary_superadmin")
    _append_assert(
        results,
        "accounting_summary_shape",
        "/api/accounting/summary",
        isinstance(summary_payload, dict)
        and isinstance(summary_payload.get("period"), dict)
        and isinstance(summary_payload.get("grand_totals"), dict)
        and isinstance(summary_payload.get("accounts"), dict)
        and isinstance(summary_payload.get("accounts", {}).get("muafakat"), dict)
        and isinstance(summary_payload.get("accounts", {}).get("merchandise"), dict)
        and isinstance(summary_payload.get("accounts", {}).get("koperasi"), dict),
        detail=f"payload={_short_payload(summary_payload)}",
    )

    trend_payload = captured.get("accounting_monthly_trend_superadmin")
    trend_ok = isinstance(trend_payload, dict) and isinstance(trend_payload.get("trend"), list)
    if trend_ok and trend_payload["trend"]:
        first = trend_payload["trend"][0]
        trend_ok = (
            isinstance(first, dict)
            and "period" in first
            and "month_name" in first
            and "total" in first
        )
    _append_assert(
        results,
        "accounting_monthly_trend_shape",
        "/api/accounting/monthly-trend",
        trend_ok,
        detail=f"payload={_short_payload(trend_payload)}",
    )

    tx_payload = captured.get("accounting_transactions_superadmin")
    tx_ok = isinstance(tx_payload, dict) and isinstance(tx_payload.get("transactions"), list) and "total" in tx_payload
    if tx_ok and tx_payload["transactions"]:
        first = tx_payload["transactions"][0]
        tx_ok = (
            isinstance(first, dict)
            and "id" in first
            and "module" in first
            and "amount" in first
            and "status" in first
            and "created_at" in first
        )
    _append_assert(
        results,
        "accounting_transactions_shape",
        "/api/accounting/transactions",
        tx_ok,
        detail=f"payload={_short_payload(tx_payload)}",
    )

    breakdown_payload = captured.get("accounting_commission_breakdown_superadmin")
    breakdown_ok = (
        isinstance(breakdown_payload, dict)
        and isinstance(breakdown_payload.get("breakdown"), list)
        and isinstance(breakdown_payload.get("totals_by_type"), list)
    )
    if breakdown_ok and breakdown_payload["breakdown"]:
        first = breakdown_payload["breakdown"][0]
        breakdown_ok = (
            isinstance(first, dict)
            and "commission_type" in first
            and "module" in first
            and "total_amount" in first
            and "total_orders" in first
            and "avg_amount" in first
        )
    _append_assert(
        results,
        "accounting_commission_breakdown_shape",
        "/api/accounting/commission-breakdown",
        breakdown_ok,
        detail=f"payload={_short_payload(breakdown_payload)}",
    )

    if include_write:
        perf_budget_ms = DEFAULT_PERF_BUDGET_MS
        validation_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
            ("accounting_monthly_trend_validation", "GET", "/api/accounting/monthly-trend?months=abc", super_token, (422,), None),
            ("accounting_transactions_validation", "GET", "/api/accounting/transactions?limit=abc", super_token, (422,), None),
        ]
        for name, method, path, token, expected, req_payload in validation_cases:
            status, out_payload = _request_json(base_url, method, path, token=token, payload=req_payload)
            _append_check(results, name, method, path, expected, status, out_payload)

        perf_cases: list[
            Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]
        ] = [
            ("perf_accounting_summary", "GET", "/api/accounting/summary", super_token, (200,), None),
            ("perf_accounting_monthly_trend", "GET", "/api/accounting/monthly-trend?months=12", super_token, (200,), None),
            ("perf_accounting_transactions", "GET", "/api/accounting/transactions?limit=50", super_token, (200,), None),
            ("perf_accounting_commission_breakdown", "GET", "/api/accounting/commission-breakdown", super_token, (200,), None),
        ]
        for name, method, path, token, expected, req_payload in perf_cases:
            status, out_payload, elapsed_ms = _request_json_timed(
                base_url,
                method,
                path,
                token=token,
                payload=req_payload,
            )
            _append_perf_check(
                results,
                name,
                method,
                path,
                expected,
                status,
                out_payload,
                elapsed_ms,
                perf_budget_ms,
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
    parser = argparse.ArgumentParser(description="Legacy accounting smoke test (postgres mode).")
    parser.add_argument("--base-url", default=os.getenv("BACKEND_URL", DEFAULT_BASE_URL))
    parser.add_argument("--include-write", action="store_true", help="Include extended validation/perf checks.")
    parser.add_argument("--superadmin-email", default=os.getenv("SUPERADMIN_EMAIL", "superadmin@muafakat.link"))
    parser.add_argument("--superadmin-password", default=os.getenv("SUPERADMIN_PASSWORD", "super123"))
    parser.add_argument("--parent-email", default=os.getenv("PARENT_EMAIL", "parent@muafakat.link"))
    parser.add_argument("--parent-password", default=os.getenv("PARENT_PASSWORD", "parent123"))
    args = parser.parse_args()

    return run_smoke(
        base_url=args.base_url.rstrip("/"),
        include_write=args.include_write,
        superadmin=UserCreds(args.superadmin_email, args.superadmin_password),
        parent=UserCreds(args.parent_email, args.parent_password),
    )


if __name__ == "__main__":
    sys.exit(main())
