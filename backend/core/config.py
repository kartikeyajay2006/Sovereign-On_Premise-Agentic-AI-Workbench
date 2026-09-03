"""Configuration loading for the Sovereign Workbench.

Every tunable in this platform lives in YAML under ``config/`` and
``policies/``. This module loads those files once, validates their shape, and
exposes them as typed settings. Environment variables prefixed ``SOVEREIGN_``
override any value (``__`` denotes nesting), which is how deployment-specific
values are supplied without editing the repository.

Nothing in this package should ever inline a model name, a policy decision, a
prompt, a limit, or a path.
"""

from __future__ import annotations

import os
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = PROJECT_ROOT / "config"
POLICY_DIR = PROJECT_ROOT / "policies"

ENV_PREFIX = "SOVEREIGN_"
ENV_NESTING_DELIMITER = "__"


class ConfigError(RuntimeError):
    """Raised when configuration is missing or structurally invalid."""


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ConfigError(f"Required configuration file is missing: {path}")
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    except yaml.YAMLError as exc:  # pragma: no cover - surfaced at boot
        raise ConfigError(f"Invalid YAML in {path}: {exc}") from exc
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ConfigError(f"Configuration root must be a mapping: {path}")
    return data


def _coerce(raw: str) -> Any:
    """Convert an environment string into the most specific literal it fits."""
    lowered = raw.strip().lower()
    if lowered in {"true", "yes", "on"}:
        return True
    if lowered in {"false", "no", "off"}:
        return False
    if lowered in {"null", "none", ""}:
        return None
    try:
        return int(raw)
    except ValueError:
        pass
    try:
        return float(raw)
    except ValueError:
        pass
    if raw.startswith("[") or raw.startswith("{"):
        try:
            return yaml.safe_load(raw)
        except yaml.YAMLError:
            return raw
    return raw


def _apply_env_overrides(data: dict[str, Any]) -> dict[str, Any]:
    """Overlay ``SOVEREIGN_*`` environment variables onto a config mapping."""
    for env_key, env_value in os.environ.items():
        if not env_key.startswith(ENV_PREFIX):
            continue
        path = env_key[len(ENV_PREFIX) :].lower().split(ENV_NESTING_DELIMITER)
        if not path or not path[0]:
            continue
        cursor: dict[str, Any] = data
        for segment in path[:-1]:
            existing = cursor.get(segment)
            if not isinstance(existing, dict):
                existing = {}
                cursor[segment] = existing
            cursor = existing
        cursor[path[-1]] = _coerce(env_value)
    return data


class Settings:
    """Typed accessor over ``config/app.yaml`` plus environment overrides."""

    def __init__(self, raw: dict[str, Any]) -> None:
        self._raw = raw

    # -- section accessors -------------------------------------------------
    @property
    def raw(self) -> dict[str, Any]:
        return self._raw

    def section(self, name: str) -> dict[str, Any]:
        value = self._raw.get(name)
        if not isinstance(value, dict):
            raise ConfigError(f"Missing configuration section: {name}")
        return value

    def get(self, dotted: str, default: Any = None) -> Any:
        cursor: Any = self._raw
        for part in dotted.split("."):
            if not isinstance(cursor, dict) or part not in cursor:
                return default
            cursor = cursor[part]
        return cursor

    @property
    def app(self) -> dict[str, Any]:
        return self.section("app")

    @property
    def storage(self) -> dict[str, Any]:
        return self.section("storage")

    @property
    def inference(self) -> dict[str, Any]:
        return self.section("inference")

    @property
    def knowledge_base(self) -> dict[str, Any]:
        return self.section("knowledge_base")

    @property
    def sandbox(self) -> dict[str, Any]:
        return self.section("sandbox")

    @property
    def agent(self) -> dict[str, Any]:
        return self.section("agent")

    @property
    def sovereignty(self) -> dict[str, Any]:
        return self.section("sovereignty")

    @property
    def audit(self) -> dict[str, Any]:
        return self.section("audit")

    @property
    def security(self) -> dict[str, Any]:
        return self.section("security")

    # -- path helpers ------------------------------------------------------
    def path(self, storage_key: str) -> Path:
        """Resolve a storage path from config, relative to the project root."""
        value = self.storage.get(storage_key)
        if value is None:
            raise ConfigError(f"Unknown storage path key: {storage_key}")
        candidate = Path(str(value))
        return candidate if candidate.is_absolute() else PROJECT_ROOT / candidate

    @property
    def storage_root(self) -> Path:
        return self.path("root")

    def ensure_directories(self) -> None:
        """Create every configured storage directory if it does not exist."""
        for key in ("root", "uploads", "deliverables", "index", "logs", "workspaces"):
            if key in self.storage:
                self.path(key).mkdir(parents=True, exist_ok=True)
        self.path("database").parent.mkdir(parents=True, exist_ok=True)


