import hashlib
import io
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated

from alembic import command
from alembic.config import Config
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

from . import drone, drone_inference, model_warmup, planning
from . import allocation_benchmark, data_analytics
from .contracts import (
    One,
    Many,
    Summary,
    AssetRecord,
    SampleRecord,
    SampleRevisionRecord,
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
    AnalyticsRunRecord,
    ModelEvaluations,
    BlockSurveillanceAnalytics,
    LatestBenchmark,
    AnalyticsMany,
)
from .db import now, session
from .models import (
    Allocation,
    Asset,
    Audit,
    AnalyticsRun,
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
    SampleRevision,
    Trap,
    User,
    WorkOrder,
)
from .repository import audit, get, receipt, record, replay, rows
from .schemas import (
    Decision,
    FindingReviewInput,
    HealthResponse,
    ItemResponse,
    Login,
    LoginResponse,
    MissionInput,
    ObservationInput,
    PlanInput,
    ReviewInput,
    SampleInput,
    SampleRevisionInput,
    VerifyInput,
    WorkUpdate,
)
from .security import check_password, create_session, current_user, require
from .surveillance import effective_status, engineering_referral, ingest, summaries
from .egg_routes import router as egg_router
from .live_routes import router as live_router
from .seed import seed as seed_demo


def _origin_allowed(origin: str | None) -> bool:
    if not origin:
        return True
    allowed = {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.environ.get("AEDES_WEB_ORIGIN") or "",
    }
    for extra in (os.environ.get("AEDES_WEB_ORIGINS") or "").split(","):
        if extra.strip():
            allowed.add(extra.strip())
    if origin in allowed:
        return True
    # Preview deployments share *.vercel.app; enable explicitly for the hosted demo.
    if os.environ.get("AEDES_ALLOW_VERCEL_APP_ORIGINS", "0") == "1":
        return origin.startswith("https://") and origin.endswith(".vercel.app")
    return False


def _migrate_and_seed() -> None:
    """Idempotent bootstrap for serverless /tmp SQLite or a configured Postgres URL."""
    if os.environ.get("AEDES_AUTO_MIGRATE", "1") != "1":
        return
    # migrations/env.py uses app.db.engine, which already respects AEDES_DATABASE_URL / Vercel /tmp.
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    if os.environ.get("AEDES_SEED_DEMO", "1") == "1":
        seed_demo()


@asynccontextmanager
async def lifespan(_: FastAPI):
    _migrate_and_seed()
    model_warmup.start_background_warmup()
    yield


app = FastAPI(title="AedesLoop 360", version="0.1.0", lifespan=lifespan)
app.include_router(egg_router)
app.include_router(live_router)
DB = Annotated[Session, Depends(session)]
Actor = Annotated[User, Depends(current_user)]
Key = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]
P = "/api/v1"


