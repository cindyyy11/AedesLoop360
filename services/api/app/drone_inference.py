"""Optional local aerial detector adapter. Outputs are candidate objects only."""

from __future__ import annotations

import hashlib
import io
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable

from PIL import Image


@dataclass(frozen=True)
class CandidateDetection:
    object_class: str
    bbox: list[float]
    confidence: float


@dataclass(frozen=True)
class InferenceResult:
    status: str
    model_version: str | None
    detections: list[CandidateDetection]
    reason: str | None = None


def _load_model(path: str) -> Any:
    """Load an optional YOLO checkpoint once per API process."""
    from ultralytics import YOLO

    return YOLO(path)


@lru_cache(maxsize=2)
def _cached_model(path: str) -> Any:
    return _load_model(path)


@lru_cache(maxsize=4)
def _checkpoint_digest(path: str) -> str:
    """Hash the weights once per process; live video calls inference many times a second."""
    digest_builder = hashlib.sha256()
    with Path(path).open("rb") as weights:
        for chunk in iter(lambda: weights.read(1024 * 1024), b""):
            digest_builder.update(chunk)
    return digest_builder.hexdigest()[:12]


def _as_float(value: Any) -> float:
    return float(value.item() if hasattr(value, "item") else value)


def infer_candidates(
    image_bytes: bytes,
    model_path: str | None = None,
    loader: Callable[[str], Any] | None = None,
) -> InferenceResult:
    """Run configured YOLO inference, or return an explicit unavailable status.

    Boxes are stored normalized to image width/height. This adapter never determines
    water presence or treatment eligibility.
    """
    configured = model_path or os.getenv("AEDES_DRONE_MODEL_PATH")
    if not configured:
        return InferenceResult(
            "NOT_CONFIGURED", None, [], "No local aerial detector checkpoint is configured."
        )
    checkpoint = Path(configured)
    if not checkpoint.is_file():
        return InferenceResult(
            "MODEL_MISSING", checkpoint.name, [], "Configured detector checkpoint was not found."
        )

    try:
        model = loader(str(checkpoint)) if loader else _cached_model(str(checkpoint.resolve()))
        with Image.open(io.BytesIO(image_bytes)) as opened:
            image = opened.convert("RGB")
        results = model.predict(source=image, verbose=False)
        if not results:
            return InferenceResult("NO_DETECTIONS", checkpoint.name, [])

        result = results[0]
        boxes = result.boxes
        width, height = image.size
        names = getattr(result, "names", getattr(model, "names", {}))
        detections: list[CandidateDetection] = []
        if boxes is not None:
            for xyxy, class_id, confidence in zip(boxes.xyxy, boxes.cls, boxes.conf, strict=False):
                coords = [_as_float(value) for value in xyxy]
                x1, y1, x2, y2 = coords
                if x2 <= x1 or y2 <= y1:
                    continue
                label = names.get(int(_as_float(class_id)), str(int(_as_float(class_id))))
                detections.append(
                    CandidateDetection(
                        object_class=str(label),
                        bbox=[
                            max(0.0, min(1.0, x1 / width)),
                            max(0.0, min(1.0, y1 / height)),
                            max(0.0, min(1.0, x2 / width)),
                            max(0.0, min(1.0, y2 / height)),
                        ],
                        confidence=max(0.0, min(1.0, _as_float(confidence))),
                    )
                )
        digest = _checkpoint_digest(str(checkpoint.resolve()))
        version = f"{checkpoint.stem}@{digest}"
        return InferenceResult("DETECTED" if detections else "NO_DETECTIONS", version, detections)
    except ImportError:
        return InferenceResult(
            "DEPENDENCY_UNAVAILABLE",
            checkpoint.name,
            [],
            "Install services/api/requirements-ml.txt to enable local YOLO inference.",
        )
    except Exception as exc:
        # Do not expose filesystem paths or library internals through the API.
        return InferenceResult(
            "INFERENCE_FAILED",
            checkpoint.name,
            [],
            f"Local inference failed ({type(exc).__name__}); ground review is required.",
        )
