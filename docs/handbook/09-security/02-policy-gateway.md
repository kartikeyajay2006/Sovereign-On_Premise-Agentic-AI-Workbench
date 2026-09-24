# 9.2 · The policy gateway

`backend/policy/gateway.py` is the one place authorisation is decided. Code asks it; nothing re-implements it.

## Decisions are events

Every question returns a `PolicyEvent`:

| Field | Example |
|---|---|
| `subject` | `tool:python_exec` |
| `action` | `tool.invoke` |
| `decision` | `allow`, `deny` or `require_approval` |
| `reason` | *tool 'python_exec' is approved up to 'restricted' data but this task is classified 'normal'* … |
| `rule` | `tool-permissions.yaml:tools.python_exec.max_data_classification` |
| `user`, `task_id` | Who asked, for which run |

Every decision, **allow and deny**, is written to the audit log as `policy / <action>:<decision>`, with the rule. A denial can therefore always be traced to the exact line of policy that caused it.

## The checks

| Method | Question | Rules consulted |
|---|---|---|
| `check_permission` | May this role do this? | `access-control.yaml` roles and inheritance |
| `check_file_access` | May this person read this stored file? | `file_access`: owner, override roles, department |
| `check_tool` | May this person invoke this tool on data of this class? | `tool-permissions.yaml`: registered, `allowed_roles`, `max_data_classification`, `requires_approval` |
| `check_model` | May this model be invoked for this run? | The registry: registered and approved |
| `check_path_confinement` | Is this path inside the storage root? | Resolves symlinks and `..` first |
| `approval_requirement` | Must a person approve this run, and who? | `approval-rules.yaml` |

## The ten hard-denied actions

`policies/tool-permissions.yaml` lists actions no role may take, with no override. There is no single central check for them. Each is enforced, where it is enforced, by the mechanism that owns it:

| Action | Enforced by | Strength |
|---|---|---|
| `external_api_call` | Loopback-only inference client; sandbox socket shim | ✅ For the API's own inference and for sandboxed code |
| `internet_access` | The same | ✅ Same scope |
| `dns_resolution` | Sandbox shim (sockets refused); the monitor counts port-53 connections | ✅ In the sandbox; measured elsewhere |
| `cloud_model_inference` | Loopback-only inference client (HTTP 503 on a non-loopback URL) | ✅ |
| `credential_access` | Sandbox's scrubbed environment: no host credentials, proxies or tokens passed in | ⚠️ Partial: files readable by the API user remain readable (see [9.3](03-sandbox.md)) |
| `host_filesystem_access` | `check_path_confinement` for uploads, deliverables, reports and `file_read`; the sandbox write guard | ⚠️ Partial: sandboxed code can **read** outside its workspace |
| `privilege_escalation` | Role separation; separation of duties on approval; the sandbox runs as the API user, never higher | ✅ For roles; OS-level depends on how the API is run |
| `unregistered_model_use` | `check_model`, the registry | ✅ |
| `unregistered_tool_use` | `check_tool` (`allow_unregistered_tools: false`) | ✅ |
| `sandbox_network_egress` | Static import denial + runtime socket shim + measured attempts | ✅ |

`check_hard_denied(action)` exists in the gateway but nothing calls it today. The list is shown on the Assurance screen as *Configured*, which is accurate: it is the stated policy, and the table above is how far each item is realised.

## Default deny

| Situation | Result |
|---|---|
| A permission not granted to the role | Denied |
| A tool not in `tool-permissions.yaml` | Denied (`allow_unregistered_tools: false`) |
| A role not in a tool's `allowed_roles` | Denied |
| Data above a tool's ceiling | Denied |
| A model not in the registry | Refused |
| A model not approved for the run's class | Not eligible; if none is, the run is blocked |
| A path outside the storage root | Denied as `host_filesystem_access` |

## Policy is data

Every rule is YAML. Tightening policy (removing a tool from the operator role, lowering a model's clearance, adding an approval rule) is an edit and a restart. There is no admin screen for policy yet (`policy.read` and `system.manage` are declared for it), so policy changes go through version control, which is arguably the better place for them.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 9.1 · Access control](01-access-control.md) | [↑ 09 · Security and governance](README.md) | [9.3 · The sandbox →](03-sandbox.md) |

<!-- nav:end -->
