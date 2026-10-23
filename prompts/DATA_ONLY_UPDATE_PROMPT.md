# AedesLoop 360 — DATA-ONLY Coding Agent Implementation Prompt

**Purpose:** Run this prompt in an **already existing** AedesLoop 360 repository after the main PRD/build prompt has been used. Implement **only** model evaluation, data analysis, reproducible evidence and the dashboard's analytics integration. **Do not regenerate the application.**

## ROLE AND PROJECT CONTEXT

You are a senior ML engineer, computer vision engineer, data scientist, backend developer, and QA lead working in an existing hackathon codebase.

Existing product pillars (preserve them):
1. AI drone — detect *candidate water-holding objects* in aerial images; simulation/mock intervention only.
2. Smart ovitrap — image-based egg-count estimation and interval-based surveillance; optional acoustic sensor must not block this update.
3. Adaptive dashboard — display trustworthy observations, determine next **inspection priorities** and compare resource-planning strategies under the same budget.

Main outcome: deliver a **working, measurable, reproducible** data pipeline across these pillars, with honest labelling of empirical ML scores versus simulation results. Do not conflate egg counts with adult mosquito abundance, Aedes species certainty, chemical efficacy or dengue-infection risk.

## PRIMARY SPECIFICATION

Read and implement: `docs/DATA_ANALYTICS_AND_EVALUATION.md` (v1.1). It overrides older, less specific wording **for data analysis and evaluation only**. Follow existing `AGENTS.md`, PRD, architecture, contracts, safety and testing instructions. Do **not** overwrite them or refactor unrelated code.

**Execution behavior:** Inspect the repository and existing source code; explain briefly what is implemented and what is missing, then immediately implement the gaps. Do not stop at a plan. Do not ask me to repeat project details. Reuse current framework/paths. If compute, downloaded datasets, network or dependencies are unavailable, implement the evaluators, contracts, sample reports and labelled fixture fallbacks now, record the blocker, and keep executing the remaining work.

## NON-NEGOTIABLE INTEGRATION RULES

- Preserve all working Next.js/FastAPI/DB/auth/mission/ovitrap/HITL features and API shapes; add additive migrations and adapters when needed.
- Use the project's existing code structure and actual ORM/validation framework, not a second parallel database or backend.
- Respect tenant access, private image storage and role-based permissions. No hardcoded secrets.
- Do not connect data evaluation logic to real pesticide dispensing, real flight commands or autonomous physical actions. BENCH_TEST/mock water-only testing remains separated.
- Real benchmark numbers must come from **actual labelled held-out evaluation** and persisted artefacts. Faked or fixture-generated metrics must **never** appear as genuine model results.
- Persist `source_mode` / provenance throughout: e.g., `REAL_MEASURED`, `EXTERNALLY_LABELLED`, `MANUALLY_VERIFIED`, `SIMULATED`, `PREANNOTATED_FIXTURE`, `NOT_EVALUATED` as appropriate; map to existing project enum without duplicating state models.
- Do not claim an all-positive egg-image dataset proves empty-sample specificity. Do not claim aerial object labels confirm larvae, standing water or a safe treatment site.

## STEP 0 — AUDIT EXISTING REPOSITORY

Inspect file tree and locate (a) current aerial detection inference, (b) trap registry/samples/egg processing, (c) analytics/allocations, (d) model/evaluation DB tables, (e) dashboard charts, (f) scripts, tests and demo fixtures.

Write a concise gap checklist to `docs/DATA_IMPLEMENTATION_STATUS.md`, including found paths, missing features and whether models/datasets are actually available. Cross-reference current docs; don't create a duplicate PRD.

## STEP 1 — DATASET INVENTORY AND VALIDATION

Build or extend a versioned DatasetManifest with download/source URL, licence, DOI, hash, collection device/site/campaign if available, class mapping, test count, split policy, label coverage and leakage warnings.

**Aerial object detection candidate:** https://data.mendeley.com/datasets/vr3kkt9mvn/1 (2,821 manually annotated drone images; five classes and published train/val/test split; confirm actual files before asserting loaded). Never label these as confirmed water or mosquito breeding.

**Ovitrap count candidate:** https://zenodo.org/records/6962536 (300 egg-positive stick images with technician counts). Use for count-error evaluation. Additional zero-egg/blur/hard-negative samples are required before claiming true-negative/specificity statistics.

