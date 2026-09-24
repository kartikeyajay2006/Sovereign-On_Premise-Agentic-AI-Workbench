# 22 — Chat-First Architecture

**Agent beat:** product architecture for the chat-first reframe.
**Scope:** how a governed, evidence-verified, 11-stage agentic run becomes a conversation
turn, implementable against the backend that exists on 2026-09-21.
**Position:** this document is subordinate to `docs/plan/01-FRONTEND-ARCHITECTURE.md` on
component contracts and to `docs/plan/02-BACKEND-EVIDENCE-CORRECTNESS.md` on evidence and
claim shapes. Where it moves something those documents placed elsewhere, it says so
explicitly and gives the reason. It borrows the disclosure ladder and the status vocabulary
from `docs/plan/12-RESEARCH-EVIDENCE-UI.md` without amendment.

---

## 0. The thesis, and the one thing that must not break

A conversation thread is the primary surface. Everything the product governs — evidence,
policy, routing, verification, proof, approval, audit — attaches to a **turn** in that
thread rather than living on a sibling route.

The constraint that survives the reframe unchanged is doc 01's, at
`docs/plan/01-FRONTEND-ARCHITECTURE.md:363-368`:

> "A judge must reach the proof of any on-screen claim in one click… proof is not a
> destination you navigate to, it is a **layer you toggle over the thing making the claim**."

Chat-first is the *strongest* possible form of that rule, not a departure from it. In doc 01
the thing making the claim is a task detail page; here it is a message. The message is
closer to the reader, so the proof is closer to the reader. Nothing in this document may
make proof a separate route.

Second constraint, from `frontend/lib/api.ts:103-111` and `docs/plan/12-RESEARCH-EVIDENCE-UI.md:826-899`:
**never render what the host did not measure, and never fake progress.** A chat UI is under
more pressure to violate this than a task console, because chat conventions (typing
indicators, token-by-token streaming, "thinking…") are all progress theatre. Doc 12 rejects
token-streaming outright at `:869-875`, for the exact reason that applies here: streaming an
answer before it is claim-verified shows the judge unverified text and retroactively badges
it. Section 2 of this document is entirely about honouring that under a 30–120 second run.

### What the reframe actually changes, stated plainly

| Doc 01 said | This document says | Why |
|---|---|---|
| Nav is 7 tabs → 6; Console and Ask merge is **P2**, gated behind Proof Mode (`:396`, `:2195`, `:2261`) | The merge is **P0**. A chat composer that cannot put an existing knowledge document in scope is not a chat composer | Chat-first *is* the merge. Deferring it means shipping two composers |
| Proof Mode lives at `/tasks/[id]?view=proof` (`:374`, `:924-927`) | Proof lives at `/t/[threadId]?turn={taskId}&depth=proof`, with `/runs/[taskId]?depth=proof` as the solo permalink | Same addressability, same URL-not-state rule, new subject |
| Proof state is `useReducer` scoped to `/tasks/[id]`; "a third consumer outside `/tasks/[id]`" is the trip-wire for needing a store (`:1538-1545`) | Run state is `useReducer` **per turn**, owned by a `ThreadProvider` that holds a `Map<taskId, RunState>`. Still no global store | A thread is N runs, so the reducer is per-run in a map rather than per-route singleton. The trip-wire is respected: nothing outside the thread reads run state |
| `agent-pipeline.tsx` is theatre and is deleted (`:2210-2271`, List B) | Agreed, deleted. The in-flight turn uses `<Timeline/>` in a compact inline variant | No change |

---

## 1. THE THREAD MODEL

### 1.1 The single governing decision

**An assistant turn *is* a `Task`. One turn, one `Task.id`, no exceptions.** There is no
concept of an assistant message that is not a governed run, and no concept of a run that is
not an assistant turn. A thread is an ordered list of turns.

This is decisive and it costs something: a trivial follow-up ("shorter, please") still costs
a full 11-stage run. That is the correct trade for this product. A cheap unverified reply
path would be the single most dangerous feature we could add — it is exactly the
"unverified text shown as though verified" failure that the whole system exists to prevent.
If a follow-up needs to be cheap, the backend makes it cheap by skipping stages
(`TaskProfile.requires_retrieval` etc., `backend/core/schemas.py:150-153`), and the turn
honestly renders those stages as `skipped`.

### 1.2 Types

`frontend/lib/view/thread.ts` — these are **view** types under doc 01's bucket rule
(`docs/plan/01-FRONTEND-ARCHITECTURE.md:1429-1440`): they may never be returned from an API
call, and they compose contract types rather than redeclaring them.

```ts
import type {
  ApprovalRecord, AuditEvent, Deliverable, EvidenceItem, PlanStep,
  PolicyEvent, RoutingDecision, SandboxResult, Sensitivity, StoredFile,
  Task, TaskProfile, TaskStatus, ToolCall, VerificationReport,
} from '@/lib/contract'

/* ------------------------------------------------------------------ thread */

export type ThreadId = string
export type TurnId = string

export interface Thread {
  id: ThreadId
  /** Null until a human names it. NEVER auto-generated from model output — an
   *  invented title on a governed record is the `persona` mistake again
   *  (lib/presentation.ts:4-9). The list renders the first user turn's text
   *  truncated, which is something a person actually typed. */
  title: string | null
  created_at: string
  updated_at: string
  owner: { user_id: string; display_name: string | null }
  turns: Turn[]
  /** Where this grouping came from. A thread assembled on this browser says so,
   *  because the server does not yet know about threads (see §9, ASK-1). */
  origin: 'server' | 'local-index'
}

export type Turn = UserTurn | AssistantTurn | DecisionTurn

/* -------------------------------------------------------------- user turn */

export interface UserTurn {
  kind: 'user'
  /** `draft:{uuid}` while composing, `req:{task_id}` once dispatched. */
  id: TurnId
  at: string
  author: { user_id: string; display_name: string }
  text: string
  attachments: TurnAttachment[]
  /** Knowledge documents put in scope without uploading. Today this is
   *  prepended to the prompt (see §8 step 2); ASK-6 makes it structured. */
  scope: ScopedDocument[]
  requested_format: 'answer' | 'docx' | 'xlsx' | 'pptx' | 'md'
  /** Null while composing. Null with `dispatch_error` set if POST /api/tasks failed. */
  task_id: string | null
  dispatch_error: string | null
}

export interface TurnAttachment {
  file_id: string
  filename: string
  media_type: string
  size_bytes: number
  sha256: string
  classification: Sensitivity
  quarantine_passed: boolean
  quarantine_notes: string[]
}

export interface ScopedDocument {
  document_id: string
  title: string
  department: string
  version: string
  classification: Sensitivity
}

/* --------------------------------------------------------- assistant turn */

export interface AssistantTurn {
  kind: 'assistant'
  /** ALWAYS `Task.id`. The turn and the run are the same object. */
  id: TurnId
  task_id: string
  in_reply_to: TurnId
  created_at: string
  updated_at: string
  completed_at: string | null

  /** The authoritative phase. Derived from TaskStatus, never from event arrival. */
  phase: TurnPhase
  /** Backend's own words for the current stage. Never templated in the UI. */
  headline: string | null
  /** Terminal failure text. `Task.error`. */
  error: string | null
  duration_ms: number | null
  queue: { position: number | null; ahead: number } | null

  /** L1/L2 content — see §3. */
  disclosure: TurnDisclosure
  /** The prose, with claim spans. Null until the run produces one. */
  answer: AnswerBody | null
  /** The record. Every field maps to an existing backend field; see §1.3. */
  record: TurnRecord
  /** Liveness and reconciliation bookkeeping; see §7. */
  sync: TurnSync
}

/** Ordered, monotonic. A patch may never move a turn backwards (§7.4). */
export type TurnPhase =
  | 'composing'      // client-only: POST /api/tasks in flight
  | 'queued'         // task.queued, queue_position != null
  | 'running'        // received..verifying
  | 'held'           // awaiting_approval
  | 'settled'        // delivered | approved
  | 'rejected'
  | 'blocked'
  | 'failed'
  | 'cancelled'

export const TURN_PHASE_RANK: Record<TurnPhase, number> = {
  composing: 0, queued: 1, running: 2, held: 3,
  settled: 9, rejected: 9, blocked: 9, failed: 9, cancelled: 9,
}

/* ------------------------------------------------------------ answer body */

export interface AnswerBody {
  /** Raw text as the model produced it. The renderer never mutates this. */
  text: string
  /** Claim-level verdicts with character spans into `text`. Empty array until
   *  claim verification exists; see §4.6 for the degraded rendering. */
  claims: TurnClaim[]
  /** Inline [S1]/[F2]/[V3]/[C1]/[X1]/[H1] markers with spans, from
   *  backend/evidence/citations.py `parse()`. Client-parsed until then. */
  citations: ParsedCitation[]
  /** Citations that resolve to nothing in this turn's ledger. Rendered as a
   *  finding, not hidden (doc 01:1019, :1056-1058). */
  dangling_ids: string[]
}

export interface ParsedCitation { evidence_id: string; start: number; end: number }

export type ClaimVerdict =
  | 'VERIFIED' | 'SUPPORTED' | 'UNSUPPORTED' | 'CONFLICTED' | 'NEEDS_REVIEW'

export interface TurnClaim {
  id: string                       // "K2"
  text: string
  kind: 'factual' | 'numerical' | 'engineering_conclusion' | 'recommendation' | 'procedural'
  impact: 'low' | 'medium' | 'high' | 'critical'
  verdict: ClaimVerdict
  /** Character offsets into AnswerBody.text. Null when the extractor could not
   *  locate the sentence — the claim then renders in the margin list only,
   *  never underlined at a guessed position. */
  span: [number, number] | null
  evidence_ids: string[]
  conflict_ids: string[]
  /** Always present. `Claim.reason` is non-empty by backend contract
   *  (docs/plan/02:2864). A verdict with no reason is a type error here too. */
  reason: string
  recomputation: {
    formula_id: string; stated: number; recomputed: number
    unit: string; tolerance: number; agrees: boolean
  } | null
}

/* ------------------------------------------------------------ turn record */

export interface TurnRecord {
  /** 02 CLASSIFICATION — Task.profile */
  profile: TaskProfile | null
  /** The 11 proof stages, always all 11, always in canonical order (§2.2). */
  stages: TurnStage[]
  /** 03 POLICY — Task.policy_events + ToolCall.policy_decision */
  policy: PolicyEvent[]
  /** 04 ROUTING — Task.routing */
  routing: RoutingDecision[]
  /** 05/06 EVIDENCE + RETRIEVAL — Task.evidence */
  evidence: EvidenceItem[]
  /** Retrieval mode, from the `task.evidence` event payload's `mode` key. */
  retrieval_mode: 'embedding' | 'lexical' | 'hybrid' | null
  /** 07 CALCULATION — tool calls plus the sandbox record */
  tool_calls: ToolCall[]
  sandbox: SandboxResult | null
  generated_code: { code: string; attempt: number } | null
  /** 08 VERIFICATION — Task.verification */
  verification: VerificationReport | null
  conflicts: TurnConflict[]
  /** 09 APPROVAL — Task.approval */
  approval: ApprovalRecord | null
  /** 10 DELIVERABLE — Task.deliverables */
  deliverables: Deliverable[]
  /** 11 AUDIT — see §1.4, this is the largest gap. */
  audit: TurnAuditRef
  /** The plan. Rendered only in L3; it is intent, not evidence. */
  plan: { steps: PlanStep[]; expected_outputs: string[]; risks: string[] } | null
  files: StoredFile[]
}

export interface TurnAuditRef {
  /** Audit sequence numbers this run wrote. EMPTY until ASK-4 lands: the
   *  backend writes audit rows (backend/agents/orchestrator.py:283-298 etc.)
   *  but never returns their sequence numbers with the task. */
  sequences: number[]
  /** Populated only by an explicit L3 fetch of GET /api/audit?task_id=. */
  events: AuditEvent[] | null
  /** null = not checked in this session. Never defaulted to true. */
  chain_verified_at: string | null
}

export interface TurnConflict {
  id: string                       // "CF1"
  kind: 'numeric' | 'status' | 'revision' | 'date' | 'textual'
  subject: string                  // "V-2104"
  attribute_label: string          // "Design pressure"
  severity: 'low' | 'medium' | 'high' | 'critical'
  summary: string                  // "18 bar vs 16 bar — 12.5% apart"
  left: ConflictSide
  right: ConflictSide
  resolution: 'unresolved' | 'human_resolved' | 'superseded_preferred'
  affected_claim_ids: string[]
}

export interface ConflictSide {
  evidence_id: string
  filename: string | null
  revision: string | null
  document_status: 'ACTIVE' | 'SUPERSEDED' | 'EXPIRED' | null
  effective_date: string | null
  page: number | null
  value: string                    // "18 bar" — as written in the source
  excerpt: string
  classification: Sensitivity
}

/* ------------------------------------------------------------- turn stage */

export type TurnStageId =
  | 'request' | 'classification' | 'policy' | 'routing' | 'evidence'
  | 'retrieval' | 'calculation' | 'verification' | 'approval'
  | 'deliverable' | 'audit'

export type TurnStageStatus =
  | 'pending' | 'running' | 'passed' | 'flagged' | 'denied'
  | 'failed' | 'held' | 'skipped' | 'unavailable'

export interface TurnStage {
  id: TurnStageId
  index: string                    // "04"
  label: string                    // "ROUTING"
  status: TurnStageStatus
  started_at: string | null
  ended_at: string | null
  duration_ms: number | null       // null, never 0, when unknown
  headline: string | null
  /** Absent keys render nothing. `deny: 0` renders "0 deny". These differ
   *  (doc 01:892-895). */
  counts?: Partial<Record<'allow' | 'deny' | 'evidence' | 'claims' | 'conflicts' | 'candidates', number>>
  /** Which SSE events drove this stage in THIS session. Empty for a stage
   *  reconstructed from a snapshot. Powers the "received live / read from the
   *  record" distinction in L3. */
  driven_by: string[]
}

/* ------------------------------------------------------------ disclosure */

export interface TurnDisclosure {
  /** L1: the five-slot verdict strip. Null when claim verification has not run
   *  — the strip is then absent, not drawn as five zeros. */
  verdicts: Record<ClaimVerdict, number> | null
  evidence_count: number
  conflict_count: number
  /** `VerificationReport.valid`. Null when verification did not complete. */
  verification_valid: boolean | null
  /** Sourced from VerificationReport.limitations — first-class UX content,
   *  not debug text (docs/plan/02:1425-1430). */
  limitations: string[]
  /** Terminal policy outcome for the run, if one refused it. */
  denial: TurnDenial | null
}

export interface TurnDenial {
  kind: 'policy' | 'model' | 'tool' | 'file' | 'inference'
  subject: string
  action: string
  reason: string
  rule: string | null
  /** Containment statement + its measurement. Omitted entirely when the host
   *  cannot attribute egress to this task — never rendered as a bare "0"
   *  (doc 01:557-560). */
  containment: { statement: string; measured_at: string; method: string } | null
}

/* ------------------------------------------------------------ decision turn */

/** A human approval decision is a state transition rendered as a turn, NOT an
 *  assistant message. It has a named human author and no model behind it. */
export interface DecisionTurn {
  kind: 'decision'
  id: TurnId                       // `dec:{task_id}`
  at: string                       // ApprovalRecord.decided_at
  /** Refers back to the held assistant turn. */
  about_task_id: string
  decision: 'approved' | 'rejected'
  reviewer: { user_id: string | null; display_name: string }
  comment: string | null
  /** Filenames unlocked by this decision. */
  released: string[]
}

/* ---------------------------------------------------------------- sync */

export interface TurnSync {
  stream: 'live' | 'detached' | 'never-opened'
  /** Events RECEIVED for this turn in this session. Labelled as such — the bus
   *  drops on a slow subscriber (backend/core/events.py:47-52) and carries no
   *  sequence id, so this is not a count of events emitted. */
  events_received: number
  /** StreamEvent.at of the most recent event for this turn. */
  last_event_at: string | null
  /** When the authoritative snapshot was last fetched and applied. */
  snapshot_at: string | null
  /** Event names this build has no mapping for. Surfaced, never dropped
   *  (doc 01:822-823). */
  unmapped: string[]
}
```

