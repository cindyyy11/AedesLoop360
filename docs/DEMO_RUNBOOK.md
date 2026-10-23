# Judge Demo Runbook — Three Innovations, One Closed Loop

**Rule:** This demonstration uses FICTIONAL blocks, SIMULATED drone activity, synthetic egg counts/reference images and water-only bench rig if available. No live mosquitoes, pesticide or real residential flight.

## 0. Set up

For the interactive 3D presentation, follow [3D_TOWNSHIP.md](3D_TOWNSHIP.md): open Township, inspect assets, replay a previously approved and completed simulated mission, select offline Block 4, and show saved allocation reasons. The presentation preserves existing evidence and approval flows; it never executes a mission. The guide includes isolated-database validation and exact npm commands.

1. Run documented local stack and migration/seed.
2. Reset `fixtures/four_block_scenario.json` via admin-only demo reset.
3. Click **Enter demo** to open the coordinator view; show the `SIMULATED` indicator and monitoring sample date range. Use **Switch to operator** only for the approved simulation step.
4. Open simultaneous tabs: Township, Drone, Ovitrap, Planning, Operations. Do not depend on public network.

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

To try the optional local drone model path, set `$env:AEDES_DRONE_MODEL_PATH='C:\models\aedes-candidates.pt'` before starting the API, using a checkpoint trained for the candidate-container dataset classes. The current Python environment has Ultralytics 8.4.63 installed, but no compatible checkpoint is included. Upload a new permitted image; the API records candidate boxes as `IMPORTED` and `UNCERTAIN` for ground review. An empty model result still queues review. The built-in exact synthetic image remains a fixture. Without the checkpoint, uploads report `NOT_CONFIGURED` and no ML metrics appear.

On the dashboard, open **Drone Model Performance & Ovitrap Count Accuracy** to show `NOT_EVALUATED` for both models while no independent labels/checkpoints are installed. Open **Block Surveillance Quality & Trend** to show valid/expected interval denominators, provenance, collection/upload times and Block 4 `DATA_UNAVAILABLE`. As coordinator, choose **Run simulated allocation benchmark**; the persisted result compares uniform, static and adaptive under one eight-hour budget and is labelled `SIMULATED EXPERIMENT`. It may show uniform tying or exceeding adaptive on some scenario metrics. It demonstrates reproducible planning behavior, not field benefit.

From the repository root, the data inventory/evaluator outputs can be reproduced with:

```powershell
python scripts/data_evaluation.py validate-dataset --dataset local-app-fixture-images-v1 --out data/evaluations
python scripts/data_evaluation.py validate-dataset --dataset drone-aedes-habitat-candidate-v1 --out data/evaluations
python scripts/data_evaluation.py eval-drone --out data/evaluations
python scripts/data_evaluation.py eval-eggs --out data/evaluations
python scripts/benchmark_allocation.py --out data/evaluations/allocation-benchmark.json
```

With no downloaded labelled data or checkpoint, all four commands correctly report `NOT_EVALUATED`; they do not create demo accuracy numbers.

## Judge Q&A

**Why drone?** Elevated or restricted-access *permitted outdoor assets*; ground preferred for easily reachable sites. Value compared in pilot.

**Why ovitrap?** Independent recurring sampling, not direct confirmation of exact breeding site; use to target further inspection.

**Why dashboard?** It actively plans and tracks work and verification. Data changes decisions.

**Why HITL?** Supervisor/operator approval for real flight and chemical activity; no approval needed for every sample calculation.

**Does it kill eggs?** Demo does not validate killing. Appropriate physical removal and professionally authorised vector control in real use; egg survival and entomological confirmation need separate evaluation.

**How prove impact?** Controlled demo shows logic and efficiency; real biological/dengue impact only field study with qualified partners.
