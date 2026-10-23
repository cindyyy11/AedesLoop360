from __future__ import annotations

import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"
sys.path.insert(0, str(SCRIPTS))

import prepare_drone_group_split as split_tools  # noqa: E402
from data_evaluation import validate_dataset  # noqa: E402
from evaluate_drone_yolo import hash_test_data  # noqa: E402
from train_drone_yolo import select_training_subset  # noqa: E402


def _image(root: Path, published_split: str, group: str, tile: str) -> None:
    stem = f"{group}_tile_{tile}.rf.hash"
    image = root / published_split / "images" / f"{stem}.jpg"
    label = root / published_split / "labels" / f"{stem}.txt"
    image.parent.mkdir(parents=True, exist_ok=True)
    label.parent.mkdir(parents=True, exist_ok=True)
    image.write_bytes(str(image).encode("utf-8"))
    label.write_text(
        "".join(f"{class_id} 0.5 0.5 0.2 0.2\n" for class_id in range(5)),
        encoding="utf-8",
    )


def test_group_split_keeps_tiles_together_even_when_publisher_splits_them(tmp_path, monkeypatch):
    assignments = {"DJI_0001": "train", "DJI_0002": "validation", "DJI_0003": "test"}
    monkeypatch.setattr(split_tools, "deterministic_split", lambda group, seed: assignments[group])
    for group in assignments:
        _image(tmp_path, "train", group, "0_0")
        _image(tmp_path, "valid", group, "512_0")
        _image(tmp_path, "test", group, "1024_0")

    report = split_tools.inspect_dataset(tmp_path, seed=360)

    assert report["image_count"] == 9
    assert report["source_group_overlaps"] == {
        "train_validation": [],
        "train_test": [],
        "validation_test": [],
    }
    assert report["split_counts"]["train"]["source_groups"] == 1
    assert report["split_counts"]["validation"]["source_groups"] == 1
    assert report["split_counts"]["test"]["source_groups"] == 1
    manifest = json.loads((tmp_path / "group-split" / "manifest.json").read_text())
    assert manifest["seed"] == 360


def test_test_dataset_hash_requires_matching_label_files(tmp_path):
    image = tmp_path / "test" / "images" / "one.jpg"
    label = tmp_path / "test" / "labels" / "one.txt"
    image.parent.mkdir(parents=True)
    label.parent.mkdir(parents=True)
    image.write_bytes(b"image bytes")
    label.write_text("", encoding="utf-8")
    image_list = tmp_path / "group-split" / "test.txt"
    image_list.parent.mkdir()
    image_list.write_text("test/images/one.jpg\n", encoding="utf-8")

    digest, count = hash_test_data(tmp_path, image_list)

    assert len(digest) == 64
    assert count == 1


def test_training_subset_selection_is_reproducible_and_not_a_filename_prefix(tmp_path):
    images = [tmp_path / "train" / "images" / f"image-{index:03d}.jpg" for index in range(20)]

    first = select_training_subset(images, fraction=0.15, seed=360, root=tmp_path)
    second = select_training_subset(images, fraction=0.15, seed=360, root=tmp_path)

    assert first == second
    assert len(first) == 3
    assert first != images[:3]


def test_manifest_validator_handles_publisher_layout_and_source_tiles(tmp_path):
    root = tmp_path / "data"
    manifest_path = tmp_path / "docs" / "dataset-manifest.json"
    manifest_path.parent.mkdir(parents=True)
    for split, tile in (("train", "0"), ("valid", "512"), ("test", "1024")):
        for group in ("DJI_0100", "DJI_0101"):
            _image(root, split, group, tile)
    manifest = {
        "manifest_version": 1,
        "datasets": [
            {
                "id": "drone",
                "name": "test drone data",
                "classes": [
                    "coconut_shell",
                    "drum",
                    "other_open_container",
                    "tyre",
                    "water_tank",
                ],
                "configured_root": "../data",
                "split_image_dirs": {
                    "train": "train/images",
                    "validation": "valid/images",
                    "test": "test/images",
                },
                "split_label_dirs": {
                    "train": "train/labels",
                    "validation": "valid/labels",
                    "test": "test/labels",
                },
                "group_id_regex": "(?P<group>.+?)_tile_.*",
            }
        ],
    }
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    report = validate_dataset(manifest_path, "drone", None, seed=360)

    assert report["status"] == "VALIDATED"
    assert report["files_found"] == 6
    assert report["labelled_images"] == 6
    assert sum(report["group_split_counts"].values()) == 2
    assert "Group leakage detected across splits." not in report["errors"]
