# Domain and Data Contract

## 1. Canonical vocabulary (use consistently across API/DB/UI)

- `Block`: named managed geographic zone; **not** a clinically validated dengue-risk area.
- `Asset`: physical container/drain/roof/planter location with stable ID and access/ownership status.
- `CandidateFinding`: CV-detected *potential* water-holding object with evidence quality.
- `SiteObservation`: date-stamped inspector/sensor/aerial observation describing water condition and confidence.
- `Trap`: monitored ovitrap with installation/servicing/safety status.
- `OvitrapSample`: a unique collection interval and optional substrate image, count and sampling effort.
- `Mission`: simulated or authorised inspection plan; *not* flight permit proof.
- `Intervention`: source-removal action or simulated targeted test event; may require verification.
- `FollowUp`: inspection after an intervention that determines whether physical condition was corrected.
- `AllocationRun`: versioned recommendation created from a snapshot of available evidence and budget.
- `WorkOrder`: assigned visit/treatment-support/source-correction/trap-service action.
- `AuditEvent`: who changed what, when, on which tenant, with evidence and request/correlation IDs.

## 2. Data model (relational, migrations required)

| Table | Core fields | Key constraints |
|---|---|---|
| `tenants` | `id`, `name` | unique id |
| `users`, `memberships` | `id`, `tenant_id`, `user_id`, `role`, `is_active` | unique tenant-user; RBAC |
| `blocks` | `id`, `tenant_id`, `name`, `polygon` | unique tenant-name, PostGIS polygon |
| `assets` | `id`, `tenant_id`, `block_id`, `type`, `point`, `ground_access`, `drone_visibility`, `consent_status`, `active` | FK block and tenant consistency |
| `media_assets` | `id`, `tenant_id`, `object_key`, `sha256`, `kind`, `source_mode`, `captured_at`, `uploaded_at`, `rights` | signed/private access |
| `site_observations` | `id`, `asset_id`, `source`, `observed_at`, `water_state`, `evidence_quality`, `media_id`, `review_state` | observed vs received times |
| `candidate_findings` | `id`, `observation_id`, `object_class`, `bbox`, `confidence`, `model_version`, `eligibility`, `reason_codes` | no unconfirmed biological claim |
| `traps` | `id`, `block_id`, `asset_id?`, `type`, `status`, `serviced_at`, `safe_design_verified`, `device_identifier` | unique device id |
| `ovitrap_samples` | `id`, `trap_id`, `source_sample_id`, `interval_start`, `interval_end`, `egg_count?`, `egg_positive?`, `validity`, `image_id?`, `model_version?`, `quality_notes`, `supersedes_id?` | interval end > start; unique source sample; no duplicate |
| `missions` | `id`, `tenant_id`, `block_id`, `mode`, `purpose`, `status`, `reviewed_by?`, `approved_at?`, `approval_scope`, `policy_version` | forbid actual spray mode |
| `mission_targets` | `id`, `mission_id`, `candidate_id`, `decision`, `reason`, `state` | unique mission/candidate |
| `mission_events` | `id`, `mission_id`, `event_id`, `type`, `occurred_at`, `received_at`, `source_mode`, `payload` | unique event id |
| `work_orders` | `id`, `asset_id?`, `block_id`, `kind`, `priority`, `status`, `assigned_to?`, `reason`, `parent_work_order_id?` | owning tenant checks |
| `interventions` | `id`, `asset_id`, `work_order_id?`, `method_category`, `mode`, `status`, `performed_by?`, `performed_at?`, `evidence_id?` | no unsupported effectiveness claim |
| `follow_ups` | `id`, `intervention_id`, `result`, `checked_at`, `checked_by`, `evidence_id` | completion distinct from result |
| `allocation_runs` | `id`, `tenant_id`, `window_start`, `window_end`, `budget`, `model_version`, `strategy`, `evidence_snapshot_hash`, `created_at` | reproducible inputs |
| `allocation_items` | `id`, `run_id`, `block_id`, `recommended_action`, `priority`, `estimated_effort`, `reasons`, `uncertainty` | no negative effort; min coverage |
| `audit_events` | `id`, `tenant_id`, `actor_id`, `entity_type`, `entity_id`, `action`, `mode`, `occurred_at`, `correlation_id`, `payload_digest` | append-only |

Suggested enums (do not collapse):

- `source_mode`: `SIMULATED | BENCH_TEST | OBSERVED | IMPORTED`.
- `water_state`: `DRY | VISIBLE_WATER | POSSIBLE_WATER | OCCLUDED | UNKNOWN`.
- `sample_validity`: `PENDING | VALID | INVALID | INSUFFICIENT_EVIDENCE`.
- `trap_status`: `ACTIVE | STALE | OFFLINE | SERVICING_DUE | RETIRED | UNSAFE`.
- `eligibility`: `SKIP | GROUND_REVIEW | MOCK_ACTION_ELIGIBLE`.
- `review_state`: `AUTO_PROCESSED | NEEDS_REVIEW | CONFIRMED | REJECTED`.
- `method_category`: `EMPTY_SCRUB | COVER | REMOVE | DRAINAGE_REPAIR | INSPECTION_ONLY | TEST_WATER_DEMO | AUTHORISED_SERVICE_RECORD`.

## 3. Scientific & temporal invariants

- Sample intervals must not overlap for the **same physical sampling substrate** unless expressly flagged as overlapping observations (exclude duplicates from aggregation).
- Egg counts are newly collected sample observations, not counts of the total mosquito population. Two photographs of the same collected sample are two image reads of **one sample**, not two samples.
- Trends should show `sum(egg_count)/valid_trap_intervals`, number positive / valid, invalid/offline count and sampling interval length. Do not mix mismatched sampling duration as equivalent without normalisation.
- For displayed changes use comparable baseline windows and explain differences in sampling effort, missing samples, seasonal conditions and intervention history.
- High egg observations can occur after local source reduction because remaining ovitraps attract more egg laying; avoid causal interpretation without independent confirmation.
- Candidate container ≠ standing water confirmed ≠ Aedes larvae observed ≠ dengue cases.
- Mission dispatched ≠ site reached; action recorded ≠ eggs destroyed; work order complete ≠ source corrected; follow-up complete must state observation limitations.

## 4. Geo and evidence provenance

Use PostGIS for points/polygons in SRID 4326, follow consent/access checks, never use synthetic fixture geometry as a real residence. Store observed timestamps separately from ingest timestamps; show age/staleness. Media provenance: hash, uploader/source, model version, image licence, capture time, redaction status.

## 5. Suggested index/query patterns

- GIST on block polygon/asset point; composite `(tenant_id, block_id)`.
- Composite `(trap_id, interval_end DESC)`; unique `source_sample_id` by trap; `(asset_id, observed_at DESC)`.
- `(status, priority)` work queue; `(mission_id, occurred_at)` timeline; `(tenant_id, occurred_at)` audit event.

## 6. Data retention

Propose a configurable retention schedule in privacy review: public pilot data must use least privilege, short-lived identifiable imagery and restricted export. For hackathon fixtures use fictional people and synthetic locations only. No resident identities are needed for the P0 product.
