from __future__ import annotations

import csv
import io
import sys
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from scripts.prepare_egg_data import audit_mosqlimate, group_split  # noqa: E402
from scripts.prepare_user_egg_data import prepare as prepare_user_paddles  # noqa: E402
from scripts.train_egg_counter import grouped_mae, pallet_weights  # noqa: E402


def png(color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (32, 48), color)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_mosqlimate_audit_quarantines_conflicting_duplicate_pallets(tmp_path):
    archive = tmp_path / "synthetic.zip"
    rows = [
        {"Pallet ID": "10", "Eggs": "20", "File name": "10-a.png"},
        {"Pallet ID": "11", "Eggs": "30", "File name": "11-a.png"},
        {"Pallet ID": "12", "Eggs": "40", "File name": "missing.png"},
    ]
    with ZipFile(archive, "w") as output:
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
        output.writestr("data.csv", buffer.getvalue())
        output.writestr("images/10-a.png", png((120, 60, 20)))
        output.writestr("images/11-a.png", png((120, 60, 20)))
        output.writestr("images/stray.png", png((30, 90, 120)))

    accepted, audit = audit_mosqlimate(archive)

    assert accepted == []
    assert audit["missing_images"] == ["missing.png"]
    assert audit["unlabelled_images"] == ["stray.png"]
    assert audit["quarantined_groups"] == ["mosqlimate:10", "mosqlimate:11"]
    assert audit["conflicting_duplicates"] == [
        [{"file": "10-a.png", "count": 20}, {"file": "11-a.png", "count": 30}]
    ]


def test_split_keeps_pallet_photos_together_and_is_deterministic():
    rows = [
        {"file": f"{group}-{photo}.png", "count": group * 10, "group": f"pallet-{group}"}
        for group in range(40)
        for photo in range(3)
    ]
    first, second = group_split(rows, 360), group_split(rows, 360)
    assert first == second
    assignments = {}
    for row in first:
        assignments.setdefault(row["group"], set()).add(row["split"])
    assert all(len(splits) == 1 for splits in assignments.values())
    assert set().union(*(set(row["split"] for row in first),)) == {"train", "validation", "test"}


def test_each_pallet_has_equal_total_training_weight():
    rows = [{"group": "one"}, {"group": "one"}, {"group": "one"}, {"group": "two"}]
    weights = pallet_weights(rows)
    assert abs(float(weights[:3].sum()) - float(weights[3])) < 1e-6


def test_group_error_averages_observed_and_predicted_repeated_site_samples():
    records = [
        {"group": "site-direction:1-NE", "count": 0},
        {"group": "site-direction:1-NE", "count": 10},
    ]
    group_mae, image_mae = grouped_mae(records, np.asarray([2.0, 8.0]))
    assert group_mae == 0
    assert image_mae == 2


def test_user_paddle_manifest_splits_site_direction_groups(tmp_path):
    images = tmp_path / "images"
    images.mkdir()
    labels = tmp_path / "counts.csv"
    rows = []
    for group in range(10):
        for sample in range(3):
            code = f"{group + 1}-NE-{sample + 1}"
            (images / f"{code}.JPEG").write_bytes(png((group * 20, sample * 40, 80)))
            rows.append({"code": code, "count_obs": str(group * 10 + sample)})
    with labels.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=("code", "count_obs"))
        writer.writeheader()
        writer.writerows(rows)

    manifest = prepare_user_paddles(images, labels, tmp_path / "prepared")
    assignments = {}
    for row in manifest["records"]:
        assignments.setdefault(row["group"], set()).add(row["split"])
    assert len(manifest["records"]) == 30
    assert all(len(splits) == 1 for splits in assignments.values())
    assert {row["split"] for row in manifest["records"]} == {"train", "validation", "test"}
    assert manifest["audit"]["zero_count_images"] == 1
