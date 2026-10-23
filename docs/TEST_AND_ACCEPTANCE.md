# Test Plan, Acceptance Criteria, Quality Gates

## 1. Test layers

- **Unit:** Pydantic/domain validation, scoring, mission/work-order state transitions, sample uniqueness, recurrence, permission predicates.
- **Integration:** Postgres/PostGIS constraints/migrations, API response schemas, storage access, worker idempotency, image inference adapters.
- **E2E (Playwright):** login; four-block overview; simulated image upload; review/mission; sample import; plan recalc; intervention and follow-up.
- **Security:** tenant isolation, unauthorized roles, upload validation, expired approval, audit immutability, public evidence object denial.
- **Reliability:** worker down/retry, invalid images, stale devices, duplicate events, restart persistence, network disconnect.
- **Evaluation:** held-out CV/egg image metrics, fixed vs adaptive comparisons under identical budgets.

## Egg-count model-assisted review — 23 October 2026

Local configuration verification: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-api.ps1 -CheckOnly` passed, loading `texture_ridge` with SHA-256 `3ccd3f459141197c13710a51e3cadb4e94b62657dcbb6f24df376f7e647c7714`. A paddle-image inference smoke returned `ESTIMATED` (8 eggs). The API was restarted using this launcher; `GET http://127.0.0.1:8000/api/v1/health` returned `{"ready":true,"database":"sqlite"}`. No migration was executed: repo-root `aedes.db` was already at 008 with `egg_analyses`. Browser upload/reviewer confirmation remains unverified in this configuration step. Local server logs are in ignored `data/egg-api.stdout.log` and `data/egg-api.stderr.log`.

Acceptance scenario: the reviewer selects a trap, uploads a matched image with declared rights and UTC capture time, manually selects the complete substrate ROI, and receives a persisted `ESTIMATED` or explicit unavailable status. A proposal alone creates no interval. The reviewer confirms/corrects its count with a unique collection interval, sample effort, quality and rationale; only then is the imported interval visible in trends. Replaying the same idempotency key returns the existing record, while an already-used sample/image/substrate interval is rejected. Offline traps remain invalid. The API service suite checks role/tenant boundaries, no pre-confirmation sample, null failure, overrides, audit, retries, duplicate interval handling and generic endpoint bypass.

Reproduce the group split and selected-model result from the ignored local data:

```powershell
python scripts/prepare_user_egg_data.py
python scripts/train_egg_counter.py --manifest data/external/user-ovitrap-monitor/grouped-v1/manifest.json --out data/models/eggs/user-paddle-v1 --pretrained data/models/pretrained/resnet18-f37072fd.pth --neural-epochs 6
python scripts/evaluate_egg_counter.py --manifest data/external/user-ovitrap-monitor/grouped-v1/manifest.json --comparison data/models/eggs/user-paddle-v1/validation-comparison.json --out data/models/eggs/user-paddle-v1/held-out-evaluation.json
```

The experiment selected texture ridge using validation only, then scored one held-out test set. It measured image MAE 9.56 eggs and site-direction group MAE 6.40 on 57 images from 10 groups (95% group-bootstrap interval 2.72–10.87). Treat it as exploratory: the grouping key interpretation is unverified, the public-only checkpoint was scored on all 300 user images before this split, and no zero-count samples exist. This is not evidence of species accuracy, population abundance, field effectiveness or dengue-risk prediction.

Persisted workflow validation:

```powershell
$env:PYTHONPATH='services/api'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
python -c "import platform; platform.machine=lambda:'AMD64'; import pytest; raise SystemExit(pytest.main(['services/api/tests/test_egg_analysis.py','services/api/tests/test_egg_data.py','services/api/tests/test_egg_vision.py','-q','--basetemp=.pytest_cache/egg-final','--tb=short']))"
```

On this Windows host the `platform.machine` override avoids a Python WMI crash, and `--basetemp` keeps pytest temporary files inside the workspace. The frontend passed TypeScript, scoped ESLint and production build. Migration 007 upgraded an isolated SQLite database and its five foreign keys were inspected. No dedicated Playwright egg-upload flow was run; use the reviewer steps above against the local demo stack for manual acceptance.

## 2. Core acceptance scenarios (all P0 unless noted)

