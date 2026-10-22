import hashlib
import io
import os
from datetime import datetime
from typing import Annotated

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import drone, planning
from .contracts import (
    One,
    Many,
    Summary,
    AssetRecord,
    SampleRecord,
    TrapRecord,
    FindingRecord,
    MissionRecord,
    EventRecord,
    MediaRecord,
    ObservationRecord,
    WorkRecord,
    JobRecord,
    AuditRecord,
    AllocationRecord,
    HistoryRecord,
)
from .db import now, session
from .models import (
    Allocation,
    Asset,
    Audit,
    AuthSession,
    Block,
    Finding,
    FollowUp,
    Job,
    Media,
    Mission,
    MissionEvent,
    Observation,
    Sample,
    Trap,
    User,
    WorkOrder,
)
from .repository import audit, get, receipt, record, replay, rows
from .schemas import (
    Decision,
    HealthResponse,
    ItemResponse,
    Login,
    LoginResponse,
    MissionInput,
    ObservationInput,
    PlanInput,
    ReviewInput,
    SampleInput,
    VerifyInput,
    WorkUpdate,
)
from .security import check_password, create_session, current_user, require
from .surveillance import effective_status, engineering_referral, ingest, summaries

app = FastAPI(title="AedesLoop 360", version="0.1.0")
DB = Annotated[Session, Depends(session)]
Actor = Annotated[User, Depends(current_user)]
Key = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]
P = "/api/v1"


@app.middleware("http")
async def origin_gate(request: Request, call_next):
    origin = request.headers.get("origin")
    if (
        request.method not in {"GET", "HEAD", "OPTIONS"}
        and origin
        and origin
        not in {
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            os.environ.get("AEDES_WEB_ORIGIN"),
        }
    ):
        return JSONResponse(
            {"code": "ORIGIN_DENIED", "message": "Origin not allowed"}, status_code=403
        )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(HTTPException)
async def http_error(request, error):
    return JSONResponse(
        {
            "code": str(error.status_code),
            "message": error.detail,
            "correlation_id": hashlib.sha256(str(now()).encode()).hexdigest()[:16],
        },
        status_code=error.status_code,
    )


@app.exception_handler(IntegrityError)
async def conflict(request, error):
    return JSONResponse(
        {
            "code": "CONFLICT",
            "message": "Concurrent or duplicate write; refresh and retry",
        },
        status_code=409,
    )


def item(row):
    return {"data": record(row), "source_mode": "SIMULATED"}


def collection(values):
    return {"data": [record(v) for v in values], "source_mode": "SIMULATED"}


@app.get(P + "/health", response_model=HealthResponse)
def health(db: DB):
    db.execute(text("SELECT 1"))
    return {"ready": True, "database": db.bind.dialect.name}


@app.post(P + "/auth/login", response_model=LoginResponse)
def login(body: Login, response: Response, db: DB):
    user = db.scalar(select(User).where(User.username == body.username))
    if not user or not check_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid local credentials")
    token = create_session(db, user)
    db.commit()
    response.set_cookie(
        "aedes_session",
        token,
        httponly=True,
        samesite="strict",
        secure=os.environ.get("AEDES_SECURE_COOKIES") == "1",
        max_age=28800,
    )
    return {"user": user.username, "role": user.role, "tenant_id": user.tenant_id}


@app.get(P + "/auth/me", response_model=LoginResponse)
def me(user: Actor):
    return {"user": user.username, "role": user.role, "tenant_id": user.tenant_id}


@app.post(P + "/auth/logout")
def logout(request: Request, response: Response, db: DB, user: Actor):
    token = request.cookies.get("aedes_session", "")
    auth = db.get(AuthSession, hashlib.sha256(token.encode()).hexdigest())
    if auth:
        db.delete(auth)
        db.commit()
    response.delete_cookie("aedes_session")
    return {"signed_out": True}


@app.get(P + "/blocks", response_model=Many[Summary])
def blocks(
    db: DB,
    user: Actor,
    start: datetime = PlanInput().window_start,
    end: datetime = PlanInput().window_end,
):
    if start.tzinfo is None or end.tzinfo is None or end <= start:
        raise HTTPException(422, "Use a positive timezone-aware window")
    return {"data": summaries(db, user, start, end), "source_mode": "SIMULATED"}


