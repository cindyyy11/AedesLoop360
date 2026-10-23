# Judge Demo Runbook — Three Innovations, One Closed Loop

**Rule:** This demonstration uses FICTIONAL blocks, SIMULATED drone activity, synthetic egg counts/reference images and water-only bench rig if available. No live mosquitoes, pesticide or real residential flight.

## 0. Set up

For the interactive 3D presentation, follow [3D_TOWNSHIP.md](3D_TOWNSHIP.md): open Township, inspect assets, replay a previously approved and completed simulated mission, select offline Block 4, and show saved allocation reasons. The presentation preserves existing evidence and approval flows; it never executes a mission. The guide includes isolated-database validation and exact npm commands.

1. Run documented local stack and migration/seed.
2. Reset `fixtures/four_block_scenario.json` via admin-only demo reset.
3. Click **Enter demo** to open the coordinator view; show the `SIMULATED` indicator and monitoring sample date range. Use **Switch to operator** only for the approved simulation step.
4. Open simultaneous tabs: Township, Drone, Ovitrap, Planning, Operations. Do not depend on public network.

## Train and connect the supplied drone dataset

The user-supplied YOLOv8 archive is extracted under ignored `data/external/drone-aedes-yolov8-v1`. Keep the archive and checkpoint local. The Mendeley record states CC BY 4.0; the export's own YAML says `Private`, so the provenance manifest preserves both declarations. No access control was bypassed. The training code uses a deterministic source-image-group split because related image tiles occur across the publisher's original splits.

The current demo checkpoint is `data/models/drone/yolov8n-coco-pretrained-grouped-full-512-batch4-cont/weights/best.pt`. It was fine-tuned from the official COCO-pretrained YOLOv8n checkpoint on all 1,947 grouped training images at 512px. The grouped 417-image test score is mAP@0.5 68.30% and recall 62.54%; other-open-container recall is only 27.96%, so all detections remain review-only. The exact local run had one completed epoch at batch 8 before a memory failure, followed by five completed epochs at batch 4 from that saved checkpoint.

For a fresh run from the repository root, get the official pretrained weights, verify their recorded hash, build the split, and train a clean CPU run:

```powershell
python scripts/prepare_drone_group_split.py --root data/external/drone-aedes-yolov8-v1 --seed 360
$pretrained = 'data/models/pretrained/yolov8n.pt'
New-Item -ItemType Directory -Path 'data/models/pretrained' -Force | Out-Null
Invoke-WebRequest 'https://github.com/ultralytics/assets/releases/download/v8.4.0/yolov8n.pt' -OutFile $pretrained
(Get-FileHash $pretrained -Algorithm SHA256).Hash # recorded local value: F59B3D833E2FF32E194B5BB8E08D211DC7C5BDF144B90D2C8412C47CCFC83B36
python scripts/train_drone_yolo.py --data data/external/drone-aedes-yolov8-v1/data.grouped.yaml --out data/models/drone --epochs 6 --imgsz 512 --batch 4 --fraction 1.0 --threads 4 --model $pretrained --name yolov8n-coco-pretrained-grouped-full-512-clean
python scripts/evaluate_drone_yolo.py --checkpoint data/models/drone/yolov8n-coco-pretrained-grouped-full-512-clean/weights/best.pt --data data/external/drone-aedes-yolov8-v1/data.grouped.yaml --out data/evaluations/drone
$summary = Get-ChildItem data/evaluations/drone -Filter 'drone-yolo-group-test-*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
# In a fresh PowerShell session, leave AEDES_DATABASE_URL unset to use repo-root aedes.db.
python scripts/register_evaluation.py --summary $summary.FullName --tenant tenant-demo
```

The clean six-epoch run may not match the current two-stage checkpoint bit for bit. Select its best checkpoint using validation, then use the grouped test split once to report its performance. To demonstrate the already evaluated checkpoint and the egg reviewer-assist model together, start the API from the repository root:

```powershell
pwsh -NoProfile -File scripts/start-api.ps1 -CheckOnly
pwsh -NoProfile -File scripts/start-api.ps1
```

Run the dashboard from `apps/web` as usual. Evaluation metrics appear in the existing evidence panel. Uploaded non-fixture images use the local checkpoint; detections remain uncertain candidate containers awaiting ground review. The drone dataset does not provide ovitrap images or egg counts, so egg-model training uses a separate dataset.

## Train and connect the egg-count reviewer-assist model