### 1.3 Field provenance — every field, mapped to what exists today

| Turn field | Source in the running system | Note |
|---|---|---|
| `AssistantTurn.task_id` | `Task.id` — `backend/core/schemas.py:323` | |
| `.phase` | `Task.status`, `TaskStatus` enum `schemas.py:55-68` | Mapping in §2.3 |
| `.headline` | `task.stage` event `data.message` — `orchestrator.py:207-211` | Backend-authored string |
| `.error`, `.duration_ms` | `Task.error` `:344`, `Task.duration_ms` `:345` | |
| `.queue` | `Task.queue_position` / `queue_ahead` `:347-348`, injected by `tasks.py:97-99`; live via `task.queued` — `task_service.py:307-316` | Event is in the allow-list (`use-event-stream.ts:69`) but **no consumer reads it** |
| `UserTurn.text` | `Task.prompt` `:324` | |
| `UserTurn.attachments` | `Task.files: list[StoredFile]` `:333`; upload via `POST /api/files` `tasks.py:28-48` | |
| `record.profile` | `Task.profile: TaskProfile` `:334`; live in `task.created` `data.profile` — `task_service.py:297` | Carries `signals` and `reasons` → drives the CLASSIFICATION stage |
| `record.plan` | `Task.plan: AgentPlan` `:335`; live via `task.planned` — `orchestrator.py:559-567` | |
| `record.routing` | `Task.routing: list[RoutingDecision]` `:336`; live via `task.model_selected` — `orchestrator.py:234-247`, which already carries `candidates` | |
| `record.tool_calls` | `Task.tool_calls` `:337`; live via `task.tool_started`/`task.tool_completed` — `orchestrator.py:339-355` | `ToolCall.policy_decision` `:221` is the only live policy signal |
| `record.evidence` | `Task.evidence: list[EvidenceItem]` `:338`; live via `task.evidence` — `orchestrator.py:789-797` (**retrieval only**) and `task.extraction` `:730-739` | See gap E1 below |
| `record.retrieval_mode` | `task.evidence` `data.mode`, from `knowledge_search` tool output | Also `SystemHealth.retrieval_mode` `:459` |
| `record.sandbox` | `SandboxResult` `:224-235`; live via `task.sandbox_result` — `orchestrator.py:1118-1131` | |
| `record.generated_code` | `task.code_generated` — `orchestrator.py:1078-1080`; retries via `task.code_retry` `:1098-1102` | Not persisted on `Task` — live-only today |
| `record.verification` | `Task.verification: VerificationReport` `:339`; live via `task.verified` — `orchestrator.py:892-896` | Payload is the report **unwrapped** |
| `record.policy` | `Task.policy_events: list[PolicyEvent]` `:342` | **Snapshot only — no SSE event exists** |
| `record.approval` | `Task.approval: ApprovalRecord` `:340`; hold via `task.stage` `awaiting_approval` with `{reasons, approver_roles}` — `orchestrator.py:929-934`; decision via `task.approval_decided` — `task_service.py:559-567` | |
| `record.deliverables` | `Task.deliverables` `:341`; live via `task.deliverable` — `orchestrator.py:1275-1277` | `Deliverable.released` `:300` is the lock |
| `answer.text` | `Task.answer` `:343`; live via `task.answer` — `orchestrator.py:1187` | In the allow-list (`use-event-stream.ts:83`) with **no consumer** |
| `answer.citations` | Client-parsed from `answer.text` with `/\[([SFVCXH]\d+)\]/g` | Ledger prefixes at `orchestrator.py:90-95` |
| `disclosure.limitations` | `VerificationReport.limitations` `:271` | |
| `sync.last_event_at` | `StreamEvent.at` `schemas.py:446` | |

### 1.4 What the backend does NOT provide — the gap list

This list is an output of the work. Priorities and shapes are in §9.

| # | Gap | Consequence for the thread model | Workaround today |
|---|---|---|---|
| **G1** | **No thread identity.** `Task` has no `thread_id`, `parent_task_id` or conversation link (`schemas.py:320-348`). `GET /api/tasks` returns a flat `TaskSummary[]` (`tasks.py:84-86`) | `Thread` cannot be server-owned | Client-owned thread index in `localStorage`, reconciled against `GET /api/tasks`. `Thread.origin: 'local-index'` makes this visible |
| **G2** | **No turn-level claims.** `VerificationReport` has `material_claims_total`/`_supported` as integers (`schemas.py:269-270`) and `VerificationCheck.evidence_ids` (`:262`), but no `Claim` objects, no spans, no per-claim verdicts | §4's whole design is unimplementable; the L1 verdict strip has nothing to count | Render `TurnDisclosure.verdicts = null`; the strip is absent. Answer prose renders citation chips only |
| **G3** | **No conflicts.** No `EvidenceConflict` anywhere in `backend/` | §4.7 CONFLICTED case cannot fire | `TurnConflict[]` is empty; the conflict affordance does not render |
| **G4** | **No audit sequences on a task.** `AuditEvent.sequence` exists (`schemas.py:394`) and `GET /api/audit` accepts filters (`system.py:284-301`), but nothing on `Task` says which rows this run wrote | Stage 11 AUDIT renders `unavailable` | An L3 fetch of `GET /api/audit?task_id={id}` — verify the parameter exists before relying on it |
| **G5** | **No SSE `id:` field.** `_sse()` writes only `event:` and `data:` (`system.py:436-437`) | `Last-Event-ID` resume is impossible; a drop is undetectable | Poll-reconcile (§7.5) |
| **G6** | **No policy SSE event.** `PolicyEvent` accumulates on the task but is never published | POLICY stage is `unavailable` while running, `passed`/`denied` only after a snapshot | Snapshot-on-terminal fills it |
| **G7** | **`EvidenceItem` is untyped-by-prefix and unlocated.** `kind` is a 4-value `Literal` (`schemas.py:205-207`) with no `X`/`H`; the ledger mints only S/F/V/C (`orchestrator.py:90-95`); `location` is a free string (`:200`), no bbox, no page, no char range; `score: float \| None` (`:201`) is correctly nullable | Evidence opens as text, not as a located region. No page raster, no bbox | Render `location` verbatim; no viewer |
| **G8** | **File-read evidence is silent.** `orchestrator.py:762-768` adds attachment evidence to the ledger without emitting `task.evidence` | An attachment-only run shows zero evidence accumulating live, then N items on snapshot | Poll-reconcile; or accept the jump |
| **G9** | **No `REQUEST_REVISION`.** `ApprovalDecisionRequest.decision` is `Literal["approve","reject"]` (`schemas.py:288`) | §6 ships two outcomes, not three | Reject with a comment |
| **G10** | **No per-task egress attribution.** `SovereigntyStatus` is host-wide (`schemas.py:426-439`) | `TurnDenial.containment` renders **nothing**, per doc 01:557-560 | Omit the line |
| **G11** | **`Deliverable.download_url` is populated by the tool, but the canonical path is `/api/deliverables/{task_id}/{filename}`** (`tasks.py:139-194`) | Two ways to build the same URL | Prefer `api.getDeliverableUrl`, as `result-experience.tsx:103-105` already does |

