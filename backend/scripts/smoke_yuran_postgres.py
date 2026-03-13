#!/usr/bin/env python3
"""
Role-aware smoke checks for Yuran module in postgres-only mode.

Default mode is read-only. Use --include-write to run idempotent write checks.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_TIMEOUT = 25


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
        if isinstance(payload, dict):
            detail = json.dumps(payload, ensure_ascii=True)[:280]
        else:
            detail = str(payload)[:280]
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
    tahun: int,
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

    # Discover dynamic IDs from current data.
    set_id = None
    student_id = None
    yuran_id = None
    notification_id = None

    status, payload = _request_json(
        base_url,
        "GET",
        _query("/api/yuran/set-yuran", {"tahun": tahun}),
        token=super_token,
    )
    if status == 200 and isinstance(payload, list) and payload:
        set_id = payload[0].get("id")

    status, payload = _request_json(
        base_url,
        "GET",
        _query("/api/yuran/pelajar", {"tahun": tahun, "page": 1, "limit": 5}),
        token=super_token,
    )
    if status == 200 and isinstance(payload, dict):
        rows = payload.get("data") or []
        if rows:
            student_id = rows[0].get("student_id")

    status, payload = _request_json(base_url, "GET", "/api/yuran/anak-saya", token=parent_token)
    if status == 200 and isinstance(payload, list) and payload:
        all_yuran = payload[0].get("all_yuran") or []
        if all_yuran:
            yuran_id = all_yuran[0].get("id")

    status, payload = _request_json(base_url, "GET", "/api/yuran/notifications/parent", token=parent_token)
    if status == 200 and isinstance(payload, dict):
        items = payload.get("notifications") or payload.get("items") or payload.get("data") or []
        if items:
            notification_id = items[0].get("id")

    # Read checks (primary hardening checks).
    read_cases = [
        ("agama_options", "GET", "/api/yuran/agama-options", super_token, (200,)),
        ("available_years", "GET", "/api/yuran/set-yuran/available-years", super_token, (200,)),
        ("set_yuran_list", "GET", _query("/api/yuran/set-yuran", {"tahun": tahun}), super_token, (200,)),
        ("pelajar_list", "GET", _query("/api/yuran/pelajar", {"tahun": tahun, "page": 1, "limit": 10}), super_token, (200,)),
        ("laporan_tunggakan", "GET", _query("/api/yuran/laporan/tunggakan", {"tahun": tahun, "page": 1, "limit": 10}), super_token, (200,)),
        ("laporan_kutipan", "GET", _query("/api/yuran/laporan/kutipan", {"tahun": tahun}), super_token, (200,)),
        ("statistik", "GET", _query("/api/yuran/statistik", {"tahun": tahun}), super_token, (200,)),
        ("installment_settings_get", "GET", "/api/yuran/settings/installment", super_token, (200,)),
        ("payment_policy_get", "GET", "/api/yuran/settings/payment-policy", super_token, (200,)),
        ("invoice_template_get", "GET", "/api/yuran/settings/invoice-template", super_token, (200,)),
        ("agm_template_get", "GET", "/api/yuran/settings/agm-report-template", super_token, (200,)),
        ("anak_saya_parent", "GET", "/api/yuran/anak-saya", parent_token, (200,)),
        ("notifications_parent", "GET", "/api/yuran/notifications/parent", parent_token, (200,)),
        # Authorization guards
        ("anak_saya_superadmin_forbidden", "GET", "/api/yuran/anak-saya", super_token, (403,)),
        ("notifications_superadmin_forbidden", "GET", "/api/yuran/notifications/parent", super_token, (403,)),
    ]

    if set_id:
        read_cases.append(("set_yuran_detail", "GET", f"/api/yuran/set-yuran/{set_id}", super_token, (200,)))
    if student_id:
        read_cases.append(("pelajar_detail", "GET", _query(f"/api/yuran/pelajar/{student_id}", {"tahun": tahun}), super_token, (200,)))
    if yuran_id:
        read_cases.append(("payment_options", "GET", f"/api/yuran/anak-saya/{yuran_id}/payment-options", parent_token, (200,)))

    for name, method, path, token, expected in read_cases:
        status, payload = _request_json(base_url, method, path, token=token)
        _append_check(results, name, method, path, expected, status, payload)

    if include_write:
        # Idempotent write checks.
        write_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = []
        write_cases.append(("mark_all_read", "POST", "/api/yuran/notifications/mark-all-read", parent_token, (200,), None))
        if notification_id:
            write_cases.append(
                ("mark_single_read", "POST", f"/api/yuran/notifications/{notification_id}/read", parent_token, (200, 404), None)
            )

        # PUT settings with existing payload (no semantic changes expected).
        status, payload = _request_json(base_url, "GET", "/api/yuran/settings/installment", token=super_token)
        if status == 200 and isinstance(payload, dict):
            raw_max = payload.get("max_installment_months", 2)
            try:
                max_installment_months = int(raw_max)
            except Exception:
                max_installment_months = 2
            write_cases.append(
                (
                    "put_installment_settings",
                    "PUT",
                    "/api/yuran/settings/installment",
                    super_token,
                    (200,),
                    {"max_installment_months": max_installment_months},
                )
            )

        for key in ("payment-policy", "invoice-template", "agm-report-template"):
            path = f"/api/yuran/settings/{key}"
            status, payload = _request_json(base_url, "GET", path, token=super_token)
            if status == 200 and isinstance(payload, dict):
                write_cases.append((f"put_{key}", "PUT", path, super_token, (200,), payload))

        for name, method, path, token, expected, payload in write_cases:
            status, out_payload = _request_json(base_url, method, path, token=token, payload=payload)
            _append_check(results, name, method, path, expected, status, out_payload)

    # Report
    print(f"BASE_URL={base_url}")
    print(f"TAHUN={tahun}")
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
    parser = argparse.ArgumentParser(description="Yuran module smoke test (postgres mode).")
    parser.add_argument("--base-url", default=os.getenv("BACKEND_URL", DEFAULT_BASE_URL))
    parser.add_argument("--tahun", type=int, default=int(os.getenv("YURAN_TEST_YEAR", datetime.now().year)))
    parser.add_argument("--include-write", action="store_true", help="Include idempotent write checks.")
    parser.add_argument("--superadmin-email", default=os.getenv("SUPERADMIN_EMAIL", "superadmin@muafakat.link"))
    parser.add_argument("--superadmin-password", default=os.getenv("SUPERADMIN_PASSWORD", "super123"))
    parser.add_argument("--parent-email", default=os.getenv("PARENT_EMAIL", "parent@muafakat.link"))
    parser.add_argument("--parent-password", default=os.getenv("PARENT_PASSWORD", "parent123"))
    args = parser.parse_args()

    return run_smoke(
        base_url=args.base_url.rstrip("/"),
        tahun=args.tahun,
        include_write=args.include_write,
        superadmin=UserCreds(args.superadmin_email, args.superadmin_password),
        parent=UserCreds(args.parent_email, args.parent_password),
    )


if __name__ == "__main__":
    sys.exit(main())