@app.get(P + "/assets", response_model=Many[AssetRecord])
def assets(db: DB, user: Actor):
    return collection(rows(db, Asset, user))


@app.get(P + "/assets/{entity_id}/history", response_model=One[HistoryRecord])
def history(entity_id: str, db: DB, user: Actor):
    asset = get(db, Asset, entity_id, user)
    return {
        "data": {
            **record(asset),
            "observations": [
                record(o) for o in rows(db, Observation, user) if o.asset_id == asset.id
            ],
            "work_orders": [record(w) for w in rows(db, WorkOrder, user) if w.asset_id == asset.id],
        },
        "source_mode": "SIMULATED",
    }


@app.get(P + "/findings", response_model=Many[FindingRecord])
def findings(db: DB, user: Actor):
    return {
        "data": [
            {
                **record(f),
                "eligibility": drone.eligibility(f, get(db, Asset, f.asset_id, user)),
            }
            for f in rows(db, Finding, user)
        ],
        "source_mode": "SIMULATED",
    }


@app.post(P + "/media", response_model=One[MediaRecord])
async def upload(
    db: DB,
    user: Actor,
    file: UploadFile = File(),
    rights: str = Form(min_length=5, max_length=1000),
    captured_at: str = Form(),
):
    require(user, "operator", "reviewer", "inspector", "coordinator")
    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, "Image exceeds 5 MB")
    try:
        image = Image.open(io.BytesIO(content))
        if image.format not in {"PNG", "JPEG"} or image.width * image.height > 16000000:
            raise ValueError()
        image.verify()
        captured = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
        if captured.tzinfo is None or captured > now():
            raise ValueError()
    except (ValueError, UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(422, "Use a valid PNG/JPEG and past timezone-aware capture timestamp")
    sha = hashlib.sha256(content).hexdigest()
    known = db.scalar(select(Media).where(Media.tenant_id == user.tenant_id, Media.sha256 == sha))
    adapter = (
        "DEMO_PREANNOTATED_V1"
        if known and known.adapter == "DEMO_PREANNOTATED_V1"
        else "UNSUPPORTED_GROUND_REVIEW"
    )
    row = Media(
        tenant_id=user.tenant_id,
        sha256=sha,
        content=content,
        content_type="image/png" if image.format == "PNG" else "image/jpeg",
        rights=rights,
        captured_at=captured,
        uploader_id=user.id,
        adapter=adapter,
    )
    db.add(row)
    db.flush()
    audit(db, user, row.id, "MEDIA_IMPORTED", {"sha256": sha, "adapter": adapter})
    db.commit()
    return item(row)


@app.get(P + "/media/{entity_id}")
def media(entity_id: str, db: DB, user: Actor):
    row = get(db, Media, entity_id, user)
    return Response(
        row.content,
        media_type=row.content_type,
        headers={"Content-Disposition": "inline", "Cache-Control": "private, no-store"},
    )


@app.get(P + "/ovitraps", response_model=Many[TrapRecord])
def traps(db: DB, user: Actor):
    return {
        "data": [
            {**record(t), "effective_status": effective_status(t)} for t in rows(db, Trap, user)
        ],
        "source_mode": "SIMULATED",
    }


@app.get(P + "/ovitraps/{entity_id}/samples", response_model=Many[SampleRecord])
def samples(entity_id: str, db: DB, user: Actor):
    get(db, Trap, entity_id, user)
    return collection([s for s in rows(db, Sample, user) if s.trap_id == entity_id])


@app.post(P + "/ovitraps/{entity_id}/samples", response_model=One[SampleRecord])
def import_sample(entity_id: str, body: SampleInput, db: DB, user: Actor, key: Key):
    require(user, "reviewer", "coordinator")
    row = ingest(db, user, entity_id, body, key)
    db.commit()
    return item(row)


@app.get(P + "/drones/missions", response_model=Many[MissionRecord])
def missions(db: DB, user: Actor):
    return collection(rows(db, Mission, user))


@app.post(P + "/drones/missions", response_model=One[MissionRecord])
def create_mission(body: MissionInput, db: DB, user: Actor):
    require(user, "operator", "coordinator")
    get(db, Block, body.block_id, user)
    row = drone.create(db, user, body)
    db.commit()
    return item(row)


@app.post(P + "/drones/missions/{entity_id}/review", response_model=One[MissionRecord])
def review_mission(entity_id: str, db: DB, user: Actor):
    require(user, "operator", "coordinator")
    row = get(db, Mission, entity_id, user)
    if row.status != "DRAFT":
        raise HTTPException(409, "Only draft missions can be submitted")
    row.status = "READY_FOR_REVIEW"
    audit(db, user, row.id, "MISSION_SUBMITTED")
    db.commit()
    return item(row)


@app.post(P + "/drones/missions/{entity_id}/decision", response_model=One[MissionRecord])
def decide_mission(entity_id: str, body: Decision, db: DB, user: Actor):
    require(user, "coordinator")
    row = get(db, Mission, entity_id, user)
    drone.decide(db, user, row, body)
    db.commit()
    return item(row)


@app.post(P + "/drones/missions/{entity_id}/simulate", response_model=One[MissionRecord])
def simulate_mission(entity_id: str, db: DB, user: Actor, key: Key):
    require(user, "operator")
    row = get(db, Mission, entity_id, user)
    drone.simulate(db, user, row, key)
    db.commit()
    return item(row)


@app.post(P + "/drones/missions/{entity_id}/abort", response_model=One[MissionRecord])
def abort_mission(entity_id: str, db: DB, user: Actor):
    require(user, "operator")
    row = db.scalar(select(Mission).where(Mission.id == entity_id).with_for_update())
    if not row or row.tenant_id != user.tenant_id:
        raise HTTPException(403, "Mission access denied")
    if row.status not in {"APPROVED", "SIMULATING"}:
        raise HTTPException(409, "Mission is not abortable")
    row.status = "ABORTED"
    db.add(
        MissionEvent(
            tenant_id=user.tenant_id,
            mission_id=row.id,
            event_key="abort",
            kind="ABORTED",
            payload={"remaining_targets": "UNVISITED"},
        )
    )
    audit(db, user, row.id, "MISSION_ABORTED")
    db.commit()
    return item(row)


@app.get(P + "/drones/missions/{entity_id}/events", response_model=Many[EventRecord])
def mission_events(entity_id: str, db: DB, user: Actor):
    get(db, Mission, entity_id, user)
    return collection(
        list(
            db.scalars(
                select(MissionEvent)
                .where(MissionEvent.mission_id == entity_id)
                .order_by(MissionEvent.created_at, MissionEvent.event_key)
            )
        )
    )


@app.get(P + "/jobs", response_model=Many[JobRecord])
def jobs(db: DB, user: Actor):
    return collection(rows(db, Job, user))


@app.post(P + "/planning/runs", response_model=One[AllocationRecord])
def create_plan(body: PlanInput, db: DB, user: Actor):
    require(user, "coordinator")
    row = planning.allocate(db, user, body)
    db.commit()
    return item(row)


@app.get(P + "/planning/runs", response_model=Many[AllocationRecord])
def plans(db: DB, user: Actor):
    return collection(sorted(rows(db, Allocation, user), key=lambda r: r.created_at, reverse=True))


@app.post(P + "/planning/runs/{entity_id}/approve", response_model=One[AllocationRecord])
def approve_plan(entity_id: str, db: DB, user: Actor):
    require(user, "coordinator")
    row = get(db, Allocation, entity_id, user)
    planning.approve(db, user, row)
    db.commit()
    return item(row)


@app.post(P + "/inspections", response_model=One[ObservationRecord])
def observation(body: ObservationInput, db: DB, user: Actor, key: Key):
    require(user, "inspector")
    get(db, Asset, body.asset_id, user)
    get(db, Media, body.media_id, user)
    payload = body.model_dump(mode="json")
    cached = replay(db, user, "observation", key, payload)
    if cached:
        return item(get(db, Observation, cached, user))
    if body.observed_at > now():
        raise HTTPException(422, "Observation cannot be in the future")
    row = Observation(tenant_id=user.tenant_id, **body.model_dump())
    db.add(row)
    db.flush()
    receipt(db, user, "observation", key, payload, row.id)
    audit(db, user, row.id, "OBSERVATION_SUBMITTED")
    db.commit()
    return item(row)


@app.get(P + "/inspections", response_model=Many[ObservationRecord])
def observations(db: DB, user: Actor):
    return collection(rows(db, Observation, user))


@app.post(P + "/inspections/{entity_id}/review", response_model=One[ObservationRecord])
def review_observation(entity_id: str, body: ReviewInput, db: DB, user: Actor):
    require(user, "reviewer")
    row = get(db, Observation, entity_id, user)
    if row.review_status != "NEEDS_REVIEW":
        raise HTTPException(409, "Observation already reviewed")
    row.review_status = "CONFIRMED" if body.confirmed else "REJECTED"
    row.reviewer_id = user.id
    db.flush()
    if body.confirmed:
        engineering_referral(db, user, row.asset_id)
    audit(db, user, row.id, "OBSERVATION_REVIEWED", body.model_dump())
    db.commit()
    return item(row)


@app.post(P + "/assets/{entity_id}/recurrence", response_model=ItemResponse)
def recurrence(entity_id: str, db: DB, user: Actor):
    require(user, "reviewer", "coordinator")
    result = engineering_referral(db, user, entity_id)
    db.commit()
    return (
        item(result)
        if result
        else {
            "data": {"id": entity_id, "status": "INSUFFICIENT_VERIFIED_RECURRENCE"},
            "source_mode": "SIMULATED",
        }
    )


@app.get(P + "/work-orders", response_model=Many[WorkRecord])
def work_orders(db: DB, user: Actor):
    return collection(rows(db, WorkOrder, user))


@app.patch(P + "/work-orders/{entity_id}", response_model=One[WorkRecord])
def update_work(entity_id: str, body: WorkUpdate, db: DB, user: Actor):
    row = get(db, WorkOrder, entity_id, user)
    if body.action == "ASSIGN":
        require(user, "coordinator")
        if row.status not in {"OPEN", "REOPENED"}:
            raise HTTPException(409, "Only open work can be assigned")
        assignee = db.get(User, body.assignee_id)
        if not assignee or assignee.tenant_id != user.tenant_id or assignee.role != "inspector":
            raise HTTPException(422, "Choose a tenant inspector")
        row.assigned_to, row.status = assignee.id, "ASSIGNED"
    else:
        require(user, "inspector")
        if row.assigned_to != user.id:
            raise HTTPException(403, "Only the assigned inspector can perform work")
        expected = "ASSIGNED" if body.action == "START" else "IN_PROGRESS"
        if row.status != expected:
            raise HTTPException(409, "Invalid work transition")
        row.status = (
            "IN_PROGRESS" if body.action == "START" else "ACTION_COMPLETED_PENDING_VERIFICATION"
        )
        if body.action == "COMPLETE":
            get(db, Media, body.evidence_id, user)
            row.completed_by, row.evidence_id = user.id, body.evidence_id
    audit(db, user, row.id, "WORK_" + body.action, body.model_dump())
    db.commit()
    return item(row)


@app.post(P + "/work-orders/{entity_id}/verify", response_model=One[WorkRecord])
def verify_work(entity_id: str, body: VerifyInput, db: DB, user: Actor):
    require(user, "reviewer")
    row = get(db, WorkOrder, entity_id, user)
    get(db, Media, body.evidence_id, user)
    if row.status != "ACTION_COMPLETED_PENDING_VERIFICATION" or row.completed_by == user.id:
        raise HTTPException(409, "Independent review of completed work required")
    row.status = body.result
    db.add(
        FollowUp(
            tenant_id=user.tenant_id,
            work_order_id=row.id,
            reviewer_id=user.id,
            evidence_id=body.evidence_id,
            result=body.result,
        )
    )
    if body.result == "VERIFIED_RESOLVED" and row.asset_id:
        for o in rows(db, Observation, user):
            if o.asset_id == row.asset_id:
                o.resolved = True
    audit(db, user, row.id, "FOLLOW_UP_RECORDED", body.model_dump())
    db.commit()
    return item(row)


@app.get(P + "/audit", response_model=Many[AuditRecord])
def audits(db: DB, user: Actor):
    require(user, "coordinator", "admin")
    return collection(sorted(rows(db, Audit, user), key=lambda r: r.created_at, reverse=True)[:200])
