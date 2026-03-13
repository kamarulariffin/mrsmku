#!/usr/bin/env python3
"""
Role-aware smoke checks for Marketplace + Koperasi Commission + Student Import.

Default mode is read-only. Use --include-write to run idempotent write checks.
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
DEFAULT_PERF_BUDGET_MS = 6000.0


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


def _request(
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
            raw_bytes = resp.read()
            raw_text = raw_bytes.decode("utf-8", errors="ignore")
            try:
                data = json.loads(raw_text) if raw_text else None
            except Exception:
                # For binary endpoints (xlsx/pdf), return a lightweight marker.
                data = {"raw_bytes": len(raw_bytes)}
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


def _request_timed(
    base_url: str,
    method: str,
    path: str,
    token: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> Tuple[Optional[int], Any, float]:
    started = time.perf_counter()
    status, out_payload = _request(
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
    status, payload = _request(
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

    vendor_id = None
    product_id = None
    order_id = None
    claim_code = None
    marketplace_settings = None
    koperasi_settings = None
    captured: Dict[str, Any] = {}

    status, payload = _request(base_url, "GET", "/api/marketplace/vendors", token=super_token)
    if status == 200 and isinstance(payload, list) and payload:
        vendor_id = payload[0].get("id")

    status, payload = _request(base_url, "GET", "/api/marketplace/products", token=super_token)
    if status == 200 and isinstance(payload, list) and payload:
        product_id = payload[0].get("id")

    status, payload = _request(base_url, "GET", "/api/marketplace/orders", token=super_token)
    if status == 200 and isinstance(payload, list) and payload:
        order_id = payload[0].get("id")

    status, payload = _request(base_url, "GET", "/api/student-import/claim-codes?page=1&limit=5")
    if status == 200 and isinstance(payload, dict):
        rows = payload.get("claim_codes") or []
        if rows:
            claim_code = rows[0].get("claim_code")

    status, payload = _request(base_url, "GET", "/api/marketplace/settings", token=super_token)
    if status == 200 and isinstance(payload, dict):
        marketplace_settings = payload

    status, payload = _request(base_url, "GET", "/api/koperasi/commission/settings", token=super_token)
    if status == 200 and isinstance(payload, dict):
        koperasi_settings = payload

    read_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
        # Marketplace
        ("marketplace_settings_superadmin", "GET", "/api/marketplace/settings", super_token, (200,), None),
        ("marketplace_vendors_superadmin", "GET", "/api/marketplace/vendors", super_token, (200,), None),
        ("marketplace_products_superadmin", "GET", "/api/marketplace/products", super_token, (200,), None),
        ("marketplace_orders_superadmin", "GET", "/api/marketplace/orders", super_token, (200,), None),
        ("marketplace_dashboard_stats", "GET", "/api/marketplace/dashboard/stats", super_token, (200,), None),
        ("marketplace_categories_public", "GET", "/api/marketplace/categories", None, (200,), None),
        ("marketplace_finance_dashboard", "GET", "/api/marketplace/finance/dashboard", super_token, (200,), None),
        ("marketplace_finance_ledger", "GET", "/api/marketplace/finance/ledger?page=1&limit=5", super_token, (200,), None),
        ("marketplace_finance_vendor_summary", "GET", "/api/marketplace/finance/vendor-summary", super_token, (200,), None),
        ("marketplace_finance_commission_report", "GET", "/api/marketplace/finance/commission-report", super_token, (200,), None),
        ("marketplace_payouts_all", "GET", "/api/marketplace/payouts/all?page=1&limit=5", super_token, (200,), None),
        ("marketplace_monetization_stats", "GET", "/api/marketplace/monetization/stats", super_token, (200,), None),
        ("marketplace_analytics_sales_overview", "GET", "/api/marketplace/analytics/sales-overview", super_token, (200,), None),
        ("marketplace_settings_parent_forbidden", "GET", "/api/marketplace/settings", parent_token, (403,), None),
        ("marketplace_finance_parent_forbidden", "GET", "/api/marketplace/finance/dashboard", parent_token, (403,), None),
        # Koperasi Commission
        ("koperasi_settings_superadmin", "GET", "/api/koperasi/commission/settings", super_token, (200,), None),
        ("koperasi_report_superadmin", "GET", "/api/koperasi/commission/report", super_token, (200,), None),
        ("koperasi_report_monthly_superadmin", "GET", "/api/koperasi/commission/report/monthly", super_token, (200,), None),
        (
            "koperasi_report_export_superadmin",
            "GET",
            "/api/koperasi/commission/report/export?start_date=2026-01-01&end_date=2026-12-31",
            super_token,
            (200,),
            None,
        ),
        ("koperasi_pending_superadmin", "GET", "/api/koperasi/commission/pending", super_token, (200,), None),
        ("koperasi_settings_parent_forbidden", "GET", "/api/koperasi/commission/settings", parent_token, (403,), None),
        # Student Import
        ("student_import_template", "GET", "/api/student-import/template", None, (200,), None),
        ("student_import_claim_codes", "GET", "/api/student-import/claim-codes?page=1&limit=5", None, (200,), None),
        ("student_import_claim_codes_export", "GET", "/api/student-import/claim-codes/export", None, (200,), None),
        ("student_import_stats", "GET", "/api/student-import/stats", None, (200,), None),
        ("student_import_claim_invalid", "POST", "/api/student-import/claim", None, (404,), {"claim_code": "INVALID-CODE"}),
        (
            "student_import_claim_authenticated_invalid",
            "POST",
            "/api/student-import/claim-authenticated",
            None,
            (404,),
            {"claim_code": "INVALID-CODE"},
        ),
    ]

    if vendor_id:
        read_cases.append(
            ("marketplace_vendor_detail", "GET", f"/api/marketplace/vendors/{vendor_id}", super_token, (200,), None)
        )
        read_cases.append(
            (
                "marketplace_vendor_analytics",
                "GET",
                f"/api/marketplace/analytics/vendor/{vendor_id}",
                super_token,
                (200,),
                None,
            )
        )
    if product_id:
        read_cases.append(
            ("marketplace_product_detail", "GET", f"/api/marketplace/products/{product_id}", super_token, (200,), None)
        )
    if order_id:
        read_cases.append(
            ("marketplace_order_detail", "GET", f"/api/marketplace/orders/{order_id}", super_token, (200,), None)
        )
    if claim_code:
        read_cases.append(
            (
                "student_import_claim_slip_existing",
                "GET",
                f"/api/student-import/claim-codes/{claim_code}/slip",
                None,
                (200,),
                None,
            )
        )
    else:
        read_cases.append(
            (
                "student_import_claim_slip_missing",
                "GET",
                "/api/student-import/claim-codes/INVALID-CODE/slip",
                None,
                (404,),
                None,
            )
        )

    for name, method, path, token, expected, req_payload in read_cases:
        status, out_payload = _request(base_url, method, path, token=token, payload=req_payload)
        _append_check(results, name, method, path, expected, status, out_payload)
        if name in {
            "marketplace_settings_superadmin",
            "marketplace_vendors_superadmin",
            "marketplace_products_superadmin",
            "marketplace_orders_superadmin",
            "marketplace_dashboard_stats",
            "marketplace_finance_dashboard",
            "marketplace_analytics_sales_overview",
            "koperasi_settings_superadmin",
            "koperasi_report_superadmin",
            "koperasi_report_export_superadmin",
            "student_import_stats",
            "student_import_claim_codes",
        }:
            captured[name] = out_payload

    settings_payload = captured.get("marketplace_settings_superadmin")
    _append_assert(
        results,
        "marketplace_settings_shape",
        "/api/marketplace/settings",
        isinstance(settings_payload, dict),
        detail=f"payload={_short_payload(settings_payload)}",
    )

    vendors_payload = captured.get("marketplace_vendors_superadmin")
    _append_assert(
        results,
        "marketplace_vendors_shape",
        "/api/marketplace/vendors",
        isinstance(vendors_payload, list),
        detail=f"payload={_short_payload(vendors_payload)}",
    )

    products_payload = captured.get("marketplace_products_superadmin")
    _append_assert(
        results,
        "marketplace_products_shape",
        "/api/marketplace/products",
        isinstance(products_payload, list),
        detail=f"payload={_short_payload(products_payload)}",
    )

    orders_payload = captured.get("marketplace_orders_superadmin")
    _append_assert(
        results,
        "marketplace_orders_shape",
        "/api/marketplace/orders",
        isinstance(orders_payload, list),
        detail=f"payload={_short_payload(orders_payload)}",
    )

    finance_payload = captured.get("marketplace_finance_dashboard")
    _append_assert(
        results,
        "marketplace_finance_dashboard_shape",
        "/api/marketplace/finance/dashboard",
        isinstance(finance_payload, dict),
        detail=f"payload={_short_payload(finance_payload)}",
    )

    analytics_payload = captured.get("marketplace_analytics_sales_overview")
    _append_assert(
        results,
        "marketplace_analytics_sales_shape",
        "/api/marketplace/analytics/sales-overview",
        isinstance(analytics_payload, dict),
        detail=f"payload={_short_payload(analytics_payload)}",
    )

    koperasi_payload = captured.get("koperasi_settings_superadmin")
    _append_assert(
        results,
        "koperasi_settings_shape",
        "/api/koperasi/commission/settings",
        isinstance(koperasi_payload, dict),
        detail=f"payload={_short_payload(koperasi_payload)}",
    )

    student_import_stats = captured.get("student_import_stats")
    _append_assert(
        results,
        "student_import_stats_shape",
        "/api/student-import/stats",
        isinstance(student_import_stats, dict),
        detail=f"payload={_short_payload(student_import_stats)}",
    )

    claim_codes_payload = captured.get("student_import_claim_codes")
    _append_assert(
        results,
        "student_import_claim_codes_shape",
        "/api/student-import/claim-codes?page=1&limit=5",
        isinstance(claim_codes_payload, dict) and isinstance(claim_codes_payload.get("claim_codes"), list),
        detail=f"payload={_short_payload(claim_codes_payload)}",
    )

    export_payload = captured.get("koperasi_report_export_superadmin")
    _append_assert(
        results,
        "koperasi_report_export_shape",
        "/api/koperasi/commission/report/export?start_date=2026-01-01&end_date=2026-12-31",
        isinstance(export_payload, dict)
        and (
            "raw_bytes" in export_payload
            or "file_url" in export_payload
            or "message" in export_payload
            or "report" in export_payload
        ),
        detail=f"payload={_short_payload(export_payload)}",
    )

    if include_write:
        perf_budget_ms = DEFAULT_PERF_BUDGET_MS
        write_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = []

        if isinstance(marketplace_settings, dict):
            ad_packages = marketplace_settings.get("ad_packages") or {}
            bronze = ad_packages.get("bronze", {}).get("price", 25.0)
            silver = ad_packages.get("silver", {}).get("price", 90.0)
            gold = ad_packages.get("gold", {}).get("price", 500.0)
            write_cases.extend(
                [
                    (
                        "marketplace_put_commission_settings",
                        "PUT",
                        "/api/marketplace/settings/commission",
                        super_token,
                        (200,),
                        {
                            "dana_kecemerlangan_percent": marketplace_settings.get("dana_kecemerlangan_percent", 5.0),
                            "koperasi_percent": marketplace_settings.get("koperasi_percent", 5.0),
                            "vendor_percent": marketplace_settings.get("vendor_percent", 90.0),
                            "vendor_registration_fee": marketplace_settings.get("vendor_registration_fee", 20.0),
                        },
                    ),
                    (
                        "marketplace_put_ad_packages",
                        "PUT",
                        "/api/marketplace/settings/ad-packages",
                        super_token,
                        (200,),
                        {"bronze_price": bronze, "silver_price": silver, "gold_price": gold},
                    ),
                ]
            )

        if isinstance(koperasi_settings, dict):
            rate = float(koperasi_settings.get("pum_commission_rate", 10.0))
            enabled = bool(koperasi_settings.get("commission_enabled", True))
            enabled_flag = "true" if enabled else "false"
            write_cases.append(
                (
                    "koperasi_put_settings",
                    "PUT",
                    f"/api/koperasi/commission/settings?pum_commission_rate={rate}&commission_enabled={enabled_flag}",
                    super_token,
                    (200,),
                    None,
                )
            )

        for name, method, path, token, expected, req_payload in write_cases:
            status, out_payload = _request(base_url, method, path, token=token, payload=req_payload)
            _append_check(results, name, method, path, expected, status, out_payload)

        perf_cases: list[
            Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]
        ] = [
            ("perf_marketplace_dashboard_stats", "GET", "/api/marketplace/dashboard/stats", super_token, (200,), None),
            ("perf_marketplace_finance_dashboard", "GET", "/api/marketplace/finance/dashboard", super_token, (200,), None),
            (
                "perf_marketplace_finance_ledger",
                "GET",
                "/api/marketplace/finance/ledger?page=1&limit=5",
                super_token,
                (200,),
                None,
            ),
            (
                "perf_marketplace_analytics_sales_overview",
                "GET",
                "/api/marketplace/analytics/sales-overview",
                super_token,
                (200,),
                None,
            ),
            (
                "perf_koperasi_report_monthly",
                "GET",
                "/api/koperasi/commission/report/monthly",
                super_token,
                (200,),
                None,
            ),
            ("perf_student_import_stats", "GET", "/api/student-import/stats", None, (200,), None),
        ]
        for name, method, path, token, expected, req_payload in perf_cases:
            status, out_payload, elapsed_ms = _request_timed(
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
    parser = argparse.ArgumentParser(
        description="Marketplace + Koperasi Commission + Student Import smoke test."
    )
    parser.add_argument("--base-url", default=os.getenv("BACKEND_URL", DEFAULT_BASE_URL))
    parser.add_argument("--include-write", action="store_true", help="Include idempotent write checks.")
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
