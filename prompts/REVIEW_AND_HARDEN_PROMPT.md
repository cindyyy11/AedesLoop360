# SECOND-PASS PROMPT — Audit and Harden the AedesLoop 360 Build

Act as a skeptical independent principal engineer, security reviewer, data scientist and hackathon judge. **Review the actual repository and running app, not merely the documentation.** Compare code, DB schema, API routes, UI flows and tests against `docs/PRD.md`, `docs/SAFETY_PRIVACY.md` and `docs/TEST_AND_ACCEPTANCE.md`.

1. Enumerate all implementation claims and verify them against real code, running routes, persistence and test results. Report missing/placeholder features as missing.
2. Inspect safety boundary: no real chemical dispensing or flight command routes; simulated mission requires backend approval; bench actuator if present fail-closed, disarmed by default with independent local stop.
3. Inspect science correctness: candidate container vs water vs larvae vs dengue; interval dedup; egg-count normalisation; offline device not low priority; no automatically asserted control efficacy.
4. Review tenant/RBAC, access to image objects, IDs and cross-tenant leakage, audit immutability, file uploads, idempotency, transaction boundaries, race conditions and validation.
5. Run lint/typecheck/build/unit/integration/E2E including `AC-01` to `AC-38` where implemented; record exact commands and failing cases. Fix highest-severity issues first, rerun.
6. Validate all three pillars in one reproducible demo. Test altered samples changing plan, dry/occluded skip, approved simulated action, offline trap and recurrence escalation.
7. Review UX on mobile/desktop: information hierarchy, accessible forms, empty/loading/error states, timestamp sources, colour not sole status indicator, no inert buttons.
8. Evaluate any real CV metrics only with independent hold-out data and documented dataset licences; ensure demo fixture mode cannot be mistaken for model performance.
9. Update README, `docs/IMPLEMENTATION_STATUS.md`, and architecture decision records to reflect reality; produce prioritized, reproducible fixes and evidence summary.

Do not introduce new features until high-severity correctness and safety defects are resolved. Never claim unrun tests passed or that a mock demonstration reduced dengue cases.
