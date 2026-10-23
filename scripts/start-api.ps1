param(
    [switch]$CheckOnly,
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$checkpoint = Join-Path $repoRoot 'data/models/eggs/user-paddle-v1/texture_ridge.joblib'
if (-not (Test-Path -LiteralPath $checkpoint -PathType Leaf)) {
    throw "Egg model checkpoint not found: $checkpoint. See docs/DEMO_RUNBOOK.md for training instructions."
}
$env:AEDES_EGG_MODEL_PATH = (Resolve-Path -LiteralPath $checkpoint).Path
$droneCheckpoint = if ($env:AEDES_DRONE_MODEL_PATH) {
    $env:AEDES_DRONE_MODEL_PATH
} else {
    Join-Path $repoRoot 'data/models/drone/yolov8n-coco-pretrained-grouped-full-512-batch4-cont/weights/best.pt'
}
if (-not (Test-Path -LiteralPath $droneCheckpoint -PathType Leaf)) {
    throw "Drone model checkpoint not found: $droneCheckpoint. See docs/DEMO_RUNBOOK.md for training instructions."
}
$env:AEDES_DRONE_MODEL_PATH = (Resolve-Path -LiteralPath $droneCheckpoint).Path

Push-Location (Join-Path $repoRoot 'services/api')
try {
    # Loading the checkpoint here catches missing ML dependencies before serving requests.
    @'
import os
import sys
from pathlib import Path
from app.egg_vision import _cached_model
from app.egg_features import image_features
from PIL import Image
from app.drone_inference import _load_model as load_drone_model
import hashlib

_, metadata, digest = _cached_model(str(Path(os.environ["AEDES_EGG_MODEL_PATH"]).resolve()))
# Warm feature imports too; this is a software probe, not a field observation.
image_features(Image.new("RGB", (64, 128), "white"))
print("Egg model:", metadata["model_version"])
print("Checkpoint SHA256:", digest)
drone_path = os.environ["AEDES_DRONE_MODEL_PATH"]
drone = load_drone_model(drone_path)
expected = {0: "coconut_shell", 1: "drum", 2: "other_open_container", 3: "tyre", 4: "water_tank"}
if drone.names != expected:
    raise ValueError(f"Drone checkpoint classes do not match the five candidate-container classes: {drone.names}")
print("Drone model:", drone_path)
digest_builder = hashlib.sha256()
with open(drone_path, "rb") as weights:
    for chunk in iter(lambda: weights.read(1024 * 1024), b""):
        digest_builder.update(chunk)
print("Drone checkpoint SHA256:", digest_builder.hexdigest())

if sys.argv[2] != "True":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=int(sys.argv[1]))
'@ | python -u - $Port $CheckOnly.IsPresent
    if ($LASTEXITCODE -ne 0) { throw 'API startup or model configuration check failed.' }
}
finally {
    Pop-Location
}
