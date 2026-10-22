# ADR-001: Single Repository, Modular Monolith, Explicit Simulators

**Date:** 2026-10-23  
**Status:** Accepted for reference implementation; adapt when codebase already exists.

## Context

The team needs to integrate a drone imagery workflow, smart ovitrap images and an adaptive dashboard rapidly and with repeatable local testing. The final hackathon demonstration may run without physical UAVs or internet access.

## Options

1. Multiple independently deployed microservices and repositories by team member.
2. A single Next.js application with unstructured API routes and long background tasks.
3. A modular monolith with Next.js front end, FastAPI application modules, durable worker, Postgres and explicit simulator adapters.

## Decision

Choose option 3. Use contracts generated from FastAPI OpenAPI and a single canonical DB schema. Keep domain boundaries clear. Keep simulated UAV/actuator behaviours behind typed interfaces, with no real dispensing adapter.

## Consequences

Pros: simpler integration, auditable data, testable fallback, lower coordination overhead. Tradeoffs: not independently deployable domains; required discipline around module boundaries. Re-evaluate only after functioning pilot evidence.
