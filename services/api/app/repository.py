import hashlib
import json
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from .models import Audit, Receipt, User


def digest(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, default=str, separators=(",", ":")).encode()
    ).hexdigest()


def get(db: Session, model, entity_id: str, user: User):
    row = db.get(model, entity_id)
    if row is None:
        raise HTTPException(404, "Record not found")
    if row.tenant_id != user.tenant_id:
        raise HTTPException(403, "Record belongs to another tenant")
    return row


def rows(db: Session, model, user: User):
    return list(
        db.scalars(select(model).where(model.tenant_id == user.tenant_id).order_by(model.id))
    )


def record(row) -> dict:
    result = {}
    for column in inspect(row).mapper.column_attrs:
        if column.key in {"content", "password_hash", "digest"}:
            continue
        value = getattr(row, column.key)
        if isinstance(value, datetime):
            value = value.isoformat() + ("Z" if value.tzinfo is None else "")
        result[column.key] = value
    return result


def audit(db: Session, user: User, entity_id: str, action: str, details: dict | None = None):
    db.add(
        Audit(
            tenant_id=user.tenant_id,
            actor_id=user.id,
            entity_id=entity_id,
            action=action,
            details=details or {},
        )
    )


def replay(db: Session, user: User, scope: str, key: str, payload: object):
    existing = db.scalar(
        select(Receipt).where(
            Receipt.tenant_id == user.tenant_id,
            Receipt.scope == scope,
            Receipt.key == key,
        )
    )
    if existing and existing.digest != digest(payload):
        raise HTTPException(409, "Idempotency key already used with different data")
    return existing.result_id if existing else None


def receipt(db: Session, user: User, scope: str, key: str, payload: object, result_id: str):
    db.add(
        Receipt(
            tenant_id=user.tenant_id,
            scope=scope,
            key=key,
            digest=digest(payload),
            result_id=result_id,
        )
    )