---

## 2. WHAT A RUNNING TURN LOOKS LIKE

### 2.1 The hard constraint restated as three rules

1. **No prose is shown before it exists.** `task.answer` fires exactly once, with the whole
   answer (`orchestrator.py:1187`). There is no token stream and we do not simulate one.
2. **No progress is claimed.** There is no percentage, no bar, no ETA, and no stage marked
   done that did not emit an event saying so. `agent-pipeline.tsx:47-49` computes
   `progressPercent` from a fixed denominator of 7; that is exactly the arithmetic we are
   deleting.
3. **The only thing that may move without an event is a clock.** An elapsed counter is a
   measurement of wall time, not a claim about the run.

### 2.2 The eleven stages, and which of them this backend can actually drive

Canonical order from `docs/plan/00-ROADMAP.txt:111` and `docs/plan/01-FRONTEND-ARCHITECTURE.md:468-480`.

| # | Stage | Live driver today | Live status ceiling |
|---|---|---|---|
| 01 | REQUEST | `task.created` (`task_service.py:291-300`), `task.queued` (`:307-316`) | `passed` |
| 02 | CLASSIFICATION | `task.created` `data.profile` — full `TaskProfile` incl. `signals` | `passed` |
| 03 | POLICY | **none** (G6). Partial signal: `task.tool_completed` `data.policy_decision` (`orchestrator.py:353`) | `unavailable` until snapshot; `denied` when `task.blocked` fires (`:966`) |
| 04 | ROUTING | `task.model_selected` with `candidates` (`orchestrator.py:234-247`), `task.model_swapped` (`:271-281`), `task.model_completed` (`:309-319`) | `passed` |
| 05 | EVIDENCE | `task.extraction` (`:730-739`), `task.evidence` (`:789-797`). Attachment evidence is silent (G8) | `passed`, undercounted |
| 06 | RETRIEVAL | `task.evidence` `data.mode` / `data.count` | `passed` |
| 07 | CALCULATION | `task.code_generated` (`:1078-1080`), `task.code_retry` (`:1098-1102`), `task.sandbox_result` (`:1118-1131`) | `passed` / `flagged` |
| 08 | VERIFICATION | `task.verified` (`:892-896`) | `passed` / `flagged` |
| 09 | APPROVAL | `task.stage` → `awaiting_approval` with `{reasons, approver_roles}` (`:929-934`); `task.approval_decided` (`task_service.py:559-567`) | `held` → `passed` |
| 10 | DELIVERABLE | `task.deliverable` (`:1275-1277`) | `passed` |
| 11 | AUDIT | **none** (G4) | `unavailable` |

**Nine of eleven stages are live today. Two render `unavailable`.** Doc 01 already ruled on
this at `:2199-2204` — eleven honest stages, two of them `unavailable`, beat eleven
fabricated ones. We do not paint POLICY green because no event said otherwise.

### 2.3 Event → visible change, exhaustively

Every row uses an event that exists in `backend/`. Nothing here is aspirational.

| SSE event | Emitted at | What changes in the turn |
|---|---|---|
| `task.created` | `task_service.py:291-300` | Turn materialises. `phase: 'queued'`. Stage 01 `passed`; stage 02 `passed` with `TaskProfile` → the L2 classification line ("scanned PDF · calculation · sensitive · step budget 6") |
| `task.queued` | `task_service.py:307-316` | `queue = {position, ahead}`. Headline becomes `Waiting — 2 ahead`. **This is the first thing the reframe fixes**: the event is in the allow-list at `use-event-stream.ts:69` and no component reads it, so the queue has never displayed |
| `task.stage` | `orchestrator.py:207-211` | `phase` from `data.status`, `headline` from `data.message`. Maps `TaskStatus` → the stage rail: `planned`→04 running, `retrieving`→06 running, `executing`→05/07 running, `verifying`→08 running, `awaiting_approval`→09 held, `delivered`→10 passed. Any stage previously `running` becomes `passed` |
| `task.planned` | `orchestrator.py:559-567` | Stage 04 headline gains the step count. Plan steps stored for L3 |
| `task.model_selected` | `orchestrator.py:234-247` | Stage 04 `running`, `counts.candidates = data.candidates.length`, model chip in the turn header. `used_fallback: true` → stage `flagged` |
| `task.model_swapped` | `orchestrator.py:271-281` | L3 routing note: `evicted {id} to load {id}`. No L1/L2 change — memory admission is honest but not a verdict |
| `task.model_completed` | `orchestrator.py:309-319` | Stage 04 `passed`; `latency_ms`, `tokens_per_second`, `eval_count` land in L3 |
| `task.extraction` | `orchestrator.py:730-739` | Stage 05 `running` → `passed`. `counts.evidence` += findings. `illegible_regions` non-empty → stage `flagged` and a limitation line |
| `task.evidence` | `orchestrator.py:789-797` | Stage 06 `passed` with `data.mode`; stage 05 `counts.evidence` += `data.count`; `data.items` appended to `record.evidence` — **this is a full `EvidenceItem[]`, not one item.** `console-view.tsx:250` reads `data.evidence` and gets `undefined`; `ask-view.tsx:160` has the same bug |
| `task.tool_started` / `task.tool_completed` | `orchestrator.py:339-355` | A tool row in the inline activity strip: `knowledge_search · 812ms · allow`. `policy_decision !== 'allow'` → stage 03 `denied` |
| `task.code_generated` | `orchestrator.py:1078-1080` | Stage 07 `running`, headline `Generating code (attempt 1)` |
| `task.code_retry` | `orchestrator.py:1098-1102` | Stage 07 stays `running`, headline `Attempt 2 — {problem}`. **Retries are shown, not hidden** — a retry is the system correcting itself |
| `task.sandbox_result` | `orchestrator.py:1118-1131` | Stage 07 `passed` when `ok`, `flagged` when not. `network_attempts_blocked > 0` renders as a containment fact with a real number |
| `task.verified` | `orchestrator.py:892-896` | Stage 08 `passed`/`flagged` from `valid`. **The payload IS the `VerificationReport`** — `{valid, checks, material_claims_total, material_claims_supported, limitations, completed_at}`. `console-view.tsx:254` reads `data.verification` and gets `undefined` |
| `task.answer` | `orchestrator.py:1187` | **The prose appears, all at once, once.** Until this event the turn body is empty — it holds the stage rail and nothing else. Today no component listens |
| `task.draft` | `orchestrator.py:1245` | Stage 10 `running`, headline `Drafting the DOCX deliverable` |
| `task.deliverable` | `orchestrator.py:1275-1277` | Deliverable row appears. `released: false` → the download control renders **locked with the backend's own refusal text** (`tasks.py:158-162`), not disabled-and-silent |
| `task.approval_decided` | `task_service.py:559-567` | A `DecisionTurn` is appended; the held turn's phase moves to `settled`/`rejected`; deliverables unlock |
| `task.blocked` | `orchestrator.py:966` | `phase: 'blocked'`. Stage 03 `denied` with `data.reason`. Downstream stages → `skipped`, **never `pending`** (doc 01:890) |
| `task.failed` | `orchestrator.py:978`, `:990`, `task_service.py:447-451` | `phase: 'failed'`. Running stage → `failed`; the rest `skipped` |
| `task.cancelled` | `orchestrator.py:954`, `task_service.py:365-369` | `phase: 'cancelled'` |
| `task.finished` | `orchestrator.py:1002-1006` | Terminal. `duration_ms`. **Triggers the snapshot re-fetch** (§7.3) |
| `sovereignty.status` | `security/sovereignty.py:198-200`, every `poll_interval_seconds` (default 2) | Not a turn field. **It is the liveness proof** — see §2.4 |

### 2.4 What happens in the gaps

A CPU-host run is mostly silence. Between `task.model_selected(stage='drafting')` and
`task.answer` there is a single model call that can take 40 seconds and emits nothing.
Three things, and only three things, occupy that gap:

**(a) The elapsed counter.** Ticks from `TurnStage.started_at`, which is the `StreamEvent.at`
of the event that opened the stage (`schemas.py:446`). It is a clock. It is rendered in
`font-mono tabular` because it is a measurement (doc 01:1744-1748).

**(b) The stage headline, which is the backend's own sentence.** `_stage()` writes real
prose: `"Reasoning over the gathered evidence"` (`orchestrator.py:815`), `"Searching the
local knowledge base"` (`:773`), `"Reading 4 visual input(s) with the vision model"`
(`:723`). We render it verbatim. We never templated it, so it can never drift from what the
orchestrator is doing.

**(c) The stream-liveness dot, backed by a real heartbeat.** `sovereignty.status` is
published every ~2s with `task_id=None` (`sovereignty.py:196-200`). The SSE filter at
`system.py:426-427` is `if task_id and event.task_id and event.task_id != task_id` — a
`None` task_id fails the second clause, so **a task-scoped stream still receives the
sovereignty heartbeat**. That gives an honest 2-second liveness signal during a 40-second
model call, with no invented heartbeat and no fake progress. The dot means "the stream is
delivering frames", which is exactly what it is measuring.

If the heartbeat stops for more than 3× the poll interval, or `EventSource.onerror` fires,
the turn flips to `sync.stream = 'detached'` and the rail says so. Doc 01:864-867 is the
governing rule: *a frozen timeline that looks live is the same category of lie as a
fabricated number.*

What must **not** appear in the gap: a spinner on the turn as a whole, a shimmer skeleton
where the answer will go (doc 12:895-899 — a stage that has not run may never run), a
percentage, a "thinking" caption, or any animation whose period is not a real interval.
There is exactly one animation: `sov-pulse` on the running stage marker (doc 01:1726-1731).

### 2.5 ASCII — three moments

Rendered at the thread's reading width. The composer stays docked at the bottom and stays
**enabled**: the run is server-side, so a second question can be dispatched while the first
is in flight. The thread then holds two running turns, which the model supports natively.

**Moment A — just started (t ≈ 0.4s).** One event has arrived: `task.created`.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  YOU                                                        09:41:12         │
│  Read the attached scanned inspection report for vessel V-2104 and prepare    │
│  an approval note based on our approved SOPs. State the governing location,   │
│  the corrosion rate and remaining life with the inputs used…                  │
│                                                                              │
│  ⎗ scanned-inspection-report-V-2104.pdf   2.4 MB   sha 4f1c9a…   RESTRICTED   │
│  → deliverable: DOCX                                                         │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  AEGIS  ·  run 8f21a4c0                                       ⬤ live         │
│  ─────────────────────────────────────────────────────────────────────────── │
│  scanned pdf · calculation · SENSITIVE · step budget 6 · confidence 0.82     │
│                                                                              │
│  ○ 01 REQUEST          ●  accepted                              0.03s        │
│  ○ 02 CLASSIFICATION   ●  6 signals matched                     0.11s        │
│  ◐ 03 POLICY              —  this host does not report this stage live       │
│  ○ 04 ROUTING                                                                │
│  ○ 05 EVIDENCE                                                               │
│  ○ 06 RETRIEVAL                                                              │
│  ○ 07 CALCULATION                                                            │
│  ○ 08 VERIFICATION                                                           │
│  ○ 09 APPROVAL                                                               │
│  ○ 10 DELIVERABLE                                                            │
│  ○ 11 AUDIT               —  this host does not report this stage live       │
│                                                                              │
│  Queued — 1 ahead.                                            +0.4s          │
│                                                     [ Stop ]  [ record ▾ ]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

All eleven rows exist from t=0 (doc 12:697). Nothing will be appended; events mutate rows.
Zero layout shift by construction. The two `—` rows are honest: they name a limitation of
this host rather than sitting silently at `pending`.

