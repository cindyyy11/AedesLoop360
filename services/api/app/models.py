from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    LargeBinary,
    String,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, now, uid


class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str]


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    username: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    role: Mapped[str]


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Scoped:
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    mode: Mapped[str] = mapped_column(default="SIMULATED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Block(Scoped, Base):
    __tablename__ = "blocks"
    name: Mapped[str]
    x: Mapped[float]
    y: Mapped[float]


class Asset(Scoped, Base):
    __tablename__ = "assets"
    block_id: Mapped[str] = mapped_column(ForeignKey("blocks.id"), index=True)
    name: Mapped[str]
    accessible: Mapped[bool] = mapped_column(default=True)
    permission: Mapped[bool] = mapped_column(default=True)
    x: Mapped[float]
    y: Mapped[float]


class Media(Scoped, Base):
    __tablename__ = "media"
    sha256: Mapped[str] = mapped_column(index=True)
    content_type: Mapped[str]
    content: Mapped[bytes] = mapped_column(LargeBinary)
    rights: Mapped[str]
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    adapter: Mapped[str] = mapped_column(default="UNSUPPORTED_GROUND_REVIEW")


class Finding(Scoped, Base):
    __tablename__ = "findings"
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    media_id: Mapped[str] = mapped_column(ForeignKey("media.id"), index=True)
    water_state: Mapped[str]
    object_class: Mapped[str] = mapped_column(default="container")
    bbox: Mapped[list] = mapped_column(JSON)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_version: Mapped[str] = mapped_column(default="DEMO_PREANNOTATED_V1")
    reason: Mapped[str]


class Trap(Scoped, Base):
    __tablename__ = "traps"
    block_id: Mapped[str] = mapped_column(ForeignKey("blocks.id"), index=True)
    name: Mapped[str]
    status: Mapped[str]
    safe_design_verified: Mapped[bool] = mapped_column(Boolean, default=True)
    serviced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Sample(Scoped, Base):
    __tablename__ = "samples"
    __table_args__ = (
        UniqueConstraint("trap_id", "source_sample_id"),
        UniqueConstraint("trap_id", "substrate_id"),
        UniqueConstraint("trap_id", "interval_start", "interval_end"),
        CheckConstraint("egg_count >= 0"),
        CheckConstraint("interval_end > interval_start"),
    )
    trap_id: Mapped[str] = mapped_column(ForeignKey("traps.id"), index=True)
    source_sample_id: Mapped[str]
    substrate_id: Mapped[str]
    interval_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    interval_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sampling_effort_days: Mapped[float]
    egg_count: Mapped[int]
    media_id: Mapped[str] = mapped_column(ForeignKey("media.id"), index=True)
    source: Mapped[str] = mapped_column(default="HUMAN_LABELLED_FIXTURE")
    quality: Mapped[str]
    review_status: Mapped[str] = mapped_column(default="CONFIRMED_FIXTURE")
    validity: Mapped[str]
    digest: Mapped[str]


class Mission(Scoped, Base):
    __tablename__ = "missions"
    block_id: Mapped[str] = mapped_column(ForeignKey("blocks.id"), index=True)
    status: Mapped[str] = mapped_column(default="DRAFT")
    target_ids: Mapped[list] = mapped_column(JSON)
    policy_version: Mapped[str] = mapped_column(default="demo-policy-v1")
    approved_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MissionEvent(Scoped, Base):
    __tablename__ = "mission_events"
    __table_args__ = (UniqueConstraint("mission_id", "event_key"),)
    mission_id: Mapped[str] = mapped_column(ForeignKey("missions.id"), index=True)
    event_key: Mapped[str]
    kind: Mapped[str]
    payload: Mapped[dict] = mapped_column(JSON)


class Job(Scoped, Base):
    __tablename__ = "jobs"
    mission_id: Mapped[str] = mapped_column(ForeignKey("missions.id"), unique=True)
    status: Mapped[str] = mapped_column(default="PENDING", index=True)
    cursor: Mapped[int] = mapped_column(default=0)
    attempts: Mapped[int] = mapped_column(default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    error: Mapped[str | None] = mapped_column(nullable=True)


class Observation(Scoped, Base):
    __tablename__ = "observations"
    __table_args__ = (UniqueConstraint("asset_id", "observed_at"),)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    water_state: Mapped[str]
    review_status: Mapped[str] = mapped_column(default="NEEDS_REVIEW")
    reviewer_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    media_id: Mapped[str] = mapped_column(ForeignKey("media.id"), index=True)
    resolved: Mapped[bool] = mapped_column(default=False)


class WorkOrder(Scoped, Base):
    __tablename__ = "work_orders"
    dedupe_key: Mapped[str] = mapped_column(unique=True)
    block_id: Mapped[str] = mapped_column(ForeignKey("blocks.id"), index=True)
    asset_id: Mapped[str | None] = mapped_column(ForeignKey("assets.id"), nullable=True, index=True)
    kind: Mapped[str]
    status: Mapped[str] = mapped_column(default="OPEN", index=True)
    reason: Mapped[str]
    assigned_to: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    completed_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    evidence_id: Mapped[str | None] = mapped_column(
        ForeignKey("media.id"), nullable=True, index=True
    )


class FollowUp(Scoped, Base):
    __tablename__ = "follow_ups"
    work_order_id: Mapped[str] = mapped_column(ForeignKey("work_orders.id"), index=True)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("media.id"), index=True)
    result: Mapped[str]


class Allocation(Scoped, Base):
    __tablename__ = "allocations"
    evidence_snapshot_hash: Mapped[str]
    snapshot: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)
    policy_version: Mapped[str] = mapped_column(default="ADAPTIVE_RULES_V1")
    status: Mapped[str] = mapped_column(default="PROPOSED")


class Receipt(Scoped, Base):
    __tablename__ = "receipts"
    __table_args__ = (UniqueConstraint("tenant_id", "scope", "key"),)
    scope: Mapped[str]
    key: Mapped[str]
    digest: Mapped[str]
    result_id: Mapped[str]


class Audit(Scoped, Base):
    __tablename__ = "audit_events"
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    entity_id: Mapped[str] = mapped_column(index=True)
    action: Mapped[str]
    details: Mapped[dict] = mapped_column(JSON)


@event.listens_for(Audit, "before_update")
@event.listens_for(Audit, "before_delete")
def immutable_audit(*_):
    raise ValueError("Audit events are append-only")
