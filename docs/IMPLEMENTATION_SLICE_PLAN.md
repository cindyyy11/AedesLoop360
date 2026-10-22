# Closed-loop implementation plan

Implement the supplied design as six tested slices: (1) SQLAlchemy/Alembic, seed and server-owned auth; (2) interval/substrate deduplication and quality summaries; (3) approved simulation with durable jobs and abort; (4) bounded allocation snapshots and independent correction verification; (5) Next.js UI and generated OpenAPI client; (6) test evidence and reproducible runbook.

Test each slice before continuing. No hardware or learned CV. SQLite is a documented local fallback because Docker engine access is denied. PostgreSQL deployment needs separate verification. Preserve the user's .env.
