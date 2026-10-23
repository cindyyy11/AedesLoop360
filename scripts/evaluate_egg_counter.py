"""Score the validation-selected egg estimator once on its locked pallet test split."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "services/api"))
from scripts.train_egg_counter import features_from_path  # noqa: E402
from app.egg_features import preprocess_image  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest", type=Path, default=ROOT / "data/external/eggs-mosqlimate-v2/manifest.json"
    )
    parser.add_argument(
        "--comparison", type=Path, default=ROOT / "data/models/eggs/validation-comparison.json"
    )
    parser.add_argument(
        "--out", type=Path, default=ROOT / "data/models/eggs/held-out-evaluation.json"
    )
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    selection = json.loads(args.comparison.read_text(encoding="utf-8"))
    if selection.get("status") != "VALIDATION_COMPLETE_TEST_NOT_RUN":
        raise ValueError("Expected a validation comparison with untouched test split")
    name = selection["selected_on_validation"]
    artifact_name = selection.get("selected_checkpoint")
    artifact = args.comparison.parent / artifact_name if artifact_name else None
    test = [row for row in manifest["records"] if row["eligible"] and row["split"] == "test"]
    if not test or not artifact or not artifact.is_file():
        raise ValueError("Selected checkpoint or eligible test rows are missing")
    truths = np.asarray([row["count"] for row in test], dtype=float)
    if name == "train_group_median":
        import joblib

        payload = joblib.load(artifact)
        prediction = np.full(len(test), float(payload["constant_count"]))
    elif name.startswith("texture_"):
        import joblib

        payload = joblib.load(artifact)
        model = payload["model"]
        features = np.stack([features_from_path(Path(row["path"]), row["roi"]) for row in test])
        prediction = np.expm1(model.predict(features)).clip(0, 10000)
    else:
        import torch
        from torchvision import models, transforms

        checkpoint = torch.load(artifact, map_location="cpu", weights_only=True)
        network = models.resnet18(weights=None)
        network.fc = torch.nn.Linear(network.fc.in_features, 1)
        network.load_state_dict(checkpoint["state_dict"])
        network.eval()
        transform = transforms.Compose(
            [
                transforms.Resize((256, 256), interpolation=transforms.InterpolationMode.BICUBIC),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )
        prediction = []
        with torch.inference_mode():
            for row in test:
                with Image.open(row["path"]) as opened:
                    image = ImageOps.exif_transpose(opened).convert("RGB")
                    width, height = image.size
                    x1, y1, x2, y2 = row["roi"]
                    image = image.crop(
                        (
                            round(x1 * width),
                            round(y1 * height),
                            round(x2 * width),
                            round(y2 * height),
                        )
                    )
                    image = Image.fromarray(preprocess_image(image))
                    prediction.append(
                        float(torch.expm1(network(transform(image).unsqueeze(0))).squeeze().item())
                    )
        prediction = np.clip(prediction, 0, 10000)

    group_truths: dict[str, list[int]] = defaultdict(list)
    group_preds: dict[str, list[float]] = defaultdict(list)
    for row, pred in zip(test, prediction, strict=True):
        group_truths[row["group"]].append(row["count"])
        group_preds[row["group"]].append(float(pred))
    group_errors = np.asarray(
        [abs(np.mean(group_truths[group]) - np.mean(group_preds[group])) for group in group_truths]
    )
    rng = np.random.default_rng(360)
    boot = [
        float(np.mean(rng.choice(group_errors, len(group_errors), replace=True)))
        for _ in range(2000)
    ]
    errors = np.abs(truths - prediction)
    metrics = {
        "image_mae": float(errors.mean()),
        "image_median_absolute_error": float(np.median(errors)),
        "image_bias_predicted_minus_observed": float(np.mean(prediction - truths)),
        "group_mae": float(group_errors.mean()),
        "group_mae_bootstrap_95pct": [
            float(np.quantile(boot, 0.025)),
            float(np.quantile(boot, 0.975)),
        ],
    }
    if manifest.get("grouping_unit", "physical_pallet") == "physical_pallet":
        metrics["pallet_mae"] = float(group_errors.mean())
        metrics["pallet_mae_bootstrap_95pct"] = metrics["group_mae_bootstrap_95pct"]
    report = {
        "run_id": f"egg-count-{name}-{manifest['dataset_sha256'][:12]}",
        "run_type": "ovitrap_count_evaluation",
        "status": "COMPLETED",
        "source_mode": "EXTERNALLY_LABELLED_HELD_OUT",
        "metrics": metrics,
        "metadata": {
            "split": "test",
            "test_count": len(test),
            "test_group_count": len(group_errors),
            "dataset_sha256": manifest["dataset_sha256"],
            "checkpoint_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
            "selected_on_validation": name,
            "checkpoint": artifact.name,
        },
        "limitations": [
            "A source group may have multiple photographs; group MAE averages predictions within each group.",
            "The source labels are total counts for photographed substrates, not individual egg or egg-box annotations.",
            "The site/direction group key is inferred from sample codes and has not been confirmed by source documentation.",
            "The dataset has no zero-count examples, so negative-image specificity has not been measured.",
            "This evaluation estimates counts on this dataset and does not infer species, adult abundance, or disease risk.",
            "Test set contains only records with a reviewed geometric substrate crop; excluded/uncertain images are outside this metric.",
        ],
        "predictions": [
            {
                "file": row["file"],
                "group": row["group"],
                "observed": int(target),
                "predicted": round(float(pred)),
            }
            for row, target, pred in zip(test, truths, prediction, strict=True)
        ],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("run_id", "metrics", "metadata")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