**Moment B — mid-run, evidence accumulating (t ≈ 47s).** The vision read and retrieval are
done; the reasoning model has been running silently for 19 seconds.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  AEGIS  ·  run 8f21a4c0                                       ⬤ live         │
│  ─────────────────────────────────────────────────────────────────────────── │
│  ● 01 REQUEST          accepted                                 0.03s        │
│  ● 02 CLASSIFICATION   6 signals matched                        0.11s        │
│  — 03 POLICY           not reported live on this host                        │
│  ● 04 ROUTING          qwen2.5-vl:7b → qwen2.5:7b    candidates 3    swapped │
│  ● 05 EVIDENCE         evidence ▸ 9                            18.7s         │
│  ● 06 RETRIEVAL        lexical · 4 passages                     1.9s         │
│  ○ 07 CALCULATION                                                            │
│  ◐ 08 VERIFICATION  ·  Reasoning over the gathered evidence    +19.4s        │
│  ○ 09 APPROVAL                                                               │
│  ○ 10 DELIVERABLE                                                            │
│  — 11 AUDIT            not reported live on this host                        │
│                                                                              │
│  EVIDENCE GATHERED SO FAR                              9 items · open ▸      │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ V1  scanned-inspection-report-V-2104.pdf · p.3   "Shell course 2 …"    │  │
│  │ V2  scanned-inspection-report-V-2104.pdf · p.3   "t_actual 9.4 mm …"   │  │
│  │ V3  scanned-inspection-report-V-2104.pdf · p.4   "prior survey 11.…"   │  │
│  │ S1  SOP-INS-014 Corrosion assessment · §3.2      "Remaining life …"    │  │
│  │ S2  SOP-INS-014 Corrosion assessment · §4.1      "Severity HIGH w…"    │  │
│  │ … 4 more                                                               │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ⚠ No retrieval score was reported for these passages.                       │
│                                                                              │
│  The answer has not been produced yet. Nothing is shown until it exists       │
│  and has been through verification.                                          │
│                                                     [ Stop ]  [ record ▾ ]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

Three deliberate choices. Evidence accumulates **visibly during the run** — it is the most
interesting thing happening and it is real, item by item, with the ledger id the answer will
later cite. The "no retrieval score" line is the `evidence-drawer.tsx:420-428` conscience
generalised: `EvidenceItem.score` is `float | None` (`schemas.py:201`) and the lexical path
often returns nothing, so we say so rather than draw a bar. And the last paragraph is not a
placeholder — it is a statement of policy, and it is the sentence that wins the demo when a
judge asks why nothing is streaming.

**Moment C — blocked by policy (t ≈ 12s).** `task.blocked` fired from
`orchestrator.py:966` after `check_model` refused (`:253-263`).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  AEGIS  ·  run 91e07b3d                                       ⬤ live         │
│  ─────────────────────────────────────────────────────────────────────────── │
│  ● 01 REQUEST          accepted                                 0.02s        │
│  ● 02 CLASSIFICATION   restricted · vision required             0.09s        │
│  ⛔ 03 POLICY           REFUSED                                  0.14s        │
│  ⊘ 04 ROUTING          not reached                                           │
│  ⊘ 05 EVIDENCE         not reached                                           │
│  ⊘ 06 RETRIEVAL        not reached                                           │
│  ⊘ 07 CALCULATION      not reached                                           │
│  ⊘ 08 VERIFICATION     not reached                                           │
│  ⊘ 09 APPROVAL         not reached                                           │
│  ⊘ 10 DELIVERABLE      not reached                                           │
│  — 11 AUDIT            not reported live on this host                        │
│                                                                              │
│  ┌── POLICY REFUSED ─────────────────────────────────────────────────────┐   │
│  │  SUBJECT         a.shah · operator · clearance CONFIDENTIAL           │   │
│  │  ACTION          model.invoke                                         │   │
│  │  RESOURCE        qwen2.5-vl:7b                                        │   │
│  │  CLASSIFICATION  RESTRICTED                                           │   │
│  │                                                                       │   │
│  │  REASON                                                               │   │
│  │  "qwen2.5-vl:7b is not approved for RESTRICTED material."             │   │
│  │                                                                       │   │
│  │  ── the run stopped here. No model saw this document. ──              │   │
│  │                                                                       │   │
│  │  [ open the rule → ]            [ audit → ]  (unavailable: see G4)    │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  This is a correct outcome, not a failure.                                   │
│                                                            [ record ▾ ]      │
└──────────────────────────────────────────────────────────────────────────────┘
```

The rail does **not** turn red and it does not stop (doc 01:523-555). `⊘ not reached` is
distinct from `○ pending`: the first says the system chose not to, the second says we do not
know. `— 11 AUDIT` stays `unavailable` rather than being folded into `not reached`, because
the reason is different and honesty about *which* kind of nothing we have is the point.

The containment line reads `no model saw this document` — that is derivable from the control
flow (the refusal happens at `orchestrator.py:262-263`, before `client.generate`). It does
**not** say "0 bytes left this host", because per-task egress attribution does not exist
(G10) and doc 01:557-560 forbids asserting it without a measurement.

---

## 3. THE DISCLOSURE LADDER

Borrowed from C2PA via `docs/plan/12-RESEARCH-EVIDENCE-UI.md:64-86`, including its governing
rule: **the UI presents the record, it does not adjudicate truth.**

### L1 — always visible on a completed assistant turn. Zero clicks.

The header strip, two lines, above the prose. Readable in five seconds across a room.

```
AEGIS · run 8f21a4c0 · 94.2s · qwen2.5:7b, qwen2.5-vl:7b
■3  □5  ◇1  ○1  ⇄0        9 evidence        ⚠ 2 limitations        HELD FOR APPROVAL
```

- **The five-slot verdict strip**, fixed order, glyph + count, from doc 12:648-654:
  `■ VERIFIED` (filled square, `--sovereign`), `□ SUPPORTED` (hollow, ink — **not green**),
  `◇ NEEDS_REVIEW` (`--approval`), `○ UNSUPPORTED` (muted ink, **not red**),
  `⇄ CONFLICTED` (`--critical`). Only the two extremes carry hue.
- **Evidence count.** An integer the ledger produced.
- **Limitation count**, when non-zero, from `VerificationReport.limitations`.
- **The phase**, when it is not `settled`: `HELD FOR APPROVAL`, `BLOCKED`, `FAILED`.
- **The model chain and duration**, in mono.

What L1 deliberately does **not** contain: a trust score (doc 12:838-843), a green tick or
shield (doc 12:832-836), a percentage, or the word "verified" as a standalone badge. If claim
verification has not run, `TurnDisclosure.verdicts` is `null` and **the strip is absent** —
it is never drawn as `■0 □0 ◇0 ○0 ⇄0`, which would claim we looked and found nothing.

When a run is `blocked` or `failed`, L1 is the `DenialCard`'s first three lines, not a verdict
strip. There is nothing to have verdicts about.

### L2 — one click. The turn's own body, expanded in place.

Opened by the `record ▾` control in the turn footer, or by `Enter` on a focused turn. It
expands **inside the thread**; it does not open a panel, a modal, or a route. Contents, in
order:

1. **The eleven-stage rail** in its settled state, with durations, headlines and count
   badges (`evidence ▸ 9`, `candidates ▸ 3`). This is the Proof Mode rail, inline.
2. **The evidence ledger table** — id, source, location, excerpt. Rows open L3.
3. **The verification checks** from `VerificationReport.checks` — name, kind, verdict,
   detail. A check with `passed === undefined` renders `no verdict reported` in `--approval`,
   never a tick; `result-experience.tsx:232-241` already gets this right and the logic moves
   across verbatim.
4. **The limitations list**, in full sentences, as prose.
5. **The classification signals** from `TaskProfile.signals` as pass/fail rows.
6. **The deliverable row** with filename, sha256, size, and its lock state.

L2 is the C2PA L2 obligation discharged: *signing entity, claim generator, date* becomes
*which models, which evidence, when, and what the verifier concluded*.

### L3 — two clicks. The right-hand Inspector rail.

One rail, one path (doc 12:858-861 — Perplexity's three overlapping routes to one source is a
named anti-pattern). Everything that opens L3 opens the same rail:

| Entry point | Rail shows |
|---|---|
| A citation chip in the prose | `EvidenceInspector` focused on that id, with prev/next through the ledger |
| An evidence row in L2 | Same |
| A claim's verdict glyph | `ClaimInspector` — the claim text, its `reason`, its evidence links, its recomputation |
| A stage row in the L2 rail | `StageInspector` — the stage's full payload: policy decisions, routing candidates with per-gate pass/fail, the sandbox stdout/stderr, the draft JSON |
| A conflict chip | `ConflictInspector` — the two-pane comparison of §4.7 |
| The `⇄` slot in the L1 strip | The conflict list |

The rail is **persistent, not an overlay** (doc 12:723-727): an overlay forces a judge to
choose between reading the answer and reading the evidence. At <1024px it becomes a sheet.
Focus returns to the originating chip on close (doc 01:879).

### L4 — Proof Mode. A mode over the turn, entered deliberately.

`?depth=proof` on the thread URL, scoped to `turn={taskId}`. Toggled by `p`, or by
`[ Proof ]` in the turn footer, or by `⌘K → prove`. The thread collapses to the one turn;
the transcript narrows; the eleven stages become the primary column with the full stage
inspector beside them; every panel shows its audit sequences in the footer.

L4 adds over L3 exactly four things:
- **Raw payloads.** Every stage panel gets a `view raw JSON` control. This is doc 12's ruling
  at `:912-913`: the forensic level is the raw download, not a fourth bespoke UI.
- **The reproducibility record** — model digests, prompt version, router version, policy
  version, input hashes. Mostly `unavailable` today; see §9.
- **The audit rows** this run wrote, with the chain recomputed **client-side on demand**
  (doc 12:788-791). A chain recomputed in front of the judge beats ten static green badges.
- **The sovereignty certificate**, when item 27 exists.

**The default state is L1 + prose. A judge reads it in five seconds and it overclaims
nothing.** Everything else is opt-in, and each level is one click from the one above.

---

## 4. CITATIONS IN A THREAD

### 4.1 The three layers, kept apart

- **Evidence** is a thing in the ledger with an id (`S1`, `V3`, `C1`).
- **A citation** is a `[V3]` marker in the prose with a character span. It is an *affordance*,
  not a verdict — `backend/evidence/citations.py` is explicitly "deliberately NOT
  authoritative" (`docs/plan/02:985-990`).
- **A claim** is a sentence with a verdict and a span. Verdicts attach to claims, never to
  citations and never to the whole message.

Conflating the second and the third is the failure mode this section exists to prevent. A
green chip next to a citation would say "this source is true"; a verdict on the whole message
would say "this answer is verified". Both are the overclaim C2PA warns against.

### 4.2 The inline affordance

One component, everywhere in the app, per doc 01:1286. It replaces `AnswerBody`
(`result-experience.tsx:14-39`) wholesale — and note that the existing regex is
`/(\[[SFVCE]\d+\])/g` at `:18`, which matches the four prefixes the ledger mints today plus
`E`, but **not** `X` or `H`. It becomes `/\[([SFVCXH]\d+)\]/g` (doc 01:454).

```
…the governing location is shell course 2 [V2], where the measured thickness of
9.4 mm [V2] against a prior survey value of 11.1 mm [V3] over 3.1 years gives a
corrosion rate of 0.55 mm/year [C1] and a remaining life of 6.2 years [C1].
                                                                     ▲
                                                                     │
                                          ┌──────────────────────────┴──────┐
                                          │ ∑  C1   CALCULATION      1 / 1  │
                                          │ ─────────────────────────────── │
                                          │ independent sandbox             │
                                          │ recomputation · remaining_life  │
                                          │                                 │
                                          │ (9.4 mm − 6.0 mm) / 0.55 mm/yr  │
                                          │   = 6.182 year                  │
                                          │                                 │
                                          │ derived from  V2 · V3 · S1      │
                                          │                                 │
                                          │ [ open in inspector → ]         │
                                          └─────────────────────────────────┘
