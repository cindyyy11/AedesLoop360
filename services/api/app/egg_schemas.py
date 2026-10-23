from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from .schemas import Input


class TrapPassInput(Input):
    trap_ids: list[str] = Field(min_length=1, max_length=8)


class EggConfirmationInput(Input):
    source_sample_id: str = Field(min_length=1, max_length=100)
    substrate_id: str = Field(min_length=1, max_length=100)
    interval_start: AwareDatetime
    interval_end: AwareDatetime
    collected_at: AwareDatetime
    sampling_effort_days: float = Field(gt=0, le=31)
    quality: Literal["GOOD", "BLURRED", "OCCLUDED"] = "GOOD"
    accepted_egg_count: int = Field(ge=0, le=10000)
    reason: str = Field(min_length=8, max_length=1000)

    @model_validator(mode="after")
    def utc_times(self):
        for value in (self.interval_start, self.interval_end, self.collected_at):
            if value.utcoffset().total_seconds() != 0:
                raise ValueError("Use UTC timestamps")
        return self
