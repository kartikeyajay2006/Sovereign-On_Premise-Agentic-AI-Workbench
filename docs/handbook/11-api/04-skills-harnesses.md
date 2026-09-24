# 11.4 · Skills and harnesses

## Skills

| Method and path | Permission | Does |
|---|---|---|
| `GET /api/skills` | `task.create` | Every skill: built-in and added, with template, input hint, format, author, SHA-256 |
| `POST /api/skills` | `skill.create` | Adds a skill |
| `DELETE /api/skills/{id}` | `skill.create` (own) or `skill.manage` (any) | Deletes an added skill. **204** |

### `POST /api/skills`

```json
{
  "id": "psv-interval",
  "name": "PSV test interval",
  "summary": "The bench-test interval the SOPs set for a relief valve.",
  "input_hint": "The valve, e.g. PSV-2104A in fouling service",
  "template": "What bench-test interval do our SOPs set for {input}?",
  "deliverable_format": null
}
```

**201** with the skill and its hash. **409** *A skill named /psv-interval already exists.* **400** with the rule it broke (id pattern, lengths, the `{input}` rules). Deleting a built-in skill, or someone else's without `skill.manage`, is refused.

To **use** a skill, pass `skill_id` to `POST /api/tasks` ([11.2](02-files-tasks.md)).

## Harnesses

| Method and path | Permission | Does |
|---|---|---|
| `GET /api/harnesses` | signed in | The catalogue |
| `GET /api/harnesses/{id}` | signed in | One definition: inputs, expansion, aggregation, the child template, and its `sha256` |
| `POST /api/harnesses/{id}/preview` | signed in | Validate inputs and list the items the job would run |
| `POST /api/harness-runs` | `task.create` | Start a job. **202** |
| `GET /api/harness-runs` | signed in | Your runs, or all with `task.read.all` |
| `GET /api/harness-runs/{id}` | owner or `task.read.all` | The run: items, children, outcomes, report versions |
| `POST /api/harness-runs/{id}/cancel` | owner | Stop starting further items |
| `POST /api/harness-runs/{id}/report` | owner | Write a new report version from the children as they stand |
| `POST /api/harness-runs/{id}/report/decision` | `approval.decide` | `{"decision": "approve" \| "reject", "comment": "…"}` (comment ≤ 2,000 characters) |
| `GET /api/harness-runs/{id}/report/{md\|json}` | owner, `deliverable.download.all` | The report file, **only if it still matches its recorded hash** |

### Preview, then start

```bash
curl -s -X POST http://127.0.0.1:8000/api/harnesses/sop-question-sweep/preview \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"inputs":{"questions":["What is the external inspection interval for a vessel in corrosive service?","Within what time must a Medium severity finding be repaired?"]}}' \
  | jq '{limit, warnings, items: [.items[] | {key, prompt}]}'

# The definition's hash, which the start request must repeat:
curl -s http://127.0.0.1:8000/api/harnesses/sop-question-sweep -H "Authorization: Bearer $TOKEN" | jq -r .sha256
```

Each preview item has a `key`, an `index`, a `label` and the exact `prompt` its child run will be given. Start with the keys you approved and the definition hash you saw:

```json
{
  "harness_id": "sop-question-sweep",
  "inputs": { "questions": ["…", "…"] },
  "selected": ["<item key>", "<item key>"],
  "definition_sha256": "<the sha256 of the definition you previewed>"
}
```

If the definition changed since the preview, or no longer produces a selected item, the start is refused with **409** rather than running something else.

### Following a run

`harness.started`, `harness.child` (one per settled item), `harness.report` and `harness.finished` arrive on the event stream, or poll `GET /api/harness-runs/{id}`.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 11.3 · Approvals and deliverables](03-approvals-deliverables.md) | [↑ 11 · API reference](README.md) | [11.5 · Knowledge, sandbox, audit and sovereignty →](05-knowledge-sandbox-audit.md) |

<!-- nav:end -->
