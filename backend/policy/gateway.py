"""Security and policy gateway.

Every consequential action passes through here first: which user, which file,
which model, which tool, which classification. The gateway answers ALLOW,
DENY or REQUIRE_APPROVAL and records the basis of that answer to the audit
trail. Default is deny — a capability that is not explicitly granted in
``policies/`` does not exist.

The gateway decides *whether*; the sandbox limits *blast radius*. Neither
substitutes for the other.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.core.audit import get_audit_log
from backend.core.config import get_config
from backend.core.schemas import (
    PolicyDecision,
    PolicyEvent,
    Sensitivity,
    StoredFile,
    TaskProfile,
    User,
)


class PolicyViolation(RuntimeError):
    """Raised when a denied action is attempted anyway."""

    def __init__(self, event: PolicyEvent) -> None:
        super().__init__(event.reason)
        self.event = event


class PolicyGateway:
    """Config-driven RBAC/ABAC enforcement with a default-deny posture."""

    def __init__(self) -> None:
        self.config = get_config()
        self.audit = get_audit_log()

    # -- helpers -----------------------------------------------------------
    def _event(
        self,
        *,
        subject: str,
        action: str,
        decision: PolicyDecision,
        reason: str,
        rule: str | None,
        user: User | None,
        task_id: str | None,
        detail: dict[str, Any] | None = None,
    ) -> PolicyEvent:
        event = PolicyEvent(
            subject=subject,
            action=action,
            decision=decision,
            reason=reason,
            rule=rule,
            at=datetime.now(timezone.utc),
        )
        self.audit.record(
            category="policy",
            action=f"{action}:{decision.value}",
            actor=user.username if user else "system",
            actor_role=user.role if user else None,
            task_id=task_id,
            detail={"subject": subject, "reason": reason, "rule": rule, **(detail or {})},
        )
        return event

    def _rank(self, level: Sensitivity | str) -> int:
        value = level.value if isinstance(level, Sensitivity) else str(level)
        return self.config.classification_rank(value)

    @property
    def hard_denied_actions(self) -> list[str]:
        return list(self.config.tool_permissions.get("hard_denied_actions", []))

    # -- checks ------------------------------------------------------------
    def check_permission(
        self, user: User, permission: str, *, task_id: str | None = None
    ) -> PolicyEvent:
        """Does this role hold this permission (following inheritance)?"""
        granted = permission in self.config.role_permissions(user.role)
        return self._event(
            subject=f"user:{user.username}",
            action=f"permission.{permission}",
            decision=PolicyDecision.ALLOW if granted else PolicyDecision.DENY,
            reason=(
                f"role '{user.role}' grants '{permission}'"
                if granted
                else f"role '{user.role}' does not grant '{permission}' (default deny)"
            ),
            rule="access-control.yaml:roles",
            user=user,
            task_id=task_id,
        )

    def check_hard_denied(self, action: str, *, user: User | None = None) -> PolicyEvent:
        """Actions no role may ever perform, with no override path."""
        denied = action in self.hard_denied_actions
        return self._event(
            subject=f"action:{action}",
            action=action,
            decision=PolicyDecision.DENY if denied else PolicyDecision.ALLOW,
            reason=(
                f"'{action}' is unconditionally denied on this platform"
                if denied
                else f"'{action}' is not on the hard-deny list"
            ),
            rule="tool-permissions.yaml:hard_denied_actions",
            user=user,
            task_id=None,
        )

    def check_file_access(
        self, user: User, stored: StoredFile, *, task_id: str | None = None
    ) -> PolicyEvent:
        """May this user read this document?"""
        rules = self.config.access_control.get("file_access", {})
        subject = f"file:{stored.filename}"

        if rules.get("owner_always_allowed", True) and stored.owner_id == user.id:
            return self._event(
                subject=subject,
                action="file.read",
                decision=PolicyDecision.ALLOW,
                reason="user owns this document",
                rule="access-control.yaml:file_access.owner_always_allowed",
                user=user,
                task_id=task_id,
            )

        if self._rank(stored.classification) > self._rank(user.max_data_classification):
            return self._event(
                subject=subject,
                action="file.read",
                decision=PolicyDecision.DENY,
                reason=(
                    f"document is classified '{stored.classification.value}' but role "
                    f"'{user.role}' is cleared only to "
                    f"'{user.max_data_classification.value}'"
                ),
                rule="access-control.yaml:roles.max_data_classification",
                user=user,
                task_id=task_id,
            )

        if user.role in (rules.get("override_roles") or []):
            return self._event(
                subject=subject,
                action="file.read",
                decision=PolicyDecision.ALLOW,
                reason=f"role '{user.role}' has cross-department read authority",
                rule="access-control.yaml:file_access.override_roles",
                user=user,
                task_id=task_id,
            )

        if rules.get("department_isolation", True) and stored.department != user.department:
            return self._event(
                subject=subject,
                action="file.read",
                decision=PolicyDecision.DENY,
                reason=(
                    f"document belongs to department '{stored.department}'; user is in "
                    f"'{user.department}' and department isolation is enforced"
                ),
                rule="access-control.yaml:file_access.department_isolation",
                user=user,
                task_id=task_id,
            )

        return self._event(
            subject=subject,
            action="file.read",
            decision=PolicyDecision.ALLOW,
            reason="department and classification checks passed",
            rule="access-control.yaml:file_access",
            user=user,
            task_id=task_id,
        )

    def check_tool(
        self,
        user: User,
        tool: str,
        *,
        sensitivity: Sensitivity,
        task_id: str | None = None,
        arguments: dict[str, Any] | None = None,
    ) -> PolicyEvent:
        """May this user invoke this tool on data of this classification?"""
        tools = self.config.tool_permissions.get("tools") or {}
        defaults = self.config.tool_permissions.get("defaults") or {}
        subject = f"tool:{tool}"

        definition = tools.get(tool)
        if definition is None:
            allow_unregistered = bool(defaults.get("allow_unregistered_tools", False))
            return self._event(
                subject=subject,
                action="tool.invoke",
                decision=PolicyDecision.ALLOW if allow_unregistered else PolicyDecision.DENY,
                reason=(
                    f"tool '{tool}' is not registered in tool-permissions.yaml "
                    "(default deny)"
                ),
                rule="tool-permissions.yaml:defaults.allow_unregistered_tools",
                user=user,
                task_id=task_id,
                detail={"arguments": arguments or {}},
            )

        if user.role not in (definition.get("allowed_roles") or []):
            return self._event(
                subject=subject,
                action="tool.invoke",
                decision=PolicyDecision.DENY,
                reason=(
                    f"tool '{tool}' is not granted to role '{user.role}'"
                ),
                rule=f"tool-permissions.yaml:tools.{tool}.allowed_roles",
                user=user,
                task_id=task_id,
            )

        ceiling = definition.get("max_data_classification")
        if ceiling and self._rank(sensitivity) > self._rank(ceiling):
            return self._event(
                subject=subject,
                action="tool.invoke",
                decision=PolicyDecision.DENY,
                reason=(
                    f"tool '{tool}' is approved up to '{ceiling}' data but this task "
                    f"is classified '{sensitivity.value}'"
                ),
                rule=f"tool-permissions.yaml:tools.{tool}.max_data_classification",
                user=user,
                task_id=task_id,
            )

        if definition.get("requires_approval"):
            return self._event(
                subject=subject,
                action="tool.invoke",
                decision=PolicyDecision.REQUIRE_APPROVAL,
                reason=f"tool '{tool}' requires human approval before execution",
                rule=f"tool-permissions.yaml:tools.{tool}.requires_approval",
                user=user,
                task_id=task_id,
            )

        return self._event(
            subject=subject,
            action="tool.invoke",
            decision=PolicyDecision.ALLOW,
            reason=(
                f"role '{user.role}' may invoke '{tool}' on "
                f"'{sensitivity.value}' data"
            ),
            rule=f"tool-permissions.yaml:tools.{tool}",
            user=user,
            task_id=task_id,
        )

    def check_model(
        self,
        user: User,
        model_id: str,
        *,
        approved_classifications: list[Sensitivity],
        registered: bool,
        sensitivity: Sensitivity,
        task_id: str | None = None,
    ) -> PolicyEvent:
        """May this model process data of this classification?"""
        subject = f"model:{model_id}"
        if not registered:
            return self._event(
                subject=subject,
                action="model.invoke",
                decision=PolicyDecision.DENY,
                reason=(
                    f"model '{model_id}' is not declared in config/models.yaml; "
                    "unregistered models are denied by default"
                ),
                rule="tool-permissions.yaml:hard_denied_actions.unregistered_model_use",
                user=user,
                task_id=task_id,
            )
        if sensitivity not in approved_classifications:
            return self._event(
                subject=subject,
                action="model.invoke",
                decision=PolicyDecision.DENY,
                reason=(
                    f"model '{model_id}' is not approved for "
                    f"'{sensitivity.value}' data"
                ),
                rule="models.yaml:approved_classifications",
                user=user,
                task_id=task_id,
            )
        return self._event(
            subject=subject,
            action="model.invoke",
            decision=PolicyDecision.ALLOW,
            reason=(
                f"model '{model_id}' is registered and approved for "
                f"'{sensitivity.value}' data"
            ),
            rule="models.yaml:approved_classifications",
            user=user,
            task_id=task_id,
        )

    def check_path_confinement(self, candidate: Path, *, user: User | None = None) -> PolicyEvent:
        """Reject any path outside the workbench storage root."""
        root = self.config.settings.storage_root.resolve()
        try:
            resolved = candidate.resolve()
            confined = resolved == root or root in resolved.parents
        except OSError:
            confined = False
        return self._event(
            subject=f"path:{candidate}",
            action="filesystem.access",
            decision=PolicyDecision.ALLOW if confined else PolicyDecision.DENY,
            reason=(
                "path is inside the workbench storage root"
                if confined
                else f"path escapes the storage root ({root}); host filesystem access is denied"
            ),
            rule="tool-permissions.yaml:hard_denied_actions.host_filesystem_access",
            user=user,
            task_id=None,
        )

    # -- approval ----------------------------------------------------------
    def approval_requirement(
        self,
        profile: TaskProfile,
        *,
        prompt: str,
        verification_valid: bool | None = None,
    ) -> tuple[bool, list[str], list[str]]:
        """Evaluate approval-rules.yaml; return (required, reasons, approver_roles)."""
        required = False
        reasons: list[str] = []
        approvers: set[str] = set()
        lowered = prompt.lower()

        for rule in self.config.approval_rules.get("approval_required_when", []):
            match = rule.get("match") or {}
            hit = False

            # Some gates exist to control what leaves the workbench. A task
            # that produces no artifact releases nothing, so those gates have
            # nothing to hold and are skipped.
            if rule.get("requires_deliverable") and not profile.produces_deliverable:
                continue

            if "sensitivity_in" in match:
                hit = profile.sensitivity.value in match["sensitivity_in"]
            elif "produces_deliverable" in match:
                hit = profile.produces_deliverable == bool(match["produces_deliverable"])
            elif "verification_valid" in match:
                hit = (
                    verification_valid is not None
                    and verification_valid == bool(match["verification_valid"])
                )
            elif "classification_confidence_below" in match:
                hit = profile.confidence < float(match["classification_confidence_below"])
            elif "prompt_contains_any" in match:
                hit = any(str(term).lower() in lowered for term in match["prompt_contains_any"])

            if hit:
                required = True
                reasons.append(f"{rule.get('name')}: {rule.get('description', '')}".strip())
                approvers.update(rule.get("approver_roles") or [])

        # A rule must not nominate a role that cannot act on it. Listing a
        # role here while access-control.yaml withholds 'approval.decide' from
        # it produced tasks addressed to someone the API then refused, leaving
        # them held with nobody able to release them.
        able = {
            role
            for role in approvers
            if "approval.decide" in self.config.role_permissions(role)
        }
        if approvers and not able:
            able = {
                role
                for role in self.config.access_control.get("roles", {})
                if "approval.decide" in self.config.role_permissions(role)
            }

        return required, reasons, sorted(able)

    def controls_for(self, sensitivity: Sensitivity) -> dict[str, Any]:
        """The control set a classification level demands."""
        level = self.config.classification_levels().get(sensitivity.value) or {}
        return dict(level.get("controls") or {})


_gateway: PolicyGateway | None = None


def get_policy_gateway() -> PolicyGateway:
    global _gateway
    if _gateway is None:
        _gateway = PolicyGateway()
    return _gateway
