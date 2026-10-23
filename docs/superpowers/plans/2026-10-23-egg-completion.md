# Egg workflow completion

Scope: verify the existing approved egg-review design; no model retuning using test outcomes.

- [x] Run the real configured model through browser upload, ROI review, correction, confirmation, persisted interval/chart and reload using isolated SQLite/API/web services.
- [x] Assert proposal-only uploads do not create samples and confirmation retries do not double count.
- [x] Check source provenance and filename grouping documentation; record verified facts and unresolved assumptions without changing the existing split. Label CSV matches publisher checksum; grouping dictionary is still unavailable.
- [x] Prepare an independent field-evaluation collection schema and acceptance protocol including zero-count paddles. Do not fabricate fresh observations or labels.
- [x] Record executed checks, environment and remaining external dependencies in acceptance/status/runbook docs.

Final rerun exposed a proxy timeout during cold model imports. The launcher now warms the exact inference cache and image features, then serves Uvicorn in the same Python process. Fresh field collection and publisher metadata remain external dependencies, not completed experiments.
