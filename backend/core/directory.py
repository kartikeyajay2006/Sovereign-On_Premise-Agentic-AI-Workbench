"""The plant directory (Active Directory / LDAP): the preferred way in, not built yet.

A plant that runs a directory should not keep a second list of who works
there. Its joiners, movers and leavers are already recorded in AD, and a
workbench account that outlives its owner's AD account is exactly the kind of
gap an auditor finds. So the intended path for a production plant is: sign in
with the directory password, and take the role from directory group
membership through ``identity.directory.group_role_map`` in config/app.yaml.

This build ships the declaration and this interface, and no directory client:
an LDAP library is a dependency to vendor, review and patch on an air-gapped
host, and it is not added until a plant needs it. Until then every account is
local and provisioned through ``accounts.py``, and this module says "not
configured" wherever it is asked -- including when the config says
``enabled: true``, because a switch with nothing behind it is not a directory.
"""

from __future__ import annotations

from typing import Any, Protocol

from backend.core.config import get_config
from backend.core.schemas import DirectoryStatus


class DirectoryNotConfigured(RuntimeError):
    """Raised by any directory operation on a build without a directory client."""


class Directory(Protocol):
    """What a directory client provides when one is added.

    ``authenticate`` binds as the user and returns their attributes;
    ``groups`` lists the groups ``group_role_map`` is matched against. The
    role is decided here, on this host, from the map -- never taken from an
    attribute the directory returns as a role name.
    """

    def authenticate(self, username: str, password: str) -> dict[str, Any]: ...

    def groups(self, username: str) -> list[str]: ...


class UnconfiguredDirectory:
    """The only directory in this build. Refuses everything, and says why."""

    reason = (
        "No directory client is installed in this build. Accounts are local and "
        "provisioned by an administrator (setup, invitations, access requests)."
    )

    def authenticate(self, username: str, password: str) -> dict[str, Any]:
        raise DirectoryNotConfigured(self.reason)

    def groups(self, username: str) -> list[str]:
        raise DirectoryNotConfigured(self.reason)


def directory_settings() -> dict[str, Any]:
    section = get_config().settings.get("identity.directory", {}) or {}
    return section if isinstance(section, dict) else {}


def get_directory() -> Directory:
    return UnconfiguredDirectory()


def directory_status() -> DirectoryStatus:
    """The declaration as written, and what this build can do with it."""
    settings = directory_settings()
    enabled = bool(settings.get("enabled", False))
    detail = (
        "Enabled in config/app.yaml, but not configured: " + UnconfiguredDirectory.reason
        if enabled
        else "Not configured. " + UnconfiguredDirectory.reason
    )
    return DirectoryStatus(
        enabled=enabled,
        configured=False,
        url=str(settings.get("url") or "") or None,
        base_dn=str(settings.get("base_dn") or "") or None,
        detail=detail,
    )