| ID | Scenario | Expected result |
|---|---|---|
| AC-01 | Fresh seeded DB starts | Four blocks, traps and fictional assets displayed |
| AC-02 | Operator uploads valid aerial fixture | Private media + provenance persisted |
| AC-03 | AI detects tyre/container candidate | Class, bbox, confidence and model/source reported |
| AC-04 | Image unsupported or blurred | Explicit uncertainty; no treatment eligibility |
| AC-05 | Dry candidate | `SKIP`, zero mock actions |
| AC-06 | Occluded candidate | Ground-inspection task, zero mock actions |
| AC-07 | Eligible fictional mock target | Planned demo action generated, not actual pesticide |
| AC-08 | Simulate before mission approval | API returns 409, no action record |
| AC-09 | Coordinator approves mission | Actor/time/reason/policy version audited |
| AC-10 | Simulated mission executed | Ordered events, target outcome and SIMULATED badge |
| AC-11 | Mission aborted mid-run | Remaining targets unvisited, no false complete |
| AC-12 | Duplicate mission event replay | Single canonical event |
| AC-13 | Import valid egg-count interval | One interval counted, linked image/provenance |
| AC-14 | Re-upload same trap sample | No double count |
| AC-15 | Repeat count on same substrate | Revision only, no new sampled eggs |
| AC-16 | Invalid sample/poor image | Excluded from trend denominator, reason shown |
| AC-17 | Ovitrap offline | `DATA_UNAVAILABLE`, service task, not low priority |
| AC-18 | Interval mismatch across blocks | Comparability warning or normalised by effort |
| AC-19 | Change Block 1 sample/issue count | Priority + explanation recomputed and persisted |
| AC-20 | Block 4 missing data | Equipment task; not silently absent from plan |
| AC-21 | All blocks low recent counts | Minimum routine coverage maintained |
| AC-22 | No drone feasible/approved | Ground/monitoring alternatives recommended |
| AC-23 | Planner exceeds budget | Rejected/clamped with reason, no invalid plan |
| AC-24 | Unresolved confirmed source exists | Explicit actionable inspection/removal task preferred |
| AC-25 | Worker completes source removal | Status pending verification, not confirmed eradication |
| AC-26 | Inspector verifies successful correction | `VERIFIED_RESOLVED`, evidence link and actor recorded |
| AC-27 | Same asset has repeated verified accumulation | Engineering correction referral generated |
| AC-28 | Trigger same recurrence again | No duplicate unresolved engineering task |
| AC-29 | Inspector accesses different tenant | HTTP 403; no data exposure |
| AC-30 | Reboot app/worker after import | Observations/actions remain persisted |
| AC-31 | All mock scenario records | Display SIMULATED source and disclaimers |
| AC-32 | No CV model installed | Labelled fixture fallback, no false ML claim |
| AC-33 | Optional water rig unarmed (P1) | Pump cannot activate even with API call |
| AC-34 | Optional stop/timeout fired (P1) | Actuator disarms and records stop/fault |
| AC-35 | Equal-budget baseline comparison (P1) | Same cost constraints; inputs/outputs reproducible |
| AC-36 | Cross-role mission approval attempt | Denied with audit |
| AC-37 | Broken object-storage URL | Safe error/loading/retry, no leaked key |
| AC-38 | All three pillars in one judge workflow | End-to-end state updated on dashboard from backend |
| AC-39 | No independent labelled test data/checkpoint | Evaluation cards show `NOT_EVALUATED`, no fabricated numeric metrics |
| AC-40 | No valid trap intervals or offline device | Analytics shows `DATA_UNAVAILABLE`, null egg rate and servicing need |
| AC-41 | Run adaptive benchmark as coordinator | Uniform/static/adaptive share fixed truth and budget; result persists as `SIMULATED EXPERIMENT` |
| AC-42 | Operator runs adaptive benchmark | API denies benchmark execution |
| AC-43 | Fine-tune local pretrained drone detector | Record official source checkpoint URL/hash, keep source-image groups disjoint, and train only on grouped train images |
| AC-44 | Evaluate candidate detector | Evaluate selected checkpoint once on grouped test images; preserve per-class metrics, dataset/checkpoint hashes, plots and limitations in a tenant-scoped dashboard record |
| AC-45 | Upload a non-fixture image with checkpoint configured | Candidate boxes stay `IMPORTED` and `UNCERTAIN`; an empty model result queues ground review; no automatic intervention |
| AC-49 | Run a simulated drone pass over the traps (operator or coordinator) | Each reporting trap gets a deterministic synthetic paddle photo counted by the egg model and queued in the Drone inbox as a `DRONE_SIM` proposal; offline traps are skipped as `DATA_UNAVAILABLE`, never zero; a repeated idempotency key returns the same results; nothing is surveillance until confirmed |
| AC-50 | Confirm a drone proposal | Only reviewer/coordinator may confirm; the operator is denied; the confirmed sample stays `SIMULATED` and is not presented as an observed field count |
| AC-51 | Run live drone detection from a camera or video file (any signed-in field role) | About 2 frames a second are analysed; boxes are `UNCERTAIN` candidates with stable `#id`s; nothing is stored until Save frame, which uses the normal upload path; the endpoint is rate limited per user (429 with `Retry-After`) and a cold model load does not stop the feed |
| AC-52 | Open Aim a camera on an ovitrap and run a live egg preview | A rolling estimate with its range is shown as a preview only, with no stored analysis; an unavailable model shows no estimate (never zero); Use this frame moves the frame into the normal form where a reviewer still marks the paddle, confirms rights and time, and confirms the count |

