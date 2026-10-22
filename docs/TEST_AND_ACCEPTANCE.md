# Test Plan, Acceptance Criteria, Quality Gates

## 1. Test layers

- **Unit:** Pydantic/domain validation, scoring, mission/work-order state transitions, sample uniqueness, recurrence, permission predicates.
- **Integration:** Postgres/PostGIS constraints/migrations, API response schemas, storage access, worker idempotency, image inference adapters.
- **E2E (Playwright):** login; four-block overview; simulated image upload; review/mission; sample import; plan recalc; intervention and follow-up.
- **Security:** tenant isolation, unauthorized roles, upload validation, expired approval, audit immutability, public evidence object denial.
- **Reliability:** worker down/retry, invalid images, stale devices, duplicate events, restart persistence, network disconnect.
- **Evaluation:** held-out CV/egg image metrics, fixed vs adaptive comparisons under identical budgets.

## 2. Core acceptance scenarios (all P0 unless noted)

| ID | Scenario | Expected result |
|---|---|---|
| AC-01 | Fresh seeded DB starts | Four blocks, traps and fictional assets displayed |
| AC-02 | Operator uploads valid aerial fixture | Private media + provenance persisted |
| AC-03 | AI detects tyre/container candidate | Class, bbox, confidence and model/source reported |
| AC-04 | Image unsupported or blurred | Explicit uncertainty; no treatment eligibility |
| AC-05 | Dry candidate | `SKIP`, zero mock actions |
| AC-06 | Occluded candidate | Ground-inspection task, zero mock actions |
| AC-07 | Eligible fictional mock target | Planned demo action generated, not actual pesticide |
| AC-08 | Simulate before mission approval | API returns 409, no action record |
| AC-09 | Coordinator approves mission | Actor/time/reason/policy version audited |
| AC-10 | Simulated mission executed | Ordered events, target outcome and SIMULATED badge |
| AC-11 | Mission aborted mid-run | Remaining targets unvisited, no false complete |
| AC-12 | Duplicate mission event replay | Single canonical event |
| AC-13 | Import valid egg-count interval | One interval counted, linked image/provenance |
| AC-14 | Re-upload same trap sample | No double count |
| AC-15 | Repeat count on same substrate | Revision only, no new sampled eggs |
| AC-16 | Invalid sample/poor image | Excluded from trend denominator, reason shown |
| AC-17 | Ovitrap offline | `DATA_UNAVAILABLE`, service task, not low priority |
| AC-18 | Interval mismatch across blocks | Comparability warning or normalised by effort |
| AC-19 | Change Block 1 sample/issue count | Priority + explanation recomputed and persisted |
| AC-20 | Block 4 missing data | Equipment task; not silently absent from plan |
| AC-21 | All blocks low recent counts | Minimum routine coverage maintained |
| AC-22 | No drone feasible/approved | Ground/monitoring alternatives recommended |
| AC-23 | Planner exceeds budget | Rejected/clamped with reason, no invalid plan |
| AC-24 | Unresolved confirmed source exists | Explicit actionable inspection/removal task preferred |
| AC-25 | Worker completes source removal | Status pending verification, not confirmed eradication |
| AC-26 | Inspector verifies successful correction | `VERIFIED_RESOLVED`, evidence link and actor recorded |
| AC-27 | Same asset has repeated verified accumulation | Engineering correction referral generated |
| AC-28 | Trigger same recurrence again | No duplicate unresolved engineering task |
| AC-29 | Inspector accesses different tenant | HTTP 403; no data exposure |
| AC-30 | Reboot app/worker after import | Observations/actions remain persisted |
| AC-31 | All mock scenario records | Display SIMULATED source and disclaimers |
| AC-32 | No CV model installed | Labelled fixture fallback, no false ML claim |
| AC-33 | Optional water rig unarmed (P1) | Pump cannot activate even with API call |
| AC-34 | Optional stop/timeout fired (P1) | Actuator disarms and records stop/fault |
| AC-35 | Equal-budget baseline comparison (P1) | Same cost constraints; inputs/outputs reproducible |
| AC-36 | Cross-role mission approval attempt | Denied with audit |
| AC-37 | Broken object-storage URL | Safe error/loading/retry, no leaked key |
| AC-38 | All three pillars in one judge workflow | End-to-end state updated on dashboard from backend |

## 3. Quality gates

**Gate A — Foundations:** migrations pass, seed idempotent, API health true, auth/tenancy working.

**Gate B — Drone:** safe skip, uncertain, approved mock action, abort and retries tested.

**Gate C — Ovitrap:** interval deduplication, valid/missing quality, egg-count display tested.

**Gate D — Dashboard:** updated sample changes next plan; no data mocked secretly; origin/provenance visible.

**Gate E — Final integration:** E2E scenario AC-38, offline fixture demo from fresh clone, README instructions accurate, no high-severity uncovered safety issues.

Do not claim passing gates until commands run successfully. If a package cannot run in sandbox, record commands and exact blocker.

## 4. Automated test command targets

Preferred (adapt to existing repo):

```sh
# unit/integration
cd services/api && pytest -q
cd apps/web && npm run lint && npm run typecheck && npm run test
# end-to-end
cd apps/web && npx playwright test
# format/security
cd services/api && ruff check . && ruff format --check .
```

Use repo's actual package manager. Add these commands only after scripts exist and work.

## 5. Demo acceptance / evidence collection

Record actual output logs/screenshot with all of: selected dry target skipped, eligible mock target treated only after approved mission, one occluded target referred, updated sample interval changes Block 1 priority, offline Block 4 not green, recurring P-03 task escalates, one follow-up closure and exact source-mode disclosures.

## 6. Model and benchmark evidence

Report dataset name/license, unique site splits, count of test images, metric definitions, baseline, confusion/error values and uncertainty. Synthetic fixture correctness is a functional test, not CV accuracy. Do not conflate performance on artificial dots with mosquito egg detector field accuracy.
