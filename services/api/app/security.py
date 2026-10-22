import hashlib
import hmac
import secrets
from datetime import timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .db import now, session
from .models import AuthSession, User


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return f"{salt}:{digest}"


def check_password(password: str, stored: str) -> bool:
    return hmac.compare_digest(password_hash(password, stored.split(":")[0]), stored)


def current_user(request: Request, db: Session = Depends(session)) -> User:
    token = request.cookies.get("aedes_session") or request.headers.get(
        "Authorization", ""
    ).removeprefix("Bearer ")
    auth = db.get(AuthSession, hashlib.sha256(token.encode()).hexdigest()) if token else None
    if not auth or auth.expires_at.replace(tzinfo=timezone.utc) < now():
        raise HTTPException(401, "Sign in to continue")
    return db.get(User, auth.user_id)


def require(user: User, *roles: str) -> None:
    if user.role not in roles:
        raise HTTPException(403, "This role cannot perform this action")


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(40)
    db.add(
        AuthSession(
            id=hashlib.sha256(token.encode()).hexdigest(),
            user_id=user.id,
            expires_at=now() + timedelta(hours=8),
        )
    )
    return token