## 3. Quality gates

**Gate A — Foundations:** migrations pass, seed idempotent, API health true, auth/tenancy working.

**Gate B — Drone:** safe skip, uncertain, approved mock action, abort and retries tested.

**Gate C — Ovitrap:** interval deduplication, valid/missing quality, egg-count display tested.

**Gate D — Dashboard:** updated sample changes next plan; no data mocked secretly; origin/provenance visible.

**Gate E — Final integration:** E2E scenario AC-38, offline fixture demo from fresh clone, README instructions accurate, no high-severity uncovered safety issues.

Do not claim passing gates until commands run successfully. If a package cannot run in sandbox, record commands and exact blocker.

## 4. Automated test command targets

Preferred (adapt to existing repo):

```sh
# unit/integration
cd services/api && pytest -q
cd apps/web && npm run lint && npm run typecheck && npm run test
# end-to-end
cd apps/web && npx playwright test
# format/security
cd services/api && ruff check . && ruff format --check .
```

Use repo's actual package manager. Add these commands only after scripts exist and work.

## 5. Demo acceptance / evidence collection

Record actual output logs/screenshot with all of: selected dry target skipped, eligible mock target treated only after approved mission, one occluded target referred, updated sample interval changes Block 1 priority, offline Block 4 not green, recurring P-03 task escalates, one follow-up closure and exact source-mode disclosures.

## 6. Model and benchmark evidence

Report dataset name/license, unique site splits, count of test images, metric definitions, baseline, confusion/error values and uncertainty. Synthetic fixture correctness is a functional test, not CV accuracy. Do not conflate performance on artificial dots with mosquito egg detector field accuracy.

The incremental analytics checks are runnable with `PYTHONPATH=services/api python -m pytest services/api/tests/test_analytics.py services/api/tests/test_data_evaluation.py services/api/tests/test_allocation_benchmark.py -q` from the repository root. These cover report status/provenance, unavailable intervals, benchmark persistence/idempotency, role denial, metric formulas and deterministic shared-budget scenario behavior. They do not replace `test_loop.py` or the Playwright closed-loop test.

For AC-43–45, reproduce the grouped split and train/evaluate/register commands in [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md). Run `PYTHONPATH=services/api python -m pytest services/api/tests/test_drone_group_split.py services/api/tests/test_drone_inference.py services/api/tests/test_drone_upload.py -q` for split and adapter checks. Inspect `data/evaluations/drone/drone-yolo-group-test-*.json` and the dashboard card for actual metrics and limitations. The browser upload round trip with the trained checkpoint still requires a separate live stack check.

AC-46 — With the local paddle checkpoint and held-out report present, compare the report checkpoint SHA-256 against `texture_ridge.joblib`, register it with `python scripts/register_evaluation.py --summary data/models/eggs/user-paddle-v1/held-out-evaluation.json --tenant tenant-demo`, and sign in as coordinator. `GET /api/v1/analytics/evaluations` must return `COMPLETED` for both model cards, egg image MAE 9.56 from 57 held-out images, and limitations stating that site/direction grouping is unverified and zero-count specificity was not measured. The live local API check passed on 23 October 2026. Registration does not authorize an automatic ovitrap interval; human confirmation remains required.

AC-47 — Start the configured local API with `pwsh -NoProfile -File scripts/start-api.ps1 -Port 18004`, sign in as coordinator, upload a permitted user-supplied drone training image to `POST /api/v1/media` with `asset_id=asset-p01`, rights and a past timezone-aware capture timestamp, then read `GET /api/v1/findings`. On 23 October 2026 this returned HTTP 200, `YOLO_LOCAL_V1:DETECTED`, and a persisted `water_tank` finding with `mode=IMPORTED` and `water_state=UNCERTAIN`. This is an integration smoke check on a training image, not a generalisation metric. It creates a local demo media/finding record and never treats a site.

