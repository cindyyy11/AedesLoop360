# AedesLoop 360 — Data Strategy, Analytics, Model Evaluation & Evidence

**Version:** 1.0 · 23 October 2026  
**Role:** Implementation specification for the three core innovations: AI Drone, Smart Ovitrap, Adaptive Township Dashboard.  
**Mandatory rule:** Do not publish invented accuracy, egg-reduction, mosquito-population, pesticide-effectiveness or dengue-incidence results. A working fixture demonstrates a workflow, not an ML benchmark.

## 1. Evaluation map

| Pillar | Task | Ground truth | Primary metrics | Evidence category |
|---|---|---|---|---|
| AI Drone | Detect potential water-holding *objects* | Human-labelled boxes/classes on independent aerial images | Per-class precision, recall, F1, mAP@50, mAP@50–95, inference latency | Measured only after a real test run |
| AI Drone | Determine water presence / actual treatment eligibility | Additional independently labelled water/site-condition data and approved domain-specific treatment rules | False-eligible rate, coverage, skipped/uncertain proportion | Do not infer from object dataset alone |
| Smart Ovitrap | Estimate eggs per sample image | Expert/technician reference counts on held-out images | MAE, RMSE, signed bias, count-within-tolerance rate | Measured only after real test run |
| Smart Ovitrap | Mark samples valid / empty / unreadable | Independent annotations including zero-egg and poor-quality images | Confusion matrix, sensitivity, false positives, invalid-sample rate | Needs additional negatives |
| Dashboard | Standardised trap time series | Validity, sample interval, trap servicing and egg count records | Eggs per valid trap-interval, positivity, monitoring completeness | Descriptive surveillance, not infection probability |
| Dashboard | Choose next tasks and distribute effort | Independently labelled issues/tasks + recorded costs, access and permissions | Actionable findings/hour, cost/finding, missed issues, minimum coverage, constraint violations | Simulator results vs controlled pilot results must be distinguished |
| Closed loop | Record intervention, verify physical change and detect recurring defects | Asset-level follow-up inspections independent of 'action done' | Verified closure %, recurrence flags, time to verification | Prototype workflow vs field evidence |

## 2. Public dataset candidates and strict limitations

### 2.1 Drone imagery

- **Dataset:** *Drone Imagery Dataset of Aedes Mosquito Breeding Habitats*, Mendeley Data, version 1, DOI `10.17632/vr3kkt9mvn.1`, published 17 December 2025.
- **URL:** https://data.mendeley.com/datasets/vr3kkt9mvn/1
- **Declared content:** 2,821 PNG images of 512×512, five annotated object classes: water tanks, drums, tyres, coconut shells, other open containers; boxes provided as YOLOv8/COCO/Pascal VOC; predefined 70/15/15 split; licence CC BY 4.0.
- **Can train/evaluate:** Object detection of *potential water-holding objects*.
- **Cannot evaluate:** Standing-water confirmation, egg/larva detection, Aedes identification, safe treatment eligibility, treatment effectiveness, dengue risk.
- **Leakage warning:** Verify whether near-duplicate frames or images from the same flight/site cross the published train/test split. If grouping metadata exists, use a group-disjoint holdout; otherwise document potential leakage and test separately on unseen site imagery if available.
- **Classes must match the dataset.** Add flowerpot/saucer only with sufficient extra human-labelled training/test examples; don't relabel generic `other open containers` as verified planters.

### 2.2 Ovitrap images and counts

- **Dataset:** *Sample dataset: ovitrap sticks pictures and observed egg count*, Zenodo, DOI `10.5281/zenodo.6962536`, released August 2022.
- **URL:** https://zenodo.org/records/6962536
- **Declared content:** 300 photographs of egg-positive ovitrap sticks; accompanying `observed_egg_counts.csv` records counts established by technicians.
- **Can evaluate:** Image-level count error compared with provided reference counts.
- **Cannot evaluate without new labels:** True negative/empty-sample specificity (all 300 described images contain eggs), individual-object detection mAP (requires egg box/point/segmentation ground truth), species of every egg, field population change.
- **Important:** A regression/counting model may be evaluated from image-level counts. A YOLO egg detector requires instance-level annotations from another verified dataset or new labelling.
- **Additional data:** Collect independently labelled **zero-egg**, debris, low-light, overexposed and out-of-focus samples under consistent conditions. Record trap ID, substrate ID, interval and imaging method; obtain correct permission/licence.

