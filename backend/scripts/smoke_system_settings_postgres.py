#!/usr/bin/env python3
"""
Role-aware smoke checks for system/settings module in postgres mode.

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
        return json.dumps(payload, ensure_ascii=True)[:320]
    return str(payload)[:320]


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


def _sanitize_modules_payload(payload: Any) -> Dict[str, Any]:
    modules = {}
    if isinstance(payload, dict):
        maybe_modules = payload.get("modules")
        if isinstance(maybe_modules, dict):
            for key, val in maybe_modules.items():
                if not isinstance(val, dict):
                    continue
                modules[key] = {"enabled": bool(val.get("enabled", True))}
    return {"modules": modules}


def _sanitize_pwa_payload(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return {
            "name": "Smart 360 AI Edition",
            "short_name": "Smart 360 AI",
            "theme_color": "#0f766e",
            "background_color": "#ffffff",
            "description": "",
            "page_title": "",
            "app_base_url": "",
            "pwa_version": "",
            "gcm_sender_id": "",
            "icon_192_url": "/icons/icon-192x192.png",
            "icon_512_url": "/icons/icon-512x512.png",
            "splash_title": "",
            "splash_tagline": "",
            "splash_image_url": "",
        }
    return {
        "name": payload.get("name", "Smart 360 AI Edition"),
        "short_name": payload.get("short_name", "Smart 360 AI"),
        "theme_color": payload.get("theme_color", "#0f766e"),
        "background_color": payload.get("background_color", "#ffffff"),
        "description": payload.get("description", "") or "",
        "page_title": payload.get("page_title", "") or "",
        "app_base_url": payload.get("app_base_url", "") or "",
        "pwa_version": payload.get("pwa_version", "") or "",
        "gcm_sender_id": payload.get("gcm_sender_id", "") or "",
        "icon_192_url": payload.get("icon_192_url", "/icons/icon-192x192.png") or "/icons/icon-192x192.png",
        "icon_512_url": payload.get("icon_512_url", "/icons/icon-512x512.png") or "/icons/icon-512x512.png",
        "splash_title": payload.get("splash_title", "") or "",
        "splash_tagline": payload.get("splash_tagline", "") or "",
        "splash_image_url": payload.get("splash_image_url", "") or "",
    }


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
        # Public settings reads
        ("mydigitalid_public", "GET", "/api/settings/mydigitalid", None, (200,), None),
        ("landing_public", "GET", "/api/settings/landing/public", None, (200,), None),
        ("onboarding_public", "GET", "/api/public/settings/onboarding", None, (200,), None),
        ("portal_public", "GET", "/api/public/settings/portal", None, (200,), None),
        ("bus_booking_public", "GET", "/api/public/settings/bus-booking", None, (200,), None),
        ("pwa_public", "GET", "/api/public/settings/pwa", None, (200,), None),
        ("manifest_public", "GET", "/api/manifest", None, (200,), None),
        ("module_settings_public", "GET", "/api/settings/modules/public", None, (200,), None),
        ("system_config_public", "GET", "/api/settings/system-config/public", None, (200,), None),
        # Authenticated settings reads
        ("system_config_superadmin", "GET", "/api/settings/system-config", super_token, (200,), None),
        ("module_settings_superadmin", "GET", "/api/settings/modules", super_token, (200,), None),
        ("upload_settings_superadmin", "GET", "/api/settings/upload", super_token, (200,), None),
        ("upload_settings_parent_forbidden", "GET", "/api/settings/upload", parent_token, (403,), None),
        ("pwa_settings_superadmin", "GET", "/api/settings/pwa", super_token, (200,), None),
        ("landing_settings_superadmin", "GET", "/api/settings/landing", super_token, (200,), None),
        ("onboarding_settings_superadmin", "GET", "/api/settings/onboarding", super_token, (200,), None),
        ("portal_settings_superadmin", "GET", "/api/settings/portal", super_token, (200,), None),
        ("bus_booking_settings_superadmin", "GET", "/api/settings/bus-booking", super_token, (200,), None),
        ("email_settings_superadmin", "GET", "/api/settings/email", super_token, (200,), None),
        ("email_settings_parent_forbidden", "GET", "/api/settings/email", parent_token, (403,), None),
        ("email_status_superadmin", "GET", "/api/settings/email-status", super_token, (200,), None),
        ("email_status_parent_forbidden", "GET", "/api/settings/email-status", parent_token, (403,), None),
        ("ses_settings_superadmin", "GET", "/api/settings/ses", super_token, (200,), None),
        ("ses_settings_parent_forbidden", "GET", "/api/settings/ses", parent_token, (403,), None),
        ("smtp_settings_superadmin", "GET", "/api/settings/smtp", super_token, (200,), None),
        ("smtp_settings_parent_forbidden", "GET", "/api/settings/smtp", parent_token, (403,), None),
    ]

    for name, method, path, token, expected, req_payload in read_cases:
        status, out_payload = _request_json(base_url, method, path, token=token, payload=req_payload)
        _append_check(results, name, method, path, expected, status, out_payload)
        captured[name] = out_payload

    _append_assert(
        results,
        "mydigitalid_public_shape",
        "/api/settings/mydigitalid",
        isinstance(captured.get("mydigitalid_public"), dict)
        and "enabled" in captured["mydigitalid_public"]
        and "action" in captured["mydigitalid_public"]
        and "url" in captured["mydigitalid_public"]
        and "nonce" in captured["mydigitalid_public"],
        detail=f"payload={_short_payload(captured.get('mydigitalid_public'))}",
    )

    _append_assert(
        results,
        "system_config_public_shape",
        "/api/settings/system-config/public",
        isinstance(captured.get("system_config_public"), dict)
        and isinstance(captured["system_config_public"].get("kelas"), list)
        and isinstance(captured["system_config_public"].get("tingkatan"), list)
        and isinstance(captured["system_config_public"].get("bangsa"), list)
        and isinstance(captured["system_config_public"].get("agama"), list)
        and isinstance(captured["system_config_public"].get("negeri"), list),
        detail=f"payload={_short_payload(captured.get('system_config_public'))}",
    )

    _append_assert(
        results,
        "module_settings_superadmin_shape",
        "/api/settings/modules",
        isinstance(captured.get("module_settings_superadmin"), dict)
        and isinstance(captured["module_settings_superadmin"].get("modules"), dict)
        and "hostel" in captured["module_settings_superadmin"].get("modules", {}),
        detail=f"payload={_short_payload(captured.get('module_settings_superadmin'))}",
    )

    _append_assert(
        results,
        "upload_settings_superadmin_shape",
        "/api/settings/upload",
        isinstance(captured.get("upload_settings_superadmin"), dict)
        and "portal_url" in captured["upload_settings_superadmin"]
        and "claim_code_prefix" in captured["upload_settings_superadmin"]
        and "auto_approve" in captured["upload_settings_superadmin"],
        detail=f"payload={_short_payload(captured.get('upload_settings_superadmin'))}",
    )

    _append_assert(
        results,
        "pwa_settings_superadmin_shape",
        "/api/settings/pwa",
        isinstance(captured.get("pwa_settings_superadmin"), dict)
        and isinstance(captured["pwa_settings_superadmin"].get("name"), str)
        and isinstance(captured["pwa_settings_superadmin"].get("short_name"), str)
        and isinstance(captured["pwa_settings_superadmin"].get("theme_color"), str),
        detail=f"payload={_short_payload(captured.get('pwa_settings_superadmin'))}",
    )

    _append_assert(
        results,
        "landing_public_shape",
        "/api/settings/landing/public",
        isinstance(captured.get("landing_public"), dict)
        and isinstance(captured["landing_public"].get("hero_image_url"), str),
        detail=f"payload={_short_payload(captured.get('landing_public'))}",
    )

    _append_assert(
        results,
        "onboarding_public_shape",
        "/api/public/settings/onboarding",
        isinstance(captured.get("onboarding_public"), dict)
        and isinstance(captured["onboarding_public"].get("slides"), list),
        detail=f"payload={_short_payload(captured.get('onboarding_public'))}",
    )

    _append_assert(
        results,
        "portal_public_shape",
        "/api/public/settings/portal",
        isinstance(captured.get("portal_public"), dict)
        and isinstance(captured["portal_public"].get("portal_title"), str)
        and isinstance(captured["portal_public"].get("institution_name"), str),
        detail=f"payload={_short_payload(captured.get('portal_public'))}",
    )

    _append_assert(
        results,
        "bus_booking_public_shape",
        "/api/public/settings/bus-booking",
        isinstance(captured.get("bus_booking_public"), dict)
        and isinstance(captured["bus_booking_public"].get("require_leave_approval"), bool),
        detail=f"payload={_short_payload(captured.get('bus_booking_public'))}",
    )

    _append_assert(
        results,
        "manifest_public_shape",
        "/api/manifest",
        isinstance(captured.get("manifest_public"), dict)
        and isinstance(captured["manifest_public"].get("name"), str)
        and isinstance(captured["manifest_public"].get("start_url"), str)
        and isinstance(captured["manifest_public"].get("icons"), list),
        detail=f"payload={_short_payload(captured.get('manifest_public'))}",
    )

    _append_assert(
        results,
        "email_status_superadmin_shape",
        "/api/settings/email-status",
        isinstance(captured.get("email_status_superadmin"), dict)
        and isinstance(captured["email_status_superadmin"].get("resend_enabled"), bool)
        and isinstance(captured["email_status_superadmin"].get("ses_enabled"), bool)
        and isinstance(captured["email_status_superadmin"].get("smtp_enabled"), bool)
        and isinstance(captured["email_status_superadmin"].get("dev_mode"), bool),
        detail=f"payload={_short_payload(captured.get('email_status_superadmin'))}",
    )

    if include_write:
        perf_budget_ms = DEFAULT_PERF_BUDGET_MS
        modules_payload = _sanitize_modules_payload(captured.get("module_settings_superadmin"))
        upload_payload = captured.get("upload_settings_superadmin")
        if not isinstance(upload_payload, dict):
            upload_payload = {
                "portal_url": "https://portal.mrsmku.edu.my",
                "claim_code_prefix": "CLAIM",
                "auto_approve": False,
            }
        pwa_payload = _sanitize_pwa_payload(captured.get("pwa_settings_superadmin"))
        landing_payload = {
            "hero_image_url": (captured.get("landing_settings_superadmin") or {}).get("hero_image_url", "")
            if isinstance(captured.get("landing_settings_superadmin"), dict)
            else ""
        }
        onboarding_payload = {
            "slides": (captured.get("onboarding_settings_superadmin") or {}).get("slides", [])
            if isinstance(captured.get("onboarding_settings_superadmin"), dict)
            else []
        }
        portal_payload = {
            "portal_title": (captured.get("portal_settings_superadmin") or {}).get("portal_title", "SMART360: Ai Edition")
            if isinstance(captured.get("portal_settings_superadmin"), dict)
            else "SMART360: Ai Edition",
            "institution_name": (captured.get("portal_settings_superadmin") or {}).get("institution_name", "MRSMKU")
            if isinstance(captured.get("portal_settings_superadmin"), dict)
            else "MRSMKU",
        }
        bus_booking_payload = {
            "require_leave_approval": bool(
                (captured.get("bus_booking_settings_superadmin") or {}).get("require_leave_approval", False)
            )
            if isinstance(captured.get("bus_booking_settings_superadmin"), dict)
            else False
        }
        system_config_payload = captured.get("system_config_superadmin")
        if not isinstance(system_config_payload, dict):
            system_config_payload = {
                "kelas": ["A", "B", "C", "D", "E", "F"],
                "tingkatan": [1, 2, 3, 4, 5],
                "bangsa": ["Melayu", "Cina", "India"],
                "agama": ["Islam", "Buddha", "Hindu"],
                "negeri": ["Johor", "Selangor", "Perak"],
            }

        write_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
            # Idempotent saves with current payload
            ("modules_save_superadmin", "POST", "/api/settings/modules", super_token, (200,), modules_payload),
            ("modules_save_parent_forbidden", "POST", "/api/settings/modules", parent_token, (403,), modules_payload),
            ("upload_save_superadmin", "POST", "/api/settings/upload", super_token, (200,), upload_payload),
            ("upload_save_parent_forbidden", "POST", "/api/settings/upload", parent_token, (403,), upload_payload),
            ("pwa_save_superadmin", "POST", "/api/settings/pwa", super_token, (200,), pwa_payload),
            ("pwa_save_parent_forbidden", "POST", "/api/settings/pwa", parent_token, (403,), pwa_payload),
            ("landing_save_superadmin", "POST", "/api/settings/landing", super_token, (200,), landing_payload),
            ("landing_save_parent_forbidden", "POST", "/api/settings/landing", parent_token, (403,), landing_payload),
            ("onboarding_save_superadmin", "POST", "/api/settings/onboarding", super_token, (200,), onboarding_payload),
            ("onboarding_save_parent_forbidden", "POST", "/api/settings/onboarding", parent_token, (403,), onboarding_payload),
            ("portal_save_superadmin", "POST", "/api/settings/portal", super_token, (200,), portal_payload),
            ("portal_save_parent_forbidden", "POST", "/api/settings/portal", parent_token, (403,), portal_payload),
            ("bus_booking_save_superadmin", "POST", "/api/settings/bus-booking", super_token, (200,), bus_booking_payload),
            ("bus_booking_save_parent_forbidden", "POST", "/api/settings/bus-booking", parent_token, (403,), bus_booking_payload),
            ("system_config_save_superadmin", "POST", "/api/settings/system-config", super_token, (200,), system_config_payload),
            ("system_config_save_parent_forbidden", "POST", "/api/settings/system-config", parent_token, (403,), system_config_payload),
            # Guard + validation checks for sensitive settings
            (
                "mydigitalid_save_parent_forbidden",
                "POST",
                "/api/settings/mydigitalid",
                parent_token,
                (403,),
                {"action": "login", "url": "https://example.test/login", "nonce": "smoke-nonce"},
            ),
            ("mydigitalid_save_validation_superadmin", "POST", "/api/settings/mydigitalid", super_token, (422,), {}),
            (
                "email_save_parent_forbidden",
                "POST",
                "/api/settings/email",
                parent_token,
                (403,),
                {"api_key": "re_smoke_dummy_123", "sender_email": "no-reply@example.test", "sender_name": "Smoke"},
            ),
            (
                "email_save_validation_superadmin",
                "POST",
                "/api/settings/email",
                super_token,
                (400,),
                {"api_key": "invalid-key", "sender_email": "no-reply@example.test", "sender_name": "Smoke"},
            ),
            ("ses_save_parent_forbidden", "POST", "/api/settings/ses", parent_token, (403,), {"access_key_id": "AKIA", "secret_access_key": "x"}),
            ("ses_save_validation_superadmin", "POST", "/api/settings/ses", super_token, (400,), {}),
            (
                "smtp_save_parent_forbidden",
                "POST",
                "/api/settings/smtp",
                parent_token,
                (403,),
                {"host": "smtp.example.test", "user": "smoke@example.test", "password": "secret123"},
            ),
            ("smtp_save_validation_superadmin", "POST", "/api/settings/smtp", super_token, (400,), {}),
        ]

        for name, method, path, token, expected, req_payload in write_cases:
            status, out_payload = _request_json(base_url, method, path, token=token, payload=req_payload)
            _append_check(results, name, method, path, expected, status, out_payload)

        perf_cases: list[
            Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]
        ] = [
            ("perf_settings_system_config", "GET", "/api/settings/system-config", super_token, (200,), None),
            ("perf_settings_modules", "GET", "/api/settings/modules", super_token, (200,), None),
            ("perf_settings_email_status", "GET", "/api/settings/email-status", super_token, (200,), None),
            ("perf_settings_onboarding_public", "GET", "/api/public/settings/onboarding", None, (200,), None),
            ("perf_manifest_public", "GET", "/api/manifest", None, (200,), None),
            ("perf_settings_pwa_public", "GET", "/api/public/settings/pwa", None, (200,), None),
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
    parser = argparse.ArgumentParser(description="System/settings smoke test (postgres mode).")
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