AC-48 — With the local API and web app running, from `apps/web` run `AEDES_BROWSER_EXECUTABLE=<installed Chromium path> node node_modules/@playwright/test/cli.js test tests/egg-upload.spec.ts --reporter=line` (set the environment variable in PowerShell before invoking Node). The 23 October 2026 live browser run passed: photo upload, model proposal, reviewer correction, persisted sample interval, and trap-history display. A sandbox-only launch failed before reaching the app because its Playwright headless shell was absent; the installed Chromium executable succeeded outside the sandbox. This test writes one distinct local demo interval.

AC-49 — Run `python scripts/audit_field_validation.py` from the repo root. With the currently absent `data/field-validation/`, it must write `data/evaluations/field/preflight.json` with `MISSING_DATA` and `evaluation_performed=false`. After supplying independently reviewed files in the [field intake format](FIELD_VALIDATION.md), the preflight must reject reused image hashes, missing human independence attestation, malformed boxes, negative egg counts and invalid collection intervals. `READY_FOR_EVALUATION` is a file/provenance gate only; it must never populate a measured analytics card by itself. Covered by `services/api/tests/test_field_validation.py`.

AC-49 / AC-50 — From the repo root run `PYTHONPATH=services/api python -m pytest services/api/tests/test_drone_capture.py -q` (6 tests: simulated pass, offline skip, idempotent replay, role checks, simulated confirmation, inbox scoping). With the API on port 8000 and the web app on port 3000, from `apps/web` run `npx playwright test tests/drone-inbox.spec.ts` (a pass queues `DRONE_SIM` proposals marked `NOT SURVEILLANCE YET`). Each run adds proposals to the local demo database.

## 7. 3D presentation acceptance (additive; does not replace AC-01–AC-38)

- 3D-01: Township renders registered blocks/assets and supports orbit, zoom, reset and HTML evidence selection.
- 3D-02: Only persisted mission events replay; switching to an empty mission clears outcomes; scene interactions issue zero mutation requests.
- 3D-03: Offline Block 4 and trap state remain explicit unavailable data, including timestamps and valid interval counts.
- 3D-04: Saved plan ID, date, score and reasons appear in the allocation chapter.
- 3D-05: At 390px there is no horizontal page overflow; missing WebGL keeps HTML evidence usable and disables camera controls.
- 3D-06: Empty township and failed API reads do not fabricate records; retry is available.
- 3D-07: Live isolated-database test creates and approves a mission as coordinator, simulates as operator, waits for the real worker, and verifies skip/review/mock events and saved plan in the scene.
- 3D-08: Egg-count overlay (chapter 2 or toggle) draws columns from persisted `eggs_per_interval`, fainter with fewer valid intervals; `DATA_UNAVAILABLE` blocks are hatched with no column; legend states it is not adults or risk. Covered by `township-3d.spec.ts` "loop chapter, egg overlay and day/night".
- 3D-09: Recorded replay shows the route over event assets, a hover beam and per-kind tag (SKIPPED / UNCERTAIN ground review / RECORDED not verified effective). Visual replay only; no telemetry.
- 3D-10: Chapter 4 "Close the loop" steps Detect, Plan, Approve, Record action, Verify from stored events/plans only; Verify states follow-up is separate and shows no inferred result.
- 3D-11: Day/night toggle, camera fly-to on selection, shadows and pulsing trap glow; `prefers-reduced-motion` and hidden tabs snap to final state with no continuous animation. Visual quality was checked only via software-rendered headless screenshots.

Reproduction and limits: [3D_TOWNSHIP.md](3D_TOWNSHIP.md). Fixture and live browser checks are separate from model evaluation and biological impact.

### Finding review and planning factors

- `test_finding_review_roles_reject_relabel_and_active_mission_guard` (services/api/tests/test_loop.py): only the reviewer role may review (operator, coordinator and inspector get 403); RELABEL requires a water state and other decisions refuse one (422); REJECT yields `SKIP` and an audit event; RELABEL to DRY yields `SKIP`; RELABEL is refused (409) once a mission under review holds the finding, while REJECT stays allowed.
- `test_samples_dedup_quality_and_planning_feedback` now also asserts every block priority has factors that sum to its score.
- Run each API test file on its own with `PYTHONPATH=services/api:.`; the files set `AEDES_DATABASE_URL` at import time, so combining them in one pytest process shares one database and fails. Use `--basetemp` outside the system temp folder if Windows denies `pytest-of-<user>`.
- Browser check (manual, Playwright with Edge against a scratch database): reviewer rejects the asset-p02 candidate and the row changes from MOCK_ACTION_ELIGIBLE to SKIP; inspector login lands on /operations. No automated Playwright spec covers these yet.

