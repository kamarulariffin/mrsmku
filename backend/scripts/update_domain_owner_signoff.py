#!/usr/bin/env python3
"""
Update domain owner sign-off tracker rows in:
docs/POSTGRES_DOMAIN_OWNER_UAT_SIGNOFF.md
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DOC = REPO_ROOT / "docs" / "POSTGRES_DOMAIN_OWNER_UAT_SIGNOFF.md"

MODULE_ROW_MAP: Dict[str, str] = {
    "accounting": "accounting/accounting_full",
    "yuran": "yuran",
    "marketplace": "marketplace/koperasi/student_import",
    "hostel": "hostel/sickbay/warden/discipline/risk",
}


def _today_utc_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _clean_cell(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    return value.replace("|", "/")


def _resolve_module_key(module_input: str) -> str:
    key = (module_input or "").strip()
    if key in MODULE_ROW_MAP:
        return MODULE_ROW_MAP[key]
    return key


def _update_signoff_row(
    lines: List[str],
    *,
    module_key: str,
    owner: str,
    environment: str,
    evidence: str,
    status: str,
    signoff_date: str,
    residual_risk: str,
) -> bool:
    marker = f"| {module_key} |"
    new_row = (
        f"| {module_key} | {_clean_cell(owner)} | {_clean_cell(environment)} | "
        f"{_clean_cell(evidence)} | {status} | {_clean_cell(signoff_date)} | {_clean_cell(residual_risk)} |"
    )
    for idx, line in enumerate(lines):
        if line.strip().startswith(marker):
            lines[idx] = new_row
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Update domain owner sign-off table row.")
    parser.add_argument("--doc", default=str(DEFAULT_DOC), help="Path to UAT sign-off markdown.")
    parser.add_argument(
        "--module",
        required=True,
        help=(
            "Module key: accounting|yuran|marketplace|hostel "
            "or exact row label in the table."
        ),
    )
    parser.add_argument("--owner", default="", help="Domain owner name.")
    parser.add_argument("--environment", default="", help="Environment used for UAT.")
    parser.add_argument("--evidence", default="", help="Ticket/video/log reference.")
    parser.add_argument(
        "--status",
        choices=["Pending", "In Progress", "Approved", "Rejected"],
        default="Pending",
        help="Sign-off status.",
    )
    parser.add_argument(
        "--date-signoff",
        default="",
        help="Date of sign-off (YYYY-MM-DD). Auto-filled when status=Approved and empty.",
    )
    parser.add_argument("--residual-risk", default="", help="Residual risk notes.")
    args = parser.parse_args()

    doc_path = Path(args.doc).resolve()
    if not doc_path.exists():
        raise FileNotFoundError(f"UAT sign-off doc not found: {doc_path}")

    module_key = _resolve_module_key(args.module)
    signoff_date = args.date_signoff.strip()
    if args.status == "Approved" and not signoff_date:
        signoff_date = _today_utc_date()

    lines = doc_path.read_text(encoding="utf-8").splitlines()
    ok = _update_signoff_row(
        lines,
        module_key=module_key,
        owner=args.owner,
        environment=args.environment,
        evidence=args.evidence,
        status=args.status,
        signoff_date=signoff_date,
        residual_risk=args.residual_risk,
    )
    if not ok:
        raise ValueError(f"Module row not found for key '{module_key}' in {doc_path}")

    doc_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"UPDATED {doc_path}")
    print(f"- module: {module_key}")
    print(f"- owner: {args.owner}")
    print(f"- environment: {args.environment}")
    print(f"- evidence: {args.evidence}")
    print(f"- status: {args.status}")
    print(f"- date_signoff: {signoff_date}")
    print(f"- residual_risk: {args.residual_risk}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
