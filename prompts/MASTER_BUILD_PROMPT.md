# MASTER BUILD PROMPT — AedesLoop 360

> **How to use:** Paste the entire content below into Codex, Claude Code, Cursor Agent or another coding agent **from the root of your actual code repository**, after copying this package into it. Allow the agent terminal access to run code/tests. If it has no repository/filesystem access, it must not pretend to have modified anything.

---

Act as a **principal full-stack software architect, senior Next.js/TypeScript engineer, senior Python/FastAPI engineer, GIS engineer, computer-vision engineer, IoT prototyping engineer, QA/security lead and hackathon demo product engineer**. You are accountable for producing a REAL, reproducible, well-tested AedesLoop 360 MVP, not just documentation, screenshots or mock UI.

## OBJECTIVE

Build or update the **existing** AedesLoop 360 repository into a working, integrated **three-innovation closed-loop platform**:

1. **AI Precision Drone — Detect & Target:** image-based candidate container detection, geolocated candidate assessment, mock precision-intervention simulator, strict treatment eligibility, mission state machine, human approvals for mission operations, recorded skip/abort outcomes. The hackathon implementation has NO pesticide and NO actual autonomous drone flight. Optional isolated clear-water bench rig only after physical safety controls.
2. **Smart Ovitrap — Monitor & Measure:** trap/device registry, interval-unique image samples, egg counting with clearly labelled CV or fixture fallback, sampling-quality checks, per-block oviposition observations, device health/maintenance and zero double counting.
3. **Adaptive Command Dashboard — Analyse & Coordinate:** township map, drone missions, smart trap trends, inspection work, Human-in-the-Loop approvals, next-round priority allocation, evidence provenance, recurring source correction, audit and clear demo-versus-real differentiation.

The feedback loop is:

**Register blocks/assets → establish baseline → recommend inspection → approve simulated mission → analyse aerial targets → perform safe mock action/skip/ground review → record observations → ingest new valid ovitrap interval → recompute inspections → approve tasks → verify correction → flag recurrence → repeat.**

### SOURCE OF TRUTH (READ THESE FIRST)

- `AGENTS.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/DOMAIN_AND_DATA.md`
- `docs/API_CONTRACT.md`
- `docs/WORKFLOWS_AND_STATES.md`
- `docs/AI_AND_OPTIMISATION.md`
- `docs/SAFETY_PRIVACY.md`
- `docs/TEST_AND_ACCEPTANCE.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/DEMO_RUNBOOK.md`
- `fixtures/four_block_scenario.json`

If documents conflict, use safety constraints first, then PRD requirements, then architecture/API details; document all decisions and tradeoffs in ADRs. Do not silently change the scope. The **three pillars are fixed**; do not pivot to an elderly-care system, unrelated drone rescue, generic dengue prediction, chatbot or standalone heatmap.

## WORK MODE — DO NOT STOP AT PLANNING

You MUST work inside the repository and implement the complete P0 vertical slices to the extent the available environment permits. You may plan briefly to coordinate changes, but do not conclude after generating a proposal or a checklist. Use tools to inspect, edit, migrate, install permitted dependencies, run local tests and iterate on failures. If the work exceeds context/time/tool limits, prioritise a **compiling, integrated vertical slice** and an honest outstanding worklist over broad incomplete scaffolding. Do not claim the project is complete unless it runs and relevant tests pass.

### STEP 0 — INSPECT THE REPOSITORY FIRST

1. Print repo tree (bounded depth), detect `git status`, current branch, lockfiles, existing app languages, scripts, auth patterns, folders, services and DB migrations.
2. Check which requirements are already done; preserve code, history, docs, styles and secrets. Do not wipe or recreate working apps.
3. Choose existing dependency conventions when technically sound. If no project exists, scaffold the modular monolith in `docs/ARCHITECTURE.md`.
4. Identify monorepo vs split repo; **never split by team member**. If currently split, integrate via OpenAPI contracts and preserve existing repositories.
5. Record `docs/IMPLEMENTATION_STATUS.md` as a truthfully filled checklist and explain any ADR-worthy deviation.
6. Do not use destructive git commands, forced rebase, secrets exfiltration, a paid cloud account, or real UAV / pesticide hardware. Do not ask me for approval unless credentials, irreversible operations or genuinely essential decisions block implementation; default to local mock adapters.

### STEP 1 — BOOTSTRAP A REAL RUNNABLE STACK

Use current compatible stable versions, respecting existing lockfiles. Preferred: Next.js App Router + strict TypeScript + Tailwind/shadcn; Python FastAPI/Pydantic + SQLAlchemy/Alembic; PostgreSQL/PostGIS; private image/object storage; local Compose; lint/test scripts. Minimal worker/scheduler for image processing, device staleness and follow-ups if necessary. Generated TS API contract from backend OpenAPI; no separate incompatible DTO copies. Seed 4 fictional blocks and sample devices/assets with deterministic `fixtures/four_block_scenario.json`.

Deliver working navigation, login/role handling (local seeded accounts if needed), authenticated REST API, real persisted seeded data and useful error/loading states. All protected endpoints must enforce server-side role and tenant checks.

