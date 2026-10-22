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


AssetRecord = entity(models.Asset)
SampleRecord = entity(models.Sample)
TrapRecord = entity(models.Trap, effective_status=(str, ...))
FindingRecord = entity(models.Finding, eligibility=(str, ...))
MissionRecord = entity(models.Mission)
EventRecord = entity(models.MissionEvent)
MediaRecord = entity(models.Media)
ObservationRecord = entity(models.Observation)
WorkRecord = entity(models.WorkOrder)
JobRecord = entity(models.Job)
AuditRecord = entity(models.Audit)


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
