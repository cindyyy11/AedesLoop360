"""Evaluate a frozen egg model on the separately supplied ovitrap image/count set."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/api"))
from app.egg_vision import infer_egg_count  # noqa: E402

DEFAULT_ROI = [0.36, 0.04, 0.72, 0.99]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
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
        "--checkpoint",
        type=Path,
        help="Model checkpoint; defaults to the candidate selected in the validation comparison",
    )
    parser.add_argument(
        "--comparison",
        type=Path,
        default=ROOT / "data/models/eggs/validation-comparison.json",
        help="Internal validation comparison used to select the default checkpoint",
    )
    parser.add_argument(
        "--out", type=Path, default=ROOT / "data/models/eggs/external-ovitrap-evaluation.json"
    )
    parser.add_argument(
        "--roi",
        default=",".join(map(str, DEFAULT_ROI)),
        help="One predeclared normalized ROI for every paddle photo",
    )
    args = parser.parse_args()
    roi = [float(value) for value in args.roi.split(",")]
    if len(roi) != 4 or not (0 <= roi[0] < roi[2] <= 1 and 0 <= roi[1] < roi[3] <= 1):
        raise ValueError("--roi must be normalized x1,y1,x2,y2")
    selection = None
    checkpoint = args.checkpoint
    if checkpoint is None:
        selection = json.loads(args.comparison.read_text(encoding="utf-8"))
        if selection.get("status") != "VALIDATION_COMPLETE_TEST_NOT_RUN":
            raise ValueError("Expected a validation comparison with untouched test split")
        checkpoint = args.comparison.parent / selection["selected_checkpoint"]
    if not checkpoint.is_file():
        raise FileNotFoundError(checkpoint)
    os.environ["AEDES_EGG_MODEL_PATH"] = str(checkpoint.resolve())
    files: dict[str, Path] = {}
    for path in args.images.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png"}:
            key = path.stem.casefold()
            if key in files:
                raise ValueError(f"Duplicate image stem: {path.stem}")
            files[key] = path
    with args.labels.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if not rows or not {"code", "count_obs"}.issubset(rows[0]):
        raise ValueError("Expected CSV columns code,count_obs")
    if len({row["code"].casefold() for row in rows}) != len(rows):
        raise ValueError("Duplicate label code")

    matched, missing = [], []
    for row in rows:
        count = int(row["count_obs"])
        if count < 0:
            raise ValueError(f"Negative observed count for {row['code']}")
        image = files.get(row["code"].casefold())
        if image is None:
            missing.append(row["code"])
        else:
            matched.append((row["code"], count, image))
    predictions, observed, outcomes, image_hashes, scored = [], [], [], [], []
    for code, count, image in matched:
        outcome = infer_egg_count(image.read_bytes(), roi)
        outcomes.append(outcome.status)
        if outcome.estimate is not None:
            observed.append(count)
            predictions.append(outcome.estimate)
            scored.append((code, count, outcome.estimate))
        image_hashes.append((code, sha256(image)))
    if not predictions:
        raise RuntimeError("No external image received an estimate")
    truth, predicted = np.asarray(observed, dtype=float), np.asarray(predictions, dtype=float)
    errors = np.abs(truth - predicted)
    data_digest = hashlib.sha256()
    data_digest.update(args.labels.read_bytes())
    for code, image_hash in sorted(image_hashes):
        data_digest.update(code.encode())
        data_digest.update(image_hash.encode())
    report = {
        "status": "COMPLETED",
        "run_type": "ovitrap_count_external_evaluation",
        "source_mode": "USER_SUPPLIED_EXTERNAL_HELD_OUT",
        "metrics": {
            "image_count": len(predictions),
            "image_mae": float(errors.mean()),
            "image_median_absolute_error": float(np.median(errors)),
            "image_bias_predicted_minus_observed": float(np.mean(predicted - truth)),
            "within_10_eggs_fraction": float(np.mean(errors <= 10)),
        },
        "metadata": {
            "image_label_rows": len(rows),
            "matched_images": len(matched),
            "missing_images": missing,
            "prediction_statuses": dict(Counter(outcomes)),
            "dataset_sha256": data_digest.hexdigest(),
            "checkpoint_sha256": sha256(checkpoint),
            "checkpoint": checkpoint.name,
            "roi_normalized": roi,
            "selection": (
                f"{selection['selected_on_validation']} selected on the separate internal validation split; no external labels used for training or tuning."
                if selection
                else "Explicit checkpoint supplied by caller; selection provenance is not inferred."
            ),
        },
        "limitations": [
            "This user-supplied set shows wooden paddle ovitrap photos, unlike the public training images; the result measures domain shift.",
            "The same fixed ROI was chosen from visual inspection of the paddle layout and used for every image; per-image ROI quality was not reviewed.",
            "Image observations may share sites or collection rounds; independence is unknown, so no confidence interval is reported.",
            "Counts do not identify Aedes species, adult population, or dengue risk.",
        ],
        "predictions": [
            {"code": code, "observed": int(count), "predicted": int(pred)}
            for code, count, pred in scored
        ],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"metrics": report["metrics"], "metadata": report["metadata"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
