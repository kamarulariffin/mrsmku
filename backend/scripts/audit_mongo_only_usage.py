#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

DEFAULT_ROUTES_DIR = PROJECT_ROOT / "routes"

OPERATOR_PATTERNS: Dict[str, str] = {
    "object_id_constructor": r"\bObjectId\s*\(",
    "aggregate_call": r"\.aggregate\s*\(",
    "pipeline_lookup": r"['\"]\\$lookup['\"]",
    "pipeline_unwind": r"['\"]\\$unwind['\"]",
    "pipeline_group": r"['\"]\\$group['\"]",
    "pipeline_project": r"['\"]\\$project['\"]",
    "pipeline_add_fields": r"['\"]\\$addFields['\"]",
    "pipeline_set": r"['\"]\\$set['\"]",
    "pipeline_match": r"['\"]\\$match['\"]",
    "pipeline_sort": r"['\"]\\$sort['\"]",
    "pipeline_limit": r"['\"]\\$limit['\"]",
    "pipeline_count": r"['\"]\\$count['\"]",
    "expr_operator": r"['\"]\\$expr['\"]",
    "set_on_insert": r"['\"]\\$setOnInsert['\"]",
    "date_from_string": r"['\"]\\$dateFromString['\"]",
}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit Mongo-only operator usage in route files and emit JSON report."
    )
    parser.add_argument(
        "--path",
        type=str,
        default=str(DEFAULT_ROUTES_DIR),
        help=f"Directory to scan recursively (default: {DEFAULT_ROUTES_DIR})",
    )
    parser.add_argument(
        "--glob",
        type=str,
        default="*.py",
        help="File glob pattern under --path (default: *.py).",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default="",
        help="Optional output path. Defaults to logs/mongo_only_operator_audit_YYYYMMDD.json.",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=10,
        help="Number of top files/modules to print in stdout summary.",
    )
    return parser.parse_args()


def _count_matches(text: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for name, pattern in OPERATOR_PATTERNS.items():
        found = re.findall(pattern, text)
        if found:
            counts[name] = len(found)
    return counts


def _module_name(path: Path, base: Path) -> str:
    rel = path.relative_to(base)
    parts = list(rel.parts)
    if not parts:
        return path.stem
    if len(parts) == 1:
        return path.stem
    return parts[0]


def _scan_files(scan_dir: Path, glob_pattern: str) -> Tuple[Dict[str, Dict[str, int]], Dict[str, Dict[str, int]]]:
    file_hits: Dict[str, Dict[str, int]] = {}
    module_hits: Dict[str, Dict[str, int]] = {}

    for path in sorted(scan_dir.rglob(glob_pattern)):
        if not path.is_file():
            continue
        if path.name.startswith("."):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        counts = _count_matches(text)
        if not counts:
            continue

        rel = str(path.relative_to(PROJECT_ROOT))
        file_hits[rel] = counts

        mod = _module_name(path, scan_dir)
        mod_map = module_hits.setdefault(mod, {})
        for op, n in counts.items():
            mod_map[op] = mod_map.get(op, 0) + n

    return file_hits, module_hits


def _sum_map(values: Dict[str, Dict[str, int]]) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for item in values.values():
        for op, n in item.items():
            out[op] = out.get(op, 0) + n
    return out


def _top_entities(values: Dict[str, Dict[str, int]], top_n: int) -> List[Dict[str, object]]:
    ranking: List[Tuple[str, int]] = []
    for name, counts in values.items():
        ranking.append((name, sum(counts.values())))
    ranking.sort(key=lambda x: x[1], reverse=True)

    out: List[Dict[str, object]] = []
    for name, total in ranking[: max(top_n, 0)]:
        out.append(
            {
                "name": name,
                "total_hits": total,
                "operators": values[name],
            }
        )
    return out


def main() -> None:
    args = _parse_args()
    scan_dir = Path(args.path).resolve()
    if not scan_dir.exists() or not scan_dir.is_dir():
        raise SystemExit(f"Invalid scan directory: {scan_dir}")

    file_hits, module_hits = _scan_files(scan_dir, args.glob)
    by_operator = _sum_map(file_hits)

    now = datetime.now(timezone.utc)
    default_output = PROJECT_ROOT / "logs" / f"mongo_only_operator_audit_{now:%Y%m%d}.json"
    output_path = Path(args.output_json).resolve() if args.output_json else default_output
    output_path.parent.mkdir(parents=True, exist_ok=True)

    report = {
        "generated_at": now.isoformat(),
        "scan_path": str(scan_dir),
        "glob": args.glob,
        "summary": {
            "files_with_hits": len(file_hits),
            "modules_with_hits": len(module_hits),
            "total_hits": int(sum(by_operator.values())),
            "by_operator": by_operator,
        },
        "top_files": _top_entities(file_hits, args.top),
        "top_modules": _top_entities(module_hits, args.top),
        "files": file_hits,
        "modules": module_hits,
    }

    output_path.write_text(json.dumps(report, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "output_json": str(output_path),
                "files_with_hits": len(file_hits),
                "modules_with_hits": len(module_hits),
                "total_hits": int(sum(by_operator.values())),
                "top_modules": report["top_modules"][:3],
            },
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    main()
