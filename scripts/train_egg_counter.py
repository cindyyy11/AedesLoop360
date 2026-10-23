"""Compare simple regressors with frozen and staged fine-tuned ResNet18."""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from collections import defaultdict
from pathlib import Path
import math

import numpy as np
import torch
from joblib import dump
from PIL import Image, ImageOps
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/api"))
from app.egg_features import image_features, preprocess_image  # noqa: E402


def features_from_path(path: Path, roi: list[float]) -> np.ndarray:
    with Image.open(path) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
    w, h = image.size
    x1, y1, x2, y2 = roi
    image = image.crop((round(x1 * w), round(y1 * h), round(x2 * w), round(y2 * h)))
    if image.width == 0 or image.height == 0:
        raise ValueError(f"Empty substrate region for {path}")
    return image_features(image)


def grouped_mae(records: list[dict], predictions: np.ndarray) -> tuple[float, float]:
    by_group: dict[str, list[tuple[int, float]]] = defaultdict(list)
    for row, prediction in zip(records, predictions, strict=True):
        by_group[row["group"]].append((row["count"], float(prediction)))
    errors = [
        abs(np.mean([y for y, _ in targets]) - np.mean([p for _, p in targets]))
        for targets in by_group.values()
    ]
    return float(np.mean(errors)), float(
        np.mean(
            [abs(y - p) for r, p in zip(records, predictions, strict=True) for y in [r["count"]]]
        )
    )


def pallet_weights(records: list[dict]) -> np.ndarray:
    """Give each physical pallet equal total fitting weight, regardless of photo count."""
    sizes: dict[str, int] = defaultdict(int)
    for row in records:
        sizes[row["group"]] += 1
    weights = np.asarray([1.0 / sizes[row["group"]] for row in records], dtype=np.float32)
    return weights * (len(weights) / weights.sum())


def group_median_count(records: list[dict]) -> float:
    counts: dict[str, list[int]] = defaultdict(list)
    for row in records:
        counts[row["group"]].append(row["count"])
    return float(np.median([np.median(group) for group in counts.values()]))


def make_network(pretrained_path: Path, *, fine_tune: bool, seed: int):
    import torch
    from torchvision import models

    torch.manual_seed(seed)
    model = models.resnet18(weights=None)
    weights = torch.load(pretrained_path, map_location="cpu", weights_only=True)
    model.load_state_dict(weights)
    model.fc = torch.nn.Linear(model.fc.in_features, 1)
    # Initialize to a robust central log-count so the head starts in range.
    torch.nn.init.zeros_(model.fc.weight)
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    for parameter in model.fc.parameters():
        parameter.requires_grad_(True)
    # Target head starts at the median log-count, and keeps that calibration
    # through warm-up rather than being reset during fine-tuning.
    return model


