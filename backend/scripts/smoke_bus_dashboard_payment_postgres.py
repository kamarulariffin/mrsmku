#!/usr/bin/env python3
"""
Role-aware smoke checks for Bus + Dashboard + Payment Center in postgres-only mode.

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
from datetime import date, timedelta
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_TIMEOUT = 25
DEFAULT_PERF_BUDGET_MS = 4000.0


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

    # Discover dynamic IDs from current data.
    yuran_id = None
    public_trip_id = None

    status, payload = _request_json(base_url, "GET", "/api/yuran/anak-saya", token=parent_token)
    if status == 200 and isinstance(payload, list) and payload:
        all_yuran = payload[0].get("all_yuran") or []
        if all_yuran:
            yuran_id = all_yuran[0].get("id")

    status, payload = _request_json(base_url, "GET", "/api/public/bus/trips")
    if status == 200 and isinstance(payload, list) and payload:
        public_trip_id = payload[0].get("id")

    # Read checks
    read_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
        ("dashboard_root_superadmin", "GET", "/api/dashboard", super_token, (200,), None),
        ("dashboard_root_parent", "GET", "/api/dashboard", parent_token, (200,), None),
        ("dashboard_root_slash_superadmin", "GET", "/api/dashboard/", super_token, (200,), None),
        ("dashboard_admin_superadmin", "GET", "/api/dashboard/admin", super_token, (200,), None),
        ("dashboard_parent_parent", "GET", "/api/dashboard/parent", parent_token, (200,), None),
        ("bus_companies_superadmin", "GET", "/api/bus/companies", super_token, (200,), None),
        ("bus_routes_superadmin", "GET", "/api/bus/routes", super_token, (200,), None),
        ("bus_trips_superadmin", "GET", "/api/bus/trips", super_token, (200,), None),
        ("bus_bookings_superadmin", "GET", "/api/bus/bookings", super_token, (200,), None),
        ("bus_bookings_parent", "GET", "/api/bus/bookings", parent_token, (200,), None),
        ("bus_stats_superadmin", "GET", "/api/bus/stats", super_token, (200,), None),
        ("bus_companies_parent_forbidden", "GET", "/api/bus/companies", parent_token, (403,), None),
        ("bus_driver_trips_parent_forbidden", "GET", "/api/bus/driver/trips", parent_token, (403,), None),
        ("bus_public_trips", "GET", "/api/public/bus/trips", None, (200,), None),
        ("payment_center_cart_parent", "GET", "/api/payment-center/cart", parent_token, (200,), None),
        # Validate alias endpoint shape without data mutation
        ("payment_center_add_installment_validation", "POST", "/api/payment-center/cart/add-installment", parent_token, (422,), {}),
    ]

    if public_trip_id:
        read_cases.append(
            (
                "bus_public_trip_seats",
                "GET",
                f"/api/public/bus/trips/{public_trip_id}/seats",
                None,
                (200,),
                None,
            )
        )

    for name, method, path, token, expected, req_payload in read_cases:
        status, out_payload = _request_json(base_url, method, path, token=token, payload=req_payload)
        _append_check(results, name, method, path, expected, status, out_payload)

    if include_write and yuran_id:
        write_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
            (
                "payment_center_add_installment",
                "POST",
                "/api/payment-center/cart/add-installment",
                parent_token,
                (200, 400),
                {"yuran_id": yuran_id},
            ),
            (
                "payment_center_add_two_payment",
                "POST",
                "/api/payment-center/cart/add-two-payment",
                parent_token,
                (200, 400),
                {"yuran_id": yuran_id},
            ),
        ]
        for name, method, path, token, expected, req_payload in write_cases:
            status, out_payload = _request_json(base_url, method, path, token=token, payload=req_payload)
            _append_check(results, name, method, path, expected, status, out_payload)

    if include_write:
        suffix = uuid.uuid4().hex[:8]
        trip_date = (date.today() + timedelta(days=1)).isoformat()
        perf_budget_ms = DEFAULT_PERF_BUDGET_MS
        lat, lng = 3.12345, 101.71234

        company_id: Optional[str] = None
        bus_id: Optional[str] = None
        route_id: Optional[str] = None
        trip_id: Optional[str] = None
        driver_user_id: Optional[str] = None
        driver_email = f"bus-driver-smoke-{suffix.lower()}@example.com"
        driver_password = "driver123"

        status, out_payload = _request_json(
            base_url,
            "POST",
            "/api/bus/companies",
            token=super_token,
            payload={
                "name": f"Bus Smoke Co {suffix}",
                "registration_number": f"BUSSMOKE{suffix.upper()}",
                "address": "Alamat UAT Bas",
                "postcode": "43000",
                "city": "Kajang",
                "state": "Selangor",
                "phone": "0123456789",
                "email": f"bus-company-{suffix.lower()}@example.com",
                "pic_name": "Pegawai UAT Bas",
                "pic_phone": "0123456789",
                "application_status": "approved",
            },
        )
        _append_check(
            results,
            "bus_driver_setup_company",
            "POST",
            "/api/bus/companies",
            (200,),
            status,
            out_payload,
        )
        if status == 200 and isinstance(out_payload, dict):
            company_id = out_payload.get("id")

        if company_id:
            status, out_payload = _request_json(
                base_url,
                "POST",
                "/api/bus/buses",
                token=super_token,
                payload={
                    "company_id": company_id,
                    "plate_number": f"WVA{suffix[:5].upper()}",
                    "bus_type": "sekolah",
                    "total_seats": 40,
                    "brand": "Hino",
                    "model": "UAT",
                    "amenities": ["aircond", "gps"],
                },
            )
            _append_check(
                results,
                "bus_driver_setup_bus",
                "POST",
                "/api/bus/buses",
                (200,),
                status,
                out_payload,
            )
            if status == 200 and isinstance(out_payload, dict):
                bus_id = out_payload.get("id")

        if company_id:
            status, out_payload = _request_json(
                base_url,
                "POST",
                "/api/bus/routes",
                token=super_token,
                payload={
                    "company_id": company_id,
                    "name": f"Route UAT {suffix}",
                    "origin": "MRSM UAT",
                    "destination": "Bandar UAT",
                    "pickup_locations": [{"location": "Gate Utama", "order": 1}],
                    "drop_off_points": [
                        {"location": "Terminal UAT", "price": 25.0, "order": 1},
                        {"location": "Stesen UAT", "price": 30.0, "order": 2},
                    ],
                    "base_price": 20.0,
                    "estimated_duration": "2 jam",
                },
            )
            _append_check(
                results,
                "bus_driver_setup_route",
                "POST",
                "/api/bus/routes",
                (200,),
                status,
                out_payload,
            )
            if status == 200 and isinstance(out_payload, dict):
                route_id = out_payload.get("id")

        if route_id and bus_id:
            status, out_payload = _request_json(
                base_url,
                "POST",
                "/api/bus/trips",
                token=super_token,
                payload={
                    "route_id": route_id,
                    "bus_id": bus_id,
                    "departure_date": trip_date,
                    "departure_time": "08:30",
                },
            )
            _append_check(
                results,
                "bus_driver_setup_trip",
                "POST",
                "/api/bus/trips",
                (200,),
                status,
                out_payload,
            )
            if status == 200 and isinstance(out_payload, dict):
                trip_id = out_payload.get("id")

        ic_suffix = f"{(uuid.uuid4().int % 10**6):06d}"
        status, out_payload = _request_json(
            base_url,
            "POST",
            "/api/users",
            token=super_token,
            payload={
                "email": driver_email,
                "password": driver_password,
                "full_name": "Bus Driver Smoke",
                "phone": "0123456789",
                "ic_number": f"900101{ic_suffix}",
                "gender": "male",
                "role": "bus_driver",
            },
        )
        _append_check(
            results,
            "bus_driver_setup_user",
            "POST",
            "/api/users",
            (200,),
            status,
            out_payload,
        )
        if status == 200 and isinstance(out_payload, dict):
            driver_user_id = out_payload.get("id")

        if driver_user_id and bus_id:
            status, out_payload = _request_json(
                base_url,
                "PUT",
                f"/api/users/{driver_user_id}",
                token=super_token,
                payload={"assigned_bus_id": bus_id},
            )
            _append_check(
                results,
                "bus_driver_setup_assign_bus",
                "PUT",
                f"/api/users/{driver_user_id}",
                (200,),
                status,
                out_payload,
            )

        driver_token = None
        if driver_user_id:
            status, out_payload = _request_json(
                base_url,
                "POST",
                "/api/auth/login",
                payload={"email": driver_email, "password": driver_password},
            )
            _append_check(
                results,
                "bus_driver_login",
                "POST",
                "/api/auth/login",
                (200,),
                status,
                out_payload,
            )
            if status == 200 and isinstance(out_payload, dict):
                driver_token = out_payload.get("access_token")

        if driver_token and trip_id:
            driver_cases: list[
                Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]
            ] = [
                ("bus_driver_trips", "GET", "/api/bus/driver/trips", driver_token, (200,), None),
                (
                    "bus_driver_trip_students",
                    "GET",
                    f"/api/bus/driver/trips/{trip_id}/students",
                    driver_token,
                    (200,),
                    None,
                ),
                (
                    "bus_driver_update_location",
                    "POST",
                    "/api/bus/driver/location",
                    driver_token,
                    (200,),
                    {"trip_id": trip_id, "lat": lat, "lng": lng},
                ),
                (
                    "bus_live_location_public",
                    "GET",
                    f"/api/bus/live-location/{trip_id}",
                    None,
                    (200,),
                    None,
                ),
                (
                    "bus_trip_map_info_public",
                    "GET",
                    f"/api/bus/trips/{trip_id}/map-info",
                    None,
                    (200,),
                    None,
                ),
            ]

            live_location_payload: Any = None
            map_info_payload: Any = None

            for name, method, path, token, expected, req_payload in driver_cases:
                status, out_payload = _request_json(base_url, method, path, token=token, payload=req_payload)
                _append_check(results, name, method, path, expected, status, out_payload)
                if name == "bus_live_location_public":
                    live_location_payload = out_payload
                if name == "bus_trip_map_info_public":
                    map_info_payload = out_payload

            live_ok = (
                isinstance(live_location_payload, dict)
                and str(live_location_payload.get("trip_id")) == str(trip_id)
                and abs(float(live_location_payload.get("lat", 0.0)) - lat) < 1e-6
                and abs(float(live_location_payload.get("lng", 0.0)) - lng) < 1e-6
            )
            _append_assert(
                results,
                "bus_live_location_payload_check",
                f"/api/bus/live-location/{trip_id}",
                live_ok,
                detail=f"payload={_short_payload(live_location_payload)}",
            )

            map_ok = (
                isinstance(map_info_payload, dict)
                and str(map_info_payload.get("trip_id")) == str(trip_id)
                and isinstance(map_info_payload.get("drop_off_points"), list)
            )
            _append_assert(
                results,
                "bus_trip_map_payload_check",
                f"/api/bus/trips/{trip_id}/map-info",
                map_ok,
                detail=f"payload={_short_payload(map_info_payload)}",
            )

            perf_cases: list[
                Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]
            ] = [
                ("perf_bus_driver_trips", "GET", "/api/bus/driver/trips", driver_token, (200,), None),
                (
                    "perf_bus_live_location_public",
                    "GET",
                    f"/api/bus/live-location/{trip_id}",
                    None,
                    (200,),
                    None,
                ),
                (
                    "perf_bus_trip_map_info_public",
                    "GET",
                    f"/api/bus/trips/{trip_id}/map-info",
                    None,
                    (200,),
                    None,
                ),
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

        # Cleanup (best effort)
        if trip_id:
            _request_json(
                base_url,
                "POST",
                f"/api/bus/trips/{trip_id}/cancel?reason=smoke-cleanup",
                token=super_token,
            )
        if route_id:
            _request_json(base_url, "DELETE", f"/api/bus/routes/{route_id}", token=super_token)
        if bus_id:
            _request_json(base_url, "DELETE", f"/api/bus/buses/{bus_id}", token=super_token)
        if company_id:
            _request_json(base_url, "DELETE", f"/api/bus/companies/{company_id}", token=super_token)
        if driver_user_id:
            _request_json(base_url, "DELETE", f"/api/users/{driver_user_id}", token=super_token)

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
        description="Bus + Dashboard + Payment Center smoke test (postgres mode)."
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
