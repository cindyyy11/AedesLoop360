# 3D township walkthrough

## What is implemented

The existing `/township` page now includes an interactive Three.js scene above its original 2D map and analytics. It reads the existing authenticated APIs and uses generated contract types. No backend route, database schema, migration, role or mission execution behavior changed.

- Procedural buildings, streets, trees, asset markers, ovitraps and a drone model; orbit, zoom, reset and click-to-select.
- Three presentation chapters: inspection evidence, monitoring availability and the latest saved allocation.
- Accessible HTML object selector with canonical IDs, block interval counts, trap heartbeat/status, saved priority reasons and asset-evidence links.
- Replay of persisted mission events, with exact outcome, mode and server timestamp. Select a mission or event, play/pause, and open the event's asset. Empty missions cannot replay. Changing missions clears the visible event stream.
- Offline/stale/unsafe/service-due traps have orange markers and `!` labels. Block missingness remains `DATA_UNAVAILABLE`; neither animation nor colour invents a low-risk status.
- Narrow-screen camera framing, keyboard camera controls, explicit playback, reduced-motion handling, hidden-tab animation suspension and GPU cleanup.
- Loading, empty, retry and WebGL-unavailable states. Camera controls are disabled when graphics are unavailable. HTML evidence and the original 2D map remain usable.

## Present it to judges

Start the existing API, worker and web app using the README. In `apps/web`, run `npm ci` after pulling the dependency changes, then `npm run dev`. Open **Township** after **Enter demo**.

1. Select **Inspect with evidence**. Orbit the township; select an asset and open its evidence. Buildings are illustrative, while asset IDs and fictional asset coordinates come from stored records.
2. If no events exist, open **Drone missions**, submit a draft, approve its simulated checklist as coordinator, switch to operator, and start the simulation with the worker running. Return to Township, refresh data and choose the completed mission.
3. Play its recorded events. Explain the dry skip, occluded ground review and approved mock action. Animation is a replay: it does not run another mission or issue commands.
4. Select **Keep monitoring visible**, then Block 4 or one of its unavailable traps. Explain why absent observations require servicing and do not mean low activity.
5. Generate an allocation in **Next-round planning**, return and refresh, then select **Explain the next decision**. Click a block to expose its saved score and reasons. After changing observations, recompute the plan to show a new saved decision.

## Reproducible isolated validation

From the repository root, use a new database filename if you need a fresh demo. Seeding an existing database is not a reset.

```powershell
$env:AEDES_DATABASE_URL='sqlite:///C:/Users/User/AedesLoop360/data/township-3d-validation.sqlite'
$env:PYTHONPATH='services/api'
$env:AEDES_WEB_ORIGIN='http://127.0.0.1:3310'
New-Item -ItemType Directory -Force data | Out-Null
python -m alembic -c services/api/alembic.ini upgrade head
python -m app.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8311
```

In another root terminal, use the same two environment variables and run `python -m app.worker`.

In a web terminal:

```powershell
cd apps/web
$env:AEDES_API_ORIGIN='http://127.0.0.1:8311'
$env:AEDES_NEXT_DIST_DIR='.next-3d-check'
npm run dev -- --webpack --port 3310
```

In another web terminal:

```powershell
$env:AEDES_WEB_ORIGIN='http://127.0.0.1:3310'
$env:AEDES_LIVE_3D_TEST='1'
# Optional when using an already installed Chromium:
$env:AEDES_BROWSER_EXECUTABLE='C:/Users/User/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
npm run test -- tests/township-3d.spec.ts tests/township-3d-live.spec.ts --reporter=line
```

The four fixture tests intercept browser API responses explicitly. The opt-in live test does not mock APIs: it creates a new fixture mission, uses coordinator approval and operator execution, waits for worker-persisted events, saves an allocation, then verifies the UI against those records. Run it only on an isolated demo database. It asserts zero API writes during scene interaction.

On this machine the npm shim had no active NVM version. Validation therefore invoked the bundled Node executable directly:

```powershell
$node='C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $node node_modules/typescript/bin/tsc --noEmit
& $node node_modules/eslint/bin/eslint.js app components lib tests/township-3d.spec.ts tests/township-3d-live.spec.ts
$env:AEDES_NEXT_DIST_DIR='.next-3d-build'
& $node node_modules/next/dist/bin/next build
& $node node_modules/@playwright/test/cli.js test tests/township-3d.spec.ts tests/township-3d-live.spec.ts --reporter=line
```

## Limits and provenance

