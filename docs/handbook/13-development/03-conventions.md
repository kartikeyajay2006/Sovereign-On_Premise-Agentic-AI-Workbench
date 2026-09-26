# 13.3 · Conventions

The codebase has a recognisable voice. Follow it; reviews will ask for it.

## Say what happened

The most important convention, in code and in the interface alike:

- A stage that did not run says it did not run (*No plan required: …*), rather than being silently absent.
- A check that could not complete is a **failed** check with its reason, never a crashed run and never a quiet pass.
- A figure the runtime did not report stays `None`. Zero is a count; `None` is the absence of one.
- A monitor that cannot observe says so, and claims nothing.
- A configured value that is not implemented is reported as such (*config requests 'gvisor', not implemented*; a requested container runtime that fails its probe is reported as *fallback: podman unavailable: …*), not echoed back as if it were.

## Comments explain *why*, with the incident

Comments here are long where a decision was learned the hard way, and they tell the story:

```python
# Clearance is applied before ranking, not after. Filtering the top k
# afterwards gave an operator three passages where an engineer got six,
# because Restricted passages had taken the other slots and were then
# removed: less context for the answer, and a count that told the
# operator something above their clearance had matched.
```

Write the measured number when there is one: *"79 seconds of a 200-second run"*, *"seven seconds reloading qwen2.5:3b"*. A future reader deciding whether to undo the change needs exactly that.

## Configuration, not code

Models, routing, classification signals, prompts, skills, harnesses, roles, tools and approval rules are YAML. Python must not name a model, embed a prompt, or hard-code a policy decision. If you need a new knob, add it to the YAML with a comment explaining it, and read it with a default.

## Model output is untrusted input

Parse it; never evaluate it. Recover numbers defensively (*"19.9 mm"*, *"about 6.2"*). Expect JSON to be malformed and have a fallback that is *said*, not silent.

## Policy through the gateway

Never check a role name in business code. Ask the gateway (`check_permission`, `check_tool`, `check_file_access`, `check_path_confinement`) and let it audit the decision.

## Everything audits

A new action that changes state, reveals data, or makes a decision writes an audit record with a category, an action and a detail object. A new stage emits events and persists the task.

## Frontend

- Screens compose `components/` and `features/`; shared primitives live in `shared/ui` and `shared/motion`.
- Use the design tokens in `globals.css`; do not introduce new hues. The brand gradient is for the mark and public pages only.
- Label claims honestly: **Measured**, **Tested**, **Configured**.
- Keyboard first: new screens get shortcuts that do not collide with the <kbd>G</kbd> sequences.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 13.2 · Testing](02-testing.md) | [↑ 13 · Development](README.md) | [13.4 · Contributing →](04-contributing.md) |

<!-- nav:end -->
