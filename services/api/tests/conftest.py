"""One migrated database for every test module that uses the app's shared engine.

`app.db` builds its engine from AEDES_DATABASE_URL the first time it is imported, so the first
test module to import it decides the database for the whole process. Test modules therefore must
not set the variable themselves; it is set here, before any of them is collected, and the schema is
created once with the real migrations so database triggers exist for every module.
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / "services" / "api"
SCRATCH = ROOT / "data" / "tests"  # git-ignored with the rest of data/
SCRATCH.mkdir(parents=True, exist_ok=True)

_DB_DIR = tempfile.TemporaryDirectory(dir=SCRATCH, ignore_cleanup_errors=True)
os.environ["AEDES_DATABASE_URL"] = "sqlite:///" + str(Path(_DB_DIR.name) / "shared.db")


def pytest_configure(config):
    # The default system temp folder can be access-denied (seen on Windows); keep temp files in the repo scratch area instead.
    if config.option.basetemp is None:
        config.option.basetemp = str(SCRATCH / "pytest-tmp")


@pytest.fixture(scope="session", autouse=True)
def migrated_shared_database():
    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", str(API / "alembic.ini"), "upgrade", "head"],
        check=True,
        cwd=ROOT,
        env={**os.environ, "PYTHONPATH": str(API)},
    )
