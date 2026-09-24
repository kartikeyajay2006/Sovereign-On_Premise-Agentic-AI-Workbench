# 10.6 · Policy files

Four files in `policies/`, each with `policy_version: 1`.

## `access-control.yaml`

| Key | | Meaning |
|---|:--:|---|
| `roles.<role>.description` | ✅ | Shown in the interface |
| `roles.<role>.inherits` | ✅ | Parent role, whose permissions are included |
| `roles.<role>.permissions` | ✅ | Granted permissions (see [9.1](../09-security/01-access-control.md) for which are enforced) |
| `roles.<role>.max_data_classification` | ✅ | Clearance ceiling |
| `departments[]` | ✅ | `id` and `label`: valid departments |
| `seed_users[]` | ✅ | Accounts created when the user table is empty: `username`, `display_name`, `role`, `department`. Passwords come from `security.seed_user_password` |
| `file_access.department_isolation` | ✅ | Refuse other departments' files and passages |
| `file_access.override_roles` | ✅ | Roles exempt from department isolation |
| `file_access.owner_always_allowed` | ✅ | Uploaders can always read their uploads |

## `approval-rules.yaml`

### `approval_required_when[]`

| Key | | Meaning |
|---|:--:|---|
| `name`, `description` | ✅ | Shown in the held reasons |
| `match.sensitivity_in` | ✅ | Hold when the run's class is one of these |
| `match.produces_deliverable` | ✅ | Hold when the run produces a document |
| `match.verification_valid` | ✅ | Hold when verification failed (`false`) |
| `match.classification_confidence_below` | ✅ | Hold when the analyzer's confidence is below this |
| `match.prompt_contains_any` | ✅ | Hold when the request contains any of these words |
| `requires_deliverable` | ✅ | Apply the rule only when there is something to release |
| `approver_roles` | ✅ | Who may decide |

### `verification`

See [8.4 Thresholds](../08-verification/04-thresholds.md): `material_claim_patterns`, `min_evidence_per_material_claim`, `min_supported_fraction`, `calculation_tolerance`, `code_must_exit_zero`, `max_replans`.

### `on_unverifiable`

| Key | | Meaning |
|---|:--:|---|
| `action: escalate_to_human`, `block_delivery: true`, `audit_event` | ⚠️ | Declares the fail-safe behaviour. The behaviour itself is implemented by the `verification_failure` rule above, not by reading this block |

## `data-classification.yaml`

| Key | | Meaning |
|---|:--:|---|
| `levels[].id`, `rank`, `label`, `colour`, `description` | ✅ | The four levels and their order |
| `levels[].controls.human_approval_required` | ✅ | Read by the harness service |
| `levels[].controls.evidence_required` | ⚠️ | Not read |
| `levels[].controls.retention_days` | ⚠️ | Not read: nothing is deleted after this period |
| `levels[].controls.redact_in_logs` | ⚠️ | Not read: audit records are not redacted |
| `escalation_rules` | ⚠️ | Not read. Escalation from evidence is implemented directly in the orchestrator |
| `egress.allowed_destinations`, `loopback_only`, `monitored_ports` | ⚠️ | Not read. Egress is governed by `sovereignty.allowed_cidrs` in `app.yaml` |

## `tool-permissions.yaml`

| Key | | Meaning |
|---|:--:|---|
| `defaults.allow_unregistered_tools` | ✅ | `false`: unknown tools are refused |
| `defaults.require_audit_event` | ⚠️ | Not read; every tool call is audited regardless |
| `tools.<tool>.allowed_roles` | ✅ | Who may invoke it |
| `tools.<tool>.max_data_classification` | ✅ | Its ceiling |
| `tools.<tool>.requires_approval` | ✅ | Would return `require_approval` for the invocation (none set today) |
| `tools.<tool>.side_effects`, `description` | ✅ | Shown in `GET /api/tools` |
| `tools.<tool>.constraints` | ⚠️ | `confine_to_storage_root`, `max_bytes`, `sandbox_required`, `network_allowed`, `formats`, `release_requires_approval` are descriptive; confinement and sandboxing are enforced in code regardless |
| `hard_denied_actions` | ✅ | Shown on Assurance; enforcement per action is mapped in [9.2](../09-security/02-policy-gateway.md#the-ten-hard-denied-actions) |

> [!TIP]
> When auditing a deployment, the ⚠️ rows are the ones to read twice. They describe intent, and a reviewer should not assume they are controls.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 10.5 · Prompts, skills and harnesses](05-prompts-skills-harnesses.md) | [↑ 10 · Configuration reference](README.md) | [10.7 · Environment variables →](07-environment.md) |

<!-- nav:end -->
