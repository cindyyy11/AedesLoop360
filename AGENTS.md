# AGENTS.md — Engineering Instructions for AI Coding Agents

> This file applies to the whole repository. It is an implementation contract, not a marketing brief. Read `docs/PRD.md` and architecture/contract files first.

## Goals and definition of success

Build a functional, polished end-to-end four-block AedesLoop 360 demonstration of **AI drone + smart ovitrap + command dashboard**. Value comes from their working data feedback loop. Every screen must connect to persisted data or explicitly labelled fixtures; no fake backend calls, decorative actions or simulated success presented as real.

## Before editing

1. Inspect repo structure, package managers, current dependencies, git status, migrations, tests and running commands.
2. Identify what is already implemented; produce a brief gap map in `docs/IMPLEMENTATION_STATUS.md` (create/update it).
3. Keep user work and existing files intact; no destructive commands or wholesale replacement. If architecture is already established, follow it unless a documented ADR justifies improvement.
4. Plan and execute **vertical slices** with runnable code and tests; do not stop after writing a plan unless blocked by missing credentials or incompatible environment.
5. Cite source evidence in repo documentation for nontrivial scientific/regulatory assertions; label assumptions.

## Product invariants

- Three pillars: **drone inspection/intervention simulator**, **smart ovitrap surveillance**, **adaptive dashboard**. All three must share canonical block/asset/observation/event IDs.
- Ovitrap eggs ≠ adult population ≠ confirmed Aedes species ≠ human dengue risk.
- New egg observations belong to a *collection interval* and must never double-count old eggs. Preserve `collected_at`, `interval_start/end`, `sampling_effort`, `source`, `quality`, `review_status`.
- A missing/offline trap is `DATA_UNAVAILABLE`, not `LOW_RISK`; sample size and quality accompany trends.
- CV classes are *candidate containers*, not confirmed larval sites. Blurred/occluded/unsupported detection → `UNCERTAIN` and skip action or queue ground review.
- `TREATMENT_RECORDED` is not `BIOLOGICALLY_EFFECTIVE`; follow-up verification is a separate state/event.
- No automated pesticide dosage advice, chemical selection, remote spraying control, actual flight SDK integration, or real-world autonomous dispensation in MVP.
- Mock actuator is **DISARMED by default**, hardware-specific, local bench only, harmless water only, authenticated arming with timeout, interlock and emergency stop. UI cannot bypass the safety gate.
- Human approval of real mission/treatment programme cannot be bypassed by the LLM, CV model, optimisation score, or hidden API.
- Source reduction (empty, scrub, cover, remove, repair) is preferred for suitable removable sources; persistent problems generate permanent-correction task.

## Software standards

- TypeScript strict; Python type hints; format/lint with repo conventions (e.g. ESLint/Prettier and Ruff). Use Pydantic v2 if compatible with existing dependencies.
- OpenAPI-first: backend owns schema; generated TS client/types; no divergent hand-maintained interfaces.
- Modular monolith: domain services, repositories, adapters, workers; keep business logic out of HTTP handlers/UI components.
- Postgres migrations (Alembic), foreign keys, unique constraints, timezone-aware UTC timestamps, soft deletion where audit matters.
- Tenant and RBAC checks on server on every read/write; deny-by-default, no trust in client-provided roles.
- Idempotency keys for telemetry, sample imports, mission callbacks and treatment event submissions. Use immutable append-only audit events.
- Durable workflow jobs; never use in-process timers for critical jobs. Retries with backoff, poison message handling, status observability.
- No hard-coded secrets, real residential location data in demo fixtures, or broad permissive CORS in production.
- Accessible mobile-first application, useful loading/empty/offline/error states, no fake location accuracy or invalid promise of risk prediction.

## Agent/AI constraints

- Primary ML is CV/egg counting; planning uses deterministic rules/OR-Tools. Do not add an LLM agent as a prerequisite for MVP.
- Optional LLM only for read-only explanatory summaries, not for treatment decisions, claims or executing drone commands.
- Use established models/datasets only with verified licence, provenance and bounded evaluation; provide an explicit non-ML fallback with seeded annotations to keep the demo runnable.
- Show `mode` labels on relevant records: `SIMULATED`, `BENCH_TEST`, `OBSERVED`, `IMPORTED`.

## Definition of done for every feature

- Backend endpoint + validation + authorization + service + persistence/migration + tests.
- Frontend real integration + loading/error/empty status + responsive design.
- Deterministic fixture/simulation if hardware/credentials absent.
- Scenario covered in `docs/TEST_AND_ACCEPTANCE.md` and shown by reproducible command or Playwright test.
- Documentation reflects the implemented behavior, not intentions.

## Mandatory end-of-work report

Report: (1) files changed; (2) commands run and pass/fail; (3) migrations; (4) exact reproducible local demo instructions; (5) which requirements are complete/partial/not started; (6) real-vs-simulated limitations and known risks. Never claim tests pass if not executed. If blocked, ship working partial slices and explain the blocker precisely.
