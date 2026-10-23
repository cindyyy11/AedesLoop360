"""Evaluate a trained Ultralytics detector on the grouped held-out test set."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from data_evaluation import sha256_file  # noqa: E402


def hash_test_data(root: Path, image_list: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    entries = [
        line.strip() for line in image_list.read_text(encoding="utf-8").splitlines() if line.strip()
    ]
    if not entries:
        raise ValueError("Held-out test list is empty")
    for entry in sorted(entries):
        image = root / Path(entry)
        label = image.parents[1] / "labels" / f"{image.stem}.txt"
        if not image.is_file() or not label.is_file():
            raise ValueError(f"Missing test image or label for {entry}")
        digest.update(entry.encode("utf-8"))
        digest.update(sha256_file(image).encode("ascii"))
        digest.update(sha256_file(label).encode("ascii"))
    return digest.hexdigest(), len(entries)


def metric_float(value: Any) -> float:
    return float(value.item() if hasattr(value, "item") else value)


def class_metrics(metrics: Any, names: dict[int, str]) -> dict[str, dict[str, float]]:
    box = metrics.box
    result = {}
    for metric_index, class_id in enumerate(box.ap_class_index):
        precision, recall, ap50, ap = box.class_result(metric_index)
        result[names[int(class_id)]] = {
            "precision": metric_float(precision),
            "recall": metric_float(recall),
            "map_50": metric_float(ap50),
            "map_50_95": metric_float(ap),
            "test_instances": int(metrics.nt_per_class[int(class_id)]),
        }
    return result


def evaluate(checkpoint: Path, dataset_yaml: Path, output_dir: Path) -> dict[str, Any]:
    if not checkpoint.is_file():
        raise ValueError(f"Checkpoint not found: {checkpoint}")
    if not dataset_yaml.is_file():
        raise ValueError(f"Grouped dataset YAML not found: {dataset_yaml}")
    root = dataset_yaml.parent.resolve()
    test_list = root / "group-split" / "test.txt"
    data_digest, test_count = hash_test_data(root, test_list)

    from ultralytics import YOLO

    model = YOLO(str(checkpoint))
    training_report_path = checkpoint.parent.parent / "training_report.json"
    training_provenance = (
        json.loads(training_report_path.read_text(encoding="utf-8"))
        if training_report_path.is_file()
        else {}
    )
    initial_model_path = Path(training_provenance.get("model_config") or "")
    source_manifest_path = initial_model_path.parent.parent / "STARTING_POINT.json"
    source_provenance = (
        json.loads(source_manifest_path.read_text(encoding="utf-8"))
        if source_manifest_path.is_file()
        else {}
    )
    image_size = int(training_provenance.get("image_size", 640))
    run_id = f"drone-yolo-group-test-{uuid.uuid4().hex}"
    validation = model.val(
        data=str(dataset_yaml),
        split="test",
        imgsz=image_size,
        plots=True,
        project=str(output_dir.resolve()),
        name=run_id,
        exist_ok=True,
        device="cpu",
    )
    box = validation.box
    result_metrics = {
        "precision": metric_float(box.mp),
        "recall": metric_float(box.mr),
        "map_50": metric_float(box.map50),
        "map_50_95": metric_float(box.map),
        "per_class": class_metrics(validation, model.names),
        "latency_ms_per_image": {
            key: metric_float(value) for key, value in validation.speed.items()
        },
    }
    save_dir = Path(validation.save_dir)
    artifacts = []
    for file in sorted(save_dir.glob("*.png")):
        artifacts.append({"name": file.name, "sha256": sha256_file(file)})
    checkpoint_digest = sha256_file(checkpoint)
    metadata = {
        "dataset_id": "drone-aedes-habitat-mendeley-v1-yolov8-local",
        "dataset_doi": "10.17632/vr3kkt9mvn.1",
        "split": "test",
        "split_method": "source-image grouped deterministic 70/15/15 split, seed 360",
        "test_count": test_count,
        "test_source_group_count": len(
            {
                Path(entry).stem.split("_tile_", maxsplit=1)[0]
                for entry in test_list.read_text(encoding="utf-8").splitlines()
                if entry.strip()
            }
        ),
        "dataset_sha256": data_digest,
        "checkpoint_sha256": checkpoint_digest,
        "model_sha256": checkpoint_digest,
        "checkpoint_path": str(checkpoint.resolve()),
        "initial_checkpoint_sha256": training_provenance.get("initial_checkpoint_sha256"),
        "official_pretrained_checkpoint_sha256": training_provenance.get(
            "official_pretrained_checkpoint_sha256"
        )
        or source_provenance.get("source_checkpoint_sha256"),
        "initial_model_config": training_provenance.get("model_config"),
        "training_subset_image_count": training_provenance.get("training_subset_image_count"),
        "epochs_completed": training_provenance.get("epochs_completed"),
        "ultralytics_version": __import__("ultralytics").__version__,
        "device": "cpu",
        "image_size": image_size,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "evaluation_scope": "Candidate-container object detection only; does not detect standing water, larvae, Aedes species, intervention eligibility, or dengue risk.",
    }
    limitations = [
        "Dataset classes are candidate container objects, not confirmed larval habitats.",
        "The test set is grouped by source image to avoid tile leakage across train, validation, and test.",
        "The publisher's original tile-level split contains source-image overlap across splits.",
        "The source Mendeley page declares CC BY 4.0, while the embedded Roboflow export metadata says Private; local use is recorded, redistribution rights require clarification.",
        "The source dataset is not a locally representative field validation in Malaysia.",
    ]
    for class_name, class_result in result_metrics["per_class"].items():
        if class_result["recall"] < 0.5:
            limitations.append(
                f"{class_name} test recall is {class_result['recall']:.1%}; missed candidate objects still require review of the full image."
            )
        if class_result["test_instances"] < 30:
            limitations.append(
                f"{class_name} has only {class_result['test_instances']} labelled test objects; its class estimate is uncertain."
            )
    report = {
        "run_id": run_id,
        "run_type": "drone_detection_evaluation",
        "status": "COMPLETED",
        "source_mode": "EXTERNALLY_LABELLED_HELD_OUT",
        "metadata": metadata,
        "metrics": result_metrics,
        "artifacts": artifacts,
        "limitations": limitations,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = output_dir / f"{run_id}.json"
    summary_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    report["summary_path"] = str(summary_path.resolve())
    print(json.dumps(report, indent=2))
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("data/evaluations/drone"))
    args = parser.parse_args()
    try:
        evaluate(args.checkpoint.resolve(), args.data.resolve(), args.out.resolve())
        return 0
    except (OSError, ValueError, ImportError) as error:
        print(f"drone evaluation error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
