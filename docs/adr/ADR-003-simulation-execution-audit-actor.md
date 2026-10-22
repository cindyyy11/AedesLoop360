# ADR-003 — Preserve the simulation operator in durable jobs

**Status:** Accepted  
**Date:** 2026-10-23

## Context

The worker previously attributed simulated execution events to the coordinator who approved a mission. The API requires an operator to start the simulation, so the audit actor did not identify the person who initiated execution.

## Decision

Persist the initiating operator ID on the durable simulation job. The worker uses that operator for execution events and audit entries. Migration 002 adds a nullable foreign key so existing revision-001 databases can upgrade without losing queued work. Legacy jobs without an operator ID use the approver as a compatibility fallback; their original operator cannot be reconstructed.

## Consequences and verification

Newly started jobs preserve the operator as the execution actor. The API test asserts the mock-action audit actor. Fresh SQLite migration and a minimal revision-001-to-002 compatibility fixture pass. PostgreSQL migration behavior remains unverified.
