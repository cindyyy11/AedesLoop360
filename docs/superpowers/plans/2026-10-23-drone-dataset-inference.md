# Drone Dataset and Inference Integration Plan

> **For agentic workers:** Follow the project’s existing implementation contract. Execute in the current checkout because it contains user work; preserve all pre-existing edits.

**Goal:** Add a real, configurable aerial detector inference path to image upload and make its candidate findings traceable while retaining safe uncertainty and honest NOT_EVALUATED status until a locally trained, held-out checkpoint exists.

**Architecture:** Use the existing FastAPI upload route, SQLAlchemy Media/Finding records, tenant checks, fixture fallback, and evaluation CLI. Put optional Ultralytics/PyTorch loading behind a small adapter configured by environment variables; detector output creates candidate findings only, never a water confirmation or treatment authorization. Dataset acquisition, training, held-out evaluation, and dashboard evidence registration remain explicit operator steps until verified artifacts exist.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Pillow, optional Ultralytics YOLO, existing pytest and Ruff setup.

**Spec:** `docs/DATA_ANALYTICS_AND_EVALUATION.md`, `docs/PRD.md`, `docs/API_CONTRACT.md`, `docs/adr/ADR-005-analytics-evidence.md`.

## Global Constraints

- Candidate containers never confirm standing water, larvae, Aedes species, treatment eligibility, or dengue risk.
- Missing checkpoint or inference dependency yields a persisted uncertain ground-review finding.
- Existing exact synthetic image behavior remains explicitly labelled `SIMULATED` / `DEMO_PREANNOTATED_V1`.
- Tenant authorization, media rights and audit trail stay enforced on the server.
- Never report fixture scores as model performance; evaluation requires held-out labels, predictions, checkpoint and hashes.

---

### Task 1: Document the implementation slice

**Files:**
- Create: `docs/superpowers/plans/2026-10-23-drone-dataset-inference.md`
- Modify: `docs/DATA_IMPLEMENTATION_STATUS.md`

- [x] Record the repository state, implementation scope, constraints, commands, and unresolved external-data requirements.

### Task 2: Add a lazy local detector adapter

**Files:**
- Create: `services/api/app/drone_inference.py`
- Create: `services/api/tests/test_drone_inference.py`
- Modify: `services/api/requirements-ml.txt`

**Interface:** `infer_candidates(image_bytes: bytes, model_path: str | None = None, loader: Callable | None = None) -> InferenceResult`. Return a status, model version, and zero or more normalized candidate boxes. Import/load the ML package only when a checkpoint is configured.

- [x] Test absent checkpoint and missing package behavior.
- [x] Test coordinate normalization, confidence/class extraction, and empty predictions using a fake loader.
- [x] Implement lazy Ultralytics adapter and explicit failure statuses.

### Task 3: Connect upload to candidate findings

**Files:**
- Modify: `services/api/app/main.py`
- Create: `services/api/tests/test_drone_upload.py`
- Modify: `services/api/tests/test_loop.py` (update the configured-model-missing adapter label)

**Behavior:** Exact fixture hash retains existing fixture path. Other images run the configured detector; each detection is persisted as an `IMPORTED`, `UNCERTAIN` candidate with confidence, checkpoint-derived model version, and review rationale. If not configured or inference fails, preserve a whole-image ground-review finding with an honest reason. No inference result is automatically eligible for action.

- [x] Add upload-function/persistence test for a detected candidate and preserve the missing-model path test.
- [x] Implement the integration while keeping current upload response and tenant/audit behavior.

### Task 4: Record setup, training, evaluation and limitations

**Files:**
- Modify: `docs/DATA_IMPLEMENTATION_STATUS.md`
- Modify: `docs/DATA_RESULTS_REPORT.md`
- Modify: `docs/DEMO_RUNBOOK.md`

- [x] Document the published CC BY 4.0 aerial dataset candidate (DOI 10.17632/vr3kkt9mvn.1), emphasizing that publisher-declared 2,821 images and split have not been locally verified.
- [x] Give exact optional dependency/model setup and evaluator commands, and explain that no real metrics exist until dataset, checkpoint, and held-out predictions are supplied.
- [x] Run targeted tests/lint; record exact outcomes. Full E2E is only claimed if run.

**Execution note:** The detector unit tests and upload function/persistence integration test pass using a fake detector. The HTTP TestClient/browser round trip remains blocked by sandbox loopback socket initialization. External dataset metadata retrieval also failed because DNS/network is unavailable. Ultralytics 8.4.63 and PyTorch are installed; no compatible checkpoint, dataset archive, training run, held-out score or dashboard metric was available in this environment.

## Out of scope for this slice

- Downloading large external corpora or committing weights to Git.
- Claiming an existing generic COCO model detects this dataset’s domain classes.
- Training a detector without locally available data/runtime and recorded compute.
- Ovitrap model integration, which should follow as a separate image-counting slice.
- Any flight, actuator, pesticide, or autonomous intervention connection.
 
