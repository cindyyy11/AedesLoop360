"""Reproducible, dependency-light dataset validation and evaluation utilities.

This module evaluates supplied labels/predictions only. It does not train a model,
download datasets, or infer biological outcomes from candidate-container detections.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MANIFEST_VERSION = 1
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
SPLIT_NAMES = ("train", "validation", "test")


def _read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def deterministic_split(group_id: str, seed: int = 360) -> str:
    """Map a group deterministically to 70/15/15 splits without splitting its members."""
    value = int(hashlib.sha256(f"{seed}:{group_id}".encode()).hexdigest()[:16], 16) % 10000
    if value < 7000:
        return "train"
    if value < 8500:
        return "validation"
    return "test"


def intersection_over_union(first: list[float], second: list[float]) -> float:
    if len(first) != 4 or len(second) != 4:
        raise ValueError("Boxes must be [x1, y1, x2, y2]")
    if (
        first[2] <= first[0]
        or first[3] <= first[1]
        or second[2] <= second[0]
        or second[3] <= second[1]
    ):
        raise ValueError("Boxes must have positive width and height")
    ix1, iy1 = max(first[0], second[0]), max(first[1], second[1])
    ix2, iy2 = min(first[2], second[2]), min(first[3], second[3])
    intersection = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = (first[2] - first[0]) * (first[3] - first[1])
    area_b = (second[2] - second[0]) * (second[3] - second[1])
    return intersection / (area_a + area_b - intersection)


def _valid_detection(item: dict[str, Any], *, prediction: bool) -> None:
    if not isinstance(item.get("class"), str) or not item["class"].strip():
        raise ValueError("Each detection needs a non-empty class")
    box = item.get("bbox")
    if not isinstance(box, list) or len(box) != 4:
        raise ValueError("Each detection bbox must be [x1, y1, x2, y2]")
    if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in box):
        raise ValueError("Bounding box coordinates must be finite numbers")
    if box[2] <= box[0] or box[3] <= box[1]:
        raise ValueError("Bounding boxes must have positive width and height")
    if prediction and (
        not isinstance(item.get("score"), (int, float)) or not 0 <= item["score"] <= 1
    ):
        raise ValueError("Predictions need a score between 0 and 1")


def _image_records(document: Any, key: str) -> dict[str, dict[str, Any]]:
    records = document.get("images") if isinstance(document, dict) else None
    if not isinstance(records, list):
        raise ValueError("Detection file must contain an 'images' array")
    result: dict[str, dict[str, Any]] = {}
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("image_id"), str):
            raise ValueError("Each image record needs a string image_id")
        image_id = record["image_id"]
        if image_id in result:
            raise ValueError(f"Duplicate image_id: {image_id}")
        detections = record.get(key)
        if not isinstance(detections, list):
            raise ValueError(f"Image {image_id} must have a {key} array")
        for item in detections:
            _valid_detection(item, prediction=key == "detections")
        result[image_id] = record
    return result


def _average_precision(tp: list[int], fp: list[int], total_ground_truth: int) -> float | None:
    if total_ground_truth == 0:
        return None
    cumulative_tp, cumulative_fp = 0, 0
    recalls: list[float] = []
    precisions: list[float] = []
    for true_positive, false_positive in zip(tp, fp, strict=True):
        cumulative_tp += true_positive
        cumulative_fp += false_positive
        recalls.append(cumulative_tp / total_ground_truth)
        precisions.append(cumulative_tp / (cumulative_tp + cumulative_fp))
    recalls = [0.0, *recalls, 1.0]
    precisions = [0.0, *precisions, 0.0]
    for index in range(len(precisions) - 2, -1, -1):
        precisions[index] = max(precisions[index], precisions[index + 1])
    return sum(
        (recalls[index + 1] - recalls[index]) * precisions[index + 1]
        for index in range(len(recalls) - 1)
        if recalls[index + 1] != recalls[index]
    )


def detection_metrics(
    labels_document: Any,
    predictions_document: Any,
    iou_threshold: float = 0.5,
) -> dict[str, Any]:
    """Compute class-wise greedy detection scores and AP@[.50:.95] from JSON records."""
    if not 0 < iou_threshold <= 1:
        raise ValueError("IoU threshold must be in (0, 1]")
    labels = _image_records(labels_document, "annotations")
    predictions = _image_records(predictions_document, "detections")
    if not labels:
        raise ValueError("No labelled images were supplied")
    missing = sorted(set(labels) - set(predictions))
    extra = sorted(set(predictions) - set(labels))
    if missing or extra:
        raise ValueError(f"Image IDs differ; missing predictions={missing[:5]}, extra={extra[:5]}")
    classes = sorted(
        {x["class"] for row in labels.values() for x in row["annotations"]}
        | {x["class"] for row in predictions.values() for x in row["detections"]}
    )
    if not classes:
        raise ValueError("No labelled objects were supplied")

    per_class: dict[str, Any] = {}
    all_metrics: dict[str, list[float]] = defaultdict(list)
    for class_name in classes:
        gt_by_image = {
            image_id: [item for item in record["annotations"] if item["class"] == class_name]
            for image_id, record in labels.items()
        }
        total_gt = sum(map(len, gt_by_image.values()))
        class_predictions = [
            (float(item["score"]), image_id, item)
            for image_id, record in predictions.items()
            for item in record["detections"]
            if item["class"] == class_name
        ]
        class_predictions.sort(key=lambda row: (-row[0], row[1]))

        def match(threshold: float) -> tuple[list[int], list[int], int]:
            claimed: dict[str, set[int]] = defaultdict(set)
            tp: list[int] = []
            fp: list[int] = []
            for _, image_id, prediction in class_predictions:
                best: tuple[float, int] | None = None
                for index, annotation in enumerate(gt_by_image[image_id]):
                    if index in claimed[image_id]:
                        continue
                    overlap = intersection_over_union(prediction["bbox"], annotation["bbox"])
                    if overlap >= threshold and (best is None or overlap > best[0]):
                        best = (overlap, index)
                if best is None:
                    tp.append(0)
                    fp.append(1)
                else:
                    claimed[image_id].add(best[1])
                    tp.append(1)
                    fp.append(0)
            return tp, fp, total_gt

        tp, fp, _ = match(iou_threshold)
        tp_sum, fp_sum, fn_sum = sum(tp), sum(fp), total_gt - sum(tp)
        precision = tp_sum / (tp_sum + fp_sum) if tp_sum + fp_sum else 0.0
        recall = tp_sum / total_gt if total_gt else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        ap_by_iou: dict[str, float | None] = {}
        for hundredths in range(50, 96, 5):
            threshold = hundredths / 100
            tps, fps, _ = match(threshold)
            ap_by_iou[f"{threshold:.2f}"] = _average_precision(tps, fps, total_gt)
        aps = [value for value in ap_by_iou.values() if value is not None]
        item_metrics = {
            "ground_truth_instances": total_gt,
            "predicted_instances": len(class_predictions),
            "true_positives": tp_sum,
            "false_positives": fp_sum,
            "false_negatives": fn_sum,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "ap_by_iou": ap_by_iou,
            "map_50": ap_by_iou["0.50"],
            "map_50_95": sum(aps) / len(aps) if aps else None,
        }
        per_class[class_name] = item_metrics
        for metric in ("precision", "recall", "f1", "map_50", "map_50_95"):
            if item_metrics[metric] is not None:
                all_metrics[metric].append(item_metrics[metric])
    return {
        "status": "COMPLETED",
        "metric_method": "class-wise greedy IoU matching; interpolated precision envelope AP",
        "iou_threshold": iou_threshold,
        "iou_thresholds_for_map_50_95": [round(i / 100, 2) for i in range(50, 96, 5)],
        "image_count": len(labels),
        "labelled_instance_count": sum(len(row["annotations"]) for row in labels.values()),
        "prediction_count": sum(len(row["detections"]) for row in predictions.values()),
        "macro": {name: sum(values) / len(values) for name, values in all_metrics.items()},
        "per_class": per_class,
    }


def egg_count_metrics(
    pairs: list[dict[str, Any]], tolerance_absolute: float = 5.0, tolerance_fraction: float = 0.1
) -> dict[str, Any]:
    if not pairs:
        raise ValueError("No reference/prediction pairs were supplied")
    if tolerance_absolute < 0 or tolerance_fraction < 0:
        raise ValueError("Tolerance values cannot be negative")
    ids: set[str] = set()
    errors: list[float] = []
    for row in pairs:
        image_id = row.get("image_id")
        reference, predicted = row.get("reference_count"), row.get("predicted_count")
        if not isinstance(image_id, str) or not image_id:
            raise ValueError("Each count pair needs a non-empty image_id")
        if image_id in ids:
            raise ValueError(f"Duplicate image_id: {image_id}")
        ids.add(image_id)
        for name, value in (("reference_count", reference), ("predicted_count", predicted)):
            if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError(f"{name} must be a finite non-negative number")
        errors.append(float(predicted) - float(reference))
    absolute = [abs(error) for error in errors]
    sorted_absolute = sorted(absolute)
    middle = len(sorted_absolute) // 2
    median_absolute = (
        sorted_absolute[middle]
        if len(sorted_absolute) % 2
        else (sorted_absolute[middle - 1] + sorted_absolute[middle]) / 2
    )
    within = [
        abs(error) <= max(tolerance_absolute, float(row["reference_count"]) * tolerance_fraction)
        for row, error in zip(pairs, errors, strict=True)
    ]
    return {
        "status": "COMPLETED",
        "metric_units": "eggs per image",
        "sample_count": len(pairs),
        "mae": sum(absolute) / len(absolute),
        "rmse": math.sqrt(sum(error * error for error in errors) / len(errors)),
        "signed_bias": sum(errors) / len(errors),
        "median_absolute_error": median_absolute,
        "within_tolerance_rate": sum(within) / len(within),
        "tolerance": {
            "absolute_eggs": tolerance_absolute,
            "fraction_of_reference": tolerance_fraction,
        },
        "negative_sample_specificity": "NOT_EVALUATED: negative reference images are not represented by count pairs",
        "per_image": [
            {
                "image_id": row["image_id"],
                "reference_count": row["reference_count"],
                "predicted_count": row["predicted_count"],
                "signed_error": error,
                "absolute_error": abs(error),
            }
            for row, error in zip(pairs, errors, strict=True)
        ],
    }


def _validate_yolo_labels(label_path: Path, class_names: list[str]) -> list[str]:
    errors: list[str] = []
    try:
        lines = label_path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        return [f"cannot read label file: {exc}"]
    for line_number, line in enumerate(lines, start=1):
        fields = line.split()
        if len(fields) != 5:
            errors.append(f"line {line_number}: expected class x_center y_center width height")
            continue
        try:
            class_id = int(fields[0])
            values = [float(value) for value in fields[1:]]
        except ValueError:
            errors.append(f"line {line_number}: fields must be numeric")
            continue
        if class_id < 0 or class_id >= len(class_names):
            errors.append(f"line {line_number}: class id {class_id} outside manifest classes")
        if not all(math.isfinite(value) and 0 <= value <= 1 for value in values):
            errors.append(f"line {line_number}: normalized box values must be finite and in [0, 1]")
        elif values[2] <= 0 or values[3] <= 0:
            errors.append(f"line {line_number}: width and height must be positive")
    return errors


def validate_dataset(
    manifest_path: Path, dataset_id: str, root_override: Path | None, seed: int
) -> dict[str, Any]:
    manifest = _read_json(manifest_path)
    if manifest.get("manifest_version") != MANIFEST_VERSION:
        raise ValueError(f"Expected manifest_version={MANIFEST_VERSION}")
    datasets = manifest.get("datasets")
    if not isinstance(datasets, list):
        raise ValueError("Manifest datasets must be an array")
    entry = next((item for item in datasets if item.get("id") == dataset_id), None)
    if entry is None:
        raise ValueError(f"Dataset id not found: {dataset_id}")
    root_value = root_override or (
        manifest_path.parent / entry["configured_root"] if entry.get("configured_root") else None
    )
    now = datetime.now(timezone.utc).isoformat()
    result: dict[str, Any] = {
        "status": "NOT_EVALUATED",
        "dataset_id": dataset_id,
        "dataset_name": entry.get("name"),
        "manifest_version": manifest["manifest_version"],
        "source_url": entry.get("source_url"),
        "doi": entry.get("doi"),
        "licence": entry.get("licence"),
        "licence_status": entry.get("licence_status", "UNVERIFIED_DECLARATION"),
        "metadata_status": entry.get("metadata_status", "CANDIDATE_DECLARATION"),
        "checked_at": now,
        "configured_root": str(root_value) if root_value else None,
        "files_found": 0,
        "labelled_images": 0,
        "labelled_instances": 0,
        "split_counts": {name: 0 for name in SPLIT_NAMES},
        "errors": [],
        "warnings": list(entry.get("warnings", [])),
        "dataset_sha256": None,
        "split_mapping": {},
    }
    if not root_value or not root_value.exists():
        result["errors"].append(
            "Dataset files are not configured or the configured root does not exist."
        )
        return result
    images_dir = root_value / entry.get("images_subdir", "images")
    labels_dir_value = entry.get("labels_subdir", "labels")
    labels_dir = root_value / labels_dir_value if labels_dir_value else None
    if not images_dir.is_dir():
        result["errors"].append(f"Image directory not found: {images_dir}")
        return result
    images = sorted(
        path
        for path in images_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )
    result["files_found"] = len(images)
    if not images:
        result["errors"].append("No supported image files found.")
        return result
    names: dict[str, list[str]] = defaultdict(list)
    hashes: dict[str, list[str]] = defaultdict(list)
    split_groups: dict[str, set[str]] = defaultdict(set)
    group_splits: dict[str, set[str]] = defaultdict(set)
    mapping: dict[str, Any] = {}
    classes = entry.get("classes", [])
    if not isinstance(classes, list) or not all(isinstance(name, str) for name in classes):
        raise ValueError("Dataset classes must be an array of names")
    group_metadata: dict[str, str] = {}
    group_csv = entry.get("group_metadata_csv")
    if group_csv:
        group_path = root_value / group_csv
        if not group_path.is_file():
            result["errors"].append(f"Configured group metadata file not found: {group_path}")
        else:
            with group_path.open(encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                image_column = entry.get("group_image_column", "image_id")
                group_column = entry.get("group_id_column", "group_id")
                if (
                    not reader.fieldnames
                    or image_column not in reader.fieldnames
                    or group_column not in reader.fieldnames
                ):
                    result["errors"].append(
                        f"Group metadata CSV must contain {image_column!r} and {group_column!r} columns."
                    )
                else:
                    for row in reader:
                        image_key, group_id = (
                            (row.get(image_column) or "").strip(),
                            (row.get(group_column) or "").strip(),
                        )
                        if not image_key or not group_id:
                            result["errors"].append(
                                "Group metadata CSV contains an empty image or group identifier."
                            )
                        elif image_key in group_metadata:
                            result["errors"].append(
                                f"Duplicate image identifier in group metadata: {image_key}"
                            )
                        else:
                            group_metadata[image_key] = group_id
    labels_missing = []
    dataset_hash = hashlib.sha256()
    for image in images:
        relative = image.relative_to(images_dir).as_posix()
        names[image.name.casefold()].append(relative)
        content_hash = sha256_file(image)
        hashes[content_hash].append(relative)
        dataset_hash.update(relative.encode())
        dataset_hash.update(content_hash.encode())
        group = group_metadata.get(relative) or group_metadata.get(image.name)
        if group_csv and not group:
            result["errors"].append(f"No group metadata for image {relative}.")
        if not group:
            group = (
                relative.split("/", 1)[0]
                if entry.get("group_by_top_level_directory") and "/" in relative
                else relative
            )
        split = deterministic_split(group, seed)
        split_groups[split].add(group)
        group_splits[group].add(split)
        mapping[relative] = {"group_id": group, "split": split, "sha256": content_hash}
        if labels_dir is not None:
            label_path = labels_dir / Path(relative).with_suffix(".txt")
            if not label_path.is_file():
                labels_missing.append(relative)
            else:
                issues = _validate_yolo_labels(label_path, classes)
                result["errors"].extend(f"{relative}: {issue}" for issue in issues)
                if not issues:
                    result["labelled_images"] += 1
                    result["labelled_instances"] += len(
                        label_path.read_text(encoding="utf-8").splitlines()
                    )
        result["split_counts"][split] += 1
    duplicates_by_name = {name: paths for name, paths in names.items() if len(paths) > 1}
    duplicate_content = {digest: paths for digest, paths in hashes.items() if len(paths) > 1}
    if duplicates_by_name:
        result["errors"].append(f"Duplicate filenames (case-insensitive): {duplicates_by_name}")
    if duplicate_content:
        result["errors"].append(f"Duplicate image content hashes: {duplicate_content}")
    if labels_missing:
        result["warnings"].append(
            f"Missing YOLO labels for {len(labels_missing)} image(s); examples: {labels_missing[:10]}"
        )
    leaked_groups = {
        group: sorted(splits) for group, splits in group_splits.items() if len(splits) > 1
    }
    if leaked_groups:
        result["errors"].append("Group leakage detected across splits.")
        result["leaked_groups"] = leaked_groups
    result["dataset_sha256"] = dataset_hash.hexdigest()
    result["split_mapping"] = mapping
    result["group_split_counts"] = {split: len(split_groups[split]) for split in SPLIT_NAMES}
    result["split_policy"] = (
        "SHA-256 deterministic 70/15/15 by group; group defaults to image-relative path"
    )
    if result["errors"]:
        result["status"] = "INVALID"
    elif labels_dir is None or labels_missing:
        result["status"] = "NOT_EVALUATED"
    else:
        result["status"] = "VALIDATED"
    return result


def not_evaluated(kind: str, missing: list[str]) -> dict[str, Any]:
    return {
        "status": "NOT_EVALUATED",
        "evaluation": kind,
        "metrics": None,
        "missing_prerequisites": missing,
        "message": "No performance result is available. Supply independent held-out labels, predictions, and a checkpoint for provenance.",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _metric_payload(raw: dict[str, Any]) -> dict[str, Any] | None:
    if raw.get("status") != "COMPLETED":
        return None
    provenance_keys = {
        "status",
        "evaluation",
        "dataset_id",
        "dataset_sha256",
        "split",
        "test_count",
        "source_mode",
        "checkpoint_sha256",
        "checkpoint_path",
        "created_at",
        "biological_interpretation",
    }
    return {key: value for key, value in raw.items() if key not in provenance_keys}


def _eval_drone(args: argparse.Namespace) -> dict[str, Any]:
    missing = [
        name
        for name, path in (
            ("held-out labels", args.labels),
            ("predictions", args.predictions),
            ("model checkpoint", args.checkpoint),
        )
        if path is None or not path.is_file()
    ]
    if missing:
        return not_evaluated("drone_object_detection", missing)
    result = detection_metrics(_read_json(args.labels), _read_json(args.predictions), args.iou)
    result.update(
        {
            "evaluation": "candidate_container_object_detection_only",
            "dataset_id": args.dataset_id,
            "split": args.split,
            "test_count": result["image_count"],
            "source_mode": "EXTERNALLY_LABELLED_HELD_OUT",
            "dataset_sha256": sha256_file(args.labels),
            "checkpoint_sha256": sha256_file(args.checkpoint),
            "checkpoint_path": str(args.checkpoint),
            "biological_interpretation": "Object detections do not confirm water, larvae, Aedes species, treatment eligibility, or dengue risk.",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return result


def _eval_eggs(args: argparse.Namespace) -> dict[str, Any]:
    missing = [
        name
        for name, path in (
            ("held-out technician counts", args.labels),
            ("model predictions", args.predictions),
            ("model checkpoint", args.checkpoint),
        )
        if path is None or not path.is_file()
    ]
    if missing:
        return not_evaluated("ovitrap_image_level_count", missing)
    labels_doc, predictions_doc = _read_json(args.labels), _read_json(args.predictions)
    label_pairs = labels_doc if isinstance(labels_doc, list) else labels_doc.get("samples")
    prediction_pairs = (
        predictions_doc if isinstance(predictions_doc, list) else predictions_doc.get("samples")
    )
    if not isinstance(label_pairs, list) or not isinstance(prediction_pairs, list):
        raise ValueError(
            "Egg labels and predictions must be arrays (or objects containing 'samples')"
        )
    labels = {row["image_id"]: row for row in label_pairs}
    predictions = {row["image_id"]: row for row in prediction_pairs}
    if len(labels) != len(label_pairs) or len(predictions) != len(prediction_pairs):
        raise ValueError("Duplicate image_id in egg labels or predictions")
    if set(labels) != set(predictions):
        raise ValueError("Egg label and prediction image_id sets must match exactly")
    pairs = [
        {
            "image_id": image_id,
            "reference_count": labels[image_id]["reference_count"],
            "predicted_count": predictions[image_id]["predicted_count"],
        }
        for image_id in sorted(labels)
    ]
    result = egg_count_metrics(pairs, args.tolerance_absolute, args.tolerance_fraction)
    result.update(
        {
            "evaluation": "egg_count_per_image_only",
            "dataset_id": args.dataset_id,
            "split": args.split,
            "test_count": result["sample_count"],
            "source_mode": "EXTERNALLY_LABELLED_HELD_OUT",
            "dataset_sha256": sha256_file(args.labels),
            "checkpoint_sha256": sha256_file(args.checkpoint),
            "checkpoint_path": str(args.checkpoint),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return result


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser(
        "validate-dataset", help="validate configured local image/YOLO files"
    )
    validate.add_argument("--manifest", type=Path, default=Path("docs/dataset_manifest.v1.json"))
    validate.add_argument("--dataset", required=True)
    validate.add_argument("--root", type=Path, help="local dataset root; never downloaded")
    validate.add_argument("--seed", type=int, default=360)
    validate.add_argument(
        "--out", type=Path, default=Path("data/evaluations/dataset-validation.json")
    )
    drone = commands.add_parser("eval-drone", help="evaluate supplied held-out detector JSON")
    _evaluation_arguments(drone)
    drone.add_argument("--iou", type=float, default=0.5)
    egg = commands.add_parser("eval-eggs", help="evaluate supplied held-out image count JSON")
    _evaluation_arguments(egg)
    egg.add_argument("--tolerance-absolute", type=float, default=5.0)
    egg.add_argument("--tolerance-fraction", type=float, default=0.1)
    return parser


def _evaluation_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--labels", type=Path)
    parser.add_argument("--predictions", type=Path)
    parser.add_argument("--checkpoint", type=Path)
    parser.add_argument("--dataset-id", default="unconfigured")
    parser.add_argument("--split", default="test")
    parser.add_argument("--out", type=Path, required=True)


def main(argv: list[str] | None = None) -> int:
    args = make_parser().parse_args(argv)
    try:
        if args.command == "validate-dataset":
            raw = validate_dataset(args.manifest, args.dataset, args.root, args.seed)
            run_type = "dataset_validation"
            source_mode = "NOT_EVALUATED"
            metrics = None
            metadata = {
                key: raw.get(key)
                for key in (
                    "dataset_id",
                    "dataset_name",
                    "manifest_version",
                    "source_url",
                    "doi",
                    "licence",
                    "licence_status",
                    "metadata_status",
                    "configured_root",
                    "files_found",
                    "labelled_images",
                    "labelled_instances",
                    "split_counts",
                    "group_split_counts",
                    "dataset_sha256",
                    "split_policy",
                    "errors",
                    "warnings",
                )
            }
            artifacts = {"split_mapping": "split_mapping.json"}
            limitations = [
                "Dataset validation inventories local files only; no data is downloaded."
            ]
            if raw.get("warnings"):
                limitations.extend(raw["warnings"])
            run_material = {
                "manifest": sha256_file(args.manifest),
                "dataset_sha256": raw.get("dataset_sha256"),
                "seed": args.seed,
                "dataset_id": args.dataset,
            }
            mapping = raw.get("split_mapping", {})
        elif args.command == "eval-drone":
            raw = _eval_drone(args)
            run_type = "drone_detection_evaluation"
            source_mode = raw.get("source_mode", "NOT_EVALUATED")
            metrics = _metric_payload(raw)
            metadata = {
                key: raw.get(key)
                for key in (
                    "evaluation",
                    "dataset_id",
                    "split",
                    "dataset_sha256",
                    "checkpoint_sha256",
                    "checkpoint_path",
                    "iou_threshold",
                    "image_count",
                    "test_count",
                    "labelled_instance_count",
                    "prediction_count",
                    "missing_prerequisites",
                    "message",
                )
            }
            limitations = (
                [raw["biological_interpretation"]]
                if raw.get("biological_interpretation")
                else [raw.get("message", "Evaluation prerequisites are missing.")]
            )
            artifacts = {}
            run_material = {
                "labels": sha256_file(args.labels)
                if args.labels and args.labels.is_file()
                else None,
                "predictions": sha256_file(args.predictions)
                if args.predictions and args.predictions.is_file()
                else None,
                "checkpoint": raw.get("checkpoint_sha256"),
                "dataset_id": args.dataset_id,
                "split": args.split,
                "iou": args.iou,
            }
            mapping = None
        else:
            raw = _eval_eggs(args)
            run_type = "ovitrap_count_evaluation"
            source_mode = raw.get("source_mode", "NOT_EVALUATED")
            metrics = _metric_payload(raw)
            metadata = {
                key: raw.get(key)
                for key in (
                    "evaluation",
                    "dataset_id",
                    "split",
                    "dataset_sha256",
                    "checkpoint_sha256",
                    "checkpoint_path",
                    "sample_count",
                    "test_count",
                    "missing_prerequisites",
                    "message",
                )
            }
            limitations = [
                "Image-level egg count metrics do not establish empty-sample specificity, egg species, mosquito abundance, or dengue risk."
            ]
            if raw.get("message"):
                limitations.append(raw["message"])
            artifacts = {}
            run_material = {
                "labels": sha256_file(args.labels)
                if args.labels and args.labels.is_file()
                else None,
                "predictions": sha256_file(args.predictions)
                if args.predictions and args.predictions.is_file()
                else None,
                "checkpoint": raw.get("checkpoint_sha256"),
                "dataset_id": args.dataset_id,
                "split": args.split,
            }
            mapping = None

        stable_hash = hashlib.sha256(json.dumps(run_material, sort_keys=True).encode()).hexdigest()[
            :12
        ]
        run_id = f"{run_type}-{args.dataset if args.command == 'validate-dataset' else args.dataset_id}-{stable_hash}"
        report = {
            "schema_version": 1,
            "run_id": run_id,
            "run_type": run_type,
            "status": raw.get("status", "NOT_EVALUATED"),
            "source_mode": source_mode,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata,
            "metrics": metrics,
            "artifacts": artifacts,
            "limitations": limitations,
        }
        run_dir = args.out / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        report["artifacts"]["summary"] = "summary.json"
        if mapping is not None:
            _write_json(run_dir / "split_mapping.json", mapping)
        _write_json(run_dir / "summary.json", report)
        print(
            json.dumps(
                {key: report.get(key) for key in ("run_id", "status", "source_mode", "artifacts")},
                indent=2,
            )
        )
        return 0 if raw.get("status") != "INVALID" else 2
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"data-evaluation error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