This is a functional, read-only 3D presentation, not a physics simulator, surveyed digital twin or live drone tracker. Buildings, trees, trap offsets, heights and interpolated drone movement are authored illustrations. The path joins recorded event assets; it is not historical flight telemetry. Event timestamps and statuses come from the backend; refresh retrieves a new snapshot rather than subscribing to live updates.

No 3D reconstruction from imagery, real flight control, dispensing, new model inference, model accuracy, treatment efficacy or dengue reduction is claimed. The independent ML evaluation/dataset blockers described in the data reports remain unchanged. Tests cover local Chromium and seeded SQLite; other browsers, hardware performance and production deployment remain unverified.

Renderer implementation uses [Three.js documentation](https://threejs.org/docs/) and its packaged OrbitControls. All scene geometry is procedural; no third-party model assets were downloaded. Three.js and its type declarations are pinned at `0.180.0` in npm's manifest and lockfile.

## Files in this slice

- `apps/web/components/township-3d.tsx`: API reads, chapters, evidence and recorded replay.
- `apps/web/components/township-scene.tsx`: renderer, procedural geometry, camera and resource lifecycle.
- `apps/web/components/overview.tsx`: lazy Township integration.
- `apps/web/app/globals.css`: scoped scene and responsive presentation styles.
- `apps/web/package.json`, `apps/web/package-lock.json`: npm dependencies.
- `apps/web/tests/township-3d.spec.ts`, `apps/web/tests/township-3d-live.spec.ts`: fixture and live integration checks.
- README, implementation status, acceptance, runbook, ADR-006 and the design/plan documents: behavior, evidence and limitations.

No migration was added. Existing migrations were applied only to the isolated validation database.

## Executed verification — 23 October 2026

All web commands ran in `apps/web` with the bundled `$node` path above.

| Exact command / check | Result |
|---|---|
| `python -m alembic -c services/api/alembic.ini upgrade head` followed by `python -m app.seed` with the isolated database URL | Passed; fictional data seeded. No new migration. |
| `& $node node_modules/typescript/bin/tsc --noEmit` | Passed after removing temporary preview-generated configuration references. |
| `& $node node_modules/eslint/bin/eslint.js app components lib tests/township-3d.spec.ts tests/township-3d-live.spec.ts` | Passed. |
| `$env:AEDES_NEXT_DIST_DIR='.next-3d-build'; & $node node_modules/next/dist/bin/next build` | Passed; optimized build and typecheck completed. |
| `& $node node_modules/@playwright/test/cli.js test tests/township-3d.spec.ts tests/township-3d-live.spec.ts --reporter=line` with live opt-in | Final combined attempt: all four fixture cases passed; the live case exceeded the initial 5-second lazy-load assertion. An earlier combined run passed all five before the final mobile/fallback refinements. |
| `& $node node_modules/@playwright/test/cli.js test tests/township-3d-live.spec.ts --reporter=line --output=test-results/3d-live-final` after increasing only its initial UI wait to 15 seconds | Passed, 1 test in 31.9 seconds; real API, coordinator/operator workflow, worker persistence and saved allocation. All five targeted cases therefore passed on the final implementation across these two commands. |
| `git diff --check` from repository root | Passed; line-ending notices only. |
| Desktop and 390px mobile screenshots | Inspected; corrected mobile camera cropping. No horizontal page overflow in either browser suite. |

Earlier attempts encountered sandbox Chromium launch failure, an incomplete test-only model-card fixture, a label locator mismatch, a stale dev-server route cache, a fallback locator also matching the Next development overlay, and a corrupt generated type file in an abandoned temporary build directory. The fixture/selectors were corrected, WebGL availability is now checked before constructing Three.js, and temporary generated includes were removed. Browser/API validation ran outside the restricted sandbox against the isolated local services. A fresh webpack development cache resolved route discovery; the final production build used Turbopack successfully.

The repository-wide API suite and original full closed-loop Playwright test were not rerun for this read-only UI slice. These five checks are not a claim that every earlier acceptance criterion or model evaluation passed.

### Browser sign-in correction

The preview API must also receive `AEDES_WEB_ORIGIN=http://127.0.0.1:3310`. Without it, browser-origin login correctly returns 403 even though direct test-client login succeeds. The setup above includes this variable. The live test now signs in through the actual **Enter demo** button before creating its isolated mission, so this configuration gap is covered. After restarting the API with the exact origin, `township-3d-live.spec.ts --reporter=line --output=test-results/3d-origin-check` passed (1 test, 1.3 minutes). An additional login request carrying that exact Origin returned HTTP 200. No origin allowlist was broadened in source code.