### Allocation benchmark properties

`test_allocation_benchmark.py` also checks that every policy spends its full budget across the 4 to 16 hour sweep, that coverage never decreases with budget, that adaptive never trails uniform in the scripted scenario, that changing the scripted truth does not change any policy's tasks, and that adaptive schedules recurrence and verified-source work before extra inspections. Run with `PYTHONPATH=services/api:.`.

`test_allocation_benchmark.py` also covers the aligned planner: the benchmark's `planner_v1` row is produced by `allocation_rules.select_tasks`; the shipped planner is bounded at 12 staff hours for four blocks (a documented limit, asserted so a future change must update it); and at 4 staff hours it covers one fewer scripted issue than the other policies. Behaviour-preservation of the extraction was checked by comparing allocation results before and after for six budgets (a manual golden comparison, not an automated test).


AC-51 / AC-52 — Unit level: `python -m pytest services/api/tests/test_live_detect.py services/api/tests/test_egg_live_preview.py -q` from `services/api` (17 tests: stateless responses, roles, tenant scope, bad input, rate limit, no rows written) and, from `apps/web`, `npx playwright test tests/live-tracker.spec.ts tests/egg-preview-stats.spec.ts` (10 pure-function tests). Browser level: start an API with `AEDES_DRONE_MODEL_PATH` and `AEDES_EGG_MODEL_PATH` set and a web server whose origin the API allows (`AEDES_WEB_ORIGIN`; use `localhost` consistently), then run `tests/live-detect.spec.ts` and `tests/egg-live.spec.ts` with `AEDES_BROWSER_EXECUTABLE` and a fake camera file: `AEDES_FAKE_CAMERA_MJPEG` and `AEDES_FAKE_EGG_MJPEG` are files of concatenated JPEG frames (a drone tile and a paddle photo repeated). Both specs skip when their variable is unset. `AEDES_TEST_VIDEO` (a playable video clip) enables the video-file test, and `tests/live-camera-denied.spec.ts` needs no camera file. They prove the wiring against fixture frames, not detection or counting accuracy.

### Plain-language UI pass

- `closed-loop.spec.ts` needs a database seeded with the egg fixtures (`media-egg-new-001`) and a running worker on the same `AEDES_DATABASE_URL` as the API. A long-lived development database that has dropped those fixtures fails at the manual-interval step. Use a fresh database (`alembic upgrade head`, `python -m app.seed`) with the API, worker and web server; for a side-by-side run use separate ports, `AEDES_API_ORIGIN`, `AEDES_WEB_ORIGIN` and `AEDES_NEXT_DIST_DIR` (see README). Give the run `--timeout=240000`; it takes about 35 seconds on a quiet machine.
- The test switches the Field operations queue to **List** view after each login, because the default board view has no status-badge text or card headings. It scopes the `GROUND_REVIEW` assertion to the event timeline, because live-detection runs can add extra candidates to the findings list.
- Egg counting and the drone inbox need `AEDES_EGG_MODEL_PATH` (use `scripts/start-api.ps1`). Without it a fresh stack reports `NOT_CONFIGURED`.
- Manual check: Overview shows the Start here links; at 390px no page scrolls horizontally and the nav shows a faded edge. Verified for Overview, Drone missions, Smart ovitraps, Next-round planning and Field operations.
- Full-suite run (23 October 2026, fresh seeded database, API started with `scripts/start-api.ps1`, one worker on the same database): 21 passed, 4 skipped. The skips are opt-in and need `AEDES_LIVE_3D_TEST=1`, `AEDES_FAKE_EGG_MJPEG`, `AEDES_FAKE_CAMERA_MJPEG` or `AEDES_TEST_VIDEO`. `closed-loop.spec.ts` passed on its own re-run after the worker had stopped during the first full run (the worker is a separate process: confirm it is running before a run; a mission stays `SIMULATING` without it).
- `closed-loop.spec.ts` changes data it later asserts on (it corrects a sample count), so it passes once per seeded database. Re-seed before running it again. Other specs tolerate a used database.
- `egg-upload.spec.ts` selects the result card by analysis id (from the POST response) instead of taking the first card, because the previous result can stay on screen until the list refetch lands.
