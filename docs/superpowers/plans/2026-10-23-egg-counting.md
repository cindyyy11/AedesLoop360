# Egg Counting Implementation Plan

> For agentic workers: use subagent-driven-development for independent implementation and review. Steps are tracked here.

**Goal:** Train and evaluate an honest count estimator and connect reviewed proposals to persisted intervals.

**Architecture:** Standalone dataset/training/evaluation tools share preprocessing with a lazy inference adapter. A scoped analysis service owns uploads and confirmations; the React panel consumes generated OpenAPI types.

**Tech Stack:** Python, Pillow/OpenCV, scikit-learn, PyTorch/torchvision, FastAPI/Pydantic, SQLAlchemy/Alembic, Next.js/React.

**Spec:** `docs/superpowers/specs/2026-10-23-egg-counting-design.md` (approved approach in chat).

## Global constraints

- Original Downloads files and unrelated working changes remain intact.
- Training and model selection never use held-out or external labels.
- Model proposals never update interval trends until reviewer confirmation.
- No fabricated boxes, confidence, negative-sample specificity or accuracy claims.
- Mode IMPORTED on external evidence; synthetic fallback explicitly SIMULATED.

## Tasks

1. [ ] Dataset pipeline (`scripts/prepare_egg_data.py`, `services/api/tests/test_egg_data.py`): validate counts/files and hashes, quarantine conflict groups, remove identical copies, split whole pallets, export manifest and ROI previews. Assert no group/hash overlap and valid count ranges. Run `python -m pytest services/api/tests/test_egg_data.py -q`.
2. [ ] Model comparison/runtime (`services/api/app/egg_vision.py`, `scripts/train_egg_counter.py`, `scripts/evaluate_egg_counter.py`, `services/api/tests/test_egg_vision.py`): share image-only, crop-aware features; use pretrained weights with SHA-256 and no random-weight substitution; compare median, image processing, frozen pretrained ResNet18, and staged fine-tuned pretrained ResNet18 (frozen-head warmup then final block at low LR) by pallet-weighted validation MAE. Freeze artifact before test; export per-image/group metrics and plots. Missing model returns unavailable, not zero. Run the focused tests and real training/evaluation commands.
3. [ ] Persisted review workflow (`services/api/app/egg_analysis.py`, router, models/contracts, migration 007 and tests): authenticated multipart upload takes trap, image/rights/time/ROI/idempotency key; inference adapter returns status/estimate/version/reason. Confirmation requires reviewer/coordinator and interval metadata, audits overrides and preserves deduplication. Tests assert role/tenant boundaries, no sample before confirmation, replay/conflict and offline behavior. Migration upgrades an isolated DB.
4. [ ] Frontend (`apps/web/components/egg-counter.tsx`, ovitrap integration, generated contracts): upload, preview and explicit ROI, proposed count, failure/retry, reviewer acceptance/correction with interval fields. Follow existing visual system. Run lint/typecheck/build and browser tests where available.
5. [ ] Integration and evidence: independent spec/code review; fix findings; run appropriate regression checks; record exact results, migrations and demo instructions in implementation/acceptance/runbook docs.

## Interface contract

`app.egg_vision.infer_egg_count(content: bytes, roi: list[float]) -> EggEstimate` returns `status` (ESTIMATED, NOT_CONFIGURED, MODEL_MISSING, INVALID_IMAGE, UNSUPPORTED_IMAGE, INFERENCE_FAILED), `estimate: int | None`, `model_version: str | None`, `reason: str | None`, and `details: dict`. Configuration: `AEDES_EGG_MODEL_PATH`. ROI is normalized [x1,y1,x2,y2]. No calibrated confidence is promised.

The API worker implements the persisted workflow and sends exact schema to frontend implementer after generating contracts. The model worker owns all training/data/runtime scripts. Frontend owns only its new panel and a small integration in ovitraps. No shared-file edits occur concurrently.

## Review ledger

| Tasks | Shared interface | Preflight decision |
|---|---|---|
| 1/2 | dataset manifest, image/ROI/count/group/split/hash records | Versioned manifest, exclude metadata from model features |
| 2/3 | EggEstimate and infer_egg_count | Lazy optional adapter; no estimate on failure |
| 3/4 | OpenAPI schemas and paths | API generates contract before panel implementation |
| All | status docs and existing dirty files | Root alone appends scoped documentation; no wholesale replacement |

Ruling: continue in the user's existing feature checkout to preserve concurrent, uncommitted application work. Do not commit unrelated work or change the live demo DB during validation. The chat approval covers the written design; do not ask for redundant approval.
