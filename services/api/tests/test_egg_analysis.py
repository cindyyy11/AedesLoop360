"""Isolated persisted workflow tests; no live demo database writes."""

import io
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import egg_analysis, egg_vision
from app.db import Base, now
from app.egg_schemas import EggConfirmationInput
from app.egg_routes import list_egg_analyses
from app.models import Audit, Block, EggAnalysis, Finding, Media, Sample, Tenant, Trap, User
from app.schemas import SampleInput
from app.surveillance import ingest


@pytest.fixture
def setup(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'egg.db'}")
    Base.metadata.create_all(engine)
    db = Session(engine)
    db.add_all([Tenant(id="t", name="Test"), Tenant(id="other", name="Other")])
    db.flush()
    user = User(id="u", tenant_id="t", username="reviewer", password_hash="unused", role="reviewer")
    db.add(user)
    db.add(Block(id="b", tenant_id="t", name="Fictional", x=0, y=0))
    db.flush()
    trap = Trap(
        id="trap",
        tenant_id="t",
        block_id="b",
        name="Trap",
        status="ACTIVE",
        serviced_at=now(),
        heartbeat_at=now(),
    )
    db.add(trap)
    db.commit()
    monkeypatch.setattr(
        egg_vision,
        "infer_egg_count",
        lambda *_: SimpleNamespace(
            status="ESTIMATED", estimate=42, model_version="test@sha", reason=None, details={}
        ),
    )
    stream = io.BytesIO()
    Image.new("RGB", (32, 32), "white").save(stream, format="PNG")
    yield db, user, trap, stream.getvalue()
    db.close()
    engine.dispose()


def proposal(setup, key="upload", roi=None):
    db, user, trap, content = setup
    return egg_analysis.propose(
        db,
        user,
        trap.id,
        content,
        "Own image",
        now() - timedelta(hours=1),
        roi or [0.1, 0.1, 0.9, 0.9],
        key,
    )


def confirmation(**changes):
    end = now() - timedelta(days=1)
    values = dict(
        source_sample_id="collection-1",
        substrate_id="substrate-1",
        interval_start=end - timedelta(days=7),
        interval_end=end,
        collected_at=end,
        sampling_effort_days=7,
        accepted_egg_count=40,
        reason="Manually reviewed crop",
    )
    values.update(changes)
    return EggConfirmationInput(**values)


def test_proposal_confirm_override_replay_and_provenance(setup):
    db, user, _, _ = setup
    analysis = proposal(setup)
    assert not db.scalars(select(Sample)).all()
    assert not db.scalars(select(Finding)).all()
    assert db.get(Media, analysis.media_id).mode == "IMPORTED"
    body = confirmation()
    sample = egg_analysis.confirm(db, user, analysis.id, body, "confirm")
    db.flush()
    assert sample.egg_count == 40
    assert sample.review_status == "CONFIRMED_HUMAN"
    assert sample.source == "MODEL_ASSISTED_REVIEWED"
    assert analysis.confirmed_sample_id == sample.id
    assert egg_analysis.confirm(db, user, analysis.id, body, "confirm").id == sample.id
    events = db.scalars(select(Audit).where(Audit.action == "EGG_ANALYSIS_CONFIRMED")).all()
    assert len(events) == 1 and events[0].details["overridden"] is True
    with pytest.raises(HTTPException) as error:
        egg_analysis.confirm(
            db, user, analysis.id, body.model_copy(update={"accepted_egg_count": 39}), "confirm"
        )
    assert error.value.status_code == 409


def test_unavailable_is_null_and_cannot_confirm(setup, monkeypatch):
    db, user, _, _ = setup
    monkeypatch.setattr(
        egg_vision,
        "infer_egg_count",
        lambda *_: SimpleNamespace(
            status="MODEL_MISSING", estimate=None, model_version=None, reason="Missing", details={}
        ),
    )
    analysis = proposal(setup)
    assert analysis.proposed_count is None
    with pytest.raises(HTTPException) as error:
        egg_analysis.confirm(db, user, analysis.id, confirmation(), "confirm")
    assert error.value.status_code == 422
    assert not db.scalars(select(Sample)).all()


def test_roles_tenant_roi_and_offline_quality(setup):
    db, user, trap, _ = setup
    user.role = "operator"
    with pytest.raises(HTTPException) as error:
        proposal(setup)
    assert error.value.status_code == 403
    user.role = "reviewer"
    user.tenant_id = "other"
    with pytest.raises(HTTPException) as error:
        proposal(setup)
    assert error.value.status_code == 403
    user.tenant_id = "t"
    with pytest.raises(HTTPException) as error:
        proposal(setup, roi=[0, 0, 0, 1])
    assert error.value.status_code == 422
    analysis = proposal(setup)
    trap.status = "OFFLINE"
    sample = egg_analysis.confirm(db, user, analysis.id, confirmation(), "confirm")
    assert sample.validity == "INVALID"


def test_upload_replay_conflict_and_same_image_duplicate_interval(setup):
    db, user, trap, content = setup
    captured = now() - timedelta(hours=1)
    args = (db, user, trap.id, content, "Own image", captured, [0, 0, 1, 1], "upload")
    first = egg_analysis.propose(*args)
    assert egg_analysis.propose(*args).id == first.id
    with pytest.raises(HTTPException) as error:
        egg_analysis.propose(
            db, user, trap.id, content, "Different rights", captured, [0, 0, 1, 1], "upload"
        )
    assert error.value.status_code == 409
    egg_analysis.confirm(db, user, first.id, confirmation(), "confirm")
    second = egg_analysis.propose(*args[:-1], "second")
    with pytest.raises(HTTPException) as error:
        egg_analysis.confirm(db, user, second.id, confirmation(), "second-confirm")
    assert error.value.status_code == 409
    assert len(db.scalars(select(EggAnalysis)).all()) == 2


def test_read_scope_invalid_upload_and_direct_review_bypass(setup):
    db, user, trap, content = setup
    with pytest.raises(HTTPException) as error:
        egg_analysis.propose(db, user, trap.id, b"not an image", "Own", now(), [0, 0, 1, 1], "bad")
    assert error.value.status_code == 422
    with pytest.raises(HTTPException) as error:
        egg_analysis.propose(
            db, user, trap.id, content, "Own", now() + timedelta(days=1), [0, 0, 1, 1], "future"
        )
    assert error.value.status_code == 422
    analysis = proposal(setup)
    user.role = "viewer"
    assert list_egg_analyses(trap.id, db, user)["data"][0]["id"] == analysis.id
    user.tenant_id = "other"
    with pytest.raises(HTTPException) as error:
        list_egg_analyses(trap.id, db, user)
    assert error.value.status_code == 403
    user.tenant_id = "t"
    user.role = "reviewer"
    body = confirmation()
    sample = SampleInput(
        **body.model_dump(exclude={"accepted_egg_count", "reason"}),
        egg_count=40,
        media_id=analysis.media_id,
        mode="IMPORTED",
        source="MODEL_ASSISTED_REVIEWED",
    )
    with pytest.raises(HTTPException) as error:
        ingest(db, user, trap.id, sample, "bypass")
    assert error.value.status_code == 422
