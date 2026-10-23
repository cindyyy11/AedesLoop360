"""Preflight independent field data without claiming model performance.

Expected layout and CSV columns are documented in docs/FIELD_VALIDATION.md.
This command reads images and labels; it never trains, predicts, or registers a run.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from datetime import datetime
from pathlib import Path

from PIL import Image, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]
CLASSES = ("coconut_shell", "drum", "other_open_container", "tyre", "water_tank")
DRONE_COLUMNS = {
    "image",
    "site_id",
    "flight_id",
    "reviewed_by",
    "rights",
    "independent_site_attested",
}
EGG_COLUMNS = {
    "image",
    "site_id",
    "trap_id",
    "substrate_id",
    "interval_start",
    "interval_end",
    "reference_count",
    "quality",
    "reviewed_by",
    "rights",
    "independent_site_attested",
}


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def csv_rows(path: Path, required: set[str]) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"{path.name} needs columns: {', '.join(sorted(required))}")
        rows = list(reader)
    if not rows:
        raise ValueError(f"{path.name} has no rows")
    return rows


def checked_image(folder: Path, name: str) -> tuple[str, tuple[int, int]]:
    if (
        not name
        or Path(name).name != name
        or Path(name).suffix.lower() not in {".png", ".jpg", ".jpeg"}
    ):
        raise ValueError("image must be a PNG/JPEG filename without directories")
    path = folder / name
    content = path.read_bytes()
    with Image.open(io.BytesIO(content)) as image:
        if image.format not in {"PNG", "JPEG"} or image.width * image.height > 16_000_000:
            raise ValueError("unsupported image format or dimensions")
        size = image.size
        image.verify()
    return digest(content), size


def attest(row: dict[str, str]) -> None:
    if row["independent_site_attested"].strip().lower() != "true":
        raise ValueError("independent_site_attested must be true after a human provenance check")
    for column in ("site_id", "reviewed_by", "rights"):
        if not row[column].strip():
            raise ValueError(f"{column} is required")


def audit_drone(folder: Path, known_hashes: set[str]) -> dict:
    if not folder.is_dir():
        return {"status": "MISSING_DATA", "images": 0, "errors": ["drone folder absent"]}
    errors: list[str] = []
    counts: Counter[str] = Counter()
    seen_images: set[str] = set()
    seen_hashes: set[str] = set()
    sites: set[str] = set()
    try:
        rows = csv_rows(folder / "manifest.csv", DRONE_COLUMNS)
    except (OSError, ValueError) as exc:
        return {"status": "INVALID", "images": 0, "errors": [str(exc)]}
    for index, row in enumerate(rows, 2):
        try:
            attest(row)
            if not row["flight_id"].strip():
                raise ValueError("flight_id is required")
            name = row["image"]
            if name.casefold() in seen_images:
                raise ValueError("duplicate image filename")
            seen_images.add(name.casefold())
            image_hash, _ = checked_image(folder / "images", name)
            if image_hash in seen_hashes or image_hash in known_hashes:
                raise ValueError("duplicate image content or overlap with existing drone data")
            seen_hashes.add(image_hash)
            sites.add(row["site_id"].strip())
            label = folder / "labels" / f"{Path(name).stem}.txt"
            for line in label.read_text(encoding="utf-8").splitlines():
                parts = line.split()
                if len(parts) != 5:
                    raise ValueError("YOLO label must have class,x_center,y_center,width,height")
                class_id = int(parts[0])
                values = [float(value) for value in parts[1:]]
                if (
                    class_id not in range(len(CLASSES))
                    or not all(0 <= value <= 1 for value in values)
                    or min(values[2:]) <= 0
                ):
                    raise ValueError("invalid class or normalized YOLO box")
                counts[CLASSES[class_id]] += 1
        except (OSError, ValueError, UnidentifiedImageError) as exc:
            errors.append(f"manifest.csv:{index}: {exc}")
    return {
        "status": "INVALID" if errors else "READY_FOR_EVALUATION",
        "images": len(rows),
        "sites": len(sites),
        "boxes_by_class": dict(counts),
        "errors": errors,
    }


def audit_eggs(folder: Path, known_hashes: set[str]) -> dict:
    if not folder.is_dir():
        return {"status": "MISSING_DATA", "images": 0, "errors": ["eggs folder absent"]}
    errors: list[str] = []
    seen_images: set[str] = set()
    seen_hashes: set[str] = set()
    intervals: set[tuple[str, str, str, str]] = set()
    sites: set[str] = set()
    zero_count = 0
    try:
        rows = csv_rows(folder / "manifest.csv", EGG_COLUMNS)
    except (OSError, ValueError) as exc:
        return {"status": "INVALID", "images": 0, "errors": [str(exc)]}
    for index, row in enumerate(rows, 2):
        try:
            attest(row)
            if not row["trap_id"].strip() or not row["substrate_id"].strip():
                raise ValueError("trap_id and substrate_id are required")
            name = row["image"]
            if name.casefold() in seen_images:
                raise ValueError("duplicate image filename")
            seen_images.add(name.casefold())
            image_hash, _ = checked_image(folder / "images", name)
            if image_hash in seen_hashes or image_hash in known_hashes:
                raise ValueError("duplicate image content or overlap with existing egg data")
            seen_hashes.add(image_hash)
            start = datetime.fromisoformat(row["interval_start"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(row["interval_end"].replace("Z", "+00:00"))
            if start.tzinfo is None or end.tzinfo is None or end <= start:
                raise ValueError("collection interval must be timezone-aware and positive")
            key = (row["trap_id"], row["substrate_id"], row["interval_start"], row["interval_end"])
            if key in intervals:
                raise ValueError("duplicate physical substrate collection interval")
            intervals.add(key)
            count = int(row["reference_count"])
            if count < 0 or row["quality"] not in {"VALID", "UNCERTAIN", "INVALID"}:
                raise ValueError(
                    "count must be non-negative and quality must be VALID, UNCERTAIN, or INVALID"
                )
            zero_count += count == 0 and row["quality"] == "VALID"
            sites.add(row["site_id"].strip())
        except (OSError, ValueError, UnidentifiedImageError) as exc:
            errors.append(f"manifest.csv:{index}: {exc}")
    return {
        "status": "INVALID" if errors else "READY_FOR_EVALUATION",
        "images": len(rows),
        "sites": len(sites),
        "valid_zero_count_images": zero_count,
        "negative_specificity_ready": bool(zero_count) and not errors,
        "errors": errors,
    }


def known_egg_hashes(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    return {
        row["sha256"]
        for row in json.loads(path.read_text(encoding="utf-8")).get("records", [])
        if row.get("sha256")
    }


def known_image_hashes(folder: Path) -> set[str]:
    return {
        digest(path.read_bytes())
        for path in folder.rglob("*")
        if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg"}
    }


def audit(
    root: Path, known_drone: Path, known_eggs: Path, known_public_eggs: Path | None = None
) -> dict:
    drone = audit_drone(
        root / "drone", known_drone_hashes(known_drone) if (root / "drone").is_dir() else set()
    )
    egg_hashes = known_egg_hashes(known_eggs)
    if (root / "eggs").is_dir() and known_public_eggs is not None:
        egg_hashes |= known_image_hashes(known_public_eggs)
    eggs = audit_eggs(root / "eggs", egg_hashes)
    statuses = {drone["status"], eggs["status"]}
    status = (
        "INVALID"
        if "INVALID" in statuses
        else "READY_FOR_EVALUATION"
        if statuses == {"READY_FOR_EVALUATION"}
        else "MISSING_DATA"
    )
    return {
        "status": status,
        "evaluation_performed": False,
        "drone": drone,
        "eggs": eggs,
        "limitations": [
            "Site independence is a human attestation; file checks cannot prove it.",
            "READY_FOR_EVALUATION is a data preflight result, not model accuracy or field validation.",
        ],
    }


def known_drone_hashes(root: Path) -> set[str]:
    return {
        digest(path.read_bytes())
        for split in ("train", "valid", "test")
        for path in (root / split / "images").glob("*")
        if path.is_file()
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT / "data/field-validation")
    parser.add_argument(
        "--known-drone", type=Path, default=ROOT / "data/external/drone-aedes-yolov8-v1"
    )
    parser.add_argument(
        "--known-eggs",
        type=Path,
        default=ROOT / "data/external/user-ovitrap-monitor/grouped-v1/manifest.json",
    )
    parser.add_argument(
        "--known-public-eggs",
        type=Path,
        default=ROOT / "data/external/eggs-mosqlimate-v2/images",
    )
    parser.add_argument("--out", type=Path, default=ROOT / "data/evaluations/field/preflight.json")
    args = parser.parse_args()
    result = audit(args.root, args.known_drone, args.known_eggs, args.known_public_eggs)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if result["status"] != "INVALID" else 2


if __name__ == "__main__":
    raise SystemExit(main())
