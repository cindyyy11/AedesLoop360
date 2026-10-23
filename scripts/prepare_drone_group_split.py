"""Create a deterministic, source-image-disjoint YOLO split from the local archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from data_evaluation import deterministic_split, sha256_file  # noqa: E402

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}
CLASS_NAMES = ["coconut_shell", "drum", "other_open_container", "tyre", "water_tank"]


def source_group(image: Path) -> str:
    """Return the original aerial source ID shared by Roboflow-generated tiles."""
    stem = image.stem
    return stem.split("_tile_", maxsplit=1)[0]


def label_path(image: Path) -> Path:
    parts = list(image.parts)
    image_index = len(parts) - 1 - parts[::-1].index("images")
    parts[image_index] = "labels"
    return Path(*parts).with_suffix(".txt")


def inspect_dataset(root: Path, seed: int) -> dict:
    if not root.is_dir():
        raise ValueError(f"Dataset root does not exist: {root}")
    images = sorted(
        path
        for split in ("train", "valid", "test")
        for path in (root / split / "images").glob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )
    if not images:
        raise ValueError("No images found in train/valid/test images directories")

    by_split: dict[str, list[Path]] = defaultdict(list)
    group_splits: dict[str, str] = {}
    class_counts = Counter()
    total_boxes = 0
    missing_labels = []
    for image in images:
        group = source_group(image)
        split = deterministic_split(group, seed)
        by_split[split].append(image)
        if group in group_splits and group_splits[group] != split:
            raise AssertionError(f"Source group {group} was assigned to multiple splits")
        group_splits[group] = split
        annotation = label_path(image)
        if not annotation.is_file():
            missing_labels.append(str(annotation.relative_to(root)))
            continue
        for line_number, line in enumerate(annotation.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            fields = line.split()
            if len(fields) != 5:
                raise ValueError(f"Malformed YOLO label {annotation}:{line_number}")
            class_id = int(fields[0])
            coordinates = [float(value) for value in fields[1:]]
            if class_id < 0 or class_id >= len(CLASS_NAMES):
                raise ValueError(f"Out-of-range class id in {annotation}:{line_number}")
            if any(value < 0 or value > 1 for value in coordinates):
                raise ValueError(f"Out-of-range normalized box in {annotation}:{line_number}")
            if coordinates[2] <= 0 or coordinates[3] <= 0:
                raise ValueError(f"Non-positive box size in {annotation}:{line_number}")
            class_counts[(split, class_id)] += 1
            total_boxes += 1
    if missing_labels:
        raise ValueError(f"Missing {len(missing_labels)} labels; first: {missing_labels[0]}")
    if not all(by_split[name] for name in ("train", "validation", "test")):
        raise ValueError("Deterministic grouped split left one or more splits empty")
    if not all(class_counts[("train", class_id)] for class_id in range(len(CLASS_NAMES))):
        raise ValueError("At least one class has no training annotations in this split")

    split_groups = {
        split: {source_group(image) for image in split_images}
        for split, split_images in by_split.items()
    }
    overlaps = {
        f"{first}_{second}": sorted(split_groups[first] & split_groups[second])
        for first, second in (("train", "validation"), ("train", "test"), ("validation", "test"))
    }
    if any(overlaps.values()):
        raise AssertionError("Source-group overlap detected")

    split_dir = root / "group-split"
    split_dir.mkdir(exist_ok=True)
    for split, split_images in by_split.items():
        list_name = "val.txt" if split == "validation" else f"{split}.txt"
        if split == "train":
            split_images = sorted(
                split_images,
                key=lambda image: hashlib.sha256(
                    f"{seed}:train-order:{image.relative_to(root).as_posix()}".encode()
                ).hexdigest(),
            )
        entries = [image.resolve().as_posix() for image in split_images]
        (split_dir / list_name).write_text("\n".join(entries) + "\n", encoding="utf-8")
    yaml_path = root / "data.grouped.yaml"
    yaml_path.write_text(
        f"path: {root.resolve().as_posix()}\n"
        f"train: {(split_dir / 'train.txt').resolve().as_posix()}\n"
        f"val: {(split_dir / 'val.txt').resolve().as_posix()}\n"
        f"test: {(split_dir / 'test.txt').resolve().as_posix()}\n"
        f"nc: {len(CLASS_NAMES)}\n"
        f"names: {json.dumps(CLASS_NAMES)}\n",
        encoding="utf-8",
    )

    report = {
        "dataset_id": "drone-aedes-habitat-mendeley-v1-yolov8-local",
        "dataset_root": str(root.resolve()),
        "dataset_doi": "10.17632/vr3kkt9mvn.1",
        "source_mode": "EXTERNALLY_LABELLED",
        "license_source": "Mendeley Data record declares CC BY 4.0; embedded Roboflow YAML says Private",
        "split_method": "sha256(seed:source_image_id) modulo 10000; tiles remain together",
        "training_list_order": "Deterministic SHA-256 order by seed and relative path; Ultralytics fraction selects across the train groups instead of a filename prefix.",
        "seed": seed,
        "class_names": CLASS_NAMES,
        "image_count": len(images),
        "box_count": total_boxes,
        "source_group_count": len(group_splits),
        "split_counts": {
            name: {
                "images": len(by_split[name]),
                "source_groups": len(split_groups[name]),
                "boxes_by_class": {
                    CLASS_NAMES[class_id]: class_counts[(name, class_id)]
                    for class_id in range(len(CLASS_NAMES))
                },
            }
            for name in ("train", "validation", "test")
        },
        "source_group_overlaps": overlaps,
        "published_split_overlap_note": "The publisher's tile-level split was preserved; source groups cross published splits, so this grouped split is used for training/evaluation.",
        "split_yaml": str(yaml_path.resolve()),
    }
    digest = hashlib.sha256()
    for split in ("train", "validation", "test"):
        for image in by_split[split]:
            label = label_path(image)
            digest.update(image.relative_to(root).as_posix().encode())
            digest.update(sha256_file(image).encode())
            digest.update(label.relative_to(root).as_posix().encode())
            digest.update(sha256_file(label).encode())
    report["dataset_sha256"] = digest.hexdigest()
    report_path = split_dir / "manifest.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    report["manifest_path"] = str(report_path.resolve())
    print(json.dumps(report, indent=2))
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=360)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        inspect_dataset(args.root.resolve(), args.seed)
        return 0
    except (OSError, ValueError, AssertionError) as error:
        print(f"dataset preparation error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
