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

Push-Location (Join-Path $repoRoot 'services/api')
try {
    # Loading the checkpoint here catches missing ML dependencies before serving requests.
    python -c 'import os; from app.egg_vision import _load_model; _, metadata, digest = _load_model(os.environ["AEDES_EGG_MODEL_PATH"]); print("Egg model:", metadata["model_version"]); print("Checkpoint SHA256:", digest)'
    if ($LASTEXITCODE -ne 0) { throw 'Egg model configuration check failed.' }
    if (-not $CheckOnly) {
        python -m uvicorn app.main:app --host 127.0.0.1 --port $Port
        if ($LASTEXITCODE -ne 0) { throw 'API exited with an error.' }
    }
}
finally {
    Pop-Location
}
