"""Task classification, model routing and verification tests.

The router is exercised against a synthetic registry rather than whatever
happens to be installed on the host, so the tests assert routing *policy* and
not the state of one machine.
"""

from __future__ import annotations

import pytest

from backend.core.analyzer import TaskAnalyzer
from backend.core.schemas import (
    Complexity,
    EvidenceItem,
    InputType,
    ModelDescriptor,
    ModelRole,
    SandboxResult,
    Sensitivity,
    StoredFile,
    TaskType,
)
from backend.models_layer.registry import RegistrySnapshot
from backend.models_layer.router import ModelRouter


# --------------------------------------------------------------- fixtures
def descriptor(
    model_id: str,
    role: ModelRole,
    capabilities: list[str],
    *,
    available: bool = True,
    parameters_b: float = 3.0,
    approved: list[Sensitivity] | None = None,
) -> ModelDescriptor:
    return ModelDescriptor(
        id=model_id,
        display_name=model_id,
        family=model_id.split(":")[0],
        role=role,
        capabilities=capabilities,
        context_window=32768,
        quantization="Q4_K_M",
        parameters_b=parameters_b,
        approved_classifications=approved
        or [
            Sensitivity.NORMAL,
            Sensitivity.CONFIDENTIAL,
            Sensitivity.SENSITIVE,
            Sensitivity.RESTRICTED,
        ],
        provider="ollama",
        provider_model=model_id,
        available=available,
    )


class FakeRegistry:
    """A registry with a fixed inventory, so routing is tested, not the host."""

    def __init__(self, models: list[ModelDescriptor]) -> None:
        self._models = models

    async def refresh(self, force: bool = False) -> RegistrySnapshot:
        return RegistrySnapshot(
            models=self._models,
            unregistered=[],
            provider_reachable=True,
            refreshed_at=0.0,
        )

    async def get(self, model_id: str) -> ModelDescriptor | None:
        return next((m for m in self._models if m.id == model_id), None)


FULL_INVENTORY = [
    descriptor("reason:8b", ModelRole.REASONING, ["text", "reasoning", "coding"], parameters_b=8.0),
    descriptor("coder:7b", ModelRole.CODING, ["text", "coding"], parameters_b=7.0),
    descriptor("vision:3b", ModelRole.VISION, ["vision", "ocr", "text"], parameters_b=3.0),
]


def analyze(prompt: str, files: list[StoredFile] | None = None):
    return TaskAnalyzer().analyze(prompt, files or [])


def image_file(name: str = "scan.png") -> StoredFile:
    from datetime import datetime, timezone

    return StoredFile(
        id="f1",
        filename=name,
        stored_path=f"/tmp/{name}",
        media_type="image/png",
        size_bytes=1,
        sha256="0" * 64,
        input_type=InputType.IMAGE,
        owner_id="u",
        department="inspection",
        uploaded_at=datetime.now(timezone.utc),
    )


# ------------------------------------------------------------- classification
class TestTaskAnalyzer:
    def test_identifies_a_coding_request(self) -> None:
        profile = analyze("Write a python script to parse this log file")
        assert profile.task_type == TaskType.CODING
        assert profile.requires_code_execution

    def test_identifies_document_generation(self) -> None:
        profile = analyze("Draft an approval note for this vessel as a word document")
        assert profile.task_type == TaskType.DOCUMENT_GENERATION
        assert profile.produces_deliverable
        assert profile.deliverable_format == "docx"

    def test_visual_input_requires_vision(self) -> None:
        profile = analyze("Read this scanned report", [image_file()])
        assert profile.requires_vision
        assert "vision" in profile.required_capabilities

    def test_scanned_hint_specialises_input_type(self) -> None:
        profile = analyze("Analyze this scanned inspection report", [image_file()])
        assert profile.input_type == InputType.SCANNED_PDF

    def test_pid_hint_specialises_input_type(self) -> None:
        profile = analyze("Check this P&ID for isolation valves", [image_file("dwg.png")])
        assert profile.input_type == InputType.PID_DIAGRAM

    def test_safety_language_raises_sensitivity(self) -> None:
        profile = analyze("Assess the safety hazard from this incident")
        assert profile.sensitivity in {Sensitivity.SENSITIVE, Sensitivity.RESTRICTED}

    def test_sop_reference_triggers_retrieval(self) -> None:
        profile = analyze("What does our SOP require for vessel inspection intervals?")
        assert profile.requires_retrieval

    def test_task_inherits_the_highest_document_classification(self) -> None:
        stored = image_file()
        stored.classification = Sensitivity.RESTRICTED
        profile = analyze("Summarise this", [stored])
        assert profile.sensitivity == Sensitivity.RESTRICTED

    def test_multi_step_language_raises_complexity(self) -> None:
        simple = analyze("What is the design pressure?")
        agentic = analyze(
            "Read the report based on our SOP and then prepare an approval note, "
            "cross-check the calculations"
        )
        assert agentic.step_budget > simple.step_budget
        assert agentic.complexity == Complexity.AGENTIC


