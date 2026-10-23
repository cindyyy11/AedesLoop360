from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(Input):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class SampleInput(Input):
    source_sample_id: str = Field(min_length=1, max_length=100)
    substrate_id: str = Field(min_length=1, max_length=100)
    interval_start: AwareDatetime
    interval_end: AwareDatetime
    collected_at: AwareDatetime
    sampling_effort_days: float = Field(gt=0, le=31)
    egg_count: int = Field(ge=0, le=10000)
    media_id: str
    quality: Literal["GOOD", "BLURRED", "OCCLUDED"] = "GOOD"
    source: Literal["HUMAN_LABELLED_FIXTURE", "MODEL_ASSISTED_REVIEWED"] = "HUMAN_LABELLED_FIXTURE"
    mode: Literal["SIMULATED", "IMPORTED"] = "SIMULATED"

    @model_validator(mode="after")
    def interval(self):
        if (self.source == "HUMAN_LABELLED_FIXTURE") != (self.mode == "SIMULATED"):
            raise ValueError("Fixture evidence must be simulated; reviewed imports must be imported")
        days = (self.interval_end - self.interval_start).total_seconds() / 86400
        if days <= 0 or abs(days - self.sampling_effort_days) > 0.01:
            raise ValueError("Sampling effort must match a positive collection interval")
        if self.collected_at < self.interval_end:
            raise ValueError("Collection must follow the interval")
        return self


class SampleRevisionInput(Input):
    corrected_egg_count: int = Field(ge=0, le=10000)
    media_id: str
    reason: str = Field(min_length=8, max_length=1000)
    quality: Literal["GOOD", "BLURRED", "OCCLUDED"] = "GOOD"


class MissionInput(Input):
    block_id: str
    target_ids: list[str] = Field(min_length=1, max_length=20)
    mode: Literal["SIMULATED"] = "SIMULATED"


class Decision(Input):
    decision: Literal["APPROVE", "REJECT"]
    reason: str = Field(min_length=8, max_length=1000)
    checked_items: list[str]


class Budget(Input):
    staff_hours: float = Field(ge=4, le=100)
    drone_survey_hours: float = Field(ge=0, le=10)


class PlanInput(Input):
    budget: Budget = Budget(staff_hours=12, drone_survey_hours=2)
    window_start: AwareDatetime = datetime.fromisoformat("2026-10-16T00:00:00+00:00")
    window_end: AwareDatetime = datetime.fromisoformat("2026-10-23T00:00:00+00:00")

    @model_validator(mode="after")
    def window(self):
        if self.window_end <= self.window_start:
            raise ValueError("Window must be positive")
        return self


class ObservationInput(Input):
    asset_id: str
    observed_at: AwareDatetime
    water_state: Literal["DRY", "VISIBLE_WATER", "OCCLUDED"]
    media_id: str


class ReviewInput(Input):
    confirmed: bool
    reason: str = Field(min_length=8, max_length=1000)


class FindingReviewInput(Input):
    decision: Literal["CONFIRM", "REJECT", "RELABEL"]
    reason: str = Field(min_length=8, max_length=1000)
    water_state: Literal["DRY", "VISIBLE_WATER", "OCCLUDED"] | None = None

    @model_validator(mode="after")
    def relabel_needs_state(self):
        if (self.decision == "RELABEL") != (self.water_state is not None):
            raise ValueError("water_state is required for RELABEL and only allowed with it")
        return self


class WorkUpdate(Input):
    action: Literal["ASSIGN", "START", "COMPLETE"]
    assignee_id: str | None = None
    evidence_id: str | None = None


class VerifyInput(Input):
    result: Literal["VERIFIED_RESOLVED", "REOPENED"]
    evidence_id: str
    reason: str = Field(min_length=8, max_length=1000)


class Record(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str


class ListResponse(BaseModel):
    data: list[Record]
    source_mode: Literal["SIMULATED"] = "SIMULATED"


class ItemResponse(BaseModel):
    data: Record
    source_mode: Literal["SIMULATED"] = "SIMULATED"


class LoginResponse(BaseModel):
    user: str
    role: str
    tenant_id: str


class HealthResponse(BaseModel):
    ready: bool
    database: str