```

Chip anatomy, per doc 12:602-605 and doc 01:1025-1062:
- A **modality glyph** — `¶` document, `⎗` file, `◱` vision, `∑` calculation, `⌘` execution,
  `☑` human — so the *basis* of a claim is readable without opening anything. A number
  recomputed in a sandbox and a sentence a model read off a scan are not the same kind of
  support and must not look the same.
- The **evidence id**, mono, 4px radius, 1px border. It reads as a part number, not a footnote.
- A **2px left edge** tinted by the verdict of the claim the chip sits inside. Not a fill —
  at 11px a fill reads as decoration, a 2px edge reads as a state.
- **Dangling chips render struck-through in `--critical`** with `title="No ledger entry for
  S7"`. A model citing `[S7]` when the ledger holds six items is hallucinating and the UI says
  so. This is a feature to demo, not an error to hide.

Click, `Enter`, and long-press all do the same thing; there is no hover-only path (doc
12:863-867 — hover does not exist on a projector).

### 4.3 Where the source opens

The popover is a **preview with a stepper** (`1 / 2` when a claim has two sources, doc
12:604-605). `open in inspector →` pushes the L3 rail. That is the only route to the full
source. One path: chip → popover → rail.

The rail's SOURCE pane switches on the evidence's locator. Today `EvidenceItem.location` is a
free-text string (`schemas.py:200`) so the pane renders the excerpt and the location label and
nothing more. When G7 is closed, the pane switches on `locator.kind` → page raster with bbox,
sheet cell, P&ID region, or calculation card.

### 4.4 Verdicts attach to claims

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ■  The governing location is shell course 2 [V2], where the measured         │
│     thickness of 9.4 mm [V2] against a prior survey value of 11.1 mm [V3]     │
│     over 3.1 years gives a corrosion rate of 0.55 mm/year [C1].               │
│     ──────────────────────────────────────────────────────────────────       │
│                                                                              │
│  □  SOP-INS-014 §4.1 classifies this as severity HIGH [S2].                   │
│     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                    │
│                                                                              │
│  ○  Similar vessels in this service typically show accelerated wastage        │
│     below the liquid line.                                                    │
│     ┌────────────────────────────────────────────────────────────────────┐   │
│     │ UNSUPPORTED — no evidence in the ledger supports this statement.   │   │
│     │ 1 of 10 claims in this run carry this verdict.                     │   │
│     └────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ◇  Continued operation should be approved for a further 24 months.           │
│     ┌────────────────────────────────────────────────────────────────────┐   │
│     │ NEEDS_REVIEW — a high-impact recommendation is a judgement; the    │   │
│     │ system does not mark it verified, it routes it to a competent      │   │
│     │ person.                                                            │   │
│     └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

Four rules:

1. **The verdict glyph is in the left margin, before the sentence** (doc 12:735-736). The eye
   can scan the margin alone. Position is the first channel, shape the second, hue last.
2. **`UNSUPPORTED` and `CONFLICTED` explanations are inline and always expanded** (doc
   01:1189-1209). A reader must not have to click to discover that a sentence they just read
   has nothing behind it. `VERIFIED` and `SUPPORTED` explanations are click-to-open.
3. **Every verdict carries its `reason`**, and the type enforces it — `TurnClaim.reason` is
   non-optional, mirroring the backend's guarantee (`docs/plan/02:2864`). A badge saying
   `UNSUPPORTED` without saying why is the failure mode of every compliance dashboard.
4. **The Minigraph line** (doc 12:168-171): `1 of 10 claims in this run carry this verdict`,
   so one `UNSUPPORTED` reads as a proportion rather than as a catastrophe. The denominator is
   `claims.length`, which we have.

Underline weight, not colour, carries the distinction in body text: `--sovereign` at 3.4:1 on
white fails AA for prose (doc 01:2076-2083), so verdict colour lives in the glyph, the
underline and the 2px chip edge — never in the sentence.

### 4.5 The whole message gets exactly one non-verdict

`VerificationReport.valid` is a boolean the backend computes and we render it as
`verification did not pass` / nothing. We do **not** promote it to a green "Verified" badge on
the message. The message-level statement is the five-slot count strip, which decomposes; a
single aggregate is doc 12's rejected pattern at `:838-843`.

### 4.6 Degraded rendering while G2 is open

Until claims exist, `AnswerBody.claims` is `[]`. The renderer must not fabricate a verdict.
It renders:

- prose with live citation chips (which work today — the ledger and the markers both exist);
- **no margin glyphs, no underlines, no L1 verdict strip**;
- one honest line under the prose:
  `Claim-level verification is not available on this host. 4 checks ran over the whole
  answer — open the record.`

This is doc 01's `unavailable` state applied to the answer body, and it is the state that
keeps the screen honest while the backend is half-built (doc 01:892-895, `:2199-2204`).

### 4.7 CONFLICTED — two sources side by side

Fires when `TurnClaim.verdict === 'CONFLICTED'` and `conflict_ids` is non-empty. Opens in the
L3 rail, full width, from the `⇄` glyph or the inline explanation.

```
┌── CF1 · Design pressure · V-2104 ──────────────────────── severity HIGH ─────┐
│                                                                              │
│  The system did not choose between these. It stopped and asked.              │
│                                                                              │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐          │
│  │ S2                           │  │ S7                           │          │
│  │ SOP-INS-014                  │  │ VESSEL-DATA-V2104            │          │
│  │ Rev 4 · ACTIVE               │  │ Rev 2 · ACTIVE               │          │
│  │ effective 2025-06-01         │  │ effective 2024-11-12         │          │
│  │ page 4 · §3.2                │  │ page 1 · datasheet           │          │
│  │ ──────────────────────────── │  │ ──────────────────────────── │          │
│  │ "…the design pressure for    │  │ "Design pressure   18 bar    │          │
│  │  V-2104 shall be taken as    │  │  MAWP             19 bar     │          │
│  │  16 bar for the purposes of  │  │  Design temp     150 °C"     │          │
│  │  remaining-life assessment." │  │                              │          │
│  │                              │  │                              │          │
│  │ CONFIDENTIAL                 │  │ CONFIDENTIAL                 │          │
│  └──────────────────────────────┘  └──────────────────────────────┘          │
│                                                                              │
│           ┌─────────────────────────────────────────────┐                    │
│           │  THEY DISAGREE ON                           │                    │
│           │  Design pressure                            │                    │
│           │                                             │                    │
│           │      16 bar     ⇄     18 bar                │                    │
│           │      1.60 MPa         1.80 MPa              │                    │
│           │                                             │                    │
│           │      12.5% apart · tolerance 2%             │                    │
│           └─────────────────────────────────────────────┘                    │
│                                                                              │
│  Both revisions are ACTIVE, so neither supersedes the other. No preference    │
│  was recorded.                                                               │
│                                                                              │
│  AFFECTS   K4 "…against a design pressure of 16 bar…"                        │
│            K7 "…the vessel remains within its design envelope…"              │
│                                                                              │
│  This conflict blocks release. A reviewer must resolve it.                    │
│                                                    [ escalate to reviewer → ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Five rules, each with its reason:

1. **The two panes are styled identically.** No red/green, no strikethrough, no add/remove
   diff (doc 12:850-856). A diff encodes "this version superseded that one"; two conflicting
   datasheets have no before and after, and colouring one red asserts a judgement we have not
   made.
2. **The authority chip sits above the value** — revision, status, effective date. In
   industrial work "which one is current" usually settles it, and when it does the backend
   sets `resolution: 'superseded_preferred'` with a recorded reason, which renders as a
   preference line instead of the neutral footer.
3. **A middle column names the axis of disagreement** (doc 12:740-742), with both values
   normalised to a common unit and the spread against the tolerance. Leaving the reader to
   spot the difference is the failure.
4. **The footer states the non-choice loudly** (doc 01:1269-1279). "The system did not choose
   between these" is the headline, not a caveat.
5. **Affected claims are listed**, so the conflict is connected back to the prose the reader
   just read.

Exactly two sides. Three-way conflicts decompose into pairs (doc 01:516-517) — a panel that
tries to show N sides shows none of them well.

---

## 5. WHERE THE OTHER SURFACES GO

### 5.1 The four dispositions

- **Thread-attached** — it is a property of one run and lives inside the turn (L1/L2/L4).
- **Inspector rail** — it is a detail of one object inside one run (L3).
- **Route** — it is true about the host independent of any run, or it is a corpus, or it is a
  cross-run queue.
- **Gone** — it was a view of something the thread now shows better.

These are doc 01's three grouping rules (`:406-413`) with "thread-attached" replacing
"Proof Mode stage" and one addition: **a cross-run queue is a route**, because it is a
worklist, not a truth.

### 5.2 The seven current routes

| Route | Today | Disposition | Why |
|---|---|---|---|
| **Console** `/` (`app/(app)/page.tsx`) | Single-shot dispatcher: hero, prompt box, format selector, 7-stage pipeline, one result view (`console-view.tsx:31` `Phase = 'idle' \| 'running' \| 'result'`) | **Becomes the thread surface.** `/` is the thread list + new-thread composer; `/t/[threadId]` is a thread | The console's `phase` state machine *is* a one-turn thread with no history. The composer, the attachment pills (`:556-587`), the format selector (`:512-534`) and the templates (`:686-730`) all survive; the hero, the 7-stage `DEFAULT_PIPELINE` and the single `ResultExperience` do not |
| **Ask** `/ask` | Second dispatcher for questions over already-ingested documents; has the better scope picker and the only correct snapshot-on-settle in the repo (`ask-view.tsx:224-240`) | **Gone.** Its scope picker becomes the composer's `@`-mention document scope; its `format: 'answer'` becomes the default deliverable | Doc 01 already called two dispatchers a product smell (`:396`) and ruled the scope picker "strictly better". Chat-first makes the merge structural rather than optional. **This promotes doc 01's P2 to P0 and the resequencing is deliberate** — see §8 |
| **Tasks** `/tasks` | Filterable run list; detail is a `fixed` div with no URL (`tasks-view.tsx:269-380`) | **Route survives, purpose changes.** `/runs` is a cross-thread run index — filter by status, sensitivity, actor, date. `/runs/[taskId]` becomes the real, linkable single-turn permalink that doc 01 asked for | The list is a genuine operational need (an auditor wants every run, not every thread). The fake drawer dies. `/runs/[taskId]` renders the same `<AssistantTurn/>` component in solo layout, so there is one turn renderer in the app |
| **Approvals** `/approvals` | Queue of held tasks with a review modal (`approvals-view.tsx`) | **Route survives.** It is a cross-run worklist for a different person | See §6. The review pane changes from a bespoke modal to the solo turn renderer |
| **Registry** `/registry` | Four tabs: models, SOPs, ingested files, vector search (`registry-view.tsx:24-29`) | **Route survives, renamed `/knowledge`** with tabs `documents · models · diagrams · search` | Doc 01:772. It is a corpus, not a run. The `search` tab stays as an *instrument* (prove the retriever works) even though asking in the thread is now the normal way to query |
| **Security** `/security` | Sovereignty counters + sandbox self-test (`security-view.tsx`) | **Route survives, renamed `/assurance`** with tabs `sovereignty · sandbox · policy · routing · benchmarks` | Doc 01:773. "Can I trust the system" is a different question from "can I trust this run", and only the second is thread-attached |
| **Audit** `/audit` | Hash-chained event ledger with real chain verification (`audit-view.tsx`) | **Route survives, untouched.** Plus a thread-attached projection: stage 11 of each turn links into it filtered by `task_id` | Doc 01:774 calls it the best screen in the app and it is. An auditor lives here all day and must reach it without knowing it is "assurance" |

### 5.3 The five surfaces the roadmap still requires

| # | Surface | Disposition | Where exactly |
|---|---|---|---|
| **24** | **Proof Mode** | **Thread-attached mode (L4).** Not a route, not a tab | `/t/[threadId]?turn={taskId}&depth=proof` and `/runs/[taskId]?depth=proof`. The toggle lives in the turn footer; `p` toggles it; `⌘K → prove` navigates to it. Doc 01:365-368 and `:924-927` hold: proof is a layer over the thing making the claim, and the mode lives in the URL so it is linkable and survives refresh |
| **22** | **Policy Explorer** | **Split, as doc 01 split it (`:375`).** Per-decision → **thread-attached**, stage 03 of the turn, and the `DenialCard` of §2.5-C. The rulebook → **route**, `/assurance?tab=policy`, backed by the existing `GET /api/policies` (`system.py:187-198`) | A denial is the product's best demo moment and it must appear in the conversation where the refusal happened. The rulebook is host-wide truth |
| **23** | **Routing Explorer** | **Thread-attached**, stage 04 of the turn, opened in the L3 rail as a candidate table | `RoutingDecision.candidates` already ships in `task.model_selected` (`orchestrator.py:245`) and on `Task.routing` (`schemas.py:187`). Doc 01:376 is right that a standalone routing tab "would have to invent a run to explain". The model **estate** (what is installed, digests, integrity) is corpus → `/knowledge?tab=models`, using the existing `GET /api/models/status` (`system.py:152-173`) |
| **18** | **P&ID Viewer** | **Route + embeddable panel.** `/knowledge/pid/[documentId]` for browsing a diagram; the same `<PidCanvas/>` mounts in the L3 rail when an evidence item's locator is a region | Doc 01:377 — build the canvas once, mount it twice. A judge asking "show me that on the drawing" must get it from the citation, not from a separate tab |
| **33** | **Benchmark Dashboard** | **Route.** `/assurance?tab=benchmarks`, detail `/assurance/benchmarks/[suite]/[caseId]` | Host-wide measured truth with no run subject. Roadmap line 153 requires drilling into failed cases, which is a table, not a message |

### 5.4 The final navigation model

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ▲ AEGIS    Threads    Approvals ②    Knowledge    Assurance    Audit        │
│                                                  ⬤ sovereign   a.shah ▾      │
└──────────────────────────────────────────────────────────────────────────────┘
```

