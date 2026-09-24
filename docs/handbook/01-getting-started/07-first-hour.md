# 1.7 · Your first hour

This tour takes about an hour and touches every idea that matters in AEGIS. Each step says which account to use, what to do, and what you should see.

> [!TIP]
> Keep the seed script's output open. It lists the correct answers, so you can check the model instead of trusting it.

## Step 1 · Sign in as the engineer (2 min)

Open **http://127.0.0.1:3000/sign-in**. Under *or try a demo account*, click **Integrity Engineer**, or type `engineer` and `workbench`.

You land on the **Thread**: a sidebar of places and past runs on the left, and *What should we check today?* with a composer in the middle. The pill at the top of the sidebar reads **0 egress**: the number of connections the workbench's own processes have made to anything outside the machine since it started.

## Step 2 · Ask a question with a skill (3 min)

In the composer, type `/`. A menu lists every **skill** and then every **harness**. Choose `/clause`. It sits in the composer as a chip, and the placeholder tells you what to type. Enter:

```text
internal inspection of a pressure vessel in corrosive service
```

and press **Enter**. Within about twenty seconds:

> A pressure vessel in corrosive service shall receive an internal inspection at intervals not exceeding 48 months. `S1`
> **Delivered** · 6 of 6 checks passed · `S1` SOP-INS-014 §2.2

Click the summary line (*6 of 6 checks passed · 6 sources searched*). The run opens as a transcript: the classification, the model chosen for each stage and why, the six passages retrieved with their scores, the tokens each call used, and every check. Click **S1** to read the exact passage cited.

## Step 3 · See a run held by policy (5 min)

Start a **New run** and ask:

```text
What severity applies when cladding damage exceeds 20% of an insulated section, and who must approve continued operation? Cite the clauses.
```

The answer is correct (**Medium**, approved by the **Head of Inspection**), and every check passes. Yet the run is **Held for review**. Read the held line:

> Held for administrator or reviewer · Evidence S5 (ENG-DBM-2104) is restricted, so the run is restricted too.

Retrieval admitted a passage from the *Restricted* design memo into the model's context. An answer is at least as sensitive as what the model was shown, so the run was raised to *restricted*, and restricted work always waits for an approving authority. The model's confidence played no part in this. The policy file decided.

## Step 4 · Release it as the reviewer (5 min)

Click your name at the bottom of the sidebar. The account menu shows your role, department and clearance, and under **Switch demo account** lists the other seeded accounts. Choose **Approving Reviewer** (`reviewer`). (**Sign out** is in the same menu.) Open **Approvals**, or press <kbd>G</kbd> then <kbd>A</kbd>.

The queue shows the held run. The right-hand pane explains *why* it was held, the answer and its citations, every check, and anything it would release. Press <kbd>A</kbd> to approve, add a short reason, and confirm.

Now try approving something you ran yourself: sign in as `reviewer`, ask any question that gets held, and try to approve it. You are refused:

> You ran this task, so you cannot approve or reject it. A different account holding approval.decide must decide it.

Separation of duties is enforced by account, for every role, including the administrator.

## Step 5 · Run code in the sandbox (5 min)

As `engineer`, open **Assurance → Sandbox**. On the left is a list of payloads: ordinary work in green, attacks in red. Choose **Corrosion-rate calculation** and click **Run**. You see its output, its exit code, the peak memory and CPU time the operating system measured, and which limits were in force.

Now choose **Memory bomb** and run it. It is stopped at the memory cap with `MemoryError`. Try **Socket connect**: it is refused before it runs, because `socket` is a denied import. Try **getattr indirection**: also refused, because building a name to reach `os.system` is itself a denied call.

## Step 6 · Prove containment and zero egress (5 min)

Open **Assurance → Posture**. Three cards summarise what the host can show about itself, each labelled with *how* it knows:

| Card | Label | Meaning |
|---|---|---|
| **Egress 0** | Measured | The monitor samples the workbench's own sockets every two seconds and counts any that leave loopback |
| **Containment** | Tested | Nothing is claimed until you run the self-test |
| **Policy 10** | Configured | Ten actions no role can take, with no override |

Click **Run the self-test**. Seven real payloads are submitted to the sandbox: a static import check, a runtime socket denial with the static check bypassed, a process escape, a write outside the workspace, permitted work, a CPU spin and a memory bomb. The card changes to **7/7**.

## Step 7 · Verify the audit chain twice (5 min)

As `reviewer`, open **Assurance → Audit**. Every sign-in, permission decision, model call, tool call, verification, approval and self-test you just caused is here, newest first.

Click **Verify chain**. Two independent computations run:

- **Server:** the API recomputes every record's hash from the one before it.
- **This browser:** your browser downloads the full log and recomputes the same chain with Web Crypto, independently of the server.

Both end at the same head hash, and the panel says *Both agree*. Change a single character in `storage/logs/audit.jsonl` and both checks break at that record.

## Step 8 · Run a harness (10 min)

As `engineer`, open **Harnesses**, choose **SOP question sweep**, and paste three questions, one per line:

```text
What is the external inspection interval for a vessel in corrosive service?
Within what time must a Medium severity finding be repaired?
What bench-test interval applies to a pressure relief valve in fouling service?
```

Preview, then start it. Each line runs as its own governed task, one after another. When they finish you get an **answer matrix**: one row per question with its outcome, how many of its claims were traced to a passage, and the clauses it cites. A hashed report in Markdown and JSON can be downloaded.

## Step 9 · The auditor: oversight without the power to act (5 min)

Sign in as **Internal Auditor** (`auditor`). The auditor can read every run and the whole audit log, and can verify the chain in the browser. But the auditor cannot create a task and has no knowledge search: try, and the API answers 403. Oversight and action are different permissions.

## Step 10 · Try the headline task (optional, 5–10 min)

As `engineer`, on a new thread, click the starter card **Approval note from a scanned report**. It attaches `scanned-inspection-report-V-2104.pdf`, asks for an approval note, and sets the output to **Word**. The vision model reads each page, retrieval finds the governing clauses, the note is drafted as a DOCX, and the run is held for sign-off with the document withheld and hashed.

Check the result against the seed script's correct answer: governing location *Shell course 2 (mid)*, corrosion rate *0.55 mm/year*, remaining life *6.18 years*, severity *Medium*, approver *Head of Inspection*.

> [!WARNING]
> On a small CPU model this task does not always get the figures right, and the run can still pass its checks. That is the most important limitation in the system today, and [8.5 What verification cannot catch](../08-verification/05-limits.md) explains exactly why. It is also why the run is held for a human rather than released.

## Where to go next

- The ideas behind what you just saw: **[Core concepts](../02-concepts/README.md)**.
- Every screen in detail: **[Using the workbench](../03-user-guide/README.md)**.
- A scripted demonstration for judges: **[Demo guide](../14-demo-guide/README.md)**.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 1.6 · Seed the corpus and run](06-seed-and-run.md) | [↑ 01 · Getting started](README.md) | [1.8 · Installation troubleshooting →](08-install-troubleshooting.md) |

<!-- nav:end -->
