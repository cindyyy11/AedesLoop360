import os
import subprocess
import sys
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

# A separate database for each test run; never touches the user's demo data.
import tempfile

Path("data/tests").mkdir(parents=True, exist_ok=True)
TEST_DIR = tempfile.TemporaryDirectory(dir=Path("data/tests").resolve(), ignore_cleanup_errors=True)
os.environ["AEDES_DATABASE_URL"] = "sqlite:///" + str(Path(TEST_DIR.name) / "test.db")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal, now  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Asset, Finding, Media, Mission, Sample  # noqa: E402
from app.seed import fixture_png, media, seed  # noqa: E402
from app.worker import tick  # noqa: E402

API = "/api/v1"
CHECKS = ["SIMULATED_MODE", "AUTHORIZED_TEST_ZONE", "NO_CHEMICAL_PAYLOAD"]


@pytest.fixture(scope="session", autouse=True)
def database():
    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "services/api/alembic.ini", "upgrade", "head"],
        check=True,
    )
    seed()
    seed()


def client(role="coordinator"):
    c = TestClient(app)
    response = c.post(
        API + "/auth/login", json={"username": role, "password": "demo-" + role + "-360"}
    )
    assert response.status_code == 200, response.text
    return c


def new_mission():
    c = client()
    row = c.post(
        API + "/drones/missions",
        json={
            "block_id": "block-1",
            "target_ids": ["finding-dry", "finding-mock", "finding-occluded"],
        },
    ).json()["data"]
    return c, row["id"]


def approve(c, mission_id):
    assert c.post(f"{API}/drones/missions/{mission_id}/review").status_code == 200
    assert (
        c.post(
            f"{API}/drones/missions/{mission_id}/decision",
            json={
                "decision": "APPROVE",
                "reason": "Fictional approved simulation",
                "checked_items": CHECKS,
            },
        ).status_code
        == 200
    )


def test_foundation_auth_tenancy_media():
    assert TestClient(app).get(API + "/blocks").status_code == 401
    c = client()
    blocks = c.get(API + "/blocks").json()["data"]
    assert len(blocks) == 4 and blocks[3]["status"] == "DATA_UNAVAILABLE"
    assert blocks[3]["eggs_per_interval"] is None
    assert client("outsider").get(API + "/assets/asset-p03/history").status_code == 403
    assert client("outsider").get(API + "/media/media-aerial-001").status_code == 403
    assert TestClient(app).get(API + "/media/media-aerial-001").status_code == 401
    assert (
        c.post(
            API + "/media",
            files={"file": ("bad.png", b"not image", "image/png")},
            data={
                "rights": "Original fixture",
                "captured_at": now().isoformat(),
                "asset_id": "asset-p01",
            },
        ).status_code
        == 422
    )


def test_drone_gates_order_retry_and_abort():
    c, mid = new_mission()
    operator = client("operator")
    assert (
        operator.post(
            f"{API}/drones/missions/{mid}/simulate", headers={"Idempotency-Key": mid}
        ).status_code
        == 409
    )
    inspector = client("inspector")
    assert (
        inspector.post(
            f"{API}/drones/missions/{mid}/decision",
            json={"decision": "APPROVE", "reason": "Wrong role attempt", "checked_items": CHECKS},
        ).status_code
        == 403
    )
    denied = c.get(API + "/audit").json()["data"]
    assert any(
        event["entity_id"] == mid
        and event["action"] == "MISSION_DECISION_DENIED_ROLE"
        and event["actor_id"] == "user-inspector"
        for event in denied
    )
    approve(c, mid)
    for _ in range(2):
        assert (
            operator.post(
                f"{API}/drones/missions/{mid}/simulate", headers={"Idempotency-Key": mid}
            ).status_code
            == 200
        )
    for _ in range(4):
        assert tick()
    events = c.get(f"{API}/drones/missions/{mid}/events").json()["data"]
    assert [e["kind"] for e in events] == [
        "SKIPPED",
        "MOCK_ACTION_RECORDED",
        "GROUND_REVIEW",
        "MISSION_COMPLETED",
    ]
    assert not tick()
    with SessionLocal() as db:
        execution_audit = db.scalar(
            text(
                "SELECT actor_id FROM audit_events "
                "WHERE entity_id = :mission_id AND action = 'MOCK_ACTION_RECORDED'"
            ),
            {"mission_id": mid},
        )
    assert execution_audit == "user-operator"
    persisted_tasks = c.get(API + "/work-orders").json()["data"]
    assert any(
        w["kind"] == "INSPECT_GROUND" and w["asset_id"] == "asset-p03" for w in persisted_tasks
    )
    c, mid = new_mission()
    approve(c, mid)
    operator.post(f"{API}/drones/missions/{mid}/simulate", headers={"Idempotency-Key": mid})
    assert tick()
    assert operator.post(f"{API}/drones/missions/{mid}/abort").status_code == 200
    tick()
    events = c.get(f"{API}/drones/missions/{mid}/events").json()["data"]
    assert [e["kind"] for e in events] == ["SKIPPED", "ABORTED"]


