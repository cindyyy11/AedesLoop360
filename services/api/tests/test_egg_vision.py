from __future__ import annotations

import io

import joblib
from PIL import Image, ImageDraw

from app.egg_vision import _validate_roi, infer_egg_count, suggest_roi
from app.egg_features import preprocess_image


def test_invalid_rois_fail_closed():
    assert not _validate_roi([0.1, 0.1, 0.08, 0.9])
    assert not _validate_roi([0, 0, 1, 1, 0])
    assert not _validate_roi([0, 0, float("nan"), 1])
    assert _validate_roi([0.2, 0.1, 0.8, 0.9])


def test_missing_model_is_unavailable_not_zero(monkeypatch):
    image = Image.new("RGB", (100, 160), "white")
    data = io.BytesIO()
    image.save(data, format="JPEG")
    monkeypatch.delenv("AEDES_EGG_MODEL_PATH", raising=False)

    result = infer_egg_count(data.getvalue(), [0.2, 0.1, 0.8, 0.9])

    assert result.status == "NOT_CONFIGURED"
    assert result.estimate is None


def test_invalid_image_and_unsupported_format_are_explicit():
    assert infer_egg_count(b"bad", [0.1, 0.1, 0.9, 0.9]).status == "INVALID_IMAGE"
    stream = io.BytesIO()
    Image.new("RGB", (64, 64)).save(stream, format="BMP")
    result = infer_egg_count(stream.getvalue(), [0.1, 0.1, 0.9, 0.9])
    assert result.status == "UNSUPPORTED_IMAGE"
    assert result.estimate is None


def test_substrate_roi_rejects_plain_image_and_detects_central_brown_strip():
    plain = Image.new("RGB", (900, 1600), "white")
    assert suggest_roi(plain) is None
    image = Image.new("RGB", (900, 1600), "#e1e1e1")
    draw = ImageDraw.Draw(image)
    draw.rectangle((320, 220, 680, 1400), fill="#8b5429")
    roi = suggest_roi(image)
    assert roi is not None
    assert 0.3 < roi[0] < 0.4 and 0.7 < roi[2] < 0.8
    assert 0.1 < roi[1] < 0.2 and 0.85 < roi[3] < 0.9


def test_blue_handwritten_marks_are_removed_from_model_pixels():
    image = Image.new("RGB", (80, 80), "white")
    ImageDraw.Draw(image).line((10, 40, 70, 40), fill=(20, 50, 230), width=5)
    output = preprocess_image(image)
    # Inpainting should leave no strongly blue pixels that could encode a label.
    assert int(((output[:, :, 2] > output[:, :, 0] * 1.5) & (output[:, :, 2] > 150)).sum()) == 0


def test_group_median_checkpoint_runs_through_inference(tmp_path, monkeypatch):
    checkpoint = tmp_path / "median.joblib"
    joblib.dump(
        {
            "model": None,
            "constant_count": 42.5,
            "metadata": {"method": "train_group_median", "model_version": "test-median"},
        },
        checkpoint,
    )
    monkeypatch.setenv("AEDES_EGG_MODEL_PATH", str(checkpoint))
    image_data = io.BytesIO()
    Image.new("RGB", (100, 160), "white").save(image_data, format="JPEG")

    result = infer_egg_count(image_data.getvalue(), [0.1, 0.1, 0.9, 0.9])

    assert result.status == "ESTIMATED"
    assert result.estimate == 42
    assert result.model_version == "test-median"
