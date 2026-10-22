"""Response schemas owned by the API, including persisted column types."""

from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, create_model
from sqlalchemy import JSON

from . import models

T = TypeVar("T")


class One(BaseModel, Generic[T]):
    data: T
    source_mode: Literal["SIMULATED"] = "SIMULATED"


class Many(BaseModel, Generic[T]):
    data: list[T]
    source_mode: Literal["SIMULATED"] = "SIMULATED"


class AnalyticsMany(BaseModel, Generic[T]):
    data: list[T]
    source_mode: str


def entity(model, **extra):
    fields = {}
    for column in model.__table__.columns:
        if column.name in {"content", "password_hash", "digest"}:
            continue
        value_type = dict[str, Any] if isinstance(column.type, JSON) else column.type.python_type
        if column.name in {"target_ids", "bbox"}:
            value_type = list[str] if column.name == "target_ids" else list[float]
        if column.nullable:
            value_type = value_type | None
        fields[column.name] = (value_type, ...)
    return create_model(
        model.__name__ + "Record", __config__=ConfigDict(from_attributes=True), **fields, **extra
    )


class Summary(BaseModel):
    id: str
    name: str
    x: float
    y: float
    mode: str
    status: str
    valid_intervals: int
    expected_intervals: int
    eggs_per_interval: float | None
    positivity: float | None
    sample_ids: list[str]
    observation_ids: list[str]
    unresolved_sources: int
    unavailable_traps: list[str]
    excluded_samples: list[str]
    interval_days: float
    uncertainty: str
    comparability_warning: str | None = None


AssetRecord = entity(models.Asset)
SampleRecord = entity(models.Sample)
SampleRevisionRecord = entity(models.SampleRevision)
TrapRecord = entity(models.Trap, effective_status=(str, ...))
FindingRecord = entity(models.Finding, eligibility=(str, ...))
MissionRecord = entity(models.Mission)
EventRecord = entity(models.MissionEvent)
MediaRecord = entity(models.Media)
ObservationRecord = entity(models.Observation)
WorkRecord = entity(models.WorkOrder)
JobRecord = entity(models.Job)
AuditRecord = entity(models.Audit)
class AnalyticsRunRecord(BaseModel):
    id: str
    tenant_id: str
    mode: str
    created_at: datetime
    run_id: str
    run_type: str
    status: str
    source_mode: str
    run_metadata: dict[str, Any]
    metrics: dict[str, Any] | None
    artifacts: list[str]
    limitations: list[str]
    initiated_by: str | None


class ModelEvaluationCard(BaseModel):
    run_type: str
    status: str
    reason: str | None = None
    latest_completed_run: AnalyticsRunRecord | None = None


class ModelEvaluations(BaseModel):
    drone_detection: ModelEvaluationCard
    ovitrap_count: ModelEvaluationCard


class SurveillancePoint(BaseModel):
    interval_start: datetime
    interval_end: datetime
    interval_days: float
    egg_sum: int | None
    eggs_per_valid_trap_interval: float | None
    positive_intervals: int | None
    valid_trap_intervals: int
    expected_trap_intervals: int
    invalid_intervals: int
    completeness: float | None
    status: str
    sample_ids: list[str]
    sources: list[str]
    source_modes: list[str]
    quality_states: list[str]
    latest_collected_at: datetime | None
    latest_uploaded_at: datetime | None


class BlockSurveillanceAnalytics(BaseModel):
    block_id: str
    block_name: str
    status: str
    valid_trap_intervals: int
    expected_trap_intervals: int
    invalid_intervals: int
    completeness: float | None
    egg_sum: int | None
    eggs_per_valid_trap_interval: float | None
    positivity: float | None
    unavailable_traps: list[str]
    sources: list[str]
    source_modes: list[str]
    interval_days_included: list[float]
    comparability_warning: str | None
    series: list[SurveillancePoint]


class LatestBenchmark(BaseModel):
    data: AnalyticsRunRecord | None
    source_mode: str = "SIMULATED EXPERIMENT"


class Priority(Summary):
    score: float
    reasons: list[str]
    evidence_ids: list[str]


class Task(BaseModel):
    id: str
    block_id: str
    kind: str
    hours: float
    reason: str
    evidence_ids: list[str] = []


class BudgetUsed(BaseModel):
    staff_hours: float
    drone_survey_hours: float


class PlanResult(BaseModel):
    block_priorities: list[Priority]
    recommended_tasks: list[Task]
    excluded_tasks: list[dict[str, str]]
    budget_used: BudgetUsed
    coverage_guardrail: bool
    assumptions: str


class AllocationRecord(BaseModel):
    id: str
    tenant_id: str
    mode: str
    created_at: datetime
    evidence_snapshot_hash: str
    snapshot: dict[str, Any]
    result: PlanResult
    policy_version: str
    status: str


HistoryRecord = create_model(
    "HistoryRecord",
    __base__=AssetRecord,
    observations=(list[ObservationRecord], ...),
    work_orders=(list[WorkRecord], ...),
)