### 2.3 Local evaluation dataset

Collect/label a small, *separate* Malaysian-domain test set of permitted images if possible. It should deliberately include hard negatives, roofs, plastic objects, vegetation, occlusion and different lighting. Report its sample size and limitations. A tiny local test set is an exploratory check, not a population-wide accuracy claim.

### 2.4 Third dataset: Four-block operations fixture

Use `fixtures/four_block_scenario.json` for **algorithm correctness and demo scenarios**, never report its simulated eggs or intervention outcomes as biological evidence. Configure independent scenario truth and common cost assumptions for baseline comparisons.

## 3. Reproducible ML pipeline

1. Acquire datasets; record source URL/DOI, revision, licence, download date, hashes, classes and label quality.
2. Inspect labels and duplicates. Create a versioned manifest showing split assignment; group by site/flight for aerial imagery, and by trap/substrate or collection campaign for ovitrap imagery where metadata permits.
3. Freeze holdout test data before training. Use training split for learning, validation for thresholds/hyperparameters, and untouched test for final score. Do not repeatedly tune to the test split.
4. Establish simple baselines: pretrained generic detector if classes overlap; classical thresholding/image-processing or trivial count baseline for eggs. Record failure modes.
5. Fine-tune or train a suitable model only if the environment/data licence permits. Log weights, training config, seed, library versions, epochs, image size and augmentation.
6. Run independent held-out evaluation, per-class/per-sample error analysis and inference-speed tests on declared hardware.
7. Report failure slices: tiny objects, occlusions, confusing plastic items, dark wet surfaces, glare, debris, stacked eggs, poor focus and domain shift.
8. Persist every prediction with `model_version`, `dataset_version`, `source_mode`, `confidence_if_available`, timestamps, original image and processing status.
9. Store metrics/evidence as immutable run artefacts (JSON/CSV/plots) with metric definitions, test count and command used. Connect the dashboard to real run records; never hardcode accuracy cards.

**Train/test split disclosure:** Dataset's published 70/15/15 split is a starting point, not proof of source independence. Leakage can inflate performance.

## 4. Drone CV metrics

- **Precision** = TP/(TP+FP), meaning share of predicted detections that match labelled objects.
- **Recall** = TP/(TP+FN), meaning share of labelled objects detected.
- **F1** = 2PR/(P+R).
- **mAP@50** uses IoU 0.50; **mAP@50–95** averages AP over IoU thresholds from 0.50 to 0.95, more demanding for localisation.
- Also report **per-class** results (not just average), confusion matrix, PR curves, examples of TP/FP/FN, input resolution, inference time and tested image count.
- **Safety-focused outcome:** False *eligible-for-treatment* decisions under separately labelled, fictional test-target policy must be zero in mandatory safety test cases. This is a software gate, not proof of field spraying safety.
- Do **not** label container detections as confirmed larvae or guarantee water presence from a single aerial RGB image.

**Recommended output files:** `metrics/drone/eval_summary.json`, `per_class.csv`, `confusion_matrix.png`, `pr_curve.png`, `sample_predictions/`, `failure_cases.md`.

## 5. Ovitrap egg-counting metrics

For reference counts `y_i` and predictions `yhat_i` across `N` **independent images**:

- **MAE** = `mean(abs(yhat - y))` — average eggs miscounted per image.
- **RMSE** = `sqrt(mean((yhat-y)^2))` — penalises large misses.
- **Signed bias** = `mean(yhat-y)` — systematic undercount/overcount.
- **Within-tolerance rate**, for example `abs(pred - actual) <= max(5, 0.1 * actual)`; declare this engineering criterion before using it, not a scientific standard.
- **Empty/egg-positive sensitivity and specificity** only when verified egg-negative images exist.
- **Image failure/rejection rate** for glare, blur, invalid framing, debris or unreadable samples.

