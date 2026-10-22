# AI, Computer Vision and Adaptive Allocation Specification

## 1. Three intelligent capabilities

- **Aerial image model:** candidate water-holding object detection from permitted imagery; NOT egg, larvae or Aedes infection detection.
- **Ovitrap egg counter:** counts visible eggs on a standardised sampling surface, limited to comparable acquisition conditions and trained/labelled examples. Cannot alone identify all eggs as Aedes.
- **Adaptive planning engine:** quality-aware prioritisation and constrained task allocation using observations and unresolved site findings. MVP = interpretable rules; P1 = OR-Tools. LLM not required.

## 2. Aerial CV pipeline

1. Inspect image metadata/permission, file format/size, location provenance and image quality.
2. Validate licence and split dataset **by source flight/site** to prevent spatial leakage.
3. Run model inference (e.g. a compatible object detector) for available labelled classes: tyre, container, bucket, tank, planter/saucer (only if adequately trained).
4. Persist bbox, class, confidence, model hash/version, capture/source mode and review status.
5. Run basic image-quality/occlusion checks; classifications `CANDIDATE_ONLY`, `POSSIBLE_WATER`, `DRY`, `UNKNOWN`, not confirmed larvae.
6. Map to nearest registered asset only within configured conservative spatial tolerance; otherwise `UNMATCHED`.
7. Do not treat based on CV inference. Simulated eligibility may be assigned only for **explicit fictional mock target** meeting safe demo policy; otherwise `GROUND_REVIEW`.

**Benchmark:** labelled independent images; report class precision, recall, F1, confusion matrix, false positives by background and inference latency. When no legitimate training/evaluation data exists, use clearly labelled static annotated images with `DEMO_PREANNOTATED` adapter rather than claiming AI performed live inference.

## 3. Egg counting pipeline

- Camera captures a **known collection substrate** under consistent placement, lighting and image quality.
- Store collection time window, trap id, substrate identity/collection id and servicing interval; reject duplicates.
- CV segmentation/object count may be used where labelled dataset is validated. For synthetic demo use dots labelled `SIMULATED_EGGS` and never call them confirmed eggs.
- Distinguish `AI_PREDICTED`, `MANUAL_VERIFIED`, and `PREANNOTATED_FIXTURE` counts; retain original plus corrections and uncertainty.
- Quantify error against manually counted held-out images: MAE, median absolute error, absolute percentage error only where ground truth >0, positive/negative classification accuracy and failure rate.
- Keep blur, shadows, dirt, overlap and non-Aedes species as known limitations.
- **Critical:** no daily recount of the same eggs as if they were newly deposited. All charts use one sampled interval per unique physical substrate, and samples with missing/unsafe servicing flagged invalid.

## 4. Analytics / evidence model

For each block and comparable window:

- `valid_trap_intervals` and `all_expected_trap_intervals`.
- `egg_count_per_valid_trap_interval = sum(valid new counts)/n_valid_intervals`.
- `trap_positivity = n_valid_intervals_with_egg_count>0 / n_valid_intervals`.
- `monitoring_completeness = n_valid_intervals/n_expected`.
- `unresolved_source_count`, `verified_recurring_source_count`, `days_since_inspection`.
- `last_intervention_date` and mode, plus type and independent verified physical result.
- Track context such as rain, but do not claim causal attribution from short uncontrolled time series.

Blocks with no valid sample `DATA_UNAVAILABLE`. Dashboard labels are `PRIORITY_INSPECTION`, `INVESTIGATE`, `ROUTINE`, `DATA_UNAVAILABLE` — **not `high infection risk`**.

## 5. Rules-engine design (P0)

A documented, configurable heuristic ranks *next inspections* (not chemical doses). Proposed nonclinical demo weights are illustrative and MUST be labelled assumptions, not epidemiological coefficients.

Eligibility gate before ranking:

- Block has permission/registered assets and available crew; if not, produce access/coverage task.
- If zero valid samples → create equipment-service/ground-inspection task, not low priority.
- All blocks receive a minimum surveillance/inspection coverage floor.
- Prioritize confirmed unresolved sources before speculative image-only predictions.

