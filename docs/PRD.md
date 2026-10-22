# PRODUCT REQUIREMENTS DOCUMENT — AedesLoop 360

**Version:** 1.0, 23 October 2026  
**Owner:** Hackathon product team  
**Status:** Implementation-ready MVP; validation hypotheses, not verified health outcomes  
**Title:** AI-Powered Precision Drone Intervention, Smart Ovitrap Surveillance and Adaptive Township Intelligence

## 1. Executive summary

AedesLoop 360 is a township-scale, evidence-aware Aedes vector-control operations platform. It comprises **three interdependent innovations**:

1. **AI Drone — Detect & Target:** assess approved aerial images for candidate water-holding containers, register geolocated targets, choose inspect/skip/review actions, and demonstrate harmless precision intervention via simulator or isolated bench rig.
2. **Smart Ovitrap — Monitor & Measure:** import/capture standardised egg-sampling images, count eggs per valid sampling interval, track trap health/servicing and optionally adult acoustic activity as a future experiment.
3. **AI Township Dashboard — Analyse & Coordinate:** map assets and observations; expose provenance and data quality; propose cost- and safety-aware inspection allocation, record human approvals, interventions, follow-up and recurring source-correction tasks.

**Closed loop:** register & baseline → inspect → CV candidate → eligibility/approval → mock targeted action or source-removal task → record → ovitrap monitoring → quality-aware trend → allocate next round → verify/repair → repeat.

The MVP is **software plus optional safe hardware prototype**, not live pesticide dispensing or an autonomous flight system.

## 2. Problem statement — final

Malaysian residential townships face persistent challenges identifying scattered and hard-to-inspect potential Aedes breeding habitats, monitoring the results of vector-control operations, and allocating limited field resources. Aerial inspection, egg-trap surveillance and maintenance often produce separate observations without a reliable way to decide which block should be investigated next, what confirmed source requires intervention, and whether repeated temporary actions addressed the underlying accumulation problem. An integrated system is needed to connect targeted inspection, properly authorised intervention, standardised surveillance and evidence-based follow-up while avoiding unnecessary environmental exposure and unsupported disease-risk claims.

**How might we** help Malaysian township operators locate potential breeding opportunities, coordinate safe and targeted source-control work, and continuously reprioritise inspections using verifiable surveillance and intervention evidence?

## 3. Competition alignment and differentiation

- **Primary: People** — healthier, safer managed communities via source-reduction operations.
- **Secondary: Planet** — environmental stewardship and climate/rainfall-responsive maintenance; avoid indiscriminate spraying.
- **Why drones:** selected for high/elevated/otherwise difficult-to-inspect, authorised outdoor assets; NOT necessary for every container.
- **Why smart ovitraps:** comparable recurring *oviposition activity* observations that can reveal where further inspection is worthwhile.
- **Why dashboard:** decisions, task ownership, audit, resource allocation, and proof of corrective follow-up instead of static heatmaps.
- **Originality hypothesis:** adaptive, auditable coupling of aerial candidate discovery + interval-based trap data + targeted operations + recurrence correction can outperform fixed/equal allocation on measurable workflow metrics. This is to be evaluated, not called a global first.

## 4. Users, roles and jobs to be done

| Role | Primary goal | Allowed actions |
|---|---|---|
| Township Manager / Vector-Control Coordinator | Plan and oversee block operations | Approve simulated/demo missions, review recommended allocation, assign tasks, view high-level reporting |
| Drone Operator | Execute appropriately approved missions or supervised demonstrations | Review flight readiness, confirm mission events, abort; cannot bypass restricted dispensing mode |
| Field Inspector / Maintenance Worker | Investigate specific assets and correct sources | Submit evidence, update site condition, record source removal, request follow-up |
| Entomology/Quality Reviewer | Manage uncertain evidence and validate surveillance | Review questionable egg counts/species labels and verified breeding evidence; no automatic public-health inference |
| System Administrator | Manage access and safety/config | Manage users, tenants, simulation modes, sensors; cannot override recorded compliance gaps silently |

MVP may combine coordinator + operator in one seeded demo account, but underlying authorisations must be separate permissions. No public resident app in P0.

## 5. Scope

