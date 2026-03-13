#!/usr/bin/env python3
"""
Role-aware smoke checks for Upload + PWA + Chatbox FAQ in postgres-only mode.

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
DEFAULT_TIMEOUT = 30
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
    captured: Dict[str, Any] = {}

    super_token = _login(base_url, superadmin)
    parent_token = _login(base_url, parent)
    if not super_token:
        print("ERROR: superadmin login failed")
        return 2
    if not parent_token:
        print("ERROR: parent login failed")
        return 2

    read_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
        # PWA
        ("pwa_version_public", "GET", "/api/pwa/version", None, (200,), None),
        (
            "pwa_send_notification_parent_forbidden",
            "POST",
            "/api/send-notification",
            parent_token,
            (403,),
            {"title": "Ujian", "body": "Tidak dibenarkan"},
        ),
        # Chatbox FAQ admin
        ("chatbox_faq_admin_superadmin", "GET", "/api/chatbox/faq/admin", super_token, (200,), None),
        ("chatbox_faq_admin_parent_forbidden", "GET", "/api/chatbox/faq/admin", parent_token, (403,), None),
        # Upload image/file serving endpoints with missing file
        ("upload_editor_image_missing", "GET", "/api/upload/images/editor/nonexistent.jpg", None, (404,), None),
        ("upload_bus_image_missing", "GET", "/api/upload/images/bus/nonexistent.jpg", None, (404,), None),
        ("upload_product_image_missing", "GET", "/api/upload/images/products/nonexistent.jpg", None, (404,), None),
        ("upload_landing_image_missing", "GET", "/api/upload/images/landing/nonexistent.jpg", None, (404,), None),
        ("upload_onboarding_image_missing", "GET", "/api/upload/images/onboarding/nonexistent.jpg", None, (404,), None),
        ("upload_app_icon_missing", "GET", "/api/upload/images/app-icon/nonexistent.png", None, (404,), None),
        ("chatbox_file_missing", "GET", "/api/chatbox/faq/files/nonexistent.pdf", None, (404,), None),
    ]

    for name, method, path, token, expected, req_payload in read_cases:
        status, out_payload = _request_json(base_url, method, path, token=token, payload=req_payload)
        _append_check(results, name, method, path, expected, status, out_payload)
        if name in {"pwa_version_public", "chatbox_faq_admin_superadmin"}:
            captured[name] = out_payload

    pwa_version_payload = captured.get("pwa_version_public")
    _append_assert(
        results,
        "pwa_version_shape",
        "/api/pwa/version",
        isinstance(pwa_version_payload, dict)
        and isinstance(pwa_version_payload.get("version"), str)
        and isinstance(pwa_version_payload.get("name"), str),
        detail=f"payload={_short_payload(pwa_version_payload)}",
    )

    chatbox_admin_payload = captured.get("chatbox_faq_admin_superadmin")
    _append_assert(
        results,
        "chatbox_admin_shape",
        "/api/chatbox/faq/admin",
        isinstance(chatbox_admin_payload, dict) and isinstance(chatbox_admin_payload.get("items"), list),
        detail=f"payload={_short_payload(chatbox_admin_payload)}",
    )

    if include_write:
        perf_budget_ms = DEFAULT_PERF_BUDGET_MS
        write_cases: list[Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]] = [
            # PWA write checks
            (
                "pwa_register_token_parent",
                "POST",
                "/api/register-device-token",
                parent_token,
                (200,),
                {"fcm_token": "tok_parent_smoke_1234567890", "device_type": "web", "device_name": "smoke-parent"},
            ),
            (
                "pwa_register_token_superadmin",
                "POST",
                "/api/register-device-token",
                super_token,
                (200,),
                {"fcm_token": "tok_super_smoke_1234567890", "device_type": "web", "device_name": "smoke-super"},
            ),
            (
                "pwa_send_notification_superadmin",
                "POST",
                "/api/send-notification",
                super_token,
                (200,),
                {"title": "Smoke Test", "body": "Ping from smoke script"},
            ),
            (
                "pwa_register_token_validation",
                "POST",
                "/api/register-device-token",
                super_token,
                (422,),
                {},
            ),
            # Validation-only checks (no file body)
            ("chatbox_create_validation", "POST", "/api/chatbox/faq", super_token, (422,), {}),
            ("chatbox_upload_validation", "POST", "/api/chatbox/faq/upload", super_token, (422,), {}),
            ("upload_product_image_validation", "POST", "/api/upload/product-image", super_token, (422,), {}),
            ("upload_editor_image_validation", "POST", "/api/upload/editor-image", super_token, (422,), {}),
            ("upload_bus_document_validation", "POST", "/api/upload/bus-document", super_token, (422,), {}),
            ("upload_landing_hero_validation", "POST", "/api/upload/landing-hero", super_token, (422,), {}),
            ("upload_onboarding_slide_validation", "POST", "/api/upload/onboarding-slide", super_token, (422,), {}),
            ("upload_app_icon_validation", "POST", "/api/upload/app-icon", super_token, (422,), {}),
        ]

        for name, method, path, token, expected, req_payload in write_cases:
            status, out_payload = _request_json(base_url, method, path, token=token, payload=req_payload)
            _append_check(results, name, method, path, expected, status, out_payload)
            if name in {
                "pwa_register_token_parent",
                "pwa_register_token_superadmin",
                "pwa_send_notification_superadmin",
            }:
                captured[name] = out_payload

        _append_assert(
            results,
            "pwa_register_token_parent_shape",
            "/api/register-device-token",
            isinstance(captured.get("pwa_register_token_parent"), dict)
            and bool(captured.get("pwa_register_token_parent", {}).get("ok")),
            detail=f"payload={_short_payload(captured.get('pwa_register_token_parent'))}",
        )
        _append_assert(
            results,
            "pwa_register_token_superadmin_shape",
            "/api/register-device-token",
            isinstance(captured.get("pwa_register_token_superadmin"), dict)
            and bool(captured.get("pwa_register_token_superadmin", {}).get("ok")),
            detail=f"payload={_short_payload(captured.get('pwa_register_token_superadmin'))}",
        )
        send_payload = captured.get("pwa_send_notification_superadmin")
        _append_assert(
            results,
            "pwa_send_notification_shape",
            "/api/send-notification",
            isinstance(send_payload, dict)
            and bool(send_payload.get("ok"))
            and isinstance(send_payload.get("sent"), int),
            detail=f"payload={_short_payload(send_payload)}",
        )

        perf_cases: list[
            Tuple[str, str, str, Optional[str], Tuple[int, ...], Optional[Dict[str, Any]]]
        ] = [
            ("perf_chatbox_admin_list", "GET", "/api/chatbox/faq/admin", super_token, (200,), None),
            ("perf_pwa_send_notification", "POST", "/api/send-notification", super_token, (200,), {"title": "Perf Smoke", "body": "Ping"}),
            (
                "perf_pwa_register_token",
                "POST",
                "/api/register-device-token",
                super_token,
                (200,),
                {"fcm_token": "tok_super_smoke_perf_1234567890", "device_type": "web", "device_name": "smoke-super-perf"},
            ),
            ("perf_pwa_version", "GET", "/api/pwa/version", None, (200,), None),
            ("perf_upload_image_missing", "GET", "/api/upload/images/editor/nonexistent.jpg", None, (404,), None),
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
    parser = argparse.ArgumentParser(description="Upload + PWA + Chatbox FAQ smoke test (postgres mode).")
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
