from datetime import timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import now
from .models import Asset, Block, Media, Observation, Sample, Trap, User, WorkOrder
from .repository import audit, digest, get, receipt, replay, rows
from .schemas import SampleInput


def effective_status(trap: Trap) -> str:
    if not trap.safe_design_verified:
        return "UNSAFE"
    if trap.status != "ACTIVE":
        return trap.status
    if trap.serviced_at.replace(tzinfo=timezone.utc) < now() - timedelta(days=14):
        return "SERVICING_DUE"
    if trap.heartbeat_at.replace(tzinfo=timezone.utc) < now() - timedelta(days=2):
        return "STALE"
    return "ACTIVE"


def ingest(
    db: Session, user: User, trap_id: str, body: SampleInput, key: str, *, reviewed: bool = False
) -> Sample:
    if body.source == "MODEL_ASSISTED_REVIEWED" and not reviewed:
        raise HTTPException(422, "Model-assisted evidence requires the analysis confirmation endpoint")
    trap = get(db, Trap, trap_id, user)
    db.scalar(select(Trap).where(Trap.id == trap.id).with_for_update())
    payload = body.model_dump(mode="json")
    cached = replay(db, user, f"sample:{trap_id}", key, payload)
    if cached:
        return get(db, Sample, cached, user)
    media = get(db, Media, body.media_id, user)
    if media.mode != body.mode:
        raise HTTPException(422, "Sample and media modes must match")
    if body.interval_end > now() or body.collected_at > now():
        raise HTTPException(422, "Future collections are not accepted")
    existing = list(db.scalars(select(Sample).where(Sample.trap_id == trap_id)))
    for sample in existing:
        if sample.source_sample_id == body.source_sample_id and sample.digest == digest(payload):
            receipt(db, user, f"sample:{trap_id}", key, payload, sample.id)
            return sample
        previous_media = db.get(Media, sample.media_id)
        overlap = (
            sample.interval_start.replace(tzinfo=timezone.utc) < body.interval_end
            and sample.interval_end.replace(tzinfo=timezone.utc) > body.interval_start
        )
        if (
            overlap
            or sample.substrate_id == body.substrate_id
            or previous_media.sha256 == media.sha256
            or sample.source_sample_id == body.source_sample_id
        ):
            raise HTTPException(
                409,
                "Existing interval, substrate or identical image; new eggs cannot be counted again",
            )
    valid = effective_status(trap) == "ACTIVE" and body.quality == "GOOD"
    sample = Sample(
        trap_id=trap_id,
        tenant_id=user.tenant_id,
        **body.model_dump(),
        review_status="CONFIRMED_HUMAN" if reviewed else "CONFIRMED_FIXTURE",
        validity="VALID" if valid else "INVALID",
        digest=digest(payload),
    )
    db.add(sample)
    db.flush()
    receipt(db, user, f"sample:{trap_id}", key, payload, sample.id)
    audit(
        db,
        user,
        sample.id,
        "SAMPLE_IMPORTED",
        {"validity": sample.validity, "source": sample.source},
    )
    return sample


def summaries(db: Session, user: User, start, end) -> list[dict]:
    all_samples = rows(db, Sample, user)
    all_traps = rows(db, Trap, user)
    all_observations = rows(db, Observation, user)
    all_assets = rows(db, Asset, user)
    window_days = (end - start).total_seconds() / 86400
    result = []
    for block in rows(db, Block, user):
        traps = [t for t in all_traps if t.block_id == block.id]
        trap_ids = {t.id for t in traps}
        in_window = [
            s
            for s in all_samples
            if s.trap_id in trap_ids
            and s.interval_start.replace(tzinfo=timezone.utc) >= start
            and s.interval_end.replace(tzinfo=timezone.utc) <= end
        ]
        valid = [
            s
            for s in in_window
            if s.validity == "VALID" and abs(s.sampling_effort_days - window_days) < 0.01
        ]
        mismatched_effort = [
            s
            for s in in_window
            if s.validity == "VALID" and abs(s.sampling_effort_days - window_days) >= 0.01
        ]
        available = bool(valid) and any(effective_status(t) == "ACTIVE" for t in traps)
        assets = {a.id for a in all_assets if a.block_id == block.id}
        observations = [
            o
            for o in all_observations
            if o.asset_id in assets
            and o.review_status == "CONFIRMED"
            and not o.resolved
            and o.water_state == "VISIBLE_WATER"
        ]
        result.append(
            {
                "id": block.id,
                "name": block.name,
                "x": block.x,
                "y": block.y,
                "mode": block.mode,
                "status": "MONITORING" if available else "DATA_UNAVAILABLE",
                "valid_intervals": len(valid),
                "expected_intervals": len(traps),
                "eggs_per_interval": sum(s.egg_count for s in valid) / len(valid)
                if available
                else None,
                "positivity": sum(s.egg_count > 0 for s in valid) / len(valid)
                if available
                else None,
                "sample_ids": [s.id for s in valid],
                "observation_ids": [o.id for o in observations],
                "unresolved_sources": len({o.asset_id for o in observations}),
                "unavailable_traps": [t.id for t in traps if effective_status(t) != "ACTIVE"],
                "excluded_samples": [s.id for s in in_window if s not in valid],
                "interval_days": window_days,
                "uncertainty": "Egg activity is not adult abundance, Aedes confirmation or dengue risk.",
                "comparability_warning": (
                    f"{len(mismatched_effort)} interval(s) excluded: sampling effort does not match the selected {window_days:g}-day window"
                    if mismatched_effort
                    else None
                ),
            }
        )
    return result


def engineering_referral(db: Session, user: User, asset_id: str):
    asset = get(db, Asset, asset_id, user)
    observations = list(
        db.scalars(
            select(Observation).where(
                Observation.asset_id == asset_id,
                Observation.review_status == "CONFIRMED",
                Observation.water_state == "VISIBLE_WATER",
                Observation.observed_at >= now() - timedelta(days=90),
            )
        )
    )
    if len(observations) < 2:
        return None
    key = f"engineering:{asset_id}"
    existing = db.scalar(select(WorkOrder).where(WorkOrder.dedupe_key == key))
    if existing:
        return existing
    work = WorkOrder(
        tenant_id=user.tenant_id,
        dedupe_key=key,
        asset_id=asset_id,
        block_id=asset.block_id,
        kind="ENGINEERING_REVIEW",
        reason="Demo policy: two separately verified water observations within 90 days. Review recurrence and durable correction; not a biological threshold. Evidence: "
        + ", ".join(o.id for o in observations),
    )
    db.add(work)
    db.flush()
    audit(
        db,
        user,
        work.id,
        "RECURRENCE_REFERRED",
        {"observations": [o.id for o in observations]},
    )
    return work
