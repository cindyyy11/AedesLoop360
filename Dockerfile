# Railway API image: includes packaged checkpoints under /models (see scripts/package_models.py).
# Build context must be the repository root after packaging models.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY services/api/requirements.txt /tmp/requirements.txt
COPY deploy/requirements-ml-runtime.txt /tmp/requirements-ml-runtime.txt
RUN pip install -r /tmp/requirements.txt \
    && pip install --extra-index-url https://download.pytorch.org/whl/cpu -r /tmp/requirements-ml-runtime.txt
COPY services/api /app/services/api
COPY fixtures /app/fixtures
COPY deploy/models /models
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && useradd --system --uid 10001 aedes \
    && chown -R aedes /app /models
USER aedes
WORKDIR /app/services/api
ENV AEDES_DRONE_MODEL_PATH=/models/drone/best.pt \
    AEDES_EGG_MODEL_PATH=/models/eggs/texture_ridge.joblib \
    AEDES_AUTO_MIGRATE=1 \
    AEDES_SEED_DEMO=1
ENTRYPOINT ["/entrypoint.sh"]
CMD ["api"]