### STEP 2 — ESTABLISH DOMAIN MODEL, MIGRATIONS AND CONTRACTS

Implement canonical entities: Tenant/User/Membership, Block, Asset, MediaAsset, SiteObservation, CandidateFinding, Trap, OvitrapSample, Mission, MissionTarget/Event, WorkOrder, Intervention, FollowUp, AllocationRun/Item, AuditEvent. Use constraints, UTC timestamps, unique IDs, FK and GIST geospatial indexes where required. Include observed_at vs received_at and SIMULATED/IMPORTED/OBSERVED/BENCH_TEST source mode. Migrations must work on fresh DB without hand edits and be safe to re-run as designed.

Keep strict **sample interval uniqueness**; images of the same paddle/substrate do not count as separate egg deposits. Embed provenance (image licence, model version, uploader/capture time) for all evidence. Add an append-only audit trail for all approvals and physical-action outcome changes. Generate TS types and API client.

### STEP 3 — IMPLEMENT THE AI DRONE PILLAR

A. Permitted image import and asset mapping: upload a registered aerial or fixture image, store private media and source mode, associate candidate locations with registered assets.

B. Vision adapter: architect a real object detector interface. If genuine model weights/data are available, run inference and evaluate; otherwise provide a **clearly identified preannotated fixture** for reliable demos. Return class/bbox/confidence/version, uncertain or occluded states; NEVER invent confidence scores. Use candidate classes supported by real training data; don't claim mosquito larvae/egg detection from ordinary aerial images.

C. Mission lifecycle: draft/review/approve/reject/simulate/abort/complete; approved site/mode/target check on backend. Drone simulator emits asynchronous state events for image capture, detection, approach, skipped targets and mock water-only action; all events persist and can be replayed idempotently. Operator abort must stop new action events.

D. Treatment policy: **dry → SKIP; uncertain/occluded/access not validated → GROUND_REVIEW; explicitly eligible fictional demo target → MOCK_ACTION_ELIGIBLE**. Only after coordinator approved a `SIMULATED` mission may adapter record a harmless mock action. Real flight, pesticide advice, chemical dose and actual dispensing endpoints are forbidden. `BENCH_TEST` is behind separate local physical arming/kill interlock if implemented.

E. UI: Missions list, image bounding-box overlay, evidence panel, status timeline, mission approvals, safe skip reasons and visible SIMULATED badge.

### STEP 4 — IMPLEMENT SMART OVITRAP PILLAR

A. Trap registry: block, trap ID, location class, device heartbeat/status, safe-design/servicing metadata. Invalid/unsafe/offline traps cannot silently produce valid reporting.

B. Interval-based sample ingest: use source_sample_id + trap_id + collection interval; accept labelled image provenance, `egg_count` or processing job, source and quality. Idempotent repeat imports must NOT increase counts. Return validity and errors.

C. Image egg count adapter: use genuine CV inference only when dataset and held-out labels exist; otherwise fixture or manual-labelled count with explicit badge. Do not infer Aedes species from eggs or equate new photos of the same substrate with new eggs. No live mosquito culture.

D. Analytics: eggs per valid trap interval and trap positivity, valid/expected sampling denominator, comparable interval length, device missingness, time-series and servicing alerts. Missing data -> `DATA_UNAVAILABLE`, never zero or lower disease risk.

E. UI: trap registry, egg sample image/count details, image/source-mode labels, trend chart and offline/overdue servicing state.

### STEP 5 — IMPLEMENT ADAPTIVE DASHBOARD AND REAL FEEDBACK

A. Real pages `/dashboard`, `/township`, `/drone/missions`, `/ovitraps`, `/operations`, `/planning`, `/assets/[id]`, etc., according to PRD. Design coherent and professional mobile-first experience. Functioning interactions only; no inert controls, arbitrary mock graphs or unsupported medical risk percentages.

B. Explainable rules engine uses: comparable ovitrap observations, unresolved verified source findings, asset recurrence, last inspection, access/visibility, device status, available staff, drone operating budget and permission. Maintain minimum baseline coverage across all blocks. It can recommend `INSPECT_GROUND`, `SURVEY_AERIAL`, `SERVICE_TRAP`, `REMOVE_SOURCE`, `REVIEW_ENGINEERING`, `CONTINUE_MONITORING`, `NO_DRONE_NEEDED`.

C. Mission vs inspection selection: elevated/difficult and legally/physically suitable → propose drone where evidence value plausibly exceeds cost; accessible/obscured → ground review; no confirmed specific source → inspect, not automatic chemical action. Unapproved drone missions not executable.

D. Persist each allocation run with `evidence_snapshot_hash`, algorithm/policy version, budget, recommended tasks, exclusions and human-readable supporting observation IDs. **Change Block 1's valid sample interval or unresolved records and rerun**: priorities must update in DB and UI.

E. Human-in-the-Loop queue: coordinator reviews/approves mission operation/operational task plan; reviewer resolves ambiguous evidence; qualified workers record physical source-reduction actions; follow-up reviewer independently verifies. All permission checks on backend. Do not conflate plan approval with real-world chemical/flight authorization.

