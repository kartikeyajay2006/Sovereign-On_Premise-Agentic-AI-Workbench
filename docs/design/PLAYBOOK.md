# PLAYBOOK: applying Measured Light, screen by screen

The how. `DIRECTION.md` is the why. Written for Part 2, the pass that applies the direction across every surface once the parallel work has been integrated. It was written against the code as it stood on 23 Sep 2026, while six other agents were changing it. **Before applying any section, re-read the files it names**: component names are stable, line numbers are not.

Everything referenced as a primitive is in `frontend/shared/motion/` (import from `@/shared/motion`). Everything referenced as a class or token is in `frontend/app/globals.css`, in the MEASURED LIGHT and SIGNATURE MOTIONS sections.

---

## The rules every change follows

1. **Name the referent.** Every animation added gets a one-line comment at its call site naming the event that drives it: `// APPEND: task.evidence`. If you cannot name it, do not add it.
2. **Ink never fades in.** Remove every `animate-in fade-in` from content. Content uses `<Appear>`, `<Append>` or `<Release>` (they move it at full opacity). Only light fades.
3. **Hue only for the five lights.** Before adding a colour, say which of *proved / running / held / refused-or-failed / act* it is, and what measured it. Configuration is never a state, so configuration is never coloured.
4. **Status words use `-text` tokens, and never on a wash or tint.** On `wash-*` and on `*-surface` tints, words are `text-foreground` or `text-foreground-secondary`, and the state is carried by a rule or glyph in the fill hue.
5. **Numbers that change use `<MeasuredNumber>`.** Numbers that can be absent pass `absent="—"` where a column needs a placeholder, or nothing where it does not.
6. **Keyboard-caused changes do not animate.** Anything keyed on a selection that j/k or the arrows move is instant.
7. **Lists that receive rows live get an `<AppendScope>`**, keyed by the thing whose rows they are (the run id, the harness run id). Opening a run is a read; nothing slides in.
8. **Full-height screens size against `var(--shell-top)`**, never a literal `72px`, and sticky elements stick at `top: var(--shell-top)`. The thread's run rail (`session-rail.tsx`: `sticky top-[72px] h-[calc(100dvh-72px)]`) becomes `top-[var(--shell-top)] h-[calc(100dvh-var(--shell-top))]`. It sticks now that the app frame is `overflow-x-clip`; under `overflow-x-hidden` it never did.
9. **Legacy classes go when a file is touched:** `rounded-xl`, `rounded-lg` on in-flow content, `shadow-sm`, `shadow-md`, `transition-all`, `font-bold`/`font-semibold` (the ceiling is `font-[590]`), tracking over `0.06em`, `text-[9px]`..`text-[15px]` (use the role tokens), `SovButton` (use `Button`), `TechnicalLabel` with a hand-picked `dot` colour, raw hues as text (`text-[var(--sovereign)]`, `text-critical`), `bg-[var(--sovereign)]/10`-style tints (use `*-surface`).

---

## 0. The shell (built in Part 1)

`components/navigation.tsx`, `components/command-palette.tsx`, `app/(app)/layout.tsx`, `app/layout.tsx`, `components/aegis-logo.tsx`, `app/icon.svg`, and `shared/motion/**`.

**What remains for Part 2 is in files other agents own.**

* **`components/sovereignty-status.tsx`**
  * The pill's dot is `bg-sovereign` when `monitored && sovereign`. **Recommendation: make it ink** (`bg-foreground`), keep `bg-critical` when anything was observed, `bg-approval` when not monitored, and `bg-control-strong` when unknown. Green says *proved*. The Assurance page itself states that the monitor samples every 2s and "fails open", reporting an empty list when it cannot read the connection table. A zero that cannot prove itself must not glow. This is the one place the header could otherwise claim more than the host measured.
  * Rename its footer link "Assurance →" to "Posture →" (it goes to `/security`).
  * Render its egress count through `<MeasuredNumber>` so a change rolls.