def sample_payload(label="new-sample", trap="trap-b1-1", days_ago=7):
    end = (now() - timedelta(days=days_ago)).replace(hour=0, minute=0, second=0, microsecond=0)
    start = end - timedelta(days=7)
    with SessionLocal.begin() as db:
        image = media(db, label, 100)
        image_id = image.id
    return {
        "source_sample_id": label,
        "substrate_id": "substrate-" + label,
        "interval_start": start.isoformat(),
        "interval_end": end.isoformat(),
        "collected_at": end.isoformat(),
        "sampling_effort_days": 7,
        "egg_count": 100,
        "media_id": image_id,
        "quality": "GOOD",
    }


def test_samples_dedup_quality_and_planning_feedback():
    c = client()
    # Use a historical comparable window separate from seeded baseline.
    body = sample_payload("feedback", days_ago=21)
    path = API + "/ovitraps/trap-b1-1/samples"
    params = {
        "window_start": body["interval_start"],
        "window_end": body["interval_end"],
        "budget": {"staff_hours": 8, "drone_survey_hours": 0},
    }
    before = c.post(API + "/planning/runs", json=params).json()["data"]
    response = c.post(path, json=body, headers={"Idempotency-Key": "feedback"})
    assert response.status_code == 200, response.text
    sid = response.json()["data"]["id"]
    assert (
        c.post(path, json=body, headers={"Idempotency-Key": "feedback"}).json()["data"]["id"] == sid
    )
    assert (
        c.post(path, json=body, headers={"Idempotency-Key": "another-key"}).json()["data"]["id"]
        == sid
    )
    assert (
        c.post(
            path, json={**body, "egg_count": 999}, headers={"Idempotency-Key": "feedback"}
        ).status_code
        == 409
    )
    assert (
        c.post(
            path,
            json={**body, "source_sample_id": "duplicate", "substrate_id": "new"},
            headers={"Idempotency-Key": "duplicate"},
        ).status_code
        == 409
    )
    after = c.post(API + "/planning/runs", json=params).json()["data"]
    assert before["evidence_snapshot_hash"] != after["evidence_snapshot_hash"]

    def score(run):
        return next(b["score"] for b in run["result"]["block_priorities"] if b["id"] == "block-1")

    assert score(after) != score(before)
    for run in (before, after):
        for block in run["result"]["block_priorities"]:
            assert block["factors"], block["id"]
            assert round(sum(f["points"] for f in block["factors"]), 2) == block["score"]
    assert after["result"]["budget_used"]["staff_hours"] <= 8
    assert (
        len(
            {
                t["block_id"]
                for t in after["result"]["recommended_tasks"]
                if t["id"].startswith("baseline")
            }
        )
        == 4
    )
    tasks = after["result"]["recommended_tasks"]
    assert any(t["block_id"] == "block-4" and t["kind"] == "SERVICE_TRAP" for t in tasks)
    assert any(t["block_id"] == "block-1" and t["kind"] == "REMOVE_SOURCE" for t in tasks)
    assert all(t["kind"] != "DRONE_MISSION" for t in tasks)
    mismatch_end = (now() - timedelta(days=7)).isoformat()
    mismatched = c.get(
        API + "/blocks", params={"start": body["interval_start"], "end": mismatch_end}
    ).json()["data"]
    block_one = next(b for b in mismatched if b["id"] == "block-1")
    assert block_one["comparability_warning"]
    assert sid in block_one["excluded_samples"]
    repeat = c.post(API + "/planning/runs", json=params).json()["data"]
    assert repeat["evidence_snapshot_hash"] == after["evidence_snapshot_hash"]
    assert repeat["result"] == after["result"]
    assert (
        c.post(
            API + "/planning/runs",
            json={**params, "budget": {"staff_hours": 3, "drone_survey_hours": 0}},
        ).status_code
        == 422
    )
    invalid = sample_payload("offline", days_ago=21)
    response = c.post(
        API + "/ovitraps/trap-b4-1/samples", json=invalid, headers={"Idempotency-Key": "offline"}
    )
    assert response.json()["data"]["validity"] == "INVALID"
    blurred = sample_payload("blurred", trap="trap-b1-2", days_ago=21)
    blurred["quality"] = "BLURRED"
    response = c.post(
        API + "/ovitraps/trap-b1-2/samples",
        json=blurred,
        headers={"Idempotency-Key": "blurred"},
    )
    assert response.json()["data"]["validity"] == "INVALID"


