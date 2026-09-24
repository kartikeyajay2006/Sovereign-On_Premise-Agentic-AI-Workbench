"""A requested model is a request, not an override.

The composer lets a person ask for a model. These pin what the router does
with that request: it is honoured only where the same hard gates that judge
every other candidate -- installed, approved for this data, capable of this
stage -- would have let that model serve anyway, and when it is declined the
decision names the one gate that declined it, so the interface can say so
instead of quietly running something else.

Like tests/test_routing.py, these run against a synthetic registry so they
assert routing policy rather than what happens to be installed on this host.
"""

from __future__ import annotations

import pytest

from backend.core.schemas import ModelRole, Sensitivity
from backend.models_layer.registry import RegistrySnapshot
from backend.models_layer.router import ModelRouter
from tests.test_routing import FakeRegistry, analyze, descriptor, image_file

SMALL = descriptor(
    "small:3b", ModelRole.REASONING, ["text", "reasoning", "coding"], parameters_b=3.0
)
LARGE = descriptor(
    "large:8b", ModelRole.REASONING, ["text", "reasoning", "coding"], parameters_b=8.0
)
VISION = descriptor("vision:3b", ModelRole.VISION, ["vision", "ocr", "text"], parameters_b=3.0)

INVENTORY = [SMALL, LARGE, VISION]


def router_with(models) -> ModelRouter:
    return ModelRouter(registry=FakeRegistry(models))  # type: ignore[arg-type]


QUESTION = "Summarise the maintenance manual"


class TestWithoutAPreference:
    @pytest.mark.asyncio
    async def test_the_router_choice_is_unchanged_and_says_nothing_was_asked(self) -> None:
        decision = await router_with(INVENTORY).route(analyze(QUESTION), stage="drafting")
        # The smaller of two eligible models wins on the configured bonus.
        assert decision.selected_model == "small:3b"
        assert decision.preferred_model is None
        assert decision.preference_honoured is None
        assert decision.preference_reason is None

    @pytest.mark.asyncio
    async def test_a_blank_preference_is_no_preference(self) -> None:
        decision = await router_with(INVENTORY).route(
            analyze(QUESTION), stage="drafting", preferred_model="   "
        )
        assert decision.selected_model == "small:3b"
        assert decision.preferred_model is None
        assert decision.preference_honoured is None


class TestHonoured:
    @pytest.mark.asyncio
    async def test_an_eligible_model_is_used_even_when_it_is_not_the_top_scorer(self) -> None:
        router = router_with(INVENTORY)
        automatic = await router.route(analyze(QUESTION), stage="drafting")
        assert automatic.selected_model == "small:3b", "precondition: the 3B outscores the 8B"

        decision = await router.route(
            analyze(QUESTION), stage="drafting", preferred_model="large:8b"
        )
        assert decision.selected_model == "large:8b"
        assert decision.selected_display_name == "large:8b"
        assert decision.preferred_model == "large:8b"
        assert decision.preference_honoured is True
        assert decision.preference_reason is None
        assert "large:8b requested and eligible" in decision.reason
        assert "stage 'drafting'" in decision.reason

    @pytest.mark.asyncio
    async def test_honoured_under_the_configured_fallback_when_that_is_the_policy(self) -> None:
        """Judged by exactly the policy that judged everything else.

        With no coding-capable model installed, code generation applies the
        configured fallback and relaxes to a text model. A requested text
        model is then eligible, and is honoured, with the fallback reported.
        """
        text_only = [
            descriptor("plain:3b", ModelRole.REASONING, ["text", "reasoning"], parameters_b=3.0),
            descriptor("plain:8b", ModelRole.REASONING, ["text", "reasoning"], parameters_b=8.0),
        ]
        profile = analyze("Write a python script to compute corrosion rate")
        decision = await router_with(text_only).route(profile, preferred_model="plain:8b")
        assert decision.used_fallback
        assert decision.selected_model == "plain:8b"
        assert decision.preference_honoured is True


