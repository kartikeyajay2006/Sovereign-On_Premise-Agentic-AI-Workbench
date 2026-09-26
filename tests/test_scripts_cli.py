"""Every script answers --help with its usage, and does nothing else.

scripts/make_sample_pid_image.py read no arguments, so `--help` rendered
the drawing and wrote it over the committed image. A script asked for its
usage must print it and leave the tree alone.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = sorted(path for path in (ROOT / "scripts").glob("*.py") if path.name != "__init__.py")


def _snapshot() -> dict[Path, float]:
    return {path: path.stat().st_mtime_ns for path in (ROOT / "sample_data").rglob("*") if path.is_file()}


@pytest.mark.parametrize("script", SCRIPTS, ids=[path.stem for path in SCRIPTS])
def test_help_prints_usage_and_writes_nothing(script: Path) -> None:
    before = _snapshot()
    completed = subprocess.run(
        [sys.executable, str(script), "--help"], cwd=ROOT, capture_output=True, text=True, timeout=120,
    )
    assert completed.returncode == 0, completed.stderr[-500:]
    assert completed.stdout.lstrip().startswith("usage:"), completed.stdout[:300]
    assert _snapshot() == before