### P0 — must work end-to-end

- Four synthetic blocks; registered approved assets (roof, planter, tyre, gutter), immutable locations within fictional coordinates; seeded baseline and multi-interval observations.
- Aerial image import, CV candidate object detection (real evaluated inference where possible; deterministic labelled fallback) and map placement with explicit quality/confidence and review state.
- Target assessment: dry/not eligible, possible water, confirmed-condition simulated, obstructed/uncertain; no direct pesticide command.
- Mission workflow: draft → reviewed → approved → simulated → completed/aborted; mock spray-only safe action and explicit `SIMULATED` records.
- Smart ovitraps: traps linked to blocks, interval-based samples/images, egg counts with validation and image provenance; prevent duplicate counting and track offline/invalid/servicing states.
- Dashboard: block map, ovitrap trends, valid sample counts, mission management, HITL queue, prioritised task plan, asset history, recurrence alert, operational evidence.
- Adaptive rules engine for next inspection priority, reasons, capacity budgeting, minimum routine coverage and offline-trap fallback.
- Corrective actions: inspection, source removal/repair, follow-up verification distinct from mere action completion.
- RBAC, audit trail, API contracts, seed/replay scenarios, tested full-stack local workflow.

### P1 — add only after P0 is tested

- ESP32 or camera bench unit for acquisition; limited-size local clear-water pump demo with human arming and physical kill switch.
- OR-Tools constraint allocation instead of fixed rules; before/after comparison and reproducible cost model.
- Ovitrap real image evaluation with labelled held-out data; sensor health notifications and near-real-time ingestion.
- Multiscenario digital twin and cost/time comparison across fixed vs adaptive policies.

### P2 — post-competition research/partnership

- Validated safe/autocidal trap with entomological field support; optional audio classifier evaluated with independently labelled species.
- Airworthy commercial UAV, flight-controller integration and actual regulated spraying only with qualified partner and all applicable approvals.
- Controlled entomological or public-health field trials to measure true vector impact and later disease outcomes.

### Explicit non-goals

Predict individual dengue infection, guarantee egg death or mosquito eradication, spray chemicals in the demo, fly over residential buildings without authorisation, automatic pesticide dosing, general IoT city platform, multi-agent chatbot system, live insect breeding, self-driving drone implementation.

## 6. Detailed functional requirements

### DRONE — Innovation pillar 1

| ID | Priority | Requirement | Acceptance signal |
|---|---|---|---|
| DR-01 | P0 | Maintain registered survey zones, assets and approved/simulated mode | Site and mode visible with persisted IDs |
| DR-02 | P0 | Upload aerial photo and metadata incl. source/time | Image accessible only to authorised users |
| DR-03 | P0 | Detect candidate containers with bounding boxes and model/version info | Repeatable results on fixture set |
| DR-04 | P0 | Store confidence, visibility/occlusion and limitations | Uncertain targets flagged, never auto-treated |
| DR-05 | P0 | Link candidates to specific assets or mark unmatched | Geospatial linkage verified in API |
| DR-06 | P0 | Assess target treatment eligibility and explicit reason codes | Dry/uncertain/no-permission skipped |
| DR-07 | P0 | Draft a mission with target list and expected route/effort | Draft generated from real DB records |
| DR-08 | P0 | Require approved mission state before simulated action | Attempt in DRAFT rejected by API |
| DR-09 | P0 | Simulate targeted clear-water action with state/event log | `SIMULATED` record shows target and outcome |
| DR-10 | P0 | Support abort/cancel/failure and safe skipped-target outcomes | No completion falsely logged after abort |
| DR-11 | P1 | Bench actuator separate adapter and physical interlocks | Water-only rig fails closed if disarmed |

### OVITRAP — Innovation pillar 2