**Illustration, not a benchmark:** If reference count = 60 eggs and model prediction = 48, absolute error = 12 eggs and signed error = −12. This single image cannot establish a model's MAE or overall accuracy.

Egg counting is **not species identification**. To claim Aedes-specific egg identification you need species-validated reference labels and a separate evaluation.

**Recommended outputs:** `metrics/ovitrap/count_errors.csv`, `summary.json`, `predicted_vs_reference.png`, `error_histogram.png`, `hard_cases.md`, image-level error table.

## 6. Sampling data schema and analytics

For each `TrapSample`, store at minimum:

```json
{
  "sample_id":"sample-demo-001",
  "block_id":"block-1",
  "trap_id":"trap-1-a",
  "substrate_id":"paddle-2026-10-w1",
  "interval_start":"2026-10-01T00:00:00+08:00",
  "interval_end":"2026-10-08T00:00:00+08:00",
  "egg_count":48,
  "count_source":"MODEL_PREDICTED",
  "image_quality":"VALID",
  "source_mode":"SIMULATED",
  "device_status":"ONLINE",
  "model_version":"fixture-v1"
}
```

The above is **schema-example data**, not a real sample or model measurement.

**Idempotency:** Unique `(trap_id, substrate_id, interval_start, interval_end)`; a recount or re-upload of the same substrate must become a revision, never a new oviposition event. Keep observation timestamp separate from ingestion timestamp.

For a comparable period and block:

- `valid_trap_intervals`: number of independently sampled valid trap intervals.
- `egg_sum`: sum of counted eggs across those valid intervals.
- `eggs_per_valid_trap_interval = egg_sum / valid_trap_intervals` (only when denominator > 0).
- `ovitrap_positivity = valid_intervals_with_eggs / valid_trap_intervals`.
- `completeness = valid_trap_intervals / expected_trap_intervals`.
- `unresolved_verified_sources`, `recurring_verified_assets`, `days_since_last_ground_check`, `approved_missions` and `completed_interventions` remain separate observations.

Do not compare intervals with different length/trap methodology without documented standardisation. If zero valid samples -> `DATA_UNAVAILABLE` with trap-servicing/inspection action; never rank as `LOW_RISK`.

### Required dashboard plots

1. **Drone metrics:** precision/recall/mAP by object class (real evaluation only).
2. **Egg counter:** predicted-versus-technician scatter plot plus absolute-error distribution (real evaluation only).
3. **Block surveillance:** eggs per valid trap-interval by sampling window; show valid/expected denominators and uncertainty/missing data.
4. **Operations:** recommended vs completed inspections, unresolved source findings and follow-up verification statuses.
5. **Resource comparison:** side-by-side fixed/equal vs adaptive under identical constraints, clearly labelled `SIMULATED` or `PILOT_MEASURED`.

**Interpretation note:** Ovitrap counts can increase after other breeding containers are removed because gravid mosquitoes may lay more eggs in remaining traps. Changes alone do not prove control success/failure or a change in dengue incidence.

## 7. Dashboard allocation evaluation and experiments

### Fixed baselines

- **B0 Uniform:** Equal minimum planned inspection allocation per block, adjusted only for hard access/availability constraints.
- **B1 Static:** Fixed schedule / priority derived from outdated initial observations.
- **P Adaptive:** New standardised trap observations + verified unresolved sites + access conditions + recurrence + data quality, with explainable task selection.

Keep **the same** four-block scenario, available crew/drone hours, permission constraints, underlying true actionable sites and price assumptions across methods. Never generate a different hidden truth for the proposed method.

Metrics:

- Number / share of independently verified actionable sites discovered and resolved.
- **Recall of actionable sites** = verified issues discovered / total issues in the scenario ground truth.
- Cost per independently verified issue (using a documented unit-cost model).
- Labour-hours per independently verified issue.
- Scheduled tasks completed and time to verified physical correction.
- Minimum coverage met in all blocks; proportion of invalid/offline traps incorrectly called low priority (must be 0 in scripted cases).
- No unsupported treatment action; no unauthorised mission; no exceeded budget.

