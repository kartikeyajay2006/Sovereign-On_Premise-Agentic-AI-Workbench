# 11.3 · Approvals and deliverables

## `GET /api/approvals` · `approval.read`

Tasks with `status: "awaiting_approval"`, each with its `approval` record:

```json
"approval": {
  "required": true,
  "reasons": [
    "classification_raised: Evidence S5 (ENG-DBM-2104) is restricted, so the run is restricted too.",
    "sensitive_classification: Sensitive or restricted work always needs an approving authority."
  ],
  "approver_roles": ["administrator", "reviewer"],
  "decision": "pending",
  "reviewer_id": null, "reviewer_name": null, "comment": null, "decided_at": null
}
```

## `POST /api/tasks/{id}/approve` · `approval.decide`

```json
{ "decision": "approve", "comment": "Severity per SOP-MNT-022 §4.1; approver per SOP-INS-014 §5.2." }
```

`decision` is `approve` or `reject`. **200** with the task, now `delivered` or `rejected`.

**400** when:

| Detail | Why |
|---|---|
| *This task is not awaiting approval* | Already decided, or never held |
| *Role '…' is not an approving authority for this task (requires one of: …)* | Your role is not among the approver roles |
| *You ran this task, so you cannot approve or reject it. A different account holding approval.decide must decide it.* | Separation of duties |

Emits `task.approval_decided`; audits `approval / approved` or `approval / rejected`.

### Example: a reviewer releases a held run

```bash
RTOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"reviewer","password":"workbench"}' | jq -r .token)

curl -s http://127.0.0.1:8000/api/approvals -H "Authorization: Bearer $RTOKEN" \
  | jq '.[] | {id, prompt, reasons: .approval.reasons}'

curl -s -X POST http://127.0.0.1:8000/api/tasks/$ID/approve \
  -H "Authorization: Bearer $RTOKEN" -H 'content-type: application/json' \
  -d '{"decision":"approve","comment":"Checked against the cited clauses."}' | jq .status
```

## `GET /api/deliverables/{task_id}/{filename}`

The document, as a file download.

| Check, in order | Failure |
|---|---|
| The task exists | 404 |
| You own it, or hold `deliverable.download.all` | 403 *You are not entitled to this deliverable* |
| The filename is one of its deliverables | 404 |
| It is released, or you hold `approval.decide` | 403 *This deliverable is held pending human approval and has not been released.* |
| The path is inside the deliverable store | 403 |
| The file still exists | **410** *recorded for this task but is no longer in deliverable storage. Re-run the task to regenerate it.* |

A successful download is audited as `deliverable / downloaded`. The deliverable's recorded SHA-256 is on the task (`deliverables[].sha256`), so you can check the bytes yourself:

```bash
curl -s -o note.docx http://127.0.0.1:8000/api/deliverables/$ID/Approval_Note.docx -H "Authorization: Bearer $RTOKEN"
sha256sum note.docx
curl -s http://127.0.0.1:8000/api/tasks/$ID -H "Authorization: Bearer $RTOKEN" | jq -r '.deliverables[0].sha256'
```

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 11.2 · Files and tasks](02-files-tasks.md) | [↑ 11 · API reference](README.md) | [11.4 · Skills and harnesses →](04-skills-harnesses.md) |

<!-- nav:end -->
