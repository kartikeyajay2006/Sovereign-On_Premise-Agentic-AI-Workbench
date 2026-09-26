#!/usr/bin/env python3
"""Get this host ready to be shown, and say whether it is.

    .venv/bin/python scripts/warmup.py              # check, load the drafting model, check again
    .venv/bin/python scripts/warmup.py --check      # read-only: loads nothing
    .venv/bin/python scripts/warmup.py --min-free-mb 2048
    .venv/bin/python scripts/warmup.py --evict-others   # also unload other generation models

Run it after `ollama serve` (scripts/start-ollama.ps1) and the API are up,
and again before judging. It reads, in order:

1. the OLLAMA_* variables this process can see, and the app's keep_alive;
2. whether the local inference server answers;
3. every registered model's digest against its pin, through the registry;
4. free memory, warning below readiness.min_free_memory_mb;
5. that the drafting model is resident at the context a question asks for,
   loading it first with the call the API's own prewarm makes (not --check);
6. whether the V-2104 scan's vision reading is cached for the installed
   vision model, so the demo run takes ~100 s rather than 5 to 6 minutes;
7. whether the audit chain verifies.

It ends with a READY / NOT READY table. Exit code 0 only when READY.

It never creates a task run and never writes the audit log or the
database: the checks are the ones GET /api/ready serves
(backend/ops/readiness.py), which exist to be read next to a live API.
Filling the vision cache is scripts/golden_demo.py's job, because that is a
real run and belongs on the record.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.core.config import get_config  # noqa: E402
from backend.ops import readiness  # noqa: E402
from backend.ops.readiness import Check  # noqa: E402

LABEL = {True: "PASS", False: "FAIL", None: "N/A"}


def _say(text: str = "") -> None:
    print(text, flush=True)


def _environment() -> None:
    _say("Ollama environment (as this shell sees it; the server's is what it was started with):")
    for name, value in readiness.ollama_environment().items():
        marker = "" if value or name not in readiness.RECOMMENDED_OLLAMA_VARIABLES else "   <- not set"
        _say(f"  {name:<26} {value if value is not None else '-'}{marker}")
    keep_alive = get_config().settings.inference.get("keep_alive")
    _say(f"  app inference.keep_alive   {keep_alive}")
    _say()


def _models(snapshot) -> None:  # type: ignore[no-untyped-def]
    _say("Registered models:")
    for model in snapshot.models:
        _say(f"  {model.id:<26} {model.role.value:<10} {model.integrity}")
    if snapshot.unregistered:
        _say(f"  unregistered (never routed): {', '.join(snapshot.unregistered)}")
    _say()


async def _evict_others(keep: str | None) -> list[str]:
    """Unload generation models other than the drafting one.

    Through the manager's unload call (keep_alive 0), and only models the
    registry declares as generation models: an embedding model is small and
    needed for retrieval, and an unregistered one is not ours to manage.
    """
    from backend.core.schemas import ModelRole
    from backend.models_layer.manager import get_model_manager
    from backend.models_layer.registry import get_model_registry

    snapshot = await get_model_registry().refresh()
    generation = {
        model.provider_model for model in snapshot.models if model.role != ModelRole.EMBEDDING
    }
    manager = get_model_manager()
    evicted = []
    for entry in await manager.resident_models():
        name = str(entry.get("model") or entry.get("name") or "")
        if name and name != keep and name in generation:
            if await manager._unload(name):
                evicted.append(name)
    return evicted


async def run(args: argparse.Namespace) -> int:
    _environment()

    inference, snapshot = await readiness.check_inference(force=True)
    _say(f"Inference server: {inference.detail}")
    if snapshot.provider_reachable:
        _models(snapshot)

    before = readiness.check_free_memory(args.min_free_mb)
    _say(f"Free memory before loading: {before.detail}")

    descriptor, options = (None, {})
    if snapshot.provider_reachable:
        try:
            descriptor, options = await readiness.drafting_model()
        except Exception as exc:
            _say(f"Could not route a drafting model: {exc}")

    if descriptor is not None and not args.check:
        _say(f"Loading {descriptor.display_name} at {options.get('num_ctx')} tokens "
             "(the API's prewarm call)...")
        try:
            result = await readiness.prewarm_drafting_model(descriptor, options)
            load_ms = (result.load_duration_ns or 0) // 1_000_000
            _say(f"  answered in {result.latency_ms} ms (load {load_ms} ms)")
        except Exception as exc:
            _say(f"  load failed: {exc}")
        if args.evict_others:
            evicted = await _evict_others(descriptor.provider_model)
            _say(f"  unloaded: {', '.join(evicted) if evicted else 'nothing else was resident'}")

    checks: list[Check] = [inference, readiness.check_pinned(snapshot)]
    checks.append(
        await readiness.check_drafting_resident(descriptor, options)
        if snapshot.provider_reachable
        else Check("drafting_model_resident", False, "not measured: inference server unreachable")
    )
    checks.append(readiness.check_free_memory(args.min_free_mb))
    checks.append(readiness.check_vision_cache(snapshot))
    checks.append(readiness.check_audit_chain())
    report = readiness.Readiness(checks=checks, checked_at=0.0)

    resident = next((c for c in checks if c.name == "drafting_model_resident"), None)
    if resident and resident.data.get("resident"):
        others = [name for name in resident.data["resident"] if name != (descriptor.provider_model if descriptor else None)]
        if others:
            _say(f"Also resident: {', '.join(others)} (--evict-others unloads generation models)")

    _say()
    _say(f"{'CHECK':<26} {'RESULT':<6} DETAIL")
    for check in checks:
        _say(f"{check.name:<26} {LABEL[check.ok]:<6} {check.detail}")
    _say()
    _say("READY" if report.ready else "NOT READY")
    if args.check:
        _say("(--check: nothing was loaded)")
    return 0 if report.ready else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="read only: load nothing")
    parser.add_argument(
        "--min-free-mb", type=int, default=None,
        help="free-memory threshold (default readiness.min_free_memory_mb)",
    )
    parser.add_argument(
        "--evict-others", action="store_true",
        help="after loading, unload every other registered generation model",
    )
    args = parser.parse_args(argv)
    if args.check and args.evict_others:
        parser.error("--evict-others changes what is loaded; it cannot be combined with --check")
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())
