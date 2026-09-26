"""Is this host ready to be shown? Measured, one reading per check.

Two consumers share these checks, so they cannot disagree about what ready
means:

* ``scripts/warmup.py`` -- run by an operator before a demo or a shift. It
  prints every reading with its detail and can load the drafting model.
* ``GET /api/ready`` -- unauthenticated, for a probe or the console banner.
  It returns the booleans only (``Readiness.public()``): no model names,
  digests, paths, memory figures or usernames.

Nothing here writes: no audit record, no task, no database row. The warm-up
script runs next to a live API that owns the audit chain, and a second
writer would fork it. Loading the drafting model is the one side effect, and
only ``prewarm_drafting_model`` does it, only when a caller asks.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import psutil

from backend.core.config import PROJECT_ROOT, get_config
from backend.core.schemas import ModelDescriptor, ModelRole

# The variables start-ollama.ps1 / start-ollama.sh set. Read from this
# process's environment, which is the server's only when both were started
# from the same one: the script says so rather than claiming the server's.
OLLAMA_VARIABLES = (
    "OLLAMA_HOST",
    "OLLAMA_KEEP_ALIVE",
    "OLLAMA_MAX_LOADED_MODELS",
    "OLLAMA_NUM_PARALLEL",
    "OLLAMA_FLASH_ATTENTION",
    "OLLAMA_KV_CACHE_TYPE",
)
RECOMMENDED_OLLAMA_VARIABLES = OLLAMA_VARIABLES[:4]

DEFAULT_MIN_FREE_MB = 1536


@dataclass
class Check:
    """One reading. ``ok`` is None when the check does not apply here."""

    name: str
    ok: bool | None
    detail: str
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class Readiness:
    checks: list[Check]
    checked_at: float

    @property
    def ready(self) -> bool:
        # A check that does not apply (a demo sample not configured) neither
        # passes nor fails the host.
        return all(check.ok for check in self.checks if check.ok is not None)

    def public(self) -> dict[str, Any]:
        """Minimal disclosure: the verdict and one boolean per check."""
        return {
            "ready": self.ready,
            "checks": {check.name: check.ok for check in self.checks},
        }


def _settings() -> dict[str, Any]:
    return get_config().settings.raw.get("readiness") or {}


def min_free_mb() -> int:
    return int(_settings().get("min_free_memory_mb", DEFAULT_MIN_FREE_MB))


def ollama_environment() -> dict[str, str | None]:
    return {name: os.environ.get(name) for name in OLLAMA_VARIABLES}


# -- individual checks ------------------------------------------------------
async def check_inference(*, force: bool = False) -> tuple[Check, Any]:
    from backend.models_layer.registry import get_model_registry

    snapshot = await get_model_registry().refresh(force=force)
    reachable = bool(snapshot.provider_reachable)
    return (
        Check(
            "inference_reachable",
            reachable,
            "local inference server answered" if reachable else "local inference server unreachable",
        ),
        snapshot,
    )


def check_pinned(snapshot: Any) -> Check:
    """Every installed model with a pinned digest matches it, and one does.

    A pinned model that is not installed is not a failure: a laptop profile
    deliberately leaves qwen3:8b off. A mismatch is, because the router
    refuses that model and the certificate could not name its weights.
    """
    rows = [
        {"model": model.id, "integrity": model.integrity}
        for model in snapshot.models
        if model.expected_digest
    ]
    installed = [row for row in rows if row["integrity"] != "not_installed"]
    mismatched = [row["model"] for row in installed if row["integrity"] != "verified"]
    ok = bool(snapshot.provider_reachable) and bool(installed) and not mismatched
    if not snapshot.provider_reachable:
        detail = "not measured: inference server unreachable"
    elif mismatched:
        detail = "digest mismatch: " + ", ".join(mismatched)
    elif not installed:
        detail = "no pinned model is installed"
    else:
        detail = f"{len(installed)} pinned model(s) verified"
    return Check("pinned_models_verified", ok, detail, {"models": rows})


async def drafting_model() -> tuple[ModelDescriptor | None, dict[str, Any]]:
    """The model and options an ordinary answer is drafted with.

    Routed exactly as the API's prewarm routes it, so the check looks for
    the model a question would actually load, at the context it would ask for.
    """
    from backend.core.analyzer import get_task_analyzer
    from backend.models_layer.router import get_model_router

    router = get_model_router()
    decision = await router.route(get_task_analyzer().conversation_profile(), stage="drafting")
    if not decision.selected_model:
        return None, {}
    descriptor = await router.resolve_descriptor(decision)
    return descriptor, router.generation_options(descriptor.id, stage="drafting")


async def prewarm_drafting_model(descriptor: ModelDescriptor, options: dict[str, Any]) -> Any:
    """Load the drafting model with the call the API's prewarm makes.

    Same system prompt, same prompt, same options with one output token: the
    runtime reloads a model whose context differs from the one it holds, and
    a warm-up that loaded a different window would be spent twice.
    """
    from backend.models_layer.client import get_inference_client
    from backend.models_layer.router import get_model_router

    config = get_config()
    return await get_inference_client().generate(
        model=descriptor.provider_model,
        system=config.system_prompt("reasoning"),
        prompt=config.prompt("task.converse", prompt="hello"),
        options={**options, "num_predict": 1},
        serving=get_model_router().serving_options(descriptor.id),
    )


def _resident_entry(resident: list[dict[str, Any]], provider_model: str) -> dict[str, Any] | None:
    for entry in resident:
        if provider_model in {entry.get("model"), entry.get("name")}:
            return entry
    return None


async def check_drafting_resident(
    descriptor: ModelDescriptor | None, options: dict[str, Any]
) -> Check:
    from backend.models_layer.manager import get_model_manager

    if descriptor is None:
        return Check("drafting_model_resident", False, "no eligible drafting model")
    resident = await get_model_manager().resident_models()
    entry = _resident_entry(resident, descriptor.provider_model)
    expected = options.get("num_ctx")
    names = [str(item.get("model") or item.get("name")) for item in resident]
    data = {"model": descriptor.id, "resident": names, "expected_context": expected}
    if entry is None:
        return Check("drafting_model_resident", False, f"{descriptor.id} is not loaded", data)
    context = entry.get("context_length")
    data["context"] = context
    data["expires_at"] = entry.get("expires_at")
    # Older runtimes do not report the window; residency is then all that
    # can be read, and the detail says the window was not.
    if isinstance(context, int) and expected and context != int(expected):
        return Check(
            "drafting_model_resident",
            False,
            f"{descriptor.id} is loaded at {context} tokens; a question asks for {expected}, "
            "so the first one would reload it",
            data,
        )
    shown = f"{context} tokens" if isinstance(context, int) else "context not reported"
    return Check("drafting_model_resident", True, f"{descriptor.id} loaded ({shown})", data)


def check_free_memory(threshold_mb: int | None = None) -> Check:
    threshold = int(threshold_mb if threshold_mb is not None else min_free_mb())
    try:
        memory = psutil.virtual_memory()
        available = int(memory.available) // (1024 * 1024)
        total = int(memory.total) // (1024 * 1024)
    except Exception:
        return Check("free_memory_ok", False, "memory not measurable")
    ok = available >= threshold
    detail = f"{available} MB free of {total} MB (threshold {threshold} MB)"
    if not ok:
        detail += ": below threshold, the host is likely to swap"
    return Check(
        "free_memory_ok", ok, detail,
        {"available_mb": available, "total_mb": total, "threshold_mb": threshold},
    )


def check_audit_chain() -> Check:
    from backend.core.audit import get_audit_log

    chain = get_audit_log().verify_chain()
    detail = f"{chain.events} events verified" if chain.valid else f"chain broken at {chain.broken_at}"
    return Check("audit_chain_valid", bool(chain.valid), detail)


# -- vision cache ------------------------------------------------------------
def demo_sample() -> Path | None:
    """The sample file whose vision reading should already be cached, if any."""
    sample_id = str(_settings().get("vision_sample") or "").strip()
    demo = get_config().settings.raw.get("demo") or {}
    if not sample_id or not demo.get("enabled", False):
        return None
    relative = (demo.get("samples") or {}).get(sample_id)
    if not relative:
        return None
    path = Path(str(relative))
    path = path if path.is_absolute() else PROJECT_ROOT / path
    return path if path.is_file() else None


def vision_cache_directory() -> Path | None:
    settings = get_config().settings.get("vision_cache") or {}
    if not settings.get("enabled", True):
        return None
    path = Path(str(settings.get("path") or "vision-cache"))
    return path if path.is_absolute() else get_config().settings.storage_root / path


# Rendered page hashes per (sample, size, mtime): rendering a scan costs a
# second or two, and /api/ready is polled.
_page_hashes: dict[tuple[str, int, int], list[tuple[int, str]]] = {}


def _sample_page_hashes(path: Path) -> list[tuple[int, str]]:
    """(page number, SHA-256 of the rendered page) for each page a run reads by vision.

    Rendered by the same function, at the same size, as a run renders them,
    so the hashes are the ones in the cache key -- or the key does not
    match and the cache is reported cold, which is what a run would find.
    """
    from backend.agents.vision_cache import file_sha256
    from backend.rag.parsing import inspect_pdf_pages, rasterize_pdf

    stat = path.stat()
    memo = (str(path), stat.st_size, stat.st_mtime_ns)
    if memo in _page_hashes:
        return _page_hashes[memo]
    numbers = [page.number for page in inspect_pdf_pages(path) if page.needs_vision]
    hashes: list[tuple[int, str]] = []
    if numbers:
        with tempfile.TemporaryDirectory(prefix="aegis-ready-") as scratch:
            rendered = rasterize_pdf(path, Path(scratch), page_numbers=numbers)
            hashes = [(number, file_sha256(image)) for number, image in zip(numbers, rendered)]
    _page_hashes.clear()
    _page_hashes[memo] = hashes
    return hashes


def check_vision_cache(snapshot: Any) -> Check:
    """Every page batch of the demo scan has a cached reading for an installed vision model.

    The key is rebuilt exactly as a run builds it (rendered page hashes,
    batching, prompt, system prompt, prompts version, the weights' digest),
    so a prompt edit or a re-pulled model after the warm-up run shows here
    as cold, which is what the next run would find.
    """
    from backend.agents.orchestrator import PDF_PAGES_PER_BATCH, page_batch_prompt
    from backend.agents.vision_cache import CacheIdentity, VisionCache, _sha

    sample = demo_sample()
    if sample is None:
        return Check("vision_cache_warm", None, "no demo sample configured")
    directory = vision_cache_directory()
    if directory is None:
        return Check("vision_cache_warm", False, "the vision cache is disabled")
    if sample.suffix.lower() != ".pdf":
        return Check("vision_cache_warm", None, "only a scanned PDF sample can be checked")
    try:
        pages = _sample_page_hashes(sample)
    except Exception as exc:  # an unreadable sample is reported, not raised
        return Check("vision_cache_warm", False, f"sample not renderable: {type(exc).__name__}")
    if not pages:
        return Check("vision_cache_warm", None, "the sample has no page that needs vision")

    config = get_config()
    system_sha = _sha(config.system_prompt("vision"))
    version = config.prompts.get("prompts_version")
    batches = [pages[offset:offset + PDF_PAGES_PER_BATCH] for offset in range(0, len(pages), PDF_PAGES_PER_BATCH)]
    cache = VisionCache(directory)
    vision_models = [
        model for model in snapshot.models
        if model.role == ModelRole.VISION and model.available and model.actual_digest
    ]
    best: tuple[str, int] | None = None
    for model in vision_models:
        hits = 0
        for batch in batches:
            prompt = page_batch_prompt(config, sample.name, [number for number, _ in batch])
            ident = CacheIdentity(
                image_sha256=tuple(sha for _, sha in batch),
                model_digest=str(model.actual_digest),
                prompts_version=version,
                system_sha256=system_sha,
                prompt_sha256=_sha(prompt),
            )
            if cache.get(ident) is not None:
                hits += 1
        if best is None or hits > best[1]:
            best = (model.id, hits)
    if best is None:
        return Check("vision_cache_warm", False, "no installed vision model with a digest")
    model_id, hits = best
    ok = hits == len(batches)
    detail = f"{hits}/{len(batches)} page batch(es) of {sample.name} cached for {model_id}"
    return Check("vision_cache_warm", ok, detail, {"model": model_id, "hits": hits, "batches": len(batches)})


# -- the whole reading -------------------------------------------------------
async def evaluate(*, force_registry: bool = False, min_free: int | None = None) -> Readiness:
    """Take every reading. Blocking ones run on worker threads."""
    inference, snapshot = await check_inference(force=force_registry)
    checks = [inference, check_pinned(snapshot)]
    if snapshot.provider_reachable:
        try:
            descriptor, options = await drafting_model()
        except Exception:
            descriptor, options = None, {}
        checks.append(await check_drafting_resident(descriptor, options))
    else:
        checks.append(Check("drafting_model_resident", False, "not measured: inference server unreachable"))
    memory, chain, vision = await asyncio.gather(
        asyncio.to_thread(check_free_memory, min_free),
        asyncio.to_thread(check_audit_chain),
        asyncio.to_thread(check_vision_cache, snapshot),
    )
    checks.extend([memory, chain, vision])
    return Readiness(checks=checks, checked_at=time.monotonic())


_last: Readiness | None = None


async def cached_evaluate() -> Readiness:
    """``evaluate`` behind a short cache, for an unauthenticated endpoint.

    Verifying the audit chain re-hashes the whole log; without this a probe
    or anyone who can reach the port could make the API do that in a loop.
    """
    global _last
    ttl = float(_settings().get("cache_seconds", 5))
    if _last is not None and time.monotonic() - _last.checked_at < ttl:
        return _last
    _last = await evaluate()
    return _last
