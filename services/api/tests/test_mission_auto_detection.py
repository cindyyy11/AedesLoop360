import sys
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import drone, drone_inference  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Finding  # noqa: E402
from app.seed import seed  # noqa: E402
from app.worker import tick  # noqa: E402

API = "/api/v1"
CHECKS = ["SIMULATED_MODE", "AUTHORIZED_TEST_ZONE", "NO_CHEMICAL_PAYLOAD"]


def run_mission(targets: list[str]) -> tuple[TestClient, str]:
    seed()
    c = TestClient(app)
    assert (
        c.post(
            API + "/auth/login",
            json={"username": "coordinator", "password": "demo-coordinator-360"},
        ).status_code
        == 200
    )
    mid = c.post(
        API + "/drones/missions", json={"block_id": "block-1", "target_ids": targets}
    ).json()["data"]["id"]
    assert c.post(f"{API}/drones/missions/{mid}/review").status_code == 200
    decision = {
        "decision": "APPROVE",
        "reason": "Fictional approved simulation",
        "checked_items": CHECKS,
    }
    assert c.post(f"{API}/drones/missions/{mid}/decision", json=decision).status_code == 200
    operator = TestClient(app)
    operator.post(
        API + "/auth/login", json={"username": "operator", "password": "demo-operator-360"}
    )
    simulate = operator.post(
        f"{API}/drones/missions/{mid}/simulate", headers={"Idempotency-Key": mid}
    )
    assert simulate.status_code == 200, simulate.text
    while tick():
        pass
    return c, mid


def test_completed_mission_records_new_candidates_for_ground_review(monkeypatch):
    seed()
    with SessionLocal() as db:
        existing = db.get(Finding, "finding-mock")
        known_box, media_id = drone.corners(existing), existing.media_id
        before = len(list(db.scalars(select(Finding).where(Finding.media_id == media_id))))

    def fake(_content, model_path=None, loader=None):
        return drone_inference.InferenceResult(
            "DETECTED",
            "stub@1",
            [
                drone_inference.CandidateDetection(existing_class, known_box, 0.9),
                drone_inference.CandidateDetection("tire", [0.01, 0.01, 0.05, 0.05], 0.6),
            ],
        )

    with SessionLocal() as db:
        existing_class = db.get(Finding, "finding-mock").object_class
    monkeypatch.setattr(drone_inference, "infer_candidates", fake)

    c, mid = run_mission(["finding-mock"])
    events = c.get(f"{API}/drones/missions/{mid}/events").json()["data"]
    done = events[-1]
    assert done["kind"] == "MISSION_COMPLETED"
    assert done["payload"]["auto_detection"] == {
        "images_checked": 1,
        "detector_status": {"DETECTED": 1},
        "new_candidates": 1,
    }
    assert events[0]["kind"] == "MOCK_ACTION_RECORDED"  # detection never changes the decision
    with SessionLocal() as db:
        rows = list(db.scalars(select(Finding).where(Finding.media_id == media_id)))
        added = [r for r in rows if r.model_version == "stub@1"]
    assert len(rows) == before + 1  # the overlapping box was not duplicated
    assert added[0].water_state == "UNCERTAIN"
    assert added[0].mode == "IMPORTED"
    assert added[0].object_class == "tire"


def test_missing_detector_is_recorded_not_treated_as_zero(monkeypatch):
    monkeypatch.delenv("AEDES_DRONE_MODEL_PATH", raising=False)
    c, mid = run_mission(["finding-dry"])
    done = c.get(f"{API}/drones/missions/{mid}/events").json()["data"][-1]
    assert done["payload"]["auto_detection"]["detector_status"] == {"NOT_CONFIGURED": 1}
    assert done["payload"]["auto_detection"]["new_candidates"] == 0
