import argparse
import hashlib
import io
import json
import os
from datetime import timedelta
from pathlib import Path

from PIL import Image, ImageDraw

from .db import ROOT, SessionLocal, now
from .models import (
    Asset,
    Block,
    Finding,
    Media,
    Mission,
    Observation,
    Sample,
    Tenant,
    Trap,
    User,
)
from .repository import digest
from .security import password_hash

TENANT = "tenant-demo"


def fixture_png(label: str, dots: int = 0) -> bytes:
    image = Image.new("RGB", (900, 480), "#e8e5d8")
    draw = ImageDraw.Draw(image)
    draw.text((30, 25), "SIMULATED / ORIGINAL SYNTHETIC FIXTURE / " + label, fill="#193a31")
    if dots:
        for i in range(dots):
            x, y = 50 + (i % 30) * 26, 90 + (i // 30) * 26
            draw.ellipse((x, y, x + 5, y + 9), fill="#193a31")
    else:
        for x, color, text in [
            (60, "#c1b793", "DRY"),
            (340, "#8ab4a3", "MOCK WATER"),
            (620, "#adb1a8", "OCCLUDED"),
        ]:
            draw.rectangle((x, 130, x + 210, 350), fill=color, outline="#193a31", width=3)
            draw.text((x + 12, 365), text, fill="#193a31")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def media(db, label: str, dots: int = 0, entity_id: str | None = None) -> Media:
    content = fixture_png(label, dots)
    row = Media(
        id=entity_id,
        tenant_id=TENANT,
        sha256=hashlib.sha256(content).hexdigest(),
        content=content,
        content_type="image/png",
        rights="Original synthetic fixture, CC0; no real eggs or locations",
        captured_at=now(),
        uploader_id="user-coordinator",
        adapter="DEMO_PREANNOTATED_V1" if not dots else "HUMAN_LABELLED_FIXTURE",
    )
    db.add(row)
    db.flush()
    return row


def seed() -> None:
    fixture = json.loads((ROOT / "fixtures/four_block_scenario.json").read_text())
    with SessionLocal.begin() as db:
        if db.get(Tenant, TENANT):
            print("Seed already present; preserved existing records")
            return
        db.add_all(
            [
                Tenant(id=TENANT, name="Fictional township"),
                Tenant(id="tenant-other", name="Isolation test"),
            ]
        )
        db.flush()
        for role in ["coordinator", "operator", "inspector", "reviewer", "admin"]:
            db.add(
                User(
                    id=f"user-{role}",
                    tenant_id=TENANT,
                    username=role,
                    password_hash=password_hash("demo-" + role + "-360"),
                    role=role,
                )
            )
        db.add(
            User(
                id="user-outsider",
                tenant_id="tenant-other",
                username="outsider",
                password_hash=password_hash("demo-outsider-360"),
                role="inspector",
            )
        )
        db.flush()
        for index, block in enumerate(fixture["blocks"]):
            db.add(
                Block(
                    id=block["id"],
                    tenant_id=TENANT,
                    name=block["name"],
                    x=20 + (index % 2) * 45,
                    y=20 + (index // 2) * 45,
                )
            )
        db.flush()
        for index in range(1, 5):
            for trap_index in range(1, 3):
                db.add(
                    Trap(
                        id=f"trap-b{index}-{trap_index}",
                        tenant_id=TENANT,
                        block_id=f"block-{index}",
                        name=f"B{index} / T{trap_index}",
                        status="OFFLINE" if index == 4 else "ACTIVE",
                        serviced_at=now(),
                        heartbeat_at=now(),
                    )
                )
        for index in range(1, 5):
            for asset_index in range(1, 4):
                number = (index - 1) * 3 + asset_index
                db.add(
                    Asset(
                        id=f"asset-p{number:02}",
                        tenant_id=TENANT,
                        block_id=f"block-{index}",
                        name=f"P-{number:02} / planter",
                        x=14 + ((index - 1) % 2) * 45 + asset_index * 5,
                        y=24 + ((index - 1) // 2) * 45,
                        accessible=True,
                    )
                )
        db.flush()
        aerial = media(db, "AERIAL-001", entity_id="media-aerial-001")
        new_egg = media(db, "B1-T1-W42-NEW", 100, entity_id="media-egg-new-001")
        # Media bytes live in the DB; optional disk copies are for local inspection only.
        # Vercel function bundles are read-only outside /tmp.
        fixture_dir = (
            Path("/tmp/aedes-fixtures/images")
            if os.environ.get("VERCEL") == "1"
            else ROOT / "fixtures/images"
        )
        fixture_dir.mkdir(parents=True, exist_ok=True)
        (fixture_dir / "aerial-001.png").write_bytes(aerial.content)
        (fixture_dir / "egg-new-001.png").write_bytes(new_egg.content)
        for index, candidate in enumerate(fixture["candidate_targets"]):
            db.add(
                Finding(
                    id=candidate["id"],
                    tenant_id=TENANT,
                    asset_id=candidate["asset_id"],
                    media_id=aerial.id,
                    water_state=candidate["water_state"],
                    bbox=[0.067 + index * 0.311, 0.27, 0.233, 0.46],
                    reason=candidate["reason"],
                )
            )
        for block in fixture["blocks"]:
            for index, count in enumerate(block["new_egg_counts"]):
                trap_id = f"trap-b{block['id'][-1]}-{index + 1}"
                image = media(db, trap_id + "-baseline", count)
                from datetime import datetime

                start = datetime.fromisoformat(
                    fixture["sample_window"]["start"].replace("Z", "+00:00")
                )
                end = datetime.fromisoformat(fixture["sample_window"]["end"].replace("Z", "+00:00"))
                db.add(
                    Sample(
                        tenant_id=TENANT,
                        trap_id=trap_id,
                        source_sample_id=f"baseline-{trap_id}",
                        substrate_id=f"paddle-{trap_id}-01",
                        interval_start=start,
                        interval_end=end,
                        collected_at=end,
                        sampling_effort_days=7,
                        egg_count=count,
                        media_id=image.id,
                        quality="GOOD",
                        validity="VALID",
                        digest=digest({"seed": trap_id}),
                    )
                )
        for index in [1, 2, 3, 10]:
            db.add(
                Observation(
                    id=f"observation-seed-{index}",
                    tenant_id=TENANT,
                    asset_id=f"asset-p{index:02}",
                    observed_at=now() - timedelta(days=5),
                    water_state="VISIBLE_WATER",
                    review_status="CONFIRMED",
                    reviewer_id="user-reviewer",
                    media_id=aerial.id,
                )
            )
        db.add(
            Mission(
                id="mission-demo-001",
                tenant_id=TENANT,
                block_id="block-1",
                target_ids=[c["id"] for c in fixture["candidate_targets"]],
            )
        )
    print("Seeded four fictional blocks. Local credentials: <role> / demo-<role>-360")


if __name__ == "__main__":
    argparse.ArgumentParser(
        description="Idempotent local seed; reset uses a fresh database URL"
    ).parse_args()
    seed()