# -------------------------------------------------------------------- routing
class TestModelRouter:
    @pytest.fixture
    def router(self) -> ModelRouter:
        return ModelRouter(registry=FakeRegistry(FULL_INVENTORY))  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_visual_input_routes_to_the_vision_model(self, router: ModelRouter) -> None:
        profile = analyze("Read this scanned inspection report", [image_file()])
        decision = await router.route(profile, stage="vision_extraction")
        assert decision.selected_model == "vision:3b"
        assert "vision" in decision.reason

    @pytest.mark.asyncio
    async def test_coding_task_routes_to_the_coding_model(self, router: ModelRouter) -> None:
        profile = analyze("Write a python script to compute corrosion rate")
        decision = await router.route(profile)
        assert decision.selected_model == "coder:7b"
        assert not decision.used_fallback

    @pytest.mark.asyncio
    async def test_planning_stage_never_demands_vision(self, router: ModelRouter) -> None:
        """A visual task still plans and drafts with the reasoning model."""
        profile = analyze("Analyze this scanned report and draft an approval note", [image_file()])
        for stage in ("planning", "drafting"):
            decision = await router.route(profile, stage=stage)
            assert decision.selected_model == "reason:8b", stage
            assert "vision" not in decision.required_capabilities, stage

    @pytest.mark.asyncio
    async def test_capable_model_serves_even_outside_its_declared_role(self) -> None:
        """Eligibility is capability-based; role only breaks ties.

        With no dedicated coding model installed, a reasoning model that
        declares the coding capability is directly eligible — no fallback
        needed.
        """
        without_coder = [m for m in FULL_INVENTORY if m.role != ModelRole.CODING]
        router = ModelRouter(registry=FakeRegistry(without_coder))  # type: ignore[arg-type]
        profile = analyze("Write a python script to compute corrosion rate")
        decision = await router.route(profile)
        assert decision.selected_model == "reason:8b"
        assert not decision.used_fallback

    @pytest.mark.asyncio
    async def test_falls_back_when_no_model_declares_the_capability(self) -> None:
        """Fallback engages only when the primary requirement is unsatisfiable.

        With no coding-capable model installed, the configured fallback relaxes
        to a text model. Generated code still has to survive the sandbox and
        code verification, so this degrades quality rather than safety.
        """
        text_only = [
            descriptor("reason:8b", ModelRole.REASONING, ["text", "reasoning"], parameters_b=8.0)
        ]
        router = ModelRouter(registry=FakeRegistry(text_only))  # type: ignore[arg-type]
        profile = analyze("Write a python script to compute corrosion rate")
        decision = await router.route(profile)
        assert decision.used_fallback
        assert decision.selected_model == "reason:8b"
        assert "fallback" in decision.reason

    @pytest.mark.asyncio
    async def test_uninstalled_models_are_never_selected(self) -> None:
        offline = [
            descriptor("vision:3b", ModelRole.VISION, ["vision"], available=False),
            descriptor("reason:8b", ModelRole.REASONING, ["text", "reasoning"]),
        ]
        router = ModelRouter(registry=FakeRegistry(offline))  # type: ignore[arg-type]
        profile = analyze("Read this scan", [image_file()])
        decision = await router.route(profile, stage="vision_extraction")
        assert decision.selected_model is None
        assert "not installed" in decision.reason

    @pytest.mark.asyncio
    async def test_model_unapproved_for_classification_is_excluded(self) -> None:
        restricted_only = [
            descriptor(
                "reason:8b",
                ModelRole.REASONING,
                ["text", "reasoning"],
                approved=[Sensitivity.NORMAL],
            )
        ]
        router = ModelRouter(registry=FakeRegistry(restricted_only))  # type: ignore[arg-type]
        profile = analyze("Handle this restricted defence tender document")
        assert profile.sensitivity == Sensitivity.RESTRICTED
        decision = await router.route(profile)
        assert decision.selected_model is None

    @pytest.mark.asyncio
    async def test_every_decision_carries_a_reason(self, router: ModelRouter) -> None:
        profile = analyze("Summarise the maintenance manual")
        decision = await router.route(profile)
        assert decision.reason
        assert decision.rule
        assert decision.candidates

    def test_context_window_is_passed_to_the_runtime(self) -> None:
        """Ollama defaults to 4096 regardless of the model, which truncates."""
        options = ModelRouter().generation_options("qwen3:8b")
        assert options.get("num_ctx", 0) > 4096


