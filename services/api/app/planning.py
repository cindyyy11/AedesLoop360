from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Allocation, Asset, User, WorkOrder
from .repository import audit, digest, rows
from .schemas import PlanInput
from .surveillance import summaries


def allocate(db: Session, user: User, body: PlanInput) -> Allocation:
    blocks = summaries(db, user, body.window_start, body.window_end)
    assets = rows(db, Asset, user)
    snapshot = {
        "blocks": blocks,
        "assets": [
            {"id": a.id, "permission": a.permission, "accessible": a.accessible} for a in assets
        ],
        "parameters": body.model_dump(mode="json"),
        "policy": "ADAPTIVE_RULES_V1",
    }
    ranked = []
    for block in blocks:
        score = (
            3 * block["unresolved_sources"]
            + (block["eggs_per_interval"] or 0) / 10
            + (4 if block["status"] == "DATA_UNAVAILABLE" else 0)
        )
        ranked.append(
            {
                **block,
                "score": round(score, 2),
                "reasons": [
                    f"{block['unresolved_sources']} unresolved verified sources",
                    f"{block['valid_intervals']}/{block['expected_intervals']} valid comparable intervals",
                    "NO_DRONE_NEEDED: accessible or occluded sources use ground inspection",
                ],
                "evidence_ids": block["sample_ids"] + block["observation_ids"],
            }
        )
    ranked.sort(key=lambda b: (-b["score"], b["id"]))
    tasks = [
        {
            "id": f"baseline:{b['id']}",
            "block_id": b["id"],
            "kind": "INSPECT_GROUND",
            "hours": 1,
            "reason": "Minimum routine coverage",
        }
        for b in blocks
    ]
    used = float(len(tasks))
    excluded = []
    for block in ranked:
        kind = (
            "SERVICE_TRAP"
            if block["status"] == "DATA_UNAVAILABLE"
            else "REMOVE_SOURCE"
            if block["unresolved_sources"]
            else "INSPECT_GROUND"
        )
        if used + 2 <= body.budget.staff_hours:
            tasks.append(
                {
                    "id": f"priority:{block['id']}",
                    "block_id": block["id"],
                    "kind": kind,
                    "hours": 2,
                    "reason": "; ".join(block["reasons"]),
                    "evidence_ids": block["evidence_ids"],
                }
            )
            used += 2
        else:
            excluded.append(
                {
                    "block_id": block["id"],
                    "kind": kind,
                    "reason": "Staff budget exhausted; baseline retained",
                }
            )
    result = {
        "block_priorities": ranked,
        "recommended_tasks": tasks,
        "excluded_tasks": excluded,
        "budget_used": {"staff_hours": used, "drone_survey_hours": 0},
        "coverage_guardrail": True,
        "assumptions": "Demo weights: 3 per unresolved source, eggs/10, 4 for missingness. No epidemiological calibration. No drone proposed for current accessible/occluded fixture assets.",
    }
    run = Allocation(
        tenant_id=user.tenant_id,
        snapshot=snapshot,
        evidence_snapshot_hash=digest(snapshot),
        result=result,
    )
    db.add(run)
    db.flush()
    audit(db, user, run.id, "ALLOCATION_PROPOSED", {"hash": run.evidence_snapshot_hash})
    return run


def approve(db: Session, user: User, run: Allocation):
    if run.status == "APPROVED":
        return
    for task in run.result["recommended_tasks"]:
        key = f"plan:{run.id}:{task['id']}"
        if not db.scalar(select(WorkOrder).where(WorkOrder.dedupe_key == key)):
            db.add(
                WorkOrder(
                    tenant_id=user.tenant_id,
                    dedupe_key=key,
                    block_id=task["block_id"],
                    kind=task["kind"],
                    reason=task["reason"],
                )
            )
    run.status = "APPROVED"
    audit(
        db,
        user,
        run.id,
        "PLAN_APPROVED",
        {"scope": "Inspection work only; no flight or chemical authorization"},
    )
