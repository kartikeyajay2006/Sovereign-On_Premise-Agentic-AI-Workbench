"""Harness endpoints: governed, multi-run workflows.

Registered in backend/api/main.py. The endpoints themselves are filled in by
the harness work; this module exists first so the router registration is not a
shared edit.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["harnesses"])