| ID | Priority | Requirement | Acceptance signal |
|---|---|---|---|
| OV-01 | P0 | Register traps linked to blocks and maintenance owner | Active, offline, retired state valid |
| OV-02 | P0 | Record one image/sample collection interval with unique sample ID | Duplicate interval/sample rejected or idempotent |
| OV-03 | P0 | Count eggs on substrate through evaluated model or clearly labelled fixture | Correct test labels and provenance displayed |
| OV-04 | P0 | Store new eggs for interval; never accumulate identical paddle counts across days | Two reads of same sample count once |
| OV-05 | P0 | Show counts normalised per valid trap-interval and positive-trap rate | Missing/invalid samples excluded |
| OV-06 | P0 | Detect stale/offline/poor-quality trap data | State becomes DATA_UNAVAILABLE, never LOW_RISK |
| OV-07 | P0 | Store servicing, collection and emergence-prevention safety status | Overdue/unsafe trap blocks valid field claims |
| OV-08 | P1 | Camera/ESP32 sample ingestion with device identity and retry | Replayed packet idempotent |
| OV-09 | P2 | Optional acoustic classifier for adult mosquitoes, separately labelled | Species claim never based on raw frequency alone |

### DASHBOARD — Innovation pillar 3

| ID | Priority | Requirement | Acceptance signal |
|---|---|---|---|
| DB-01 | P0 | Four-block overview with source-labeled status and summary | UI refresh reflects persisted changes |
| DB-02 | P0 | Geospatial asset/trap/candidate map, mock coordinates | Zoom/select and filter works |
| DB-03 | P0 | Time-series ovitrap trend with intervals and validity | No false inference from off-line data |
| DB-04 | P0 | Mission planner and execution timeline | State changes only through backend |
| DB-05 | P0 | Coordinator HITL approval queue with decision rationale | Approval audit stores actor/time/reason |
| DB-06 | P0 | Adaptive next-round inspection allocation | Changed inputs produce changed prioritisation |
| DB-07 | P0 | Explanation lists contributing evidence and uncertainty | No unexplained high-risk disease label |
| DB-08 | P0 | Work-order assign/start/complete/verify lifecycle | Completion != verified resolution |
| DB-09 | P0 | Detect recurring verified accumulation at same asset | Permanent correction task generated |
| DB-10 | P0 | Compare block-level operational KPIs and monitoring coverage | Missing intervals clearly marked |
| DB-11 | P1 | Scenario comparison: fixed vs adaptive equal-budget strategy | Reproducible metrics and assumptions |
| DB-12 | P1 | Cost-aware mission allocation with OR-Tools | No mission violating hard constraints |

### CROSS-CUTTING

| ID | Priority | Requirement | Acceptance signal |
|---|---|---|---|
| CC-01 | P0 | Tenant-scoped RBAC and auth | Cross-tenant access denied |
| CC-02 | P0 | Append-only activity audit and evidence source tracking | Every consequential action attributable |
| CC-03 | P0 | Sample import/idempotent upload | Duplicate does not double count |
| CC-04 | P0 | Simulation vs bench vs observed mode shown everywhere | No misleading real deployment claim |
| CC-05 | P0 | Durable persistence and migration | Reset/seed from clean checkout works |
| CC-06 | P0 | Test/demo replay deterministic | Same fixture produces same outputs |
| CC-07 | P0 | Mobile-friendly and accessible workflows | Keyboard access and tested small screen |
| CC-08 | P0 | Fail closed on unavailable policy/approval/sensor state | No unsafe demo actuator activation |

## 7. Primary user stories

- **US-01 Coordinator:** I can create a four-block monitoring plan and understand what was genuinely observed versus simulated.
- **US-02 Operator:** I can upload an aerial image, see candidate containers and their certainty, and propose a mission.
- **US-03 Coordinator:** I can review a mission, reject or approve it, and understand precisely what the harmless demo will do.
- **US-04 Inspector:** I can submit evidence that a container is dry, water-bearing or obscured and record source-reduction work.
- **US-05 Trap manager:** I can import an interval sample and observe egg detection confidence and trap health; rereading it doesn't inflate counts.
- **US-06 Manager:** I can see WHY Block 1 deserves investigation while an offline Block 4 gets an equipment task, not a green status.
- **US-07 Manager:** I can view a fixed-versus-adaptive allocation baseline under equal budgets.
- **US-08 Maintenance:** Repeated verified water accumulation in P-03 triggers a durable-source-correction task.
- **US-09 Judge:** I can change one fixture live and watch database, priorities, missions and evidence update without screen refresh tricks.

