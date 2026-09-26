"""What a run ran on, as recorded while it ran.

A certificate that names a model says which *name* answered; a name can be
re-pulled to different weights, a policy file edited, a formula changed. This
module gathers the provenance that pins those down -- model digests, the
configuration and policy the run was governed by, what the egress monitor and
the sandbox measured, and which formula sources computed its figures -- from
records that already exist: the audit log, the run's tool calls and its
calculation records.

Nothing here is read from the host at certificate time and presented as if it
described the run. A fact that was not recorded while the run happened is
reported as not recorded, with the reason, never filled in from the present.
The audit-derived part is a pure function of the log, so verification can
recompute it from the log and see whether the certificate still agrees.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Iterable

import yaml

from backend.core.config import CONFIG_DIR, POLICY_DIR, PROJECT_ROOT
from backend.core.schemas import Task

#: Audit action that records the configuration a run started under.
CONFIG_SNAPSHOT_ACTION = "config_snapshot"
#: Tools whose output carries a sandbox execution.
SANDBOX_TOOLS = ("python_exec", "spreadsheet_analyze")

# The version key each governed file declares, where it declares one.
_VERSION_KEYS = ("policy_version", "prompts_version", "routing_version", "registry_version",
                 "classification_version")


def _files() -> list[Path]:
    return sorted(
        [*CONFIG_DIR.glob("*.yaml"), *(CONFIG_DIR / "prompts").glob("*.yaml"), *POLICY_DIR.glob("*.yaml")]
    )


def config_snapshot() -> dict[str, Any]:
    """Hash every governing config and policy file, and read its declared version.

    Taken when a run starts (api/task_service.py) and written to the audit
    log, so the certificate issued later reports the files the run was
    actually governed by, not whatever is on disk when someone asks.
    """
    files: dict[str, str] = {}
    versions: dict[str, dict[str, Any]] = {}
    for path in _files():
        raw = path.read_bytes()
        name = path.relative_to(PROJECT_ROOT).as_posix()
        files[name] = hashlib.sha256(raw).hexdigest()
        try:
            data = yaml.safe_load(raw) or {}
        except yaml.YAMLError:
            data = {}
        declared = {key: data[key] for key in _VERSION_KEYS if isinstance(data, dict) and key in data}
        if declared:
            versions[name] = declared
    policy_versions = {
        name: entry["policy_version"] for name, entry in versions.items() if "policy_version" in entry
    }
    prompts_file = (CONFIG_DIR / "prompts" / "prompts.yaml").relative_to(PROJECT_ROOT).as_posix()
    return {
        "files": files,
        "versions": versions,
        "policy_versions": policy_versions,
        "prompt_library": {
            "file": prompts_file,
            "version": (versions.get(prompts_file) or {}).get("prompts_version"),
            "sha256": files.get(prompts_file),
        },
    }


def from_audit(task_id: str, records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """The provenance the audit log holds for one run.

    A pure function of the records, so a verifier holding the log recomputes
    it and compares: a certificate edited to name another digest, or a log
    rewritten to match one, disagrees here.
    """
    models: dict[str, dict[str, Any]] = {}
    config: dict[str, Any] | None = None
    egress: dict[str, Any] | None = None
    for record in records:
        if record.get("task_id") != task_id:
            continue
        category, action = record.get("category"), str(record.get("action") or "")
        detail = record.get("detail") or {}
        if category == "model" and action in ("inference_started", "vision_cache_hit"):
            model = str(detail.get("model") or "unknown")
            entry = models.setdefault(model, {
                "model": model, "digests": [], "integrity": None, "stages": [],
                "inferences": 0, "cache_hits": 0,
            })
            digest = detail.get("model_digest")
            if digest and digest not in entry["digests"]:
                entry["digests"].append(digest)
            if detail.get("integrity"):
                entry["integrity"] = detail["integrity"]
            stage = detail.get("stage")
            if stage and stage not in entry["stages"]:
                entry["stages"].append(stage)
            entry["inferences" if action == "inference_started" else "cache_hits"] += 1
        elif category == "proof" and action == CONFIG_SNAPSHOT_ACTION and config is None:
            config = {**detail, "recorded": "when the run started"}
        elif category == "task" and action.startswith("finished:") and "egress" in detail:
            egress = detail["egress"]

    for entry in models.values():
        if not entry["digests"]:
            # An inference audited before digests were recorded, or by a
            # runtime that reported none: said, not guessed from the registry.
            entry["digest_note"] = "no digest was recorded when this model ran"
    return {
        "models": sorted(models.values(), key=lambda item: item["model"]),
        "config": config or {
            "recorded": None,
            "reason": "no configuration snapshot was recorded for this run "
                      "(it ran outside the task worker, or before snapshots existed)",
        },
        "egress_monitor": egress or {
            "unapproved_connections_observed": None,
            "reason": "the run's finishing record carries no egress reading",
        },
    }


def _sandbox(task: Task) -> dict[str, Any]:
    executions: list[dict[str, Any]] = []
    for call in task.tool_calls:
        if call.tool not in SANDBOX_TOOLS:
            continue
        result = call.output.get("result") if isinstance(call.output, dict) else None
        limits = call.output.get("limits") if isinstance(call.output, dict) else None
        entry: dict[str, Any] = {"tool": call.tool, "call_id": call.id, "policy_decision": str(
            getattr(call.policy_decision, "value", call.policy_decision))}
        if not isinstance(result, dict):
            # Denied by policy, or a record from before results were kept.
            entry.update({"ran": False, "note": "no sandbox result was recorded for this call"})
        else:
            entry.update({
                # Static validation or host refusal stops code before a process
                # exists; an exit code is what shows a process ran.
                "ran": result.get("exit_code") is not None or bool(result.get("timed_out")),
                "ok": result.get("ok"),
                "exit_code": result.get("exit_code"),
                "timed_out": result.get("timed_out"),
                "duration_ms": result.get("duration_ms"),
                "static_validation_passed": result.get("static_validation_passed"),
                "network_attempts_blocked": result.get("network_attempts_blocked"),
                "memory_limit_mb": result.get("memory_limit_mb"),
            })
        entry["limits"] = limits if isinstance(limits, dict) else None
        if entry["limits"] is None:
            entry["limits_note"] = "the applied limits were not recorded for this call"
        executions.append(entry)
    blocked = [e["network_attempts_blocked"] for e in executions
               if isinstance(e.get("network_attempts_blocked"), int)]
    return {
        "executions": executions,
        "network_attempts_blocked": sum(blocked) if blocked else None,
        "scope": "sandbox executions made through the run's tools; the verifier's "
                 "own recomputation runs are not recorded per run and are not listed",
    }


def _formulas(task: Task) -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    for record in task.calculations:
        key = f"{record.formula_id}@{record.formula_version}"
        seen.setdefault(key, {"formula": record.formula_id, "version": record.formula_version,
                              "source_sha256": record.formula_hash})
    return sorted(seen.values(), key=lambda item: (item["formula"], item["version"]))


def run_provenance(task: Task, records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Everything the certificate states about what the run ran on."""
    audited = from_audit(task.id, records)
    sandbox = _sandbox(task)
    config = audited["config"]
    return {
        "models": audited["models"],
        "config": config,
        "policy_versions": config.get("policy_versions"),
        "prompt_library": config.get("prompt_library"),
        "egress": {
            "monitor": audited["egress_monitor"],
            "sandbox_network_attempts_blocked": sandbox["network_attempts_blocked"],
        },
        "sandbox": sandbox,
        "formulas": _formulas(task),
    }
