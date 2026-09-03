"""Local tool suite and policy-checked dispatch.

Every tool the agent can call is registered here with an explicit signature and
a matching entry in ``policies/tool-permissions.yaml``. Dispatch always runs
the policy gateway first: an unregistered tool, an unauthorised role, or a
classification breach is refused before any work happens, and the refusal is
recorded as a :class:`ToolCall` with a DENY decision so the timeline shows what
was blocked rather than silently omitting it.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from backend.core.config import get_config
from backend.core.schemas import (
    EvidenceItem,
    PolicyDecision,
    Sensitivity,
    StoredFile,
    ToolCall,
    User,
)
from backend.policy.gateway import get_policy_gateway
from backend.rag.knowledge_base import get_knowledge_base
from backend.rag.parsing import ParsingError, parse_document
from backend.tools.deliverables import get_deliverable_engine
from backend.tools.sandbox import get_sandbox

ToolHandler = Callable[..., Awaitable[dict[str, Any]]]


@dataclass
class ToolContext:
    """Everything a tool needs about the run it is part of."""

    user: User
    task_id: str
    sensitivity: Sensitivity
    files: list[StoredFile]
    workspace: Path


@dataclass
class RegisteredTool:
    name: str
    description: str
    parameters: dict[str, str]
    handler: ToolHandler


class ToolRegistry:
    """Registry + dispatcher for the local tool suite."""

    def __init__(self) -> None:
        self.config = get_config()
        self.gateway = get_policy_gateway()
        self.knowledge_base = get_knowledge_base()
        self.sandbox = get_sandbox()
        self.deliverables = get_deliverable_engine()
        self._tools: dict[str, RegisteredTool] = {}
        self._register_builtin_tools()

    # -- registration ------------------------------------------------------
    def register(
        self, name: str, description: str, parameters: dict[str, str], handler: ToolHandler
    ) -> None:
        self._tools[name] = RegisteredTool(
            name=name, description=description, parameters=parameters, handler=handler
        )

    def describe(self) -> list[dict[str, Any]]:
        """Tool catalogue for the planner prompt and the UI."""
        declared = self.config.tool_permissions.get("tools") or {}
        catalogue: list[dict[str, Any]] = []
        for name, tool in sorted(self._tools.items()):
            policy = declared.get(name) or {}
            catalogue.append(
                {
                    "name": name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                    "allowed_roles": policy.get("allowed_roles", []),
                    "side_effects": policy.get("side_effects", "unknown"),
                    "max_data_classification": policy.get("max_data_classification"),
                    "registered_in_policy": bool(policy),
                }
            )
        return catalogue

    def available_for(self, user: User, sensitivity: Sensitivity) -> list[str]:
        """Tool names this user may actually invoke on this classification."""
        allowed: list[str] = []
        for name in sorted(self._tools):
            event = self.gateway.check_tool(user, name, sensitivity=sensitivity)
            if event.decision == PolicyDecision.ALLOW:
                allowed.append(name)
        return allowed

    # -- dispatch ----------------------------------------------------------
    async def invoke(
        self, name: str, arguments: dict[str, Any], context: ToolContext
    ) -> ToolCall:
        started_at = datetime.now(timezone.utc)
        started = time.perf_counter()

        policy_event = self.gateway.check_tool(
            context.user,
            name,
            sensitivity=context.sensitivity,
            task_id=context.task_id,
            arguments=arguments,
        )
        if policy_event.decision != PolicyDecision.ALLOW:
            return ToolCall(
                id=str(uuid.uuid4()),
                tool=name,
                arguments=arguments,
                ok=False,
                output_summary=f"Blocked by policy: {policy_event.reason}",
                output={"policy_rule": policy_event.rule},
                error=policy_event.reason,
                started_at=started_at,
                duration_ms=int((time.perf_counter() - started) * 1000),
                policy_decision=policy_event.decision,
            )

        tool = self._tools.get(name)
        if tool is None:
            return ToolCall(
                id=str(uuid.uuid4()),
                tool=name,
                arguments=arguments,
                ok=False,
                output_summary=f"Unknown tool '{name}'",
                output={},
                error=f"Tool '{name}' is not implemented",
                started_at=started_at,
                duration_ms=int((time.perf_counter() - started) * 1000),
                policy_decision=PolicyDecision.DENY,
            )

        try:
            result = await tool.handler(arguments, context)
            ok = bool(result.pop("__ok__", True))
            summary = str(result.pop("__summary__", "completed"))
            error = result.pop("__error__", None)
        except Exception as exc:  # tool failures are data, not crashes
            return ToolCall(
                id=str(uuid.uuid4()),
                tool=name,
                arguments=arguments,
                ok=False,
                output_summary=f"{name} failed: {exc}",
                output={},
                error=str(exc),
                started_at=started_at,
                duration_ms=int((time.perf_counter() - started) * 1000),
                policy_decision=PolicyDecision.ALLOW,
            )

        return ToolCall(
            id=str(uuid.uuid4()),
            tool=name,
            arguments=arguments,
            ok=ok,
            output_summary=summary,
            output=result,
            error=error,
            started_at=started_at,
            duration_ms=int((time.perf_counter() - started) * 1000),
            policy_decision=PolicyDecision.ALLOW,
        )

    # -- built-in tools ----------------------------------------------------
    def _register_builtin_tools(self) -> None:
        self.register(
            "knowledge_search",
            "Search the organisation's approved local knowledge base (SOPs, manuals, "
            "reports) and return cited passages.",
            {"query": "what to search for", "top_k": "optional result count"},
            self._knowledge_search,
        )
        self.register(
            "file_read",
            "Read and parse an attached document into text, preserving page and "
            "section locations.",
            {"file_id": "id of an attached file", "max_chars": "optional truncation"},
            self._file_read,
        )
        self.register(
            "python_exec",
            "Execute Python in the secure offline sandbox and return stdout, stderr "
            "and exit status.",
            {"code": "python source to run"},
            self._python_exec,
        )
        self.register(
            "spreadsheet_analyze",
            "Load an attached CSV/XLSX and summarise its structure, columns and "
            "basic statistics.",
            {"file_id": "id of an attached spreadsheet"},
            self._spreadsheet_analyze,
        )
        self.register(
            "document_generate",
            "Render a verified DOCX/XLSX/PPTX/MD deliverable with evidence citations "
            "and a provenance block.",
            {"format": "docx|xlsx|pptx|md", "content": "structured document content"},
            self._document_generate,
        )

    # -- tool implementations ---------------------------------------------
    async def _knowledge_search(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> dict[str, Any]:
        query = str(arguments.get("query") or "").strip()
        if not query:
            return {"__ok__": False, "__summary__": "no query supplied", "__error__": "query is required"}

        departments = None
        overrides = self.config.access_control.get("file_access", {}).get("override_roles", [])
        if context.user.role not in overrides:
            departments = [context.user.department, "general"]

        results, mode, took_ms = await self.knowledge_base.search(
            query, top_k=arguments.get("top_k"), departments=departments
        )
        # Never hand back evidence above the user's clearance.
        permitted = [
            item
            for item in results
            if self.config.classification_rank(item.classification.value)
            <= self.config.classification_rank(context.user.max_data_classification.value)
        ]
        return {
            "__summary__": (
                f"{len(permitted)} passage(s) retrieved via {mode} search in {took_ms}ms"
                if permitted
                else "no matching local evidence found"
            ),
            "mode": mode,
            "took_ms": took_ms,
            "results": [item.model_dump(mode="json") for item in permitted],
            "evidence": [item.model_dump(mode="json") for item in permitted],
        }

    async def _file_read(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> dict[str, Any]:
        file_id = str(arguments.get("file_id") or "")
        stored = next((f for f in context.files if f.id == file_id), None)
        if stored is None and context.files:
            stored = context.files[0]
        if stored is None:
            return {
                "__ok__": False,
                "__summary__": "no attachment available to read",
                "__error__": "file_id did not match any attached file",
            }

        access = self.gateway.check_file_access(context.user, stored, task_id=context.task_id)
        if access.decision != PolicyDecision.ALLOW:
            return {"__ok__": False, "__summary__": access.reason, "__error__": access.reason}

        path = Path(stored.stored_path)
        confinement = self.gateway.check_path_confinement(path, user=context.user)
        if confinement.decision != PolicyDecision.ALLOW:
            return {
                "__ok__": False,
                "__summary__": confinement.reason,
                "__error__": confinement.reason,
            }

        try:
            parsed = parse_document(path)
        except ParsingError as exc:
            return {"__ok__": False, "__summary__": str(exc), "__error__": str(exc)}

        max_chars = int(arguments.get("max_chars") or 12000)
        text = parsed.full_text[:max_chars]
        return {
            "__summary__": (
                f"read '{stored.filename}' ({parsed.parser}, {len(parsed.segments)} "
                f"segment(s), {len(parsed.full_text)} chars)"
            ),
            "filename": stored.filename,
            "parser": parsed.parser,
            "page_count": parsed.page_count,
            "warnings": parsed.warnings,
            "text": text,
            "truncated": len(parsed.full_text) > max_chars,
            "evidence": [
                EvidenceItem(
                    id=f"F{index}",
                    source_document=stored.filename,
                    document_id=stored.id,
                    location=segment.location,
                    excerpt=segment.text[:800],
                    classification=stored.classification,
                    kind="uploaded_file",
                ).model_dump(mode="json")
                for index, segment in enumerate(parsed.segments[:6], start=1)
            ],
        }

    async def _python_exec(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> dict[str, Any]:
        code = str(arguments.get("code") or "")
        if not code.strip():
            return {"__ok__": False, "__summary__": "no code supplied", "__error__": "code is required"}

        input_files: dict[str, Path] = {}
        for stored in context.files:
            path = Path(stored.stored_path)
            if path.exists() and path.suffix.lower() in {".csv", ".xlsx", ".xls", ".json", ".txt"}:
                input_files[stored.filename] = path

        result = self.sandbox.execute(code, input_files=input_files)
        summary = (
            f"sandbox exit {result.exit_code} in {result.duration_ms}ms"
            if result.static_validation_passed
            else f"rejected by static validation ({len(result.static_violations)} violation(s))"
        )
        return {
            "__ok__": result.ok,
            "__summary__": summary,
            "__error__": None if result.ok else (result.stderr[:500] or "execution failed"),
            "result": result.model_dump(mode="json"),
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
            "code": code,
        }

    async def _spreadsheet_analyze(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> dict[str, Any]:
        file_id = str(arguments.get("file_id") or "")
        stored = next((f for f in context.files if f.id == file_id), None)
        if stored is None:
            stored = next(
                (
                    f
                    for f in context.files
                    if Path(f.filename).suffix.lower() in {".csv", ".xlsx", ".xls"}
                ),
                None,
            )
        if stored is None:
            return {
                "__ok__": False,
                "__summary__": "no spreadsheet attached",
                "__error__": "no CSV/XLSX attachment found",
            }

        access = self.gateway.check_file_access(context.user, stored, task_id=context.task_id)
        if access.decision != PolicyDecision.ALLOW:
            return {"__ok__": False, "__summary__": access.reason, "__error__": access.reason}

        # Analysis runs inside the sandbox, not in the API process.
        code = (
            "import pandas as pd\n"
            f"path = {Path(stored.filename).name!r}\n"
            "df = pd.read_csv(path) if path.lower().endswith('.csv') "
            "else pd.read_excel(path)\n"
            "print('ROWS:', len(df))\n"
            "print('COLUMNS:', list(df.columns))\n"
            "print()\n"
            "print('HEAD:')\n"
            "print(df.head(10).to_string())\n"
            "print()\n"
            "numeric = df.select_dtypes('number')\n"
            "if not numeric.empty:\n"
            "    print('NUMERIC SUMMARY:')\n"
            "    print(numeric.describe().to_string())\n"
        )
        result = self.sandbox.execute(code, input_files={stored.filename: Path(stored.stored_path)})
        return {
            "__ok__": result.ok,
            "__summary__": (
                f"analysed '{stored.filename}' in sandbox ({result.duration_ms}ms)"
                if result.ok
                else f"spreadsheet analysis failed: {result.stderr[:160]}"
            ),
            "__error__": None if result.ok else result.stderr[:500],
            "filename": stored.filename,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }

    async def _document_generate(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> dict[str, Any]:
        fmt = str(arguments.get("format") or "docx").lower()
        content = arguments.get("content") or {}
        if not isinstance(content, dict) or not content:
            return {
                "__ok__": False,
                "__summary__": "no document content supplied",
                "__error__": "content must be a non-empty object",
            }

        evidence_payload = arguments.get("evidence") or []
        evidence = [
            item if isinstance(item, EvidenceItem) else EvidenceItem(**item)
            for item in evidence_payload
        ]

        deliverable = self.deliverables.render(
            fmt,
            task_id=context.task_id,
            content=content,
            evidence=evidence,
            routing=arguments.get("routing") or [],
            verification=arguments.get("verification"),
            author=context.user.display_name,
            calculations=arguments.get("calculations"),
            tables=arguments.get("tables"),
        )
        return {
            "__summary__": (
                f"generated {deliverable.format.upper()} deliverable "
                f"'{deliverable.filename}' ({deliverable.size_bytes} bytes)"
            ),
            "deliverable": deliverable.model_dump(mode="json"),
        }


_registry: ToolRegistry | None = None


def get_tool_registry() -> ToolRegistry:
    global _registry
    if _registry is None:
        _registry = ToolRegistry()
    return _registry
