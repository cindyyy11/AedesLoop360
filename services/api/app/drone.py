from datetime import timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import drone_inference
from .db import now
from .models import Asset, Finding, Job, Media, Mission, MissionEvent, User, WorkOrder
from .repository import audit, get, receipt, replay
from .schemas import Decision, MissionInput

CHECKS = {"SIMULATED_MODE", "AUTHORIZED_TEST_ZONE", "NO_CHEMICAL_PAYLOAD"}


def eligibility(finding: Finding, asset: Asset) -> str:
    if finding.review_status == "REJECTED" or finding.water_state == "DRY":
        return "SKIP"
    if (
        not asset.permission
        or finding.water_state != "VISIBLE_WATER"
        or finding.mode != "SIMULATED"
        or finding.model_version != "DEMO_PREANNOTATED_V1"
    ):
        return "GROUND_REVIEW"
    return "MOCK_ACTION_ELIGIBLE"


def create(db: Session, user: User, body: MissionInput) -> Mission:
    if len(set(body.target_ids)) != len(body.target_ids):
        raise HTTPException(422, "Targets must be unique")
    for target in body.target_ids:
        finding = get(db, Finding, target, user)
        asset = get(db, Asset, finding.asset_id, user)
        if asset.block_id != body.block_id:
            raise HTTPException(422, "Target outside mission block")
    mission = Mission(tenant_id=user.tenant_id, **body.model_dump())
    db.add(mission)
    db.flush()
    audit(db, user, mission.id, "MISSION_DRAFTED")
    return mission


def decide(db: Session, user: User, mission: Mission, body: Decision):
    if mission.status != "READY_FOR_REVIEW":
        raise HTTPException(409, "Mission must be ready for review")
    if body.decision == "APPROVE" and not CHECKS.issubset(body.checked_items):
        raise HTTPException(422, "Complete all simulation safety checks")
    mission.status = "APPROVED" if body.decision == "APPROVE" else "REJECTED"
    mission.approved_by = user.id if body.decision == "APPROVE" else None
    mission.approved_at = now() if body.decision == "APPROVE" else None
    mission.approval_expires_at = (
        now() + timedelta(minutes=30) if body.decision == "APPROVE" else None
    )
    audit(db, user, mission.id, mission.status, body.model_dump())


def simulate(db: Session, user: User, mission: Mission, key: str):
    cached = replay(db, user, "simulate", key, {"mission_id": mission.id})
    if cached:
        return
    approval_expires_at = mission.approval_expires_at
    if approval_expires_at and approval_expires_at.tzinfo is None:
        approval_expires_at = approval_expires_at.replace(tzinfo=timezone.utc)
    if (
        mission.status != "APPROVED"
        or not mission.approved_by
        or not approval_expires_at
        or approval_expires_at <= now()
        or mission.mode != "SIMULATED"
        or mission.policy_version != "demo-policy-v1"
    ):
        raise HTTPException(409, "Current policy and human-approved simulated mission required")
    for target in mission.target_ids:
        finding = get(db, Finding, target, user)
        asset = get(db, Asset, finding.asset_id, user)
        if asset.block_id != mission.block_id:
            raise HTTPException(409, "Target scope changed; create a new mission")
    mission.status = "SIMULATING"
    db.add(Job(tenant_id=user.tenant_id, mission_id=mission.id, operator_id=user.id))
    receipt(db, user, "simulate", key, {"mission_id": mission.id}, mission.id)
    audit(db, user, mission.id, "SIMULATION_QUEUED")


def corners(finding: Finding) -> list[float]:
    """Return [x1, y1, x2, y2]. Seeded fixtures store [x, y, width, height]; model rows store corners."""
    x, y, c, d = finding.bbox
    if finding.model_version == "DEMO_PREANNOTATED_V1":
        return [x, y, x + c, y + d]
    return [x, y, c, d]


def _iou(a: list[float], b: list[float]) -> float:
    width = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    height = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    overlap = width * height
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - overlap
    return overlap / union if union > 0 else 0.0


