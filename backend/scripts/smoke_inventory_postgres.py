#!/usr/bin/env python3
"""
Role-aware smoke checks for Inventory module in postgres-only mode.

Default mode is read-only. Use --include-write for idempotent write checks.
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
DEFAULT_TIMEOUT = 25
DEFAULT_PERF_BUDGET_MS = 5000.0


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

    item_id = None
    status, payload = _request_json(base_url, "GET", "/api/inventory/items", token=super_token)
    if status == 200 and isinstance(payload, list) and payload:
        item_id = payload[0].get("id")
    captured: Dict[str, Any] = {}

    read_cases = [
        ("categories_superadmin", "GET", "/api/inventory/categories", super_token, (200,)),
        ("vendors_superadmin", "GET", "/api/inventory/vendors", super_token, (200,)),
        ("items_superadmin", "GET", "/api/inventory/items", super_token, (200,)),
        ("movements_superadmin", "GET", "/api/inventory/movements?limit=20", super_token, (200,)),
        ("stats_superadmin", "GET", "/api/inventory/stats", super_token, (200,)),
        # Parent authorization matrix
        ("categories_parent", "GET", "/api/inventory/categories", parent_token, (200,)),
        ("vendors_parent_forbidden", "GET", "/api/inventory/vendors", parent_token, (403,)),
        ("items_parent_forbidden", "GET", "/api/inventory/items", parent_token, (403,)),
        ("movements_parent_forbidden", "GET", "/api/inventory/movements", parent_token, (403,)),
        ("stats_parent_forbidden", "GET", "/api/inventory/stats", parent_token, (403,)),
    ]
    if item_id:
        read_cases.append(("item_detail", "GET", f"/api/inventory/items/{item_id}", super_token, (200,)))

    for name, method, path, token, expected in read_cases:
        status, payload = _request_json(base_url, method, path, token=token)
        _append_check(results, name, method, path, expected, status, payload)
        if name in {
            "categories_superadmin",
            "vendors_superadmin",
            "items_superadmin",
            "movements_superadmin",
            "stats_superadmin",
            "item_detail",
        }:
            captured[name] = payload

    _append_assert(
        results,
        "inventory_categories_shape",
        "/api/inventory/categories",
        isinstance(captured.get("categories_superadmin"), list),
        detail=f"payload={_short_payload(captured.get('categories_superadmin'))}",
    )
    _append_assert(
        results,
        "inventory_vendors_shape",
        "/api/inventory/vendors",
        isinstance(captured.get("vendors_superadmin"), list),
        detail=f"payload={_short_payload(captured.get('vendors_superadmin'))}",
    )
    _append_assert(
        results,
        "inventory_items_shape",
        "/api/inventory/items",
        isinstance(captured.get("items_superadmin"), list),
        detail=f"payload={_short_payload(captured.get('items_superadmin'))}",
    )
    movements_payload = captured.get("movements_superadmin")
    _append_assert(
        results,
        "inventory_movements_shape",
        "/api/inventory/movements?limit=20",
        isinstance(movements_payload, list)
        or (
            isinstance(movements_payload, dict)
            and (
                isinstance(movements_payload.get("movements"), list)
                or isinstance(movements_payload.get("data"), list)
            )
        ),
        detail=f"payload={_short_payload(movements_payload)}",
    )
    _append_assert(
        results,
        "inventory_stats_shape",
        "/api/inventory/stats",
        isinstance(captured.get("stats_superadmin"), dict),
        detail=f"payload={_short_payload(captured.get('stats_superadmin'))}",
    )
    if item_id:
        item_detail_payload = captured.get("item_detail")
        _append_assert(
            results,
            "inventory_item_detail_shape",
            f"/api/inventory/items/{item_id}",
            isinstance(item_detail_payload, dict),
            detail=f"payload={_short_payload(item_detail_payload)}",
        )

    if include_write:
        perf_budget_ms = DEFAULT_PERF_BUDGET_MS
        status, payload = _request_json(
            base_url,
            "POST",
            "/api/inventory/seed/muafakat-vendor",
            token=super_token,
        )
        _append_check(
            results,
            "seed_muafakat_vendor",
            "POST",
            "/api/inventory/seed/muafakat-vendor",
            (200,),
            status,
            payload,
        )
        status, payload = _request_json(
            base_url,
            "POST",
            "/api/inventory/seed/muafakat-vendor",
            token=parent_token,
        )
        _append_check(
            results,
            "seed_muafakat_vendor_parent_forbidden",
            "POST",
            "/api/inventory/seed/muafakat-vendor",
            (403,),
            status,
            payload,
        )

        perf_cases = [
            ("perf_inventory_items", "GET", "/api/inventory/items", super_token, (200,)),
            ("perf_inventory_movements", "GET", "/api/inventory/movements?limit=20", super_token, (200,)),
            ("perf_inventory_stats", "GET", "/api/inventory/stats", super_token, (200,)),
            ("perf_inventory_categories", "GET", "/api/inventory/categories", super_token, (200,)),
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
    parser = argparse.ArgumentParser(description="Inventory module smoke test (postgres mode).")
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