def test_sample_count_correction_is_audited_and_append_only():
    c = client("coordinator")
    body = sample_payload("revision", trap="trap-b2-1", days_ago=21)
    path = API + "/ovitraps/trap-b2-1/samples"
    sample = c.post(path, json=body, headers={"Idempotency-Key": "revision-import"}).json()["data"]
    reviewer = client("reviewer")
    revision_path = f"{API}/samples/{sample['id']}/revisions"
    payload = {
        "corrected_egg_count": 73,
        "media_id": "media-egg-new-001",
        "reason": "Recounted the human-labelled synthetic image",
        "quality": "GOOD",
    }
    revised = reviewer.post(revision_path, json=payload, headers={"Idempotency-Key": "revision-1"})
    assert revised.status_code == 200, revised.text
    record = revised.json()["data"]
    assert record["previous_egg_count"] == 100
    assert record["corrected_egg_count"] == 73
    assert record["reviewer_id"] == "user-reviewer"
    assert (
        reviewer.post(
            revision_path, json=payload, headers={"Idempotency-Key": "revision-1"}
        ).json()["data"]["id"]
        == record["id"]
    )
    with SessionLocal() as db:
        assert db.get(Sample, sample["id"]).egg_count == 73
        with pytest.raises(Exception):
            db.execute(text("UPDATE sample_revisions SET corrected_egg_count = 0"))
        db.rollback()
    assert len(reviewer.get(revision_path).json()["data"]) == 1


