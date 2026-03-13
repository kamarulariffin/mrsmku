#!/usr/bin/env python3
"""
Run a repeatable postgres stability gate:
- N consecutive smoke matrix runs (--include-write)
- Mongo-only operator audit (routes)
- Backlog parity plan + verify
- Optional auto reconcile from postgres -> mongo when drift exists

Emits JSON summary to stdout and writes artifact to backend/logs.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


SUMMARY_RE = re.compile(r"SUMMARY total=(?P<total>\d+) passed=(?P<passed>\d+) failed=(?P<failed>\d+)")

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = BACKEND_ROOT / "scripts"
LOGS_DIR = BACKEND_ROOT / "logs"


def _resolve_python_executable() -> str:
    override = (os.environ.get("BACKEND_PYTHON") or "").strip()
    if override:
        override_path = Path(override).expanduser()
        if override_path.exists():
            return str(override_path)
        return override

    candidates = [
        BACKEND_ROOT / "venv" / "bin" / "python",
        BACKEND_ROOT / "venv" / "Scripts" / "python.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return sys.executable


PYTHON_EXECUTABLE = _resolve_python_executable()


@dataclass(frozen=True)
class SuiteSpec:
    key: str
    script: str
    extra_args: Tuple[str, ...] = ()


SUITES: Tuple[SuiteSpec, ...] = (
    SuiteSpec("yuran", "smoke_yuran_postgres.py"),
    SuiteSpec("inventory", "smoke_inventory_postgres.py"),
    SuiteSpec("accounting_legacy", "smoke_accounting_legacy_postgres.py"),
    SuiteSpec("accounting_full", "smoke_accounting_full_postgres.py"),
    SuiteSpec("bank_reconciliation", "smoke_bank_reconciliation_postgres.py"),
    SuiteSpec("bus_dashboard_payment", "smoke_bus_dashboard_payment_postgres.py"),
    SuiteSpec("hostel_sickbay_warden_discipline_risk", "smoke_hostel_sickbay_warden_discipline_risk_postgres.py"),
    SuiteSpec("marketplace_koperasi_student_import", "smoke_marketplace_koperasi_student_import_postgres.py"),
    SuiteSpec("upload_pwa_chatbox", "smoke_upload_pwa_chatbox_postgres.py"),
    SuiteSpec("system_settings", "smoke_system_settings_postgres.py"),
    SuiteSpec("infaq_analytics_system_config", "smoke_infaq_analytics_system_config_postgres.py"),
)


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_json_parse(raw: str) -> Optional[Dict[str, Any]]:
    txt = (raw or "").strip()
    if not txt:
        return None
    try:
        parsed = json.loads(txt)
        if isinstance(parsed, dict):
            return parsed
        return None
    except json.JSONDecodeError:
        pass
    first = txt.find("{")
    last = txt.rfind("}")
    if first == -1 or last == -1 or first >= last:
        return None
    maybe = txt[first : last + 1]
    try:
        parsed = json.loads(maybe)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        return None
    return None


def _parse_summary(stdout_text: str) -> Optional[Dict[str, int]]:
    match = SUMMARY_RE.search(stdout_text or "")
    if not match:
        return None
    return {
        "total": int(match.group("total")),
        "passed": int(match.group("passed")),
        "failed": int(match.group("failed")),
    }


def _run_command(
    args: List[str],
    *,
    cwd: Path,
) -> Dict[str, Any]:
    proc = subprocess.run(
        args,
        cwd=str(cwd),
        capture_output=True,
        text=True,
    )
    return {
        "args": args,
        "exit_code": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _run_suite(
    suite: SuiteSpec,
    *,
    run_idx: int,
    run_log_dir: Path,
    base_url: str = "",
) -> Dict[str, Any]:
    script_path = SCRIPTS_DIR / suite.script
    args = [PYTHON_EXECUTABLE, str(script_path), "--include-write", *suite.extra_args]
    if base_url:
        args.extend(["--base-url", base_url])
    result = _run_command(args, cwd=BACKEND_ROOT)

    log_file = run_log_dir / f"run{run_idx:02d}_{suite.key}.log"
    log_content = (
        f"# command: {' '.join(args)}\n"
        f"# exit_code: {result['exit_code']}\n\n"
        f"{result['stdout'] or ''}\n"
        f"{result['stderr'] or ''}"
    )
    _write_text(log_file, log_content)

    summary = _parse_summary(result["stdout"] or "")
    ok = bool(
        result["exit_code"] == 0
        and summary
        and summary.get("failed", 1) == 0
    )
    return {
        "suite": suite.key,
        "script": suite.script,
        "args": ["--include-write", *list(suite.extra_args), *(["--base-url", base_url] if base_url else [])],
        "exit_code": result["exit_code"],
        "summary": summary,
        "ok": ok,
        "log_file": str(log_file.relative_to(BACKEND_ROOT)),
    }


def _run_matrix(runs: int, artifact_root: Path, *, base_url: str = "") -> Dict[str, Any]:
    matrix_runs: List[Dict[str, Any]] = []
    for idx in range(1, runs + 1):
        run_log_dir = artifact_root / "smoke_matrix"
        suites: List[Dict[str, Any]] = []
        run_ok = True
        for suite in SUITES:
            suite_result = _run_suite(
                suite,
                run_idx=idx,
                run_log_dir=run_log_dir,
                base_url=base_url,
            )
            suites.append(suite_result)
            if not suite_result["ok"]:
                run_ok = False
                break
        matrix_runs.append(
            {
                "run": idx,
                "ok": run_ok,
                "suites": suites,
            }
        )
        if not run_ok:
            break
    all_ok = len(matrix_runs) == runs and all(r["ok"] for r in matrix_runs)
    return {"runs_requested": runs, "runs": matrix_runs, "ok": all_ok}


def _run_audit_and_parity() -> Dict[str, Any]:
    audit = _run_command(
        [PYTHON_EXECUTABLE, str(SCRIPTS_DIR / "audit_mongo_only_usage.py"), "--path", "routes"],
        cwd=BACKEND_ROOT,
    )
    plan = _run_command(
        [PYTHON_EXECUTABLE, str(SCRIPTS_DIR / "plan_backlog_reconcile.py")],
        cwd=BACKEND_ROOT,
    )
    verify = _run_command(
        [PYTHON_EXECUTABLE, str(SCRIPTS_DIR / "verify_backlog_parity.py"), "--modules", "backlog_all"],
        cwd=BACKEND_ROOT,
    )

    audit_json = _safe_json_parse(audit["stdout"] or "")
    plan_json = _safe_json_parse(plan["stdout"] or "")
    verify_json = _safe_json_parse(verify["stdout"] or "")

    return {
        "audit": {
            "exit_code": audit["exit_code"],
            "json": audit_json,
        },
        "plan": {
            "exit_code": plan["exit_code"],
            "json": plan_json,
        },
        "verify": {
            "exit_code": verify["exit_code"],
            "json": verify_json,
        },
    }


def _drift_collections(plan_json: Optional[Dict[str, Any]]) -> List[str]:
    if not isinstance(plan_json, dict):
        return []
    colls = plan_json.get("collections")
    if not isinstance(colls, dict):
        return []
    out: List[str] = []
    for name, entry in colls.items():
        if not isinstance(entry, dict):
            continue
        if entry.get("classification") != "aligned":
            out.append(name)
    return out


def _audit_hits(audit_json: Optional[Dict[str, Any]]) -> int:
    if not isinstance(audit_json, dict):
        return -1
    try:
        return int(audit_json.get("total_hits", -1))
    except Exception:
        return -1


def _verify_ok(verify_json: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(verify_json, dict):
        return False
    return bool(verify_json.get("ok"))


def _reconcile_from_postgres(collections: List[str]) -> Dict[str, Any]:
    if not collections:
        return {"skipped": True, "reason": "no_drift_collections"}
    cmd = [
        PYTHON_EXECUTABLE,
        str(SCRIPTS_DIR / "reconcile_core_divergence.py"),
        "--source",
        "postgres",
        "--collections",
        *collections,
        "--execute",
    ]
    run = _run_command(cmd, cwd=BACKEND_ROOT)
    return {
        "skipped": False,
        "exit_code": run["exit_code"],
        "json": _safe_json_parse(run["stdout"] or ""),
        "collections": collections,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run postgres smoke stability gate.")
    parser.add_argument("--runs", type=int, default=3, help="Consecutive include-write matrix runs.")
    parser.add_argument(
        "--base-url",
        default="",
        help="Optional backend base URL passed to all smoke suites (e.g. http://127.0.0.1:8001).",
    )
    parser.add_argument(
        "--auto-reconcile",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Auto reconcile drift collections from postgres to mongo.",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Optional output JSON path (default: backend/logs/stability_gate_<timestamp>.json).",
    )
    args = parser.parse_args()

    started_at = _now_utc_iso()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    artifact_root = LOGS_DIR / f"stability_gate_{ts}"
    artifact_root.mkdir(parents=True, exist_ok=True)

    report: Dict[str, Any] = {
        "started_at": started_at,
        "runs_requested": args.runs,
        "auto_reconcile": bool(args.auto_reconcile),
        "base_url": args.base_url or None,
        "python_executable": PYTHON_EXECUTABLE,
    }

    matrix = _run_matrix(args.runs, artifact_root, base_url=(args.base_url or "").rstrip("/"))
    report["matrix"] = matrix

    checks_before = _run_audit_and_parity()
    report["checks_before_reconcile"] = checks_before

    drift = _drift_collections((checks_before.get("plan") or {}).get("json"))
    report["drift_collections_before"] = drift

    reconcile_result: Dict[str, Any] = {"skipped": True, "reason": "not_requested"}
    checks_after = checks_before
    if args.auto_reconcile and drift:
        reconcile_result = _reconcile_from_postgres(drift)
        checks_after = _run_audit_and_parity()
    report["reconcile"] = reconcile_result
    report["checks_after_reconcile"] = checks_after

    audit_hits = _audit_hits(((checks_after.get("audit") or {}).get("json")))
    verify_ok = _verify_ok(((checks_after.get("verify") or {}).get("json")))
    drift_after = _drift_collections((checks_after.get("plan") or {}).get("json"))

    gate_ok = bool(
        matrix.get("ok")
        and audit_hits == 0
        and verify_ok
        and len(drift_after) == 0
    )

    report["gate"] = {
        "matrix_ok": bool(matrix.get("ok")),
        "audit_total_hits": audit_hits,
        "parity_ok": verify_ok,
        "drift_collections_after": drift_after,
        "ok": gate_ok,
    }
    report["finished_at"] = _now_utc_iso()

    out_path = Path(args.output).resolve() if args.output else (LOGS_DIR / f"stability_gate_{ts}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    report["output_path"] = str(out_path)
    out_path.write_text(json.dumps(report, ensure_ascii=True, indent=2), encoding="utf-8")

    print(json.dumps(report, ensure_ascii=True, indent=2))
    return 0 if gate_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