Five top-level items, down from seven.

```
/                          thread list + new-thread composer
/t/[threadId]              the thread
  ?turn={taskId}           scroll to and focus a turn
  &depth=proof             L4 over that turn
/runs                      cross-thread run index (was /tasks)
/runs/[taskId]             single-turn permalink, solo layout
  ?depth=proof             L4
  ?review=1                reviewer layout with the decision bar (§6)
/approvals                 held-turn queue
/knowledge                 ?tab=documents|models|diagrams|search
/knowledge/pid/[docId]     P&ID viewer
/assurance                 ?tab=sovereignty|sandbox|policy|routing|benchmarks
/assurance/benchmarks/[suite]/[caseId]
/audit                     ?task_id= filter
```

`/runs` is deliberately not in the top nav: it is reached from `⌘K → runs`, from the thread
list's `All runs →` link, and from `/audit`. It is an operational index, not a daily surface,
and putting it in the nav would reintroduce the "chat is just one of seven tabs" reading that
the reframe exists to end.

**What is gone:** `/ask` (merged into the composer), `/tasks` as a primary surface (becomes
`/runs`, demoted), the 7-stage `DEFAULT_PIPELINE` (`lib/presentation.ts:62-70`), and
`agent-pipeline.tsx` (163 LOC, superseded).

Keyboard: `g` then `t`/`a`/`k`/`s`/`u` → Threads / Approvals / Knowledge / Assurance / aUdit.
Every binding is disabled while the composer has focus **except `Esc` and `⌘K`** — doc
01:2047-2049, and a docked composer makes this rule load-bearing rather than incidental.

---

## 6. APPROVAL IN A THREAD

### 6.1 The shape of the problem

`ApprovalRecord` (`schemas.py:276-285`) is a state, not a message: `required`, `reasons`,
`approver_roles`, `decision`, `reviewer_id`, `reviewer_name`, `comment`, `decided_at`. The
transition is guarded: `decide_approval` refuses unless the task is `AWAITING_APPROVAL`
(`task_service.py:518-519`), the caller holds `approval.decide` (`:520-522`), **and** the
caller's role is in `approver_roles` (`:523-528`). The reviewer is usually not the requester.

So a thread has a hole in it: the requester's conversation stops mid-sentence, and the person
who can continue it is somewhere else.

### 6.2 The requester's view — the hold is a turn state, rendered in place

The assistant turn does not end. Its `phase` becomes `held` and it renders a hold band
**inside the turn**, below the prose and above the deliverable.

```
│  ─────────────────────────────────────────────────────────────────────────── │
│  ⏸  HELD FOR APPROVAL                                                        │
│                                                                              │
│  Why                                                                         │
│   · the deliverable makes an engineering recommendation                      │
│   · the source material is classified SENSITIVE                              │
│                                                                              │
│  Who can release it        reviewer · admin                                  │
│  Waiting since             09:42:47  ·  4m 12s                               │
│                                                                              │
│  ⎗ APPROVAL-NOTE-V-2104.docx   sha 9c2f81…   48 KB                           │
│    🔒 This deliverable is held pending human approval and has not been        │
│       released.                                                              │
│                                                                              │
│  You are signed in as Plant Operator and cannot release this.                │
│                                              [ copy link for reviewer ]      │
```

Details that matter:

- **`Why` is `ApprovalRecord.reasons`**, the backend's own list, arriving live in
  `task.stage`'s `{reasons, approver_roles}` payload (`orchestrator.py:929-934`).
- **The lock message is the API's own refusal text**, verbatim from `tasks.py:158-162`. The
  screen and the server say the same sentence; a curious judge who hits the endpoint directly
  gets the identical words.
- **The waiting clock** is a clock, not progress.
- **`copy link for reviewer`** yields `/runs/{taskId}?review=1`. No notification system exists
  and we will not pretend one does.
- The composer stays enabled. The thread is not blocked — a follow-up question dispatches a
  new run. Only *this* deliverable is held.

**The requester's stream must be open for this to work.** `console-view.tsx:286` subscribes
with `enabled: phase === 'running'`, so the connection closes the instant the turn goes
`awaiting_approval` and the requester never sees the decision. The fix is in §7.2 and needs no
backend change.

### 6.3 The reviewer's view — a queue, then the same turn

`/approvals` stays a route because it is a cross-thread worklist for a different person. It is
backed by `GET /api/approvals` → `list[Task]`, gated on `approval.read` (`tasks.py:118-122`).

The queue row shows: requester, thread title, waiting time, sensitivity, the L1 verdict strip,
and the deliverable name. **The verdict strip in the queue is the point** — a reviewer should
be able to triage by looking at `■3 □5 ◇1 ○1 ⇄0` before opening anything, and a row carrying
`⇄1` should sort to the top.

Opening a row navigates to `/runs/[taskId]?review=1`. That renders **the same
`<AssistantTurn/>` component the requester saw**, in solo layout, at L2 by default, with the
original user turn above it for context. Doc 01:881 is the rule: *the reviewer sees exactly
what the operator saw.* One turn renderer in the app means a reviewer can never be shown a
different summary from the requester's — which, on a system that records who approved what,
is a correctness property and not a convenience.

The decision bar is docked where the composer sits in a thread:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  REVIEW                              a.reviewer · Approving Reviewer          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Reviewer notes…                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ⚠ 1 claim is UNSUPPORTED. Open the record before releasing.   [ record ▾ ]   │
│                                                                              │
│  [ Edit decision ]            ( Approve & release )      ( Reject )          │
└──────────────────────────────────────────────────────────────────────────────┘
```

Two behaviours borrowed from Relativity via doc 12:246-248, `:263-264`:

- **Coding is modal.** The decision buttons are inert until `Edit decision` is pressed. An
  approval that can be granted by a stray click is not an approval.
- **The warning line is computed from the turn's own verdicts**, and while G2 is open it falls
  back to `VerificationReport.valid === false` plus the limitations count. It never says
  "all checks passed" unless every check reported `passed === true`.

`REQUEST_REVISION` (roadmap line 115) does not exist in the contract — `ApprovalDecisionRequest`
is `Literal["approve","reject"]` (`schemas.py:288`). We ship two buttons and ask for the third
(§9, ASK-8). We do not render a disabled third button implying it is coming.

### 6.4 The decision comes back as its own turn

`task.approval_decided` (`task_service.py:559-567`) carries `{decision, reviewer, comment,
status}` and the event's `task_id` is set, so the SSE ownership filter (`system.py:401-405`)
passes it to the requester's stream. A `DecisionTurn` is appended to the thread:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ✓  APPROVED by R. Nair · Approving Reviewer              09:58:31           │
│                                                                              │
│     "Corrosion rate and remaining life check out against the survey.          │
│      The 24-month recommendation is mine, not the system's."                 │
│                                                                              │
│     Released   APPROVAL-NOTE-V-2104.docx                                     │
│     ─────────────────────────────────────────────────────────────────────    │
│     ↑ applies to the run above · audit entry pending (see G4)                │
└──────────────────────────────────────────────────────────────────────────────┘
```

It is visually distinct from an assistant turn: a human name, a rule instead of a bubble, no
model chip, no stage rail. It is authored by a person and the interface must never let it be
mistaken for model output. The held turn above it simultaneously moves to `settled`, its hold
band collapses to a one-line `Released by R. Nair at 09:58:31`, and the deliverable unlocks
because `Deliverable.released` flipped (`task_service.py:551-552`).

On rejection the same shape renders in `--critical` with `Returned to submitter`, and the
deliverable stays locked.

### 6.5 The one honest gap

There is no push channel to tell a reviewer a task is waiting. `/approvals` polls, and the nav
badge `Approvals ②` is a count from `GET /api/approvals`. We do not render a bell, a toast on
a page the reviewer is not looking at, or an "email sent" confirmation. The `copy link for
reviewer` control exists precisely because the honest answer today is "send them the link".

---

## 7. STATE AND DATA FLOW

### 7.1 Ownership

No global store (doc 01:1526-1545 — not Redux, not Zustand, not Jotai; and do not install
React Query, doc 01:1500-1512).

| State | Owner | Lifetime |
|---|---|---|
| Thread index (ids, titles, task-id membership) | `ThreadIndexProvider`, backed by `localStorage` + `GET /api/tasks` | App |
| One thread's turns and per-turn run state | `ThreadProvider` at `/t/[threadId]`, a `useReducer` holding `Map<taskId, RunState>` | Route |
| Evidence inspector (open, focusId, ledger source) | `InspectorProvider` at the app layout | App |
| Sovereignty heartbeat | `SovereigntyProvider` — **one** `EventSource` fanned out | App |
| Session / role | `RoleProvider` (`components/role-context.tsx`), kept verbatim | App |
| Toasts | `ToastProvider`, unchanged | App |

