"""Persist a completed, locally generated held-out evaluation report in the demo DB.

This command registers evidence; it does not validate the scientific quality of
the dataset, labels, split independence, or prediction process.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/api"))

from app.db import SessionLocal  # noqa: E402
from app.models import AnalyticsRun, Audit, Tenant, User  # noqa: E402


def register(summary_path: Path, tenant_id: str) -> str:
    report = json.loads(summary_path.read_text(encoding="utf-8"))
    run_type = report.get("run_type")
    if run_type not in {"drone_detection_evaluation", "ovitrap_count_evaluation"}:
        raise ValueError("Only drone and ovitrap evaluation reports can be registered")
    if report.get("status") != "COMPLETED" or not isinstance(report.get("metrics"), dict):
        raise ValueError("Only COMPLETED reports with actual metric values can be registered")
    metadata = report.get("metadata") or {}
    if metadata.get("split") != "test":
        raise ValueError("Only a held-out test split can be registered")
    if not metadata.get("dataset_sha256") or not metadata.get("checkpoint_sha256"):
        raise ValueError("Report must include dataset and checkpoint SHA-256 provenance")
    test_count = metadata.get("test_count")
    if not isinstance(test_count, int) or test_count <= 0:
        raise ValueError("Report must include a positive test_count")
    source_mode = report.get("source_mode")
    if source_mode != "EXTERNALLY_LABELLED_HELD_OUT":
        raise ValueError("Only externally labelled held-out runs can be registered")

    with SessionLocal.begin() as db:
        tenant = db.get(Tenant, tenant_id)
        if not tenant:
            raise ValueError(f"Tenant not found: {tenant_id}")
        coordinator = db.scalar(
            select(User).where(User.tenant_id == tenant_id, User.role == "coordinator")
        )
        run = AnalyticsRun(
            tenant_id=tenant_id,
            mode="IMPORTED",
            run_id=report["run_id"],
            run_type=run_type,
            status="COMPLETED",
            source_mode=source_mode,
            run_metadata={**metadata, "test_count": test_count},
            metrics=report["metrics"],
            artifacts=[
                {
                    "kind": "summary",
                    "sha256": hashlib.sha256(summary_path.read_bytes()).hexdigest(),
                }
            ],
            limitations=report.get("limitations", []),
            initiated_by=coordinator.id if coordinator else None,
        )
        db.add(run)
        db.flush()
        if coordinator:
            db.add(
                Audit(
                    tenant_id=tenant_id,
                    actor_id=coordinator.id,
                    entity_id=run.id,
                    action="HELD_OUT_EVALUATION_IMPORTED",
                    details={
                        "run_id": run.run_id,
                        "run_type": run.run_type,
                        "source_mode": run.source_mode,
                        "test_count": test_count,
                    },
                )
            )
        return run.id


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--summary", required=True, type=Path)
    parser.add_argument("--tenant", default="tenant-demo")
    args = parser.parse_args()
    try:
        print(register(args.summary, args.tenant))
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"evaluation registration error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
