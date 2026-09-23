"""Interactive sandbox endpoints.

Registered in backend/api/main.py. The endpoints themselves are filled in by
the sandbox work; this module exists first so the router registration is not a
shared edit.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["sandbox"])
