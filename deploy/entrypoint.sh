#!/bin/sh
set -eu
role="${1:-api}"

# Fail fast when a model path is set but the file is missing; unset paths run in documented fixture mode.
for var in AEDES_DRONE_MODEL_PATH AEDES_EGG_MODEL_PATH; do
  eval "path=\${$var:-}"
  if [ -n "$path" ] && [ ! -f "$path" ]; then
    echo "$var points to a missing file: $path (mount deploy/models at /models)" >&2
    exit 1
  fi
done

case "$role" in
  migrate)
    python -m alembic -c alembic.ini upgrade head
    if [ "${AEDES_SEED_DEMO:-0}" = "1" ]; then python -m app.seed; fi
    ;;
  api)
    exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
    ;;
  worker)
    exec python -m app.worker
    ;;
  *)
    echo "unknown role: $role" >&2
    exit 2
    ;;
esac
