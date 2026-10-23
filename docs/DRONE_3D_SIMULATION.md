# Drone 3D flight rehearsal

Location: **Drone missions** page, panel "3D flight rehearsal" (`apps/web/components/drone-sim*.ts(x)`).

## What it is
A read-only Three.js replay of the selected mission over an illustrative residential street (houses, yards, fences, trees, poles, parked car) inside a drawn "authorised test zone". It reuses the mission, findings, assets and events already loaded by the page; it adds no API route, migration or write.

- Route = `mission.target_ids` -> finding -> asset, in order: pre-flight, take-off, transit, descend, inspect, climb, return, land.
- Planter appearance comes from the stored finding's `water_state` (dry soil / visible water / carport roof hiding it for `OCCLUDED`).
- Outcome rings appear only for persisted events (`SKIPPED`, `GROUND_REVIEW`, `MOCK_ACTION_RECORDED`) matched by `asset_id`. With no events the panel says it is a planned route only.
- Views: orbit, follow drone, full drone camera; picture-in-picture drone camera with a box projected from the stored finding (labelled "candidate container", never confirmed). Timeline scrubber, speed, per-target jump.

## Limits (real vs simulated)
- Street layout, planter positions, altitude, speed and battery are authored kinematics, not telemetry or a survey. Schematic asset x/y are not used for placement.
- The drone-camera box is a projection of a stored annotation, not model inference.
- Mock actuator is shown as DISARMED; the replay cannot arm, start, abort or approve anything. A recorded action is not biologically effective.

## Verification
`apps/web/tests/drone-sim.spec.ts` (fixture-mocked API, asserts zero non-GET requests): replay, jump-to-target, drone camera, mobile width, draft route preview without outcomes.
