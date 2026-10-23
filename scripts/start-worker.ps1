param(
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
# The worker runs the detector when a simulated mission completes, so it needs the same drone checkpoint as the API.
$droneCheckpoint = if ($env:AEDES_DRONE_MODEL_PATH) {
    $env:AEDES_DRONE_MODEL_PATH
} else {
    Join-Path $repoRoot 'data/models/drone/yolov8n-coco-pretrained-grouped-full-512-batch4-cont/weights/best.pt'
}
if (-not (Test-Path -LiteralPath $droneCheckpoint -PathType Leaf)) {
    throw "Drone model checkpoint not found: $droneCheckpoint. See docs/DEMO_RUNBOOK.md."
}
$env:AEDES_DRONE_MODEL_PATH = (Resolve-Path -LiteralPath $droneCheckpoint).Path

Push-Location (Join-Path $repoRoot 'services/api')
try {
    if ($Once) { python -m app.worker --once } else { python -m app.worker }
}
finally {
    Pop-Location
}
