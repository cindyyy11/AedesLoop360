"""Audit user-supplied ovitrap photos and make a conservative site-grouped split."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import sys
from statistics import median
from collections import defaultdict
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "services/api"))
from scripts.prepare_egg_data import group_split  # noqa: E402

# Shared, fixed geometry from visual inspection of representative paddle photos.
# This is not inferred from labels and is editable at upload/review time in the UI.
PADDLE_ROI = [0.36, 0.04, 0.66, 0.99]


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def prepare(images: Path, labels: Path, output: Path, seed: int = 360) -> dict:
    with labels.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if not rows or not {"code", "count_obs"}.issubset(rows[0]):
        raise ValueError("Expected CSV columns code,count_obs")
    if len({row["code"].casefold() for row in rows}) != len(rows):
        raise ValueError("Duplicate label codes")
    files = {}
    for path in images.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png"}:
            stem = path.stem.casefold()
            if stem in files:
                raise ValueError(f"Duplicate image stem: {path.stem}")
            files[stem] = path
    records, missing = [], []
    for row in rows:
        code = row["code"].strip()
        count = int(row["count_obs"])
        if count < 0 or count > 10000:
            raise ValueError(f"Count outside supported range for {code}")
        path = files.get(code.casefold())
        if not path:
            missing.append(code)
            continue
        parts = code.split("-")
        if len(parts) != 3:
            raise ValueError(f"Unexpected sample code shape: {code}")
        content = path.read_bytes()
        with Image.open(path) as image:
            image.verify()
        group = "site-direction:" + "-".join(parts[:2])
        records.append(
            {
                "file": path.name,
                "code": code,
                "path": str(path.resolve()),
                "count": count,
                "group": group,
                "sha256": sha256(content),
                "roi": PADDLE_ROI,
                "eligible": True,
            }
        )

    hash_groups: dict[str, list[dict]] = defaultdict(list)
    for row in records:
        hash_groups[row["sha256"]].append(row)
    # Do not allow identical pixels under different labels to cross splits.
    conflict_hashes = {
        digest
        for digest, copies in hash_groups.items()
        if len({row["count"] for row in copies}) > 1
    }
    parent = {row["group"]: row["group"] for row in records}

    def leader(group: str) -> str:
        while parent[group] != group:
            parent[group] = parent[parent[group]]
            group = parent[group]
        return group

    for copies in hash_groups.values():
        for row in copies[1:]:
            parent[leader(row["group"])] = leader(copies[0]["group"])
    excluded = {leader(row["group"]) for digest in conflict_hashes for row in hash_groups[digest]}
    deduped, seen = [], set()
    for row in sorted(records, key=lambda entry: entry["code"]):
        group = leader(row["group"])
        if group in excluded or row["sha256"] in seen:
            continue
        seen.add(row["sha256"])
        deduped.append({**row, "group": group})
    group_counts: dict[str, list[int]] = defaultdict(list)
    for row in deduped:
        group_counts[row["group"]].append(row["count"])
    group_assignments = group_split(
        [
            {"group": group, "count": round(median(counts))}
            for group, counts in group_counts.items()
        ],
        seed,
    )
    assignment = {row["group"]: row["split"] for row in group_assignments}
    split = [{**row, "split": assignment[row["group"]]} for row in deduped]
    output.mkdir(parents=True, exist_ok=True)
    (output / "images").mkdir(exist_ok=True)
    for row in split:
        target = output / "images" / row["file"]
        shutil.copyfile(files[row["code"].casefold()], target)
        row["path"] = target.resolve().as_posix()
    audit = {
        "label_rows": len(rows),
        "matched_images": len(records),
        "missing_images": missing,
        "unlabelled_images": sorted(set(files) - {row["code"].casefold() for row in rows}),
        "exact_duplicate_image_groups": sum(len(copies) > 1 for copies in hash_groups.values()),
        "conflicting_duplicate_image_hashes": len(conflict_hashes),
        "usable_images": len(split),
        "site_direction_groups": len({row["group"] for row in split}),
        "count_min": min(row["count"] for row in split),
        "count_max": max(row["count"] for row in split),
        "zero_count_images": sum(row["count"] == 0 for row in split),
        "split_counts": {
            name: {
                "images": sum(row["split"] == name for row in split),
                "groups": len({row["group"] for row in split if row["split"] == name}),
            }
            for name in ("train", "validation", "test")
        },
    }
    manifest = {
        "version": 1,
        "dataset": "user-supplied-ovitrap-paddles",
        "seed": seed,
        "grouping_unit": "site_direction_group",
        "labels_sha256": sha256(labels.read_bytes()),
        "grouping_assumption": "first two sample-code segments identify a site/direction group; source documentation has not confirmed this interpretation",
        "roi_source": "fixed normalized paddle crop from visual inspection; no label-dependent crop fitting",
        "audit": audit,
        "limitations": [
            "Group key interpretation is an assumption; verify sample-code provenance.",
            "Labels have no zero-count examples.",
            "Counts are user-supplied observed counts; no species confirmation is inferred.",
        ],
        "records": split,
    }
    stable_records = [
        {key: row[key] for key in ("code", "count", "group", "sha256", "roi", "split")}
        for row in split
    ]
    manifest["dataset_sha256"] = sha256(
        json.dumps(
            {"labels_sha256": manifest["labels_sha256"], "records": stable_records}, sort_keys=True
        ).encode()
    )
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (output / "audit.json").write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--images",
        type=Path,
        default=ROOT / "data/external/user-ovitrap-monitor/images/ovitrap_sample_pics",
    )
    parser.add_argument(
        "--labels",
        type=Path,
        default=ROOT / "data/external/user-ovitrap-monitor/observed_egg_counts.csv",
    )
    parser.add_argument(
        "--out", type=Path, default=ROOT / "data/external/user-ovitrap-monitor/grouped-v1"
    )
    parser.add_argument("--seed", type=int, default=360)
    args = parser.parse_args()
    manifest = prepare(args.images, args.labels, args.out, args.seed)
    print(json.dumps(manifest["audit"], indent=2))


if __name__ == "__main__":
    main()
