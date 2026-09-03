"""FastAPI application entry point.

Boot sequence, in order:

1. Load and validate all declarative configuration (fails fast if a policy or
   registry file is malformed — a workbench with unreadable policy must not
   start).
2. Ensure storage directories and the database schema exist.
3. Verify the audit chain and record the boot event.
4. Seed the identities declared in ``policies/access-control.yaml``.
5. Start the sovereignty monitor and the task worker.
"""

from __future__ import annotations

import contextlib
from datetime import datetime, timezone
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api.routes import system, tasks
from backend.api.task_service import get_task_service
from backend.core.audit import get_audit_log
from backend.core.config import ConfigError, get_config
from backend.core.database import get_database
from backend.core.identity import get_identity_service
from backend.models_layer.client import NonLocalEndpointError
from backend.models_layer.manager import get_model_manager
from backend.security.sovereignty import get_sovereignty_monitor


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    config = get_config()
    config.settings.ensure_directories()
    get_database()

    audit = get_audit_log()
    if bool(config.settings.audit.get("verify_on_startup", True)):
        chain = audit.verify_chain()
        if not chain.valid:
            # Do not fail closed on boot, but make the breach unmissable.
            audit.record(
                category="audit",
                action="chain_integrity_failure",
                actor="system",
                detail={"broken_at": chain.broken_at, "events": chain.events},
            )

    audit.record(
        category="system",
        action="startup",
        actor="system",
        detail={
            "application": config.settings.app.get("name"),
            "inference_provider": config.settings.inference.get("provider"),
            "inference_base_url": config.settings.inference.get("base_url"),
            "sandbox_runtime": config.settings.sandbox.get("runtime"),
            "external_connectivity": "denied by policy",
        },
    )

    created = get_identity_service().ensure_seed_users()
    if created:
        print(f"[workbench] seeded identities: {', '.join(created)}")

    monitor = get_sovereignty_monitor()
    await monitor.start()

    service = get_task_service()
    await service.start(worker_count=1)

    try:
        yield
    finally:
        await service.stop()
        await get_model_manager().release_all()
        await monitor.stop()
        audit.record(category="system", action="shutdown", actor="system")


def create_app() -> FastAPI:
    try:
        config = get_config()
    except ConfigError as exc:  # pragma: no cover - boot-time failure
        raise SystemExit(f"Configuration error: {exc}") from exc

    application = FastAPI(
        title=str(config.settings.app.get("name", "Sovereign Workbench")),
        description=(
            "Air-gapped industrial AI workbench. All inference, retrieval, code "
            "execution and document generation happen on this host. No external "
            "API calls are made at any point."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.settings.app.get("cors_origins", [])),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(system.router)
    application.include_router(tasks.router)

    @application.exception_handler(NonLocalEndpointError)
    async def non_local_endpoint_handler(
        request: Request, exc: NonLocalEndpointError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={
                "detail": str(exc),
                "sovereignty": "refused: inference endpoint must be loopback",
            },
        )

    @application.get("/", tags=["system"])
    async def root() -> dict[str, object]:
        return {
            "name": config.settings.app.get("name"),
            "status": "operational",
            "sovereign": True,
            "external_calls": 0,
            "docs": "/docs",
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    return application


app = create_app()
