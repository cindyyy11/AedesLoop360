# Deployment (Docker Compose)

Status: **written, not yet built or run.** Docker Desktop's engine was not running when this was authored, so only these checks were executed: `docker compose config` (valid), `sh -n deploy/entrypoint.sh`, Alembic migrate + `app.seed` against SQLite, and loading the packaged checkpoints with the app's own loaders. PostgreSQL migration behaviour and the image builds are unverified.

## What is deployed

| Service | Image | Notes |
|---|---|---|
| `db` | postgres:17-alpine | Volume `aedes_pg` |
| `migrate` | `deploy/Dockerfile.api` | Runs Alembic, then `app.seed` if `AEDES_SEED_DEMO=1` (idempotent) |
| `api` | `deploy/Dockerfile.api` | FastAPI on 127.0.0.1:8000 |
| `worker` | `deploy/Dockerfile.api` | Durable job worker (`python -m app.worker`) |
| `web` | `deploy/Dockerfile.web` | Next.js production build on 127.0.0.1:3000, proxies `/api` to `api:8000` |

## Model and data

- **Models** are not baked into images. `python scripts/package_models.py` copies the validation-selected drone YOLOv8n checkpoint and the egg texture-ridge model (about 6.3 MB total) into `deploy/models/` with a `MANIFEST.json` of SHA256 hashes. Compose mounts that folder read-only at `/models`. `deploy/models/` is git-ignored: the drone dataset's licence is ambiguous (Mendeley says CC BY 4.0, the export YAML says `Private`), so confirm terms before distributing the weights.
- With no weights (set both `AEDES_*_MODEL_PATH` to empty), the app runs in fixture mode: uploads report `NOT_CONFIGURED` and only the exact-hash pre-annotated fixture works. If a path is set but the file is missing, the container exits.
- **Data** is the fictional four-block scenario in `fixtures/four_block_scenario.json`, loaded by the seed. Training datasets (`data/external`) are never part of the deployment.

## Run

```powershell
python scripts/package_models.py
Copy-Item deploy/env.deploy.example deploy/.env.deploy   # then set AEDES_DB_PASSWORD
docker compose --env-file deploy/.env.deploy -f compose.deploy.yaml up --build
```

Open http://localhost:3000/dashboard and click **Enter demo**.

## Before exposing beyond localhost

- Seeded accounts use the public password pattern `demo-<role>-360`. Ports are bound to 127.0.0.1 for that reason. Set `AEDES_SEED_DEMO=0` and provision real users before any shared deployment.
- Put TLS in front, set `AEDES_SECURE_COOKIES=1` and `AEDES_WEB_ORIGIN` to the public origin.
- The docs list rate limits, CSRF review, private object storage and retention controls as unverified (see `IMPLEMENTATION_STATUS.md`).
- Mode labels stay `SIMULATED`/`IMPORTED`: this deploys the simulator, not flight control or a real actuator.
