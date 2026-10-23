"""Reproduce the public AeEggCounter candidate metadata audit; no inference.

Visual inspection rejected this snapshot for clean-image evaluation: an alleged
original contains detector overlays. Counts in filenames are provisional.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

DOI = "doi:10.7910/DVN/TL5NP2"
AUDITED_METADATA_SHA256 = "c505632783c94061234c397db61248cc7437a36e6fc55ddb7343349c98ddb123"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=ROOT / "data/external/aeeggcounter-test")
    args = parser.parse_args()
    if hashlib.sha256(args.metadata.read_bytes()).hexdigest() != AUDITED_METADATA_SHA256:
        raise ValueError("This visual audit applies only to the archived metadata snapshot")
    metadata = json.loads(args.metadata.read_text(encoding="utf-8-sig"))
    version = metadata["data"]["latestVersion"]
    if metadata["data"].get("persistentUrl", "").split("/")[-1] != "TL5NP2":
        raise ValueError("Unexpected dataset identifier")
    files = version["files"]
    originals = {
        Path(item["dataFile"]["filename"]).stem.casefold(): item
        for item in files
        if "marked" not in item["dataFile"]["filename"].casefold()
        and Path(item["dataFile"]["filename"]).suffix.casefold() in {".jpg", ".jpeg"}
    }
    pairs = []
    for marked in files:
        match = re.fullmatch(r"(.+)-(\d+) eggs? marked\.[^.]+", marked["dataFile"]["filename"])
        if match and match[1].casefold() in originals:
            original = originals[match[1].casefold()]
            if original.get("restricted") or marked.get("restricted"):
                continue
            pairs.append(
                {"code": match[1], "count": int(match[2]), "original": original["dataFile"]}
            )
    if len({pair["code"].casefold() for pair in pairs}) != len(pairs):
        raise ValueError("Ambiguous repeated count annotation")
    args.out.mkdir(parents=True, exist_ok=True)
    audit = {
        "doi": DOI,
        "license": version.get("license"),
        "files": len(files),
        "original_jpeg_images": len(originals),
        "filename_count_pairs": len(pairs),
        "zero_count_pairs": sum(pair["count"] == 0 for pair in pairs),
        "unpaired_originals": sorted(set(originals) - {p["code"].casefold() for p in pairs}),
        "status": "REJECTED_FOR_CLEAN_IMAGE_BENCHMARK",
        "evaluation_performed": False,
        "metadata_sha256": hashlib.sha256(args.metadata.read_bytes()).hexdigest(),
        "rejection_evidence": {
            "file_id": 12511079,
            "filename": "20250610_144239.jpg",
            "finding": "Visually inspected alleged original already contains red detector bounding boxes and egg confidence labels",
            "consequence": "Clean images and confirmed per-file human labels are required before reconsidering this candidate",
        },
        "count_source": "Provisional count parsed from paired marked filename; marked pixels never used",
    }
    (args.out / "candidate-audit.json").write_text(json.dumps(audit, indent=2) + "\n")
    print(json.dumps(audit, indent=2), flush=True)


if __name__ == "__main__":
    main()
