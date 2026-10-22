# ADR-004: Local fixture evidence and correction review

**Status:** Accepted for the local demonstration
**Date:** 2026-10-23

## Context

The local demonstration needs a reproducible path from an uploaded image to a persisted inspection outcome without implying that a trained or evaluated computer-vision model is installed. Sample counts also need a correction path that does not erase the earlier reviewer decision, and simulated mission approvals should not remain valid indefinitely.

## Decisions

- An upload must name the fictional asset it concerns. The API verifies tenant ownership before storing bytes.
- Only an image whose SHA-256 exactly matches the committed synthetic aerial fixture can reuse its authored annotation, and only for the asset that annotation names. The record says `DEMO_PREANNOTATED_V1`; this is fixture lookup, not model inference or a CV metric.
- Every other valid image produces an `UNCERTAIN` candidate with no confidence score and `UNSUPPORTED_GROUND_REVIEW`. It can be inspected or sent to ground review, but cannot qualify for a simulated action.
- Reviewers and coordinators may correct a human-labelled egg count. Each correction stores the previous and corrected count, reviewer, evidence image, reason, and mode in an append-only record. The current sample shows the corrected value; the revision endpoint preserves its history. Poor-quality corrections remain invalid for trend summaries.
- Simulated mission approval expires after 30 minutes. Execution requires the still-valid approval and the existing mode and policy checks.

## Consequences

The local browser flow can upload the exact fixture and an unsupported image, show the linked or uncertain persisted finding, import a distinct sample interval, revise its count, and compute a new plan. A detector, field accuracy, physical asset matching from pixels, intervention efficacy, and live device behavior remain unimplemented and must not be inferred from this fixture path.

SQLite tests cover migrations, upload classification, approval expiry, sample revisions, planning comparability, and the integrated browser flow. PostgreSQL behavior remains unverified.