def inspect_targets(db: Session, actor: User, mission: Mission) -> dict:
    """Run the local detector once on each distinct target image when the pass completes.

    New boxes become UNCERTAIN, IMPORTED candidates for ground review only. They never change a
    mission decision: eligibility still needs a fixture-matched, permitted, visible-water finding.
    A detector that is missing or fails is recorded as a status, never as zero containers.
    """
    statuses: dict[str, int] = {}
    new_candidates = 0
    seen_media: set[str] = set()
    for target in mission.target_ids:
        finding = get(db, Finding, target, actor)
        if finding.media_id in seen_media:
            continue
        seen_media.add(finding.media_id)
        media = db.get(Media, finding.media_id)
        if not media:
            statuses["MEDIA_MISSING"] = statuses.get("MEDIA_MISSING", 0) + 1
            continue
        inference = drone_inference.infer_candidates(media.content)
        statuses[inference.status] = statuses.get(inference.status, 0) + 1
        known = list(
            db.scalars(
                select(Finding).where(
                    Finding.tenant_id == mission.tenant_id, Finding.media_id == media.id
                )
            )
        )
        for detection in inference.detections:
            if any(
                k.object_class == detection.object_class and _iou(corners(k), detection.bbox) >= 0.5
                for k in known
            ):
                continue
            created = Finding(
                tenant_id=mission.tenant_id,
                asset_id=finding.asset_id,
                media_id=media.id,
                water_state="UNCERTAIN",
                object_class=detection.object_class,
                bbox=detection.bbox,
                confidence=detection.confidence,
                model_version=inference.model_version or "LOCAL_MODEL_UNKNOWN",
                mode="IMPORTED",
                reason=(
                    "Found automatically after a simulated pass; a candidate container only, "
                    "water and breeding status are unconfirmed and require ground review"
                ),
            )
            db.add(created)
            db.flush()
            known.append(created)
            new_candidates += 1
            audit(
                db,
                actor,
                created.id,
                "MODEL_CANDIDATE_RECORDED",
                {
                    "media_id": media.id,
                    "mission_id": mission.id,
                    "origin": "MISSION_AUTO_INSPECTION",
                    "model_version": created.model_version,
                },
            )
    return {
        "images_checked": len(seen_media),
        "detector_status": statuses,
        "new_candidates": new_candidates,
    }


def step(db: Session, job: Job):
    # Mission row serializes worker and abort on PostgreSQL; SQLite serializes writers.
    mission = db.scalar(select(Mission).where(Mission.id == job.mission_id).with_for_update())
    if mission.status != "SIMULATING":
        job.status = "CANCELLED"
        return
    # Keep the person who started the simulation as the actor for execution events.
    # Fall back to the approver only for jobs created before migration 002.
    actor = db.get(User, job.operator_id or mission.approved_by)
    if job.cursor >= len(mission.target_ids):
        kind, payload = (
            "MISSION_COMPLETED",
            {
                "note": "Simulation only; biological effectiveness unverified",
                "auto_detection": inspect_targets(db, actor, mission),
            },
        )
        mission.status = "COMPLETED"
        job.status = "DONE"
    else:
        finding = get(db, Finding, mission.target_ids[job.cursor], actor)
        asset = get(db, Asset, finding.asset_id, actor)
        decision = eligibility(finding, asset)
        kind = {
            "SKIP": "SKIPPED",
            "GROUND_REVIEW": "GROUND_REVIEW",
            "MOCK_ACTION_ELIGIBLE": "MOCK_ACTION_RECORDED",
        }[decision]
        payload = {
            "finding_id": finding.id,
            "asset_id": asset.id,
            "decision": decision,
            "reason": finding.reason,
            "method": "TEST_WATER_DEMO"
            if decision == "MOCK_ACTION_ELIGIBLE"
            else "INSPECTION_ONLY",
            "biologically_effective": False,
        }
        if decision == "GROUND_REVIEW":
            key = f"ground:{finding.id}"
            if not db.scalar(select(WorkOrder).where(WorkOrder.dedupe_key == key)):
                db.add(
                    WorkOrder(
                        tenant_id=mission.tenant_id,
                        dedupe_key=key,
                        block_id=asset.block_id,
                        asset_id=asset.id,
                        kind="INSPECT_GROUND",
                        reason=finding.reason,
                    )
                )
    event_key = f"step:{job.cursor}"
    if not db.scalar(
        select(MissionEvent).where(
            MissionEvent.mission_id == mission.id, MissionEvent.event_key == event_key
        )
    ):
        db.add(
            MissionEvent(
                tenant_id=mission.tenant_id,
                mission_id=mission.id,
                event_key=event_key,
                kind=kind,
                payload=payload,
            )
        )
        audit(db, actor, mission.id, kind, payload)
    job.cursor += 1
    job.attempts = 0
