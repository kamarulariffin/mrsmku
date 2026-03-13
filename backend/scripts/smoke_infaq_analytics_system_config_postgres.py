#!/usr/bin/env python3
"""
Role-aware smoke checks for Infaq + Analytics + System Config in postgres-only mode.

Default mode is read-only. Use --include-write to run idempotent write checks.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_TIMEOUT = 30
DEFAULT_PERF_BUDGET_MS = 5000.0
SMOKE_CAMPAIGN_TITLE = "Smoke Infaq Campaign (Postgres)"


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

    campaign_id = None
    system_config_payload = None
    smoke_campaign_id = None
    captured: Dict[str, Any] = {}

    status, payload = _request_json(base_url, "GET", "/api/public/infaq/campaigns")
    if status == 200 and isinstance(payload, list) and payload:
        first = payload[0]
        campaign_id = first.get("id") or first.get("_id")

    status, payload = _request_json(base_url, "GET", "/api/infaq/campaigns", token=super_token)
    if status == 200 and isinstance(payload, list):
        for row in payload:
            if not isinstance(row, dict):
                continue
            if row.get("title") == SMOKE_CAMPAIGN_TITLE:
                smoke_campaign_id = row.get("id") or row.get("_id")
                if smoke_campaign_id:
                    break

    status, payload = _request_json(base_url, "GET", "/api/settings/system-config", token=super_token)
    if status == 200 and isinstance(payload, dict):
        system_config_payload = {
            "kelas": payload.get("kelas", []),
            "tingkatan": payload.get("tingkatan", [1, 2, 3, 4, 5]),
            "bangsa": payload.get("bangsa", []),
            "agama": payload.get("agama", []),
            "negeri": payload.get("negeri", []),
        }

    read_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
        # Public infaq
        ("infaq_public_campaigns", "GET", "/api/public/infaq/campaigns", None, (200,), None),
        ("infaq_public_stats", "GET", "/api/public/infaq/stats", None, (200,), None),
        # Auth infaq
        ("infaq_campaigns_superadmin", "GET", "/api/infaq/campaigns", super_token, (200,), None),
        ("infaq_campaigns_parent", "GET", "/api/infaq/campaigns", parent_token, (200,), None),
        ("infaq_my_donations_superadmin", "GET", "/api/infaq/my-donations", super_token, (200,), None),
        ("infaq_my_donations_parent", "GET", "/api/infaq/my-donations", parent_token, (200,), None),
        ("infaq_admin_donations_superadmin", "GET", "/api/infaq/admin/donations", super_token, (200,), None),
        ("infaq_admin_stats_superadmin", "GET", "/api/infaq/admin/stats", super_token, (200,), None),
        ("infaq_admin_stats_parent_forbidden", "GET", "/api/infaq/admin/stats", parent_token, (403,), None),
        # Analytics
        ("analytics_dashboard_superadmin", "GET", "/api/analytics/dashboard", super_token, (200,), None),
        ("analytics_dashboard_parent_forbidden", "GET", "/api/analytics/dashboard", parent_token, (403,), None),
        ("analytics_module_infaq_superadmin", "GET", "/api/analytics/module/infaq", super_token, (200,), None),
        ("analytics_module_infaq_parent_forbidden", "GET", "/api/analytics/module/infaq", parent_token, (403,), None),
        (
            "analytics_ai_insights_superadmin",
            "POST",
            "/api/analytics/ai-insights",
            super_token,
            (200,),
            {"question": "Ringkasan keseluruhan prestasi", "module": "all"},
        ),
        (
            "analytics_chat_superadmin",
            "POST",
            "/api/analytics/chat",
            super_token,
            (200,),
            {"question": "Beri ringkasan", "module": "all"},
        ),
        (
            "analytics_ai_insights_parent_forbidden",
            "POST",
            "/api/analytics/ai-insights",
            parent_token,
            (403,),
            {"question": "Ringkasan", "module": "all"},
        ),
        (
            "analytics_chat_parent_forbidden",
            "POST",
            "/api/analytics/chat",
            parent_token,
            (403,),
            {"question": "Beri ringkasan", "module": "all"},
        ),
        # System config
        ("system_config_private_superadmin", "GET", "/api/settings/system-config", super_token, (200,), None),
        ("system_config_private_parent", "GET", "/api/settings/system-config", parent_token, (200,), None),
        ("system_config_public", "GET", "/api/settings/system-config/public", None, (200,), None),
    ]

    if campaign_id:
        read_cases.append(
            (
                "infaq_public_campaign_detail",
                "GET",
                f"/api/public/infaq/campaigns/{campaign_id}",
                None,
                (200,),
                None,
            )
        )
        read_cases.append(
            (
                "infaq_campaign_detail_superadmin",
                "GET",
                f"/api/infaq/campaigns/{campaign_id}",
                super_token,
                (200,),
                None,
            )
        )
    else:
        read_cases.append(
            (
                "infaq_public_campaign_detail_missing",
                "GET",
                "/api/public/infaq/campaigns/nonexistent-campaign-id",
                None,
                (404,),
                None,
            )
        )

    for name, method, path, token, expected, req_payload in read_cases:
        status, out_payload = _request_json(base_url, method, path, token=token, payload=req_payload)
        _append_check(results, name, method, path, expected, status, out_payload)
        if name in {
            "infaq_public_stats",
            "analytics_dashboard_superadmin",
            "analytics_module_infaq_superadmin",
            "analytics_ai_insights_superadmin",
            "analytics_chat_superadmin",
        }:
            captured[name] = out_payload

    public_stats = captured.get("infaq_public_stats")
    _append_assert(
        results,
        "infaq_public_stats_shape",
        "/api/public/infaq/stats",
        isinstance(public_stats, dict)
        and "total_collected" in public_stats
        and "total_donations" in public_stats,
        detail=f"payload={_short_payload(public_stats)}",
    )

    analytics_dashboard = captured.get("analytics_dashboard_superadmin")
    _append_assert(
        results,
        "analytics_dashboard_shape",
        "/api/analytics/dashboard",
        isinstance(analytics_dashboard, dict)
        and isinstance(analytics_dashboard.get("summary"), dict)
        and isinstance(analytics_dashboard.get("modules"), dict),
        detail=f"payload={_short_payload(analytics_dashboard)}",
    )

    module_infaq = captured.get("analytics_module_infaq_superadmin")
    _append_assert(
        results,
        "analytics_module_infaq_shape",
        "/api/analytics/module/infaq",
        isinstance(module_infaq, dict)
        and module_infaq.get("module") == "infaq"
        and isinstance(module_infaq.get("data"), dict),
        detail=f"payload={_short_payload(module_infaq)}",
    )

    ai_payload = captured.get("analytics_ai_insights_superadmin")
    _append_assert(
        results,
        "analytics_ai_insights_shape",
        "/api/analytics/ai-insights",
        isinstance(ai_payload, dict)
        and isinstance(ai_payload.get("summary"), str)
        and isinstance(ai_payload.get("insights"), list)
        and isinstance(ai_payload.get("recommendations"), list),
        detail=f"payload={_short_payload(ai_payload)}",
    )

    chat_payload = captured.get("analytics_chat_superadmin")
    _append_assert(
        results,
        "analytics_chat_shape",
        "/api/analytics/chat",
        isinstance(chat_payload, dict) and isinstance(chat_payload.get("response"), str),
        detail=f"payload={_short_payload(chat_payload)}",
    )

    if include_write:
        perf_budget_ms = DEFAULT_PERF_BUDGET_MS
        write_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
            ("infaq_donate_validation", "POST", "/api/infaq/donate", super_token, (422,), {}),
            ("infaq_create_campaign_validation", "POST", "/api/infaq/admin/campaigns", super_token, (422,), {}),
            ("analytics_ai_insights_validation", "POST", "/api/analytics/ai-insights", super_token, (422,), {}),
            ("analytics_chat_validation", "POST", "/api/analytics/chat", super_token, (422,), {}),
        ]

        if isinstance(system_config_payload, dict):
            write_cases.extend(
                [
                    (
                        "system_config_save_superadmin",
                        "POST",
                        "/api/settings/system-config",
                        super_token,
                        (200,),
                        system_config_payload,
                    ),
                    (
                        "system_config_save_parent_forbidden",
                        "POST",
                        "/api/settings/system-config",
                        parent_token,
                        (403,),
                        system_config_payload,
                    ),
                    (
                        "system_config_sync_parent_forbidden",
                        "POST",
                        "/api/settings/system-config/sync",
                        parent_token,
                        (403,),
                        None,
                    ),
                    (
                        "system_config_sync_superadmin",
                        "POST",
                        "/api/settings/system-config/sync",
                        super_token,
                        (200,),
                        None,
                    ),
                ]
            )

        for name, method, path, token, expected, req_payload in write_cases:
            status, out_payload = _request_json(base_url, method, path, token=token, payload=req_payload)
            _append_check(results, name, method, path, expected, status, out_payload)

        # Infaq write flow (idempotent): ensure one smoke campaign exists, mutate, then cancel.
        if not smoke_campaign_id:
            create_payload = {
                "title": SMOKE_CAMPAIGN_TITLE,
                "description": "Kempen ujian smoke infaq postgres",
                "image_url": "",
                "total_slots": 200,
                "price_per_slot": 10.0,
                "min_slots": 1,
                "max_slots": 20,
            }
            status, out_payload = _request_json(
                base_url,
                "POST",
                "/api/infaq/admin/campaigns",
                token=super_token,
                payload=create_payload,
            )
            _append_check(
                results,
                "infaq_smoke_campaign_create",
                "POST",
                "/api/infaq/admin/campaigns",
                (200,),
                status,
                out_payload,
            )
            if status == 200 and isinstance(out_payload, dict):
                smoke_campaign_id = out_payload.get("id")

        if smoke_campaign_id:
            status, out_payload = _request_json(
                base_url,
                "PUT",
                f"/api/infaq/admin/campaigns/{smoke_campaign_id}",
                token=super_token,
                payload={
                    "description": f"Kemaskini smoke {uuid.uuid4().hex[:8]}",
                    "status": "active",
                    "total_slots": 250,
                    "price_per_slot": 12.5,
                    "min_slots": 1,
                    "max_slots": 30,
                },
            )
            _append_check(
                results,
                "infaq_smoke_campaign_update",
                "PUT",
                f"/api/infaq/admin/campaigns/{smoke_campaign_id}",
                (200,),
                status,
                out_payload,
            )

            status, out_payload = _request_json(
                base_url,
                "GET",
                f"/api/infaq/campaigns/{smoke_campaign_id}",
                token=super_token,
            )
            _append_check(
                results,
                "infaq_smoke_campaign_get",
                "GET",
                f"/api/infaq/campaigns/{smoke_campaign_id}",
                (200,),
                status,
                out_payload,
            )
            _append_assert(
                results,
                "infaq_smoke_campaign_shape",
                f"/api/infaq/campaigns/{smoke_campaign_id}",
                isinstance(out_payload, dict)
                and out_payload.get("title") == SMOKE_CAMPAIGN_TITLE
                and out_payload.get("status") in {"active", "completed", "cancelled"},
                detail=f"payload={_short_payload(out_payload)}",
            )

            status, out_payload = _request_json(
                base_url,
                "POST",
                "/api/infaq/donate",
                token=super_token,
                payload={
                    "campaign_id": smoke_campaign_id,
                    "slots": 0,
                    "payment_method": "fpx",
                    "is_anonymous": True,
                    "message": "smoke validation",
                },
            )
            _append_check(
                results,
                "infaq_smoke_donate_min_slot_guard",
                "POST",
                "/api/infaq/donate",
                (400,),
                status,
                out_payload,
            )

            status, out_payload = _request_json(
                base_url,
                "GET",
                f"/api/infaq/admin/donations?campaign_id={smoke_campaign_id}",
                token=super_token,
            )
            _append_check(
                results,
                "infaq_smoke_admin_donations_by_campaign",
                "GET",
                f"/api/infaq/admin/donations?campaign_id={smoke_campaign_id}",
                (200,),
                status,
                out_payload,
            )

            status, out_payload = _request_json(
                base_url,
                "DELETE",
                f"/api/infaq/admin/campaigns/{smoke_campaign_id}",
                token=super_token,
            )
            _append_check(
                results,
                "infaq_smoke_campaign_cancel",
                "DELETE",
                f"/api/infaq/admin/campaigns/{smoke_campaign_id}",
                (200,),
                status,
                out_payload,
            )

        perf_cases: list[
            Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]
        ] = [
            ("perf_analytics_dashboard", "GET", "/api/analytics/dashboard", super_token, (200,), None),
            (
                "perf_analytics_ai_insights",
                "POST",
                "/api/analytics/ai-insights",
                super_token,
                (200,),
                {"question": "Ringkasan keseluruhan prestasi", "module": "all"},
            ),
            (
                "perf_analytics_chat",
                "POST",
                "/api/analytics/chat",
                super_token,
                (200,),
                {"question": "Beri ringkasan", "module": "all"},
            ),
            ("perf_infaq_admin_stats", "GET", "/api/infaq/admin/stats", super_token, (200,), None),
            ("perf_infaq_admin_donations", "GET", "/api/infaq/admin/donations", super_token, (200,), None),
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
    parser = argparse.ArgumentParser(description="Infaq + Analytics + System Config smoke test (postgres mode).")
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