@app.middleware("http")
async def origin_gate(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and not _origin_allowed(origin):
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
    return {
        "ready": True,
        "database": db.bind.dialect.name,
        "models": model_warmup.model_state(),
    }


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


@app.get(P + "/analytics/evaluations", response_model=ModelEvaluations)
def analytics_evaluations(db: DB, user: Actor):
    return data_analytics.evaluation_cards(db, user)


@app.get(P + "/analytics/surveillance", response_model=AnalyticsMany[BlockSurveillanceAnalytics])
def analytics_surveillance(
    db: DB,
    user: Actor,
    start: datetime = PlanInput().window_start,
    end: datetime = PlanInput().window_end,
):
    if start.tzinfo is None or end.tzinfo is None or end <= start:
        raise HTTPException(422, "Use a positive timezone-aware window")
    values = data_analytics.surveillance_analytics(db, user, start, end)
    modes = {mode for block in values for mode in block["source_modes"]}
    source_mode = next(iter(modes)) if len(modes) == 1 else "MIXED_OR_NO_SAMPLES"
    return {"data": values, "source_mode": source_mode}


@app.get(P + "/analytics/allocation-benchmark", response_model=LatestBenchmark)
def analytics_allocation_benchmark(db: DB, user: Actor):
    return {"data": data_analytics.latest_benchmark(db, user)}


@app.post(P + "/analytics/allocation-benchmark", response_model=One[AnalyticsRunRecord])
def run_allocation_benchmark(db: DB, user: Actor, key: Key):
    require(user, "coordinator")
    payload = {"scenario_id": "four-block-allocation-v1", "seed": 0}
    cached = replay(db, user, "allocation-benchmark", key, payload)
    if cached:
        return item(get(db, AnalyticsRun, cached, user))
    output = allocation_benchmark.benchmark()
    from .repository import digest

    run_hash = digest(output)[:12]
    run = AnalyticsRun(
        tenant_id=user.tenant_id,
        mode="SIMULATED",
        run_id=f"allocation-benchmark-{run_hash}",
        run_type="ALLOCATION_BENCHMARK",
        status="COMPLETED",
        source_mode="SIMULATED",
        run_metadata={"scenario_id": output["results"][0]["scenario_id"], "seed": 0},
        metrics=output,
        artifacts=[],
        limitations=[
            "SIMULATED EXPERIMENT only; scripted scenario task coverage is not field or biological evidence."
        ],
        initiated_by=user.id,
    )
    db.add(run)
    db.flush()
    receipt(db, user, "allocation-benchmark", key, payload, run.id)
    audit(db, user, run.id, "ALLOCATION_BENCHMARK_COMPLETED", {"run_id": run.run_id})
    db.commit()
    return item(run)


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


@app.post(P + "/findings/{entity_id}/review", response_model=One[FindingRecord])
def review_finding(entity_id: str, body: FindingReviewInput, db: DB, user: Actor):
    require(user, "coordinator")
    row = get(db, Finding, entity_id, user)
    before = {"water_state": row.water_state, "review_status": row.review_status}
    if body.decision == "RELABEL":
        # A relabel can change what an approved mission would do, so it may not
        # touch a target held by a mission awaiting review, approved or running.
        live = {"READY_FOR_REVIEW", "APPROVED", "SIMULATING"}
        if any(m.status in live and row.id in m.target_ids for m in rows(db, Mission, user)):
            raise HTTPException(409, "Finding is in an active mission; abort or complete it first")
        row.water_state = body.water_state
    row.review_status = {"CONFIRM": "CONFIRMED", "REJECT": "REJECTED", "RELABEL": "RELABELLED"}[
        body.decision
    ]
    row.reviewed_by = user.id
    row.reviewed_at = now()
    row.review_note = body.reason
    db.flush()
    audit(db, user, row.id, "FINDING_REVIEWED", {**body.model_dump(), "before": before})
    db.commit()
    return {
        "data": {
            **record(row),
            "eligibility": drone.eligibility(row, get(db, Asset, row.asset_id, user)),
        },
        "source_mode": "SIMULATED",
    }


@app.post(P + "/media", response_model=One[MediaRecord])
async def upload(
    db: DB,
    user: Actor,
    file: UploadFile = File(),
    rights: str = Form(min_length=5, max_length=1000),
    captured_at: str = Form(),
    asset_id: str = Form(),
):
    require(user, "operator", "coordinator")
    asset = get(db, Asset, asset_id, user)
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
    original_finding = (
        db.scalar(
            select(Finding).where(
                Finding.tenant_id == user.tenant_id,
                Finding.media_id == known.id,
                Finding.asset_id == asset.id,
            )
        )
        if known and known.adapter == "DEMO_PREANNOTATED_V1"
        else None
    )
    inference = None if original_finding else drone_inference.infer_candidates(content)
    adapter = "DEMO_PREANNOTATED_V1" if original_finding else f"YOLO_LOCAL_V1:{inference.status}"
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
    if original_finding:
        finding = Finding(
            tenant_id=user.tenant_id,
            asset_id=asset.id,
            media_id=row.id,
            water_state=original_finding.water_state,
            object_class=original_finding.object_class,
            bbox=original_finding.bbox,
            confidence=original_finding.confidence,
            model_version="DEMO_PREANNOTATED_V1",
            reason="Exact synthetic fixture match; copied human-authored annotation, not model inference",
        )
        db.add(finding)
        db.flush()
        audit(db, user, finding.id, "FIXTURE_ANNOTATION_LINKED", {"media_id": row.id})
    elif inference and inference.detections:
        for detection in inference.detections:
            finding = Finding(
                tenant_id=user.tenant_id,
                asset_id=asset.id,
                media_id=row.id,
                water_state="UNCERTAIN",
                object_class=detection.object_class,
                bbox=detection.bbox,
                confidence=detection.confidence,
                model_version=inference.model_version or "LOCAL_MODEL_UNKNOWN",
                mode="IMPORTED",
                reason=(
                    "Model detected a candidate container; water and breeding status are "
                    "unconfirmed and require ground review"
                ),
            )
            db.add(finding)
            db.flush()
            audit(
                db,
                user,
                finding.id,
                "MODEL_CANDIDATE_RECORDED",
                {"media_id": row.id, "model_version": finding.model_version},
            )
    else:
        inference_reason = inference.reason if inference else None
        no_detection = inference and inference.status == "NO_DETECTIONS"
        finding = Finding(
            tenant_id=user.tenant_id,
            asset_id=asset.id,
            media_id=row.id,
            water_state="UNCERTAIN",
            object_class="candidate_container",
            bbox=[0.0, 0.0, 1.0, 1.0],
            confidence=None,
            model_version=(
                inference.model_version
                if inference and inference.model_version
                else "UNSUPPORTED_GROUND_REVIEW"
            ),
            mode="IMPORTED",
            reason=(
                "Configured model returned no candidate; inspect image before ruling out a "
                "container"
                if no_detection
                else inference_reason
                or "No evaluated detector is installed; inspect the whole image at the selected asset"
            ),
        )
        db.add(finding)
        db.flush()
        audit(db, user, finding.id, "UNCERTAIN_UPLOAD_QUEUED", {"media_id": row.id})
    db.commit()
    return {
        "data": record(row),
        "source_mode": "SIMULATED" if original_finding else "IMPORTED",
    }


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
    require(user, "coordinator")
    row = ingest(db, user, entity_id, body, key)
    db.commit()
    return item(row)


@app.get(P + "/samples/{entity_id}/revisions", response_model=Many[SampleRevisionRecord])
def sample_revisions(entity_id: str, db: DB, user: Actor):
    get(db, Sample, entity_id, user)
    values = db.scalars(
        select(SampleRevision)
        .where(SampleRevision.sample_id == entity_id, SampleRevision.tenant_id == user.tenant_id)
        .order_by(SampleRevision.created_at, SampleRevision.id)
    )
    return collection(values)


@app.post(P + "/samples/{entity_id}/revisions", response_model=One[SampleRevisionRecord])
def revise_sample(entity_id: str, body: SampleRevisionInput, db: DB, user: Actor, key: Key):
    require(user, "coordinator")
    sample = db.scalar(
        select(Sample)
        .where(Sample.id == entity_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if sample is None:
        raise HTTPException(404, "Record not found")
    if sample.tenant_id != user.tenant_id:
        raise HTTPException(403, "Record belongs to another tenant")
    payload = body.model_dump(mode="json")
    cached = replay(db, user, f"sample-revision:{entity_id}", key, payload)
    if cached:
        return item(get(db, SampleRevision, cached, user))
    if body.corrected_egg_count == sample.egg_count and body.media_id == sample.media_id:
        raise HTTPException(422, "Revision must correct the count or replace its evidence")
    media = get(db, Media, body.media_id, user)
    if media.mode != sample.mode:
        raise HTTPException(422, "Correction evidence and sample modes must match")
    trap = get(db, Trap, sample.trap_id, user)
    revision = SampleRevision(
        tenant_id=user.tenant_id,
        sample_id=sample.id,
        reviewer_id=user.id,
        previous_egg_count=sample.egg_count,
        corrected_egg_count=body.corrected_egg_count,
        media_id=media.id,
        reason=body.reason,
    )
    db.add(revision)
    sample.egg_count = body.corrected_egg_count
    sample.media_id = media.id
    sample.quality = body.quality
    sample.validity = (
        "VALID" if body.quality == "GOOD" and effective_status(trap) == "ACTIVE" else "INVALID"
    )
    db.flush()
    receipt(db, user, f"sample-revision:{entity_id}", key, payload, revision.id)
    audit(
        db,
        user,
        sample.id,
        "SAMPLE_COUNT_REVISED",
        {"revision_id": revision.id, **payload, "previous_egg_count": revision.previous_egg_count},
    )
    db.commit()
    return item(revision)


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
    if user.role != "coordinator":
        audit(db, user, entity_id, "MISSION_DECISION_DENIED_ROLE", {"role": user.role})
        db.commit()
        raise HTTPException(403, "Coordinator role required")
    row = get(db, Mission, entity_id, user)
    drone.decide(db, user, row, body)
    db.commit()
    return item(row)


@app.post(P + "/drones/missions/{entity_id}/simulate", response_model=One[MissionRecord])
def simulate_mission(entity_id: str, db: DB, user: Actor, key: Key):
    require(user, "operator")
    row = get(db, Mission, entity_id, user)
    try:
        drone.simulate(db, user, row, key)
    except HTTPException as error:
        if error.status_code == 409:
            audit(db, user, row.id, "SIMULATION_DENIED", {"reason": error.detail})
            db.commit()
        raise
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
    require(user, "operator")
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
    require(user, "coordinator")
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
    require(user, "coordinator")
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
        if not assignee or assignee.tenant_id != user.tenant_id or assignee.role != "operator":
            raise HTTPException(422, "Choose a tenant field operator")
        row.assigned_to, row.status = assignee.id, "ASSIGNED"
    else:
        require(user, "operator")
        if row.assigned_to != user.id:
            raise HTTPException(403, "Only the assigned field operator can perform work")
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
    require(user, "coordinator")
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
    require(user, "coordinator")
    return collection(sorted(rows(db, Audit, user), key=lambda r: r.created_at, reverse=True)[:200])
