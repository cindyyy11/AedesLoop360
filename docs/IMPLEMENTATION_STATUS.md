# Implementation Status

**Audit date:** 2026-10-23  
**Scope:** Existing local demonstration in this repository. This status records inspected behavior and checks actually run.

## Implementation map

| Requirement group | Existing implementation | Status | Remaining limits |
|---|---|---|---|
| Foundation and persistence | FastAPI, SQLAlchemy, Alembic revision 001, SQLite local database, four-block seed, cookie sessions and role checks | Runnable for local demo | PostgreSQL/PostGIS deployment, tenant membership model and production session controls are not verified. |
| Drone inspection and mission | Synthetic preannotated image findings, dry/uncertain/eligible policy, coordinator approval, operator simulation, durable job rows, abort, append-only event and audit records | Runnable simulated fixture path | No trained detector, field image evaluation, real flight or actuator. Unsupported uploads need ground review. |
| Smart ovitrap | Trap/device state, interval and substrate/image deduplication, sample quality and effort checks, labelled fixture counts, comparable summaries | Runnable for synthetic intervals | No evaluated image-counting model, live camera or entomological validation. |
| Dashboard and adaptive planning | Overview/map, mission, trap, planning, operations and asset-history pages; persisted allocation snapshot and evidence hash; four-block coverage baseline | Runnable for local demo | Planner weights are demo assumptions. Fixed-versus-adaptive evaluation and geographic GIS are not implemented. |
| Human review and recurrence | Separate mission approval/execution roles, inspection review, assigned work, completion pending independent verification and recurrence engineering referral | Runnable for seeded workflow | Roles and records are limited to the demo tenant; production tenant administration is outstanding. |
| Safety, privacy and audit | Simulated-only mission schema, approval checklist, no flight/chemical endpoint, authenticated media bytes, upload validation, origin gate, server role/tenant filtering and immutable audit migration | Implemented in local demo | Production security review, external private object storage and retention controls remain outstanding. |
| API contracts | Pydantic response schemas own OpenAPI; OpenAPI JSON and TypeScript declarations regenerated from backend | Generated and typechecked | Contract output is verified for the local API, not against a deployed service. |
| Local start/reset | README documents three processes and fresh-database reset by choosing a new SQLite URL; browser test runs the integrated scenario | Reproducible local path documented | Compose currently starts only PostgreSQL and requires a password variable. SQLite is the verified path. |

## Acceptance coverage

Verified by the API suite and full Playwright scenario: AC-01, AC-05–15, AC-17, AC-19, AC-21, AC-23, AC-25–32, AC-36 and AC-38. The browser scenario completed mission approval and simulation, repeated interval import, priority recomputation, recurrence escalation, independent verification and the mobile-width overflow check.

Partial coverage: AC-02–04 (valid upload, candidate display and unsupported-image review are implemented, but no complete upload-to-finding test or learned detector evaluation); AC-16 (offline invalidity is covered, while blur/occlusion quality variants are not); AC-18 (effort validation and comparable windows exist, but a cross-block mismatch scenario is not asserted); AC-20, AC-22 and AC-24 (offline blocks, ground-first alternatives and source tasks exist, but equipment-task and policy outcomes lack focused assertions); AC-37 (media is served from the database, so an object-storage URL failure path does not exist).

Not started: P1 bench actuator controls, held-out CV/egg-count evaluation, PostGIS, OR-Tools comparison and equal-budget policy benchmark (AC-33–35 and PRD P1 requirements).

## Verification record

| Command or scenario | Result |
|---|---|
| python -m alembic -c services/api/alembic.ini upgrade head plus python -m app.seed on a fresh SQLite URL | Passed; seeded four fictional blocks and associated demo evidence. |
| python -m pytest -vv -s | Passed: 5 tests in 8.61 seconds. Elevated local test access was required because Starlette's Windows test client opens a local socket pair. |
| ruff check services/api | Passed. |
| Web ESLint via apps/web/node_modules/.bin/eslint.cmd app components lib | Passed. |
| Web TypeScript via apps/web/node_modules/.bin/tsc.cmd --noEmit | Passed. |
| Web production build via apps/web/node_modules/.bin/next.cmd build | Passed. |
| Playwright tests/closed-loop.spec.ts using installed Microsoft Edge and isolated ports/database | Passed: 1 full scenario in 27.1 seconds; saved desktop and mobile evidence screenshots. |
| python scripts/export_openapi.py and openapi-typescript generation | Passed; backend OpenAPI JSON and TypeScript declarations generated. |

The web app setup instructions now use npm. The pnpm lockfile was removed, but npm could not generate `package-lock.json` in this environment because registry DNS access to registry.npmjs.org is unavailable; run `npm install` from `apps/web` in a network-enabled environment to create it before using `npm ci`. The earlier verification record was produced before this package-manager change. The first browser attempt lacked Playwright Chromium, so the installed Microsoft Edge executable was used through AEDES_BROWSER_EXECUTABLE. The pre-existing service on port 8000 belonged to another app; the browser run used separate ports and a separate Next.js output directory.

## Migration and data notes

Revision 001_initial.py is the only migration. This pass added no schema migration. It was applied successfully to fresh isolated SQLite databases during the test and browser runs. PostgreSQL and PostGIS migration behavior remains unverified.

All fixture blocks, coordinates, egg counts, preannotations and actions are fictional or simulated. Candidate container annotations are not learned CV output. Egg activity is not adult abundance, confirmed Aedes species or human dengue risk; recorded simulated action does not establish biological effectiveness.
