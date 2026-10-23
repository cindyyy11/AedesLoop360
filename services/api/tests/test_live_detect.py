"""Live frame detection is stateless, authorised and never creates findings."""

import io
import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException
from PIL import Image
from starlette.datastructures import UploadFile

from app import drone_inference, live_routes
from app.models import User


def frame(fmt="JPEG", size=(64, 48)):
    out = io.BytesIO()
    Image.new("RGB", size, "#445566").save(out, format=fmt)
    return UploadFile(io.BytesIO(out.getvalue()), filename="f")


def user(role):
    return User(id=role, tenant_id="t", username=role, password_hash="x", role=role)


def test_returns_candidates_uncertain_and_not_persisted(monkeypatch):
    det = drone_inference.CandidateDetection("water_tank", [0.1, 0.1, 0.5, 0.5], 0.7)
    monkeypatch.setattr(
        drone_inference,
        "infer_candidates",
        lambda _: drone_inference.InferenceResult("DETECTED", "m@abc", [det]),
    )
    out = live_routes.live_detect(None, user("operator"), frame())
    assert out["source_mode"] == "IMPORTED"
    assert out["data"]["persisted"] is False
    assert out["data"]["detections"][0]["state"] == "UNCERTAIN"
    assert out["data"]["frame_width"] == 64


def test_unconfigured_model_is_explicit_not_empty_success(monkeypatch):
    monkeypatch.delenv("AEDES_DRONE_MODEL_PATH", raising=False)
    out = live_routes.live_detect(None, user("inspector"), frame("PNG"))
    assert out["data"]["status"] == "NOT_CONFIGURED"
    assert out["data"]["detections"] == []


def test_rejects_bad_image_and_oversize():
    bad = UploadFile(io.BytesIO(b"nope"), filename="x")
    with pytest.raises(HTTPException) as err:
        live_routes.live_detect(None, user("operator"), bad)
    assert err.value.status_code == 422
    big = UploadFile(io.BytesIO(b"0" * (live_routes.MAX_FRAME_BYTES + 5)), filename="x")
    with pytest.raises(HTTPException) as err:
        live_routes.live_detect(None, user("operator"), big)
    assert err.value.status_code == 413


def test_unknown_role_denied():
    with pytest.raises(HTTPException) as err:
        live_routes.live_detect(None, user("guest"), frame())
    assert err.value.status_code in (401, 403)


def test_checkpoint_digest_is_cached():
    with tempfile.TemporaryDirectory(
        dir=Path.cwd() / ".pytest_cache", ignore_cleanup_errors=True
    ) as d:
        ckpt = Path(d) / "w.pt"
        ckpt.write_bytes(b"abc")
        first = drone_inference._checkpoint_digest(str(ckpt))
        ckpt.write_bytes(b"changed")
        assert drone_inference._checkpoint_digest(str(ckpt)) == first