def test_recurrence_work_followup_audit_persistence():
    inspector, reviewer, coordinator = client("inspector"), client("reviewer"), client()
    payload = {
        "asset_id": "asset-p03",
        "observed_at": (now() - timedelta(days=1)).isoformat(),
        "water_state": "VISIBLE_WATER",
        "media_id": "media-aerial-001",
    }
    oid = inspector.post(
        API + "/inspections", json=payload, headers={"Idempotency-Key": "recurrence"}
    ).json()["data"]["id"]
    assert (
        reviewer.post(
            f"{API}/inspections/{oid}/review",
            json={"confirmed": True, "reason": "Separate fictional follow-up evidence"},
        ).status_code
        == 200
    )
    response = coordinator.post(API + "/assets/asset-p03/recurrence")
    work = response.json()["data"]
    assert work["kind"] == "ENGINEERING_REVIEW"
    assert coordinator.post(API + "/assets/asset-p03/recurrence").json()["data"]["id"] == work["id"]
    path = f"{API}/work-orders/{work['id']}"
    assert (
        coordinator.patch(
            path, json={"action": "ASSIGN", "assignee_id": "user-inspector"}
        ).status_code
        == 200
    )
    assert inspector.patch(path, json={"action": "START"}).status_code == 200
    assert (
        inspector.patch(
            path, json={"action": "COMPLETE", "evidence_id": "media-aerial-001"}
        ).json()["data"]["status"]
        == "ACTION_COMPLETED_PENDING_VERIFICATION"
    )
    assert (
        inspector.post(
            path + "/verify",
            json={
                "result": "VERIFIED_RESOLVED",
                "evidence_id": "media-aerial-001",
                "reason": "Cannot verify own action",
            },
        ).status_code
        == 403
    )
    assert (
        reviewer.post(
            path + "/verify",
            json={
                "result": "VERIFIED_RESOLVED",
                "evidence_id": "media-aerial-001",
                "reason": "Independent fictional physical-condition check",
            },
        ).json()["data"]["status"]
        == "VERIFIED_RESOLVED"
    )
    assert coordinator.get(API + "/audit").json()["data"]
    with SessionLocal() as db:
        with pytest.raises(Exception):
            db.execute(text("UPDATE audit_events SET action = 'tampered'"))
        db.rollback()
    code = (
        "from app.db import SessionLocal; from app.models import WorkOrder; db=SessionLocal(); assert db.get(WorkOrder, '"
        + work["id"]
        + "').status == 'VERIFIED_RESOLVED'"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        env={**os.environ, "PYTHONPATH": "services/api"},
        capture_output=True,
    )
    assert result.returncode == 0, result.stderr


def test_permission_changed_fails_closed():
    c, mid = new_mission()
    approve(c, mid)
    with SessionLocal.begin() as db:
        db.get(Asset, "asset-p02").permission = False
    operator = client("operator")
    operator.post(f"{API}/drones/missions/{mid}/simulate", headers={"Idempotency-Key": mid})
    for _ in range(4):
        tick()
    kinds = [e["kind"] for e in c.get(f"{API}/drones/missions/{mid}/events").json()["data"]]
    assert "MOCK_ACTION_RECORDED" not in kinds
    with SessionLocal.begin() as db:
        db.get(Asset, "asset-p02").permission = True


def test_expired_mission_approval_cannot_queue_execution():
    coordinator, mission_id = new_mission()
    approve(coordinator, mission_id)
    with SessionLocal.begin() as db:
        db.get(Mission, mission_id).approval_expires_at = now() - timedelta(seconds=1)
    operator = client("operator")
    response = operator.post(
        f"{API}/drones/missions/{mission_id}/simulate",
        headers={"Idempotency-Key": "expired-approval"},
    )
    assert response.status_code == 409
    assert all(
        job["mission_id"] != mission_id for job in operator.get(API + "/jobs").json()["data"]
    )
    assert any(
        event["entity_id"] == mission_id and event["action"] == "SIMULATION_DENIED"
        for event in coordinator.get(API + "/audit").json()["data"]
    )


def test_upload_links_exact_fixture_and_queues_uncertain_review():
    c = client("operator")
    with SessionLocal() as db:
        exact_fixture = db.get(Media, "media-aerial-001").content
    exact = c.post(
        API + "/media",
        files={"file": ("aerial.png", exact_fixture, "image/png")},
        data={
            "rights": "Original synthetic fixture, CC0",
            "captured_at": now().isoformat(),
            "asset_id": "asset-p02",
        },
    )
    assert exact.status_code == 200, exact.text
    uploaded = exact.json()["data"]
    assert uploaded["adapter"] == "DEMO_PREANNOTATED_V1"
    finding = next(
        f for f in c.get(API + "/findings").json()["data"] if f["media_id"] == uploaded["id"]
    )
    assert finding["asset_id"] == "asset-p02"
    assert finding["water_state"] == "VISIBLE_WATER"
    assert finding["model_version"] == "DEMO_PREANNOTATED_V1"
    assert finding["mode"] == "SIMULATED"

    unsupported = c.post(
        API + "/media",
        files={"file": ("unknown.png", fixture_png("unknown local image"), "image/png")},
        data={
            "rights": "Original synthetic fixture, CC0",
            "captured_at": now().isoformat(),
            "asset_id": "asset-p01",
        },
    )
    assert unsupported.status_code == 200, unsupported.text
    row = unsupported.json()["data"]
    assert row["adapter"] == "YOLO_LOCAL_V1:NOT_CONFIGURED"
    finding = next(f for f in c.get(API + "/findings").json()["data"] if f["media_id"] == row["id"])
    assert finding["water_state"] == "UNCERTAIN"
    assert finding["eligibility"] == "GROUND_REVIEW"


