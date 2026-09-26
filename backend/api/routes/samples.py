"""The demonstration's sample files, served so a starter can attach them in one click.

Only the files named in config/app.yaml under ``demo.samples`` are served,
by id, never by path, and only while ``demo.enabled`` is true: a production
install turns this off. The bytes are returned as they are on disk; the
client uploads them through POST /files like any other file, so quarantine,
content scanning, classification and the audit apply exactly as they do to
a file a person chose.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from backend.api.dependencies import require_permission
from backend.core.config import get_config
from backend.core.schemas import User

router = APIRouter(prefix="/api", tags=["samples"])

ROOT = Path(__file__).resolve().parents[3]


def _samples() -> dict[str, Path]:
    demo = get_config().settings.raw.get("demo") or {}
    if not demo.get("enabled", False):
        return {}
    samples: dict[str, Path] = {}
    for sample_id, relative in (demo.get("samples") or {}).items():
        path = (ROOT / str(relative)).resolve()
        # Inside the sample data folder, and there: a config entry cannot
        # turn this into a way to read any file on the host.
        if path.is_relative_to((ROOT / "sample_data").resolve()) and path.is_file():
            samples[str(sample_id)] = path
    return samples


@router.get("/samples")
def list_samples(user: Annotated[User, Depends(require_permission("file.upload"))]) -> list[dict[str, Any]]:
    """The sample files available here, by id. Empty when the demo is disabled."""
    return [
        {"id": sample_id, "name": path.name, "size_bytes": path.stat().st_size}
        for sample_id, path in sorted(_samples().items())
    ]


@router.get("/samples/{sample_id}")
def read_sample(
    sample_id: str, user: Annotated[User, Depends(require_permission("file.upload"))]
) -> FileResponse:
    path = _samples().get(sample_id)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No sample file '{sample_id}'")
    return FileResponse(path, filename=path.name)
