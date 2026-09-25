# 2.5 · Approval

Some work must not leave the workbench on the model's word. It is **held**, and a named person with the authority to decide must approve or reject it.

## When a run is held

After verification, the policy gateway evaluates the rules in `policies/approval-rules.yaml`. A run is held when **any** rule matches:

| Rule | Holds a run when | Approvers |
|---|---|---|
| `sensitive_classification` | Its classification is Sensitive or Restricted, including when it was raised by the evidence it read | reviewer, administrator |
| `released_deliverable` | It produces a document (DOCX, XLSX, PPTX or Markdown) | reviewer, administrator |
| `verification_failure` | Any verification check failed | reviewer, administrator |
| `low_confidence_classification` | The analyzer's confidence was below 0.35 **and** there is something to release | reviewer, administrator |
| `high_severity_finding` | The formula registry computed a **High** finding | head_of_inspection **then** plant_manager, two signatures (below) |
| `safety_recommendation` | The request mentions *safety*, *hazard*, *shutdown*, *incident* or *statutory* | reviewer, administrator |

Every matching rule is listed on the run, so a reviewer sees all the reasons, not just the first. When the class was raised by evidence, that reason is put first and names the evidence, because "4 of 4 checks passed" beside **Held** is otherwise puzzling.

> [!NOTE]
> The low-confidence rule only applies when a document would be released. A question that returns an answer and writes no file releases nothing, and holding it only produced a queue of items nobody could usefully approve.

## What "held" means for a deliverable

A held run's document is **rendered and hashed, but not released**. It exists in storage with its SHA-256 recorded, so the reviewer is deciding on the exact bytes that would go out. Only after approval is it marked released and downloadable by the requester.

## Who may decide

Three conditions must all hold:

1. The person has the `approval.decide` permission. Of the seeded roles, **reviewer**, **head_of_inspection**, **plant_manager** and **administrator** do.
2. Their role is one of the approver roles the matching rules named.
3. **They did not run the task themselves.**

The third is checked by account, not by role, and for every role, including the administrator. Otherwise a reviewer, who can also create tasks, could run a task and release their own deliverable, and the audit log would record a second pair of eyes that was never there.

## The decision

A reviewer **approves** or **rejects**, with an optional comment. The decision records:

| Recorded | Where |
|---|---|
| Decision, reviewer, comment, time | On the run's approval record |
| `approval / approved` or `approval / rejected`, with the deliverables released and the number of evidence items presented | The audit log |
| `task.approval_decided` | The live event stream |

Approved runs become **Delivered**, and their documents are released. Rejected runs become **Rejected**, and nothing is released.

## Two signatures for a High finding

SOP-INS-014 Clause 5.1 names the Head of Inspection + Plant Manager as the authority for a High finding. SOP-OPS-008 Clauses 2.3 and 3.5 say both sign: the Head of Inspection **recommends**, then the Plant Manager **approves**. The `signatures` list of the `high_severity_finding` rule holds this, in that order. When the rule matches, only these two roles decide the run: a general reviewer cannot release a High finding alone (SOP-OPS-008 Clause 3.1, the highest authority named applies). Their accounts are seeded as `head_of_inspection` and `plant_manager`. An install seeded before these accounts existed gains them on its next start.

- **The first signature releases nothing.** The run stays held, and the Approvals screen shows **WAITING FOR SECOND AUTHORITY** and names who signs next. The audit log records `approval / signature_recorded` with the authority, the capacity, "1 of 2" and the review digest.
- **Order is enforced.** The Plant Manager approves the Head of Inspection's recommendation, so the Plant Manager cannot sign first.
- **The same person cannot sign twice** (SOP-OPS-008 Clause 3.2). The person who ran the task cannot sign at all.
- **A role outside the rule is refused.** That includes the reviewer and the administrator.
- **A signature is bound to the version signed.** If the run changes after the first signature, for example because a conflict was resolved and the finding recomputed, that signature is void. It is removed, and `approval / signatures_voided` is audited. The Head of Inspection then signs the new version.
- **The second signature releases the run.** The run becomes Delivered, and the `approved` audit entry and the run certificate list both signatures.

The required signatures are read again from policy, against the run's computed severity, each time someone decides. A run that becomes High after a conflict resolution therefore needs the High signatures.

## Harness reports

A harness (a job of many runs) ends in one report. When its rules say so, the report is held too, and a reviewer decides it through the same permission.

## What approval does not do yet

These are on the roadmap, and worth knowing:

- There is no **request revision** outcome. A reviewer can only approve or reject.
- The approval record does not itself store the **hash of the approved document**. The deliverable's SHA-256 is recorded on the run when it is generated, but it is not re-checked when the file is downloaded, and an approval is not cryptographically bound to one version of the output. (Harness reports, by contrast, are served only if they still match their recorded hash.)

## Related

- Using the Approvals screen: [3.5 Approvals](../03-user-guide/05-approvals.md)
- The policy gateway: [9.2 The policy gateway](../09-security/02-policy-gateway.md)

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 2.4 · Verification](04-verification.md) | [↑ 02 · Core concepts](README.md) | [2.6 · The audit chain →](06-audit.md) |

<!-- nav:end -->