Run **scenario sensitivity tests**: Block 1 high observations; Block 2 rising but no confirmed source; Block 3 stable; Block 4 offline; all blocks low; high uncertainty; no drone authorisation; zero budget; repeated water accumulation; priority changes after one newly verified source. Compare outputs and record exact reasoning.

Ablations to strengthen the pitch: adaptive without ovitrap evidence, without recurrence, without drone access, then full system. Demonstrates why each of the three pillars adds value when modelled conditions justify it. State these are simulation findings.

## 8. Intervention evaluation — never confuse a software event with biological outcomes

Use separate fields and denominators:

- `intervention_requested`, `approved`, `executed` and `follow_up_verified` are distinct states.
- A controlled bench **water-only** actuation can demonstrate an interface, not larvicidal efficacy.
- `site_condition_corrected` requires documented independent physical follow-up.
- `mosquito_or_egg_reduction` needs entomological protocol, suitable baseline and comparison sites, adequate monitoring and qualified field partners.
- `dengue_incidence_reduction` requires a much more rigorous public-health design. Do not estimate from a short demo.
- Do not autonomously dispense real pesticides or direct chemical dosing. Real drone operations require appropriate operator/regulatory approvals and treatment/site permissions.

## 9. Implementation contracts for coding agent

- Implement `DatasetManifest`, `ModelEvaluationRun`, `ModelMetric`, `TrapSampleQuality`, `AllocationBenchmarkRun` or equivalent typed models. Migrations, permissions and API routes required.
- Provide CLI jobs: `evaluate_drone_model`, `evaluate_egg_counter`, `benchmark_allocation`; implement flags for paths/config and deterministic seed.
- CLI evaluation must refuse to present numeric ML scores if no independent labels exist; show `NOT_EVALUATED` and dataset limitations.
- Save run metadata: `run_id`, `model_hash`, `dataset_name/version/hash/licence`, split policy, test count, metrics, time, hardware, source mode, report path.
- UI should show *real metrics only* from completed evaluation artefacts; if unavailable display `Not evaluated` and the missing prerequisite. Sample charts must say `Illustrative/simulated`.
- Add tests for bad metrics input, zero denominator, duplicate samples, invalid count, all-positive dataset limitation, offline trap, permission-bound mission, repeatable benchmark outcomes.
- Include a report generator producing reproducible Markdown plus plots and CSV; export is supporting evidence, not a substitute for completing the application.
- Do not train on test data, hide performance slices, claim zero biological risk or silently fall back to fixture predictions while displaying them as model outputs.

## 10. Minimal sprint order

1. **Day A:** Inspect/acquire datasets, verify licences, manifests and splits; implement four-block sample ingestion with `source_mode` and deduplication.
2. **Day B:** Drone object-detection baseline + held-out evaluation; export confusion/per-class metrics.
3. **Day C:** Egg counting from reference images + MAE/RMSE/bias; add verified negative images if available.
4. **Day D:** Implement surveillance denominators and trends; `DATA_UNAVAILABLE` handling.
5. **Day E:** Implement adaptive-vs-uniform benchmark with equal budget, independent truths and deterministic seeds.
6. **Day F:** Wire evaluation views into the main dashboard and record failure cases for the pitch.

Work in parallel where possible; never fabricate success when missing datasets, dependencies or compute block a step.

## 11. Source documentation

- Drone image dataset: https://data.mendeley.com/datasets/vr3kkt9mvn/1
- Technician-counted egg image samples: https://zenodo.org/records/6962536
- Ultralytics detection metrics and validation: https://docs.ultralytics.com/guides/yolo-performance-metrics and https://docs.ultralytics.com/guides/model-testing
- CDC Aedes surveillance (ovitrap competition and sampling caveats): https://www.cdc.gov/mosquitoes/pdfs/mosquito-control-508.pdf
