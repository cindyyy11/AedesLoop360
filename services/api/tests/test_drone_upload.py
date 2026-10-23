import os
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import select

TEST_DIR = tempfile.TemporaryDirectory(dir=Path.cwd() / ".pytest_cache", ignore_cleanup_errors=True)
os.environ["AEDES_DATABASE_URL"] = "sqlite:///" + str(Path(TEST_DIR.name) / "upload.db")

from app import drone_inference  # noqa: E402
from app.db import Base, SessionLocal, now  # noqa: E402
from app.main import upload  # noqa: E402
from app.models import Asset, Block, Finding, Tenant, User  # noqa: E402
from app.seed import fixture_png  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def database():
    Base.metadata.create_all(SessionLocal.kw["bind"])
    with SessionLocal.begin() as db:
        db.add(Tenant(id="upload-tenant", name="Upload test"))
        db.flush()
        db.add(
            User(
                id="upload-operator",
                tenant_id="upload-tenant",
                username="upload-operator",
                password_hash="unused-test-hash",
                role="operator",
            )
        )
        db.add(
            Block(
                id="upload-block",
                tenant_id="upload-tenant",
                name="Fictional block",
                x=1,
                y=1,
            )
        )
        db.flush()
        db.add(
            Asset(
                id="upload-asset",
                tenant_id="upload-tenant",
                block_id="upload-block",
                name="Fictional asset",
                x=1,
                y=1,
            )
        )


def test_configured_detector_upload_persists_review_only_candidates(monkeypatch):
    monkeypatch.setattr(
        drone_inference,
        "infer_candidates",
        lambda _: drone_inference.InferenceResult(
            "DETECTED",
            "candidate@abc123",
            [drone_inference.CandidateDetection("tyre", [0.1, 0.2, 0.5, 0.6], 0.81)],
        ),
    )

    class MemoryUpload:
        filename = "detector-input.png"

        async def read(self, limit):
            return fixture_png("unique detector input")[:limit]

    with SessionLocal() as db:
        operator = db.get(User, "upload-operator")
        upload_file = MemoryUpload()
        pending = upload(
            db,
            operator,
            upload_file,
            "Operator supplied image with usage permission",
            now().isoformat(),
            "upload-asset",
        )
        # UploadFile is backed by BytesIO here, so its read coroutine completes eagerly
        # without network or threadpool work. This avoids Windows event-loop socket setup.
        try:
            pending.send(None)
        except StopIteration as completed:
            response = completed.value
        else:
            raise AssertionError("In-memory upload unexpectedly yielded asynchronous work")
        media_row = response["data"]
        finding = db.scalar(select(Finding).where(Finding.media_id == media_row["id"]))

    assert response["source_mode"] == "IMPORTED"
    assert media_row["adapter"] == "YOLO_LOCAL_V1:DETECTED"
    assert finding.object_class == "tyre"
    assert finding.confidence == 0.81
    assert finding.bbox == [0.1, 0.2, 0.5, 0.6]
    assert finding.model_version == "candidate@abc123"
    assert finding.mode == "IMPORTED"
    assert finding.water_state == "UNCERTAIN"
    assert "ground review" in finding.reason
