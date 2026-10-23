"""Simulated drone pass over ovitraps.

No aircraft, flight SDK or live link exists. The pass draws a deterministic synthetic paddle photo
for each reporting trap and sends it through the same counting model as a manual upload. Every
result is only a proposal in the review inbox; a person must still confirm it.
"""

import hashlib
import io
import random
from uuid import uuid4

from fastapi import HTTPException
from PIL import Image, ImageDraw
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import egg_analysis
from .db import now
from .models import EggAnalysis, Trap, User
from .repository import audit, get, receipt, replay
from .security import require
from .surveillance import effective_status

ROI = [0.1, 0.12, 0.9, 0.88]
RIGHTS = "Synthetic simulated drone capture, CC0; no real eggs or locations"


def synthetic_paddle(trap_id: str, pass_id: str) -> tuple[bytes, int]:
    """Deterministic fixture photo: a wooden paddle with a known number of drawn egg dots."""
    rng = random.Random(hashlib.sha256(f"{trap_id}:{pass_id}".encode()).digest())
    dots = rng.randint(8, 60)
    image = Image.new("RGB", (640, 480), "#e9e4d4")
    draw = ImageDraw.Draw(image)
    left, top, right, bottom = (int(v * s) for v, s in zip(ROI, (640, 480, 640, 480)))
    draw.rectangle((left, top, right, bottom), fill="#b98a5a", outline="#5b3d1f", width=4)
    for _ in range(dots):
        x, y = rng.randint(left + 12, right - 12), rng.randint(top + 12, bottom - 12)
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill="#1c1208")
    draw.text((12, 10), "SIMULATED DRONE CAPTURE", fill="#193a31")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue(), dots


def run_pass(db: Session, user: User, trap_ids: list[str], key: str):
    require(user, "operator", "coordinator")
    if len(set(trap_ids)) != len(trap_ids):
        raise HTTPException(422, "Traps must be unique")
    traps = [get(db, Trap, trap_id, user) for trap_id in trap_ids]
    scope = "trap-pass"
    payload = {"trap_ids": sorted(trap_ids)}
    cached = replay(db, user, scope, key, payload)
    if cached:
        rows = list(
            db.scalars(
                select(EggAnalysis).where(
                    EggAnalysis.capture_pass_id == cached, EggAnalysis.tenant_id == user.tenant_id
                )
            )
        )
        done = {row.trap_id for row in rows}
        skipped = [
            {"trap_id": t.id, "reason": _skip_reason(t)} for t in traps if t.id not in done
        ]
        return cached, rows, skipped
    pass_id = str(uuid4())
    analyses, skipped = [], []
    for trap in traps:
        if effective_status(trap) != "ACTIVE":
            skipped.append({"trap_id": trap.id, "reason": _skip_reason(trap)})
            continue
        content, _ = synthetic_paddle(trap.id, pass_id)
        analyses.append(
            egg_analysis.propose_from(
                db,
                user,
                trap.id,
                content,
                RIGHTS,
                now(),
                ROI,
                f"{key}:{trap.id}",
                source="DRONE_SIM",
                capture_pass_id=pass_id,
            )
        )
    receipt(db, user, scope, key, payload, pass_id)
    audit(
        db,
        user,
        pass_id,
        "TRAP_PASS_SIMULATED",
        {
            "analysis_ids": [a.id for a in analyses],
            "skipped": skipped,
            "mode": "SIMULATED",
            "note": "Simulation only; proposals need human confirmation",
        },
    )
    return pass_id, analyses, skipped


def _skip_reason(trap: Trap) -> str:
    return f"{effective_status(trap)}: trap data unavailable, no photo taken"
