import json
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import drone_capture, egg_analysis
from .contracts import EggAnalysisRecord, Many, One, SampleRecord, TrapPassResult
from .db import session
from .egg_schemas import EggConfirmationInput, TrapPassInput
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
    require(user, "coordinator")
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


@router.get("/egg-analyses/inbox", response_model=Many[EggAnalysisRecord])
def egg_analysis_inbox(db: DB, user: Actor):
    """Proposals still waiting for a human decision, across all traps."""
    rows = db.scalars(
        select(EggAnalysis)
        .where(EggAnalysis.tenant_id == user.tenant_id, EggAnalysis.confirmed_sample_id.is_(None))
        .order_by(EggAnalysis.created_at.desc(), EggAnalysis.id)
        .limit(50)
    ).all()
    mixed = {row.mode for row in rows} != {"IMPORTED"} and bool(rows)
    return {"data": [record(row) for row in rows], "source_mode": "SIMULATED" if mixed else "IMPORTED"}


@router.post("/drones/trap-passes", response_model=One[TrapPassResult])
def simulate_trap_pass(body: TrapPassInput, db: DB, user: Actor, key: Key):
    pass_id, analyses, skipped = drone_capture.run_pass(db, user, body.trap_ids, key)
    db.commit()
    return {
        "data": {"pass_id": pass_id, "analyses": [record(a) for a in analyses], "skipped": skipped},
        "source_mode": "SIMULATED",
    }
