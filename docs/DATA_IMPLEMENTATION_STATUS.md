# Data and Evaluation Implementation Status

## Fresh integration audit — 23 October 2026

**Conclusion: partially implemented; real dataset-to-model-to-application integration is not implemented.** This audit preserves the existing uncommitted application work. No model was trained, loaded or evaluated by this audit.

| Prompt step | Current evidence | Remaining gap |
|---|---|---|
| 0: repository audit | Existing API, UI, migrations, tests and evaluation scripts inspected | No production or hardware certification implied |
| 1: datasets | Versioned candidate manifest and local validation CLI exist | Both external roots are null; only 2 synthetic images and 0 independent labels found. External licences, actual counts and split leakage remain unverified |
| 2: drone benchmark | JSON prediction scoring and missing-prerequisite reports exist | No checkpoint loading/inference adapter, detector-library benchmark, measured latency or real error-image evidence. Upload uses exact fixture hash or unsupported ground review |
| 3: egg benchmark | Count-pair scoring utilities exist | No image counting model or technician corpus connected. Supplied counts are not image inference; real failure analysis and quality-model rejection evaluation remain absent |
| 4: surveillance | Persisted interval aggregation, denominators, quality/provenance and unavailable states exist | Field inputs and device acquisition remain unverified |
| 5: allocation | Repeatable uniform/static/adaptive simulation exports exist | No field effectiveness evidence; adaptive does not dominate every metric |
| 6: persistence/API/UI | AnalyticsRun, migrations 005/006, tenant-scoped endpoints and dashboard panels exist | Registration imports externally supplied results; it does not prove predictions came from the hashed checkpoint. No complete inference-job lifecycle or authenticated error-image/artifact browsing demonstrated |
| 7: verification | Focused analytics/data/benchmark tests pass | Full API suite stalled after 25 progress markers and was interrupted; browser E2E/build were not rerun in this audit |
| 8: evidence report | Existing report honestly marks models NOT_EVALUATED | No empirical plots or genuine model metrics can be delivered without actual held-out inference |

### Fresh command results

- `PYTHONPATH=services/api python -m pytest services/api/tests/test_analytics.py services/api/tests/test_data_evaluation.py services/api/tests/test_allocation_benchmark.py -q --basetemp .pytest_cache/current-audit-focused`: **25 passed in 24.38s**.
- `PYTHONPATH=services/api python -m pytest services/api/tests -q --basetemp .pytest_cache/current-audit`: **incomplete**, interrupted after stalling; not a full-suite pass.
- `python -m ruff check scripts/data_evaluation.py scripts/register_evaluation.py scripts/benchmark_allocation.py services/api/app/data_analytics.py services/api/app/allocation_benchmark.py`: **passed**.
- `npm run typecheck` / `npm run lint`: shell launcher failed because no Node version is selected. Repeated using bundled Node directly with `node_modules/typescript/bin/tsc --noEmit` and `node_modules/eslint/bin/eslint.js app components lib`: **both passed** (combined process exit 0).
- `python scripts/data_evaluation.py validate-dataset --dataset local-app-fixture-images-v1 --out data/audit-20261023`: completed; 2 files, 0 labelled images, 0 test images; **NOT_EVALUATED**.
- `python scripts/data_evaluation.py eval-drone --out data/audit-20261023` and `eval-eggs` with the same output directory: completed; **NOT_EVALUATED**, metrics null, missing labels/predictions/checkpoint.
- `python scripts/benchmark_allocation.py --out data/audit-20261023/allocation.json`: **passed**, JSON/CSV/Markdown written; simulated coverage uniform 4/8, static 3/8, adaptive 4/8.
- `PYTHONPATH=services/api AEDES_DATABASE_URL=sqlite:///C:/Users/User/AedesLoop360/data/audit-20261023/migration.sqlite python -m alembic -c services/api/alembic.ini upgrade head`: **passed** on an isolated database. No new migrations added by this audit.

### Reproduce the current demonstration

Follow the three PowerShell terminals in `README.md` (migrate/seed/API, durable worker, Next.js). Open `/dashboard`, enter as coordinator, inspect the two NOT_EVALUATED cards, run the simulated allocation benchmark, and follow `docs/DEMO_RUNBOOK.md` for approved mission → labelled interval sample → refreshed plan → independent verification. That flow uses persisted synthetic evidence. The highest-value missing slice is a licensed dataset plus a reproducible checkpoint inference adapter, held-out run artifacts and resulting dashboard record; merely registering supplied predictions does not complete it.

Files changed by this audit: this document and the audit addendum in `docs/IMPLEMENTATION_STATUS.md`. Generated local artifacts are under `data/audit-20261023/`; existing application edits were preserved.

## Drone inference slice in progress