Doc 01's trip-wire (`:1538-1545`) was "a third consumer of proof state outside `/tasks/[id]`".
Under this model there is **one** consumer — `ThreadProvider` — and `/runs/[taskId]` mounts
the same provider with a single-turn thread. The trip-wire is not tripped; the reducer simply
holds a map instead of a singleton. If a future surface needs run state outside a thread, that
is the signal doc 01 described and we revisit then.

### 7.2 One stream per thread, not one per turn

Today `useEventStream` opens `EventSource('/api/events?task_id=…')` per component with
`enabled` gating (`use-event-stream.ts:23-27`, `console-view.tsx:284-288`). Under threads:

**`ThreadProvider` opens exactly one `EventSource('/api/events')` — no `task_id` — and
demultiplexes client-side by `StreamEvent.task_id` against the thread's turn set.**

This works today with zero backend change. The SSE endpoint's `visible()` (`system.py:401-405`)
already scopes events to the caller's own tasks unless they hold `task.read.all`, so an
unfiltered subscription is exactly "everything I am allowed to see". Three benefits:

- A thread with four turns needs one connection, not four.
- `task.approval_decided` reaches the requester even though the *decision* was made by someone
  else on a different machine — the event carries `task_id` and the requester owns that task.
- The stream stays open for the whole time the thread is open, which is what §6.2 requires.

The connection is opened when a thread mounts and closed on unmount. `sovereignty.status`
arrives on it as well; `SovereigntyProvider` subscribes to the same singleton rather than
opening a second one (doc 01:1511 — `security-view.tsx:72` currently opens its own).

### 7.3 The three-step ordering

Doc 01:801-811, adopted verbatim and extended for threads:

1. **`GET /api/tasks/{id}` is the authoritative snapshot** of one turn. It returns the whole
   `Task` — profile, plan, routing, tool calls, evidence, verification, approval, deliverables,
   policy events, answer (`schemas.py:333-348`) — plus live queue position injected at
   `tasks.py:97-99`. It works for a finished run, after a restart, and for a run that finished
   before the page opened.
2. **The stream patches the snapshot** as events arrive.
3. **On any terminal event — `task.finished`, `task.failed`, `task.blocked`,
   `task.cancelled`, `task.approval_decided` — re-fetch and replace.** Not merge. Replace.

Thread load is: hydrate turn skeletons from the local index → `GET /api/tasks?limit=…` for
statuses and titles → `GET /api/tasks/{id}` in parallel for every turn in the thread →
open the stream. On a local host this is a handful of sub-50ms requests, so there are **no
skeletons anywhere** (doc 01:881-895); the thread renders when it renders.

`ask-view.tsx:224-240` already implements step 3 correctly and is the pattern to generalise.
`console-view.tsx` does not: it reads `data.task` on `task.stage` (`:197-207`) and on
`task.finished` (`:268-277`), and **neither event carries a `task` key** — `_stage` emits
`{status, message, ...}` (`orchestrator.py:207-211`) and `task.finished` emits
`{status, duration_ms}` (`:1002-1006`). It also reads `data.evidence` on `task.evidence`
(`:250`), which emits `{mode, count, items}` (`:792-796`), and `data.verification` on
`task.verified` (`:254`), which emits the report unwrapped (`:892-896`). Four dead branches,
and no handler for `task.answer` at all — which is why the console's result view renders an
empty answer against an empty evidence list. **Step 3 is not an optimisation here; it is the
only thing that would make the current console show a result at all.**

### 7.4 The reconciliation rule

> **The snapshot is truth. The stream is an optimisation.**
>
> A stream patch may only move a turn **forward** in `TURN_PHASE_RANK`, and may only write a
> field the current snapshot has not already settled. A snapshot **replaces** the turn
> wholesale and is authoritative even where it contradicts a patch already applied. A patch
> that would move a turn backwards is discarded and counted in `sync.unmapped`.

Monotonicity matters because the bus replays: on connect, `bus.replay(task_id, limit=50)`
(`events.py:80-86`, called at `system.py:408-411`) re-sends up to 50 historical frames with no
marker distinguishing them from live ones. Without the rank check, reconnecting mid-run would
walk a `verifying` turn back to `retrieving`. With it, replayed frames are absorbed harmlessly.

Corollaries:

- A field the snapshot has and the stream has not (policy events, audit sequences, the full
  evidence list including silent file-read items — G8) is simply *later*, not *missing*.
- A field the stream has and the snapshot does not (`generated_code` from `task.code_generated`,
  which is never persisted on `Task`) is marked `stream_only` and survives replacement. This is
  the single exception to "replace, don't merge", and it is explicit rather than incidental.
- `sync.events_received` is labelled **events received**, never "events emitted". We cannot
  know the second without G5.

### 7.5 Designing for the drop

`EventBus.publish` does `queue.put_nowait` and on `asyncio.QueueFull` **silently continues**
(`events.py:47-52`), with `MAX_QUEUE = 256` (`:19`). A subscriber that stalls loses events with
no error, no gap marker and no way to detect it — `_sse()` writes no `id:` field
(`system.py:436-437`), so `Last-Event-ID` cannot help.

Note also that `sovereignty.status` alone fills the queue at ~0.5 events/sec, so a tab
backgrounded for a few minutes is a realistic drop scenario, not a theoretical one.

Four mitigations, none of which require the backend:

1. **The snapshot on every terminal event** (§7.3). Any drop during a run is corrected within
   one round-trip of the run ending.
2. **Poll-reconcile while running.** Every 15s, for every turn whose phase is `running` or
   `queued`, `GET /api/tasks/{id}` and reconcile under the §7.4 rule. On localhost this is
   free. The stream animates; the poll corrects. This is the honest answer to an undetectable
   drop: do not pretend the stream is reliable, add a cheap loop that makes its unreliability
   invisible.
3. **Reconcile on `visibilitychange` → visible**, and on `EventSource.onerror` followed by
   reconnect. Both are the "I have probably missed things" signal.
4. **rAF-batched dispatch.** `use-event-stream.ts:47` calls `setLastEvent` per message — one
   React render per SSE event, unbatched, at 0.5 sovereignty events/sec plus bursts. Buffer
   into a ref, flush once per frame (doc 12:415-419). The eleven rows exist from t=0 so a flush
   mutates rows rather than growing a list; zero layout shift by construction.

### 7.6 Server-rendered vs client

Doc 01:1465-1494 governs; the boundary shifts slightly because a thread is inherently live.

**Server components:** every `page.tsx` / `layout.tsx` / `error.tsx` / `loading.tsx`; the
static panels (`InspectorField`, `RuleExcerpt`, `DenialCard`, `VerdictBadge`, `MetricTile`);
every `shared/format/*` helper. `app/(app)/t/[threadId]/page.tsx` reads `params` and
`searchParams` (`turn`, `depth`) and passes them down — **it does not fetch**. The session
token is an HttpOnly cookie the browser sends, and the turn snapshot is re-fetched on every
terminal event anyway, so server-fetching would create a second source of truth (doc
01:1473-1487).

**Client components:** `ThreadProvider` (one client boundary containing the whole transcript),
`Composer`, `AssistantTurn` shell, `Timeline`, `Inspector`, `CommandPalette`, `Cite` (it
dispatches to context). Most of the turn's children are presentational and can stay server
components passed as `children`.

**Accessibility of a live transcript.** Doc 01:2058-2068 is strict: live regions announce
*transitions only, never payloads*. A streaming transcript is a live region by default and
would violate this. So: the transcript is **not** a live region. A single visually-hidden
`aria-live="polite"` element per running turn announces stage transitions only — `"Stage 6 of
11, retrieval, completed in 1.9 seconds"` — and `aria-live="assertive"` exactly once, on a
policy denial, which is the one event worth interrupting for. The evidence list, the candidate
table and the claim list are never inside a live region. Under `prefers-reduced-motion` the
running marker is a static filled ring.

---

## 8. MIGRATION

Six steps. Each leaves `main` working and demoable. Steps 1–4 need **no backend change at
all**; steps 5–6 consume the asks in §9.

### Step 0 — the honesty pass (half a day, no new UI)

This is doc 01's Phase 0 (`:2096-2117`) and it is the prerequisite for everything.

- Fix the four dead SSE branches in `console-view.tsx` (`:197-207`, `:250-252`, `:254-265`,
  `:267-280`) and add the missing `task.answer` handler. **After this the existing console
  shows a real answer and real evidence for the first time.** Do this first because it makes
  every later step verifiable.
- Add a `task.queued` consumer. `Task.queue_position` is wired end to end
  (`schemas.py:347-348`, `tasks.py:97-99`, `task_service.py:307-316`) and has never displayed.
- rAF-batch `use-event-stream.ts` (`:47`).
- Widen the citation regex to `[SFVCXH]` (`result-experience.tsx:18,22`).
- Delete `shadow-[0_0_8px_…]` on done/failed markers and `animate-pulse` on `held`
  (`agent-pipeline.tsx:22,30,36`) — a `held` stage is waiting on a person, not working
  (doc 12:877-882).
- Split `lib/types.ts` into `lib/contract/` (mirrors Pydantic, no `// UI legacy aliases` —
  `types.ts:122-125`, `:135-138`) and `lib/view/`. Drop the junk `TaskStatus` members at
  `types.ts:14,18-24` (`'succeeded'`, `'AWAITING APPROVAL'`, `'DELIVERED'`…) which no backend
  enum produces (`schemas.py:55-68`).

**Exit:** no number on any screen is unsourced; the console renders a real result; build passes.

### Step 1 — one stream, one snapshot rule (1 day, no new UI)

- `ThreadProvider` skeleton: one `EventSource('/api/events')`, demultiplex by `task_id`, the
  §7.4 reconciliation rule, poll-reconcile at 15s, snapshot-on-terminal.
- Re-point the existing `ConsoleView` at it, keeping the current single-run layout.
- Move `SovereigntyProvider` onto the same singleton stream (`security-view.tsx:72` stops
  opening its own).

**Exit:** the console behaves identically but survives navigation, reconnection and dropped
events. This is `ask-view.tsx`'s resilience (`:180-240`) generalised and made the default.

### Step 2 — the transcript (2–3 days)

- `Thread`, `Turn`, `AssistantTurn` types and the turn renderer. Eleven-stage rail inline;
  `DEFAULT_PIPELINE` and `agent-pipeline.tsx` deleted.
- `/` becomes thread list + composer; `/t/[threadId]` the thread. `localStorage` thread index
  reconciled against `GET /api/tasks`; tasks not in the index land in `Ungrouped runs` with
  `origin: 'local-index'` shown.
- Composer absorbs `ask-view.tsx`'s scope picker (`:344-434`) as `@`-mention document scope,
  plus attachments and the format selector. **`/ask` is deleted in this step**, not deferred.
- `/tasks` → `/runs`, and `/runs/[taskId]` becomes a real route rendering the solo turn. The
  `fixed`-div fake drawer (`tasks-view.tsx:269-380`) dies.
- L1 (minus verdicts, which do not exist) and L2 ship.

**Exit:** a multi-turn conversation works end to end against today's backend. Nine of eleven
stages light from real events; two say `unavailable`.

### Step 3 — the inspector rail and the disclosure ladder (2 days)

- `InspectorProvider` + persistent right rail; `evidence-drawer.tsx` (fixed overlay,
  `:396-405`) retired in its favour.
- `Cite` chips with modality glyphs and dangling-citation rendering.
- Stage inspectors for routing (candidate table from `RoutingDecision.candidates`), calculation
  (sandbox stdout/stderr, generated code, retries), verification (the `checks` list).
- L4 Proof Mode as `?depth=proof`, with `p` and `⌘K → prove`.

**Exit:** doc 01's one-click rule is satisfied from inside a conversation. Proof Mode exists
as a mode over a turn, exactly where doc 01 put it, with a different subject.

### Step 4 — approval in the thread (1 day)

