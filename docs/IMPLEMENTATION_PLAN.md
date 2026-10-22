# Delivery Plan — Build Now, Integrate Early

## 1. Operating principle

Implement a **vertical slice** connecting all three pillars first, then deepen ML and hardware. Every milestone must be usable and testable, not just a screen. Do not overbuild before the first loop works.

## 2. Stage sequence with exit criteria

### Stage 0: Repo audit and decisions

- `git status`, identify framework/package manager, inspect apps, migrations/auth/tests; document existing code and blockers in `docs/IMPLEMENTATION_STATUS.md`.
- Avoid deleting pre-existing files. Establish build commands and development DB; add architecture ADR for deviations.
- Exit: clear repo map, runnable baseline, worktree intact.

### Stage 1: Scaffold and data foundation

- Next.js App Router, TypeScript strict/Tailwind/shadcn; FastAPI core, Pydantic, DB migrations; Postgres/PostGIS; image storage, basic auth/RBAC.
- Seed 4 fictional blocks, traps, registered assets and multiple sampling intervals from fixture. `make dev/seed/test` or equivalents.
- Exit: GET blocks/traps/assets works, frontend displays seeded records; restart retains data.

### Stage 2: Core event and evidence contract

- Upload/record observation; map to asset; status/provenance; audit; CV adapter with fixture fallback.
- Exit: uploaded sample image results in persisted candidate and UI evidence, with uncertainty.

### Stage 3: Drone pillar vertical slice

- Mission draft/approval/reject/simulate/abort, target state and event log; dry/uncertain/eligible branching; no pesticide or live flight control.
- Exit: all key drone acceptance tests; judge can inspect the same approved mission in UI.

### Stage 4: Smart ovitrap pillar vertical slice

- Trap registry, samples by collection interval, images, counting adapter (validated inference if possible else labelled fixture), device health, servicing; temporal aggregation.
- Exit: second read does not increase egg total, offline never green, trends show denominator and sampling window.

### Stage 5: Dashboard adaptive operations

- Map, status, mission queue, trap trend, next-task priorities; rules engine, evidence explanations, budget and baseline coverage; persisted work orders.
- Exit: editing/importing Block 1 causes real recalculation with stored run and next tasks.

### Stage 6: Verification and recurrence

- Work-order lifecycle, follow-up evidence, repeated water accumulation referral, approval task view, audit replay.
- Exit: same registered asset recurring twice produces one engineering correction task, not repeated spraying.

### Stage 7: Optional advanced capabilities

- Actual CV training/evaluation on licensed data (report metrics), OR-Tools comparison, physical ESP32 egg imaging or local water-only pump test (safety gate first).
- Exit: experimental evidence and failure modes, no unverified claims.

### Stage 8: Quality hardening and pitch demo

- Unit/integration/E2E, seed/reset, clean-room startup, responsive design, risk disclosures, demonstration; compare fixed vs adaptive, screenshot/video capture.
- Exit: AC-38 repeatable demo and accurate README.

## 3. Recommended team responsibilities (not repositories)

| Workstream | Primary owner | Integration requirements |
|---|---|---|
| A: Drone/CV | AI engineer | `candidate_findings`, `missions`, image adapter and model evaluation |
| B: Ovitrap/IoT | Embedded/CV engineer | sample interval ingestion, count quality, trap state, optional camera rig |
| C: Backend/planning | Backend engineer | PostGIS schema, workflow state machines, allocation, authorization, work orders |
| D: Frontend/product | Web engineer | Next.js dashboard, map, mission/trap UI, demo/test story |

**Shared ownership:** technical lead approves OpenAPI and DB migrations before parallel work; pair for each integration milestone; each PR includes relevant tests. Avoid four incompatible duplicate models.

## 4. Dependency map

- Auth/tenant + migrations precede everything.
- Blocks/assets/traps definitions precede image linkage/ovitsamples/planning.
- Mission policy precedes any mock actuator hookup.
- Samples + interventions precede feedback planning.
- Work-order states precede verified recurrence and success KPIs.
- CV inference can advance independently behind stable interface; demo fixture adapter keeps integrations unblocked.

## 5. Quality and evidence rules

- Every PR is focused, includes screenshot where visual, test command, migration impacts, requirement IDs.
- Small frequent integration; rebase/merge through CI, no force pushes to main without explicit team approval.
- Run one common fixtures test after each stage.
- Never mark tasks complete because a route exists without functional data/DB and negative-path tests.

## 6. Fallback plan if time tight

**Minimum compelling demo:** 4 blocks + 3 image candidate cases + fixed egg sample JSON + mission approval & simulated harmless action + actual recalculated inspection plan + recurring P-03 work order. Skip optional camera hardware, drone, egg classifier and advanced solver until this complete loop works.

## 7. Implementation status template (agent must maintain)

| Requirement group | Existing | Implemented now | Verified command | Remaining issue |
|---|---|---|---|---|
| Foundation | | | | |
| Drone CV/simulator | | | | |
| Ovitrap data | | | | |
| Dashboard/planning | | | | |
| HITL/work orders | | | | |
| Safety/access/audit | | | | |
| Demo/evaluation | | | | |
