#!/usr/bin/env python3
"""
Update incident window tracker in docs/POSTGRES_DOMAIN_OWNER_UAT_SIGNOFF.md.

Example:
  ./backend/venv/bin/python backend/scripts/update_incident_window.py \
    --day D1 \
    --artifact backend/logs/stability_gate_20260312_030536.json \
    --date 2026-03-12 \
    --critical-incidents 0 \
    --rollback Tidak \
    --notes "Kickoff incident window"
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DOC = REPO_ROOT / "docs" / "POSTGRES_DOMAIN_OWNER_UAT_SIGNOFF.md"


def _today_utc_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _as_repo_relative(path_value: str) -> str:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        try:
            return str(path.resolve().relative_to(REPO_ROOT))
        except ValueError:
            return str(path.resolve())
    return str(path)


def _parse_markdown_row(line: str) -> List[str]:
    txt = line.strip()
    if not txt.startswith("|"):
        return []
    return [part.strip() for part in txt.split("|")[1:-1]]


def _resolve_abs_path(path_value: str) -> Path:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        return path.resolve()
    return (REPO_ROOT / path).resolve()


def _load_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if isinstance(parsed, dict):
        return parsed
    return None


def _extract_incident_rows(lines: List[str]) -> Dict[str, Dict[str, str]]:
    header = "| Hari | Tarikh | Baseline Gate Artifact | Insiden Kritikal | Rollback ke Hybrid/Mongo | Catatan |"
    divider = "| --- | --- | --- | --- | --- | --- |"
    start_idx: Optional[int] = None
    for idx, line in enumerate(lines):
        if line.strip() == header:
            start_idx = idx
            break
    if start_idx is None or start_idx + 1 >= len(lines) or lines[start_idx + 1].strip() != divider:
        return {}

    out: Dict[str, Dict[str, str]] = {}
    idx = start_idx + 2
    while idx < len(lines) and lines[idx].lstrip().startswith("|"):
        row = _parse_markdown_row(lines[idx])
        idx += 1
        if len(row) != 6:
            continue
        day = row[0]
        if not day:
            continue
        out[day] = {
            "date": row[1],
            "artifact": row[2].strip().strip("`"),
        }
    return out


def _validate_incident_sequence(lines: List[str], *, target_day: str, target_date: str) -> None:
    rows = _extract_incident_rows(lines)
    order = [f"D{i}" for i in range(1, 8)]
    if target_day not in order:
        raise ValueError(f"Unknown day marker '{target_day}'")

    target_idx = order.index(target_day)
    for prev in order[:target_idx]:
        prev_row = rows.get(prev, {})
        if not (prev_row.get("date", "").strip() and prev_row.get("artifact", "").strip()):
            raise ValueError(f"Cannot fill {target_day} before {prev} is complete.")

    prev_dates: List[str] = []
    for prev in order[:target_idx]:
        prev_date = (rows.get(prev, {}).get("date") or "").strip()
        if prev_date:
            prev_dates.append(prev_date)
    if prev_dates and target_date <= max(prev_dates):
        raise ValueError(
            f"Date {target_date} must be later than previous incident day date {max(prev_dates)}."
        )

    next_dates: List[str] = []
    for nxt in order[target_idx + 1 :]:
        next_date = (rows.get(nxt, {}).get("date") or "").strip()
        if next_date:
            next_dates.append(next_date)
    if next_dates and target_date >= min(next_dates):
        raise ValueError(
            f"Date {target_date} must be earlier than next filled incident day date {min(next_dates)}."
        )


def _validate_gate_artifact(artifact_rel: str) -> None:
    artifact_path = _resolve_abs_path(artifact_rel)
    if not artifact_path.exists():
        raise FileNotFoundError(f"Gate artifact not found: {artifact_path}")
    payload = _load_json(artifact_path)
    if not isinstance(payload, dict):
        raise ValueError(f"Gate artifact is not valid JSON object: {artifact_path}")
    gate = payload.get("gate") or {}
    if not bool(gate.get("ok")):
        raise ValueError(
            f"Gate artifact gate.ok is not true: {artifact_path}"
        )


def _replace_incident_row(
    lines: List[str],
    *,
    day: str,
    date_value: str,
    artifact: str,
    critical_incidents: int,
    rollback: str,
    notes: str,
) -> bool:
    marker = f"| {day} |"
    note_value = notes.strip() or "-"
    new_row = (
        f"| {day} | {date_value} | `{artifact}` | "
        f"{critical_incidents} | {rollback} | {note_value} |"
    )
    for idx, line in enumerate(lines):
        if line.strip().startswith(marker):
            lines[idx] = new_row
            return True
    return False


def _sync_baseline_table(
    lines: List[str],
    *,
    date_value: str,
    artifact: str,
    note: str,
) -> None:
    header = "| Tarikh (UTC) | Artifact JSON | Smoke Logs Folder | Gate OK | Catatan |"
    divider = "| --- | --- | --- | --- | --- |"

    start_idx: Optional[int] = None
    for i, line in enumerate(lines):
        if line.strip() == header:
            start_idx = i
            break
    if start_idx is None:
        return
    if start_idx + 1 >= len(lines) or lines[start_idx + 1].strip() != divider:
        return

    end_idx = start_idx + 2
    while end_idx < len(lines) and lines[end_idx].lstrip().startswith("|"):
        end_idx += 1

    table_rows = lines[start_idx + 2 : end_idx]

    placeholder_idx: Optional[int] = None
    for offset, row in enumerate(table_rows):
        if row.strip() == "|  |  |  |  |  |":
            placeholder_idx = start_idx + 2 + offset
            break

    artifact_path = Path(artifact)
    if artifact_path.stem.startswith("stability_gate_"):
        smoke_logs = str(artifact_path.parent / artifact_path.stem / "smoke_matrix")
    else:
        smoke_logs = str(artifact_path.parent / "smoke_matrix")
    new_row = f"| {date_value} | `{artifact}` | `{smoke_logs}` | `true` | {note} |"

    for offset, row in enumerate(table_rows):
        if f"`{artifact}`" in row:
            lines[start_idx + 2 + offset] = new_row
            return

    if placeholder_idx is not None:
        lines.insert(placeholder_idx, new_row)
    else:
        lines.insert(end_idx, new_row)


def main() -> int:
    parser = argparse.ArgumentParser(description="Update incident window tracker row.")
    parser.add_argument("--doc", default=str(DEFAULT_DOC), help="Path to UAT sign-off markdown.")
    parser.add_argument("--day", required=True, choices=[f"D{i}" for i in range(1, 8)], help="Day marker.")
    parser.add_argument("--date", default=_today_utc_date(), help="Date in YYYY-MM-DD.")
    parser.add_argument("--artifact", required=True, help="Path to stability gate JSON artifact.")
    parser.add_argument("--critical-incidents", type=int, default=0, help="Number of critical incidents.")
    parser.add_argument("--rollback", choices=["Tidak", "Ya"], default="Tidak", help="Rollback status.")
    parser.add_argument("--notes", default="", help="Free-form notes for incident window row.")
    parser.add_argument(
        "--enforce-sequence",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Require previous day rows to be complete before filling target day.",
    )
    parser.add_argument(
        "--validate-artifact-gate",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Require artifact JSON to exist and have gate.ok=true before update.",
    )
    parser.add_argument(
        "--sync-baseline",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Also insert artifact row into baseline table if missing.",
    )
    parser.add_argument(
        "--dry-run",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Validate and preview update without writing to markdown.",
    )
    args = parser.parse_args()

    doc_path = Path(args.doc).resolve()
    if not doc_path.exists():
        raise FileNotFoundError(f"UAT sign-off doc not found: {doc_path}")

    artifact_rel = _as_repo_relative(args.artifact)
    note_value = args.notes.strip() or f"Sync dari {args.day}"

    lines = doc_path.read_text(encoding="utf-8").splitlines()
    if args.enforce_sequence:
        _validate_incident_sequence(lines, target_day=args.day, target_date=args.date)
    if args.validate_artifact_gate:
        _validate_gate_artifact(artifact_rel)

    working_lines = list(lines)

    replaced = _replace_incident_row(
        working_lines,
        day=args.day,
        date_value=args.date,
        artifact=artifact_rel,
        critical_incidents=args.critical_incidents,
        rollback=args.rollback,
        notes=note_value,
    )
    if not replaced:
        raise ValueError(f"Row for day marker '{args.day}' not found in {doc_path}")

    if args.sync_baseline:
        _sync_baseline_table(
            working_lines,
            date_value=args.date,
            artifact=artifact_rel,
            note=f"Auto-sync dari tracker incident window ({args.day})",
        )

    if args.dry_run:
        print(f"DRY-RUN {doc_path}")
    else:
        doc_path.write_text("\n".join(working_lines) + "\n", encoding="utf-8")
        print(f"UPDATED {doc_path}")

    print(f"- day: {args.day}")
    print(f"- date: {args.date}")
    print(f"- artifact: {artifact_rel}")
    print(f"- critical_incidents: {args.critical_incidents}")
    print(f"- rollback: {args.rollback}")
    print(f"- notes: {note_value}")
    print(f"- enforce_sequence: {args.enforce_sequence}")
    print(f"- validate_artifact_gate: {args.validate_artifact_gate}")
    print(f"- sync_baseline: {args.sync_baseline}")
    print(f"- dry_run: {args.dry_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
