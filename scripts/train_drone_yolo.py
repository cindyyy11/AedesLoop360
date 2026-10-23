"""Train a local YOLOv8 candidate-container detector on the grouped train split."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def select_training_subset(
    images: list[Path], fraction: float, seed: int, root: Path
) -> list[Path]:
    ordered = sorted(
        images,
        key=lambda image: hashlib.sha256(
            f"{seed}:train-subset:{image.relative_to(root).as_posix()}".encode()
        ).hexdigest(),
    )
    return ordered[: max(1, round(len(ordered) * fraction))]


def train(
    data: Path,
    output: Path,
    *,
    epochs: int,
    image_size: int,
    batch: int,
    fraction: float,
    threads: int,
    model_config: str,
    seed: int,
    run_name: str | None = None,
) -> dict:
    if not data.is_file():
        raise ValueError(f"Grouped dataset YAML not found: {data}")
    if not (data.parent / "group-split" / "train.txt").is_file():
        raise ValueError("Grouped training list is missing; run prepare_drone_group_split.py first")
    for split_file in ("train.txt", "val.txt", "test.txt"):
        listing = data.parent / "group-split" / split_file
        if not listing.is_file():
            raise ValueError(f"Grouped split list is missing: {listing}")
        for entry in listing.read_text(encoding="utf-8").splitlines():
            image = Path(entry.strip())
            if not image.is_file():
                raise ValueError(f"Image path in {split_file} does not resolve: {entry}")
            label = image.parents[1] / "labels" / f"{image.stem}.txt"
            if not label.is_file():
                raise ValueError(f"Label path in {split_file} does not resolve: {label}")
    train_images = [
        Path(line.strip())
        for line in (data.parent / "group-split" / "train.txt")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.strip()
    ]
    sampled_images = select_training_subset(train_images, fraction, seed, data.parent)
    manifest = json.loads(
        (data.parent / "group-split" / "manifest.json").read_text(encoding="utf-8")
    )
    class_names = manifest["class_names"]
    subset_boxes = Counter()
    subset_groups = set()
    for image in sampled_images:
        subset_groups.add(image.stem.split("_tile_", maxsplit=1)[0])
        annotation = image.parents[1] / "labels" / f"{image.stem}.txt"
        for line in annotation.read_text(encoding="utf-8").splitlines():
            if line.strip():
                subset_boxes[class_names[int(line.split()[0])]] += 1
    if any(subset_boxes[name] == 0 for name in class_names):
        raise ValueError("Deterministic training subset does not contain all classes")
    subset_list = (
        data.parent
        / "group-split"
        / f"train-seed-{manifest['seed']}-fraction-{int(fraction * 100):02d}.txt"
    )
    subset_list.write_text(
        "\n".join(image.resolve().as_posix() for image in sampled_images) + "\n",
        encoding="utf-8",
    )
    training_yaml = data.parent / "data.training.yaml"
    yaml_lines = data.read_text(encoding="utf-8").splitlines()
    training_yaml.write_text(
        "\n".join(
            f"train: {subset_list.resolve().as_posix()}" if line.startswith("train:") else line
            for line in yaml_lines
        )
        + "\n",
        encoding="utf-8",
    )
    if epochs < 1 or image_size < 64 or batch < 1 or threads < 1 or not 0 < fraction <= 1:
        raise ValueError(
            "epochs, batch, and threads must be positive, image size >= 64, and fraction in (0, 1]"
        )

    # The caller's Ultralytics settings include an MLflow path configured for a
    # different Windows project. Disable optional integrations in memory only;
    # do not rewrite their user-level settings.json file.
    from ultralytics.utils import SETTINGS

    dict.update(
        SETTINGS,
        {
            "clearml": False,
            "comet": False,
            "dvc": False,
            "mlflow": False,
            "neptune": False,
            "raytune": False,
            "tensorboard": False,
            "wandb": False,
        },
    )
    import torch

    torch.set_num_threads(threads)
    from ultralytics import YOLO

    model = YOLO(model_config)
    external_trackers = (".mlflow", ".wandb", ".comet", ".clearml", ".neptune", ".raytune")
    model.callbacks = {
        event: [
            callback
            for callback in callbacks
            if not any(
                tracker in getattr(callback, "__module__", "") for tracker in external_trackers
            )
        ]
        for event, callbacks in model.callbacks.items()
    }
    result = model.train(
        data=str(training_yaml.resolve()),
        epochs=epochs,
        imgsz=image_size,
        batch=batch,
        fraction=1.0,
        patience=max(5, min(epochs, 15)),
        workers=0,
        seed=seed,
        deterministic=True,
        device="cpu",
        project=str(output.resolve()),
        name=run_name or f"yolov8n-grouped-seed-{seed}-fraction-{int(fraction * 100):02d}",
        exist_ok=True,
        pretrained=model_config.endswith(".pt"),
        plots=False,
        cache=False,
    )
    save_dir = Path(result.save_dir)
    best_checkpoint = save_dir / "weights" / "best.pt"
    if not best_checkpoint.is_file():
        raise RuntimeError(f"Training completed without a best checkpoint at {best_checkpoint}")
    source_manifest = Path(model_config).parent.parent / "STARTING_POINT.json"
    source_provenance = (
        json.loads(source_manifest.read_text(encoding="utf-8")) if source_manifest.is_file() else {}
    )
    report = {
        "status": "COMPLETED",
        "run_type": "drone_detection_training",
        "dataset_yaml": str(data.resolve()),
        "training_yaml": str(training_yaml.resolve()),
        "training_subset_list": str(subset_list.resolve()),
        "model_config": model_config,
        "initial_checkpoint_sha256": (
            hashlib.sha256(Path(model_config).read_bytes()).hexdigest()
            if model_config.endswith(".pt") and Path(model_config).is_file()
            else None
        ),
        "official_pretrained_checkpoint_sha256": source_provenance.get("source_checkpoint_sha256"),
        "epochs_requested": epochs,
        "epochs_completed": len((save_dir / "results.csv").read_text(encoding="utf-8").splitlines())
        - 1,
        "image_size": image_size,
        "batch": batch,
        "training_fraction": fraction,
        "training_subset_image_count": len(sampled_images),
        "training_subset_source_group_count": len(subset_groups),
        "training_subset_boxes_by_class": dict(subset_boxes),
        "torch_num_threads": torch.get_num_threads(),
        "seed": seed,
        "device": "cpu",
        "external_experiment_tracking": "disabled; local JSON and training artifacts are used",
        "training_plots": "disabled to keep CPU memory use bounded; held-out evaluation plots are generated separately",
        "ultralytics_version": __import__("ultralytics").__version__,
        "checkpoint_path": str(best_checkpoint.resolve()),
        "training_artifact_dir": str(save_dir.resolve()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "evaluation_note": "The validation metrics from training are not the held-out test result; run evaluate_drone_yolo.py separately.",
    }
    (save_dir / "training_report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("data/models/drone"))
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--imgsz", type=int, default=416)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--fraction", type=float, default=1.0)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--model", default="yolov8n.yaml")
    parser.add_argument("--seed", type=int, default=360)
    parser.add_argument("--name")
    args = parser.parse_args()
    try:
        train(
            args.data.resolve(),
            args.out.resolve(),
            epochs=args.epochs,
            image_size=args.imgsz,
            batch=args.batch,
            fraction=args.fraction,
            threads=args.threads,
            model_config=args.model,
            seed=args.seed,
            run_name=args.name,
        )
        return 0
    except (OSError, ValueError, ImportError, RuntimeError) as error:
        print(f"drone training error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