class ConfigBundle:
    """All declarative configuration, loaded once and shared."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.settings = Settings(_apply_env_overrides(_read_yaml(CONFIG_DIR / "app.yaml")))
        self.models = _read_yaml(CONFIG_DIR / "models.yaml")
        self.routing = _read_yaml(CONFIG_DIR / "routing.yaml")
        self.classification = _read_yaml(CONFIG_DIR / "classification.yaml")
        self.prompts = _read_yaml(CONFIG_DIR / "prompts" / "prompts.yaml")
        self.access_control = _read_yaml(POLICY_DIR / "access-control.yaml")
        self.tool_permissions = _read_yaml(POLICY_DIR / "tool-permissions.yaml")
        self.data_classification = _read_yaml(POLICY_DIR / "data-classification.yaml")
        self.approval_rules = _read_yaml(POLICY_DIR / "approval-rules.yaml")
        self._validate()

    def _validate(self) -> None:
        if not self.models.get("models"):
            raise ConfigError("config/models.yaml declares no models")
        if not self.routing.get("rules"):
            raise ConfigError("config/routing.yaml declares no routing rules")
        if not self.data_classification.get("levels"):
            raise ConfigError("policies/data-classification.yaml declares no levels")
        if not self.access_control.get("roles"):
            raise ConfigError("policies/access-control.yaml declares no roles")

        known_roles = set(self.access_control["roles"])
        for tool_name, tool in (self.tool_permissions.get("tools") or {}).items():
            unknown = set(tool.get("allowed_roles") or []) - known_roles
            if unknown:
                raise ConfigError(
                    f"Tool '{tool_name}' grants unknown roles: {sorted(unknown)}"
                )

        level_ids = {level["id"] for level in self.data_classification["levels"]}
        for model in self.models["models"]:
            unknown = set(model.get("approved_classifications") or []) - level_ids
            if unknown:
                raise ConfigError(
                    f"Model '{model.get('id')}' approved for unknown "
                    f"classifications: {sorted(unknown)}"
                )

    # -- derived views -----------------------------------------------------
    def classification_levels(self) -> dict[str, dict[str, Any]]:
        return {level["id"]: level for level in self.data_classification["levels"]}

    def classification_rank(self, level_id: str) -> int:
        level = self.classification_levels().get(level_id)
        if level is None:
            raise ConfigError(f"Unknown data classification: {level_id}")
        return int(level["rank"])

    def role_permissions(self, role: str) -> set[str]:
        """Resolve a role's permissions, following ``inherits`` chains."""
        roles = self.access_control["roles"]
        seen: set[str] = set()
        permissions: set[str] = set()
        cursor: str | None = role
        while cursor and cursor not in seen:
            seen.add(cursor)
            definition = roles.get(cursor)
            if definition is None:
                raise ConfigError(f"Unknown role: {cursor}")
            permissions.update(definition.get("permissions") or [])
            cursor = definition.get("inherits")
        return permissions

    def role_max_classification(self, role: str) -> str:
        roles = self.access_control["roles"]
        seen: set[str] = set()
        cursor: str | None = role
        best = "normal"
        best_rank = -1
        while cursor and cursor not in seen:
            seen.add(cursor)
            definition = roles.get(cursor)
            if definition is None:
                raise ConfigError(f"Unknown role: {cursor}")
            candidate = definition.get("max_data_classification")
            if candidate:
                rank = self.classification_rank(candidate)
                if rank > best_rank:
                    best, best_rank = candidate, rank
            cursor = definition.get("inherits")
        return best

    def prompt(self, dotted_key: str, **values: Any) -> str:
        """Render a prompt template from ``config/prompts/prompts.yaml``."""
        cursor: Any = self.prompts
        for part in dotted_key.split("."):
            if not isinstance(cursor, dict) or part not in cursor:
                raise ConfigError(f"Unknown prompt template: {dotted_key}")
            cursor = cursor[part]
        if not isinstance(cursor, str):
            raise ConfigError(f"Prompt template is not a string: {dotted_key}")
        if not values:
            return cursor
        try:
            return cursor.format(**values)
        except KeyError as exc:
            raise ConfigError(
                f"Prompt '{dotted_key}' requires missing placeholder {exc}"
            ) from exc

    def system_prompt(self, name: str) -> str:
        """Render a system prompt, injecting the shared base preamble."""
        system = self.prompts.get("system") or {}
        base = system.get("base", "")
        template = system.get(name)
        if template is None:
            raise ConfigError(f"Unknown system prompt: {name}")
        return template.format(base=base).strip()

    def reload(self) -> None:
        """Re-read every configuration file (used by the admin API)."""
        with self._lock:
            fresh = ConfigBundle()
            self.__dict__.update(
                {k: v for k, v in fresh.__dict__.items() if k != "_lock"}
            )


@lru_cache(maxsize=1)
def get_config() -> ConfigBundle:
    """Process-wide configuration singleton."""
    return ConfigBundle()


def get_settings() -> Settings:
    return get_config().settings
