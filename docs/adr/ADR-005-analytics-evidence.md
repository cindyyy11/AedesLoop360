# ADR-005: Persist analytics with explicit evidence modes

**Status:** Accepted for the local prototype · **Date:** 2026-10-23

## Context

The prototype has synthetic trap observations and authored image fixtures, but no downloaded labelled evaluation data or model checkpoints. Showing fixture values as model metrics would misstate evidence. Analytics must also preserve the existing tenant boundary and safety gates.

## Decision

Use one additive tenant-scoped `analytics_runs` table for model evaluation summaries and allocation experiments. Model cards only expose completed held-out runs with positive test counts and dataset/checkpoint hashes; candidate or fixture data remains `NOT_EVALUATED`. The evaluation CLI writes JSON summaries and an explicit local registration command imports eligible reports. Allocation benchmarks persist separately as `SIMULATED` and use shared scenario labels and constraints.

Trap cadence is stored as a configurable expected sampling assumption (default seven days) so completeness has an explicit denominator. It does not assert that a device sampled. Interval analytics exclude unusable quality and mismatched collection durations, and show `DATA_UNAVAILABLE` with null count values when no valid samples exist.

## Consequences

- Dashboard values can be traced to tenant-scoped run/sample records and labelled with provenance.
- Reports and test fixtures cannot claim empirical performance without labels, checkpoint and held-out metadata.
- Local import trusts the operator's supplied labels and predictions; it checks the presence of provenance fields but cannot independently certify label truth or split independence.
- Public dataset acquisition, licensed file verification, model training and field evaluation remain future work.
