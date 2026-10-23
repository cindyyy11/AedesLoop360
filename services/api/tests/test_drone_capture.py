"""Simulated drone pass: proposals only, human confirmation still required."""

from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import drone_capture, egg_analysis, egg_vision
from app.db import Base, now
from app.egg_routes import egg_analysis_inbox
from app.egg_schemas import EggConfirmationInput
from app.models import Audit, Block, EggAnalysis, Media, Sample, Tenant, Trap, User


@pytest.fixture
def setup(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'drone.db'}")
    Base.metadata.create_all(engine)
    db = Session(engine)
    db.add_all([Tenant(id="t", name="Test"), Tenant(id="other", name="Other")])
    db.flush()
    users = {
        role: User(id=f"u-{role}", tenant_id="t", username=role, password_hash="x", role=role)
        for role in ("coordinator", "operator", "reviewer", "inspector")
    }
    db.add_all(users.values())
    db.add(Block(id="b", tenant_id="t", name="Fictional", x=0, y=0))
    db.flush()
    for trap_id, status in (("trap-a", "ACTIVE"), ("trap-b", "ACTIVE"), ("trap-off", "OFFLINE")):
        db.add(
            Trap(
                id=trap_id,
                tenant_id="t",
                block_id="b",
                name=trap_id,
                status=status,
                serviced_at=now(),
                heartbeat_at=now(),
            )
        )
    db.commit()
    monkeypatch.setattr(
        egg_vision,
        "infer_egg_count",
        lambda *_: SimpleNamespace(
            status="ESTIMATED", estimate=17, model_version="test@sha", reason=None, details={}
        ),
    )
    yield db, users
    db.close()
    engine.dispose()


def test_pass_creates_simulated_proposals_and_skips_offline_traps(setup):
    db, users = setup
    pass_id, analyses, skipped = drone_capture.run_pass(
        db, users["operator"], ["trap-a", "trap-b", "trap-off"], "pass-1"
    )
    db.commit()
    assert {a.trap_id for a in analyses} == {"trap-a", "trap-b"}
    for analysis in analyses:
        assert analysis.mode == "SIMULATED" and analysis.source == "DRONE_SIM"
        assert analysis.capture_pass_id == pass_id
        assert analysis.confirmed_sample_id is None
        assert db.get(Media, analysis.media_id).mode == "SIMULATED"
    # An offline trap is unavailable, never a zero-egg photo.
    assert [s["trap_id"] for s in skipped] == ["trap-off"]
    assert "unavailable" in skipped[0]["reason"]
    assert not db.scalars(select(Sample)).all()
    assert db.scalars(select(Audit).where(Audit.action == "TRAP_PASS_SIMULATED")).one()


def test_pass_replay_is_idempotent_and_key_reuse_with_other_traps_conflicts(setup):
    db, users = setup
    first = drone_capture.run_pass(db, users["coordinator"], ["trap-a", "trap-off"], "same")
    db.commit()
    second = drone_capture.run_pass(db, users["coordinator"], ["trap-a", "trap-off"], "same")
    assert second[0] == first[0]
    assert [a.id for a in second[1]] == [a.id for a in first[1]]
    assert [s["trap_id"] for s in second[2]] == ["trap-off"]
    assert len(db.scalars(select(EggAnalysis)).all()) == 1
    with pytest.raises(HTTPException) as error:
        drone_capture.run_pass(db, users["coordinator"], ["trap-b"], "same")
    assert error.value.status_code == 409


def test_pass_photos_are_deterministic_per_trap_and_distinct_between_traps():
    one, dots_one = drone_capture.synthetic_paddle("trap-a", "p1")
    again, dots_again = drone_capture.synthetic_paddle("trap-a", "p1")
    other, _ = drone_capture.synthetic_paddle("trap-b", "p1")
    assert one == again and dots_one == dots_again
    assert one != other


def test_only_operator_or_coordinator_may_run_a_pass(setup):
    db, users = setup
    for role in ("reviewer", "inspector"):
        with pytest.raises(HTTPException) as error:
            drone_capture.run_pass(db, users[role], ["trap-a"], f"deny-{role}")
        assert error.value.status_code == 403
    with pytest.raises(HTTPException) as error:
        drone_capture.run_pass(db, users["operator"], ["trap-a", "trap-a"], "dup")
    assert error.value.status_code == 422
    with pytest.raises(HTTPException):
        drone_capture.run_pass(db, users["operator"], ["no-such-trap"], "missing")
    assert not db.scalars(select(EggAnalysis)).all()


def test_operator_cannot_confirm_and_reviewer_confirmation_is_simulated(setup):
    db, users = setup
    _, analyses, _ = drone_capture.run_pass(db, users["operator"], ["trap-a"], "confirm-pass")
    db.commit()
    end = now() - timedelta(days=1)
    body = EggConfirmationInput(
        source_sample_id="drone-1",
        substrate_id="paddle-1",
        interval_start=end - timedelta(days=7),
        interval_end=end,
        collected_at=end,
        sampling_effort_days=7,
        accepted_egg_count=15,
        reason="Checked against the photo",
    )
    with pytest.raises(HTTPException) as error:
        egg_analysis.confirm(db, users["operator"], analyses[0].id, body, "op-confirm")
    assert error.value.status_code == 403
    sample = egg_analysis.confirm(db, users["reviewer"], analyses[0].id, body, "rev-confirm")
    assert sample.mode == "SIMULATED"
    assert sample.source == "DRONE_SIM_REVIEWED"
    assert sample.review_status == "CONFIRMED_HUMAN"
    assert sample.egg_count == 15
    event = db.scalars(select(Audit).where(Audit.action == "EGG_ANALYSIS_CONFIRMED")).one()
    assert event.details["mode"] == "SIMULATED"


def test_inbox_lists_only_unconfirmed_proposals_for_the_tenant(setup):
    db, users = setup
    _, analyses, _ = drone_capture.run_pass(db, users["coordinator"], ["trap-a", "trap-b"], "inbox")
    db.commit()
    end = now() - timedelta(days=1)
    egg_analysis.confirm(
        db,
        users["coordinator"],
        analyses[0].id,
        EggConfirmationInput(
            source_sample_id="s",
            substrate_id="p",
            interval_start=end - timedelta(days=7),
            interval_end=end,
            collected_at=end,
            sampling_effort_days=7,
            accepted_egg_count=17,
            reason="Accepted as proposed",
        ),
        "c",
    )
    db.commit()
    inbox = egg_analysis_inbox(db, users["operator"])
    assert [row["id"] for row in inbox["data"]] == [analyses[1].id]
    assert inbox["source_mode"] == "SIMULATED"