Implement validation commands that detect missing/malformed labels, duplicate filenames/content, train/test overlap and leakage when grouping IDs permit. Save dataset manifest and a reproducible train/validation/test mapping. Do not train/tune on final held-out test images. Honor dataset rights/attribution and avoid checking large datasets/weights into git by default.

## STEP 2 — DRONE CV BENCHMARK

Integrate into the current drone detector adapter and evaluation framework, not into a new standalone demo app.

- Expose a CLI command/script for evaluation against independent labelled aerial images. Support model checkpoint, dataset YAML/manifest, split, confidence/IoU threshold, seed, output directory; fit exact CLI to repo conventions.
- If a suitable trained model is available, run inference and calculate **per-class precision, recall, F1, mAP@50, mAP@50:95** (using the supported detector library's valid metrics), number of images and instances, and inference latency with hardware label.
- Generate confusion matrix, PR curve and annotated TP/FP/FN error images; include low-confidence/small/occluded objects in analysis.
- Track model weights hash, model version, dataset split/checksum, run ID, date, config and library versions.
- If checkpoint/data unavailable, provide a runnable interface with proper `NOT_EVALUATED`, missing prerequisites and no fabricated percentages.
- A detector of tyres/buckets/containers is **not** a classifier of larvae, eggs, Aedes mosquitoes, actual water presence or spray eligibility.

## STEP 3 — SMART OVITRAP COUNT BENCHMARK

- Implement/reuse egg count inference and load image-to-technician-count pairs from the independent evaluation split.
- Compute **MAE (eggs/image), RMSE, signed bias**, medAE, and within-declared-tolerance %, plus sample count. If missing real predictions, show `NOT_EVALUATED`.
- Make `predicted_vs_reference.png`, `error_distribution.png`, `count_error_by_range.csv`, `failure_examples.md`, and `summary.json` (paths adaptable).
- Keep **image-level count MAE** separate from egg-object detection mAP; only show object detection AP if there are individual egg-level annotations.
- Add explicit data quality states for invalid/blur/poor-lighting/unknown substrate images; count their rejection rate. Evaluate true negatives only if verified egg-negative images were collected.
- Never re-count the same substrate and collection interval as another oviposition event. When photos are repeated, treat them as repeat inference/revision with audit trail.

## STEP 4 — TIME-SERIES ANALYTICS FOR SMART OVITRAPS

Implement backend aggregation based on `trap_id`, `substrate_id`, `interval_start`, `interval_end`, source/provenance and quality:

- Eggs per **valid trap interval** with denominator; ovitrap positivity; monitoring completeness (valid/expected); number of valid traps and missing/offline devices; separate verified unresolved source count and recent interventions.
- Reject data with unusable quality, duplicate intervals or non-comparable interval lengths unless standardised by a documented method.
- Explicitly distinguish observed/collected timestamp from upload/processed timestamp.
- Zero valid intervals => `DATA_UNAVAILABLE`, not a numerical zero, reassuring colour or low priority.
- Provide descriptive changes/trends and traceable sampling metadata; do not automatically interpret rising egg counts as failed treatment.
- Integrate into existing persistence, API and UI with tests.

## STEP 5 — ADAPTIVE PLANNING BENCHMARK

Compare all three strategies over **the same** four-block scenario, true issues, restrictions, staff/drone capacity, costs and random seeds:

1. Uniform baseline (minimum equal inspection allocation).
2. Static plan (baseline-derived fixed priorities, no updates).
3. AedesLoop adaptive plan (new valid egg sampling + independently verified unresolved sources + recurrence + monitoring reliability + permissions/access).

Metrics: verified actionable sites detected per inspection-hour, actionable-source recall, total modelled cost, cost per verified issue, inspections completed, coverage floor, missed issues, resource use and constraint violations.

Add scenario tests: Block 1 persistently elevated and three unresolved sites, Block 2 increasing egg observations but no verified source (inspect, don't automatically treat), Block 3 routine, Block 4 offline (service, not low risk), repeat issue -> engineering review, all-low readings, no drone permission and constrained budget.

Build deterministic, independently labelled scenario truth; do not reward your algorithm with privileged information unavailable to baselines. Generate benchmark tables/plots and explainability notes. Mark all results explicitly **SIMULATED EXPERIMENT**, not field evidence. Add ablations without ovitrap, without drone, without recurrence if time permits.

## STEP 6 — PERSISTENCE, API AND DASHBOARD VISUALS

Reuse existing tables/endpoints where suitable; extend with `DatasetManifest`, `ModelEvaluationRun`, `ModelMetric`, `AllocationBenchmarkRun` or equivalent minimal additive types.

- Store JSON/CSV/PNG/report artifacts under run IDs, with provenance and private access.
- Provide status progression `PENDING -> RUNNING -> COMPLETED/FAILED/NOT_EVALUATED` (map to repo's established status enum).
- Expose backend endpoints (or existing equivalent) to list the latest **completed genuine evaluation runs**, per-class and per-image errors, egg-count run summaries, trap time-series with denominators and equal-budget allocation comparison.
- Display **real metric values from persisted completed runs** in the UI; no dummy percentages. Missing evaluations -> `Not evaluated` with reason.
- Build dashboard sections: **Drone Model Performance**, **Ovitrap Count Accuracy**, **Block Surveillance Quality & Trend**, **Adaptive vs Uniform/Static Benchmark**, **Known Limitations/Experiment Provenance**.
- Label units, sample count, test split, model/dataset version, source mode, chart intervals and timestamps. Explicitly label fixture/simulation outputs.
- Keep pages responsive and functional, with filters, empty, loading and error states.

## STEP 7 — AUTOMATED TESTING AND VERIFICATION

Add unit, integration and UI smoke/E2E tests covering:

- Duplicate trap sample upload and recount does not inflate eggs.
- Different sampling durations are not silently compared as equivalent.
- Missing/invalid/offline sample -> `DATA_UNAVAILABLE`, appropriate servicing task.
- No positive/negative classification-specificity claim from all-positive-only dataset.
- Empty test labels / no checkpoint -> `NOT_EVALUATED`, no numerical accuracy card.
- Correct metrics on a tiny hand-calculated known-count fixture (metric math tests only, not real model performance).
- No mixing of actual evaluated, manual, demo and simulated data in the same claimed result.
- Deterministic benchmark under fixed seed and equal constraints.
- Priority changes after legitimate new data; chemical quantity/real release never automatically adjusted.
- Permissions protect model runs, sensitive images and cross-tenant data; existing drone/mission/HITL tests still pass.

Run appropriate lint, typecheck, tests, build, migrations and end-to-end smoke checks. Fix failures encountered. Record exact commands and outcomes in `docs/DATA_IMPLEMENTATION_STATUS.md`; do not claim unrun tests passed.

## STEP 8 — PRODUCE JUDGE-READY DATA EVIDENCE

Generate `docs/DATA_RESULTS_REPORT.md` **from measured run artifacts only** where available, otherwise show status and blockers. Structure:

- Dataset names/DOIs/licences and independence limits.
- Drone metrics by class and confusion matrix.
- Ovitrap MAE/RMSE/bias, predicted vs reference plot and failure examples.
- Block sample normalisation and data-availability chart.
- Adaptive vs uniform/static results with identical scenario and budget; simulation banner.
- Key limitations, scientific safeguards and next field validation plan.

Export plots/tables that the actual dashboard can also display. Include example annotated images in the demo only with correct licence and source.

## PRIORITIES AND STOP RULES

Order work for **maximum useful verified output**: existing code audit -> dataset quality/schema -> trap sample correctness -> drone evaluation -> egg evaluation -> analytics -> equal-budget benchmark -> dashboard/report -> comprehensive tests.

Do not spend the whole effort replacing the tech stack or training a huge model. If only partial work is possible, ship reliable evaluators, correct data contracts, labelled fixture flows, and tested end-to-end views, with exact missing items listed. No fake performance, no bogus field dengue benefits, no live pesticide/hazardous drone operations.

## REQUIRED FINAL ANSWER FROM CODING AGENT

Report:
1. Existing files/modules reused and every changed/added file.
2. Dataset files actually obtained/loaded; licences, counts, split and leakage checks.
3. Which ML models were actually trained, loaded and **held-out evaluated**, with genuinely computed metrics and artefact paths; list absent models as `NOT_EVALUATED`.
4. Which dashboard visualisations are fed by completed evaluation records vs labelled simulated fixtures.
5. Exact CLI commands for train/eval/benchmark/report generation and dashboard startup.
6. Exact test/lint/build commands run, outcomes and known blockers.
7. One end-to-end demo flow showing drone evidence -> ovitrap sample -> allocation plan change -> report.
8. Remaining work and the **single highest-value next step**.

**Start now. Inspect my existing repository, implement data evaluation incrementally, execute runnable verification, and do not stop after producing a plan.**