Example explainable `score` (demo only):

```text
score = 3 * verified_unresolved_sources
      + 2 * recurring_verified_defects
      + 1 * comparable_egg_trend_indicator
      + 1 * days_since_last_inspection_bucket
      + 1 * inaccessible_assets_waiting_review
      + data_gap_penalty_for_investigation
```

Do not turn this score into dengue probability. Rank inspection tasks **individually** by evidence/expected actionable benefit and operational cost. Prefer ground for accessible sites; propose drone when a registered elevated location is better covered from above, imagery can plausibly resolve uncertainty, a mission is feasible, and the additional cost is justified. If extra aerial survey adds no value, output `NO_DRONE_NEEDED` with reason.

**P0 algorithm, deterministic steps:**

1. Validate window and compute per-block evidence summaries.
2. Generate candidate tasks: trap service, ground verify, elevated drone inspection, source removal/repair, revisit after intervention.
3. Apply hard exclusions: unavailable authorisation, unsupported asset, poor visibility, no capacity, non-simulated chemical actions.
4. Allocate minimum baseline coverage across blocks (configurable).
5. Rank remaining feasible tasks by transparent, bounded priority/cost; use deterministic tie-breaking by task ID.
6. Assign remaining capacity, never exceeding budget; record excluded/unmet tasks with reason.
7. Save allocation snapshot, score version, all reasons, coverage and audit.

**P1 OR-Tools:** binary choose task `x_i∈{0,1}`. Maximise sum of task utility with constraints `Σ staff_hours_i x_i ≤ budget_staff`, `Σ drone_hours_i x_i ≤ budget_drone`, coverage minimum, eligibility/safety and precedence (e.g. inspection before treatment). Do not optimise numeric pesticide quantity. Compare under identical budgets to fixed scheduling.

## 6. Feedback loop and recurrence logic

- New valid interval can change investigation priorities, but not establish biological control failure alone.
- Site observation after intervention defines physical result, separate from catch/egg trend.
- Recurrence flag: two or more verified distinct post-remediation water accumulation events within a configurable window triggers `ENGINEERING_REVIEW` work order.
- Suppress duplicate engineering work orders until previous one is closed/reopened; record source asset and triggering observation IDs.

## 7. Evaluation experiments

| Experiment | Baseline | Proposed method | Primary metric |
|---|---|---|---|
| Drone CV | Fixed human image annotation | Detector/quality gate | Detection precision, recall and false positives |
| Ovitrap camera | Manually labelled substrate images | Egg counter | Count MAE, valid/invalid classification |
| Resource planning | Fixed/equal block inspection allocation | Adaptive rules | Confirmed actionable sites per staff-hour, missed sources |
| Device reliability | Treat all counts as present | Explicit missingness handling | False low-priority decisions on offline traps (target zero) |
| Recurrence | Repeat source treatment ticket | Chronic defect escalation | Correctly flagged recurring assets and no duplicates |

Use a separate hold-out set, fixed seed, independent truth labels and report assumptions. Comparisons based on synthetic scenarios must explicitly say **simulation results only**.

## 8. External dependencies and fallbacks

- If model install/training unavailable: ship `PreannotatedDemoDetector` and `FixtureEggCounter` with conspicuous fixture mode; keep same interfaces and persistence.
- Preserve optional model code but never claim functional learned CV unless tested on actual images.
- Network unavailable: upload fixture through local file; no web lookups required.
- Optimiser not installed: deterministic documented heuristic remains functional.
- Drone hardware unavailable: simulated mission emits stage events, no real flight, no pesticide.

## 9. Potential reference sources

- [Drone imagery labelled objects (Mendeley Data)](https://data.mendeley.com/datasets/vr3kkt9mvn/1) — confirm licence and current revision before importing.
- [CDC Aedes surveillance and control guidance](https://www.cdc.gov/mosquitoes/pdfs/mosquito-control-508.pdf) — egg-count interpretation caveats.
- [WHO vector larval-source management (2026)](https://www.who.int/publications/i/item/9789240123212) — treatment selection and monitoring framework.
