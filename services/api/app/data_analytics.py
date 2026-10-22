"""Tenant-scoped descriptive analytics; these summaries do not estimate disease risk."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AnalyticsRun, Block, Sample, Trap, User
from .repository import rows
from .surveillance import effective_status

GENUINE_SOURCE_MODES = {
    "REAL_MEASURED",
    "EXTERNALLY_LABELLED",
    "EXTERNALLY_LABELLED_HELD_OUT",
    "MANUALLY_VERIFIED",
}
MODEL_TYPES = {
    "drone_detection_evaluation": "No completed evaluation with held-out labels and a recorded model checkpoint.",
    "ovitrap_count_evaluation": "No completed evaluation with held-out technician counts and a recorded model checkpoint.",
}


def utc(value: datetime) -> datetime:
    return (
        value.replace(tzinfo=timezone.utc)
        if value.tzinfo is None
        else value.astimezone(timezone.utc)
    )


def evaluation_cards(db: Session, user: User) -> dict:
    runs = rows(db, AnalyticsRun, user)
    result = {}
    for run_type, default_reason in MODEL_TYPES.items():
        candidates = [
            run
            for run in runs
            if run.run_type == run_type
            and run.status == "COMPLETED"
            and run.source_mode in GENUINE_SOURCE_MODES
            and run.metrics is not None
            and run.run_metadata.get("split") == "test"
            and int(
                run.run_metadata.get(
                    "test_count",
                    run.run_metadata.get("image_count", run.run_metadata.get("sample_count", 0)),
                )
                or 0
            )
            > 0
            and run.run_metadata.get("dataset_sha256", run.run_metadata.get("labels_sha256"))
            and run.run_metadata.get("model_sha256", run.run_metadata.get("checkpoint_sha256"))
        ]
        latest = max(candidates, key=lambda row: (utc(row.created_at), row.run_id), default=None)
        result["drone_detection" if run_type.startswith("drone") else "ovitrap_count"] = {
            "run_type": run_type,
            "status": "COMPLETED" if latest else "NOT_EVALUATED",
            "reason": None if latest else default_reason,
            "latest_completed_run": latest,
        }
    return result


def surveillance_analytics(db: Session, user: User, start: datetime, end: datetime) -> list[dict]:
    """Aggregate valid trap intervals while retaining duration and provenance."""
    start, end = utc(start), utc(end)
    if end <= start:
        raise ValueError("Analytics window must be positive")
    window_days = (end - start).total_seconds() / 86400
    blocks = rows(db, Block, user)
    traps = rows(db, Trap, user)
    samples = rows(db, Sample, user)
    trap_by_id = {trap.id: trap for trap in traps}
    traps_by_block: dict[str, list[Trap]] = defaultdict(list)
    for trap in traps:
        traps_by_block[trap.block_id].append(trap)

    matching = [
        sample
        for sample in samples
        if start <= utc(sample.interval_start)
        and utc(sample.interval_end) <= end
        and sample.trap_id in trap_by_id
    ]
    grouped: dict[tuple, list[Sample]] = defaultdict(list)
    for sample in matching:
        interval_start, interval_end = utc(sample.interval_start), utc(sample.interval_end)
        block_id = trap_by_id[sample.trap_id].block_id
        # Different durations remain separate points; they are never normalized silently.
        grouped[
            (block_id, interval_start, interval_end, round(sample.sampling_effort_days, 4))
        ].append(sample)

    points_by_block: dict[str, list[dict]] = defaultdict(list)
    for (
        block_id,
        interval_start,
        interval_end,
        interval_days,
    ), samples_in_interval in grouped.items():
        matching_traps = [
            trap
            for trap in traps_by_block[block_id]
            if abs(trap.sampling_cadence_days - interval_days) <= 0.01
        ]
        expected = len(matching_traps)
        valid = [
            sample
            for sample in samples_in_interval
            if sample.validity == "VALID"
            and sample.quality == "GOOD"
            and abs(trap_by_id[sample.trap_id].sampling_cadence_days - interval_days) <= 0.01
        ]
        positive = sum(sample.egg_count > 0 for sample in valid)
        points_by_block[block_id].append(
            {
                "interval_start": interval_start,
                "interval_end": interval_end,
                "interval_days": interval_days,
                "egg_sum": sum(sample.egg_count for sample in valid) if valid else None,
                "eggs_per_valid_trap_interval": (
                    sum(sample.egg_count for sample in valid) / len(valid) if valid else None
                ),
                "positive_intervals": positive if valid else None,
                "valid_trap_intervals": len(valid),
                "expected_trap_intervals": expected,
                "invalid_intervals": len(samples_in_interval) - len(valid),
                "completeness": min(1.0, len(valid) / expected) if expected else None,
                "status": "MONITORING" if valid else "DATA_UNAVAILABLE",
                "sample_ids": [sample.id for sample in valid],
                "sources": sorted({sample.source for sample in samples_in_interval}),
                "source_modes": sorted({sample.mode for sample in samples_in_interval}),
                "quality_states": sorted({sample.quality for sample in samples_in_interval}),
                "latest_collected_at": max(
                    utc(sample.collected_at) for sample in samples_in_interval
                ),
                "latest_uploaded_at": max(utc(sample.created_at) for sample in samples_in_interval),
            }
        )

    result = []
    for block in blocks:
        block_traps = traps_by_block[block.id]
        points = sorted(points_by_block[block.id], key=lambda point: point["interval_start"])
        valid_count = sum(point["valid_trap_intervals"] for point in points)
        invalid_count = sum(point["invalid_intervals"] for point in points)
        expected_count = sum(
            int(window_days // max(trap.sampling_cadence_days, 1))
            for trap in block_traps
            if start < end
        )
        eggs = [point["egg_sum"] for point in points if point["egg_sum"] is not None]
        positives = sum(point["positive_intervals"] or 0 for point in points)
        durations = sorted({point["interval_days"] for point in points})
        result.append(
            {
                "block_id": block.id,
                "block_name": block.name,
                "status": "MONITORING" if valid_count else "DATA_UNAVAILABLE",
                "valid_trap_intervals": valid_count,
                "expected_trap_intervals": expected_count,
                "invalid_intervals": invalid_count,
                "completeness": min(1.0, valid_count / expected_count) if expected_count else None,
                "egg_sum": sum(eggs) if eggs else None,
                "eggs_per_valid_trap_interval": sum(eggs) / valid_count if valid_count else None,
                "positivity": positives / valid_count if valid_count else None,
                "unavailable_traps": [
                    trap.id for trap in block_traps if effective_status(trap) != "ACTIVE"
                ],
                "sources": sorted({source for point in points for source in point["sources"]}),
                "source_modes": sorted(
                    {mode for point in points for mode in point["source_modes"]}
                ),
                "interval_days_included": durations,
                "comparability_warning": (
                    "Collection intervals have different durations and are shown separately; no cross-duration comparison is calculated."
                    if len(durations) > 1
                    else None
                ),
                "series": points,
            }
        )
    return result


def latest_benchmark(db: Session, user: User) -> AnalyticsRun | None:
    return db.scalar(
        select(AnalyticsRun)
        .where(
            AnalyticsRun.tenant_id == user.tenant_id,
            AnalyticsRun.run_type == "ALLOCATION_BENCHMARK",
            AnalyticsRun.status == "COMPLETED",
            AnalyticsRun.source_mode == "SIMULATED",
        )
        .order_by(AnalyticsRun.created_at.desc(), AnalyticsRun.run_id.desc())
    )