# --------------------------------------------------------------- verification
class TestVerificationEngine:
    @pytest.fixture
    def engine(self):
        from backend.agents.verifier import VerificationEngine

        return VerificationEngine()

    def test_detects_material_claims(self, engine) -> None:
        claims = engine.material_claims(
            "The corrosion rate is 0.65 mm/year. The vessel looks fine. "
            "Clause 4.4 requires a remaining life calculation."
        )
        assert len(claims) >= 2

    def test_unsupported_claims_fail_source_verification(self, engine) -> None:
        check = engine.check_sources(
            "The remaining life is 5.2 years and the shell thickness is 9.4 mm.", []
        )
        assert not check.passed

    def test_cited_claims_pass_source_verification(self, engine) -> None:
        evidence = [
            EvidenceItem(
                id="S1",
                source_document="SOP-INS-014",
                excerpt="Remaining life shall be calculated as (t_current - t_min) / rate. "
                "Where remaining life is less than 4 years the vessel is monitored.",
                classification=Sensitivity.CONFIDENTIAL,
            )
        ]
        check = engine.check_sources(
            "Remaining life is under 4 years [S1], so accelerated monitoring applies [S1].",
            evidence,
        )
        assert check.passed

    def test_recomputes_calculations_independently(self, engine) -> None:
        check, results = engine.check_calculations(
            [
                {
                    "label": "corrosion rate",
                    "expression": "(12.0 - 9.4) / 4.0",
                    "expected": 0.65,
                    "units": "mm/year",
                }
            ]
        )
        assert check.passed
        assert results[0]["matched"]
        assert results[0]["recomputed"] == pytest.approx(0.65)

    def test_catches_a_wrong_figure(self, engine) -> None:
        """A model asserting a result the arithmetic does not support must fail."""
        check, results = engine.check_calculations(
            [{"label": "rate", "expression": "(12.0 - 9.4) / 4.0", "expected": 1.5}]
        )
        assert not check.passed
        assert not results[0]["matched"]

    def test_failed_code_fails_code_verification(self, engine) -> None:
        result = SandboxResult(
            ok=False,
            exit_code=1,
            stdout="",
            stderr="Traceback: NameError",
            duration_ms=12,
            memory_limit_mb=1024,
            static_validation_passed=True,
        )
        assert not engine.check_code(result).passed

    def test_document_without_citations_fails_when_evidence_exists(self, engine) -> None:
        evidence = [
            EvidenceItem(id="S1", source_document="SOP", excerpt="text", classification=Sensitivity.NORMAL)
        ]
        check = engine.check_document(
            {
                "title": "Note",
                "sections": [{"heading": "Analysis", "body": "No references at all."}],
                "recommendation": "Proceed",
            },
            evidence,
        )
        assert not check.passed
        assert any("citation" in warning for warning in check.warnings)
