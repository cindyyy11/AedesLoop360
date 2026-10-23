"""Load the configured local detectors once at API start so the first frame is not slow."""

from __future__ import annotations

import io
import logging
import os
import threading
from pathlib import Path

from PIL import Image

from . import drone_inference, egg_vision

log = logging.getLogger("aedesloop.warmup")


def _blank_jpeg() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (640, 640), (128, 128, 128)).save(buffer, "JPEG")
    return buffer.getvalue()


def warm_models() -> dict[str, str]:
    """Load each configured checkpoint and run one blank inference; report per-model status."""
    status: dict[str, str] = {}
    frame = _blank_jpeg()
    result = drone_inference.infer_candidates(frame)
    status["drone"] = result.status
    if os.getenv("AEDES_EGG_MODEL_PATH") and Path(os.environ["AEDES_EGG_MODEL_PATH"]).is_file():
        estimate = egg_vision.infer_egg_count(frame, [0.0, 0.0, 1.0, 1.0])
        status["egg"] = estimate.status
    else:
        status["egg"] = "NOT_CONFIGURED"
    return status


def _run() -> None:
    try:
        log.info("Model warm-up finished: %s", warm_models())
    except Exception:  # warm-up is an optimisation; requests still load lazily
        log.exception("Model warm-up failed; models will load on first request")


def start_background_warmup() -> threading.Thread | None:
    """Start warm-up in a daemon thread so API start-up is not blocked by model loading."""
    if os.getenv("AEDES_WARMUP_MODELS", "1") != "1":
        return None
    thread = threading.Thread(target=_run, name="model-warmup", daemon=True)
    thread.start()
    return thread
