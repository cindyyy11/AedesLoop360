"""Deterministic pixel-only features shared by egg model training and inference."""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image


def image_features(image: Image.Image) -> np.ndarray:
    # Blue pen marks are tally annotations on some source photos, not egg
    # evidence. Inpaint them consistently for the baseline and neural model.
    rgb = preprocess_image(image)
    if rgb.size == 0:
        raise ValueError("Empty substrate crop")
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    gray = cv2.resize(gray, (32, 64), interpolation=cv2.INTER_AREA)
    values = [gray.astype(np.float32).reshape(-1) / 255.0]
    for kernel in (3, 7, 15):
        local = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, np.ones((kernel, kernel), np.uint8))
        hist, _ = np.histogram(local, bins=32, range=(0, 128), density=True)
        values.append(hist.astype(np.float32))
        values.append(
            np.array(
                [local.mean(), local.std(), np.count_nonzero(local > 20) / local.size], np.float32
            )
        )
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1)
    magnitude = cv2.magnitude(gx, gy)
    hist, _ = np.histogram(magnitude, bins=32, range=(0, 256), density=True)
    values.append(hist.astype(np.float32))
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    for channel in range(3):
        hist, _ = np.histogram(hsv[:, :, channel], bins=24, range=(0, 256), density=True)
        values.append(hist.astype(np.float32))
    return np.concatenate(values)


def preprocess_image(image: Image.Image) -> np.ndarray:
    """Return RGB pixels with blue handwritten markings removed where possible."""
    rgb = np.asarray(image.convert("RGB"))
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    blue = cv2.inRange(hsv, np.array([82, 45, 30], np.uint8), np.array([145, 255, 255], np.uint8))
    if np.count_nonzero(blue):
        blue = cv2.dilate(blue, np.ones((3, 3), np.uint8), iterations=1)
        rgb = cv2.inpaint(rgb, blue, 3, cv2.INPAINT_TELEA)
    return rgb
