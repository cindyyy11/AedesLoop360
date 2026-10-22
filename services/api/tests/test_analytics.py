import os
import tempfile
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select

# The API module captures its engine at import, so use an isolated test database.
TEST_DIR = tempfile.TemporaryDirectory(dir=Path.cwd() / ".pytest_cache", ignore_cleanup_errors=True)
os.environ["AEDES_DATABASE_URL"] = "sqlite:///" + str(Path(TEST_DIR.name) / "analytics.db")
from app.db import Base, SessionLocal, now  # noqa: E402
from app.main import analytics_evaluations, analytics_surveillance, run_allocation_benchmark  # noqa: E402
from app.models import AnalyticsRun, Block, Media, Sample, Tenant, Trap, User  # noqa: E402
from app.security import create_session  # noqa: E402


def make_actor(role: str = "coordinator"):
    db = SessionLocal()
    Base.metadata.create_all(db.bind)
    identity = uuid4().hex
    tenant = Tenant(id="analytics-tenant-" + identity, name="Analytics test")
    db.add(tenant)
    db.flush()
    user = User(
        id="analytics-user-" + identity,
        tenant_id=tenant.id,
        username=tenant.id,
        password_hash="unused",
        role=role,
    )
    db.add(user)
    db.flush()
    create_session(db, user)
    db.commit()
    db.close()
    return user, tenant.id


def test_analytics_evaluation_cards_do_not_show_fixture_metrics():
    user, _ = make_actor()
    db = SessionLocal()
    body = analytics_evaluations(db, user)
    assert body["drone_detection"]["status"] == "NOT_EVALUATED"
    assert body["drone_detection"]["latest_completed_run"] is None
    assert body["ovitrap_count"]["status"] == "NOT_EVALUATED"


def test_completed_held_out_evaluation_record_is_exposed_with_provenance():
    user, _ = make_actor()
    db = SessionLocal()
    run = AnalyticsRun(
        tenant_id=user.tenant_id,
        mode="IMPORTED",
        run_id="real-label-run-1",
        run_type="drone_detection_evaluation",
        status="COMPLETED",
        source_mode="EXTERNALLY_LABELLED_HELD_OUT",
        run_metadata={
            "split": "test",
            "test_count": 12,
            "dataset_sha256": "dataset-hash",
            "checkpoint_sha256": "model-hash",
        },
        metrics={"macro": {"precision": 0.75}},
        artifacts=[],
        limitations=[],
    )
    db.add(run)
    db.commit()
    body = analytics_evaluations(db, user)
    card = body["drone_detection"]
    assert card["status"] == "COMPLETED"
    assert card["latest_completed_run"].metrics["macro"]["precision"] == 0.75
    assert card["latest_completed_run"].run_metadata["test_count"] == 12


def test_surveillance_no_samples_is_unavailable_and_tenant_scoped():
    user, tenant_id = make_actor("inspector")
    db = SessionLocal()
    db.add(
        Block(
            id="analytics-block",
            tenant_id=tenant_id,
            mode="SIMULATED",
            created_at=now(),
            name="A",
            x=1,
            y=1,
        )
    )
    db.add(
        Trap(
            id="analytics-trap",
            tenant_id=tenant_id,
            mode="SIMULATED",
            created_at=now(),
            block_id="analytics-block",
            name="T",
            status="ACTIVE",
            safe_design_verified=True,
            sampling_cadence_days=7,
            serviced_at=now(),
            heartbeat_at=now(),
        )
    )
    db.commit()
    db.close()


def test_different_collection_duration_is_excluded_from_comparable_rate():
    user, tenant_id = make_actor("inspector")
    db = SessionLocal()
    start, end = now() - timedelta(days=14), now()
    block = Block(tenant_id=tenant_id, mode="SIMULATED", name="A", x=1, y=1)
    db.add(block)
    db.flush()
    trap = Trap(
        tenant_id=tenant_id,
        mode="SIMULATED",
        block_id=block.id,
        name="T",
        status="ACTIVE",
        safe_design_verified=True,
        sampling_cadence_days=7,
        serviced_at=now(),
        heartbeat_at=now(),
    )
    db.add(trap)
    media = Media(
        tenant_id=tenant_id,
        mode="SIMULATED",
        sha256="duration-test-hash",
        content_type="image/png",
        content=b"fixture",
        rights="test fixture",
        captured_at=end,
        uploader_id=user.id,
    )
    db.add(media)
    db.flush()
    db.add(
        Sample(
            tenant_id=tenant_id,
            mode="SIMULATED",
            trap_id=trap.id,
            source_sample_id="duration-test",
            substrate_id="duration-substrate",
            interval_start=start,
            interval_end=end,
            collected_at=end,
            sampling_effort_days=14,
            egg_count=20,
            media_id=media.id,
            source="TEST",
            quality="GOOD",
            review_status="CONFIRMED",
            validity="VALID",
            digest="duration-test-digest",
        )
    )
    db.commit()
    result = analytics_surveillance(db, user, start, end)["data"][0]
    assert result["status"] == "DATA_UNAVAILABLE"
    assert result["egg_sum"] is None
    assert result["valid_trap_intervals"] == 0
    assert result["invalid_intervals"] == 1
    assert result["expected_trap_intervals"] == 2
    db = SessionLocal()
    block = analytics_surveillance(db, user, now() - timedelta(days=14), now())["data"][0]
    assert block["status"] == "DATA_UNAVAILABLE"
    assert block["egg_sum"] is None
    assert block["eggs_per_valid_trap_interval"] is None
    assert block["valid_trap_intervals"] == 0
    assert block["expected_trap_intervals"] == 2


def test_coordinator_benchmark_is_idempotently_persisted_as_simulated():
    user, tenant_id = make_actor("coordinator")
    db = SessionLocal()
    first = run_allocation_benchmark(db, user, "benchmark-run-1")
    second = run_allocation_benchmark(db, user, "benchmark-run-1")
    assert first["data"]["id"] == second["data"]["id"]
    run = first["data"]
    assert run["source_mode"] == "SIMULATED"
    assert run["metrics"]["mode"] == "SIMULATED EXPERIMENT"
    stored = db.scalar(select(AnalyticsRun).where(AnalyticsRun.tenant_id == tenant_id))
    assert stored is not None
    assert {row["strategy"] for row in stored.metrics["results"]} == {
        "uniform",
        "static",
        "adaptive",
    }
    db.close()


def test_non_coordinator_cannot_run_benchmark():
    user, _ = make_actor("operator")
    db = SessionLocal()
    from fastapi import HTTPException
    import pytest

    with pytest.raises(HTTPException) as denied:
        run_allocation_benchmark(db, user, "denied")
    assert denied.value.status_code == 403