def make_finding(label, water_state="VISIBLE_WATER"):
    with SessionLocal.begin() as db:
        aerial = db.get(Media, "media-aerial-001")
        db.add(
            Finding(
                id=label,
                tenant_id=aerial.tenant_id,
                asset_id="asset-p02",
                media_id=aerial.id,
                water_state=water_state,
                bbox=[0.1, 0.1, 0.2, 0.2],
                reason="Review test candidate",
            )
        )
    return label


def test_finding_review_roles_reject_relabel_and_active_mission_guard():
    fid = make_finding("finding-review-reject")
    body = {"decision": "REJECT", "reason": "Not a water-holding container"}
    for role in ("operator", "coordinator", "inspector"):
        assert client(role).post(f"{API}/findings/{fid}/review", json=body).status_code == 403
    reviewer = client("reviewer")
    seen = next(f for f in reviewer.get(API + "/findings").json()["data"] if f["id"] == fid)
    assert seen["review_status"] == "UNREVIEWED"
    assert seen["eligibility"] == "MOCK_ACTION_ELIGIBLE"

    # A relabel needs a water state; other decisions must not carry one.
    assert (
        reviewer.post(
            f"{API}/findings/{fid}/review", json={"decision": "RELABEL", "reason": "Looks dry now"}
        ).status_code
        == 422
    )
    assert (
        reviewer.post(
            f"{API}/findings/{fid}/review", json={**body, "water_state": "DRY"}
        ).status_code
        == 422
    )
    done = reviewer.post(f"{API}/findings/{fid}/review", json=body)
    assert done.status_code == 200, done.text
    data = done.json()["data"]
    assert data["review_status"] == "REJECTED"
    assert data["reviewed_by"] == "user-reviewer"
    assert data["eligibility"] == "SKIP"
    audit_log = client("coordinator").get(API + "/audit").json()["data"]
    assert any(e["entity_id"] == fid and e["action"] == "FINDING_REVIEWED" for e in audit_log)

    relabel_id = make_finding("finding-review-relabel")
    relabelled = reviewer.post(
        f"{API}/findings/{relabel_id}/review",
        json={"decision": "RELABEL", "reason": "Dry on inspection", "water_state": "DRY"},
    )
    assert relabelled.status_code == 200, relabelled.text
    assert relabelled.json()["data"]["water_state"] == "DRY"
    assert relabelled.json()["data"]["eligibility"] == "SKIP"

    # Once a mission holds the target, relabelling is refused; rejecting stays allowed.
    held = make_finding("finding-review-held")
    coordinator = client("coordinator")
    mission = coordinator.post(
        API + "/drones/missions", json={"block_id": "block-1", "target_ids": [held], "mode": "SIMULATED"}
    )
    assert mission.status_code == 200, mission.text
    mid = mission.json()["data"]["id"]
    assert coordinator.post(f"{API}/drones/missions/{mid}/review").status_code == 200
    blocked = reviewer.post(
        f"{API}/findings/{held}/review",
        json={"decision": "RELABEL", "reason": "Changing mind", "water_state": "OCCLUDED"},
    )
    assert blocked.status_code == 409
    assert (
        reviewer.post(f"{API}/findings/{held}/review", json={**body}).json()["data"]["eligibility"]
        == "SKIP"
    )

