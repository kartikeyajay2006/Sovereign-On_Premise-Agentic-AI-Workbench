"""Hardware-tier profiles: SOVEREIGN_PROFILE overlays config/profiles/<name>.yaml.

Each test builds its own ConfigBundle rather than the process singleton, so
a profile chosen here cannot leak into another test.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from backend.core.config import PROFILE_DIR, PROFILE_ENV, ConfigBundle, ConfigError, deep_merge

PROFILES = sorted(path.stem for path in PROFILE_DIR.glob("*.yaml"))


def _bundle(monkeypatch: pytest.MonkeyPatch, profile: str | None) -> ConfigBundle:
    if profile is None:
        monkeypatch.delenv(PROFILE_ENV, raising=False)
    else:
        monkeypatch.setenv(PROFILE_ENV, profile)
    return ConfigBundle()


def test_the_four_tiers_ship() -> None:
    assert PROFILES == ["cpu-server", "gpu-server", "laptop-16gb", "laptop-8gb"]


def test_no_profile_means_no_change(monkeypatch: pytest.MonkeyPatch) -> None:
    base = _bundle(monkeypatch, None)
    empty = _bundle(monkeypatch, "")
    assert base.profile is None and empty.profile is None
    assert base.settings.raw == empty.settings.raw
    assert base.routing == empty.routing
    # The routing file exactly as it is on disk.
    assert base.routing == yaml.safe_load((Path(PROFILE_DIR.parent) / "routing.yaml").read_text(encoding="utf-8"))
    assert base.settings.inference["single_model_residency"] is True


@pytest.mark.parametrize("name", PROFILES)
def test_every_profile_loads_and_validates(monkeypatch: pytest.MonkeyPatch, name: str) -> None:
    bundle = _bundle(monkeypatch, name)
    assert bundle.profile == name
    assert bundle.settings.inference["keep_alive"] == "24h"
    assert int(bundle.settings.agent["worker_count"]) >= 1


def test_laptop_8gb_overlay(monkeypatch: pytest.MonkeyPatch) -> None:
    bundle = _bundle(monkeypatch, "laptop-8gb")
    inference = bundle.settings.inference
    assert inference["keep_alive"] == "24h"
    assert inference["single_model_residency"] is True
    assert inference["memory_headroom_mb"] == 1024
    assert bundle.settings.agent["worker_count"] == 1
    assert bundle.routing["stage_context_tokens"]["drafting"] == 5120
    assert bundle.routing["stage_context_tokens"]["vision_extraction"] == 8192
    # A deep merge: keys the profile does not name are the base file's.
    assert inference["base_url"] == "http://127.0.0.1:11434"
    assert inference["max_image_edge_px"] == 1100
    assert bundle.settings.agent["default_step_budget"] == 8
    assert bundle.routing["rules"], "routing rules come from routing.yaml"


def test_server_profiles_turn_off_single_residency_and_raise_budgets(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("laptop-16gb", "cpu-server", "gpu-server"):
        assert _bundle(monkeypatch, name).settings.inference["single_model_residency"] is False
    gpu = _bundle(monkeypatch, "gpu-server")
    assert gpu.routing["stage_output_tokens"]["drafting"] == 2000
    assert gpu.routing["stage_context_tokens"]["drafting"] == 8192
    assert gpu.settings.inference["max_context_tokens"] == 16384
    assert gpu.settings.agent["worker_count"] == 4


def test_an_environment_variable_still_wins_over_the_profile(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SOVEREIGN_INFERENCE__KEEP_ALIVE", "1h")
    bundle = _bundle(monkeypatch, "laptop-8gb")
    assert bundle.settings.inference["keep_alive"] == "1h"
    # And the selector itself is not written into the settings.
    assert "profile" not in bundle.settings.raw


def test_an_unknown_profile_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ConfigError, match="laptop-8gb"):
        _bundle(monkeypatch, "laptop-4gb")


def test_a_path_is_not_a_profile_name(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ConfigError, match="not a path"):
        _bundle(monkeypatch, "../app")


def test_deep_merge_replaces_lists_and_leaves_its_inputs_alone() -> None:
    base = {"a": {"b": 1, "c": [1, 2]}, "d": 1}
    overlay = {"a": {"c": [3]}, "e": {"f": 2}}
    merged = deep_merge(base, overlay)
    assert merged == {"a": {"b": 1, "c": [3]}, "d": 1, "e": {"f": 2}}
    assert base == {"a": {"b": 1, "c": [1, 2]}, "d": 1}
