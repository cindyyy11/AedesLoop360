"""Stateless live-frame detection for a camera or video feed.

Each frame is analysed and discarded: nothing is stored, no finding is created and no mission
state changes. A person must save a frame through the normal upload path for it to become an
UNCERTAIN candidate that needs ground review.
"""

import io
import os
import threading
import time
from collections import deque
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import drone_inference
from .contracts import One
from .db import session
from .models import User
from .security import current_user, require

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(session)]
Actor = Annotated[User, Depends(current_user)]
MAX_FRAME_BYTES = 1024 * 1024
# A sliding window per user. The panel sends about 2 frames a second, so the default allows
# twice that. The window lives in this process only; with several API workers each enforces its own.
WINDOW_SECONDS = 5.0
MAX_FRAMES_PER_WINDOW = int(os.getenv("AEDES_LIVE_MAX_FRAMES_PER_5S", "20"))
_recent: dict[str, deque[float]] = {}
_lock = threading.Lock()


def _check_rate(user_id: str, clock=time.monotonic) -> None:
    now = clock()
    with _lock:
        hits = _recent.setdefault(user_id, deque())
        while hits and now - hits[0] >= WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= MAX_FRAMES_PER_WINDOW:
            wait = max(1, int(WINDOW_SECONDS - (now - hits[0])) + 1)
            raise HTTPException(
                429, "Too many live frames; slow the feed down", headers={"Retry-After": str(wait)}
            )
        hits.append(now)


class LiveDetection(BaseModel):
    object_class: str
    bbox: list[float]
    confidence: float
    state: Literal["UNCERTAIN"] = "UNCERTAIN"


class LiveFrameResult(BaseModel):
    status: str
    model_version: str | None
    latency_ms: int
    frame_width: int
    frame_height: int
    detections: list[LiveDetection]
    persisted: Literal[False] = False
    note: str


@router.post("/drones/live-detect", response_model=One[LiveFrameResult])
def live_detect(db: DB, user: Actor, file: UploadFile = File()):
    require(user, "operator", "reviewer", "inspector", "coordinator")
    _check_rate(user.id)
    content = file.file.read(MAX_FRAME_BYTES + 1)
    if len(content) > MAX_FRAME_BYTES:
        raise HTTPException(413, "Frame exceeds 1 MB; send a downscaled JPEG")
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format not in {"PNG", "JPEG"} or image.width * image.height > 4_000_000:
                raise ValueError()
            image.verify()
            width, height = image.size
    except (ValueError, UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(422, "Send a PNG/JPEG frame of at most 4 megapixels")
    started = time.perf_counter()
    result = drone_inference.infer_candidates(content)
    latency = round((time.perf_counter() - started) * 1000)
    return {
        "data": {
            "status": result.status,
            "model_version": result.model_version,
            "latency_ms": latency,
            "persisted": False,
            "frame_width": width,
            "frame_height": height,
            "detections": [
                {
                    "object_class": d.object_class,
                    "bbox": d.bbox,
                    "confidence": d.confidence,
                    "state": "UNCERTAIN",
                }
                for d in result.detections
            ],
            "note": result.reason
            or "Candidate containers only; water and breeding status are unconfirmed. Not stored.",
        },
        "source_mode": "IMPORTED",
    }
