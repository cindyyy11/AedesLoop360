import json
from pathlib import Path

import pytest

from scripts.data_evaluation import (
    detection_metrics,
    deterministic_split,
    egg_count_metrics,
    intersection_over_union,
    main,
    validate_dataset,
)
from scripts.register_evaluation import register


def test_hand_calculated_detection_metrics_and_iou():
    labels = {
        "images": [
            {
                "image_id": "img-1",
                "annotations": [
                    {"class": "tyre", "bbox": [0, 0, 10, 10]},
                ],
            }
        ]
    }
    predictions = {
        "images": [
            {
                "image_id": "img-1",
                "detections": [
                    {"class": "tyre", "bbox": [0, 0, 10, 10], "score": 0.9},
                    {"class": "tyre", "bbox": [20, 20, 30, 30], "score": 0.8},
                ],
            }
        ]
    }

    result = detection_metrics(labels, predictions)

    assert intersection_over_union([0, 0, 10, 10], [0, 0, 10, 10]) == 1
    tyre = result["per_class"]["tyre"]
    assert tyre["true_positives"] == 1
    assert tyre["false_positives"] == 1
    assert tyre["false_negatives"] == 0
    assert tyre["precision"] == pytest.approx(0.5)
    assert tyre["recall"] == 1
    assert tyre["f1"] == pytest.approx(2 / 3)
    assert tyre["map_50"] == 1
    assert tyre["map_50_95"] == 1


def test_detection_rejects_missing_labels_bad_boxes_and_image_mismatch():
    with pytest.raises(ValueError, match="No labelled images"):
        detection_metrics({"images": []}, {"images": []})
    with pytest.raises(ValueError, match="positive width"):
        detection_metrics(
            {"images": [{"image_id": "i", "annotations": [{"class": "x", "bbox": [0, 0, 0, 1]}]}]},
            {"images": [{"image_id": "i", "detections": []}]},
        )
    with pytest.raises(ValueError, match="Image IDs differ"):
        detection_metrics(
            {"images": [{"image_id": "i", "annotations": [{"class": "x", "bbox": [0, 0, 1, 1]}]}]},
            {"images": []},
        )


def test_egg_count_metrics_are_hand_calculated_and_reject_bad_or_duplicate_pairs():
    result = egg_count_metrics(
        [
            {"image_id": "a", "reference_count": 10, "predicted_count": 12},
            {"image_id": "b", "reference_count": 20, "predicted_count": 17},
        ]
    )
    assert result["mae"] == 2.5
    assert result["rmse"] == pytest.approx((6.5) ** 0.5)
    assert result["signed_bias"] == -0.5
    assert result["median_absolute_error"] == 2.5
    assert result["within_tolerance_rate"] == 1
    assert "NOT_EVALUATED" in result["negative_sample_specificity"]
    with pytest.raises(ValueError, match="Duplicate image_id"):
        egg_count_metrics(
            [
                {"image_id": "a", "reference_count": 1, "predicted_count": 1},
                {"image_id": "a", "reference_count": 1, "predicted_count": 1},
            ]
        )
    with pytest.raises(ValueError, match="non-negative"):
        egg_count_metrics([{"image_id": "a", "reference_count": -1, "predicted_count": 1}])


def test_split_mapping_is_deterministic_and_group_consistent():
    assert deterministic_split("flight-17", 360) == deterministic_split("flight-17", 360)
    assert deterministic_split("flight-17", 360) != deterministic_split("flight-17", 361)


def test_dataset_inventory_reports_missing_data_and_writes_split_mapping(tmp_path: Path):
    manifest = {
        "manifest_version": 1,
        "datasets": [
            {
                "id": "tiny",
                "name": "Tiny candidate",
                "configured_root": None,
                "classes": ["tyre"],
                "images_subdir": "images",
                "labels_subdir": "labels",
                "metadata_status": "CANDIDATE_DECLARATION_NOT_DOWNLOADED",
            }
        ],
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    result = validate_dataset(manifest_path, "tiny", None, 360)
    assert result["status"] == "NOT_EVALUATED"
    assert result["files_found"] == 0
    assert "not configured" in result["errors"][0]


def test_dataset_inventory_detects_duplicate_files_and_missing_labels(tmp_path: Path):
    root = tmp_path / "dataset"
    images = root / "images"
    images.mkdir(parents=True)
    (images / "one.png").write_bytes(b"same bytes")
    (images / "two.png").write_bytes(b"same bytes")
    labels = root / "labels"
    labels.mkdir()
    (labels / "one.txt").write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "manifest_version": 1,
                "datasets": [
                    {
                        "id": "tiny",
                        "name": "tiny",
                        "classes": ["tyre"],
                        "images_subdir": "images",
                        "labels_subdir": "labels",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    result = validate_dataset(manifest_path, "tiny", root, 360)

    assert result["status"] == "INVALID"
    assert result["files_found"] == 2
    assert result["labelled_images"] == 1
    assert any("Duplicate image content hashes" in error for error in result["errors"])
    assert any("Missing YOLO labels" in warning for warning in result["warnings"])
    assert set(result["split_mapping"]) == {"one.png", "two.png"}


def test_dataset_inventory_keeps_source_group_together(tmp_path: Path):
    root = tmp_path / "dataset"
    images = root / "images"
    images.mkdir(parents=True)
    (images / "frame-1.png").write_bytes(b"image one")
    (images / "frame-2.png").write_bytes(b"image two")
    labels = root / "labels"
    labels.mkdir()
    (labels / "frame-1.txt").write_text("", encoding="utf-8")
    (labels / "frame-2.txt").write_text("", encoding="utf-8")
    (root / "groups.csv").write_text(
        "image_id,group_id\nframe-1.png,flight-a\nframe-2.png,flight-a\n", encoding="utf-8"
    )
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "manifest_version": 1,
                "datasets": [
                    {
                        "id": "tiny",
                        "name": "tiny",
                        "classes": ["tyre"],
                        "images_subdir": "images",
                        "labels_subdir": "labels",
                        "group_metadata_csv": "groups.csv",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    result = validate_dataset(manifest_path, "tiny", root, 360)

    assert result["status"] == "VALIDATED"
    assignments = {row["split"] for row in result["split_mapping"].values()}
    assert len(assignments) == 1
    assert {row["group_id"] for row in result["split_mapping"].values()} == {"flight-a"}


def test_cli_writes_not_evaluated_envelope_without_numeric_metrics(tmp_path: Path):
    output = tmp_path / "runs"
    assert main(["eval-eggs", "--out", str(output)]) == 0
    summaries = list(output.glob("*/summary.json"))
    assert len(summaries) == 1
    summary = json.loads(summaries[0].read_text(encoding="utf-8"))
    assert summary["status"] == "NOT_EVALUATED"
    assert summary["source_mode"] == "NOT_EVALUATED"
    assert summary["metrics"] is None
    assert "held-out technician counts" in summary["metadata"]["missing_prerequisites"]


def test_register_refuses_not_evaluated_cli_summary(tmp_path: Path):
    output = tmp_path / "runs"
    assert main(["eval-drone", "--out", str(output)]) == 0
    summary_path = next(output.glob("*/summary.json"))
    with pytest.raises(ValueError, match="COMPLETED reports"):
        register(summary_path, "tenant-demo")
