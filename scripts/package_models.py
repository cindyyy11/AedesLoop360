"""Copy the validation-selected checkpoints into deploy/models and write a SHA256 manifest."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DRONE = "data/models/drone/yolov8n-coco-pretrained-grouped-full-512-batch4-cont/weights/best.pt"
EGG_DIR = "data/models/eggs/user-paddle-v1"
EGG_FILES = ["texture_ridge.joblib", "best-model.json", "held-out-evaluation.json"]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="deploy/models")
    out = ROOT / parser.parse_args().out
    plan = [(ROOT / DRONE, out / "drone/best.pt")] + [
        (ROOT / EGG_DIR / name, out / "eggs" / name) for name in EGG_FILES
    ]
    manifest = {}
    for source, target in plan:
        if not source.is_file():
            raise SystemExit(f"Missing checkpoint: {source}. See docs/DEMO_RUNBOOK.md to train it.")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        manifest[target.relative_to(out).as_posix()] = {"sha256": sha256(target), "bytes": target.stat().st_size}
    (out / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