* **`components/role-switcher.tsx`**: no change needed. Its menu already uses `--elev-2`, which now carries the rim.
* **`components/page-header.tsx`**: meta values that are numbers become `<MeasuredNumber value absent="—">`. Add an optional `figure` slot for screens whose header exists to show one number (Posture's non-loopback count), rendered `type-figure`.
* **Wire the two events the shell listens for:**
  * `APPROVALS_CHANGED_EVENT` (exported from `components/navigation.tsx`): dispatch it from the thread when a run settles `awaiting_approval`, and from `ApprovalsView.confirmDecision` after a decision. The header's held count then updates at once.
  * `NEW_RUN_EVENT` (exported from `components/command-palette.tsx`): `ThreadView` listens for it and calls its `newRun()`. Until it does, the palette's "New run" only navigates to the thread, and its hint says only that.

**What right looks like.** A 56px bar; a 24px mark beside "AEGIS". Five tabs in muted ink with the current one in full ink and a 2px ink rule sitting on the header's hairline. Moving the pointer across the tabs draws a sunken highlight that glides from tab to tab and fades 150ms after the pointer leaves. Navigating glides the rule to the new tab over 300ms. On `/security`, `/sandbox` and `/audit`, a second 36px row reading "Posture Sandbox Audit" appears, with its own ink rule, and the page content starts 36px lower with nothing overlapped. Ctrl+K opens the palette in about 120ms, with "Go to / Actions / Recent runs / Harness runs" groups, G+letter keycaps on each screen row, and a "read HH:MM:SS" beside each run list. Typing "aud" lights the matched letters. G then A goes to Approvals from anywhere except a text field. The page content settles 6px upward on navigation while the header does not move.

---

## 1. Thread (`/console`)

Owner files: `features/thread/ui/thread-view.tsx`, `assistant-turn.tsx`, `composer.tsx`, `session-rail.tsx`, `user-turn.tsx`, `usage-footer.tsx`, `answer-actions.tsx`, `features/evidence/ui/evidence-rail.tsx`, `shared/ui/timeline/stage-timeline.tsx`.

This is the screen the product is judged on. It gets every signature motion except SEAL-on-chain and TURN, and each one is bound to an event the thread already handles.

### Apply

1. **Readings strip** (the top row in `ThreadView`: host, egress, models, sandbox, audit).
   * `host` is the literal `127.0.0.1`, set beside readings that are measured. Read it from `window.location.host` after mount (as `SovereigntyStatus` does), or relabel it `api 127.0.0.1:8000` as configuration in secondary ink.
   * Render `egress` and `models` with `<MeasuredNumber absent="—">`.
   * `audit BROKEN` keeps `text-critical-text`.
2. **Stage board** (`StageTimeline`, shared). See §10. The active marker takes `<Light tone="active" rest="rim">`. A marker reaching `done` blooms sovereign with `bloomKey={state}` and rests at `none`. A connector reaching `drawn` draws with `aegis-draw-y` over `--standard` (origin top). Keep `sov-pulse` on the active dot: it is the one loop the direction allows, because the stage is running.
3. **Evidence** (`EvidenceRail`).
   * Wrap the `<ol>` in `<AppendScope key={taskId}>` and each `<li>` in `<Append as="li" index={i - firstNewIndex} tone="neutral">`, so rows the run registers live arrive lit and cool, while a reopened run's rows do not move.
   * Pass `bulk` when a single `task.evidence` batch carries more than 60 items.
   * The header count becomes `<MeasuredNumber>`.
4. **Citations: TRACE.**
   * In `AnswerProse`, put `data-trace={id}` on each resolved citation `<button>`. In the rail, make each row `<TraceTarget as="li" active={focusId === e.id} token={traceCount} data-trace={e.id}>`. `traceCount` is a counter `ThreadView` bumps in `onCite`, so a second click on the same citation lands again.
   * Wrap the thread column (the element holding the turns and the rail) in `<TraceScope>`. Hovering a chip then lights its row and vice versa.
   * Delete the rail's `scrollIntoView` effect, which `TraceTarget` replaces.
5. **The answer: WITHHOLD → RELEASE.**
   * In `AssistantTurn`, replace `<div className="animate-in fade-in slide-in-from-bottom-1 ...">` around `AnswerProse` with `<Release verdict={...} released={turn.releasedLive}>`.
   * **verdict** = `'sovereign'` when every check passed, `'approval'` when `outcome === 'held'`, `null` otherwise.
   * **`releasedLive`** is a boolean the turn model does not have yet. Add it to `AssistantTurn` in `features/thread/model/types.ts`. `settle()` sets it true when it writes the answer of a run the reader watched; `openRun()` leaves it false, because reopening a run is a read, and a read does not bloom.
   * Keep the withheld sentence exactly as it is. It is the thesis.
6. **Held.**
   * The deliverable row gets `wash-approval` and keeps its lock glyph, with the words `held for review` in `text-foreground-secondary` (rule 4).
   * The run header's `HELD` blooms once: `<Light tone="approval" bloomKey={turn.outcome === 'held' ? turn.taskId : null} as="span">`.
   * Dispatch `APPROVALS_CHANGED_EVENT`.
7. **Refused: REFUSE.**
   * Replace the denied block (`border border-critical-border bg-critical-surface`) with `<Refused className="wash-critical pl-4 ...">`.
   * Its label "Refused by policy" moves from `text-critical-text` to `text-foreground`. **Measured: critical-text on that tint over the page ground is 4.47:1, under AA**, and the label is 10px.
   * Wrap the stage board and the refusal in `<DimScope dimmed={turn.outcome === 'denied'}>`, with `data-dim-item` on each and `data-dim-keep` on the refusal.
   * If the reason arrives after the refusal, open it with `<Disclose tempo="hold" open={Boolean(turn.denialReason)}>`.
8. **The deliverable hash: SEAL.** `sha256:ab12cd34…` becomes `<Seal sealed={turn.outcome === 'delivered'} token={sha}>`. A held deliverable shows the dashed, unsealed rule, which is true: it has not been released.
9. **Session rail.** Wrap the runs list in `<AppendScope>`, so a run that just finished (after `runsVersion` bumps) appends at the top, lit in its outcome tone (`sovereign` delivered, `approval` held, `critical` refused/failed), while the initial load does not animate.
10. **Composer.** No change to motion. Remove `transition-shadow` from its root. The drag outline is instant, and the `--elev-1` rim is already applied.
11. **Draft register.** Keep it. It is correctly labelled and is never promoted. Its blinking caret (`motion-safe:animate-pulse`) is allowed only while `streamingDraft` is non-null, which is already the case.

### Remove

* `animate-in fade-in` on the answer.
* `transition-shadow` on the composer.
* The literal host in the readings strip.

### Right looks like

A run's stages light blue one at a time, the dot pulsing only on the running one, and each flashes green and rests as it passes. Evidence rows slide 4px into the rail with a pale wash and a thin rule that fades over about a second. The answer is absent until verification, then rises 8px with a brief green halo that lets go. Clicking `[S3]` brings its row into the rail with an ink ring that contracts onto it. A refusal dims the board and draws a red rule down the refusal card. Nothing moves on a finished, reopened run.

---

## 2. Approvals (`/approvals`)

Owner files: `components/approvals/approvals-view.tsx`, `queue-list.tsx`, `review-pane.tsx`, `decision-dialog.tsx`.

The screen already has the right structure: keyboard-first, honest counts, glyph plus hue per decision. Apply light only at the one moment that matters, the decision.

### Apply

1. **The decision bloom.** In `QueueRow`, wrap the decision glyph and label in `<Light as="span" tone={item.decision === 'approved' ? 'sovereign' : item.decision === 'rejected' ? 'critical' : 'approval'} bloomKey={item.decision === 'held' ? null : item.decision} rest="none">`. A row flipping from held to approved blooms green once. j/k never causes a bloom (rule 6), because the key is the *decision*, not the selection.
2. **The decision record: SEAL.** When `recordDecision` returns and the review pane shows the recorded decision, render the audit reference (event id or hash, if the task record carries one) inside `<Seal sealed token={decisionId}>`. If the record carries no hash, show none. Do not invent one.
3. **Header counts.** `PageHeader` meta "Held" and "Decided" through `<MeasuredNumber>`.
4. **Events.** Dispatch `APPROVALS_CHANGED_EVENT` after `confirmDecision` succeeds.
5. **Review pane.** No animation on selection change. It is driven by j/k (rule 6) and is correctly instant today. Keep it that way.
6. **ForbiddenNotice.** Already ink words on `bg-approval-surface` with an approval rule. Measured: approval-text on that tint is 5.13:1 over the ground, so the `-text` token would pass here, but keep ink for consistency with rule 4.
7. **Full height.** Replace `lg:h-[calc(100dvh-72px)]` with `lg:h-[calc(100dvh-var(--shell-top))]`.

### Right looks like

Approving the selected run: the dialog closes, the row's ⏸ HELD becomes ✓ APPROVED with a green halo that lets go over a second, the next held row is selected instantly, and the header's Approvals count drops by one without a light (a decision made is not a hold).

---

## 3. Knowledge (`/registry`)

Owner file: `components/registry/registry-view.tsx`. This is the most legacy-styled screen still in the product.

### Apply

1. **Tabs.** Replace the filled ink pill tabs (`rounded-lg border ... bg-foreground text-primary-foreground`) with `Tabs` from `shared/ui/controls/tabs`, which uses the same ink rule as the header, one scale down.
2. **Copy.** Delete "100% on-premise" from the description: an unqualified absolute on a screen that measures nothing about the network. Replace `SovButton` with `Button`, and make "Ingest new SOP" `variant="secondary"`. It is not the screen's single decisive action, and lime stays rationed.
3. **Model estate.** Residency is a runtime fact, not a verdict, so it takes **no hue**: a filled ink dot and "resident" for loaded, an empty ring and "not loaded" otherwise. Sizes and counts through `<MeasuredNumber>`. There is no throughput column until something measures tokens per second (already the rule in the file).
4. **SOPs and documents.**
   * Grouped rows (`grouped`, `grouped-row`), not bordered cards.
   * A freshly ingested document `<Append tone="sovereign">`s into the table inside an `<AppendScope>`: *proved* here means indexed and counted.
   * Chunk counts through `<MeasuredNumber>`.
5. **Retrieval tester.** Results `<Append>` in rank order, `index` = rank.
   * Scores are measurements of relevance, not states. Show them as mono numbers and, if a bar is wanted, as a neutral ink bar (`bg-foreground-muted`) on a `bg-line-subtle` track. **Never green**, because relevance is not proof.
   * If there is no score, show none (the file already refuses to default to 0.95).
6. **Ingest modal.** A single request, so no progress bar. The button is busy, with a measured "waiting 3.2s" dwell beside it. Success closes the modal and lets the new row APPEND.

### Remove

`rounded-lg`, `transition-all`, `shadow-sm`, `SovButton`, `TechnicalLabel`, `StatusIndicator` wherever it colours a non-state, and the "100% on-premise" copy.

---

## 4. Assurance · Posture (`/security`)

Owner files: `components/security/security-view.tsx`, `egress-panel.tsx`, `sandbox-panel.tsx`, `policy-panel.tsx`.

The rewrite in progress already labels each fact as a measurement, a test result or configuration. The direction's job here is to make that distinction *visible* and to ration green severely.

### Apply

1. **The egress figure.** The non-loopback count is the screen's one figure: `type-figure` plus `<MeasuredNumber>`, in **ink when 0**, `text-critical-text` when above 0, and absent when unread.
   * **No sovereign light on the zero.** The panel's own caption explains the monitor can miss connections and fails open, so the zero is a reading, not a proof. This is the rationing rule's showcase: the product declines to glow about what it cannot prove, and says why.
   * When a new sample arrives (`last_checked` changes), the "last sample" readout is enough. Do not tick or flash the figure.
2. **Sandbox self-test** (`SandboxPanel`). Results arrive all at once, so this is **not a sweep**.
   * Each check `<Append>`s in order, tone `sovereign` for *passed* (a real payload was contained) and `critical` for *failed*.
   * *Not assessable* takes no tone at all and neutral words, and nothing on it reads as a pass. That is already the rule.
   * When every check passed, the result line gets `<Light tone="sovereign" rest="rim" bloomOnMount>`. This is the one sovereign light on the screen, and it is earned by payloads that were actually refused.
3. **Policy matrix** (`PolicyPanel`). **Configuration is never coloured.**
   * ALLOW is `✓` in ink. DENY is `—` in muted ink with the word, and the ceiling is in mono.
   * A denial that actually *happened* is an audit event, shown on the Audit screen in critical. The matrix only says what is configured.
4. **Headings.** The page title stays "Assurance" or becomes "Posture". Either way, align it with the sub-nav label: pick one and use it in both.
5. **The "Stream: live" reading** is real (`useEventStream().connected`). Keep it as words, with no pulsing dot.

---

## 5. Assurance · Sandbox (`/sandbox`)

Owner files: `features/sandbox/**` and `app/(app)/sandbox/**` (being built). Backend: `POST /api/sandbox/execute` and `GET /api/sandbox/limits` in `backend/api/routes/sandbox.py`. The response is `result` (exit code, stdout, stderr, duration_ms, timed_out, static violations, `network_attempts_blocked`), `limits`, `accounting` (`peak_memory_bytes`, cpu user/kernel seconds, termination reason, and all of them may be null), `policy_decision` and `policy_reason`.

This is the "watch it contain a real payload, live" screen. It has the most distinct states in the product, and each maps cleanly to a signature motion.

### Layout

Two columns at `lg` (a single column below):

* **Left:** the code field (mono, `text-ui`, sunken), the classification segmented control, and **Run**, the screen's one lime action.
* **Right:** the run record.
* **Above both:** a strip for the host's limits, from `GET /sandbox/limits`.

### The limits strip: configuration, drawn as configuration

The strip shows memory, CPU seconds, wall timeout, network allowed, and the concurrency caps.

* Values are in secondary ink with the label "configured".
* If `execution_allowed` is false, the whole screen says so above the field, in ink with the service's `reason`, and **Run is disabled with the reason as visible text**, not a tooltip. Disabled buttons cannot show tooltips accessibly.

### States of one run

| State | What triggers it | On screen |
|---|---|---|
| **In flight** | the POST is pending | Run is busy ("Running…"). The record panel takes `<Light tone="active" rest="full">` for exactly as long as the request is pending, and a dwell counter measured from submit reads "waiting 1.4s". Label it as wall time in the browser, which is what it is. |
| **Refused** | 403, with policy `reason` | REFUSE: `<Refused className="wash-critical">` holding the reason in ink and the rule named (`python_exec`, the classification). The code field stays editable. |
| **Rejected by validator** | `static_validation_passed: false` | REFUSE as well, since the validator is the system refusing. List each violation with ✕ in `text-critical-text` on the plain surface, not on the wash. |
| **Too large** | 413 | Not a refusal: an input error, in ink, beside the field. |
| **At capacity** | 429 | Not a failure. Neutral words and a retry. |
| **Ran** | 200 | **RELEASE the record** (`<Appear>`). Exit code, and `duration_ms`, peak memory, CPU user and kernel through `<MeasuredNumber absent={<Absent/>}>`. `Absent` renders "not reported by this backend" in muted ink: the POSIX backend does not report peak memory, and a zero would be a claim. A peak-versus-limit bar is a real ratio of two known values, drawn in ink; it is never green. |
| **Contained** | `network_attempts_blocked > 0` | The count as a figure in `text-critical-text` with ⛔ and "blocked", and `<Light tone="critical" bloomOnMount rest="rim">` on it. A block is containment working, which is REFUSE semantics, not failure. |
| **Timed out / killed** | `timed_out` or `termination_reason` | ✕ with the reason in ink. The limit that stopped it is named, with its configured value beside it. |

Both output panes (stdout, stderr) are mono on sunken ground. stderr is ink, not red: stderr is a stream, not a verdict.

### One lime on the screen

As built, `self-test-panel.tsx`'s "Run self-test" is `variant="primary"`, and so is the console's Run, which puts two lime buttons on one screen. Make the self-test `secondary`. The console's Run is the screen's action; the self-test is the screen's proof, and it reads as that without the fill. The palette reaches the self-test as "Containment self-test". It opens `/sandbox` and does not run anything, because the palette cannot start it.

### History

Runs this session `<Append>` into a list under the record, newest first, each with its outcome glyph. The audit trail holds them server-side. Link "Open in the audit trail →" to `/audit?task=` if the audit screen supports a filter, and otherwise to `/audit`.

### Full height

The page is `min-h-[calc(100dvh-var(--shell-top))]`, because this screen carries the second header row.

---

## 6. Assurance · Audit (`/audit`)

Owner files: `components/audit/audit-view.tsx`, `verification-panel.tsx`, `chain-ribbon.tsx`, `record-list.tsx`, `chain-tail.tsx`, `use-chain-check.ts`, `chain-verify.ts`.

The in-browser chain check is the product's best VERIFY moment, and it is already built honestly: `useChainCheck` recomputes record by record, one chunk per frame, and "nothing is shown as checked ahead of the arithmetic". Apply the direction's vocabulary to it.

### Apply

1. **The ribbon** (`chain-ribbon.tsx`).
   * Keep the component: its buckets and memoised groups are specific to the problem.
   * Draw its cells with the spectrum classes: `className="aegis-strip-cell" data-state={state === 'ok' ? 'proved' : state === 'fail' ? 'failed' : 'pending'}` sized by `--cell` or its own `h-2 w-1`.
   * **Measured: the current pending cell (`bg-line-default`) is 1.53:1 against `--surface`**, under the 3:1 minimum for a non-text mark. The spectrum's pending state is a `--control-strong` edge at 3.69:1.
2. **The sweep.** Beside the record list, `<Sweep axis="y" done={check.checked} total={check.total} state={check.phase === 'done' ? (check.failureCount ? 'broken' : 'passed') : 'running'} label="Audit chain" className="w-[2px] self-stretch" />`. It advances only as `checked` does.
3. **A broken chain: REFUSE, applied to records.**
   * In `record-list.tsx`, wrap rows in `<DimScope dimmed={check.failureCount > 0}>`.
   * Mark rows after the first failure `data-dim-item`, and the failing record `<Refused data-dim-keep>`.
   * The screen's copy already says it: "records from that point on cannot be trusted; everything before it still verifies". The dim makes that sentence visible.
4. **The head: SEAL.** When the check completes and agrees with the server (`check.headHash === server.head_hash`), the head hash in `VerificationPanel` renders in `<Seal sealed token={check.headHash} srLabel="chain head, verified in this browser">`. If they disagree, use `<Seal sealed={false}>`, with the panel's existing critical explanation beside it.
5. **Categories take no hue.** Delete `CATEGORY_COLOUR`. It paints *model* in `--active` (which says "running") and *identity* in `--approval` (which says "held"). Categories are told apart by a mono label and, if needed, a glyph column.
6. **Live records.** If the screen re-reads the tail, new records `<Append>` inside an `<AppendScope>` keyed by the current filter.
7. **Legacy styles.** `rounded-xl`, `shadow-sm`, `hover:shadow-md`, `transition-all`, `font-bold`, `tracking-[0.12em]`/`[0.16em]` and `text-[9px]..[14px]` all go (rule 9). The hash blocks become grouped rows.

### Right looks like

Pressing Verify chain: the ribbon fills with green cells left to right at the rate hashing actually proceeds; a 2px rail beside the records fills downward in step, with a blue leading edge. On completion the head hash gets a green rule drawn under it and a small filled mark. After a tampered record, the fill stops red on that record, the records after it dim to 45%, and the failing record carries a red rule and rim.

---

## 7. Harnesses (`/harnesses`)

Owner files: `features/harness/**` and `app/(app)/harnesses/**` (being built). Backend: `backend/harness/models.py`. Its shapes are `HarnessRunView` (`children`, `tally`, `current_index`, `report`, `server_time`, `permissions`), `HarnessChildView` (`outcome`, `outcome_detail`, `claims_*`, and so on) and `HarnessPreview`.

A harness is many runs, so this is where the **spectrum** lives. It is the most colourful screen in the product, and every colour on it is one child's measured outcome.

### Outcome to spectrum state, no other mapping

| `HarnessOutcome` | Spectrum state | Glyph | Why |
|---|---|---|---|
| `supported` | `proved` | ■ | every material claim held up |
| `partially_supported` | `review` | ◇ | delivered, but a person should look |
| `released_unverified` | `review` | ◇ | delivered without verification: a governance concern, not a pass |
| `no_material_claims` | `neutral` | · | delivered, nothing to check. **Not** green, and not □, which is SUPPORTED's glyph. |
| `held` | `held` | ⏸ | waiting for a person's decision |
| `rejected` | `refused` | ✕ | a person said no |
| `refused` | `refused` | ⛔ | policy said no: the system working |
| `failed` | `failed` | ✕ | it broke |
| `running` | `active` | ◐ | the child in flight |
| `queued`, `pending` | `pending` | (empty) | not reached |
| `cancelled`, `not_submitted` | `skipped` | — | never ran, which is not a failure of what it would have asked |

A refusal is not a pass, held is not delivered, and skipped is not done: the backend's own docstring. The mapping above keeps every one of those distinctions.

### Apply

1. **Catalog** (`GET /harnesses`). Card-less grouped rows: name (heading), summary, input count, "report needs approval" in ink with ⏸ if `report_requires_approval`. Definition errors appear as ✕ rows in ink with `text-critical-text` on the file path.
2. **Preview** (`POST /harnesses/{id}/preview`).
   * The exact child prompts `<Append>` in index order inside an `<AppendScope>`: this is the reader seeing precisely what will be asked. The count is `<MeasuredNumber>`.
   * `warnings` appear with ◇ and ink words.
   * Start is the lime action.
3. **The run.**
   * `<Spectrum cells={children.map(c => ({ key: c.key, state: map(c.outcome), label: c.label }))} label="Harness items" />` sits at the top. **This is the progress indicator.** No separate progress bar: the strip says *which* items are done and how they came out.
   * The tally sits beneath it: one `<MeasuredNumber>` per non-zero outcome, each with its glyph. The backend provides every outcome with zeros included, but zeros are not shown, which is fine; unknown is still absent.
   * The current child (`current_index`) is lit `<Light tone="active" rest="full">` with a dwell measured against `server_time` (the view's own clock, so browser skew cannot invent elapsed time).
4. **Children list.** Each child `<Append>`s with its tone when it *settles* (the tick in the spectrum and the row appear together). Pending children are listed muted. Click through to `/console?run=<task_id>` for a settled child.
5. **Cancel.** `Button variant="secondary"`; it is never lime. While `cancelling`, the status reads "stopping at the next stage boundary" in ink.
6. **Report.**
   * The file hash in `<Seal sealed={report.record.released} token={sha256}>`.
   * When approval is required and `decision === 'pending'`, use `wash-approval` with a lock glyph and ink words.
   * `stale: true` gets ◇ "out of date: N items changed since this version" in ink with an approval rule, and "Regenerate" as a secondary action.
7. **Full height:** `var(--shell-top)`.

---

## 8. Landing (`/`)

Owner files: `app/(marketing)/**` and `components/landing/**`. The landing already carries most of the craft: the hero field, scroll-reveal ink, the marquee, and Reveal fixed to be visible-first.

### Apply

1. **Fix the hero button's hover.** `LandingButton` primary is `bg-foreground text-primary-foreground hover:bg-[#1f1f1f]`: a light-theme leftover. **Measured: on hover the label is #100e0b on #1f1f1f, 1.17:1, so it disappears.**
   * Make the primary the product's action lime, as in the app: `bg-[var(--action)] text-[var(--action-ink)]` with the `--glow-action` hover light. The page then has exactly one lime, the hero CTA, which is the rationing rule.
   * The header's "Open workbench" is secondary: ink outline.
2. **Delete the radial "pool"** under the hero (`-z-10`, `oklch(0.92 0.02 84.57 / 0.55)`). It is at a negative z-index under an opaque ground, so it has never been visible (the hero field's own comment explains why). It is also a light-theme colour that would read as a bright blob if it ever were. If the hero wants depth, use `var(--lamp)` at `z-0`.
3. **The live containment cell** (`LiveContainment`). When read and `sovereign`, the dot may stay green, but the words do the work. The same caution as §0 applies (it is a monitor reading), so use `bg-foreground` for the dot and keep critical for a breach.
4. **The receipt** (`RunReceipt`). It is a captured fixture, so it must never animate as if live. Its CHECKED and HELD labels may carry their hues as static marks (glyph + `-text`), and they must not replay.
5. **ProductShot.** Recapture `/landing/thread-run.png` after Part 2 lands on the thread, so the picture is the current product.
6. **Grain.** Permitted on the hero only, at no more than 4%, `mix-blend-mode: overlay`, inset 1px (docs/plan/14 §5.1), and only if the hero looks unfinished without it. Nowhere else.
7. **Motion.** Keep the hero field (20fps, paused when hidden, nothing under reduced motion), ScrollRevealText (one sentence) and Reveal (visible-first). Add nothing that loops.

---

## 9. Sign-in (`/sign-in`)

Owner file: `components/sign-in/sign-in-view.tsx`. The quiet room, and it should stay that way.

* The only colour is lime on **Sign in** and `text-critical-text` on an error.
* No light, no motion: a sign-in screen that animates is a sign-in screen that makes you wait.
* The logo's `full` variant now sets its sub-label in the ledger role (10px); nothing else to change.
* After sign-in, `/console` loads in the (app) layout. Crossing layout groups is not a TURN, which is correct, since arriving is not moving between readings.
* If anything is added, make it the failure path. "The workbench service is not reachable on 127.0.0.1:8000" deserves `ErrorState`'s structure (headline, what to do, the identifier), not a single line.

---

## 10. Shared UI (`shared/ui/**`, app-screens owner)

* **`StageTimeline`.** Marker states as today (they are right). Add `<Light>` to `StageMarker`: `tone="active" rest="rim"` while active; `bloomKey` on the transition to `done`, `denied` or `failed` with the matching tone; `rest="rim"` for `denied`. The `drawn` connector animates `aegis-draw-y` with `origin-top` over `--standard`, but only when it becomes drawn during a live run. Pass a `live` prop; a reopened run draws statically.
* **`VerdictBadge`.** Install its NEEDS-GLOBAL block into globals.css in Part 2 (the file asks for it). A verdict that *arrives* during a run blooms once in its tone via `<Light as="span">`. SUPPORTED and UNSUPPORTED take no light: SUPPORTED because nobody checked the arithmetic, UNSUPPORTED because absence is not an event.
* **`Button`.** Nothing to change. The press and the lime hover light come from `.btn` in globals.css. `busy` keeps its spinner, which is bound to a request in flight.
* **`Segmented`, `Tabs`.** Instant. They are keyboard-driven (rule 6).
* **`Modal`.** Already right: it rises at full opacity and the scrim fades. It now also gets the rim through `--elev-3`.
* **`Toast`.** Already right: it arrives by moving. Tone glyphs stay.
* **`EmptyState`, `ErrorState`, `ReadingLine`.** No motion. An empty state that slides in draws attention to absence.
* **`ProvenanceChip`.** No hue, which is correct and must stay that way.

---

## Part 2: the order, and why

1. **Shared UI first** (§10: StageTimeline, VerdictBadge, PageHeader). Every screen inherits these, so doing them first means every later step lands on the finished vocabulary, and three screens improve before any screen is touched.
2. **Thread** (§1). It is the screen the product is judged on and where most of the signature motions have their referent. Doing it second also proves the primitives against the hardest case: live SSE, bursts, reopened runs.
3. **Audit** (§6), then **Harnesses** (§7). These are the two VERIFY/spectrum screens. Audit's check is already built honestly and only needs the vocabulary. Harnesses is new and should be born in it rather than retrofitted.
4. **Sandbox** (§5), then **Posture** (§4). They share the Assurance row and the configured/measured distinction, so doing them together keeps that distinction consistent.
5. **Approvals** (§2). Already the most finished screen, so it needs the least: the decision bloom, the seal and the event wiring.
6. **Knowledge** (§3). The most legacy styling, but the least demo-critical. It is mostly subtraction.
7. **Landing** (§8), then **Sign-in** (§9). The landing's button contrast bug is a one-line fix and should be pulled forward into step 1 if anyone is presenting before Part 2 ends. The ProductShot is recaptured last, after the thread is done.

**Per change, before it is called done:** the referent comment is present. Reduced motion is forced in DevTools and every state is still readable. The backend is stopped and nothing glows. A 6× CPU throttle recording shows no content fading in. No `text-*` size outside the eight roles has been added. `tsc --noEmit` is clean for the files touched.
