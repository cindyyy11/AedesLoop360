"""Field-data preflight rejects leakage and invalid reference labels."""

import csv
import io
import json
from pathlib import Path

from PIL import Image

from scripts.audit_field_validation import audit, digest


def photo(color: str) -> bytes:
    stream = io.BytesIO()
    Image.new("RGB", (32, 32), color).save(stream, format="PNG")
    return stream.getvalue()


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def example(tmp_path: Path) -> tuple[Path, Path, Path]:
    root = tmp_path / "field"
    drone = root / "drone"
    eggs = root / "eggs"
    for folder in (drone, eggs):
        (folder / "images").mkdir(parents=True)
    (drone / "labels").mkdir()
    drone_image = photo("green")
    egg_image = photo("brown")
    (drone / "images" / "a.png").write_bytes(drone_image)
    (drone / "labels" / "a.txt").write_text("4 0.5 0.5 0.25 0.25\n", encoding="utf-8")
    (eggs / "images" / "e.png").write_bytes(egg_image)
    write_csv(
        drone / "manifest.csv",
        [
            {
                "image": "a.png",
                "site_id": "site-new-1",
                "flight_id": "flight-1",
                "reviewed_by": "reviewer-a",
                "rights": "permitted local validation",
                "independent_site_attested": "true",
            }
        ],
    )
    write_csv(
        eggs / "manifest.csv",
        [
            {
                "image": "e.png",
                "site_id": "site-new-2",
                "trap_id": "trap-1",
                "substrate_id": "paddle-1",
                "interval_start": "2026-10-01T00:00:00Z",
                "interval_end": "2026-10-08T00:00:00Z",
                "reference_count": "0",
                "quality": "VALID",
                "reviewed_by": "reviewer-b",
                "rights": "permitted local validation",
                "independent_site_attested": "true",
            }
        ],
    )
    known_drone = tmp_path / "known-drone"
    known_egg = tmp_path / "known-egg.json"
    known_egg.write_text(json.dumps({"records": []}), encoding="utf-8")
    return root, known_drone, known_egg


def test_field_preflight_reports_missing_without_accuracy_claim(tmp_path: Path):
    result = audit(tmp_path / "absent", tmp_path / "none", tmp_path / "none.json")
    assert result["status"] == "MISSING_DATA"
    assert result["evaluation_performed"] is False


def test_field_preflight_accepts_complete_independent_labels(tmp_path: Path):
    root, known_drone, known_egg = example(tmp_path)
    result = audit(root, known_drone, known_egg)
    assert result["status"] == "READY_FOR_EVALUATION"
    assert result["drone"]["boxes_by_class"] == {"water_tank": 1}
    assert result["eggs"]["negative_specificity_ready"] is True
    assert result["evaluation_performed"] is False


def test_field_preflight_rejects_training_overlap_and_bad_interval(tmp_path: Path):
    root, known_drone, known_egg = example(tmp_path)
    prior = known_drone / "train" / "images"
    prior.mkdir(parents=True)
    (prior / "previous.png").write_bytes((root / "drone" / "images" / "a.png").read_bytes())
    known_egg.write_text(
        json.dumps(
            {"records": [{"sha256": digest((root / "eggs" / "images" / "e.png").read_bytes())}]}
        ),
        encoding="utf-8",
    )
    result = audit(root, known_drone, known_egg)
    assert result["status"] == "INVALID"
    assert "overlap" in result["drone"]["errors"][0]
    assert "overlap" in result["eggs"]["errors"][0]

    known_public = tmp_path / "known-public"
    known_public.mkdir()
    (known_public / "previous.png").write_bytes((root / "eggs" / "images" / "e.png").read_bytes())
    known_egg.write_text(json.dumps({"records": []}), encoding="utf-8")
    result = audit(root, tmp_path / "empty-drone", known_egg, known_public)
    assert result["status"] == "INVALID"
    assert "overlap" in result["eggs"]["errors"][0]

    manifest = root / "eggs" / "manifest.csv"
    rows = list(csv.DictReader(manifest.open(encoding="utf-8", newline="")))
    rows[0]["interval_end"] = "2026-09-30T00:00:00Z"
    write_csv(manifest, rows)
    result = audit(root, tmp_path / "empty-drone", known_egg)
    assert result["status"] == "INVALID"
    assert "interval" in result["eggs"]["errors"][0]
