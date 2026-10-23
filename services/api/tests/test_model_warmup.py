from app import model_warmup


def test_warm_models_reports_not_configured_without_checkpoints(monkeypatch):
    monkeypatch.delenv("AEDES_DRONE_MODEL_PATH", raising=False)
    monkeypatch.delenv("AEDES_EGG_MODEL_PATH", raising=False)
    assert model_warmup.warm_models() == {"drone": "NOT_CONFIGURED", "egg": "NOT_CONFIGURED"}


def test_warmup_can_be_disabled(monkeypatch):
    monkeypatch.setenv("AEDES_WARMUP_MODELS", "0")
    assert model_warmup.start_background_warmup() is None