- Hold band inside the turn; `DecisionTurn`; `/approvals` queue rows carrying the turn summary;
  `/runs/[taskId]?review=1` with the docked, modal decision bar.
- `approvals-view.tsx`'s bespoke review modal is replaced by the solo turn renderer.

**Exit:** a requester on one machine and a reviewer on another see the same record, and the
decision lands in the requester's thread live. All of §6 except `REQUEST_REVISION`.

### Step 5 — claims (needs ASK-2)

- `TurnClaim`, margin glyphs, span underlines, always-expanded `UNSUPPORTED`/`CONFLICTED`
  explanations, the L1 five-slot strip.
- Claim-verdict tinting on citation chips.
- The reviewer's triage warning becomes claim-derived.

**Exit:** §4 is real rather than degraded.

### Step 6 — conflicts, located evidence, audit (needs ASK-3, ASK-5, ASK-4)

- `ConflictInspector` two-pane comparison.
- Evidence locators → page raster with bbox, sheet cell, P&ID region; `PidCanvas` mounts in the
  rail.
- Stage 11 AUDIT stops saying `unavailable`; client-side chain recomputation in L4.

### Summary: what ships without touching the backend

| Ships now | Needs backend |
|---|---|
| The whole thread and turn model (G1 worked around with a local index) | Server-owned threads (ASK-1) |
| Nine of eleven live stages | POLICY and AUDIT stages (ASK-4, ASK-6) |
| Citation chips, dangling detection, evidence ledger, L1 counts, L2, L3, L4 | Claim verdicts, spans, the verdict strip (ASK-2) |
| Approval hold, reviewer flow, decision turn | `REQUEST_REVISION` (ASK-8) |
| One stream, snapshot reconciliation, poll-reconcile | `Last-Event-ID` resume (ASK-7) |
| Conflict *rendering* | Conflict *detection* (ASK-3) |
| Evidence as text + location label | Located evidence, page rasters, bboxes (ASK-5) |

---

## 9. THE BACKEND ASKS

Prioritised. "Demo works without it?" is the only column that matters when time runs out.

### P0 — the reframe is materially weaker without these

**ASK-1 · Thread identity.** `DEPENDS-ON: Backend/Workflow`

```python
# backend/core/schemas.py — Task
thread_id: str | None = None          # groups turns into one conversation
parent_task_id: str | None = None     # the turn this one answers after

# TaskCreateRequest
thread_id: str | None = None          # omit to start a new thread; server mints one

# new
GET /api/threads?limit=50   -> list[ThreadSummary]
    ThreadSummary { id, title: str | None, created_at, updated_at,
                    turn_count: int, last_status: TaskStatus,
                    held_count: int, owner_id, owner_display_name }
GET /api/threads/{thread_id} -> { thread: ThreadSummary, tasks: list[Task] }
PATCH /api/threads/{thread_id} { title: str } -> ThreadSummary
```

*Without it:* the client-side index works and is honest (`origin: 'local-index'`), but threads
do not survive a different browser, are invisible to a reviewer opening a shared link, and
cannot be listed for another user. **Demo works. Multi-user demo is weaker.**

**ASK-2 · Claims with spans and verdicts.** `DEPENDS-ON: Backend/Verification` — this is
`docs/plan/02:2448-2478` and doc 01's D4, unchanged. Add to `VerificationReport`
(`schemas.py:266-272`), all fields defaulted so nothing breaks:

```python
claims: list[Claim] = Field(default_factory=list)
claims_by_status: dict[str, int] = Field(default_factory=dict)
blocked_claim_ids: list[str] = Field(default_factory=list)
review_claim_ids: list[str] = Field(default_factory=list)
```

with `Claim.span: tuple[int, int] | None` offsets into `Task.answer`, `Claim.status` on the
five-value enum, and a non-empty `Claim.reason`. Plus SSE `task.claim`
`{claim_id, type, impact, status, reason, evidence_ids}`.

*Without it:* §4 renders degraded per §4.6 — chips work, verdicts do not exist, the L1 strip is
absent. **The demo runs, but the product's headline claim — claim-level verification — has no
surface.** This is the single highest-value backend item for the reframe.

**ASK-3 · SSE events added to the allow-list, and the allow-list made non-fatal.**
`DEPENDS-ON: Frontend` (this one is ours)

`use-event-stream.ts:67-93` is an explicit array and `_sse()` always writes an `event:` line
(`system.py:437`), so `onmessage` is dead code (`:38-52`) and any event not in the array is
received by the browser and thrown away in silence. The comment at `:55-66` already documents
this and names the queue-position bug it caused. Replace the array with a wildcard listener
registration driven by a generated event catalogue, and surface unknown names in
`sync.unmapped` rather than dropping them. Until then, every backend agent adding an event
**must** add it here in the same change.

### P1 — needed for the honest version of a stage

**ASK-4 · Audit linkage.** `DEPENDS-ON: Backend/Audit`

```python
# Task
audit_sequences: list[int] = Field(default_factory=list)
# and confirm / add
GET /api/audit?task_id={id}  -> list[AuditEvent]
```

*Without it:* stage 11 renders `unavailable` and the denial card's `[ audit → ]` is disabled.
**Demo works; the "every decision is in the chain" story has no click-through from the turn.**

**ASK-5 · Typed, located evidence.** `DEPENDS-ON: Backend/Evidence` — this is
`docs/plan/02:458-544` and doc 01's D2/D3. Concretely, on `EvidenceItem`
(`schemas.py:192-207`): widen `kind` to include `"execution"` and `"human"`, mint `X` and `H`
in `EvidenceLedger.PREFIXES` (`orchestrator.py:90-95` — the docstring at `:86-87` already
claims `X` exists), and add `page`, `bbox`, `source_id`, `content_sha256`,
`extraction_method`, `extraction_model`, `document_status`, `revision`. Plus
`GET /api/tasks/{id}/evidence/{eid}/page.png`.

*Without it:* evidence opens as text with a location label. No page raster, no bbox, no P&ID
overlay. **Demo works. The "look, page 17" moment does not exist** — and
`docs/plan/02:4943-4946` calls that the one demo to run in front of a judge.

**ASK-6 · Policy decisions over SSE.** `DEPENDS-ON: Backend/Policy`

```python
# every gateway decision, ALLOW and DENY alike
events.publish("task.policy_decision", task_id=..., data={
    "id": str, "subject": {...}, "action": str, "resource": str,
    "resource_classification": str,
    "decision": "allow" | "deny" | "require_approval",
    "checks": [{"label": str, "passed": bool, "detail": str}],
    "rule": str | None, "rule_excerpt": str | None,
    "policy_version": str, "reason": str, "audit_sequence": int | None,
})
```

`PolicyEvent` already accumulates on `Task.policy_events` (`schemas.py:342`), so the snapshot
path exists; this makes stage 03 live and gives the `DenialCard` its `checks` list and rule
excerpt.

*Without it:* stage 03 is `unavailable` while running and fills in on snapshot; the denial card
shows `reason` and `rule` but no pass/fail checks. **Demo works, and the denial moment is still
strong — it is just less forensic.**

**ASK-7 · SSE `id:` field.** `DEPENDS-ON: Backend/Workflow` — doc 01's D10.
`_sse()` (`system.py:436-437`) writes `id: {monotonic}` alongside `event:` and `data:`, and
the generator honours `Last-Event-ID`. Also raise `bus.replay(limit=50)` (`system.py:409`) or
key it off the resume point.

*Without it:* poll-reconcile (§7.5) covers it and is cheap on localhost. **Demo works.**
Required before roadmap item 29 (durable recovery).

### P2 — completes the design

**ASK-8 · `REQUEST_REVISION`.** `ApprovalDecisionRequest.decision` widens to
`Literal["approve", "reject", "request_revision"]` (`schemas.py:288`); `ApprovalRecord.decision`
gains `"revision_requested"`; the task returns to a re-runnable state and the earlier approval
is invalidated if the output hash changes (roadmap lines 115-118).
*Without it:* two buttons. **Demo works.**

**ASK-9 · Conflict detection.** `docs/plan/02:3289-3331`'s `EvidenceConflict`, plus
`GET /api/tasks/{id}/conflicts` and SSE `task.conflict`.
*Without it:* the `⇄` slot is always 0 and §4.7 never fires. **Demo works, and the conflict
demo is the one that would most impress an industrial judge.** Promote to P1 if Demo 1 is
extended to include two disagreeing datasheets.

**ASK-10 · File-read evidence emits `task.evidence`.** `orchestrator.py:762-768` adds
attachment evidence to the ledger without publishing anything. One `_emit` call with the same
`{mode: "file", count, items}` shape as `:789-797`.
*Without it:* an attachment-only run shows no evidence accumulating live, then N items after
the snapshot. **Demo works; the mid-run screen in §2.5-B is emptier than it should be.**
This is the cheapest item on the list.

**ASK-11 · Per-task egress attribution.** `SovereigntyStatus` scoped to a task window, or an
explicit statement that it is unavailable. Doc 01's D11: *the UI will render `unavailable`
rather than `0`.*
*Without it:* `TurnDenial.containment` is omitted entirely. **Demo works. We say less, which
is correct.**

**ASK-12 · Keep every response Pydantic and expose `/openapi.json`** so `lib/contract/` is
generated and `contract:check` fails CI on drift (doc 01's D12). This is the mechanism that
stops `lib/types.ts`'s `// UI legacy aliases` (`:122-125`, `:135-138`) from growing back.

### What I would cut

- **Server-owned threads (ASK-1) before ASK-2.** A locally-indexed thread that shows real
  claim verdicts beats a server-indexed thread that shows none.
- **The P&ID viewer inside the rail.** Ship it as a route first; the embedded mount is a
  second-day change once `PidCanvas` exists.
- **The `/runs` index's filter machinery.** A date-ordered list with a status filter is enough;
  `tasks-view.tsx`'s five-way filter set is more than the demo needs.
- **The Compact ⇄ Timeline toggle** on the stage rail (doc 12:905-906). Compact only. A jittery
  timeline is not defensible.
- **Thread titling.** Threads stay `null`-titled and render their first user turn truncated.
  Auto-titling from model output is exactly the kind of invented text `lib/presentation.ts:4-9`
  warns about, and manual titling is a feature nobody will use in a six-minute demo.

---

## 10. Cross-agent dependencies

- `DEPENDS-ON: frontend-architecture` — this document moves Proof Mode's subject from
  `/tasks/[id]` to a turn and promotes the Console/Ask merge from P2 to P0. Doc 01's component
  contracts (`<Cite/>`, `<Timeline/>`, `<InspectorPanel/>`, `<VerdictBadge/>`, `<MetricTile/>`,
  `<DenialCard/>`, `Resource<T>`, the four-layer import rule) are adopted unchanged.
- `DEPENDS-ON: backend-evidence` — ASK-2 (claims with spans), ASK-5 (typed located evidence),
  ASK-9 (conflicts). §4 and §4.7 are decoration without them.
- `DEPENDS-ON: backend-security-governance` — ASK-6 (policy decisions with `checks[]` and rule
  excerpts), ASK-11 (per-task egress). The denial card in §2.5-C is the product's best demo
  moment and these are what make it forensic.
- `DEPENDS-ON: backend-workflow` — ASK-1 (thread identity), ASK-4 (audit sequences), ASK-7
  (SSE `id:`), ASK-10 (file-read evidence event).
- `DEPENDS-ON: motion-and-product-experience` — the motion budget for a thread is two
  animations: `sov-pulse` on the running stage marker and the elapsed-bar growth. A docked
  composer, a live transcript and a persistent inspector rail change the reduced-motion and
  focus-management surface; doc 04 should be read against §7.6.
