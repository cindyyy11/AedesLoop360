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
from app.models import Asset  # noqa: E402
from app.seed import media, seed  # noqa: E402
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
            data={"rights": "Original fixture", "captured_at": "2026-10-01T00:00:00Z"},
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
    assert (
        client("inspector")
        .post(
            f"{API}/drones/missions/{mid}/decision",
            json={"decision": "APPROVE", "reason": "Wrong role attempt", "checked_items": CHECKS},
        )
        .status_code
        == 403
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
