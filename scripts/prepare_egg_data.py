"""Audit supplied count-labelled egg images and create leakage-resistant splits.

Copies into ignored local storage, without modifying or redistributing originals.
No missing count is inferred from a neighbouring photograph or filename.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import sys
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/api"))


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def group_split(records: list[dict], seed: int = 360) -> list[dict]:
    """Stratify physical pallets by count, keeping their photographs together."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for record in records:
        groups[record["group"]].append(record)
    ordered = sorted(groups, key=lambda g: (groups[g][0]["count"], g))
    assignment = {}
    # Each neighbouring band covers a similar count range; hash-order within it.
    for offset in range(0, len(ordered), 10):
        band = ordered[offset : offset + 10]
        band.sort(key=lambda g: sha256(f"{seed}:{g}".encode()))
        n = len(band)
        n_test = max(1, round(n * 0.15)) if n >= 3 else 0
        n_val = max(1, round(n * 0.15)) if n >= 3 else 0
        for index, group in enumerate(band):
            assignment[group] = (
                "test" if index < n_test else "validation" if index < n_test + n_val else "train"
            )
    return [{**r, "split": assignment[r["group"]]} for r in records]


def audit_mosqlimate(archive: Path) -> tuple[list[dict], dict]:
    with ZipFile(archive) as source:
        label_bytes = source.read("data.csv")
        rows = list(csv.DictReader(io.StringIO(label_bytes.decode("utf-8-sig"))))
        files = {
            Path(n).name: n
            for n in source.namelist()
            if n.lower().endswith((".jpg", ".jpeg", ".png")) and not n.startswith("__MACOSX/")
        }
        if len({r["File name"] for r in rows}) != len(rows):
            raise ValueError("Duplicate label rows require source review")
        records, invalid = [], []
        for r in rows:
            count = int(r["Eggs"])
            if not 0 <= count <= 10000:
                raise ValueError("Invalid technician count")
            name = r["File name"]
            if name not in files:
                continue
            content = source.read(files[name])
            try:
                with Image.open(io.BytesIO(content)) as image:
                    image.verify()
            except (OSError, ValueError) as error:
                invalid.append({"file": name, "reason": str(error)})
                continue
            records.append(
                {
                    "file": name,
                    "member": files[name],
                    "count": count,
                    "group": "mosqlimate:" + r["Pallet ID"],
                    "sha256": sha256(content),
                }
            )
        by_hash: dict[str, list[dict]] = defaultdict(list)
        by_group: dict[str, list[dict]] = defaultdict(list)
        for r in records:
            by_hash[r["sha256"]].append(r)
            by_group[r["group"]].append(r)
        conflicts = [rs for rs in by_hash.values() if len({r["count"] for r in rs}) > 1]
        quarantined = {r["group"] for rs in conflicts for r in rs}
        quarantined.update(g for g, rs in by_group.items() if len({r["count"] for r in rs}) > 1)
        # Even matching duplicate files can connect separately named pallets.
        parent = {g: g for g in by_group}

        def leader(g: str) -> str:
            while parent[g] != g:
                g = parent[g]
            return g

        for rs in by_hash.values():
            for r in rs[1:]:
                parent[leader(r["group"])] = leader(rs[0]["group"])
        excluded_roots = {leader(g) for g in quarantined}
        seen = set()
        accepted = []
        for r in sorted(records, key=lambda r: r["file"]):
            if leader(r["group"]) in excluded_roots or r["sha256"] in seen:
                continue
            seen.add(r["sha256"])
            accepted.append({**r, "group": leader(r["group"])})
        audit = {
            "archive_sha256": sha256(archive.read_bytes()),
            "labels_sha256": sha256(label_bytes),
            "archive_images": len(files),
            "label_rows": len(rows),
            "declared_pallets": len({r["Pallet ID"] for r in rows}),
            "missing_images": sorted(set(r["File name"] for r in rows) - files.keys()),
            "unlabelled_images": sorted(files.keys() - set(r["File name"] for r in rows)),
            "quarantined_groups": sorted(g for g in parent if leader(g) in excluded_roots),
            "conflicting_duplicates": [
                [{"file": r["file"], "count": r["count"]} for r in rs] for rs in conflicts
            ],
            "invalid_images": invalid,
            "accepted_unique_images": len(accepted),
            "accepted_groups": len({r["group"] for r in accepted}),
            "zero_count_images": sum(r["count"] == 0 for r in accepted),
        }
        return accepted, audit


def prepare(archive: Path, output: Path, seed: int = 360) -> dict:
    from app.egg_vision import suggest_roi

    records, audit = audit_mosqlimate(archive)
    records = group_split(records, seed)
    output.mkdir(parents=True, exist_ok=True)
    (output / "images").mkdir(exist_ok=True)
    crop_failures = []
    with ZipFile(archive) as source:
        for r in records:
            content = source.read(r.pop("member"))
            target = output / "images" / r["file"]
            target.write_bytes(content)
            r["path"] = target.resolve().as_posix()
            with Image.open(io.BytesIO(content)) as opened:
                image = ImageOps.exif_transpose(opened).convert("RGB")
                roi = suggest_roi(image)
            r["roi"] = roi
            if roi is None:
                crop_failures.append(r["file"])
            r["eligible"] = roi is not None
    # Nothing is reassigned based on model errors, quality outcomes or test results.
    manifest = {
        "version": 1,
        "dataset": "mosqlimate-local-v2",
        "seed": seed,
        "source": "https://data.mendeley.com/datasets/jd5txz2f7d/2",
        "licence": "CC BY 4.0",
        "audit": {**audit, "automatic_roi_failures": crop_failures},
        "limitations": [
            "Automatic substrate crops require visual review; coverage is not independently annotated.",
            "No zero-egg examples; no sensitivity/specificity or species identification claim.",
            "Multiple photos per pallet are grouped; metadata/filenames are never model features.",
        ],
        "records": records,
    }
    encoded = json.dumps(manifest, sort_keys=True).encode()
    manifest["dataset_sha256"] = sha256(encoded)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (output / "audit.json").write_text(
        json.dumps(manifest["audit"], indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=ROOT / "data/external/eggs-mosqlimate-v2")
    parser.add_argument("--seed", type=int, default=360)
    args = parser.parse_args()
    manifest = prepare(args.archive, args.out, args.seed)
    print(json.dumps(manifest["audit"], indent=2))
    for split in ("train", "validation", "test"):
        rs = [r for r in manifest["records"] if r["split"] == split and r["eligible"]]
        print(split, len(rs), "images", len({r["group"] for r in rs}), "pallets")


if __name__ == "__main__":
    main()
