#!/usr/bin/env python3
"""
Generate consolidated cutover readiness report from:
- latest stability gate artifacts (backend/logs/stability_gate_*.json)
- domain owner UAT sign-off tracker markdown

Output: backend/logs/cutover_readiness_<timestamp>.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SIGNOFF_DOC = REPO_ROOT / "docs" / "POSTGRES_DOMAIN_OWNER_UAT_SIGNOFF.md"
DEFAULT_LOG_DIR = REPO_ROOT / "backend" / "logs"


@dataclass(frozen=True)
class ModuleSignoff:
    module: str
    owner: str
    environment: str
    evidence: str
    status: str
    date_signoff: str
    residual_risk: str

    @property
    def approved(self) -> bool:
        return self.status.strip().lower() == "approved"


@dataclass(frozen=True)
class IncidentDay:
    day: str
    date: str
    artifact: str
    critical_incidents: int
    rollback: str
    notes: str

    @property
    def filled(self) -> bool:
        return bool(self.date.strip() and self.artifact.strip())

    @property
    def rollback_triggered(self) -> bool:
        return self.rollback.strip().lower() == "ya"


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_markdown_row(line: str) -> List[str]:
    txt = line.strip()
    if not txt.startswith("|"):
        return []
    parts = [part.strip() for part in txt.split("|")[1:-1]]
    return parts


def _strip_ticks(value: str) -> str:
    v = value.strip()
    if v.startswith("`") and v.endswith("`") and len(v) >= 2:
        return v[1:-1].strip()
    return v


def _read_lines(path: Path) -> List[str]:
    return path.read_text(encoding="utf-8").splitlines()


def _parse_signoff_modules(lines: List[str]) -> List[ModuleSignoff]:
    header = "| Modul | Domain Owner | Environment | Bukti UAT (ticket/video/log) | Status | Tarikh Sign-Off | Nota Risiko Baki |"
    divider = "| --- | --- | --- | --- | --- | --- | --- |"
    start = None
    for idx, line in enumerate(lines):
        if line.strip() == header:
            start = idx
            break
    if start is None:
        return []
    if start + 1 >= len(lines) or lines[start + 1].strip() != divider:
        return []

    out: List[ModuleSignoff] = []
    idx = start + 2
    while idx < len(lines) and lines[idx].lstrip().startswith("|"):
        row = _parse_markdown_row(lines[idx])
        idx += 1
        if len(row) != 7:
            continue
        if not row[0]:
            continue
        out.append(
            ModuleSignoff(
                module=row[0],
                owner=row[1],
                environment=row[2],
                evidence=row[3],
                status=row[4] or "Pending",
                date_signoff=row[5],
                residual_risk=row[6],
            )
        )
    return out


def _parse_incident_days(lines: List[str]) -> List[IncidentDay]:
    header = "| Hari | Tarikh | Baseline Gate Artifact | Insiden Kritikal | Rollback ke Hybrid/Mongo | Catatan |"
    divider = "| --- | --- | --- | --- | --- | --- |"
    start = None
    for idx, line in enumerate(lines):
        if line.strip() == header:
            start = idx
            break
    if start is None:
        return []
    if start + 1 >= len(lines) or lines[start + 1].strip() != divider:
        return []

    out: List[IncidentDay] = []
    idx = start + 2
    while idx < len(lines) and lines[idx].lstrip().startswith("|"):
        row = _parse_markdown_row(lines[idx])
        idx += 1
        if len(row) != 6:
            continue
        if not row[0]:
            continue
        try:
            critical = int((row[3] or "0").strip())
        except ValueError:
            critical = 0
        out.append(
            IncidentDay(
                day=row[0],
                date=row[1],
                artifact=_strip_ticks(row[2]),
                critical_incidents=critical,
                rollback=row[4],
                notes=row[5],
            )
        )
    return out


def _load_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if isinstance(parsed, dict):
        return parsed
    return None


def _resolve_incident_artifact_path(artifact: str) -> Path:
    path = Path((artifact or "").strip()).expanduser()
    if path.is_absolute():
        return path.resolve()
    return (REPO_ROOT / path).resolve()


def _incident_artifact_state(artifact: str) -> Dict[str, Any]:
    if not artifact:
        return {
            "artifact_exists": False,
            "artifact_gate_ok": False,
            "artifact_gate_summary": None,
        }
    path = _resolve_incident_artifact_path(artifact)
    exists = path.exists()
    if not exists:
        return {
            "artifact_exists": False,
            "artifact_gate_ok": False,
            "artifact_gate_summary": None,
        }
    payload = _load_json(path)
    summary = _gate_summary(path, payload)
    return {
        "artifact_exists": True,
        "artifact_gate_ok": bool(summary.get("ok")),
        "artifact_gate_summary": summary,
    }


def _list_gate_artifacts(log_dir: Path) -> List[Path]:
    return sorted(log_dir.glob("stability_gate_*.json"))


def _as_repo_relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return str(path.resolve())


def _gate_summary(path: Path, payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    gate = (payload or {}).get("gate") if isinstance(payload, dict) else {}
    matrix = (payload or {}).get("matrix") if isinstance(payload, dict) else {}
    return {
        "path": _as_repo_relative(path),
        "ok": bool((gate or {}).get("ok")),
        "matrix_ok": bool((gate or {}).get("matrix_ok")),
        "audit_total_hits": (gate or {}).get("audit_total_hits"),
        "parity_ok": bool((gate or {}).get("parity_ok")),
        "drift_collections_after": (gate or {}).get("drift_collections_after", []),
        "runs_requested": matrix.get("runs_requested"),
        "started_at": (payload or {}).get("started_at"),
        "finished_at": (payload or {}).get("finished_at"),
    }


def _find_latest_gate(artifacts: List[Path]) -> Optional[Dict[str, Any]]:
    if not artifacts:
        return None
    latest = artifacts[-1]
    payload = _load_json(latest)
    return _gate_summary(latest, payload)


def _find_latest_consistent_matrix_gate(
    artifacts: List[Path],
    *,
    require_matrix_runs: int,
) -> Optional[Dict[str, Any]]:
    for path in reversed(artifacts):
        payload = _load_json(path)
        if not isinstance(payload, dict):
            continue
        gate = payload.get("gate") or {}
        matrix = payload.get("matrix") or {}
        runs_requested = int(matrix.get("runs_requested") or 0)
        if runs_requested < require_matrix_runs:
            continue
        if bool(gate.get("ok")) and bool(gate.get("matrix_ok")):
            return _gate_summary(path, payload)
    return None


def _module_section(modules: List[ModuleSignoff]) -> Dict[str, Any]:
    total = len(modules)
    approved = [m for m in modules if m.approved]
    return {
        "items": [
            {
                "module": m.module,
                "owner": m.owner,
                "environment": m.environment,
                "evidence": m.evidence,
                "status": m.status,
                "date_signoff": m.date_signoff,
                "residual_risk": m.residual_risk,
                "approved": m.approved,
            }
            for m in modules
        ],
        "total": total,
        "approved_count": len(approved),
        "all_approved": total > 0 and len(approved) == total,
    }


def _incident_section(days: List[IncidentDay]) -> Dict[str, Any]:
    canonical_order = [f"D{i}" for i in range(1, 8)]
    by_day = {d.day: d for d in days}
    ordered_days = [by_day.get(day) for day in canonical_order]

    items: List[Dict[str, Any]] = []
    filled_count = 0
    rollback_hits = 0
    total_critical_incidents = 0
    artifact_gate_fail_days: List[str] = []
    filled_with_artifact_gate_ok = 0
    for entry in ordered_days:
        if entry is None:
            items.append(
                {
                    "day": canonical_order[len(items)],
                    "date": "",
                    "artifact": "",
                    "critical_incidents": 0,
                    "rollback": "",
                    "notes": "",
                    "filled": False,
                    "rollback_triggered": False,
                    "artifact_exists": False,
                    "artifact_gate_ok": False,
                    "artifact_gate_summary": None,
                }
            )
            continue
        filled = entry.filled
        artifact_state = _incident_artifact_state(entry.artifact)
        artifact_gate_ok = bool(artifact_state.get("artifact_gate_ok"))
        if filled:
            filled_count += 1
            if artifact_gate_ok:
                filled_with_artifact_gate_ok += 1
            else:
                artifact_gate_fail_days.append(entry.day)
        if entry.rollback_triggered:
            rollback_hits += 1
        total_critical_incidents += max(0, entry.critical_incidents)
        items.append(
            {
                "day": entry.day,
                "date": entry.date,
                "artifact": entry.artifact,
                "critical_incidents": entry.critical_incidents,
                "rollback": entry.rollback,
                "notes": entry.notes,
                "filled": filled,
                "rollback_triggered": entry.rollback_triggered,
                "artifact_exists": bool(artifact_state.get("artifact_exists")),
                "artifact_gate_ok": artifact_gate_ok,
                "artifact_gate_summary": artifact_state.get("artifact_gate_summary"),
            }
        )

    all_filled = filled_count == 7
    no_rollback = rollback_hits == 0
    all_filled_artifacts_gate_ok = filled_count > 0 and filled_with_artifact_gate_ok == filled_count
    return {
        "items": items,
        "filled_days": filled_count,
        "all_filled": all_filled,
        "no_rollback": no_rollback,
        "total_critical_incidents": total_critical_incidents,
        "filled_days_artifact_gate_ok": filled_with_artifact_gate_ok,
        "all_filled_artifacts_gate_ok": all_filled_artifacts_gate_ok,
        "artifact_gate_fail_days": artifact_gate_fail_days,
        "complete_without_rollback": all_filled and no_rollback and all_filled_artifacts_gate_ok,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate sunset cutover readiness report.")
    parser.add_argument("--signoff-doc", default=str(DEFAULT_SIGNOFF_DOC), help="Path to UAT sign-off markdown.")
    parser.add_argument("--log-dir", default=str(DEFAULT_LOG_DIR), help="Directory containing stability gate artifacts.")
    parser.add_argument(
        "--require-matrix-runs",
        type=int,
        default=3,
        help="Minimum runs_requested for matrix consistency criterion.",
    )
    parser.add_argument("--output", default="", help="Optional output path for readiness JSON.")
    args = parser.parse_args()

    signoff_doc = Path(args.signoff_doc).resolve()
    log_dir = Path(args.log_dir).resolve()
    if not signoff_doc.exists():
        raise FileNotFoundError(f"Signoff doc not found: {signoff_doc}")
    if not log_dir.exists():
        raise FileNotFoundError(f"Log directory not found: {log_dir}")

    lines = _read_lines(signoff_doc)
    modules = _parse_signoff_modules(lines)
    incidents = _parse_incident_days(lines)

    artifacts = _list_gate_artifacts(log_dir)
    latest_gate = _find_latest_gate(artifacts)
    latest_matrix_gate = _find_latest_consistent_matrix_gate(
        artifacts, require_matrix_runs=max(1, args.require_matrix_runs)
    )

    module_state = _module_section(modules)
    incident_state = _incident_section(incidents)

    latest_gate_ok = bool((latest_gate or {}).get("ok"))
    matrix_consistency_ok = latest_matrix_gate is not None
    domain_signoff_ok = bool(module_state.get("all_approved"))
    incident_window_ok = bool(incident_state.get("complete_without_rollback"))

    pending_items: List[str] = []
    if not latest_gate_ok:
        pending_items.append("Latest stability gate belum lulus penuh.")
    if not matrix_consistency_ok:
        pending_items.append(
            f"Tiada artefak gate lulus dengan runs_requested >= {max(1, args.require_matrix_runs)}."
        )
    if not domain_signoff_ok:
        pending_items.append("Sign-off domain owner belum lengkap untuk semua modul berimpak tinggi.")
    if not incident_window_ok:
        pending_items.append("Incident window 7 hari tanpa rollback belum lengkap.")

    ready_for_sunset = latest_gate_ok and matrix_consistency_ok and domain_signoff_ok and incident_window_ok

    report: Dict[str, Any] = {
        "generated_at": _now_utc_iso(),
        "inputs": {
            "signoff_doc": _as_repo_relative(signoff_doc),
            "log_dir": _as_repo_relative(log_dir),
            "require_matrix_runs": max(1, args.require_matrix_runs),
        },
        "gate_latest": latest_gate,
        "gate_matrix_consistency": latest_matrix_gate,
        "domain_owner_signoff": module_state,
        "incident_window": incident_state,
        "criteria": {
            "latest_gate_ok": latest_gate_ok,
            "matrix_consistency_ok": matrix_consistency_ok,
            "domain_signoff_ok": domain_signoff_ok,
            "incident_window_ok": incident_window_ok,
        },
        "pending_items": pending_items,
        "ready_for_sunset": ready_for_sunset,
    }

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    output_path = Path(args.output).resolve() if args.output else (log_dir / f"cutover_readiness_{ts}.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=True, indent=2), encoding="utf-8")
    report["output_path"] = _as_repo_relative(output_path)

    print(json.dumps(report, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
