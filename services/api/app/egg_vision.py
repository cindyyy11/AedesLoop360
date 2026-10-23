"""Lazy, provenance-aware egg count inference; never decides surveillance validity."""

from __future__ import annotations

import hashlib
import io
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError


@dataclass(frozen=True)
class EggEstimate:
    status: str
    estimate: int | None
    model_version: str | None
    reason: str | None = None
    details: dict[str, Any] | None = None


def _validate_roi(roi: list[float]) -> bool:
    return (
        len(roi) == 4
        and all(np.isfinite(value) and 0 <= value <= 1 for value in roi)
        and roi[2] - roi[0] >= 0.1
        and roi[3] - roi[1] >= 0.1
    )


def suggest_roi(image: Image.Image) -> list[float] | None:
    """Find a central elongated substrate candidate; return None if uncertain.

    This geometric aid intentionally does not try to count eggs. Users review and
    may adjust the ROI before inference. Low contrast/edge-clipped crops fail closed.
    """
    import cv2

    rgb = np.asarray(ImageOps.exif_transpose(image).convert("RGB"))
    height, width = rgb.shape[:2]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    # Brown/coloured fibre has saturation; white/gray fibre is found using local
    # edge density. Exclude likely QR/header zones at left and image borders.
    colored = ((hsv[:, :, 1] > 30) & (hsv[:, :, 2] < 235)).astype("uint8") * 255
    colored[:, : int(width * 0.22)] = 0
    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT, (max(3, width // 120), max(7, height // 100))
    )
    mask = cv2.morphologyEx(colored, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        aspect = h / max(w, 1)
        if area > width * height * 0.08 and 1.4 <= aspect <= 9 and x > width * 0.2:
            candidates.append((area, x, y, w, h))
    if not candidates:
        # For light substrate, its texture creates a distinct edge-rich region.
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 35, 100)
        edges[:, : int(width * 0.25)] = 0
        edges[: int(height * 0.08), :] = 0
        edge_mask = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 21)))
        contours, _ = cv2.findContours(edge_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            aspect = h / max(w, 1)
            if area > width * height * 0.06 and 1.4 <= aspect <= 9 and x > width * 0.2:
                candidates.append((area, x, y, w, h))
    if not candidates:
        return None
    _, x, y, w, h = max(candidates)
    if x < width * 0.22 or y < height * 0.03 or x + w > width * 0.99 or y + h > height * 0.99:
        return None
    # Slightly inset the detected material boundary without cutting edge eggs.
    pad_x, pad_y = round(w * 0.012), round(h * 0.008)
    box = [
        max(0, x - pad_x),
        max(0, y - pad_y),
        min(width, x + w + pad_x),
        min(height, y + h + pad_y),
    ]
    return [
        round(box[0] / width, 6),
        round(box[1] / height, 6),
        round(box[2] / width, 6),
        round(box[3] / height, 6),
    ]


def _load_model(path: str) -> tuple[Any, dict[str, Any], str]:
    import joblib

    if Path(path).suffix == ".joblib":
        payload = joblib.load(path)
        return (
            payload,
            payload["metadata"],
            hashlib.sha256(Path(path).read_bytes()).hexdigest(),
        )
    import torch
    from PIL import Image as PILImage
    from torchvision import models, transforms

    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    metadata = checkpoint["metadata"]
    network = models.resnet18(weights=None)
    network.fc = torch.nn.Linear(network.fc.in_features, 1)
    network.load_state_dict(checkpoint["state_dict"])
    network.eval()
    preprocess = transforms.Compose(
        [
            transforms.Resize((256, 256), interpolation=transforms.InterpolationMode.BICUBIC),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    return (
        (network, preprocess, PILImage),
        metadata,
        hashlib.sha256(Path(path).read_bytes()).hexdigest(),
    )


@lru_cache(maxsize=2)
def _cached_model(path: str):
    return _load_model(path)


def infer_egg_count(image_bytes: bytes, roi: list[float]) -> EggEstimate:
    if not _validate_roi(roi):
        return EggEstimate("INVALID_IMAGE", None, None, "The reviewed substrate region is invalid.")
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            if image.format not in {"PNG", "JPEG"} or image.width * image.height > 16_000_000:
                return EggEstimate(
                    "UNSUPPORTED_IMAGE", None, None, "Use a PNG/JPEG image up to 16 MP."
                )
            image = ImageOps.exif_transpose(image).convert("RGB")
            width, height = image.size
            image = image.crop(
                (
                    round(roi[0] * width),
                    round(roi[1] * height),
                    round(roi[2] * width),
                    round(roi[3] * height),
                )
            )
    except (UnidentifiedImageError, OSError, ValueError):
        return EggEstimate("INVALID_IMAGE", None, None, "The image could not be decoded.")
    configured = os.getenv("AEDES_EGG_MODEL_PATH")
    if not configured:
        return EggEstimate(
            "NOT_CONFIGURED", None, None, "No reviewed egg-count model is configured."
        )
    checkpoint = Path(configured)
    if not checkpoint.is_file():
        return EggEstimate(
            "MODEL_MISSING", None, None, "The configured egg-count checkpoint was not found."
        )
    try:
        predictor, metadata, digest = _cached_model(str(checkpoint.resolve()))
        if metadata["method"] == "train_group_median":
            estimate = max(0, min(10000, round(float(predictor["constant_count"]))))
        elif metadata["method"].startswith("texture_"):
            from .egg_features import image_features

            features = image_features(image)
            model = predictor["model"]
            estimate = max(
                0, min(10000, round(float(np.expm1(model.predict(features.reshape(1, -1))[0]))))
            )
        else:
            from .egg_features import preprocess_image

            image = Image.fromarray(preprocess_image(image))
            network, preprocess, pil_image = predictor
            import torch

            with torch.inference_mode():
                prediction = network(preprocess(image).unsqueeze(0))
                estimate = max(
                    0, min(10000, round(float(torch.expm1(prediction.squeeze()).item())))
                )
        return EggEstimate(
            "ESTIMATED",
            estimate,
            metadata["model_version"],
            details={"checkpoint_sha256": digest, "method": metadata["method"], "roi": roi},
        )
    except (OSError, ValueError, KeyError, RuntimeError, ImportError) as error:
        return EggEstimate(
            "INFERENCE_FAILED",
            None,
            checkpoint.name,
            f"Model inference failed: {type(error).__name__}.",
        )
