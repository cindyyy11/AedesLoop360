import json
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import egg_analysis
from .contracts import EggAnalysisRecord, Many, One, SampleRecord
from .db import session
from .egg_schemas import EggConfirmationInput
from .models import EggAnalysis, Trap, User
from .repository import get, record
from .security import current_user, require

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(session)]
Actor = Annotated[User, Depends(current_user)]
Key = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]


@router.post("/ovitraps/{trap_id}/egg-analyses", response_model=One[EggAnalysisRecord])
async def upload_egg_analysis(
    trap_id: str,
    db: DB,
    user: Actor,
    key: Key,
    file: UploadFile = File(),
    rights: str = Form(),
    captured_at: str = Form(),
    roi: str = Form(),
):
    require(user, "reviewer", "coordinator")
    get(db, Trap, trap_id, user)
    try:
        crop = json.loads(roi)
        if not isinstance(crop, list) or any(type(v) not in (int, float) for v in crop):
            raise ValueError()
        captured = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        raise HTTPException(
            422, "Use a JSON numeric ROI array and timezone-aware capture timestamp"
        )
    content = await file.read(5 * 1024 * 1024 + 1)
    row = egg_analysis.propose(db, user, trap_id, content, rights, captured, crop, key)
    db.commit()
    return {"data": record(row), "source_mode": "IMPORTED"}


@router.get("/ovitraps/{trap_id}/egg-analyses", response_model=Many[EggAnalysisRecord])
def list_egg_analyses(trap_id: str, db: DB, user: Actor):
    get(db, Trap, trap_id, user)
    analyses = db.scalars(
        select(EggAnalysis)
        .where(EggAnalysis.trap_id == trap_id, EggAnalysis.tenant_id == user.tenant_id)
        .order_by(EggAnalysis.created_at.desc(), EggAnalysis.id)
    ).all()
    return {"data": [record(row) for row in analyses], "source_mode": "IMPORTED"}


@router.post("/egg-analyses/{analysis_id}/confirm", response_model=One[SampleRecord])
def confirm_egg_analysis(
    analysis_id: str, body: EggConfirmationInput, db: DB, user: Actor, key: Key
):
    row = egg_analysis.confirm(db, user, analysis_id, body, key)
    db.commit()
    return {"data": record(row), "source_mode": "IMPORTED"}
