#!/usr/bin/env python3
"""
One-command daily cutover check:
1) run stability gate
2) optionally update incident-window day row (auto-select first empty day)
3) generate readiness report
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "backend" / "scripts"
SIGNOFF_DOC = REPO_ROOT / "docs" / "POSTGRES_DOMAIN_OWNER_UAT_SIGNOFF.md"


def _today_utc_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _run(args: List[str]) -> Dict[str, Any]:
    proc = subprocess.run(
        args,
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
    )
    return {
        "args": args,
        "exit_code": proc.returncode,
        "stdout": proc.stdout or "",
        "stderr": proc.stderr or "",
    }


def _parse_json_from_stdout(raw: str) -> Optional[Dict[str, Any]]:
    txt = (raw or "").strip()
    if not txt:
        return None
    try:
        payload = json.loads(txt)
        if isinstance(payload, dict):
            return payload
    except Exception:
        pass
    first = txt.find("{")
    last = txt.rfind("}")
    if first == -1 or last == -1 or first >= last:
        return None
    try:
        payload = json.loads(txt[first : last + 1])
        if isinstance(payload, dict):
            return payload
    except Exception:
        return None
    return None


def _parse_markdown_row(line: str) -> List[str]:
    txt = line.strip()
    if not txt.startswith("|"):
        return []
    return [p.strip() for p in txt.split("|")[1:-1]]


def _resolve_next_incident_day(doc_path: Path) -> Optional[str]:
    lines = doc_path.read_text(encoding="utf-8").splitlines()
    header = "| Hari | Tarikh | Baseline Gate Artifact | Insiden Kritikal | Rollback ke Hybrid/Mongo | Catatan |"
    divider = "| --- | --- | --- | --- | --- | --- |"
    start = None
    for idx, line in enumerate(lines):
        if line.strip() == header:
            start = idx
            break
    if start is None or start + 1 >= len(lines) or lines[start + 1].strip() != divider:
        return None
    idx = start + 2
    while idx < len(lines) and lines[idx].lstrip().startswith("|"):
        row = _parse_markdown_row(lines[idx])
        idx += 1
        if len(row) != 6:
            continue
        day = row[0]
        date_value = row[1]
        artifact = row[2].strip().strip("`")
        if day and (not date_value or not artifact):
            return day
    return None


def _as_repo_relative(path_value: str) -> str:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        try:
            return str(path.resolve().relative_to(REPO_ROOT))
        except ValueError:
            return str(path.resolve())
    return str(path)


def _latest_stability_artifact() -> Optional[str]:
    candidates = sorted((REPO_ROOT / "backend" / "logs").glob("stability_gate_*.json"))
    if not candidates:
        return None
    try:
        return str(candidates[-1].resolve().relative_to(REPO_ROOT))
    except ValueError:
        return str(candidates[-1].resolve())


def main() -> int:
    parser = argparse.ArgumentParser(description="Run daily cutover check pipeline.")
    parser.add_argument("--runs", type=int, default=1, help="Stability gate run count.")
    parser.add_argument(
        "--base-url",
        default="",
        help="Optional backend base URL passed to stability gate suites.",
    )
    parser.add_argument(
        "--day",
        default="auto",
        help="Incident day marker (D1..D7) or auto to pick first empty day.",
    )
    parser.add_argument("--date", default=_today_utc_date(), help="Incident date (YYYY-MM-DD).")
    parser.add_argument("--critical-incidents", type=int, default=0, help="Critical incident count.")
    parser.add_argument("--rollback", choices=["Tidak", "Ya"], default="Tidak", help="Rollback marker.")
    parser.add_argument("--notes", default="Daily cutover check", help="Incident notes.")
    parser.add_argument(
        "--update-incident",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Update incident window row in signoff doc.",
    )
    parser.add_argument(
        "--enforce-sequence",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Pass sequence validation flag to incident updater.",
    )
    parser.add_argument(
        "--validate-artifact-gate",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Require gate artifact to be valid before incident update.",
    )
    parser.add_argument(
        "--auto-reconcile",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Pass auto-reconcile flag to stability gate runner.",
    )
    parser.add_argument(
        "--require-matrix-runs",
        type=int,
        default=3,
        help="Threshold passed to readiness report generator.",
    )
    parser.add_argument(
        "--dry-run",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Run pipeline with incident update in preview mode (no markdown write).",
    )
    args = parser.parse_args()

    gate_cmd = [
        sys.executable,
        str(SCRIPTS_DIR / "run_smoke_stability_gate.py"),
        "--runs",
        str(max(1, args.runs)),
    ]
    if args.base_url:
        gate_cmd.extend(["--base-url", args.base_url.rstrip("/")])
    if args.auto_reconcile:
        gate_cmd.append("--auto-reconcile")
    else:
        gate_cmd.append("--no-auto-reconcile")
    gate_run = _run(gate_cmd)
    gate_json = _parse_json_from_stdout(gate_run["stdout"])

    artifact = ""
    if isinstance(gate_json, dict):
        artifact = _as_repo_relative(str(gate_json.get("output_path") or "")).strip()
    if not artifact:
        artifact = _latest_stability_artifact() or ""

    incident_update: Dict[str, Any] = {"executed": False}
    resolved_day: Optional[str] = None
    if args.update_incident:
        if args.day == "auto":
            resolved_day = _resolve_next_incident_day(SIGNOFF_DOC)
        else:
            resolved_day = args.day
        if resolved_day and artifact:
            incident_cmd = [
                sys.executable,
                str(SCRIPTS_DIR / "update_incident_window.py"),
                "--day",
                resolved_day,
                "--artifact",
                artifact,
                "--date",
                args.date,
                "--critical-incidents",
                str(max(0, args.critical_incidents)),
                "--rollback",
                args.rollback,
                "--notes",
                args.notes,
            ]
            if args.enforce_sequence:
                incident_cmd.append("--enforce-sequence")
            else:
                incident_cmd.append("--no-enforce-sequence")
            if args.validate_artifact_gate:
                incident_cmd.append("--validate-artifact-gate")
            else:
                incident_cmd.append("--no-validate-artifact-gate")
            if args.dry_run:
                incident_cmd.append("--dry-run")
            incident_run = _run(incident_cmd)
            incident_update = {
                "executed": True,
                "day": resolved_day,
                "dry_run": bool(args.dry_run),
                "exit_code": incident_run["exit_code"],
                "stdout": incident_run["stdout"],
                "stderr": incident_run["stderr"],
            }
        else:
            incident_update = {
                "executed": False,
                "day": resolved_day or "",
                "dry_run": bool(args.dry_run),
                "reason": "no_available_day_or_artifact",
            }

    readiness_cmd = [
        sys.executable,
        str(SCRIPTS_DIR / "generate_cutover_readiness_report.py"),
        "--require-matrix-runs",
        str(max(1, args.require_matrix_runs)),
    ]
    readiness_run = _run(readiness_cmd)
    readiness_json = _parse_json_from_stdout(readiness_run["stdout"])

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": bool(args.dry_run),
        "gate": {
            "exit_code": gate_run["exit_code"],
            "artifact": artifact,
            "ok": bool((gate_json or {}).get("gate", {}).get("ok")) if isinstance(gate_json, dict) else False,
        },
        "incident_update": incident_update,
        "readiness": {
            "exit_code": readiness_run["exit_code"],
            "ready_for_sunset": bool((readiness_json or {}).get("ready_for_sunset")) if isinstance(readiness_json, dict) else False,
            "output_path": (readiness_json or {}).get("output_path") if isinstance(readiness_json, dict) else "",
        },
    }
    print(json.dumps(result, ensure_ascii=True, indent=2))

    incident_ok = True
    if incident_update.get("executed"):
        incident_ok = int(incident_update.get("exit_code", 1)) == 0

    return 0 if gate_run["exit_code"] == 0 and readiness_run["exit_code"] == 0 and incident_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