The public egg-strip archive and the supplied wood-paddle photos use different image styles. A strip-only model scored image MAE 216.04 on the 300 supplied paddle photos, so the local paddle data is used for the target-domain fit. The current validation-selected model is a texture ridge regressor; frozen ResNet18 and staged layer-4 fine-tuning were compared but did not win validation. It remains a proposed count for human review, not an autonomous surveillance decision.

From the repository root, prepare site-direction grouped splits, train all candidates, and evaluate the validation-selected candidate once on the locked test split:

```powershell
python scripts/prepare_user_egg_data.py
python scripts/train_egg_counter.py --manifest data/external/user-ovitrap-monitor/grouped-v1/manifest.json --out data/models/eggs/user-paddle-v1 --pretrained data/models/pretrained/resnet18-f37072fd.pth --neural-epochs 6
python scripts/evaluate_egg_counter.py --manifest data/external/user-ovitrap-monitor/grouped-v1/manifest.json --comparison data/models/eggs/user-paddle-v1/validation-comparison.json --out data/models/eggs/user-paddle-v1/held-out-evaluation.json
```

The pretrained file is the official torchvision ResNet18 checkpoint; its verified SHA-256 is `f37072fd47e89c5e827621c5baffa7500819f7896bbacec160b1a16c560e07ec`. It is cached locally and excluded from Git. Set the selected checkpoint before starting the API:

For subsequent local starts, use this launcher from the repository root. It sets the model path and checks that the checkpoint loads before starting the API:

The launcher warms the egg inference cache and pixel-feature imports in the same Python process that serves Uvicorn. Wait for the Uvicorn ready message before uploading; slow first-time model imports must finish before the web proxy accepts inference traffic. This avoids losing the startup cache in a separate validation subprocess.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-api.ps1
```

Add `-CheckOnly` to validate configuration without starting a server. Existing environment settings (including `AEDES_DATABASE_URL` and the drone model path) are preserved. Without a database override, the API uses repo-root `aedes.db`. If choosing another database, migrate it first with `python -m alembic -c services/api/alembic.ini upgrade head`. The API does not automatically load `.env`.

Equivalent manual startup:

```powershell
$env:AEDES_EGG_MODEL_PATH = (Resolve-Path 'data/models/eggs/user-paddle-v1/texture_ridge.joblib').Path
Set-Location services/api
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start the web app as usual. Open **Smart ovitraps**, choose a trap, upload a paddle photo, declare image rights, select capture time, and outline/verify the whole paddle. Submit the proposal, then review the model/count provenance and manually confirm or correct it with a unique interval, sampling effort, quality and rationale. A proposal never changes a trend by itself. If the model is missing, inference returns unavailable; it does not return a zero count.

Measured on the current split: 300 images / 50 assumed site-direction groups; 186 train images in 30 groups, 57 validation in 10 groups, and 57 test in 10 groups. Selected model image MAE is 9.56 eggs, group MAE 6.40, median absolute error 3.80, and bias −4.02, with a group-bootstrap interval of 2.72–10.87. These values are exploratory. The first two code segments were assumed to identify groups but their meaning is not source-verified; the public-only checkpoint had also been run over all 300 photos before this target-domain split; there are no zero-count samples. Collect more independently grouped and zero-count examples before making operational claims. The source files and trained checkpoint remain in ignored `data/` and are not committed.

## Scene 1 — Problem: four blocks with distinct evidence (20–30 seconds)

- Block 1: high recent *egg observations* + 3 separately recorded unresolved physical issues.
- Block 2: rising egg observations but no verified physical source; recommend inspection, not automatic spraying.
- Block 3: valid, relatively lower observations, known assets resolved; maintain minimum surveillance.
- Block 4: offline trap; no valid new count → `DATA_UNAVAILABLE`, servicing task.
- Show counts per interval, not made-up infection risk.

## Scene 2 — Drone finds three different targets (45–60 seconds)

- Upload the exact synthetic Block 1 aerial fixture and link it to the matching fictional asset. Show its human-authored boxes: `P01 dry`, `P02 mock water target`, `P03 occluded`. This is exact-hash fixture lookup, not CV inference. An unsupported image becomes `UNCERTAIN` and goes to ground review.
- Results: P01 `SKIP`, P03 `GROUND_REVIEW`, P02 `MOCK_ACTION_ELIGIBLE` only as labelled fixture.
- Create mission, show human approval with checklist. Run drone simulation. Event timeline records mock test-water action (no pesticide).
- Abort an optional second mission mid-way and show remaining targets unchanged.

## Scene 3 — Smart ovitrap updates monitoring (45 seconds)

