"""Copy monorepo fixtures into the API root so Vercel can seed without ML weights."""

from __future__ import annotations

import shutil
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent
REPO_ROOT = API_ROOT.parent.parent  # services/api -> services -> repo root
SRC = REPO_ROOT / "fixtures"
DST = API_ROOT / "fixtures"


def main() -> None:
    if not SRC.is_dir():
        raise SystemExit(f"Missing fixtures at {SRC}")
    if DST.exists():
        shutil.rmtree(DST)
    shutil.copytree(SRC, DST)
    print(f"Copied fixtures -> {DST}")


if __name__ == "__main__":
    main()
