# Judge Demo Runbook — Three Innovations, One Closed Loop

**Rule:** This demonstration uses FICTIONAL blocks, SIMULATED drone activity, synthetic egg counts/reference images and water-only bench rig if available. No live mosquitoes, pesticide or real residential flight.

## 0. Set up

1. Run documented local stack and migration/seed.
2. Reset `fixtures/four_block_scenario.json` via admin-only demo reset.
3. Sign in as Coordinator; show `SIMULATED DEMO` indicator and monitoring sample date range.
4. Open simultaneous tabs: Township, Drone, Ovitrap, Planning, Operations. Do not depend on public network.

## Scene 1 — Problem: four blocks with distinct evidence (20–30 seconds)

- Block 1: high recent *egg observations* + 3 separately recorded unresolved physical issues.
- Block 2: rising egg observations but no verified physical source; recommend inspection, not automatic spraying.
- Block 3: valid, relatively lower observations, known assets resolved; maintain minimum surveillance.
- Block 4: offline trap; no valid new count → `DATA_UNAVAILABLE`, servicing task.
- Show counts per interval, not made-up infection risk.

## Scene 2 — Drone finds three different targets (45–60 seconds)

- Select authorised fictional Block 1 rooftop/planter image. Show boxes: `P01 dry`, `P02 mock water target`, `P03 occluded`.
- Results: P01 `SKIP`, P03 `GROUND_REVIEW`, P02 `MOCK_ACTION_ELIGIBLE` only as labelled fixture.
- Create mission, show human approval with checklist. Run drone simulation. Event timeline records mock test-water action (no pesticide).
- Abort an optional second mission mid-way and show remaining targets unchanged.

## Scene 3 — Smart ovitrap updates monitoring (45 seconds)

- Import a **new interval** collection from Block 1. Show egg-count adapter and sample metadata.
- Re-import same exact sample: show no count increase (idempotency).
- Block 4 stays missing / servicing required.
- State explicitly: eggs are sampled activity, not exact adult population nor dengue probability.

## Scene 4 — Dashboard adapts next action (45–60 seconds)

- Generate adaptive plan with fixed staff/drone survey budget. Explain why B1 prioritized: unresolved physical issues + observations + inspection interval.
- Compare B2 (more field inspection), B3 (baseline), B4 (service trap). Show `NO_DRONE_NEEDED` for an easy ground asset.
- For P1, contrast with fixed equal scheduling using exact same simulated scenario and constraints.

## Scene 5 — Beyond repeat spraying (30–45 seconds)

- Open Asset P-03: previously corrected, subsequent repeated verified water accumulation after rain.
- Trigger recurrence evaluation → engineering/physical source correction work order for drainage/saucer redesign.
- Show worker completion still `PENDING_VERIFICATION`; reviewer records separate outcome, history updates.

## Final close (15 seconds)

> "Our drone finds and demonstrates precisely targeted action. Our ovitraps measure what is happening over comparable sampling intervals. Our dashboard converts those observations and physical evidence into the next inspection, safer intervention or permanent source correction. Unlike a static dengue map, the next decision actually changes when the evidence changes."

## Demo recovery

- No model weights: preannotated aerial fixture; UI identifies `PREANNOTATED DEMO`.
- No camera: fixed labelled egg sample images; egg count uses manual/synthetic ground truth.
- No hardware: simulator; fake actuator explicitly simulated.
- Backend offline: restart Compose from documentation, replay idempotent fixture, no fake success status.

## Judge Q&A

**Why drone?** Elevated or restricted-access *permitted outdoor assets*; ground preferred for easily reachable sites. Value compared in pilot.

**Why ovitrap?** Independent recurring sampling, not direct confirmation of exact breeding site; use to target further inspection.

**Why dashboard?** It actively plans and tracks work and verification. Data changes decisions.

**Why HITL?** Supervisor/operator approval for real flight and chemical activity; no approval needed for every sample calculation.

**Does it kill eggs?** Demo does not validate killing. Appropriate physical removal and professionally authorised vector control in real use; egg survival and entomological confirmation need separate evaluation.

**How prove impact?** Controlled demo shows logic and efficiency; real biological/dengue impact only field study with qualified partners.