F. Recurrence: when the same asset has separately verified recurrent water accumulation, create a *single* engineering correction work order. Preserve history; physical `action complete` does not automatically become `verified resolved`.

### STEP 6 — EVALUATION AND FAILURE CASES

Build automated tests mapped to `docs/TEST_AND_ACCEPTANCE.md` including:

- Dry/uncertain/missing permission → no mock action.
- No simulate before approved; wrong role or cross-tenant forbidden; stop/abort prevents later events.
- Duplicate ovitrap interval / identical photo → never double count.
- Offline trap → `DATA_UNAVAILABLE`, service task, not false low priority.
- Editing Block 1 data updates plan; Block 4 missingness triggers equipment workflow.
- Budget limited + minimum coverage maintained; deterministic plan snapshots.
- Consecutive recurring site observation produces engineering referral once.
- Mission event retries, worker restart, DB persistence and audit trail.
- CV test metrics only if trained/evaluated; otherwise fixture provenance explicit.

For P1, compare fixed equal allocation vs adaptive using identical simulated constraints and independently defined ground truth. Report efficiency/cost metrics without claiming field-proven dengue outcomes.

### STEP 7 — FINAL DEMO EXPERIENCE

Deliver a reliable and visually polished **five-scene demonstration** in `docs/DEMO_RUNBOOK.md`:

1. Four block dashboard and source-labelled initial records.
2. Aerial image reveals dry, eligible mock, and occluded targets; no action for dry/occluded; human approves simulated mission; harmless mock action and audit events shown.
3. New unique ovitrap interval from Block 1 imported; repeated same sample does not inflate count; Block 4 offline displayed correctly.
4. Recompute planner: real change in inspection priority, task allocation, explanation and no unnecessary drone for accessible assets.
5. Asset P-03 repeat water accumulation triggers durable source-correction review and separately recorded follow-up verification.

Supply seeded accounts, reset mechanism, exact setup instructions, source/fiction labels, and one or more E2E tests/screenshots of the entire demo.

## NON-NEGOTIABLE ENGINEERING QUALITY

- Architecture: modular monolith / hexagonal services; business decisions backend-owned; typed contracts, strict TypeScript, Python type hints and validated input; no giant untestable component/service.
- Data: Postgres migrations, sane indexes, correct idempotency, concurrency/version handling where necessary, evidence hash, separate observed/ingested timestamp.
- Security: minimum RBAC, tenant isolation, private images, upload content validation, no secrets, safe CORS; audit changes.
- UX: functional role-specific actions, responsive, keyboard accessible, clear loading/empty/error and demo state.
- Testing: actually run test/lint/build/typecheck; repair errors; don't fabricate evidence or pass status. Prefer fewer complete tested requirements over a wide set of placeholders.
- Maintain `docs/IMPLEMENTATION_STATUS.md` as requirements are implemented. Cite actual commands and test output in summary.
- Do not introduce an LLM multi-agent platform, audio mosquito model, solar/LoRaWAN, actual UAV autopilot, large resident app or live pesticide function as prerequisites.

## AUTHENTICITY / SCIENTIFIC GUARDRAILS

- Eggs/trap activity are not exact adult counts and are not human dengue incidence/risk.
- Aerial object recognition is not proof of Aedes eggs or larvae; all detected sources need appropriate confirmation before real treatment.
- A completed spray simulation is not biological effectiveness and does not kill eggs.
- Surveillance changes after source reduction can reflect oviposition-site competition, not a simple treatment success/failure signal.
- No automatic chemical release in real residential locations, no field flight without permit; CAAM's normal ATF explicitly excludes spray/dispense.
- Real qualified vector-control programme, local regulations and site/operator approval are future pilot dependencies.

## PRIORITY UNDER HARD CONSTRAINTS

- **Do not overrun the scope**. Execute P0 in vertical slices. If tool or environment access is missing, use local fixture adapters and continue.
- Order of user value: full loop data persistence → drone mission states → ovitrap correctness → adaptive planning → human approval / source correction → polished demo → optional trained CV / hardware.
- If existing working code conflicts with proposed structure, prefer incremental changes with ADR and tests; preserve migrations and interfaces.
- If unable to finish P0, deliver maximum *verified functional* implementation, mark exact incomplete AC IDs and include runnable next commands.

## REQUIRED FINAL RESPONSE TO ME

Provide a compact factual implementation report with:

1. Summary of what was actually implemented, not what was planned.
2. Repo structure and important paths; migrations/new env settings.
3. Exact local commands to install/start/seed/reset/test.
4. Which PRD requirements and AC IDs are verified, partial or incomplete.
5. Which of drone, ovitrap, dashboard are real code, mocked, bench-tested or not built.
6. Test commands run with honest results and blockers.
7. The precise five-scene demo path and fixture IDs.
8. Security/safety issues, operational limitations and next implementation slice.

**Begin now by inspecting my code repository, then implement. Do not stop after drafting a plan.**
