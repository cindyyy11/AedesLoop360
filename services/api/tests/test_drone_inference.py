import io

from PIL import Image

from app import drone_inference


def png_bytes():
    image = Image.new("RGB", (100, 50), "white")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_missing_checkpoint_is_explicit(monkeypatch, tmp_path):
    monkeypatch.delenv("AEDES_DRONE_MODEL_PATH", raising=False)
    assert drone_inference.infer_candidates(png_bytes()).status == "NOT_CONFIGURED"
    missing = drone_inference.infer_candidates(png_bytes(), str(tmp_path / "missing.pt"))
    assert missing.status == "MODEL_MISSING"
    assert missing.detections == []


def test_detector_boxes_are_normalized_and_keep_candidate_labels(tmp_path):
    checkpoint = tmp_path / "candidate.pt"
    checkpoint.write_bytes(b"test checkpoint bytes")

    class Boxes:
        xyxy = [[10, 5, 110, 30]]
        cls = [2]
        conf = [0.75]

    class Result:
        boxes = Boxes()
        names = {2: "tyre"}

    class Model:
        def predict(self, **kwargs):
            assert kwargs["verbose"] is False
            return [Result()]

    result = drone_inference.infer_candidates(png_bytes(), str(checkpoint), lambda _: Model())
    assert result.status == "DETECTED"
    assert result.detections[0].object_class == "tyre"
    assert result.detections[0].bbox == [0.1, 0.1, 1.0, 0.6]
    assert result.detections[0].confidence == 0.75
    assert result.model_version.startswith("candidate@")


def test_empty_model_output_does_not_claim_image_is_clear(tmp_path):
    checkpoint = tmp_path / "empty.pt"
    checkpoint.write_bytes(b"weights")

    class Result:
        boxes = None
        names = {}

    class Model:
        def predict(self, **kwargs):
            return [Result()]

    result = drone_inference.infer_candidates(png_bytes(), str(checkpoint), lambda _: Model())
    assert result.status == "NO_DETECTIONS"
    assert result.detections == []


def test_missing_optional_runtime_is_reported(tmp_path, monkeypatch):
    checkpoint = tmp_path / "candidate.pt"
    checkpoint.write_bytes(b"weights")

    def unavailable(_):
        raise ImportError("optional runtime is absent")

    monkeypatch.setattr(drone_inference, "_cached_model", unavailable)
    result = drone_inference.infer_candidates(png_bytes(), str(checkpoint))
    assert result.status == "DEPENDENCY_UNAVAILABLE"
    assert result.detections == []
