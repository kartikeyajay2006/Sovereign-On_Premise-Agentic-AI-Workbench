# 10 · Configuration reference

> Every setting, what it does, and whether any code reads it.

AEGIS is configured by YAML, not code. Nine kinds of file, in two folders:

| File | Controls | Page |
|---|---|---|
| `config/app.yaml` | Storage, inference, knowledge base, sandbox, agent, sovereignty, audit, security | [10.1](01-app-yaml.md) |
| `config/models.yaml` | The model registry | [10.2](02-models-yaml.md) |
| `config/routing.yaml` | Routing rules, stage overrides, scoring, stage budgets | [10.3](03-routing-yaml.md) |
| `config/classification.yaml` | The analyzer's signals | [10.4](04-classification-yaml.md) |
| `config/prompts/prompts.yaml` | Every prompt | [10.5](05-prompts-skills-harnesses.md) |
| `config/skills/*.yaml`, `config/harnesses/*.yaml` | Built-in skills and harnesses | [10.5](05-prompts-skills-harnesses.md) |
| `policies/access-control.yaml` | Roles, permissions, departments, seed users, file access | [10.6](06-policies.md) |
| `policies/approval-rules.yaml` | Approval rules, verification thresholds | [10.6](06-policies.md) |
| `policies/data-classification.yaml` | Levels, controls, escalation, egress | [10.6](06-policies.md) |
| `policies/tool-permissions.yaml` | Tools, hard-denied actions | [10.6](06-policies.md) |
| Environment | `SOVEREIGN_*` overrides of `app.yaml` | [10.7](07-environment.md) |

## How configuration is loaded

- **Once, at startup.** Every file is read and validated when the API starts. A malformed file stops the boot with *Configuration error: …*. **Restart the API after any change.** The one exception is model *availability*, which is re-checked against the runtime every 30 seconds.
- **Paths are relative to the project root**, never to the directory you started from.
- **Environment overrides** apply to `app.yaml` only.

## How to read the tables

Every setting is marked:

| Mark | Meaning |
|---|---|
| ✅ | Read by the code and takes effect |
| ⚠️ | **Declared only.** Present in the file but read by no code today: changing it has no effect. Listed so no one relies on it |

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 9.6 · Threat model](../09-security/06-threat-model.md) | [↑ The AEGIS Handbook](../README.md) | [10.1 · `config/app.yaml` →](01-app-yaml.md) |

<!-- nav:end -->
