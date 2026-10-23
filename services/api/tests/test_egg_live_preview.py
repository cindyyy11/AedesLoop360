"""Egg live preview is stateless, tenant-scoped, rate limited and never persists anything."""

import io
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from PIL import Image
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from app import egg_vision, live_routes
from app.db import Base, now
from app.models import Block, EggAnalysis, Media, Sample, Tenant, Trap, User

ROI = "[0.2, 0.1, 0.8, 0.9]"


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setattr(live_routes, "_recent", {})
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = Session(engine)
    session.add_all([Tenant(id="t", name="T"), Tenant(id="o", name="Other")])
    session.flush()
    session.add(Block(id="b", tenant_id="t", name="Fictional", x=0, y=0))
    session.flush()
    session.add(
        Trap(
            id="trap-a",
            tenant_id="t",
            block_id="b",
            name="A",
            status="ACTIVE",
            serviced_at=now(),
            heartbeat_at=now(),
        )
    )
    session.commit()
    yield session
    session.close()
    engine.dispose()


def user(role="operator", tenant="t"):
    return User(
        id=f"{role}-{tenant}", tenant_id=tenant, username=role, password_hash="x", role=role
    )


def frame():
    out = io.BytesIO()
    Image.new("RGB", (64, 48), "#996633").save(out, format="JPEG")
    return UploadFile(io.BytesIO(out.getvalue()), filename="f")


def fake_model(monkeypatch, status="ESTIMATED", estimate=23):
    seen = []

    def infer(content, roi):
        seen.append(roi)
        return egg_vision.EggEstimate(status, estimate, "m@sha", None, {})

    monkeypatch.setattr(egg_vision, "infer_egg_count", infer)
    return seen


def test_preview_returns_estimate_without_persisting(db, monkeypatch):
    seen = fake_model(monkeypatch)
    out = live_routes.egg_live_preview("trap-a", db, user(), frame(), ROI)
    assert out["source_mode"] == "IMPORTED"
    assert out["data"]["estimate"] == 23 and out["data"]["persisted"] is False
    assert seen == [[0.2, 0.1, 0.8, 0.9]]
    for model in (EggAnalysis, Media, Sample):
        assert db.scalar(select(func.count()).select_from(model)) == 0


def test_unavailable_model_gives_no_estimate_not_zero(db, monkeypatch):
    fake_model(monkeypatch, status="NOT_CONFIGURED", estimate=None)
    out = live_routes.egg_live_preview("trap-a", db, user(), frame(), ROI)
    assert out["data"]["status"] == "NOT_CONFIGURED"
    assert out["data"]["estimate"] is None


def test_other_tenant_cannot_use_the_trap(db, monkeypatch):
    fake_model(monkeypatch)
    with pytest.raises(HTTPException) as err:
        live_routes.egg_live_preview("trap-a", db, user(tenant="o"), frame(), ROI)
    assert err.value.status_code == 403


@pytest.mark.parametrize("roi", ["not json", "[1,2,3]", '["a",0,1,1]', "{}", "[0,0,1,NaN]"])
def test_bad_roi_is_rejected(db, monkeypatch, roi):
    fake_model(monkeypatch)
    with pytest.raises(HTTPException) as err:
        live_routes.egg_live_preview("trap-a", db, user(), frame(), roi)
    assert err.value.status_code == 422


def test_unknown_role_denied(db, monkeypatch):
    fake_model(monkeypatch)
    with pytest.raises(HTTPException) as err:
        live_routes.egg_live_preview("trap-a", db, user("guest"), frame(), ROI)
    assert err.value.status_code in (401, 403)


def test_rate_limited_before_the_model_runs_and_separate_from_drone_bucket(db, monkeypatch):
    seen = fake_model(monkeypatch)
    monkeypatch.setattr(live_routes, "MAX_FRAMES_PER_WINDOW", 1)
    live_routes.egg_live_preview("trap-a", db, user(), frame(), ROI)
    with pytest.raises(HTTPException) as err:
        live_routes.egg_live_preview("trap-a", db, user(), frame(), ROI)
    assert err.value.status_code == 429 and len(seen) == 1
    # The drone live-detect bucket is independent of the egg preview bucket.
    monkeypatch.setattr(
        live_routes.drone_inference,
        "infer_candidates",
        lambda _: SimpleNamespace(
            status="NO_DETECTIONS", model_version="m", detections=[], reason=None
        ),
    )
    live_routes.live_detect(db, user(), frame())
