"""Industrial task analyzer.

Converts an unstructured request plus its attachments into a structured
execution profile: input type, task type, complexity, data sensitivity, the
capabilities the work needs, the agent's step budget, and whether retrieval,
vision, code execution or a deliverable are involved.

Every signal, pattern and weight is declared in ``config/classification.yaml``.
This module contains the scoring machinery, never the domain vocabulary — an
operator tunes classification by editing YAML, not Python.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

from backend.core.config import get_config
from backend.core.schemas import (
    ClassificationSignal,
    Complexity,
    InputType,
    Sensitivity,
    StoredFile,
    TaskProfile,
    TaskType,
)

# Deliverable formats recognised in a request, mapped to the engine's writers.
DELIVERABLE_HINTS: dict[str, tuple[str, ...]] = {
    "docx": ("docx", "word", "approval note", "memo", "letter", "note"),
    "xlsx": ("xlsx", "excel", "spreadsheet", "workbook"),
    "pptx": ("pptx", "powerpoint", "presentation", "slide", "board pack", "deck"),
    "md": ("markdown", "md file"),
}


class TaskAnalyzer:
    """Rule-driven classifier producing a :class:`TaskProfile`."""

    def __init__(self) -> None:
        self.config = get_config()

    @property
    def rules(self) -> dict[str, Any]:
        return self.config.classification

    # -- scoring helpers ---------------------------------------------------
    @staticmethod
    def _score_patterns(text: str, patterns: Iterable[dict[str, Any]]) -> tuple[float, list[str]]:
        score = 0.0
        matched: list[str] = []
        for entry in patterns or []:
            phrase = str(entry.get("match", "")).lower()
            if phrase and phrase in text:
                score += float(entry.get("weight", 1))
                matched.append(phrase)
        return score, matched

    def _best_class(
        self,
        text: str,
        section: dict[str, Any],
        extra_signals: dict[str, bool] | None = None,
    ) -> tuple[str, float, list[ClassificationSignal]]:
        classes = section.get("classes") or {}
        default = str(section.get("default", "unknown"))
        signals: list[ClassificationSignal] = []
        best_name, best_score = default, 0.0

        for name, definition in classes.items():
            score, matched = self._score_patterns(text, definition.get("patterns"))
            for signal_name, weight in (definition.get("signals") or {}).items():
                if (extra_signals or {}).get(signal_name):
                    score += float(weight)
                    matched.append(f"signal:{signal_name}")
            if score > 0:
                signals.append(
                    ClassificationSignal(
                        dimension="", value=name, score=round(score, 2), matched=matched
                    )
                )
            if score > best_score:
                best_name, best_score = name, score

        return best_name, best_score, signals

    # -- dimension: input type --------------------------------------------
    def _classify_input_type(
        self, text: str, files: list[StoredFile]
    ) -> tuple[InputType, list[ClassificationSignal]]:
        section = self.rules.get("input_types", {})
        by_extension: dict[str, list[str]] = section.get("by_extension", {})
        signals: list[ClassificationSignal] = []

        detected: list[str] = []
        for stored in files:
            suffix = Path(stored.filename).suffix.lower()
            for type_name, extensions in by_extension.items():
                if suffix in [ext.lower() for ext in extensions]:
                    detected.append(type_name)
                    break

        if not detected:
            base = str(section.get("default", InputType.TEXT.value))
        elif len(set(detected)) > 1:
            base = str(section.get("multi_input_type", InputType.MULTIMODAL.value))
        else:
            base = detected[0]

        signals.append(
            ClassificationSignal(
                dimension="input_type",
                value=base,
                score=float(len(detected)),
                matched=[f.filename for f in files][:5] or ["no attachments"],
            )
        )

        # Prompt hints can specialise a broad type (image -> p&id, pdf -> scanned).
        for refinement in section.get("refinements", []) or []:
            if base not in (refinement.get("from") or []):
                continue
            score, matched = self._score_patterns(
                text, [{"match": p, "weight": refinement.get("weight", 1)}
                       for p in refinement.get("patterns", [])]
            )
            if score > 0:
                base = str(refinement["to"])
                signals.append(
                    ClassificationSignal(
                        dimension="input_type",
                        value=base,
                        score=round(score, 2),
                        matched=matched,
                    )
                )
                break

        try:
            return InputType(base), signals
        except ValueError:
            return InputType.TEXT, signals

    # -- dimension: task type ---------------------------------------------
    def _classify_task_type(self, text: str) -> tuple[TaskType, float, list[ClassificationSignal]]:
        section = self.rules.get("task_types", {})
        name, score, signals = self._best_class(text, section)
        for signal in signals:
            signal.dimension = "task_type"
        try:
            return TaskType(name), score, signals
        except ValueError:
            return TaskType.QUESTION_ANSWERING, score, signals

    # -- dimension: complexity --------------------------------------------
    def _classify_complexity(
        self, text: str, extra_signals: dict[str, bool]
    ) -> tuple[Complexity, list[ClassificationSignal]]:
        section = self.rules.get("complexity", {})
        name, _score, signals = self._best_class(text, section, extra_signals)
        for signal in signals:
            signal.dimension = "complexity"
        try:
            return Complexity(name), signals
        except ValueError:
            return Complexity.SIMPLE, signals

    # -- dimension: sensitivity -------------------------------------------
    def _classify_sensitivity(
        self, text: str, files: list[StoredFile]
    ) -> tuple[Sensitivity, list[ClassificationSignal]]:
        section = self.rules.get("sensitivity", {})
        name, _score, signals = self._best_class(text, section)
        for signal in signals:
            signal.dimension = "sensitivity"

        sensitivity = Sensitivity(name) if name in Sensitivity._value2member_map_ else Sensitivity.NORMAL

        # A task inherits the highest classification of its source documents
        # (policies/data-classification.yaml escalation rule).
        for stored in files:
            if self.config.classification_rank(stored.classification.value) > (
                self.config.classification_rank(sensitivity.value)
            ):
                sensitivity = stored.classification
                signals.append(
                    ClassificationSignal(
                        dimension="sensitivity",
                        value=sensitivity.value,
                        score=0.0,
                        matched=[f"inherited from {stored.filename}"],
                    )
                )
        return sensitivity, signals

    # -- retrieval ---------------------------------------------------------
    def _requires_retrieval(self, text: str, task_type: TaskType) -> tuple[bool, list[str]]:
        section = self.rules.get("retrieval", {})
        reasons: list[str] = []
        if task_type.value in (section.get("always_for_task_types") or []):
            reasons.append(f"task type '{task_type.value}' always retrieves local context")
        matched = [
            phrase
            for phrase in (section.get("trigger_patterns") or [])
            if str(phrase).lower() in text
        ]
        if matched:
            reasons.append("request references local knowledge: " + ", ".join(matched[:3]))
        return bool(reasons), reasons

    # -- deliverable -------------------------------------------------------
    def _deliverable(
        self, text: str, task_type: TaskType, requested_format: str | None
    ) -> tuple[bool, str | None, list[str]]:
        reasons: list[str] = []
        if requested_format:
            wanted = requested_format.strip().lower()
            # 'answer' is the interface's way of saying "just tell me" — it is a
            # sentinel, not a file type. Treating it as one made every plain
            # question draft a whole structured document it then failed to
            # render, which cost about 56 seconds a run and left deliverable
            # records pointing at files that were never written.
            if wanted in {"answer", "none", "text", ""}:
                return False, None, ["caller asked for an answer, not a document"]
            return True, wanted, [f"caller requested a {wanted} deliverable"]

        classes = (self.rules.get("task_types", {}).get("classes") or {})
        produces = bool((classes.get(task_type.value) or {}).get("produces_deliverable"))

        chosen: str | None = None
        for fmt, hints in DELIVERABLE_HINTS.items():
            for hint in hints:
                if hint in text:
                    chosen = fmt
                    reasons.append(f"request mentions '{hint}' -> {fmt}")
                    break
            if chosen:
                break

        if chosen:
            return True, chosen, reasons
        if produces:
            default_format = "docx" if task_type == TaskType.DOCUMENT_GENERATION else None
            if default_format:
                reasons.append(f"task type '{task_type.value}' produces a deliverable")
                return True, default_format, reasons
            return task_type == TaskType.CODING, None, reasons
        return False, None, reasons

    def _requires_code(self, task_type: TaskType, files: list[StoredFile]) -> bool:
        """Whether this task warrants writing and running a script.

        Generating code is among the slowest stages, so it is reserved for
        requests that actually need a program: an explicit coding request, or
        analysis over a data file. Figures asserted in prose are recomputed by
        the verification engine either way.
        """
        rules = self.rules.get("code_execution") or {}
        if task_type.value in (rules.get("always_for_task_types") or []):
            return True

        if task_type.value in (rules.get("for_task_types_with_data") or []):
            extensions = {
                str(item).lower() for item in (rules.get("data_file_extensions") or [])
            }
            return any(
                Path(stored.filename).suffix.lower() in extensions for stored in files
            )
        return False

    # -- public API --------------------------------------------------------
    def analyze(
        self,
        prompt: str,
        files: list[StoredFile] | None = None,
        *,
        requested_format: str | None = None,
    ) -> TaskProfile:
        files = files or []
        text = prompt.lower().strip()

        input_type, input_signals = self._classify_input_type(text, files)
        task_type, task_score, task_signals = self._classify_task_type(text)
        sensitivity, sensitivity_signals = self._classify_sensitivity(text, files)

        visual_types = {
            InputType.IMAGE,
            InputType.SCANNED_PDF,
            InputType.DRAWING,
            InputType.PID_DIAGRAM,
        }
        requires_vision = input_type in visual_types or (
            input_type == InputType.MULTIMODAL
            and any(
                Path(f.filename).suffix.lower()
                in [e.lower() for e in (self.rules["input_types"]["by_extension"].get("image") or [])]
                for f in files
            )
        )
        if requires_vision and task_type == TaskType.QUESTION_ANSWERING:
            task_type = TaskType.VISION_ANALYSIS

        requires_retrieval, retrieval_reasons = self._requires_retrieval(text, task_type)
        produces_deliverable, deliverable_format, deliverable_reasons = self._deliverable(
            text, task_type, requested_format
        )
        requires_code = self._requires_code(task_type, files)

        complexity, complexity_signals = self._classify_complexity(
            text,
            {
                "multiple_files": len(files) > 1,
                "deliverable_required": produces_deliverable,
                "visual_input": requires_vision,
                "retrieval_required": requires_retrieval,
            },
        )

        budgets = self.rules.get("complexity", {}).get("step_budget", {})
        step_budget = int(
            budgets.get(complexity.value, self.config.settings.agent.get("default_step_budget", 8))
        )
        step_budget = min(step_budget, int(self.config.settings.agent.get("max_step_budget", 20)))

        capability_map = self.rules.get("capability_map", {})
        capabilities: list[str] = []
        if requires_vision:
            capabilities.extend(capability_map.get("visual_input", []))
        if requires_code:
            capabilities.extend(capability_map.get("code_task", []))
        if requires_retrieval:
            capabilities.extend(capability_map.get("retrieval_task", []))
        if not capabilities:
            capabilities.extend(capability_map.get("reasoning_task", ["reasoning"]))
        capabilities = sorted(set(capabilities))

        # Confidence: how decisively the task-type patterns fired. A weak
        # signal raises the approval bar via approval-rules.yaml.
        confidence = min(1.0, round(task_score / 8.0, 2)) if task_score else 0.15
        if files:
            confidence = min(1.0, confidence + 0.15)

        reasons = [
            f"input type '{input_type.value}' from "
            + (f"{len(files)} attachment(s)" if files else "prompt only"),
            f"task type '{task_type.value}' (pattern score {task_score:g})",
            f"complexity '{complexity.value}' -> step budget {step_budget}",
            f"data classification '{sensitivity.value}'",
        ]
        reasons.extend(retrieval_reasons)
        reasons.extend(deliverable_reasons)

        return TaskProfile(
            input_type=input_type,
            task_type=task_type,
            complexity=complexity,
            sensitivity=sensitivity,
            confidence=confidence,
            step_budget=step_budget,
            requires_retrieval=requires_retrieval,
            requires_vision=requires_vision,
            requires_code_execution=requires_code,
            produces_deliverable=produces_deliverable,
            deliverable_format=deliverable_format,
            required_capabilities=capabilities,
            signals=[*input_signals, *task_signals, *complexity_signals, *sensitivity_signals],
            reasons=reasons,
        )


_analyzer: TaskAnalyzer | None = None


def get_task_analyzer() -> TaskAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = TaskAnalyzer()
    return _analyzer
