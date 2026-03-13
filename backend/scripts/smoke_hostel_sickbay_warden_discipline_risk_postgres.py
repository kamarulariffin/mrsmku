#!/usr/bin/env python3
"""
Role-aware smoke checks for Hostel + Sickbay + Warden + Discipline + Risk.

Default mode is read-only. Use --include-write for validation-style write checks.
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

    risk_student_id = None
    discipline_student_id = None
    captured: Dict[str, Any] = {}

    status, payload = _request(base_url, "GET", "/api/risk/profiles?limit=20", token=super_token)
    if status == 200 and isinstance(payload, dict):
        profiles = payload.get("profiles") or []
        if profiles:
            risk_student_id = profiles[0].get("student_id")

    status, payload = _request(base_url, "GET", "/api/discipline/offences?limit=20", token=super_token)
    if status == 200 and isinstance(payload, list) and payload:
        discipline_student_id = payload[0].get("student_id")

    read_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
        # Hostel
        ("hostel_records_superadmin", "GET", "/api/hostel/records", super_token, (200,), None),
        ("hostel_students_superadmin", "GET", "/api/hostel/students", super_token, (200,), None),
        ("hostel_blocks_superadmin", "GET", "/api/hostel/blocks", super_token, (200,), None),
        ("hostel_stats_superadmin", "GET", "/api/hostel/stats", super_token, (200,), None),
        ("hostel_empty_rooms_superadmin", "GET", "/api/hostel/empty-rooms", super_token, (200,), None),
        ("hostel_integration_status_superadmin", "GET", "/api/hostel/integration-status", super_token, (200,), None),
        ("hostel_movement_logs_superadmin", "GET", "/api/hostel/movement-logs?limit=5", super_token, (200,), None),
        ("hostel_live_incidents_superadmin", "GET", "/api/hostel/live-incidents?limit=5", super_token, (200,), None),
        ("hostel_leave_requests_superadmin", "GET", "/api/hostel/leave/requests?page=1&limit=5", super_token, (200,), None),
        ("hostel_outing_requests_superadmin", "GET", "/api/hostel/outing/requests?page=1&limit=5", super_token, (200,), None),
        (
            "hostel_pbw_requests_superadmin",
            "GET",
            "/api/hostel/pulang-bermalam/requests?page=1&limit=5",
            super_token,
            (200,),
            None,
        ),
        ("hostel_pbw_stats_superadmin", "GET", "/api/hostel/pulang-bermalam/stats", super_token, (200,), None),
        ("hostel_presence_report_superadmin", "GET", "/api/hostel/presence-report", super_token, (200,), None),
        ("hostel_my_olat_parent", "GET", "/api/hostel/my-olat-outing-block", parent_token, (200,), None),
        ("hostel_olat_children_parent", "GET", "/api/hostel/olat-status-children", parent_token, (200,), None),
        ("hostel_stats_parent_forbidden", "GET", "/api/hostel/stats", parent_token, (403,), None),
        # Sickbay
        ("sickbay_records_superadmin", "GET", "/api/sickbay/records", super_token, (200,), None),
        ("sickbay_stats_superadmin", "GET", "/api/sickbay/stats", super_token, (200,), None),
        ("sickbay_students_superadmin", "GET", "/api/sickbay/students", super_token, (200,), None),
        ("sickbay_records_parent_forbidden", "GET", "/api/sickbay/records", parent_token, (403,), None),
        # Warden
        ("warden_on_duty_public", "GET", "/api/warden/on-duty", None, (200,), None),
        ("warden_on_duty_block_public", "GET", "/api/warden/on-duty/block/JA", None, (200,), None),
        ("warden_schedules_superadmin", "GET", "/api/warden/schedules", super_token, (200,), None),
        ("warden_calendar_superadmin", "GET", "/api/warden/calendar?bulan=3&tahun=2026", super_token, (200,), None),
        (
            "warden_calendar_events_superadmin",
            "GET",
            "/api/warden/calendar-events?bulan=3&tahun=2026",
            super_token,
            (200,),
            None,
        ),
        ("warden_calendar_public", "GET", "/api/warden/calendar-public?bulan=3&tahun=2026", None, (200,), None),
        ("warden_list_superadmin", "GET", "/api/warden/list", super_token, (200,), None),
        ("warden_outing_rotation_superadmin", "GET", "/api/warden/outing-rotation", super_token, (200,), None),
        ("warden_schedules_parent_forbidden", "GET", "/api/warden/schedules", parent_token, (403,), None),
        # Discipline
        ("discipline_sections_superadmin", "GET", "/api/discipline/offences/sections", super_token, (200,), None),
        ("discipline_offences_superadmin", "GET", "/api/discipline/offences", super_token, (200,), None),
        ("discipline_olat_superadmin", "GET", "/api/discipline/olat", super_token, (200,), None),
        ("discipline_olat_categories_superadmin", "GET", "/api/discipline/olat/categories", super_token, (200,), None),
        ("discipline_stats_superadmin", "GET", "/api/discipline/stats", super_token, (200,), None),
        ("discipline_offences_parent_forbidden", "GET", "/api/discipline/offences", parent_token, (403,), None),
        # Risk
        ("risk_profiles_superadmin", "GET", "/api/risk/profiles?limit=20", super_token, (200,), None),
        ("risk_summary_superadmin", "GET", "/api/risk/summary", super_token, (200,), None),
        ("risk_summary_parent_forbidden", "GET", "/api/risk/summary", parent_token, (403,), None),
    ]

    if discipline_student_id:
        read_cases.append(
            (
                "discipline_offences_by_student_superadmin",
                "GET",
                f"/api/discipline/offences/student/{discipline_student_id}",
                super_token,
                (200,),
                None,
            )
        )
    if risk_student_id:
        read_cases.append(
            (
                "risk_profile_student_superadmin",
                "GET",
                f"/api/risk/profiles/student/{risk_student_id}",
                super_token,
                (200, 404),
                None,
            )
        )

    for name, method, path, token, expected, req_payload in read_cases:
        status, out_payload = _request(base_url, method, path, token=token, payload=req_payload)
        _append_check(results, name, method, path, expected, status, out_payload)
        if name in {
            "hostel_stats_superadmin",
            "hostel_empty_rooms_superadmin",
            "hostel_leave_requests_superadmin",
            "hostel_pbw_stats_superadmin",
            "hostel_presence_report_superadmin",
            "sickbay_stats_superadmin",
            "warden_calendar_superadmin",
            "discipline_offences_superadmin",
            "discipline_stats_superadmin",
            "risk_profiles_superadmin",
            "risk_summary_superadmin",
        }:
            captured[name] = out_payload

    _append_assert(
        results,
        "hostel_stats_shape",
        "/api/hostel/stats",
        isinstance(captured.get("hostel_stats_superadmin"), dict),
        detail=f"payload={_short_payload(captured.get('hostel_stats_superadmin'))}",
    )

    _append_assert(
        results,
        "hostel_empty_rooms_shape",
        "/api/hostel/empty-rooms",
        isinstance(captured.get("hostel_empty_rooms_superadmin"), list)
        or (
            isinstance(captured.get("hostel_empty_rooms_superadmin"), dict)
            and isinstance(captured.get("hostel_empty_rooms_superadmin", {}).get("blocks"), list)
        ),
        detail=f"payload={_short_payload(captured.get('hostel_empty_rooms_superadmin'))}",
    )

    leave_payload = captured.get("hostel_leave_requests_superadmin")
    _append_assert(
        results,
        "hostel_leave_requests_shape",
        "/api/hostel/leave/requests?page=1&limit=5",
        isinstance(leave_payload, (dict, list)),
        detail=f"payload={_short_payload(leave_payload)}",
    )

    _append_assert(
        results,
        "hostel_pbw_stats_shape",
        "/api/hostel/pulang-bermalam/stats",
        isinstance(captured.get("hostel_pbw_stats_superadmin"), dict),
        detail=f"payload={_short_payload(captured.get('hostel_pbw_stats_superadmin'))}",
    )

    presence_payload = captured.get("hostel_presence_report_superadmin")
    _append_assert(
        results,
        "hostel_presence_report_shape",
        "/api/hostel/presence-report",
        isinstance(presence_payload, (dict, list)),
        detail=f"payload={_short_payload(presence_payload)}",
    )

    _append_assert(
        results,
        "sickbay_stats_shape",
        "/api/sickbay/stats",
        isinstance(captured.get("sickbay_stats_superadmin"), dict),
        detail=f"payload={_short_payload(captured.get('sickbay_stats_superadmin'))}",
    )

    _append_assert(
        results,
        "warden_calendar_shape",
        "/api/warden/calendar?bulan=3&tahun=2026",
        isinstance(captured.get("warden_calendar_superadmin"), (dict, list)),
        detail=f"payload={_short_payload(captured.get('warden_calendar_superadmin'))}",
    )

    _append_assert(
        results,
        "discipline_offences_shape",
        "/api/discipline/offences",
        isinstance(captured.get("discipline_offences_superadmin"), list),
        detail=f"payload={_short_payload(captured.get('discipline_offences_superadmin'))}",
    )

    _append_assert(
        results,
        "discipline_stats_shape",
        "/api/discipline/stats",
        isinstance(captured.get("discipline_stats_superadmin"), dict),
        detail=f"payload={_short_payload(captured.get('discipline_stats_superadmin'))}",
    )

    risk_profiles_payload = captured.get("risk_profiles_superadmin")
    _append_assert(
        results,
        "risk_profiles_shape",
        "/api/risk/profiles?limit=20",
        isinstance(risk_profiles_payload, dict) and isinstance(risk_profiles_payload.get("profiles"), list),
        detail=f"payload={_short_payload(risk_profiles_payload)}",
    )

    _append_assert(
        results,
        "risk_summary_shape",
        "/api/risk/summary",
        isinstance(captured.get("risk_summary_superadmin"), dict),
        detail=f"payload={_short_payload(captured.get('risk_summary_superadmin'))}",
    )

    if include_write:
        perf_budget_ms = DEFAULT_PERF_BUDGET_MS
        write_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
            ("hostel_checkout_validation", "POST", "/api/hostel/checkout", super_token, (422,), {}),
            ("sickbay_checkin_validation", "POST", "/api/sickbay/checkin", super_token, (422,), {}),
            ("warden_schedule_validation", "POST", "/api/warden/schedules", super_token, (422,), {}),
            ("discipline_offence_validation", "POST", "/api/discipline/offences", super_token, (422,), {}),
            ("discipline_olat_manual_validation", "POST", "/api/discipline/olat/manual", super_token, (422,), {}),
        ]
        for name, method, path, token, expected, req_payload in write_cases:
            status, out_payload = _request(base_url, method, path, token=token, payload=req_payload)
            _append_check(results, name, method, path, expected, status, out_payload)

        perf_cases: list[
            Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]
        ] = [
            ("perf_hostel_stats", "GET", "/api/hostel/stats", super_token, (200,), None),
            ("perf_hostel_presence_report", "GET", "/api/hostel/presence-report", super_token, (200,), None),
            ("perf_sickbay_stats", "GET", "/api/sickbay/stats", super_token, (200,), None),
            ("perf_warden_calendar", "GET", "/api/warden/calendar?bulan=3&tahun=2026", super_token, (200,), None),
            ("perf_discipline_stats", "GET", "/api/discipline/stats", super_token, (200,), None),
            ("perf_risk_profiles", "GET", "/api/risk/profiles?limit=20", super_token, (200,), None),
            ("perf_risk_summary", "GET", "/api/risk/summary", super_token, (200,), None),
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
        description="Hostel + Sickbay + Warden + Discipline + Risk smoke test."
    )
    parser.add_argument("--base-url", default=os.getenv("BACKEND_URL", DEFAULT_BASE_URL))
    parser.add_argument("--include-write", action="store_true", help="Include validation-style write checks.")
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