class TestDeclined:
    """Each declined request names the first gate it failed."""

    @pytest.mark.asyncio
    async def test_a_model_that_is_not_installed_falls_back_to_the_router_choice(self) -> None:
        offline_large = descriptor(
            "large:8b",
            ModelRole.REASONING,
            ["text", "reasoning", "coding"],
            parameters_b=8.0,
            available=False,
        )
        decision = await router_with([SMALL, offline_large, VISION]).route(
            analyze(QUESTION), stage="drafting", preferred_model="large:8b"
        )
        assert decision.selected_model == "small:3b"
        assert decision.preferred_model == "large:8b"
        assert decision.preference_honoured is False
        assert decision.preference_reason == (
            "large:8b is registered but not installed on this host"
        )
        assert "requested large:8b not used" in decision.reason

    @pytest.mark.asyncio
    async def test_a_model_without_the_stage_capability_is_declined_for_that_stage(self) -> None:
        """Asking for a text model cannot make it read a scan."""
        profile = analyze("Read this scanned inspection report", [image_file()])
        decision = await router_with(INVENTORY).route(
            profile,
            stage="vision_extraction",
            extra_capabilities=["vision"],
            preferred_model="large:8b",
        )
        assert decision.selected_model == "vision:3b"
        assert decision.preference_honoured is False
        assert decision.preference_reason == (
            "large:8b lacks the vision capability this stage requires"
        )

    @pytest.mark.asyncio
    async def test_the_same_request_is_honoured_for_the_stages_it_can_serve(self) -> None:
        """Per stage, not per task: declined for reading, honoured for drafting."""
        profile = analyze("Analyze this scanned report and draft an approval note", [image_file()])
        router = router_with(INVENTORY)
        reading = await router.route(
            profile, stage="vision_extraction", preferred_model="large:8b"
        )
        drafting = await router.route(profile, stage="drafting", preferred_model="large:8b")
        assert reading.preference_honoured is False
        assert reading.selected_model == "vision:3b"
        assert drafting.preference_honoured is True
        assert drafting.selected_model == "large:8b"
        # Each decision names its stage as a field, not only inside `reason`.
        assert reading.stage == "vision_extraction"
        assert drafting.stage == "drafting"

    @pytest.mark.asyncio
    async def test_a_decision_routed_without_a_stage_says_so(self) -> None:
        decision = await router_with(INVENTORY).route(analyze(QUESTION))
        assert decision.stage is None

    @pytest.mark.asyncio
    async def test_a_model_not_approved_for_the_classification_is_declined(self) -> None:
        """A request is never a way round a classification approval."""
        normal_only = descriptor(
            "large:8b",
            ModelRole.REASONING,
            ["text", "reasoning", "coding"],
            parameters_b=8.0,
            approved=[Sensitivity.NORMAL],
        )
        profile = analyze("Handle this restricted defence tender document")
        assert profile.sensitivity == Sensitivity.RESTRICTED
        decision = await router_with([SMALL, normal_only]).route(
            profile, preferred_model="large:8b"
        )
        assert decision.selected_model == "small:3b"
        assert decision.preference_honoured is False
        assert decision.preference_reason == "large:8b is not approved for restricted data"

    @pytest.mark.asyncio
    async def test_a_model_the_registry_does_not_know_is_declined(self) -> None:
        decision = await router_with(INVENTORY).route(
            analyze(QUESTION), stage="drafting", preferred_model="mystery:70b"
        )
        assert decision.selected_model == "small:3b"
        assert decision.preference_honoured is False
        assert decision.preference_reason == "mystery:70b is not in the model registry"

    @pytest.mark.asyncio
    async def test_when_nothing_is_eligible_the_request_is_recorded_as_declined(self) -> None:
        offline = [
            descriptor("small:3b", ModelRole.REASONING, ["text", "reasoning"], available=False),
        ]
        decision = await router_with(offline).route(
            analyze(QUESTION), stage="drafting", preferred_model="small:3b"
        )
        assert decision.selected_model is None
        assert decision.preferred_model == "small:3b"
        assert decision.preference_honoured is False
        assert "not installed" in (decision.preference_reason or "")
        assert "Requested small:3b was not used" in decision.reason

    @pytest.mark.asyncio
    async def test_an_unreachable_runtime_is_named_rather_than_blamed_on_the_model(self) -> None:
        class Unreachable(FakeRegistry):
            async def refresh(self, force: bool = False) -> RegistrySnapshot:
                snapshot = await super().refresh(force)
                snapshot.provider_reachable = False
                return snapshot

        offline = [
            descriptor("small:3b", ModelRole.REASONING, ["text", "reasoning"], available=False)
        ]
        router = ModelRouter(registry=Unreachable(offline))  # type: ignore[arg-type]
        decision = await router.route(
            analyze(QUESTION), stage="drafting", preferred_model="small:3b"
        )
        assert decision.selected_model is None
        assert decision.preference_reason == "the local inference server is unreachable"
