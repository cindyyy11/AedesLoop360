# AedesLoop 360 — Repo-Ready Build Kit

**Version:** 1.0 — 2026-10-23  
**Status:** Final concept locked; hackathon MVP specification, not a certified mosquito-control product.

## The product

**AI Drone (Detect & Demonstrate Targeted Action) + Smart Ovitrap (Monitor & Count) + Township Command Dashboard (Analyse & Coordinate)** connected through a complete **observe → plan → inspect → supervised/mock intervene → monitor → re-plan → verify** loop.

**Primary track:** People (healthier Malaysian townships). **Secondary:** Planet (environmental management and restrained interventions).

The application must never claim that a container detection proves Aedes larvae, an egg-count trend proves dengue incidence, or that simulated treatment proves biological effectiveness. No pesticide dispensing and no unattended real drone operations in this MVP.

## Reading order for your coding agent

1. `AGENTS.md` — non-negotiable engineering rules and repository navigation.
2. `docs/PRD.md` — source of truth for product and requirements.
3. `docs/ARCHITECTURE.md` — deployable modular-monolith design and folder layout.
4. `docs/DOMAIN_AND_DATA.md` — canonical entities, invariants, data quality.
5. `docs/API_CONTRACT.md` — routes and request/response examples.
6. `docs/WORKFLOWS_AND_STATES.md` — state transitions and approval gates.
7. `docs/AI_AND_OPTIMISATION.md` — computer vision, egg counting, planning logic and evaluation.
8. `docs/SAFETY_PRIVACY.md` — spray, flight, privacy, trapping and safety constraints.
9. `docs/TEST_AND_ACCEPTANCE.md` — real acceptance cases and verification.
10. `docs/IMPLEMENTATION_PLAN.md` — build order and ownership.
11. `docs/DEMO_RUNBOOK.md` — 4-block reproducible judge demonstration.
12. `prompts/MASTER_BUILD_PROMPT.md` — copy/paste into Codex or another coding agent.
13. `prompts/REVIEW_AND_HARDEN_PROMPT.md` — second-pass engineering audit.

## Preferred architecture

- **One repository**, app-oriented structure: `apps/web` (Next.js App Router), `services/api` (FastAPI), `services/worker` (Python async/background tasks), `packages/contracts` (OpenAPI generated TS types), `packages/config`, `infra`, `docs`, `fixtures`.
- PostgreSQL + PostGIS, object storage for evidence images, backend-owned authorization and state transitions.
- Local Docker Compose for database/object storage; mock/simulated drone, ovitrap and actuator adapters work without paid external credentials.
- If an existing repository exists, **inspect and adapt it; do not overwrite or force this directory layout**. Preserve working features and migration history. Record deviations as ADRs.

## MVP acceptance promise

Given a seeded four-block demo: upload/mock aerial image -> show candidate object -> record eligibility -> request operator approval -> simulate a harmless test-water spray / skip target -> ingest *new per-sampling-interval* ovitrap data -> recompute task priorities -> create next mission/inspection tasks -> verify and escalate recurring water-accumulation asset. Changes must persist in DB and survive reloads.

## Run the local demo (Windows PowerShell)

The default demonstration uses SQLite, synthetic fixture evidence, a persisted mission worker and the local Next.js UI. No Docker service, external account or real actuator is required. Start each service in its own PowerShell window from the repository root.

**Terminal 1 — migrate, seed and start the API:**

```powershell
$repo = (Resolve-Path .).Path.Replace('\', '/')
New-Item -ItemType Directory -Force data | Out-Null
$env:AEDES_DATABASE_URL = "sqlite:///$repo/data/aedes-demo.sqlite"
python -m alembic -c services/api/alembic.ini upgrade head
Push-Location services/api
python -m app.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Terminal 2 — start the durable simulation worker:**

```powershell
$repo = (Resolve-Path .).Path.Replace('\', '/')
$env:AEDES_DATABASE_URL = "sqlite:///$repo/data/aedes-demo.sqlite"
Set-Location services/api
python -m app.worker
```

**Terminal 3 — install and start the web UI:**

```powershell
Set-Location apps/web
npm install
npm run dev
```

Open `http://127.0.0.1:3000/dashboard`. The seeded local accounts use `<role>` / `demo-<role>-360`, including `coordinator`, `operator`, `inspector` and `reviewer`.

To reset the demo, stop the API and worker with Ctrl+C and use a new SQLite filename, for example `aedes-demo-reset-1.sqlite`, in the same `AEDES_DATABASE_URL` setting in the API and worker terminals. Run the migration and seed commands again. The previous database and audit history remain intact. Seeding an existing database is idempotent and preserves its records.

Run the automated checks from the repository root and `apps/web`:

```powershell
python -m pytest -q
ruff check services/api
Set-Location apps/web
npm run lint
npm run typecheck
npm run build
npm run test
```

The Playwright scenario expects the API, worker and web UI to be running. Install its browser once with `npx playwright install chromium`, or set `AEDES_BROWSER_EXECUTABLE` to an installed Chromium-compatible browser. For a side-by-side run when ports 3000/8000 are occupied, set `AEDES_API_ORIGIN` for Next.js, set `AEDES_WEB_ORIGIN` in both the API and Playwright process, and use a separate `AEDES_NEXT_DIST_DIR` for the second Next.js development server.

## Explicit exclusions

Unrestricted automatic chemical spraying, use of real live mosquitoes in demos, flight-control firmware or autopilot, autonomous drone flight, pesticide type/dose algorithms, medical/dengue infection risk prediction, public-health claims without field evidence, arbitrary third-party IP reuse, gamification, resident social features, untested cloud-only dependency.

## Evidence and context references

- [WHO Operational manual on larval source management (2026)](https://www.who.int/publications/i/item/9789240123212): integrated surveillance, container management, interventions, monitoring and evaluation.
- [CDC Aedes surveillance and control guidance](https://www.cdc.gov/mosquitoes/pdfs/mosquito-control-508.pdf): ovitrap interpretation, competing breeding habitats, sampling caveats.
- [CAAM UAS guidance](https://www.caam.gov.my/public/unmanned-aircraft-system-uas/): Standard ATF excludes spraying/dispensing; higher-risk operations need separate authorisations.

See `docs/SAFETY_PRIVACY.md` for how these limits are implemented in software.