## 8. Screen inventory and UX

1. `/dashboard` — overview, sampling coverage, action summary, alerts and operational mode. Never show raw egg count as infection probability.
2. `/township` — map; filters for block, asset, trap, candidate, inspection state; provenance popover.
3. `/drone/missions` — queue, approved zones, route estimate, candidate targets, mission simulation and safe skipped reasons.
4. `/drone/inspect/[id]` — image overlay, bounding boxes, source/model info and eligibility status.
5. `/ovitraps` — trap registry, quality, collection interval history, servicing and per-trap egg time series.
6. `/operations` — inspection and treatment review queue, human approval, work orders, assignments, verification.
7. `/planning` — score explanation, ranked next actions, allocation budget, alternative baseline scenario.
8. `/assets/[id]` — all observations and interventions in timeline, recurrence escalation.
9. `/settings` — roles, demo resets, device registration, compliance flags.

UI: functional controls; deep-linkable; skeleton/error/empty states; accessible form labels; date/time zones explicit; clear `DEMO/SIMULATED` banner on pages with mock observations.

## 9. Essential product rules

- Aerial CV cannot confirm eggs/larvae or dengue infection. Candidate findings require appropriate ground or domain evidence before actual intervention.
- All actual pesticide operations remain offline/future regulated work with trained personnel. Application includes no `spray_chemical` endpoint or actual drone control.
- No valid interval sample → unknown priority pending equipment and/or field inspection, not low-risk.
- Block surveillance is an *investigation trigger*; site-level evidence determines location/action.
- Dry targets skip; occluded targets request reinspection; clearly defined simulated eligible targets may activate water-only test under approvals and bench interlocks.
- A completed action is `ACTION_COMPLETED_PENDING_VERIFICATION` until independent follow-up confirms physical condition addressed.
- Real effects on dengue cases and trap efficacy cannot be claimed from seeded/simulated data.

## 10. Product metrics & proof

**Prototype functionality:** end-to-end successful scenarios (see test plan), AI container detection precision/recall on labelled test images, egg-count error on independent sample images, false eligible-decision rate, idempotency, offline/invalid detection, average operation planning time on seeded scenarios, recurrence alert correctness.

**Comparative evaluation:** equal-budget baseline A=fixed coverage vs B=adaptive inspection; count independently confirmed actionable issues discovered, missed issues, time/cost per valid finding and minimum routine coverage; explicitly report synthetic-versus-observed label.

**Field pilot hypotheses (not MVP claims):** source-reduction completion, prevention of repeated accumulation, validated mosquito surveillance trend and (only with public-health partners) more robust entomological/epidemiological outcomes.

## 11. Business and delivery

Buyer: township/developer operator or property management; service partner: licensed/qualified vector-control and UAS provider. Potential revenues: operations SaaS + inspection/evidence management + optional supported trap/approved drone service integrations. Value to verify: staff time, avoidable repeat inspections, inspection coverage, fewer outstanding asset issues, measurable recordkeeping; avoid invented RM figures.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Misclassified container | Confidence threshold, abstention, clear human queue and independent test set |
| Egg-count bias after source reduction | Do not equate eggs with adult population or treatment failure; multiple indicators |
| Trap accidentally breeds mosquitoes | Approved emergence-safe design, servicing log; no live mosquitoes in demo |
| Chemical/drone danger | Simulator + water-only isolated rig; strict mission approval and interlocks |
| False optimism from missing data | Missingness and sample validity explicit |
| Unfair resource allocation | Maintain minimum coverage and make ranking explainable |
| Recurring source mislinked | Explicit asset ID and inspectable history |
| Privacy/bystander imagery | Minimise collection, controlled access and retention policies |
| Cost/integration blowout | P0 first, optional hardware and advanced ML P1 |

## 13. Release acceptance / DoD

Accept P0 only when all three innovations run within the same persisted workflow using `fixtures/four_block_scenario.json`; the core safe/no-action paths, replay/idempotency, HITL audit, recurrence and allocation changes pass integration and E2E tests. All simulated facts must remain labelled. Provide a setup command, credentials only for local demo seeded accounts, screenshots where feasible, traceability to requirement IDs, and known limitations.
