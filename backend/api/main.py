"""FastAPI application entry point.

Boot sequence, in order:

1. Load and validate all declarative configuration (fails fast if a policy or
   registry file is malformed — a workbench with unreadable policy must not
   start).
2. Ensure storage directories and the database schema exist.
3. Verify the audit chain and record the boot event.
4. Seed the identities declared in ``policies/access-control.yaml``.
5. Start the sovereignty monitor and the task worker.
6. Load the everyday model in the background, when ``inference.prewarm`` is set.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api.routes import engineering, harnesses, proof, runs, samples, sandbox, skills, system, tasks
from backend.api.task_service import get_task_service
from backend.core.analyzer import get_task_analyzer
from backend.core.audit import get_audit_log
from backend.core.config import ConfigError, get_config
from backend.core.database import get_database
from backend.core.identity import get_identity_service
from backend.models_layer.client import InferenceError, NonLocalEndpointError, get_inference_client
from backend.models_layer.manager import get_model_manager
from backend.models_layer.router import get_model_router
from backend.security.sovereignty import get_sovereignty_monitor


async def _prewarm() -> None:
    """Load the model an ordinary question is answered with, before anyone asks.

    The first question after a restart paid the load -- 11 seconds of a
    20-second reply to "Hi" on the demo host. The model is chosen by the
    router exactly as a conversational reply's would be, admitted by the
    model manager (which records it), and loaded with the options the drafting
    stage sends: the runtime reloads a model whose context window differs
    from the one it holds, which would spend the load twice.

    It reads the drafting system prompt -- shared by answers and greetings --
    once and writes one token, which is discarded, so the runtime holds that
    prompt already read: the first greeting skipped 4.5 of its 8 seconds, and
    the first question skips the ~350 tokens of standing instructions.
    """
    router = get_model_router()
    decision = await router.route(get_task_analyzer().conversation_profile(), stage="drafting")
    if not decision.selected_model:
        return
    descriptor = await router.resolve_descriptor(decision)
    await get_model_manager().admit(descriptor, actor="system")
    options = router.generation_options(descriptor.id, stage="drafting")
    try:
        await get_inference_client().generate(
            model=descriptor.provider_model,
            system=get_config().system_prompt("reasoning"),
            prompt=get_config().prompt("task.converse", prompt="hello"),
            options={**options, "num_predict": 1},
            serving=router.serving_options(descriptor.id),
        )
        print(f"[workbench] {descriptor.display_name} loaded and ready")
    except InferenceError as exc:
        print(f"[workbench] could not preload {descriptor.display_name}: {exc}")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    config = get_config()
    config.settings.ensure_directories()
    get_database()
    # An index built before revision control has no document codes: settle
    # which revision of each procedure is in force before anything retrieves.
    try:
        from backend.rag.knowledge_base import get_knowledge_base

        get_knowledge_base().reconcile_revisions()
    except Exception:  # an unreadable index is reported by retrieval, not here
        pass

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

    # Sign the log's root as it stands at boot, so an edit made while the
    # service was down is caught by the next seal check.
    try:
        from backend.proof.audit_roots import get_audit_seal

        get_audit_seal().seal(reason="startup")
    except Exception:  # a broken chain is refused a seal; the chain check above recorded it
        pass

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

    # A configured container runtime is probed once at startup, off the event
    # loop: a probe container is started with the production flags and must
    # prove no network, a read-only root, non-root and no capabilities before
    # the sandbox will use it. The verdict, pass or fail, goes on the record.
    if str(config.settings.sandbox.get("runtime", "subprocess")).lower() in {"podman", "docker"}:
        from backend.tools.sandbox import get_sandbox

        sandbox = get_sandbox()
        effective = await asyncio.to_thread(lambda: sandbox.runtime)
        audit.record(
            category="system",
            action="sandbox_runtime_probe",
            actor="system",
            detail={"runtime": effective, "probe": sandbox.container_probe()},
        )
        print(f"[workbench] sandbox runtime: {effective}")

    created = get_identity_service().ensure_seed_users()
    if created:
        print(f"[workbench] seeded identities: {', '.join(created)}")

    monitor = get_sovereignty_monitor()
    await monitor.start()

    service = get_task_service()

    # Anything still marked running belongs to a worker that no longer exists.
    orphans = service.recover_orphans()
    if orphans:
        print(f"[workbench] closed {len(orphans)} task(s) interrupted by a restart")

    await service.start(worker_count=1)

    prewarm = None
    if bool(config.settings.inference.get("prewarm", False)):
        prewarm = asyncio.create_task(_prewarm())

    try:
        yield
    finally:
        if prewarm is not None and not prewarm.done():
            prewarm.cancel()
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
    application.include_router(sandbox.router)
    application.include_router(harnesses.router)
    application.include_router(skills.router)
    application.include_router(engineering.router)
    application.include_router(proof.router)
    application.include_router(runs.router)
    application.include_router(samples.router)

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
        """Unauthenticated status, reported from measurement.

        This was previously a hardcoded `sovereign: true, external_calls: 0`,
        which is an assertion dressed as a reading — the exact thing this
        platform exists to avoid. The figures now come from the monitor, so a
        breach shows here too.
        """
        status = get_sovereignty_monitor().status()
        return {
            "name": config.settings.app.get("name"),
            "status": "operational",
            "sovereign": status.sovereign,
            "external_calls": status.unapproved_connections,
            "monitor_active": status.monitor_active,
            "monitored_since": status.monitored_since.isoformat(),
            "docs": "/docs",
            "checked_at": status.last_checked.isoformat(),
        }

    return application


app = create_app()