Added `services/api/app/drone_inference.py`, an optional local YOLO checkpoint adapter. The upload route now invokes it for non-fixture images when `AEDES_DRONE_MODEL_PATH` points to a checkpoint and the optional runtime is installed. Each returned box becomes an `IMPORTED` candidate finding with normalized coordinates, score and checkpoint hash prefix in its model version. All detections remain `UNCERTAIN` and require ground review. Empty detections, missing checkpoints, missing runtime and inference exceptions remain ground-review records. The exact synthetic fixture behavior is retained. This wires the model execution boundary; **no compatible trained checkpoint or external dataset is present yet**, so the current live configuration still returns `NOT_CONFIGURED`.

Files added/changed in this slice: `services/api/app/drone_inference.py`, `services/api/requirements-ml.txt`, `services/api/tests/test_drone_inference.py`, `services/api/app/main.py`, `services/api/tests/test_loop.py`, and `docs/superpowers/plans/2026-10-23-drone-dataset-inference.md`. No migration is needed because the existing Media/Finding entities already preserve adapter, mode, class, box, confidence, model version and audit events.

Publisher page says DOI `10.17632/vr3kkt9mvn.1`, 2,821 PNG images, five candidate-object classes, a 70/15/15 split and CC BY 4.0. These remain publisher-declared metadata; local files, labels, split and near-duplicate/site leakage have not been verified. [Publisher record](https://data.mendeley.com/datasets/vr3kkt9mvn/1). Ultralytics documents local installation and Python prediction; the optional dependency is isolated from the core service. [Ultralytics installation and prediction guide](https://docs.ultralytics.com/quickstart).

After a compatible checkpoint is trained and validated, start the API with `AEDES_DRONE_MODEL_PATH=C:\models\aedes-candidates.pt` set in the same PowerShell environment. Install the optional runtime into the API Python environment with `python -m pip install -r services/api/requirements-ml.txt`. Do not point at generic COCO weights and interpret their labels as the five aerial-dataset classes. Dataset acquisition, format conversion, training, independent test predictions and real dashboard evaluation registration remain incomplete. No empirical performance claim is supported by this code change.

Verification for this in-progress slice is pending; see the final audit report for commands and results.

**Audit date:** 2026-10-23  
**Scope:** Incremental data-only analytics and evaluation update. Existing app behavior and fixture claims were inspected before changes.

## Starting gap checklist

| Area | Existing path and evidence | Gap at start of this update |
|---|---|---|
| Aerial inference | `services/api/app/main.py` uploads media; exact fixture hash links a hand-authored annotation. Other uploads become `UNCERTAIN`. | No trained or loaded detector, dataset labels, model evaluation table, detector package, or true measured CV metrics. |
| Ovitrap samples | `services/api/app/models.py` `Sample` and `SampleRevision`; `services/api/app/surveillance.py` deduplicates intervals and excludes poor quality/non-comparable windows. | No external image/count corpus, count model, per-image prediction records, count evaluator, interval history chart or explicit full quality denominators. |
| Planning | `services/api/app/planning.py` deterministic adaptive rules; `/api/v1/planning/runs` persists plans. | No uniform/static strategies compared under shared truth and budget; no independent scenario truth or benchmark record. |
| Dashboard | `apps/web/components/overview.tsx` shows persisted block summaries and a fictional map. `apps/web/components/ovitraps.tsx` draws fixture counts using CSS. | No model evaluation status, model charts, interval quality trend, or equal-budget comparison view. Existing count visuals are explicitly fixture data. |
| Datasets and splits | `fixtures/images/aerial-001.png`, `fixtures/images/egg-new-001.png`, `fixtures/four_block_scenario.json`. | Two tiny local synthetic images only. No external dataset archives, labels, split files, checkpoints, model libraries, or licenses downloaded into the repo. Candidate dataset page claims need local file/hash/split verification before use. |
| Persistence/API | Existing SQLAlchemy/Alembic SQLite app; migrations through 004. | No analytics run persistence or read endpoint for evaluation/benchmark results. |

The primary data specification in this repository is version 1.0, while the supplied execution prompt describes it as v1.1. The checked-in specification is treated as authoritative until it is revised in the repository.

## Dataset evidence available at audit

- Mendeley DOI `10.17632/vr3kkt9mvn.1` page declares 2,821 images, five candidate-container classes, a 70/15/15 split and CC BY 4.0; no archive or split files are present locally. This declaration is not a locally validated dataset load. [Dataset record](https://data.mendeley.com/datasets/vr3kkt9mvn/1)
- Zenodo DOI `10.5281/zenodo.6962536` describes 300 egg-positive ovitrap-stick photographs and technician counts; no archive or CSV is present locally. The all-positive corpus cannot support specificity/true-negative claims. [Dataset record](https://zenodo.org/records/6962536)
- The demo fixtures are synthetic/preannotated and will not be reported as empirical model performance or field impact.

## Verification log

## Implemented in this update

- `scripts/data_evaluation.py` and `docs/dataset_manifest.v1.json` provide a dependency-light local dataset inventory, deterministic group split mapping, duplicate/hash checks, YOLO label validation, hand-checkable detection/count metric utilities and `NOT_EVALUATED` reports when prerequisites are absent.
- `scripts/register_evaluation.py` registers completed CLI reports in the local tenant database only when held-out split, positive test count, dataset/checkpoint hashes and externally labelled provenance are present. Registration does not independently verify label truth or split independence.
- `services/api/app/models.py`, `services/api/migrations/versions/005_analytics_runs.py` and `006_trap_sampling_cadence.py` add tenant-scoped analytics run records and a documented 7-day default trap cadence. Cadence is an expected sampling assumption, not proof of device collection.
- `services/api/app/data_analytics.py` computes valid/expected interval denominators, valid-only egg sums/rates, positivity, completeness, quality exclusions, unavailable trap status, interval comparability warnings, provenance, and collection versus upload timestamps.
- `/api/v1/analytics/evaluations`, `/api/v1/analytics/surveillance`, and `/api/v1/analytics/allocation-benchmark` expose tenant-scoped records; the benchmark POST is coordinator-only, idempotent, audited, and persists the SIMULATED experiment.
- `services/api/app/allocation_benchmark.py` compares uniform, frozen-static and adaptive policies against common authored issue labels and equal constraints. Strategy planning receives evidence and budget; scoring receives truth only after tasks are selected.
- `scripts/benchmark_allocation.py` exports reproducible JSON, CSV and Markdown results for the same simulation.
- `apps/web/components/overview.tsx` and `apps/web/app/globals.css` add evaluation status cards, persisted interval quality/trend charts and a clearly labelled simulated strategy comparison. No metrics display as model scores until a genuine completed evaluation is recorded.

## Actual computed results

- Dataset inventory: **2** local fixture images found, **0** independent labels. External candidate roots are not configured. Model checkpoint count: **0**.
- Drone detection: `NOT_EVALUATED`; no genuine precision, recall, F1, mAP or latency values exist.
- Ovitrap count: `NOT_EVALUATED`; no genuine MAE, RMSE, bias or tolerance values exist. Negative specificity also remains `NOT_EVALUATED`.
- Allocation experiment: uniform **4/8** scripted issue categories covered and **3** latent sites discovered; static **3/8** and **2**; adaptive **4/8** and **2**. All three share the four-block truth and eight staff hours. Uniform leads in latent-site discovery; adaptive ties it on total scripted coverage. These are software simulation outputs only.

## Verification log

- `python -m pytest services/api/tests/test_analytics.py services/api/tests/test_data_evaluation.py services/api/tests/test_allocation_benchmark.py -q --basetemp .pytest_cache/data-final-7` from the repository root with `PYTHONPATH=services/api`: **25 passed**.
- `ruff check` on all changed Python modules/scripts/tests: **passed**. `ruff format --check` on the same files: **passed**. Ruff warned its optional cache could not be written; checks completed.
- `python -m compileall -q services/api/app services/api/migrations/versions scripts/data_evaluation.py scripts/register_evaluation.py scripts/benchmark_allocation.py`: **passed**. `git diff --check`: **passed** (only existing Windows line-ending notices).
- `AEDES_DATABASE_URL=sqlite:///.../migration-test.db python -m alembic -c services/api/alembic.ini upgrade head`: **passed** on a separate isolated database.
- OpenAPI export and TypeScript generation completed. Frontend `tsc --noEmit`: **passed**. ESLint ran with no diagnostics. `AEDES_NEXT_DIST_DIR=.next-analytics-build next build`: **passed**. The default `.next` output first hit a Windows `EPERM` while the existing app output was in use; an isolated build directory passed, and the build-only `tsconfig.json` additions were removed afterward.
- Dataset CLI was run for local fixtures, external drone candidate, drone evaluation without prerequisites, and egg evaluation without prerequisites; all reports were `NOT_EVALUATED` with no metric numbers.
- `python scripts/benchmark_allocation.py --out .pytest_cache/benchmark-results/allocation.json`: **passed**, wrote JSON, CSV and Markdown outputs. The generated report records the scripted experiment and shared constraints.
- Existing `services/api/tests/test_loop.py` was attempted, but stalled without reporting cases for over 90 seconds and was interrupted. No pass claim is made for that suite or E2E/Playwright. Earlier wrong-directory test attempts also failed on root-relative imports/Alembic config and are excluded from passing counts.
- New migrations **005** (analytics runs) and **006** (trap cadence) were executed successfully on the isolated database.
- Exact evaluator commands and limitations are in `docs/DATA_RESULTS_REPORT.md`. Local demo startup instructions remain in `docs/DEMO_RUNBOOK.md`.