- Import a **new interval** collection from Block 1. Show egg-count adapter and sample metadata.
- Re-import the same exact sample: show no count increase (idempotency). If a label needs correction, use the reviewer count-revision form and show the previous and corrected counts in the audit history.
- Block 4 stays missing / servicing required.
- State explicitly: eggs are sampled activity, not exact adult population nor dengue probability.

## Scene 4 — Dashboard adapts next action (45–60 seconds)

- Generate adaptive plan with fixed staff/drone survey budget. Explain why B1 prioritized: unresolved physical issues + observations + inspection interval.
- Compare B2 (more field inspection), B3 (baseline), B4 (service trap). Show `NO_DRONE_NEEDED` for an easy ground asset.
- For P1, contrast with fixed equal scheduling using exact same simulated scenario and constraints.

## Scene 5 — Beyond repeat spraying (30–45 seconds)

- Open Asset P-03: previously corrected, subsequent repeated verified water accumulation after rain.
- Trigger recurrence evaluation → engineering/physical source correction work order for drainage/saucer redesign.
- Show worker completion still `PENDING_VERIFICATION`; reviewer records separate outcome, history updates.

## Final close (15 seconds)

> "Our drone finds and demonstrates precisely targeted action. Our ovitraps measure what is happening over comparable sampling intervals. Our dashboard converts those observations and physical evidence into the next inspection, safer intervention or permanent source correction. Unlike a static dengue map, the next decision actually changes when the evidence changes."

## Demo recovery

- No model weights: exact-hash human-authored aerial fixture; UI identifies `DEMO_PREANNOTATED_V1`, while unsupported images queue ground review.
- No camera: fixed labelled egg sample images; egg count uses manual/synthetic ground truth.
- No hardware: simulator; fake actuator explicitly simulated.
- Backend offline: restart Compose from documentation, replay idempotent fixture, no fake success status.

## Data analytics evidence

`scripts/start-api.ps1` sets both `AEDES_DRONE_MODEL_PATH` and `AEDES_EGG_MODEL_PATH` to the local validation-selected checkpoints. It validates the five drone classes before serving. Upload a permitted image; the API records candidate boxes as `IMPORTED` and `UNCERTAIN` for ground review. An empty model result still queues review. The built-in exact synthetic image remains a fixture. Without the drone checkpoint, uploads report `NOT_CONFIGURED` and no ML metrics appear.

On the dashboard, open **Drone Model Performance & Ovitrap Count Accuracy** to see both registered grouped held-out runs and their limitations. The egg reviewer-assist run is `COMPLETED` with image MAE 9.56 on 57 images; zero-count specificity remains unmeasured and each proposed count still needs human confirmation. To register this report in a fresh local demo database after migration and seeding, run `python scripts/register_evaluation.py --summary data/models/eggs/user-paddle-v1/held-out-evaluation.json --tenant tenant-demo`. Open **Block Surveillance Quality & Trend** to show valid/expected interval denominators, provenance, collection/upload times and Block 4 `DATA_UNAVAILABLE`. As coordinator, choose **Run simulated allocation benchmark**; the persisted result compares uniform, static and adaptive under one eight-hour budget and is labelled `SIMULATED EXPERIMENT`. It may show uniform tying or exceeding adaptive on some scenario metrics. It demonstrates reproducible planning behavior, not field benefit.

From the repository root, the data inventory/evaluator outputs can be reproduced with:

```powershell
python scripts/data_evaluation.py validate-dataset --dataset local-app-fixture-images-v1 --out data/evaluations
python scripts/data_evaluation.py validate-dataset --dataset drone-aedes-habitat-candidate-v1 --out data/evaluations
python scripts/data_evaluation.py eval-drone --out data/evaluations
python scripts/data_evaluation.py eval-eggs --out data/evaluations
python scripts/benchmark_allocation.py --out data/evaluations/allocation-benchmark.json
```

The data-validation and training commands use the user-supplied local archive. Evaluation outputs held-out measurements only after the final command; it does not create synthetic detector accuracy numbers.

## Judge Q&A

**Why drone?** Elevated or restricted-access *permitted outdoor assets*; ground preferred for easily reachable sites. Value compared in pilot.

**Why ovitrap?** Independent recurring sampling, not direct confirmation of exact breeding site; use to target further inspection.

**Why dashboard?** It actively plans and tracks work and verification. Data changes decisions.

**Why HITL?** Supervisor/operator approval for real flight and chemical activity; no approval needed for every sample calculation.

**Does it kill eggs?** Demo does not validate killing. Appropriate physical removal and professionally authorised vector control in real use; egg survival and entomological confirmation need separate evaluation.

**How prove impact?** Controlled demo shows logic and efficiency; real biological/dengue impact only field study with qualified partners.
