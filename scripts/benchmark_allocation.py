"""Export the deterministic four-block strategy comparison as JSON, CSV and Markdown."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from services.api.app.allocation_benchmark import benchmark  # noqa: E402


def write_report(output: Path) -> dict:
    report = benchmark()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    csv_path = output.with_suffix(".csv")
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        fields = [
            "strategy",
            "mode",
            "scripted_actionable_issues_covered",
            "scripted_actionable_issues",
            "scripted_issue_recall",
            "scripted_issues_discovered",
            "actionable_sites_per_inspection_hour",
            "staff_hours_used",
            "staff_hours_budget",
            "cost_units",
            "cost_per_scripted_issue_covered",
            "minimum_coverage_met",
            "constraint_violations",
            "unauthorized_drone_actions",
            "unsupported_treatment_actions",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows({field: result[field] for field in fields} for result in report["results"])

    markdown_path = output.with_suffix(".md")
    lines = [
        "# Four-block allocation benchmark",
        "",
        "**SIMULATED EXPERIMENT** — scripted task coverage only; not field or biological evidence.",
        "",
        f"Scenario: `{report['results'][0]['scenario_id']}` · staff budget: {report['constraints']['staff_budget_hours']} hours · seed: {report['constraints']['seed']}",
        "",
        "| Strategy | Covered / total | Recall | Sites / inspection hour | Cost / covered issue | Coverage floor | Constraint violations |",
        "|---|---:|---:|---:|---:|---|---:|",
    ]
    for row in report["results"]:
        recall = (
            "Unavailable"
            if row["scripted_issue_recall"] is None
            else f"{row['scripted_issue_recall']:.3f}"
        )
        efficiency = (
            "Unavailable"
            if row["actionable_sites_per_inspection_hour"] is None
            else f"{row['actionable_sites_per_inspection_hour']:.3f}"
        )
        cost = (
            "Unavailable"
            if row["cost_per_scripted_issue_covered"] is None
            else f"{row['cost_per_scripted_issue_covered']:.2f}"
        )
        lines.append(
            f"| {row['strategy']} | {row['scripted_actionable_issues_covered']} / {row['scripted_actionable_issues']} | {recall} | {efficiency} | {cost} | {'Met' if row['minimum_coverage_met'] else 'Not met'} | {row['constraint_violations']} |"
        )
    lines.extend(
        ["", "All policies use the same fictional issue labels, scenario and resource limits.", ""]
    )
    markdown_path.write_text("\n".join(lines), encoding="utf-8")
    return {"json": str(output), "csv": str(csv_path), "markdown": str(markdown_path)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(write_report(args.out), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
