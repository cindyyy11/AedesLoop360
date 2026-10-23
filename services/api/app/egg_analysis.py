"""Persisted proposals; only explicit human confirmation creates a collection interval."""

import hashlib
import io
import math
from datetime import datetime

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import now
from .egg_schemas import EggConfirmationInput
from .models import EggAnalysis, Media, Sample, Trap, User
from .repository import audit, get, receipt, replay
from .schemas import SampleInput
from .security import require
from .surveillance import ingest


def propose(
    db: Session,
    user: User,
    trap_id: str,
    content: bytes,
    rights: str,
    captured_at: datetime,
    roi: list[float],
    key: str,
) -> EggAnalysis:
    require(user, "coordinator")
    return propose_from(db, user, trap_id, content, rights, captured_at, roi, key)


def propose_from(
    db: Session,
    user: User,
    trap_id: str,
    content: bytes,
    rights: str,
    captured_at: datetime,
    roi: list[float],
    key: str,
    *,
    source: str = "UPLOAD",
    capture_pass_id: str | None = None,
) -> EggAnalysis:
    """Validate, count and persist one photo. The caller enforces who may deliver it."""
    mode = "SIMULATED" if source == "DRONE_SIM" else "IMPORTED"
    get(db, Trap, trap_id, user)
    if not rights.strip() or len(rights) > 1000:
        raise HTTPException(422, "Declare image usage rights (1–1000 characters)")
    if (
        captured_at.tzinfo is None
        or captured_at.utcoffset().total_seconds() != 0
        or captured_at > now()
    ):
        raise HTTPException(422, "Use a past UTC capture timestamp")
    if (
        len(roi) != 4
        or not all(math.isfinite(v) and 0 <= v <= 1 for v in roi)
        or roi[0] >= roi[2]
        or roi[1] >= roi[3]
    ):
        raise HTTPException(422, "ROI must be normalized [left, top, right, bottom]")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, "Image exceeds 5 MB")
    try:
        image = Image.open(io.BytesIO(content))
        if image.format not in {"PNG", "JPEG"} or image.width * image.height > 16000000:
            raise ValueError()
        image.verify()
    except (ValueError, UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(422, "Use a valid PNG/JPEG of at most 16 megapixels")
    sha = hashlib.sha256(content).hexdigest()
    payload = {"sha256": sha, "rights": rights, "captured_at": captured_at.isoformat(), "roi": roi}
    if source != "UPLOAD":
        payload |= {"source": source, "capture_pass_id": capture_pass_id}
    scope = f"egg-analysis:{trap_id}"
    cached = replay(db, user, scope, key, payload)
    if cached:
        return get(db, EggAnalysis, cached, user)
    from .egg_vision import infer_egg_count

    result = infer_egg_count(content, roi)
    media = Media(
        tenant_id=user.tenant_id,
        mode=mode,
        sha256=sha,
        content=content,
        content_type="image/png" if image.format == "PNG" else "image/jpeg",
        rights=rights,
        captured_at=captured_at,
        uploader_id=user.id,
        adapter=f"EGG_COUNT_LOCAL_V1:{result.status}",
    )
    db.add(media)
    db.flush()
    analysis = EggAnalysis(
        tenant_id=user.tenant_id,
        mode=mode,
        source=source,
        capture_pass_id=capture_pass_id,
        trap_id=trap_id,
        media_id=media.id,
        roi=roi,
        status=result.status,
        proposed_count=result.estimate if result.status == "ESTIMATED" else None,
        model_version=result.model_version,
        reason=result.reason,
        details=result.details or {},
    )
    db.add(analysis)
    db.flush()
    receipt(db, user, scope, key, payload, analysis.id)
    audit(
        db,
        user,
        analysis.id,
        "EGG_ANALYSIS_PROPOSED",
        {
            "media_id": media.id,
            "model_version": result.model_version,
            "roi": roi,
            "status": result.status,
            "proposed_count": analysis.proposed_count,
            "mode": mode,
            "source": source,
            "capture_pass_id": capture_pass_id,
        },
    )
    return analysis


def confirm(
    db: Session, user: User, analysis_id: str, body: EggConfirmationInput, key: str
) -> Sample:
    require(user, "coordinator")
    analysis = get(db, EggAnalysis, analysis_id, user)
    analysis = db.scalar(
        select(EggAnalysis)
        .where(EggAnalysis.id == analysis.id, EggAnalysis.tenant_id == user.tenant_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    payload = body.model_dump(mode="json")
    scope = f"egg-confirm:{analysis_id}"
    cached = replay(db, user, scope, key, payload)
    if cached:
        return get(db, Sample, cached, user)
    if analysis.confirmed_sample_id:
        raise HTTPException(409, "Analysis already confirmed; use the original idempotency key")
    if analysis.status != "ESTIMATED" or analysis.proposed_count is None:
        raise HTTPException(422, "Only an estimated proposal may be confirmed")
    try:
        sample_body = SampleInput(
            **body.model_dump(exclude={"accepted_egg_count", "reason"}),
            egg_count=body.accepted_egg_count,
            media_id=analysis.media_id,
            mode=analysis.mode,
            source="DRONE_SIM_REVIEWED" if analysis.source == "DRONE_SIM" else "MODEL_ASSISTED_REVIEWED",
        )
    except ValidationError as error:
        raise HTTPException(422, str(error))
    sample = ingest(
        db, user, analysis.trap_id, sample_body, f"egg:{analysis_id}:{key}", reviewed=True
    )
    analysis.confirmed_sample_id = sample.id
    analysis.reviewer_id = user.id
    analysis.accepted_count = body.accepted_egg_count
    analysis.confirmation_reason = body.reason
    receipt(db, user, scope, key, payload, sample.id)
    audit(
        db,
        user,
        analysis.id,
        "EGG_ANALYSIS_CONFIRMED",
        {
            "sample_id": sample.id,
            "reviewer_id": user.id,
            "model_version": analysis.model_version,
            "proposed_count": analysis.proposed_count,
            "accepted_count": body.accepted_egg_count,
            "overridden": analysis.proposed_count != body.accepted_egg_count,
            "reason": body.reason,
            "mode": analysis.mode,
        },
    )
    return sample