def train_neural(
    train: list[dict],
    validation: list[dict],
    pretrained_path: Path,
    *,
    fine_tune: bool,
    seed: int,
    epochs: int = 6,
    threads: int = 4,
) -> tuple[dict, list[float]]:
    import torch
    from torchvision import transforms

    torch.set_num_threads(threads)
    rng = random.Random(seed)
    augment = transforms.Compose(
        [
            transforms.Resize((256, 256), interpolation=transforms.InterpolationMode.BICUBIC),
            transforms.RandomHorizontalFlip(0.5),
            transforms.RandomVerticalFlip(0.5),
            transforms.ColorJitter(brightness=0.08, contrast=0.08),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    evaluate_transform = transforms.Compose(
        [
            transforms.Resize((256, 256), interpolation=transforms.InterpolationMode.BICUBIC),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    def materialize(rows, transform):
        xs, ys = [], []
        for row in rows:
            with Image.open(row["path"]) as opened:
                im = ImageOps.exif_transpose(opened).convert("RGB")
                w, h = im.size
                a, b, c, d = row["roi"]
                crop = im.crop((round(a * w), round(b * h), round(c * w), round(d * h)))
                crop = Image.fromarray(preprocess_image(crop))
                xs.append(transform(crop))
                ys.append(np.log1p(row["count"]))
        return (
            torch.stack(xs),
            torch.tensor(ys, dtype=torch.float32),
            torch.tensor(pallet_weights(rows)),
        )

    train_x, train_y, train_weights = materialize(train, augment)
    val_x, _, _ = materialize(validation, evaluate_transform)
    model = make_network(pretrained_path, fine_tune=fine_tune, seed=seed)
    with torch.no_grad():
        model.fc.bias.fill_(math.log1p(group_median_count(train)))
    optimizer = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=1e-3, weight_decay=1e-3
    )
    best_state, best_error, patience, curve = None, float("inf"), 0, []
    # Explicit head warm-up precedes low-rate final-layer fine-tuning.
    warmup_epochs = 2
    for epoch in range(epochs):
        if fine_tune and epoch == warmup_epochs:
            for parameter in model.layer4.parameters():
                parameter.requires_grad_(True)
            for parameter in model.fc.parameters():
                parameter.requires_grad_(True)
            optimizer = torch.optim.AdamW(
                [
                    {"params": model.layer4.parameters(), "lr": 2e-5},
                    {"params": model.fc.parameters(), "lr": 2e-4},
                ],
                weight_decay=1e-3,
            )
        model.train()
        if not fine_tune or epoch < warmup_epochs:
            model.eval()
            model.fc.train()
        order = list(range(len(train)))
        rng.shuffle(order)
        for start in range(0, len(order), 16):
            ids = order[start : start + 16]
            output = model(train_x[ids]).squeeze(-1)
            row_losses = torch.nn.functional.smooth_l1_loss(output, train_y[ids], reduction="none")
            batch_weights = train_weights[ids]
            loss = (row_losses * batch_weights).sum() / batch_weights.sum()
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
        model.eval()
        with torch.inference_mode():
            pred = torch.expm1(model(val_x).squeeze(-1)).numpy().clip(0, 10000)
        error, _ = grouped_mae(validation, pred)
        curve.append(error)
        print(
            f"{'staged' if fine_tune else 'frozen'} ResNet epoch {epoch + 1}/{epochs}: validation group MAE={error:.2f}",
            flush=True,
        )
        if error < best_error:
            best_error, best_state, patience = (
                error,
                {k: v.detach().clone() for k, v in model.state_dict().items()},
                0,
            )
        else:
            patience += 1
            if patience >= 2:
                break
    if best_state is None:
        raise RuntimeError("Training produced no checkpoint")
    return best_state, curve


def main() -> int:
    from torchvision import transforms

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest", type=Path, default=ROOT / "data/external/eggs-mosqlimate-v2/manifest.json"
    )
    parser.add_argument("--out", type=Path, default=ROOT / "data/models/eggs")
    parser.add_argument(
        "--pretrained",
        type=Path,
        default=Path.home() / ".cache/torch/hub/checkpoints/resnet18-f37072fd.pth",
    )
    parser.add_argument("--seed", type=int, default=360)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--neural-epochs", type=int, default=6)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    rows = [r for r in manifest["records"] if r["eligible"]]
    train = [r for r in rows if r["split"] == "train"]
    val = [r for r in rows if r["split"] == "validation"]
    test = [r for r in rows if r["split"] == "test"]
    for split, entries in (("train", train), ("validation", val), ("test", test)):
        if not entries:
            raise ValueError(f"No valid rows in {split}")
    groups = {
        s: {r["group"] for r in rs}
        for s, rs in (("train", train), ("validation", val), ("test", test))
    }
    if (
        groups["train"] & groups["validation"]
        or groups["train"] & groups["test"]
        or groups["validation"] & groups["test"]
    ):
        raise ValueError("Physical pallet group leaked across splits")
    if not args.pretrained.is_file():
        raise FileNotFoundError(
            f"Official pretrained weights unavailable: {args.pretrained}; no random initialization fallback"
        )
    args.out.mkdir(parents=True, exist_ok=True)
    print(f"Computing crop-aware texture features for {len(rows)} samples", flush=True)
    features = np.stack([features_from_path(Path(r["path"]), r["roi"]) for r in rows])
    row_index = {id(r): i for i, r in enumerate(rows)}

    def xs(rs):
        return np.stack([features[row_index[id(r)]] for r in rs])

    median_count = group_median_count(train)
    candidates = {"train_group_median": (None, np.full(len(val), median_count))}
    for name, model in (
        ("texture_ridge", make_pipeline(StandardScaler(), Ridge(alpha=100.0))),
        (
            "texture_extra_trees",
            ExtraTreesRegressor(
                n_estimators=300,
                min_samples_leaf=2,
                max_features=0.75,
                n_jobs=args.threads,
                random_state=args.seed,
            ),
        ),
        (
            "texture_hist_gradient",
            HistGradientBoostingRegressor(
                max_iter=120, max_leaf_nodes=7, l2_regularization=2.0, random_state=args.seed
            ),
        ),
    ):
        train_weights = pallet_weights(train)
        if name == "texture_ridge":
            model.fit(
                xs(train),
                np.log1p([r["count"] for r in train]),
                standardscaler__sample_weight=train_weights,
                ridge__sample_weight=train_weights,
            )
        else:
            model.fit(xs(train), np.log1p([r["count"] for r in train]), sample_weight=train_weights)
        candidates[name] = (model, np.expm1(model.predict(xs(val))).clip(0, 10000))
    baseline_metrics = {}
    for name, (model, pred) in candidates.items():
        pallet_mae, image_mae = grouped_mae(val, pred)
        baseline_metrics[name] = {"group_mae": pallet_mae, "image_mae": image_mae}
        if manifest.get("grouping_unit", "physical_pallet") == "physical_pallet":
            baseline_metrics[name]["pallet_mae"] = pallet_mae
        if model is not None:
            artifact = args.out / f"{name}.joblib"
            dump(
                {
                    "model": model,
                    "metadata": {
                        "model_version": name,
                        "method": name,
                        "dataset_sha256": manifest["dataset_sha256"],
                    },
                },
                artifact,
            )
        else:
            artifact = args.out / f"{name}.joblib"
            dump(
                {
                    "model": None,
                    "constant_count": median_count,
                    "metadata": {
                        "model_version": name,
                        "method": name,
                        "dataset_sha256": manifest["dataset_sha256"],
                    },
                },
                artifact,
            )
    if not args.pretrained.is_file():
        raise FileNotFoundError(args.pretrained)
    print(
        f"Fine-tuning options with CPU budget: train={len(train)} validation={len(val)}; this can take several minutes",
        flush=True,
    )
    for ft in (False, True):
        state, curve = train_neural(
            train,
            val,
            args.pretrained,
            fine_tune=ft,
            seed=args.seed,
            epochs=args.neural_epochs,
            threads=args.threads,
        )
        name = "resnet18_finetuned_layer4" if ft else "resnet18_frozen_head"
        checkpoint = {
            "state_dict": state,
            "metadata": {
                "model_version": name,
                "method": name,
                "dataset_sha256": manifest["dataset_sha256"],
                "pretrained_sha256": hashlib.sha256(args.pretrained.read_bytes()).hexdigest(),
                "seed": args.seed,
            },
        }
        artifact = args.out / f"{name}.pth"
        torch.save(checkpoint, artifact)
        val_pred = []
        model = make_network(args.pretrained, fine_tune=ft, seed=args.seed)
        with torch.no_grad():
            model.fc.bias.fill_(math.log1p(group_median_count(train)))
        model.load_state_dict(state)
        model.eval()
        val_transform = transforms.Compose(
            [
                transforms.Resize((256, 256), interpolation=transforms.InterpolationMode.BICUBIC),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )
        for row in val:
            with Image.open(row["path"]) as opened:
                im = ImageOps.exif_transpose(opened).convert("RGB")
                w, h = im.size
                a, b, c, d = row["roi"]
                im = im.crop((round(a * w), round(b * h), round(c * w), round(d * h)))
                im = Image.fromarray(preprocess_image(im))
                with torch.inference_mode():
                    val_pred.append(
                        float(torch.expm1(model(val_transform(im).unsqueeze(0))).squeeze().item())
                    )
        pallet_mae, image_mae = grouped_mae(val, np.clip(val_pred, 0, 10000))
        baseline_metrics[name] = {
            "group_mae": pallet_mae,
            "image_mae": image_mae,
            "epochs": len(curve),
            "curve": curve,
            "checkpoint": artifact.name,
        }
        if manifest.get("grouping_unit", "physical_pallet") == "physical_pallet":
            baseline_metrics[name]["pallet_mae"] = pallet_mae
    winner = min(baseline_metrics, key=lambda name: baseline_metrics[name]["group_mae"])
    if winner in candidates:
        best_artifact = args.out / f"{winner}.joblib"
    elif winner in {"resnet18_frozen_head", "resnet18_finetuned_layer4"}:
        best_artifact = args.out / (winner + ".pth")
    else:
        best_artifact = None
    report = {
        "status": "VALIDATION_COMPLETE_TEST_NOT_RUN",
        "seed": args.seed,
        "source_dataset_sha256": manifest["dataset_sha256"],
        "pretrained_sha256": hashlib.sha256(args.pretrained.read_bytes()).hexdigest(),
        "group_counts": {k: len(v) for k, v in groups.items()},
        "validation_metrics": baseline_metrics,
        "selected_on_validation": winner,
        "selected_checkpoint": best_artifact.name if best_artifact else None,
        "test_split_locked_count": len(test),
        "caveats": [
            "No test labels were scored; candidate selection uses validation only.",
            f"Records are grouped by {manifest.get('grouping_unit', 'physical_pallet')}; verify source group semantics.",
            "Text/metadata not used as model features.",
        ],
    }
    (args.out / "validation-comparison.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    if best_artifact:
        (args.out / "best-model.json").write_text(
            json.dumps(
                {
                    "path": str(best_artifact.resolve()),
                    "sha256": hashlib.sha256(best_artifact.read_bytes()).hexdigest(),
                    "metadata": report,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
