# CI Specification (implement after auditing actual repo)

Recommended PR gates: frontend dependency install using lockfile; TS typecheck, lint and unit tests; Python dependency install, Ruff lint/format checks, Pytest unit+integration; Postgres service with migrations and seed; OpenAPI-generated client drift check; Playwright fixture E2E; secret scan and dependency audit. Cache only safe dependencies. Keep expected CI commands in root README in sync with actual scripts. Do not copy a workflow that references nonexistent files.
