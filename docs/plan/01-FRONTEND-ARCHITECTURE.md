# AEGIS — Frontend Architecture & UX

**Agent:** Frontend Architecture & UX
**Scope:** `frontend/` only. Backend shapes are cited as requirements, never edited here.
**Reads:** `docs/plan/00-SHARED-BRIEF.md`, `docs/plan/00-ROADMAP.txt`, all 42 `.tsx`, `backend/core/schemas.py`, `backend/api/routes/*.py`, `backend/agents/orchestrator.py`, `backend/models_layer/router.py`, `backend/policy/gateway.py`.

> The roadmap's standard, applied to this layer: **the frontend's job is not to look
> trustworthy, it is to make the proof findable.** Every surface below exists to answer
> one judge question — *"show me why"* — in one click.

---

## 0. Executive summary

The frontend is **two products fighting each other**.

One is a careful, honest instrument: `audit-view.tsx`, `ask-view.tsx`, the `lib/api.ts`
no-fallback rule, `lib/presentation.ts`'s deletion of sample data. That work understands
the product's claim and defends it.

The other is a pitch deck that renders like an instrument: `registry-view.tsx`'s
fabricated GPU estate, `security-view.tsx`'s regex pretending to be the AST guard,
`approvals-view.tsx`'s invented key fingerprint, `console-view.tsx`'s **fake pipeline
simulation on API failure**, and a 993-line marketing animation scoring the system
"100%" on the sign-in page.

A judge does not have to be hostile to find the second product. They have to click
**Registry**. That is the second nav item most people press.

**The frontend work for Stage 2 is, in order:**

1. **Delete the lies** (§9). ~2,400 LOC removed. This is not cleanup, it is the highest-value
   hour of frontend work available, because every one of them is a question the team cannot answer.
2. **Build Proof Mode** (§3) as a *mode over a task*, not a new tab.
3. **Rebuild evidence as typed, clickable, locatable objects** (§4).
4. **Fold Policy Explorer and Routing Explorer into Proof Mode stages**, with a
   standing rulebook route behind them (§2).
5. **P&ID viewer and Benchmark dashboard as routes**, because they are workspaces (§2).

Nav goes from **7 tabs to 6**. All five new surfaces land without a tab sprawl.

---

## 1. Honest audit of the current frontend

### 1.1 What is genuinely well built — keep and extend

| Thing | Path | Why it's good |
|---|---|---|
| The no-fallback rule | `frontend/lib/api.ts:103-111` | The single best line of reasoning in the repo. `ApiError(0, …)` instead of sample data. This is the product's conscience and it is *written down*. |
| Audit view | `frontend/components/audit/audit-view.tsx` | The only screen that models *not knowing* as a state. `chainVerdict` at `:209-213` has three arms — `VALID` / `BROKEN` / **`UNVERIFIED`** — and `:301-303` says "This says nothing about whether it is intact." That is the standard every other screen should be held to. |
| Audit empty state | `audit-view.tsx:492-495` | "No records yet. The first task run on this host writes the opening block." Refuses to draw specimen blocks. Correct. |
| Approval forbidden state | `approvals-view.tsx:167-194` | Tells a non-reviewer *how many are held elsewhere* (`heldElsewhere`, `:32`, `:48-56`) instead of showing an empty queue that reads as "nothing to do". Real product thinking. |
| Ask view | `frontend/components/ask/ask-view.tsx` | Survives navigation via `sessionStorage` (`:46-63`, `:180-222`), re-attaches to a running SSE stream, and at `:611-617` **warns when an answer has no citations**. That warning is the most roadmap-aligned thing in the UI. |
| Download-as-fetch | `result-experience.tsx:98-144` | Reads the refusal body instead of `window.open`-ing raw JSON into a tab and claiming success. |
| Presentation-constant discipline | `lib/presentation.ts:1-18` | The docstring explaining why sample data was removed. Keep it verbatim; it is the frontend's charter. |
| Design tokens | `app/globals.css:9-109` | Restrained, complete, Tailwind v4 `@theme inline` done properly. Four semantic status colours is exactly enough. Extend, never reskin. |

### 1.2 Demo-ware — this is what breaks under questioning

Ordered by *how fast a judge finds it*.

#### ① `registry-view.tsx` — a fabricated hardware estate. **Delete today.**

```ts
// frontend/components/registry/registry-view.tsx:24-61
const LOCAL_MODELS = [
  { name: 'Qwen 2.5 72B Instruct', …, vram: '41.2 GB VRAM', speed: '48.5 tok/s',
    status: 'ONLINE · RESIDENT' },
  …
]
```

Four models, four VRAM figures, four throughput figures, four "ONLINE · RESIDENT"
badges — **none measured, none fetched**. `ModelEstateTable` (`:145-194`) renders this
constant and never calls `api.modelsStatus()` or `api.listModels()`, both of which
exist in `lib/api.ts:322-328` and are backed by `backend/api/routes/system.py:146-173`,
which returns **real** `snapshot.provider_reachable`, `resident_in_runtime`, and
`residency` from `get_model_manager().status()`.

The page header is worse:

```ts
// registry-view.tsx:95-100
meta={[
  { label: 'Models Online',   value: '4 Resident' },            // constant
  { label: 'SOPs',            value: String(sopCount || 6) },   // lies when empty
  { label: 'Indexed Chunks',  value: String(totalChunks || 142) }, // lies when empty
  { label: 'VRAM Usage',      value: '80.5 GB' },               // constant
]}
```

`sopCount || 6` and `totalChunks || 142` are the exact failure mode `lib/api.ts:103-111`
forbids: when the host has nothing, the screen asserts it has six documents and 142
chunks. And `registry-view.tsx:215` puts it in the *empty state's own text*:

> "6 standard operating procedures resident in SQLite vector table."

Also fabricated on this page: `:223` `d.chunk_count || 12`; `:271` storage status
**"ENCRYPTED RAM"** (files are plaintext on disk — `StoredFile.stored_path`,
`schemas.py:120`); `:329` "(MiniLM-L6-v2 Cosine)" hardcoded while
`KnowledgeSearchResponse.retrieval_mode` (`schemas.py:387`) is right there; `:336`
`const score = … : 0.94` — **an invented cosine similarity printed to three decimals**
at `:341`.

**Judge question that ends the demo:** *"Where does 48.5 tokens per second come from?"*

#### ② `console-view.tsx:248-288` — a fake pipeline that runs when the backend is down

```ts
} catch (err: any) {
  // If backend is in test/offline preview mode, simulate pipeline execution gracefully
  console.warn('[console] Task creation fallback simulation:', err.message)
  const stepMs = reduced ? 60 : 620
  order.forEach((stageId, i) => {
    timers.current.push(setTimeout(() => setStages(… 'active' …), i * stepMs))
    timers.current.push(setTimeout(() => setStages(… 'done' …), i * stepMs + stepMs * 0.7))
  })
  timers.current.push(setTimeout(() => {
    setIsHeld(true); setPhase('result')
    push({ title: 'Execution completed', detail: 'Deliverable generated · held pending approval' })
  }, order.length * stepMs + 300))
}
```

If the API is unreachable, the console **animates all seven stages to green on setTimeout
and toasts "Execution completed · Deliverable generated"**. Nothing ran. This is the
precise scenario `lib/api.ts:103-111` was written to prevent, implemented one file away
from it. Kill the server, press Run, and AEGIS congratulates itself.

#### ③ `security-view.tsx:215-247` — a JavaScript regex labelled as the AST sandbox

`InteractiveASTPlayground` is titled **"Live AST Code Confinement Simulator"** (`:253`)
and renders a verdict panel reading **"EXECUTION DENIED / SECURITY FAULT"** with
`AST Nodes: Module → ImportDeclaration → …` (`:351`). The implementation:

```ts
const banned = ['socket','os','sys','urllib','requests','http','subprocess','shutil','eval','exec']
banned.forEach((b) => {
  const reg = new RegExp(`\\b(import\\s+${b}|from\\s+${b}|${b}\\.)`, 'i')
  if (reg.test(code)) violations.push(`Banned symbol '${b}' detected …`)
})
const astNodes = ['Module']
if (code.includes('import')) astNodes.push('ImportDeclaration')   // :241
```

No AST. No backend call. `backend/tools/sandbox.py` (564 LOC) contains the real scanner
and this screen does not touch it. `:222-225` even seeds a **hardcoded DENIED verdict
with hardcoded AST nodes before the user types anything**.

Meanwhile `SandboxSelfTest` immediately below it (`:361-461`) *does* call the real
`api.sandboxSelfTest()`. So the page contains a real control and a fake control, styled
identically, and the fake one is bigger and above the fold.

`__pycache__`-level detail that will be noticed: `:449` renders a green `<Check/>` icon
next to `{d.status}` even when the status is `FAILED`.

#### ④ `security-view.tsx` — hardcoded zero-egress claims next to a live field

```ts
:97   { label: 'Sandbox',       value: 'CONTAINED' }           // constant
:98   { label: 'Egress policy', value: 'DENY-ALL' }            // constant
:145  <span>0 outbound sockets opened · 0 bytes egressed</span> // constant
:172  <div>127.0.0.1 : 8000</div>                              // constant
:204  <div>0 DETECTED</div>                                    // constant
:206  "Continuous psutil kernel telemetry daemon verified 0 egress."
```

`SovereigntyStatus` (`schemas.py:426-439`) already carries `data_leaving_host_bytes`,
`unapproved_connections`, `local_connections`, `dns_requests`, `violations[]`,
`monitor_active`, and `interfaces`. `ConnectionTelemetry` takes `status` as a prop at
`security-view.tsx:154` **and never reads it**. The one number on the page that *is*
live — `external_api_calls` at `:115` — is surrounded by five constants that look
identical. A reader cannot tell which is which. That is worse than showing none.

#### ⑤ `approvals-view.tsx:303-346` — a cryptographic signature that does not exist

```tsx
:308  "Interactive Cryptographic Sign-Off Seal"
:312  <KeyRound/> ECDSA SHA-256
:340  Signed by {user?.display_name} · Fingerprint: 0x8f2c...41ad
```

There is no signing anywhere in `backend/`. Ed25519 audit signing is roadmap **item 26,
unbuilt** (`backend/audit/signing.py` is in the "does not exist" list in the shared
brief). The algorithm named is ECDSA, which is not even the algorithm the roadmap
specifies. `0x8f2c...41ad` is a **fabricated key fingerprint rendered as fact**.

`PageHeader` on the same screen says deliverables are *"cryptographically locked"*
(`:154`). They are locked by `Deliverable.released` plus a permission check
(`backend/api/routes/tasks.py:156-163`) — which is a perfectly good control, honestly
describable, and the screen chose to oversell it instead.

Also: `:367` `: '0.96'` invented similarity; `:386` always-green `<Check/>` regardless
of `v.ok`.

#### ⑥ `sovereignty-status.tsx` — fabrications in the **global navigation**

This renders on every authenticated screen (`navigation.tsx:63`).

```ts
:27  const localConns = status?.local_connections ?? 3         // invents 3
:30  { label: 'Host',                value: '127.0.0.1' }      // constant
:34  { label: 'Sandbox confinement', value: 'CONTAINED' }      // constant
:35  { label: 'Audit hash chain',    value: 'VALID' }          // ← never verified
:70  Verified                                                   // constant
:88  0 OUTBOUND PACKETS · Nothing leaves this host.             // constant
```

Line 35 asserts the audit chain is valid. `api.auditChain()` is never called in this
file. `audit-view.tsx` went to real trouble to model `UNVERIFIED` as a distinct state
and the nav chip overrides it with a hardcoded `VALID` on every page including
`/audit` itself. If the chain is broken, the header says it isn't.

It also fetches once on mount (`:13-15`) and never subscribes to `sovereignty.status`
SSE, which `backend/security/sovereignty.py:199` publishes on a poll interval. So the
number is stale as well as partly fake.

#### ⑦ `three-d-layer-view.tsx` — 993 lines of scored marketing on the sign-in page

Largest file in the frontend. Rendered by `sign-in-view.tsx`. Contains:

```
:281,:478,:664,:822   Sovereignty Score: 100%
:588                  96%
:592                  91%
:715                  Memory Limit: 2 GB ✓
:929                  100%
```

Plus raw hex `#18B663` / `#70706C` / `#111111` outside the token system in ~40 places,
which means it will not follow any future token change and already drifts from
`--sovereign #16a34a`.

Zero backend calls. It is a pitch animation that scores the product perfectly, shown
before login.

#### ⑧ Firebase — a cloud identity provider inside an air-gapped product

`frontend/lib/firebase.ts` + `firebase@^12.18.0` in `package.json`.
`sign-in-view.tsx:261-320` renders a Google sign-in path when
`NEXT_PUBLIC_FIREBASE_ENABLED=true`.

The file's own docstring defends it as "a convenience layer for hosted demos". That
defence does not survive the sentence *"nothing leaves this host"* printed four
screens later. Whether or not the flag is set at judging, the **dependency and the code
path exist in the repo**, and the repo is what gets read.

#### ⑨ `console-view.tsx` hero — three constants presented as telemetry

```tsx
:386-396
  EGRESS  0 packets      // constant
  HOST    127.0.0.1      // constant
  MODEL   Qwen3 8B       // constant — the router picks the model per stage
:499  <span>RESTRICTED</span>   // every attached file, always
:551  Local: 127.0.0.1 · 0 Egress
:653  state machine · 7 stages
```

`:499` is actively wrong: the upload at `:75` sends `'confidential'`, so the chip
renders `RESTRICTED` over a file classified `confidential`. And `MODEL Qwen3 8B` is
asserted before routing has run — `RoutingDecision` (`schemas.py:179-188`) selects
per stage and the orchestrator emits `task.model_selected` per stage
(`orchestrator.py:234-236`).

`ask-view.tsx` inherits two of these (`:337` `HOST 127.0.0.1`, `:476`
`'Local: 127.0.0.1 · 0 Egress'`).

### 1.3 Structural defects that will bite during the build

**a) The SSE hook silently drops five event types.**

`hooks/use-event-stream.ts:55-74` hardcodes a `namedEvents` array. The backend's
`_sse()` (`backend/api/routes/system.py:437`) **always** writes a named
`event:` line, so `es.onmessage` (`:38`) is dead code — it can never fire. Events not in
the array are received by the browser and thrown away.

Published but not listened for:

| Event | Emitted at |
|---|---|
| `task.queued` | `backend/api/task_service.py:311` |
| `task.cancelled` | `task_service.py:365`, `orchestrator.py:954` |
| `task.model_swapped` | `orchestrator.py:273` |
| `task.model_completed` | `orchestrator.py:311` |
| `task.code_retry` | `orchestrator.py:1100` |
| `task.answer` | `orchestrator.py:1187` |
| `sovereignty.error` | `backend/security/sovereignty.py:207` |

`Task.queue_position` / `queue_ahead` exist in the contract (`schemas.py:346-348`) and
are wired end to end in the backend. **The queue UI has never worked** because the
event is dropped. Proof Mode will emit ~20 new event types; this array does not scale.

**b) Citations render only `S` and `F`.**

```ts
// result-experience.tsx:15
const parts = text.split(/(\[[SF]\d+\])/g)
```

`EvidenceLedger.PREFIXES` in `orchestrator.py:90-95` already mints **S / F / V / C**
(and the docstring at `:85-87` names **X** for sandbox output). So today, a `[V9]`
vision citation or a `[C3]` recomputation citation **renders as inert text**. The
backend's evidence model is already ahead of the frontend's renderer, and the roadmap
(item 3, lines 103-104) adds `X` and `H` on top.

**c) `lib/types.ts` has rotted into a union of two eras.**

`TaskStatus` (`:3-24`) contains both `'awaiting_approval'` and `'AWAITING APPROVAL'`,
both `'failed'` and `'FAILED'`. `EvidenceItem` (`:111-127`) carries `// UI legacy
aliases`: `source`, `clause`, `similarity` shadowing `source_document`, `location`,
`score`. `VerificationCheck` (`:129-140`) carries `label`/`result`/`ok` shadowing
`name`/`detail`/`passed`. Every consumer then writes the same defensive coalesce:

```ts
const sim = typeof e.similarity === 'number' ? e.similarity
          : (typeof e.score === 'number' ? e.score : 0.95)   // ← and invents 0.95
```

appearing at `evidence-drawer.tsx:49` and `result-experience.tsx:194`. **The legacy
aliases are the direct cause of the invented `0.95` / `0.96` / `0.94` scores** — the
third branch of a three-way coalesce had to be *something*, and nobody made it `null`.
Fix the type, and the fabrication has nowhere to live.

**d) Verification defaults to "passed".**

```ts
// result-experience.tsx:219
const passed = v.ok !== undefined ? v.ok : (v.passed !== undefined ? v.passed : true)
```

Unknown → pass. On a verification screen. Then `:227-229` renders a `<Check/>` inside a
coloured circle for both branches, so a failed check is a red circle with a tick in it.

**e) Dead weight.**

`sovereignty-topology.tsx` (559 LOC) and `floating-telemetry-hud.tsx` (274 LOC) are
**imported by nothing**. `three`, `@react-three/fiber`, `@types/three` are declared in
`package.json` and **imported by nothing** (`three-d-layer-view.tsx` is CSS 3D, not
three.js). `@vercel/analytics` is declared and unimported — a telemetry SDK in the
dependency tree of an air-gapped product, which will show up in the SBOM the roadmap
requires at item 36 line 165.

`package.json:2` — `"name": "my-project"`. `app/layout.tsx:19` — `generator: 'v0.app'`.
Both visible to anyone who opens the repo or View Source.

**f) No error boundaries, anywhere.** One thrown render in any view blanks the
application. Under demo pressure with a live SSE stream feeding `setState`, this is a
real risk, not a hypothetical.

**g) Everything is `'use client'`.** All 8 routes are 5-line files that render a
single client component. Nothing uses the App Router's server layer. Not fatal — the
app is local and latency-free — but it means every byte of `lib/types.ts` and every
icon ships to the browser, and the offline bundle (item 36) carries it.

---

## 2. Information architecture

### 2.1 The rule this IA is designed against

> **A judge must reach the proof of any on-screen claim in one click.**

Not one *navigation*. One click. That forces a specific structure: proof is not a
destination you navigate to, it is a **layer you toggle over the thing making the
claim**. The moment "Proof" becomes a top-level tab, proving a claim costs three
clicks — tab, find the run, find the stage — and the judge stops doing it.

### 2.2 Verdict on each of the five new surfaces

| # | Surface | Verdict | Where it lives | Why |
|---|---|---|---|---|
| **24** | **Proof Mode** | **MODE** | `/tasks/[id]?view=proof` + `<ProofToggle/>` in the task header | Proof is always *proof of a run*. Detached from a task it has no subject. A toggle also gives the demo its single best beat: same screen, flip, everything is inspectable. |
| **22** | **Policy Explorer** | **PANEL** (per-decision) + **ROUTE** (rulebook) | Panel: Proof stage `policy`. Rulebook: `/assurance/policy` | Roadmap line 104 — "open the exact policy rule that caused a denial" — is a *drill-down from a decision*, i.e. a panel. Line 102's static matrix (roles × clearance × rules) is a reference document, i.e. a route. Two different jobs; splitting them is what keeps the panel small. |
| **23** | **Routing Explorer** | **PANEL** | Proof stage `routing`; model estate stays in `/knowledge/models` | Roadmap line 106 says "candidate models **per stage**". Per-stage means it is a property of a run. A standalone routing tab would have to invent a run to explain. |
| **18** | **P&ID Viewer** | **ROUTE** + embeddable panel | `/knowledge/pid/[documentId]`; the same `<PidCanvas/>` embeds in Proof stage `evidence` | It is a pan/zoom/select *workspace* with its own gesture budget and its own URL worth sharing. But roadmap line 87 ("click a result to open tag, confidence, page, bbox, evidence ID") demands it also appear inline when a claim cites a diagram region. Build the canvas once, mount it twice. |
| **33** | **Benchmark Dashboard** | **ROUTE** | `/assurance/benchmarks` | Cross-run, cross-dataset, versioned. Belongs to the system, not a task. Roadmap line 153 ("drill into failed cases") makes it a route with its own detail level: `/assurance/benchmarks/[suite]/[caseId]`. |

### 2.3 Navigation: 7 tabs → 6

**Today** (`components/navigation.tsx:12-20`):

```
Console · Ask · Tasks · Approvals · Registry · Security · Audit          (7)
```

**Proposed:**

```
Console · Tasks · Approvals · Knowledge · Assurance · Audit              (6)
```

| Nav item | Route | Contains | Change |
|---|---|---|---|
| **Console** | `/` | Dispatcher. Prompt, attachments, **document-scope picker** (from Ask), deliverable format where `answer` == today's Ask. | **Ask merges in.** Two dispatchers is a product smell; Ask *is* the console with `format: 'answer'`. `ask-view.tsx`'s scope picker (`:344-434`) is strictly better than the console's and becomes the shared one. **P2 — do not do this before Proof Mode.** |
| **Tasks** | `/tasks`, `/tasks/[id]` | Run list → run detail with **NORMAL / PROOF toggle**. | **Proof Mode lands here.** `/tasks/[id]` does not exist today — `tasks-view.tsx:269-380` uses a `fixed` div as a fake drawer with no URL. Real routes make a run linkable, which the demo needs. |
| **Approvals** | `/approvals` | Queue, diff-on-revision, APPROVE / REJECT / **REQUEST_REVISION** (item 25). | Same place, honest crypto claims. |
| **Knowledge** | `/knowledge` | Sub-tabs: `documents` · `models` · `diagrams` · `search`. `/knowledge/pid/[id]` is the P&ID route. | Renamed from Registry. `models` becomes **measured** (`/api/models/status`). `diagrams` is new and is the P&ID entry. |
| **Assurance** | `/assurance` | Sub-tabs: `sovereignty` · `sandbox` · `policy` · `routing` · `benchmarks`. | **Security absorbs the rulebooks and the benchmark dashboard.** This is the "can I trust the system" tab, as distinct from "can I trust this run" (Proof Mode). |
| **Audit** | `/audit` | Unchanged. Gains signature verification (item 26). | Best screen in the app. Don't touch it except to add the Merkle/Ed25519 verdict. |

**Why this does not become 12 tabs.** Three grouping rules, stated so future work has
somewhere to go:

1. **Per-run truth → Proof Mode stage.** Anything that only makes sense *about one
   execution* is a stage panel. Policy decision, routing trace, calculation record,
   contradiction, sandbox result, sovereignty counters for that task.
2. **System-wide truth → `/assurance` sub-tab.** Anything that describes the host's
   posture independent of any run: the policy rulebook, the routing rules, the
   benchmark suite, the sandbox self-test, the egress monitor.
3. **Corpus → `/knowledge` sub-tab.** Anything that is an artefact on disk: documents,
   models, diagrams, and searching across them.

Every future roadmap item routes cleanly: model integrity (item 20) →
`/knowledge/models`; red-team suite (item 32) → `/assurance/benchmarks`; sovereignty
certificate (item 27) → Proof Mode's `audit` stage + a download; reproducibility
compare (item 28) → `/tasks/[a]/compare/[b]`.

### 2.4 The one-click rule, enforced mechanically

Three affordances, all built in §6, all mandatory on any surface showing a measurement:

```
┌─ MetricTile ──────────────────────┐
│ EXTERNAL CALLS                    │   every number carries a provenance chip
│ 0                     [ source ]  │ ──► opens the inspector at the measurement
│ psutil · 2s poll · 14:32:07       │     that produced it
└───────────────────────────────────┘
```

1. **`<MetricTile provenance={…}/>`** — a number with no `provenance` prop is a
   **type error** (§6.7). This is how "never render a number the backend did not
   measure" becomes enforceable rather than aspirational.
2. **`<Cite id="V9"/>`** — every evidence ID anywhere in the app is the same component
   and opens the same inspector (§4).
3. **`⌘K` command palette** (§7) — `>prove <taskid>`, `>rule tool-permissions:sandbox`,
   `>evidence V9` reach anything in one keystroke sequence. This is the judge-demo
   escape hatch when the click path is three deep.

---

## 3. Proof Mode

**Roadmap item 24. The most important screen in the product.**

### 3.1 The design thesis

A timeline is the wrong metaphor if it only shows *progress*. `agent-pipeline.tsx`
already does that and it is theatre: a progress ring (`:73-80`), a laser pulse
(`:139-146`), and a "Telemetry Log" (`:151`) that prints one string.

Proof Mode is a **ledger with a time axis**. Each stage is a *claim the system makes
about itself*, and clicking it must produce the record backing that claim. The stage
list is fixed (roadmap line 111-112) so the shape is legible before anything runs —
and an unreached stage reads `PENDING`, never green.

**Failures and denials render in the same rail as successes** (roadmap line 113). A
denial is not an error state, it is *a correct outcome* — and it is AEGIS's best
demo moment. Demo 3 in the roadmap (line 723) is entirely a denial story. The timeline
must make a `DENIED` stage look like the system working, not like the system crashing.

### 3.2 The eleven stages

Exactly the roadmap's list (line 522-523), each with a fixed index so the rail is
stable:

```
01 REQUEST        what was asked, by whom, with which files, hashed
02 CLASSIFICATION input type / task type / sensitivity + the signals that decided it
03 POLICY         every ALLOW and DENY, with rule IDs            ── Policy Explorer
04 ROUTING        candidates per stage, gates, scores, digest    ── Routing Explorer
05 EVIDENCE       the ledger: typed items with locators          ── Evidence model
06 RETRIEVAL      queries, BM25+dense candidates, rerank, filters
07 CALCULATION    formula ID+version, inputs, units, output
08 VERIFICATION   claims × verdicts × conflicts
09 APPROVAL       required?, reviewer, decision, output hash
10 DELIVERABLE    file, hash, released flag
11 AUDIT          events written, chain head, Merkle root, signature
```

### 3.3 ASCII layout — desktop, proof view

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Tasks    task 8f2c41ad  ·  "Read the scanned inspection report for V-2104…"             │
│                                                       ┌──────────┬────────┐   [Certificate]│
│  DELIVERED · 42.3s · qwen2.5:7b → qwen2.5-vl:7b       │  NORMAL  │ PROOF  │   [Re-run]     │
│                                                       └──────────┴────────┘                │
├──────────────────────────┬─────────────────────────────────────────────────────────────────┤
│  PROOF RAIL              │  STAGE INSPECTOR                                                │
│  (sticky, 300px)         │  (scrolls)                                                      │
│                          │                                                                 │
│  ● 01 REQUEST      12ms  │  ┌─────────────────────────────────────────────────────────┐   │
│  │                       │  │ 04  ROUTING                              PASS · 180ms   │   │
│  ● 02 CLASSIFICATION 34ms│  │ router v3 · policy v2025.09.1 · 4 candidates · 1 eligible│   │
│  │                       │  ├─────────────────────────────────────────────────────────┤   │
│  ● 03 POLICY        8ms  │  │ STAGE: vision            requested role: vision         │   │
│  │   2 allow · 1 deny ⚑  │  │ required capabilities: vision, ocr                      │   │
│  ● 04 ROUTING      180ms │  │                                                         │   │
│  │   ▸ 4 candidates      │  │  MODEL            INST  CLASS  CAP  MEM   SCORE  VERDICT│   │
│  ◐ 05 EVIDENCE    1.2s   │  │  ─────────────────────────────────────────────────────  │   │
│  │   S4 F2 V9 C1         │  │ ▸qwen2.5-vl:7b     ✓     ✓     ✓    ✓    0.86  SELECTED │   │
│  ○ 06 RETRIEVAL          │  │  qwen2.5:7b        ✓     ✓     ✗    ✓    0.41  no vision│   │
│  │                       │  │  llama3.3:70b      ✗     ✓     ✓    ✗    0.00  not inst.│   │
│  ○ 07 CALCULATION        │  │  gpt-4o            ✗     ✗     ✓    —    0.00  unregist.│   │
│  │                       │  │                                                         │   │
│  ○ 08 VERIFICATION       │  │  WHY qwen2.5-vl:7b                                      │   │
│  │                       │  │  Highest score among candidates passing all four hard   │   │
│  ○ 09 APPROVAL           │  │  gates. Rule routing.yaml:rules[2] (vision_analysis).    │   │
│  │                       │  │  digest sha256:9c1f…8ab2  ·  [verify against manifest]  │   │
│  ○ 10 DELIVERABLE        │  │  benchmark: pid-tag-v3 · 0.91 F1 · run 2026-09-18 →     │   │
│  │                       │  │                                                         │   │
│  ○ 11 AUDIT              │  │  [ open routing.yaml:rules[2] ]  [ audit event #1184 ]  │   │
│                          │  └─────────────────────────────────────────────────────────┘   │
│  ─────────────────────   │                                                                 │
│  ⬤ live · 6 events       │                                                                 │
└──────────────────────────┴─────────────────────────────────────────────────────────────────┘
```

Markers: `●` done · `◐` running · `○` pending · `✕` failed · `⛔` denied · `⏸` held · `⊘` skipped.

### 3.4 ASCII layout — a denial (the Demo 3 beat)

A denied stage does **not** turn the rail red and stop. It renders a `DenialCard` and
the rail continues, because the run *correctly terminated*.

```
│  ● 03 POLICY        8ms  │  ┌─────────────────────────────────────────────────────────┐
│  │   1 allow · 1 DENY    │  │ ⛔ DENIED                                       03 POLICY│
│  ⛔ 04 ROUTING           │  ├─────────────────────────────────────────────────────────┤
│  ⊘ 05 EVIDENCE          │  │ SUBJECT      m.okonkwo (operator, clearance CONFIDENTIAL)│
│  ⊘ 06 RETRIEVAL         │  │ ACTION       tool.execute                                │
│  ⊘ 07 CALCULATION       │  │ RESOURCE     code_sandbox                                │
│  ⊘ 08 VERIFICATION      │  │ CLASSIFICATION  RESTRICTED  (escalated by DLP ▸)         │
│  ⊘ 09 APPROVAL          │  │                                                         │
│  ⊘ 10 DELIVERABLE       │  │ CHECKS                                                  │
│  ● 11 AUDIT       4ms   │  │  ✓ role registered                                      │
│                         │  │  ✓ tool registered in tool-permissions.yaml              │
│                         │  │  ✗ role 'operator' ∉ allowed_roles[engineer, admin]      │
│                         │  │  ✗ classification RESTRICTED > tool ceiling CONFIDENTIAL │
│                         │  │                                                         │
│                         │  │ RULE  tool-permissions.yaml:tools.code_sandbox.allowed_roles
│                         │  │       ┌───────────────────────────────────────────────┐ │
│                         │  │       │ code_sandbox:                                 │ │
│                         │  │       │   allowed_roles: [engineer, administrator]  ◄──┤ │
│                         │  │       │   max_data_classification: confidential     ◄──┤ │
│                         │  │       └───────────────────────────────────────────────┘ │
│                         │  │ REASON  "role 'operator' is not permitted to use tool    │
│                         │  │          'code_sandbox'"                                 │
│                         │  │                                                         │
│                         │  │ [ full rulebook → ]   [ audit event #1187 → ]            │
│                         │  │ ── nothing was executed; 0 bytes left this host ──       │
│                         │  └─────────────────────────────────────────────────────────┘
```

The last line is a `SovereigntyBadge` reading a real `data_leaving_host_bytes` delta
for the task window — **not** a constant. If the backend cannot scope egress to a task
(roadmap item 6, line 177), the line renders `egress attribution unavailable for this
task` rather than `0`.

### 3.5 ASCII layout — mobile / narrow (< 1024px)

The rail collapses into an accordion; the inspector becomes the expanded body. Same
components, `md:` breakpoint only.

```
┌──────────────────────────────┐
│ task 8f2c41ad   [NORMAL|PROOF]│
├──────────────────────────────┤
│ ● 01 REQUEST           12ms ▸│
│ ● 02 CLASSIFICATION    34ms ▸│
│ ⛔ 03 POLICY             8ms ▾│
│ ┌──────────────────────────┐ │
│ │ ⛔ DENIED                │ │
│ │ operator → code_sandbox  │ │
│ │ ✗ allowed_roles          │ │
│ │ [rule →] [audit →]       │ │
│ └──────────────────────────┘ │
│ ⊘ 04 ROUTING                 │
└──────────────────────────────┘
```

### 3.6 Data shape

**DEPENDS-ON: Backend/Proof agent — `GET /api/tasks/{task_id}/proof` returning `TaskProof`.**
This is the single most important new endpoint in the project. It must be reconstructible
**from persisted state**, not from the in-memory event bus: `EventBus._recent` is a
`deque(maxlen=400)` (`backend/core/events.py:28`) and `bus.replay()` is capped at 50 on
connect (`routes/system.py:409`). A run that finished before the page opened, or before a
restart, must still prove itself.

```ts
// frontend/lib/contract/proof.ts
// Mirrors backend/proof/schemas.py — regenerate, never hand-edit.

export type ProofStageId =
  | 'request' | 'classification' | 'policy' | 'routing' | 'evidence'
  | 'retrieval' | 'calculation' | 'verification' | 'approval'
  | 'deliverable' | 'audit'

export type ProofStageStatus =
  | 'pending'    // not reached
  | 'running'    // in flight
  | 'passed'     // completed, nothing to flag
  | 'flagged'    // completed with warnings (e.g. unsupported claims present)
  | 'denied'     // a policy gate refused — a correct outcome
  | 'failed'     // an error
  | 'held'       // awaiting a human
  | 'skipped'    // not applicable to this run (e.g. no calculation requested)
  | 'unavailable'// the backend cannot report on this stage. NOT the same as passed.

/** Discriminated by `id`; `payload` is null until the stage has produced one. */
export type ProofStage =
  | { id: 'request';        meta: StageMeta; payload: RequestProof        | null }
  | { id: 'classification'; meta: StageMeta; payload: ClassificationProof | null }
  | { id: 'policy';         meta: StageMeta; payload: PolicyProof         | null }
  | { id: 'routing';        meta: StageMeta; payload: RoutingProof        | null }
  | { id: 'evidence';       meta: StageMeta; payload: EvidenceProof       | null }
  | { id: 'retrieval';      meta: StageMeta; payload: RetrievalProof      | null }
  | { id: 'calculation';    meta: StageMeta; payload: CalculationProof    | null }
  | { id: 'verification';   meta: StageMeta; payload: VerificationProof   | null }
  | { id: 'approval';       meta: StageMeta; payload: ApprovalProof       | null }
  | { id: 'deliverable';    meta: StageMeta; payload: DeliverableProof    | null }
  | { id: 'audit';          meta: StageMeta; payload: AuditProof          | null }

export interface StageMeta {
  status: ProofStageStatus
  started_at: string | null          // ISO-8601
  ended_at: string | null
  duration_ms: number | null         // null, never 0, when unknown
  /** One line the rail shows under the stage name. Backend-authored, never templated in the UI. */
  headline: string | null
  /** Counts the rail badges read. Absent keys render nothing — they do not render 0. */
  counts?: Partial<Record<'allow'|'deny'|'evidence'|'claims'|'conflicts'|'candidates', number>>
  /** Audit sequence numbers this stage wrote. Every stage links to its own audit rows. */
  audit_sequences: number[]
}

export interface TaskProof {
  task_id: string
  proof_version: string              // e.g. "1.0" — shown in the certificate
  generated_at: string
  /** Terminal status of the run, from backend/core/schemas.py TaskStatus. */
  outcome: 'delivered' | 'approved' | 'rejected' | 'failed' | 'blocked' | 'cancelled' | 'running'
  stages: ProofStage[]               // always 11, always in canonical order
  evidence: TypedEvidence[]          // the full ledger, §4
  claims: Claim[]                    // §4.4
  conflicts: Conflict[]              // §4.5
  reproducibility: ReproducibilityRecord
  certificate: SovereigntyCertificateRef | null   // item 27
}

export interface ReproducibilityRecord {        // roadmap item 28, line 599
  software_version: string
  prompt_version: string
  router_version: string
  policy_version: string
  formula_versions: Record<string, string>      // formula_id → version
  models: { stage: string; model: string; digest: string; temperature: number }[]
  input_hashes: { filename: string; sha256: string }[]
  retrieval_chunk_ids: string[]
  output_hash: string | null
  /** Roadmap line 604: never claim bitwise determinism. */
  determinism: 'deterministic' | 'stochastic' | 'mixed'
  determinism_note: string
}
```

Per-stage payloads — the three that carry the demo:

```ts
// --- 03 POLICY  (roadmap item 21 + 22) ------------------------------------
export interface PolicyCheck {
  label: string                      // "role 'operator' ∈ allowed_roles"
  passed: boolean
  detail: string
}
export interface PolicyDecisionTrace {
  id: string
  subject: { user_id: string; username: string; role: string; clearance: Sensitivity }
  action: string                     // "tool.execute"
  resource: string                   // "code_sandbox"
  resource_classification: Sensitivity
  decision: 'allow' | 'deny' | 'require_approval'
  checks: PolicyCheck[]              // roadmap line 103: pass/fail checks, not logs
  rule_id: string | null             // "tool-permissions.yaml:tools.code_sandbox.allowed_roles"
  rule_excerpt: string | null        // the literal YAML lines, for the inline snippet
  policy_version: string
  reason: string
  at: string
  audit_sequence: number | null      // roadmap line 105: link back to the audit event
}
export interface PolicyProof { decisions: PolicyDecisionTrace[] }

// --- 04 ROUTING  (roadmap item 19 + 23) -----------------------------------
export type RoutingGate = 'installed' | 'classification' | 'capability' | 'memory' | 'integrity'
export interface RoutingCandidate {
  model: string
  display_name: string
  role: ModelRole
  /** Hard gates, each independently explainable. Roadmap line 107. */
  gates: Record<RoutingGate, { passed: boolean; detail: string }>
  eligible: boolean
  score: number | null               // null when ineligible — NOT 0
  score_breakdown: { factor: string; weight: number; value: number }[]
  /** Measured, not asserted. Roadmap line 91. Null until benchmarks exist. */
  measured: {
    quality: number | null
    p50_latency_ms: number | null
    p95_latency_ms: number | null
    memory_mb: number | null
    benchmark_run_id: string | null
    dataset_version: string | null
  } | null
  rejection_reason: string | null
}
export interface RoutingStageTrace {
  stage: string                      // "vision" | "plan" | "draft" | …
  requested_role: ModelRole
  required_capabilities: string[]
  rule_id: string                    // "routing.yaml:rules[2]"
  candidates: RoutingCandidate[]
  selected_model: string | null
  selected_digest: string | null     // roadmap line 97
  integrity_verified: boolean | null // roadmap item 20; null = not checked
  used_fallback: boolean
  reason: string
  decided_at: string
}
export interface RoutingProof { router_version: string; stages: RoutingStageTrace[] }

// --- 07 CALCULATION  (roadmap items 7 + 8) --------------------------------
export interface CalculationRecord {
  id: string                         // evidence id, e.g. "C3"
  formula_id: string                 // "corrosion.rate.short_term"
  formula_version: string
  formula_expression: string         // rendered for display, e.g. "(t₀ − t₁) / Δy"
  inputs: {
    name: string
    value: number
    unit: string
    normalized_value: number
    normalized_unit: string
    evidence_ids: string[]           // roadmap line 31: inputs are evidence-backed
  }[]
  output: { value: number; unit: string }
  /** Roadmap line 235: independently recomputed. null when no recompute exists. */
  independent_recompute: { value: number; unit: string; agrees: boolean } | null
  deterministic: true                // a formula result is always deterministic
  computed_at: string
}
export interface CalculationProof {
  records: CalculationRecord[]
  /** Roadmap line 215: dimensional refusals are shown, not hidden. */
  refusals: { expression: string; reason: string; at: string }[]
}
```

### 3.7 Component tree

```
app/(app)/tasks/[taskId]/page.tsx                        ← server component
  └─ <TaskDetail taskId/>                                ← client boundary
       ├─ <TaskHeader/>                                  ← status, duration, actions
       │    └─ <ProofToggle mode={'normal'|'proof'}/>    ← writes ?view= via useRouter
       ├─ mode==='normal'  →  <ResultExperience/>        ← rewritten, §4
       └─ mode==='proof'   →  <ProofMode/>
            ├─ <ProofRail/>                              ← sticky, 300px, roving tabindex
            │    └─ <ProofRailStage/> × 11
            │         ├─ <StageMarker status/>           ← §6.1
            │         └─ <StageCountBadges counts/>
            ├─ <ProofInspector stageId/>                 ← switch on stage.id
            │    ├─ <RequestPanel/>
            │    ├─ <ClassificationPanel/>               ← signals as pass/fail bars
            │    ├─ <PolicyPanel/>       ─┐
            │    │    ├─ <PolicyCheckList/>   │ = Policy Explorer (item 22)
            │    │    ├─ <RuleExcerpt/>       │
            │    │    └─ <DenialCard/>       ─┘
            │    ├─ <RoutingPanel/>      ─┐
            │    │    ├─ <CandidateTable/>    │ = Routing Explorer (item 23)
            │    │    ├─ <ScoreBreakdown/>    │
            │    │    └─ <DigestVerifyChip/> ─┘
            │    ├─ <EvidencePanel/>         ← ledger table; rows open the inspector
            │    ├─ <RetrievalPanel/>        ← query, BM25 vs dense, rerank Δ, filters
            │    ├─ <CalculationPanel/>      ← formula card + unit normalisation trace
            │    ├─ <VerificationPanel/>     ← claims × verdicts, §4.4
            │    ├─ <ApprovalPanel/>         ← reviewer, hash, invalidation notice
            │    ├─ <DeliverablePanel/>      ← filename, sha256, released flag
            │    └─ <AuditPanel/>            ← events, head, Merkle root, signature
            ├─ <EvidenceInspector/>          ← global overlay, §4.2
            └─ <ProofStreamStatus/>          ← "live · 6 events" / "replaying" / "detached"
```

`<ProofMode/>` owns no fetching. It reads one hook:

```ts
const { proof, stream, error } = useTaskProof(taskId)
```

### 3.8 How it streams — the reducer

The hook does three things in order, and the order is the design:

1. `GET /api/tasks/{id}/proof` — **authoritative snapshot**. Works for finished runs,
   works after a restart. Renders immediately.
2. `EventSource('/api/events?task_id=…')` — **patches** the snapshot as events arrive.
3. On any terminal event (`task.finished` / `task.failed` / `task.blocked` /
   `task.cancelled`), **re-fetch the snapshot** and replace state. The stream is an
   optimisation; the snapshot is the truth. This eliminates the class of bug where the
   UI's picture of a run drifts from the server's.

```ts
// frontend/features/proof/model/proof-reducer.ts

type ProofAction =
  | { type: 'snapshot';    proof: TaskProof }
  | { type: 'event';       event: StreamEvent }
  | { type: 'stream-open' }
  | { type: 'stream-lost' }

/** Backend event name → the stage it patches. Exhaustive by construction:
 *  an unmapped event is surfaced, never silently dropped (§1.3a). */
export const EVENT_STAGE_MAP: Record<string, ProofStageId> = {
  'task.created':          'request',
  'task.queued':           'request',
  'task.classified':       'classification',
  'task.policy_decision':  'policy',          // DEPENDS-ON: Policy agent
  'task.model_selected':   'routing',
  'task.model_swapped':    'routing',
  'task.model_completed':  'routing',
  'task.evidence':         'evidence',
  'task.extraction':       'evidence',
  'task.retrieval':        'retrieval',       // DEPENDS-ON: RAG agent
  'task.calculation':      'calculation',     // DEPENDS-ON: Engineering agent
  'task.code_generated':   'calculation',
  'task.code_retry':       'calculation',
  'task.sandbox_result':   'calculation',
  'task.verified':         'verification',
  'task.claim_verdict':    'verification',    // DEPENDS-ON: Verification agent
  'task.conflict':         'verification',    // DEPENDS-ON: Verification agent
  'task.approval_decided': 'approval',
  'task.deliverable':      'deliverable',
  'task.audit':            'audit',           // DEPENDS-ON: Audit agent
  'task.stage':            'request',         // status-only; routed by payload below
}

export function proofReducer(state: ProofState, action: ProofAction): ProofState {
  switch (action.type) {
    case 'snapshot':
      return { ...state, proof: action.proof, unmapped: [] }

    case 'event': {
      const { event, data } = action.event
      const stageId = EVENT_STAGE_MAP[event]
      if (!stageId) {
        // Never silently drop. Dev: console.warn. Prod: collect for the
        // "N events this build does not understand" chip in <ProofStreamStatus/>.
        return { ...state, unmapped: [...state.unmapped, event] }
      }
      return { ...state, proof: patchStage(state.proof, stageId, event, data) }
    }

    case 'stream-lost':
      // The rail must show the stream is gone. A frozen timeline that looks
      // live is the same category of lie as a fabricated number.
      return { ...state, streamState: 'detached' }

    case 'stream-open':
      return { ...state, streamState: 'live' }
  }
}
```

**DEPENDS-ON: Backend/Workflow agent — every SSE event carries a stable `id:` field
(monotonic per task) so `EventSource` `Last-Event-ID` resumes after a drop.** Today
`_sse()` (`routes/system.py:437`) writes only `event:` and `data:`, so a reconnect
replays the last 50 bus events blindly and may duplicate or miss. For a 40-second demo
run this is survivable; for item 29 (durable workflow recovery) it is not.

### 3.9 States — all of them, specified

Every stage panel implements five states. No panel may render a sixth.

| State | Trigger | Render |
|---|---|---|
| **Pending** | `meta.status === 'pending'` | Hollow marker, stage name, **no duration, no counts**. Body: `"Not reached."` Never a skeleton shimmer — a shimmer implies data is coming, and for a finished run it isn't. |
| **Loading** | Snapshot in flight | Rail renders all 11 stages in `pending` with a single `aria-busy` region. Inspector shows `<Loader2/> Reading the proof record…`. ≤ 200ms typical on localhost, so no skeletons anywhere. |
| **Live** | `meta.status === 'running'` | `◐` marker, `sov-pulse`, elapsed counter ticking from `started_at`, `aria-live="polite"` on the headline only (not the whole panel — screen readers must not re-read a table every 200ms). |
| **Failed / Denied** | `'failed'` / `'denied'` | `<DenialCard/>` (§6.8). Full reason, rule, checks. Downstream stages go `skipped`, not `pending` — the distinction matters: `skipped` says *the system chose not to*, `pending` says *we don't know*. |
| **Unavailable** | `'unavailable'` | Muted marker. Body: `"This host cannot report on this stage. <what would be needed>."` **This is the state that keeps the screen honest while the backend is half-built.** During Phases 1–4, `calculation`, `retrieval` and half of `verification` legitimately render `unavailable`, and that reads as an honest system under construction, not a broken one. |

**Empty vs zero.** `counts` is `Partial<>` on purpose. A stage with no `deny` key
renders no deny badge. A stage with `deny: 0` renders `0 deny`. These mean different
things and the type enforces the difference.

### 3.10 The NORMAL / PROOF toggle

```tsx
// frontend/features/proof/ui/proof-toggle.tsx
'use client'
export function ProofToggle({ mode }: { mode: ProofViewMode }) {
  const router = useRouter(); const pathname = usePathname()
  const set = (next: ProofViewMode) =>
    router.replace(`${pathname}?view=${next}`, { scroll: false })

  return (
    <div role="radiogroup" aria-label="View mode"
         className="inline-flex rounded-full border border-border-strong bg-surface p-0.5">
      {(['normal', 'proof'] as const).map((m) => (
        <button key={m} role="radio" aria-checked={mode === m} onClick={() => set(m)}
          className={cn(
            'rounded-full px-4 py-1 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors',
            mode === m ? 'bg-foreground text-primary-foreground' : 'text-foreground-muted hover:text-foreground',
          )}>
          {m}
        </button>
      ))}
    </div>
  )
}
```

The mode lives in the **URL**, not React state, for three reasons: a proof view is
linkable (the demo script can open one directly), it survives refresh mid-demo, and
`⌘K → prove` can navigate straight to it. Default is `normal`; `?view=proof` is
opt-in, matching roadmap line 521.

---

## 4. The evidence interaction model

**Roadmap items 2, 3, 4, 9, 10.** This is the substrate everything else sits on. Proof
Mode without clickable typed evidence is a prettier `agent-pipeline.tsx`.

### 4.1 The typed evidence contract

The backend already mints `S` / `F` / `V` / `C` (`orchestrator.py:90-95`) and its own
docstring names `X` (`:87`). The roadmap adds `H`. The frontend renders only `S` and
`F` (`result-experience.tsx:15`). Close that gap first.

```ts
// frontend/lib/contract/evidence.ts

export type EvidenceModality =
  | 'DOCUMENT'     // S — retrieved knowledge-base chunk
  | 'FILE'         // F — an uploaded attachment
  | 'VISION'       // V — what a vision model read off a page/region
  | 'CALCULATION'  // C — a deterministic formula result
  | 'EXECUTION'    // X — sandbox stdout/exit/resource record
  | 'HUMAN'        // H — a reviewer's written statement

/** Prefix maps to modality. Single source of truth for parsing and rendering. */
export const EVIDENCE_PREFIX: Record<EvidenceModality, string> = {
  DOCUMENT: 'S', FILE: 'F', VISION: 'V',
  CALCULATION: 'C', EXECUTION: 'X', HUMAN: 'H',
}
export const MODALITY_BY_PREFIX =
  Object.fromEntries(Object.entries(EVIDENCE_PREFIX).map(([m, p]) => [p, m as EvidenceModality]))

/** Where the evidence physically is. Discriminated so the inspector opens the right viewer. */
export type EvidenceLocator =
  | { kind: 'page';   source_id: string; filename: string; page: number
      bbox: [number, number, number, number] | null      // normalized 0..1, page-space
      char_range: [number, number] | null }
  | { kind: 'cell';   source_id: string; filename: string; sheet: string; ref: string }   // "B14"
  | { kind: 'region'; source_id: string; filename: string; page: number
      bbox: [number, number, number, number] }            // P&ID node/edge
  | { kind: 'record'; source_id: string; record_type: 'calculation' | 'execution' | 'human' }

export interface TypedEvidence {
  id: string                       // "V9"
  modality: EvidenceModality
  locator: EvidenceLocator
  excerpt: string
  /** Null when the producer reports no confidence. NEVER defaulted. See section 1.3c. */
  confidence: number | null
  extraction_model: string | null  // "qwen2.5-vl:7b" — roadmap line 87
  source_sha256: string            // roadmap line 88
  content_sha256: string           // roadmap line 136: hash the fragment itself
  classification: Sensitivity
  /** Roadmap item 12: retrieval that used a superseded revision must say so. */
  revision: { document_id: string; revision: string
              status: 'ACTIVE' | 'SUPERSEDED' | 'EXPIRED'
              superseded_by: string | null } | null
  /** Roadmap item 13: untrusted document content is marked, not trusted. */
  injection_risk: 'none' | 'suspicious' | 'quarantined' | null
  registered_at: string
}
```

**The `confidence: number | null` decision is load-bearing.** Today's optional
`similarity?: number` is *why* `evidence-drawer.tsx:49`, `result-experience.tsx:194`,
`approvals-view.tsx:367` and `registry-view.tsx:336` all invent a number. Making it
explicitly nullable forces every call site to handle absence, and there is exactly one
correct handling:

```tsx
{e.confidence === null
  ? <span className="font-mono text-[11px] text-foreground-muted">not scored</span>
  : <ConfidenceBar value={e.confidence}/>}
```

### 4.2 The citation chip

Replaces the `[SF]`-only regex at `result-experience.tsx:14-36`.

```tsx
// frontend/features/evidence/ui/cite.tsx
'use client'

const MODALITY_GLYPH: Record<EvidenceModality, string> = {
  DOCUMENT: '¶', FILE: '⎗', VISION: '◱',
  CALCULATION: '∑', EXECUTION: '⌘', HUMAN: '☑',
}

export interface CiteProps {
  id: string                        // "V9"
  /** When absent the chip renders DANGLING — a citation to nothing is a finding. */
  evidence?: TypedEvidence
  /** Verdict of the claim this citation sits inside; tints the chip's left edge. */
  verdict?: ClaimVerdict
}

export function Cite({ id, evidence, verdict }: CiteProps) {
  const open = useEvidenceInspector()
  if (!evidence) {
    return (
      <span title={`No ledger entry for ${id}`}
        className="mx-0.5 inline-flex items-center gap-1 border border-critical/50 px-1.5
                   align-middle font-mono text-[11px] text-critical line-through">
        {id}
      </span>
    )
  }
  return (
    <button type="button" onClick={() => open(id)}
      aria-label={`Evidence ${id}: ${evidence.modality.toLowerCase()} from ${locatorLabel(evidence.locator)}`}
      data-verdict={verdict}
      className="mx-0.5 inline-flex -translate-y-px items-center gap-1 border border-border
                 border-l-2 px-1.5 align-middle font-mono text-[11px] text-foreground
                 transition-colors hover:border-foreground hover:bg-surface-sunken
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30
                 data-[verdict=UNSUPPORTED]:border-l-critical
                 data-[verdict=CONFLICTED]:border-l-approval
                 data-[verdict=VERIFIED]:border-l-sovereign">
      <span aria-hidden className="text-foreground-muted">{MODALITY_GLYPH[evidence.modality]}</span>
      {id}
    </button>
  )
}
```

Three deliberate choices:

- **Dangling citations render struck-through in `--critical`.** A model that cites
  `[S7]` when the ledger holds six items is hallucinating, and the UI must say so
  rather than print inert text. This is a *feature to demo*, not an error to hide.
- **The modality glyph** means a reader sees at a glance that a claim rests on a vision
  reading rather than a procedure — without opening anything. Density as expression (section 6).
- **The verdict tints the left border only.** The chip is small; a full colour fill at
  11px reads as decoration. A 2px edge reads as a state.

The renderer that parses answer text:

```ts
// frontend/features/evidence/model/parse-citations.ts
const CITATION = /\[([SFVCXH]\d+)\]/g     // was /\[[SF]\d+\]/ — see 1.3b

export function renderWithCitations(
  text: string,
  ledger: Map<string, TypedEvidence>,
  verdicts?: Map<string, ClaimVerdict>,
): ReactNode[] { /* split, map matches to <Cite/>, pass through the rest */ }
```

### 4.3 The Evidence Inspector — the drawer's successor

`evidence-drawer.tsx` is 83 lines and renders a list of excerpts with an invented
similarity bar. It cannot satisfy roadmap line 87 ("open tag, confidence, page, bbox,
evidence ID") or line 256 ("show both conflicting sources side-by-side"). It is
replaced, not extended.

The inspector is **one overlay, three panes, mounted once at the app layout**, opened
by ID from anywhere via context. Width 720px (was 448px) because a page render with a
bbox needs it.

```
+-------------------------------------------------------------------------------------+
|  EVIDENCE   V9                                        [ VISION ]    qwen2.5-vl:7b  X |
+------------------+------------------------------------------------------------------+
| LEDGER           |  SOURCE                                    +----------------+     |
| 12 items         |  scanned-inspection-report-V-2104.pdf      |  S1   0.91     |     |
|                  |  page 7 of 20 - OCR+vision - sha 3f9a...   |  S4   0.88     |     |
|   S1  SOP-114    |  +--------------------------------------+  |  F2   --       |     |
|   S4  SOP-114    |  |                                      |  | >V9   0.83     |     |
|   F2  survey.csv |  |        [ page 7 raster ]             |  |  V11  0.61  !  |     |
| > V9  report.pdf |  |     +==============+  <- bbox        |  |  C3   exact    |     |
|   V11 report.pdf |  |     | CML-04       |    highlighted  |  |  X2   exit 0   |     |
|   C3  corrosion  |  |     | 8.4 mm       |                 |  +----------------+     |
|   X2  sandbox    |  |     +==============+                 |   <- siblings on the    |
|   H1  reviewer   |  |                                      |      same page          |
|                  |  +--------------------------------------+                         |
| [filter: all v]  |  [ + - fit ]  [ open full page -> ]  [ download source -> ]       |
|                  +------------------------------------------------------------------+
|                  |  EXTRACTED                                                        |
|                  |  "CML-04 remaining wall thickness 8.4 mm"                          |
|                  |                                                                   |
|                  |  CONFIDENCE  0.83  ########..  (extraction_model qwen2.5-vl:7b)    |
|                  |  LOCATOR     page 7 - bbox [0.41, 0.22, 0.58, 0.29]                |
|                  |  SOURCE HASH sha256:3f9a1c...7d20  CONTENT HASH sha256:b8e4...19aa |
|                  |  REVISION    --                    INJECTION RISK  none           |
|                  |  REGISTERED  14:32:41.882                                          |
|                  +------------------------------------------------------------------+
|                  |  USED BY                                                          |
|                  |  > Claim 2  "The governing CML is CML-04 at 8.4 mm"    VERIFIED    |
|                  |  > Claim 5  "Remaining life is 4.1 years"              SUPPORTED   |
|                  |  > Calculation C3 input  t_actual = 8.4 mm                         |
|                  +------------------------------------------------------------------+
|                  |  [ <- V6 ]  [ V9 of 12 ]  [ V11 -> ]     j/k to step, Esc close   |
+------------------+------------------------------------------------------------------+
```

```tsx
// frontend/features/evidence/ui/evidence-inspector.tsx
export interface EvidenceInspectorProps {
  open: boolean
  focusId: string | null
  ledger: TypedEvidence[]
  claims: Claim[]                 // to populate USED BY
  onFocus: (id: string) => void
  onClose: () => void
}
```

The `SOURCE` pane is a switch on `locator.kind`:

| `locator.kind` | Viewer | Notes |
|---|---|---|
| `page` | `<PageRaster/>` — `<img>` + absolutely-positioned bbox overlay | **DEPENDS-ON: Backend/Evidence agent — `GET /api/evidence/{id}/render?dpi=` returning a page raster, and `GET /api/files/{source_id}/page/{n}`.** Without a page raster the inspector degrades to text + coordinates, which is honest but unimpressive. This endpoint is the difference between "we track bboxes" and "look". |
| `cell` | `<SheetExcerpt/>` — a 5x5 window around the ref, target cell outlined | Reuses the same overlay maths. |
| `region` | `<PidCanvas mode="inline"/>` | The same component as `/knowledge/pid/[id]` (section 2.2). |
| `record` | `<CalculationCard/>` / `<ExecutionCard/>` / `<HumanStatementCard/>` | No raster; a structured record. |

### 4.4 Claim-level verification

**Roadmap item 9, line 241:** *"Extract atomic claims... mark as VERIFIED, SUPPORTED,
UNSUPPORTED, CONFLICTED, NEEDS_REVIEW."* Line 243: *"The UI can open any important
claim and show exactly why it was accepted, rejected, or escalated."*

```ts
export type ClaimVerdict =
  | 'VERIFIED'      // independently recomputed or exactly matched in evidence
  | 'SUPPORTED'     // evidence is consistent with it, not independently reproduced
  | 'UNSUPPORTED'   // no evidence maps to it
  | 'CONFLICTED'    // evidence disagrees with itself
  | 'NEEDS_REVIEW'  // high-impact and cannot be settled automatically

export type ClaimKind =
  | 'factual' | 'numerical' | 'engineering_conclusion' | 'recommendation' | 'procedural'

export interface Claim {
  id: string                      // "K2"
  kind: ClaimKind
  text: string
  /** Character span in the answer, so the renderer can underline in place. */
  span: [number, number]
  verdict: ClaimVerdict
  evidence_ids: string[]
  /** Populated for numerical claims when a deterministic formula exists. Item 9 line 234. */
  recomputation: { formula_id: string; stated: number; recomputed: number
                   unit: string; tolerance: number; agrees: boolean } | null
  conflict_id: string | null      // -> Conflict, section 4.5
  material: boolean               // does it gate the policy check (item 9 line 236)?
  explanation: string             // the "exactly why", backend-authored
}
```

**Verdict tokens map onto the existing four status colours. No new hues** (section 6.2):

| Verdict | Colour | Glyph | Rationale |
|---|---|---|---|
| `VERIFIED` | `--sovereign` | double tick | Reproduced, not merely cited. |
| `SUPPORTED` | `--foreground` | single tick | Neutral ink. **Not green.** Supported is not verified, and the palette must not blur that. |
| `UNSUPPORTED` | `--critical` | cross | |
| `CONFLICTED` | `--approval` | arrows | Amber = a human must arbitrate, same semantics as the approval gate. |
| `NEEDS_REVIEW` | `--approval` | caret | Same colour, different glyph; both route to a person. |

**In-place rendering.** The answer body underlines each claim's `span` with its verdict
colour and hangs a verdict gutter marker in the left margin:

```
  +---------------------------------------------------------------------+
  | VV | The governing location is CML-04 with a remaining wall of       |
  |    | 8.4 mm [V9], against a minimum allowable of 6.0 mm [S4].        |
  |    | ================================== sovereign underline          |
  | <> | The short-term corrosion rate is 0.22 mm/yr [C3].               |
  |    | ================================== approval underline           |
  | X  | Inspection is due within 18 months.                             |
  |    | ================================== critical underline           |
  |    | +- UNSUPPORTED - no evidence maps to this claim.  [why ->]      |
  +---------------------------------------------------------------------+
```

`UNSUPPORTED` and `CONFLICTED` claims render their explanation **inline and always
expanded**. A reader must not have to click to discover that a sentence they just read
has nothing behind it. `VERIFIED` and `SUPPORTED` explanations are click-to-open.

This underline replaces `AnswerBody` at `result-experience.tsx:14-36` wholesale.

### 4.5 CONFLICTED — side by side

**Roadmap item 10, line 256:** *"Show both conflicting sources side-by-side in the UI."*

```ts
export interface Conflict {
  id: string
  severity: 'low' | 'medium' | 'high'
  /** Normalized comparison the detector performed — line 252. */
  dimension: 'value' | 'date' | 'status' | 'assertion'
  /** Exactly two sides. Three-way conflicts decompose into pairs; a UI that
   *  tries to show N sides at once shows none of them well. */
  left:  ConflictSide
  right: ConflictSide
  /** Normalized to a common unit/format so the delta is real — line 252. */
  normalized: { left: string; right: string; delta: string | null }
  resolution: { status: 'unresolved' | 'resolved'; by: string | null
                chosen: 'left' | 'right' | 'neither' | null; reason: string | null } | null
  blocks_conclusion: boolean      // line 260
  detected_at: string
}
export interface ConflictSide {
  evidence_id: string
  stated_value: string
  authority: {                    // roadmap item 12 — which one is current?
    revision: string | null
    effective_date: string | null
    status: 'ACTIVE' | 'SUPERSEDED' | 'EXPIRED' | null
  }
}
```

```
+- CONFLICT  high - value ------------------------------ blocks conclusion -+
|  Design pressure disagrees across two sources.                            |
+---------------------------------+-----------------------------------------+
|  S3                             |  F1                                     |
|  SOP-114 Pressure Vessel Limits |  V-2104-datasheet-2019.pdf              |
|  rev C - effective 2024-03-01   |  rev -- - effective 2019-11-12          |
|  +---------------------------+  |  +-----------------------------------+  |
|  | * ACTIVE                  |  |  | ! SUPERSEDED by SOP-114 rev C     |  |
|  +---------------------------+  |  +-----------------------------------+  |
|                                 |                                         |
|      18 bar                     |       16 bar                            |
|      =======                    |       =======                           |
|  normalized 1.80 MPa            |   normalized 1.60 MPa     delta 0.20 MPa|
|                                 |                                         |
|  "...maximum allowable working  |  "...design pressure 16 bar g at 150 C" |
|   pressure 18 bar g..."         |                                         |
|                                 |                                         |
|  [ open S3 -> ]                 |  [ open F1 -> ]                         |
+---------------------------------+-----------------------------------------+
|  UNRESOLVED - the system did not choose. Affected claim: K7.              |
|  Requires: reviewer (approval-rules.yaml:unresolved_high_conflict)         |
|  [ Resolve: use S3 ]  [ Resolve: use F1 ]  [ Escalate ]                   |
+---------------------------------------------------------------------------+
```

Three things this layout does that a generic diff does not:

1. **The authority chip is above the value.** A reader sees *which source is current*
   before they see the numbers, which is the actual engineering judgement. Roadmap
   item 12 line 297 demands exactly this.
2. **`normalized` sits under the raw values with a delta.** "18 bar vs 16 bar" is the
   roadmap's own example (line 253). Showing 1.80 vs 1.60 MPa proves the comparison was
   dimensional, not string equality — which is the point of item 8.
3. **The footer states that the system did not choose.** Roadmap line 247: *"Stop the
   system from silently choosing between conflicting documents."* The UI's job is to
   make the non-choice loud.

`<SideBySide/>` is a general primitive (section 6.3) and is reused for reproducibility
compare (item 28 line 131) and approval revision diffs (item 25 line 117).

### 4.6 Where evidence appears

One component, everywhere, so there is exactly one rendering of a citation in the app:

| Surface | Usage |
|---|---|
| Answer body (`normal` view) | `renderWithCitations()` + claim underlines |
| Proof `evidence` stage | Ledger table; row click opens the inspector |
| Proof `verification` stage | Claims table; verdict cells; conflicts |
| Proof `calculation` stage | Each input's `evidence_ids` as `<Cite/>` chips |
| Approvals review pane | Same answer body — **the reviewer sees exactly what the operator saw**, which matters for item 25 line 117 (approval invalidated if content changes) |
| Deliverable preview | Citations survive into the preview |
| P&ID viewer | Clicking a node opens its `region` evidence in the same inspector |

---

## 5. Frontend system structure

### 5.1 The problem

42 components, flat under `components/`, with route views nested one level
(`components/console/console-view.tsx`). Every view is a 400-700 line file that fetches,
transforms, holds state and renders. `security-view.tsx` defines five components in one
file. At ~120 components this collapses.

### 5.2 Feature-slice boundaries

Four layers. **Imports only ever point down.** This is the whole rule.

```
app/         routing, layouts, server components     -> may import features, shared
features/    one slice per product capability        -> may import shared, other features' PUBLIC api only
shared/      design system, primitives, hooks, utils -> may import lib
lib/         contract types, api client, config      -> imports nothing local
```

A feature slice exposes a single `index.ts`. Cross-feature imports go through it and
nothing else — no `features/proof/ui/internal-thing` from outside `features/proof/`.
Enforced by lint (section 5.9).

### 5.3 Directory tree

```
frontend/
|-- app/
|   |-- layout.tsx                          # fonts, providers. Drop generator:'v0.app'
|   |-- globals.css                         # tokens (section 6)
|   |-- error.tsx                           # NEW - root error boundary
|   |-- not-found.tsx                       # NEW
|   |-- sign-in/page.tsx
|   \-- (app)/
|       |-- layout.tsx                      # nav + footer + <EvidenceInspectorHost/>
|       |-- error.tsx                       # NEW - per-section boundary
|       |-- page.tsx                        # Console
|       |-- tasks/
|       |   |-- page.tsx                    # list
|       |   \-- [taskId]/
|       |       |-- page.tsx                # server: reads ?view=, renders <TaskDetail/>
|       |       |-- loading.tsx             # NEW
|       |       |-- error.tsx               # NEW
|       |       \-- compare/[otherId]/page.tsx   # item 28
|       |-- approvals/page.tsx
|       |-- knowledge/
|       |   |-- page.tsx                    # ?tab=documents|models|diagrams|search
|       |   \-- pid/[documentId]/page.tsx   # item 18
|       |-- assurance/
|       |   |-- page.tsx                    # ?tab=sovereignty|sandbox|policy|routing|benchmarks
|       |   \-- benchmarks/[suite]/[caseId]/page.tsx   # item 33 line 153
|       \-- audit/page.tsx
|
|-- features/
|   |-- proof/
|   |   |-- index.ts                        # PUBLIC: <ProofMode/>, useTaskProof, types
|   |   |-- api/get-proof.ts
|   |   |-- model/{proof-reducer,use-task-proof,event-map,stage-order}.ts
|   |   \-- ui/{proof-mode,proof-rail,proof-rail-stage,proof-inspector,proof-toggle,
|   |           proof-stream-status}.tsx
|   |       \-- stages/{request,classification,policy,routing,evidence,retrieval,
|   |                   calculation,verification,approval,deliverable,audit}-panel.tsx
|   |-- evidence/
|   |   |-- index.ts                        # PUBLIC: <Cite/>, <EvidenceInspector/>, useEvidenceInspector
|   |   |-- model/{parse-citations,ledger-index,inspector-context}.ts
|   |   \-- ui/{cite,evidence-inspector,evidence-table,page-raster,sheet-excerpt,
|   |           confidence-bar,revision-chip,injection-chip}.tsx
|   |-- verification/
|   |   |-- index.ts                        # PUBLIC: <ClaimList/>, <ConflictCard/>, <AnswerWithClaims/>
|   |   \-- ui/{claim-list,claim-row,verdict-badge,conflict-card,answer-with-claims,
|   |           recomputation-card}.tsx
|   |-- policy/
|   |   |-- index.ts                        # PUBLIC: <PolicyDecisionPanel/>, <PolicyRulebook/>
|   |   |-- api/{get-policies,get-decision}.ts
|   |   \-- ui/{policy-decision-panel,policy-check-list,rule-excerpt,denial-card,rulebook}.tsx
|   |-- routing/
|   |   |-- index.ts                        # PUBLIC: <RoutingPanel/>, <ModelEstate/>
|   |   |-- api/{get-routing-rules,get-models-status}.ts
|   |   \-- ui/{routing-panel,candidate-table,gate-cell,score-breakdown,
|   |           digest-verify-chip,model-estate}.tsx
|   |-- pid/
|   |   |-- index.ts                        # PUBLIC: <PidCanvas/>, <PidGraphPanel/>
|   |   |-- api/get-pid-overlay.ts
|   |   |-- model/{viewport,hit-test,path-highlight}.ts
|   |   \-- ui/{pid-canvas,pid-overlay,pid-node-card,pid-graph-panel,pid-legend}.tsx
|   |-- benchmarks/
|   |   |-- index.ts
|   |   |-- api/get-benchmark-runs.ts
|   |   \-- ui/{benchmark-grid,metric-tile,suite-detail,failed-case-table,dataset-chip}.tsx
|   |-- sovereignty/
|   |   |-- index.ts                        # PUBLIC: <SovereigntyPanel/>, useSovereignty
|   |   |-- model/use-sovereignty.ts        # ONE subscriber, shared via context (5.7)
|   |   \-- ui/{sovereignty-panel,egress-ledger,connection-table,nav-status-chip}.tsx
|   |-- tasks/     # list, filters, detail header, cancel
|   |-- approvals/ # queue, review pane, decide (APPROVE|REJECT|REQUEST_REVISION)
|   |-- audit/     # keep audit-view's logic, split into ui/ files
|   |-- console/   # dispatcher, scope picker, attachments
|   \-- knowledge/ # documents, ingest, search
|
|-- shared/
|   |-- ui/                                 # the design system (section 6)
|   |   |-- primitives/{technical-label,section-heading,status-indicator,
|   |   |               classification-tag,reveal}.tsx     # from components/primitives.tsx
|   |   |-- timeline/{timeline,timeline-stage,stage-marker,stage-connector}.tsx
|   |   |-- inspector/{inspector-panel,inspector-section,inspector-field,inspector-nav}.tsx
|   |   |-- data/{metric-tile,provenance-chip,side-by-side,diff-line,
|   |   |        verdict-badge,denial-card,data-table,empty-state,unavailable-state}.tsx
|   |   |-- overlay/{graph-overlay,bbox,viewport-controls}.tsx
|   |   |-- feedback/{error-boundary,toast,modal,loader}.tsx
|   |   \-- controls/{sov-button,command-palette,segmented,filter-chip,kbd}.tsx
|   |-- hooks/{use-event-stream,use-reveal,use-hotkey,use-roving-focus,
|   |          use-media-query,use-url-state,use-resource}.ts
|   \-- format/{bytes,duration,datetime,hash,number,unit}.ts   # from primitives.tsx:151-184
|
\-- lib/
    |-- contract/                           # <- generated from backend Pydantic. DO NOT EDIT.
    |   |-- index.ts
    |   |-- task.ts   evidence.ts   proof.ts   policy.ts   routing.ts
    |   \-- verification.ts   pid.ts   benchmark.ts   sovereignty.ts   audit.ts
    |-- api/
    |   |-- client.ts                       # request<T>, ApiError - keep :103-111 verbatim
    |   |-- endpoints.ts                    # one const per route, typed
    |   \-- index.ts
    |-- view/                               # view-only types that are NOT contract
    |   \-- {proof-view,table-view}.ts
    \-- utils.ts                            # cn()
```

### 5.4 Where types live — the hard rule

Three buckets, and `lib/types.ts` today violates all three by mixing them
(`TaskRecord`, `ApprovalItem`, `SopRecord`, `PolicyRow` at `:258-361` are view types
living beside contract types).

| Bucket | Location | Rule |
|---|---|---|
| **Contract** | `lib/contract/*.ts` | Mirrors `backend/core/schemas.py` and the new backend modules **exactly**. No optional aliases, no `// UI legacy`. Generated by script; a hand edit is a bug. |
| **View** | `lib/view/*.ts` | Types that exist only because the UI needs them (e.g. `ProofViewMode`, `TableColumn<T>`). May never be returned from an API call. |
| **Feature-local** | `features/x/model/types.ts` | Props and internal state. Never imported across slices. |

**DEPENDS-ON: Backend agents — keep `backend/core/schemas.py` and the new
`backend/{evidence,verification,policy,proof,pid}/schemas.py` as Pydantic, and expose
`GET /openapi.json`.** Generation:

```json
// package.json
"scripts": {
  "contract": "openapi-typescript http://127.0.0.1:8000/openapi.json -o lib/contract/generated.ts",
  "contract:check": "npm run contract && git diff --exit-code lib/contract/generated.ts"
}
```

`contract:check` in CI makes a backend schema change that the frontend has not absorbed
a **build failure**, which is precisely the class of drift that produced `lib/types.ts`'s
two-era `TaskStatus` union. `next.config.mjs` already refuses to ignore type errors
(`:4-7`) — this extends that stance across the API boundary.

### 5.5 Server vs client components (Next 16 App Router)

> Note: `frontend/AGENTS.md` warns this Next version has breaking changes and to read
> `node_modules/next/dist/docs/` before writing code. `node_modules` is not installed in
> this checkout, so **the implementing engineer must read those docs before committing
> the patterns below.** What follows is the intended boundary, not a verified API.

The app is fully local, so server components buy no latency. They buy three real things:
**bundle size** (matters for item 36's offline npm cache), **a place to read `searchParams`
without a client round-trip**, and **a natural error/suspense boundary per route**.

Rule: **a component is a server component unless it needs state, an effect, an event
handler, or SSE.** In practice:

```tsx
// app/(app)/tasks/[taskId]/page.tsx - SERVER
import { TaskDetail } from '@/features/tasks'

export default async function Page({ params, searchParams }: {
  params: Promise<{ taskId: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { taskId } = await params
  const { view } = await searchParams
  const mode: ProofViewMode = view === 'proof' ? 'proof' : 'normal'
  // No fetching here: the session token lives in an HttpOnly cookie that the
  // browser sends, and the proof snapshot is refetched on every SSE terminal
  // event anyway. Server-fetching it would produce a second source of truth.
  return <TaskDetail taskId={taskId} initialMode={mode} />
}
```

| Server | Client (`'use client'`) |
|---|---|
| All `app/**/page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` shells | Anything touching `useState` / `useEffect` / `EventSource` |
| Static panels: `<RuleExcerpt/>`, `<InspectorField/>`, `<DenialCard/>`, `<VerdictBadge/>`, `<MetricTile/>` | `<ProofMode/>`, `<EvidenceInspector/>`, `<CommandPalette/>`, `<PidCanvas/>` |
| Every `shared/format/*` helper | `<Cite/>` (it dispatches to context) |

`<ProofMode/>` is one client boundary containing eleven mostly-presentational children,
most of which can stay server components passed as `children`. That keeps the
interactive surface small and the bundle honest.

### 5.6 Data-fetching strategy

Latency is ~1ms. **Do not install React Query.** It solves cache invalidation across a
network you do not have, at the cost of a dependency in an air-gapped bundle. Four
patterns, and nothing else:

| Pattern | When | Shape |
|---|---|---|
| **`useResource`** | Any one-shot GET | `const r = useResource(() => api.getProof(id), [id])`. ~30 lines. Models `error` as a first-class value — never `.catch(() => [])`, which is how `tasks-view.tsx:47` and `registry-view.tsx:72-73` made a permission failure look like an empty list. |
| **SSE patch** | Live runs | Section 3.8. One `EventSource` per subscribed task. |
| **Snapshot-on-terminal** | Run finishes | Re-`GET` the proof; replace, don't merge. |
| **Shared singleton stream** | Sovereignty heartbeat | **One** `EventSource('/api/events')` at the app layout, fanned out via `SovereigntyContext`. Today `security-view.tsx:72` and any future nav chip would each open their own connection to the same unfiltered stream. |

`useResource` is where the no-fallback rule becomes structural:

```ts
// shared/hooks/use-resource.ts
export type Resource<T> =
  | { state: 'loading'; data: null;  error: null }
  | { state: 'ready';   data: T;     error: null }
  | { state: 'error';   data: null;  error: ApiError }

// There is no fourth state. A consumer cannot render a value on error because
// there is no value to render. This is lib/api.ts:103-111 expressed as a type.
```

### 5.7 State management

**No global store.** Not Redux, not Zustand, not Jotai. The app has exactly four pieces
of cross-cutting state and each has a natural owner:

| State | Owner | Why not a store |
|---|---|---|
| Session / role | `RoleProvider` (exists, `components/role-context.tsx`) | Already correct — `:82-102` makes the label follow the server. Move to `features/auth/`, keep the logic verbatim. |
| Toasts | `ToastProvider` (exists) | Fine as is. |
| Evidence inspector (open / focusId) | `EvidenceInspectorProvider` (new) | It is one overlay with two fields. |
| Sovereignty heartbeat | `SovereigntyProvider` (new) | One stream, many readers. |

Per-run proof state is `useReducer` **inside** `<ProofMode/>`. It is scoped to a route,
dies with it, and never needs to be read from elsewhere. A global store for it would
create the exact bug we are trying to prevent: a stale proof rendered under a different
task's header.

**This holds to ~120 components.** The signal that it stops holding is a third consumer
of proof state outside `/tasks/[id]`. If reproducibility-compare (item 28) needs two
proofs side by side, that is still one route owning two reducers.

### 5.8 Error boundaries

Today: zero. One throw blanks the app mid-demo.

```
app/error.tsx                          <- last resort; "AEGIS interface fault" + reload
app/(app)/error.tsx                    <- keeps nav alive, replaces the page body
app/(app)/tasks/[taskId]/error.tsx     <- keeps the task header + toggle alive
features/proof/ui/proof-mode.tsx       <- <StagePanelBoundary/> per stage panel
```

The per-stage boundary matters most: **one malformed stage payload must not take down
the other ten stages.** A crashed panel renders

```
+-------------------------------------------------+
| ! This stage could not be rendered.             |
| The record exists; the interface failed to draw |
| it. [ view raw JSON ]  [ copy for report ]      |
+-------------------------------------------------+
```

with the raw payload available. That is a defensible failure in front of a judge: the
proof survived, the renderer did not. Blanking the screen is not.

### 5.9 The rule for how a component gets data

**Exactly one way, enforced:**

> A component either (a) receives all of its data as props, or (b) is a slice **root**
> that calls exactly one hook from its own `features/*/api` or `features/*/model`.
> No component calls `api.*` directly. No component calls more than one fetching hook.

Slice roots (roughly one per route or per major panel) are the only files permitted to
import from `lib/api`. Everything below them is a pure function of props, which makes
them server-renderable, testable, and inspectable without a backend.

This is a direct fix for the current shape: `security-view.tsx` has four independent
`useEffect` fetches in four nested components in one file, `registry-view.tsx` has
fetches at two levels, and neither can be rendered without a live API.

Lint rules (`eslint.config.mjs`) to make it stick:

```js
'no-restricted-imports': ['error', { patterns: [
  { group: ['@/lib/api*'],
    message: 'Only a feature slice root may call the API. Use features/<x>/api.' },
  { group: ['@/features/*/ui/*', '@/features/*/model/*', '@/features/*/api/*'],
    message: 'Import a feature through its index.ts.' },
]}]
```

Plus one custom rule worth the 40 lines it costs: **`no-numeric-fallback`** — flags
`?? <number literal>` and `: <number literal>` in a ternary whose other arm reads an API
field. That single rule would have caught `?? 3`, `|| 6`, `|| 142`, `: 0.95`, `: '0.96'`,
`: 0.94`, `|| 12` — every fabricated figure found in section 1.2.

---

## 6. Design system extension

**Constraint, restated so nobody relaxes it later: no new hues.** `app/globals.css:36-39`
defines four semantic colours and that is the whole vocabulary. Every new state below
maps onto `--sovereign` / `--active` / `--approval` / `--critical` or onto ink.
Expressiveness comes from **density, typographic hierarchy, glyphs and rule weight** —
which is what a real instrument panel uses too.

### 6.1 Token additions (Tailwind v4, `@theme inline`)

All derived. No literal colour is introduced.

```css
/* ------------------------------------------------------------------ */
/* Proof & evidence tokens — derived, not new                          */
/* ------------------------------------------------------------------ */
:root {
  /* Verdict semantics. SUPPORTED is deliberately ink, not green:
     "the evidence is consistent" must not read the same as
     "we recomputed it ourselves". */
  --verdict-verified:     var(--sovereign);
  --verdict-supported:    var(--foreground);
  --verdict-unsupported:  var(--critical);
  --verdict-conflicted:   var(--approval);
  --verdict-review:       var(--approval);

  /* Stage semantics for the proof rail. */
  --stage-pending:        var(--foreground-muted);
  --stage-running:        var(--active);
  --stage-passed:         var(--sovereign);
  --stage-flagged:        var(--approval);
  --stage-denied:         var(--critical);
  --stage-failed:         var(--critical);
  --stage-held:           var(--approval);
  --stage-skipped:        var(--border-strong);
  --stage-unavailable:    var(--border-strong);

  /* Rail geometry. One scale so every timeline in the app aligns. */
  --rail-width:           1px;
  --rail-inset:           9px;     /* centre of a 18px marker */
  --rail-gap:             20px;    /* vertical rhythm between stages */
  --rail-marker:          18px;

  /* Density scale — the primary expressive tool (6.2). */
  --density-comfortable:  12px;    /* row padding: reading */
  --density-compact:      8px;     /* row padding: scanning */
  --density-dense:        4px;     /* row padding: ledgers and candidate tables */

  /* Overlay tokens for bbox / graph highlighting. */
  --overlay-hit:          color-mix(in srgb, var(--active) 18%, transparent);
  --overlay-hit-edge:     var(--active);
  --overlay-path:         color-mix(in srgb, var(--sovereign) 22%, transparent);
  --overlay-path-edge:    var(--sovereign);
  --overlay-scrim:        color-mix(in srgb, var(--ink) 55%, transparent);

  /* Evidence modality accents. All ink-weight; the glyph carries the meaning,
     not a colour. Only injection risk borrows a status colour. */
  --evidence-ink:         var(--foreground-secondary);
  --evidence-quarantined: var(--critical);
  --evidence-suspicious:  var(--approval);
}

@theme inline {
  --color-verdict-verified:    var(--verdict-verified);
  --color-verdict-supported:   var(--verdict-supported);
  --color-verdict-unsupported: var(--verdict-unsupported);
  --color-verdict-conflicted:  var(--verdict-conflicted);
  --color-verdict-review:      var(--verdict-review);

  --color-stage-pending:     var(--stage-pending);
  --color-stage-running:     var(--stage-running);
  --color-stage-passed:      var(--stage-passed);
  --color-stage-flagged:     var(--stage-flagged);
  --color-stage-denied:      var(--stage-denied);
  --color-stage-held:        var(--stage-held);
  --color-stage-skipped:     var(--stage-skipped);
  --color-stage-unavailable: var(--stage-unavailable);

  --color-overlay-hit:       var(--overlay-hit);
  --color-overlay-path:      var(--overlay-path);

  --spacing-density-comfortable: var(--density-comfortable);
  --spacing-density-compact:     var(--density-compact);
  --spacing-density-dense:       var(--density-dense);

  /* Typographic scale, named by role rather than size, so density decisions
     are made once. Current code hardcodes [10px]..[15px] in ~300 places. */
  --text-ledger:    10px;   /* mono, tabular, uppercase — IDs, hashes, units */
  --text-meta:      11px;   /* mono — labels, timestamps, counts */
  --text-body-sm:   12px;
  --text-body:      13px;   /* the app's default reading size */
  --text-body-lg:   15px;   /* answers and claim text only */
  --text-headline:  20px;
}
```

New utilities, one each:

```css
@utility rail-line {
  /* The 1px vertical connector of a timeline, drawn behind markers. */
  background: linear-gradient(to bottom, var(--border) 0 100%);
  width: var(--rail-width);
}

@utility tabular {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}
/* Every latency, score, hash fragment, count and bbox coordinate uses
   `tabular`. Columns of numbers that do not align read as untrustworthy,
   which is a strange thing to be true but it is true. */

@utility surface-inset {
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
```

**Motion.** `globals.css:163-237` already defines nine keyframe animations, of which
`sov-radar-sweep`, `sov-laser-flow`, `sov-glow-sovereign`, `sov-glow-active`,
`sov-deflection-burst` and `sov-drift` exist only for decorative components that
section 9 deletes. **Delete them with their consumers.** Proof Mode needs exactly two:
`sov-pulse` (a running stage) and `sov-line-grow` (a stage's elapsed bar). Both exist.
The `prefers-reduced-motion` block at `:256-268` already covers them.

### 6.2 Density and typographic hierarchy as the expressive tool

Since colour is fixed, three levers carry all the expression. State them as rules so
they are applied consistently rather than per-component taste:

1. **Density encodes altitude.** A ledger is `--density-dense` with `--text-ledger`
   mono. A stage headline is `--density-comfortable` with `--text-body`. A judge
   scanning a 40-row candidate table and a judge reading one denial reason need
   different rhythms, and switching rhythm is how the UI says "you are somewhere else"
   without a colour change.
2. **Mono is for machine-issued values, sans is for prose.** Already the house style
   (`primitives.tsx:20`, `:100`, `:120`). Make it absolute: an ID, hash, unit, latency,
   coordinate, rule path or model name is **always** `font-mono tabular`. A sentence a
   human wrote or a model generated is **always** `font-sans`. A reader then knows,
   pre-attentively, whether they are looking at a measurement or an assertion. That
   distinction is the entire product.
3. **Rule weight encodes containment.** `border-border` = related rows.
   `border-border-strong` = a bounded claim. `border-l-2` in a verdict colour = a state
   applied to something. No shadows for hierarchy inside data surfaces —
   `shadow-sm` stays on page-level cards only.

### 6.3 The eight primitives

#### 6.3.1 `<Timeline/>` + `<TimelineStage/>` + `<StageMarker/>`

```tsx
// shared/ui/timeline/timeline.tsx
export interface TimelineProps<Id extends string> {
  stages: { id: Id; index: string; label: string; status: StageStatus
            durationMs: number | null; headline: string | null
            counts?: Partial<Record<string, number>> }[]
  activeId: Id | null
  onSelect: (id: Id) => void
  orientation?: 'vertical' | 'horizontal'   // default vertical
  density?: Density                          // default 'compact'
  /** Renders a live elapsed counter for the running stage. */
  runningSince?: string | null
}
```

`<StageMarker/>` is the only place stage status becomes a glyph, and it takes **no
`pulse` prop** — pulsing is derived from `status === 'running'`. `agent-pipeline.tsx`
today lets a caller pulse a done stage.

```tsx
export const STAGE_GLYPH: Record<StageStatus, string> = {
  pending: '○', running: '◐', passed: '●', flagged: '◆',
  denied: '⛔', failed: '✕', held: '⏸', skipped: '⊘',
  unavailable: '—',
}
```

`agent-pipeline.tsx` (163 LOC) is **replaced** by this, not wrapped.

#### 6.3.2 `<InspectorPanel/>`

The container for every stage panel and every drawer body. One component means the
proof inspector, the evidence inspector and the P&ID side panel are visibly the same
object, which is how a user learns the interaction once.

```tsx
export interface InspectorPanelProps {
  index: string                       // "04"
  title: string                       // "ROUTING"
  status: StageStatus
  subtitle?: string                   // "router v3 - 4 candidates - 1 eligible"
  timing?: { durationMs: number | null; at: string | null }
  actions?: ReactNode                 // deep links, copy, download
  /** Audit rows this panel is accountable for. Always rendered in the footer. */
  auditSequences?: number[]
  children: ReactNode
}

export function InspectorSection({ label, children, density }: {
  label: string; children: ReactNode; density?: Density
}): JSX.Element

export function InspectorField({ label, value, mono = true, copyable }: {
  label: string
  /** null renders an em-dash. There is no default value. */
  value: string | null
  mono?: boolean
  copyable?: boolean
}): JSX.Element
```

`InspectorField` with `value={null}` renders a dash. That is the whole anti-fabrication
mechanism at the field level: **there is no way to pass a fallback.**

#### 6.3.3 `<SideBySide/>` + `<DiffLine/>`

```tsx
export interface SideBySideProps {
  left:  { label: string; sublabel?: string; badge?: ReactNode; body: ReactNode }
  right: { label: string; sublabel?: string; badge?: ReactNode; body: ReactNode }
  /** Rendered in a full-width strip under both columns. */
  reconciliation?: ReactNode
  /** Stacks on narrow; a two-column diff below 900px is unreadable. */
  breakpoint?: 'md' | 'lg'
}
```

Used by: conflicts (4.5), run comparison (item 28), approval revision diff (item 25),
and routing "selected vs runner-up".

`<DiffLine/>` handles the text case with `added | removed | unchanged | moved`, coloured
`--sovereign` / `--critical` / inherit / `--active`. No new tokens.

#### 6.3.4 `<GraphOverlay/>` + `<Bbox/>`

The P&ID and page-raster substrate. Deliberately *not* a graph library: the backend
returns page-space coordinates, so this is absolute positioning over an image plus hit
testing. No new dependency.

```tsx
export interface GraphOverlayProps {
  /** Natural pixel size of the underlying raster; all coords are normalized 0..1. */
  naturalSize: { width: number; height: number }
  src: string                                       // the page/diagram raster URL
  boxes: OverlayBox[]
  paths?: OverlayPath[]                             // roadmap line 86: highlight graph paths
  selectedId: string | null
  onSelect: (id: string | null) => void
  viewport?: { scale: number; x: number; y: number }
  onViewportChange?: (v: Viewport) => void
}

export interface OverlayBox {
  id: string                       // node id AND evidence id — they are the same thing
  bbox: [number, number, number, number]
  label: string                    // "P-101A"
  kind: 'equipment' | 'instrument' | 'valve' | 'line' | 'junction' | 'text'
  confidence: number | null
  emphasis: 'none' | 'hit' | 'path' | 'dimmed'
}
```

`emphasis` drives `--overlay-hit` / `--overlay-path` / a scrim. Three states, no colour
invention. A dimmed box is `opacity: 0.35`, which is how "this is the answer, that is
context" gets said without a fifth hue.

#### 6.3.5 `<VerdictBadge/>`

```tsx
export interface VerdictBadgeProps {
  verdict: ClaimVerdict
  size?: 'inline' | 'row' | 'headline'
  /** Required for UNSUPPORTED and CONFLICTED — the type enforces it. */
  reason?: string
}
// Overloaded so that:
//   verdict: 'UNSUPPORTED' | 'CONFLICTED'  =>  reason is REQUIRED
//   otherwise                              =>  reason is optional
```

A badge that says `UNSUPPORTED` without saying why is the failure mode of every
compliance dashboard. Make it a type error.

#### 6.3.6 `<EvidenceChip/>` — see `<Cite/>`, section 4.2

The chip is the citation. One component, not two.

#### 6.3.7 `<MetricTile/>` — the anti-fabrication primitive

**Every number the app displays in a tile goes through this, and `provenance` is not
optional.**

```tsx
export interface Provenance {
  /** What produced this number. */
  source: 'measurement' | 'benchmark' | 'config' | 'derived'
  /** Human sentence: "psutil connection sample, 2s poll". */
  method: string
  /** When it was measured. null renders "age unknown" rather than looking fresh. */
  measuredAt: string | null
  /** Where to go to see the raw record. Renders the [source] chip. */
  href?: string
  /** For benchmarks: which dataset version, which run. Roadmap line 152. */
  datasetVersion?: string
  runId?: string
}

export interface MetricTileProps {
  label: string
  /** null renders "unavailable" with the method still shown. NEVER a zero. */
  value: string | number | null
  unit?: string
  /** Status accent. Absent = ink. */
  tone?: 'sovereign' | 'active' | 'approval' | 'critical'
  provenance: Provenance        // <- required. This is the point.
  trend?: { direction: 'up' | 'down' | 'flat'; detail: string }
}
```

Rewriting `security-view.tsx`'s five constants as `<MetricTile/>` is not possible —
there is nothing to put in `provenance`. **That is the mechanism working.** The
engineer is forced to either wire the real field or delete the tile.

`<ProvenanceChip/>` is the small `[ source ]` affordance, rendered bottom-right of
every tile, and is a `<Link/>` when `href` is present.

#### 6.3.8 `<DenialCard/>`

The most important single component after the timeline, because it is the one that
turns a refusal into a demo.

```tsx
export interface DenialCardProps {
  kind: 'policy' | 'sandbox' | 'egress' | 'injection' | 'file_guard' | 'integrity' | 'dimensional'
  subject: { label: string; detail: string }[]      // rendered as a definition grid
  checks: { label: string; passed: boolean; detail?: string }[]
  rule?: { id: string; excerpt: string; href: string }
  reason: string
  /** The reassurance line: "nothing was executed; 0 bytes left this host".
   *  Must be backed by a measurement or omitted entirely. */
  containment?: { statement: string; provenance: Provenance }
  auditSequences: number[]
}
```

Note `containment` carries its own `Provenance`. A denial card that says "0 bytes left
this host" without a measurement behind it is `security-view.tsx:145` all over again.

Supporting: `<EmptyState/>` (nothing here, and that is correct) and
`<UnavailableState/>` (we cannot tell you, and here is what would be needed) are
distinct components on purpose — conflating them is how `registry-view.tsx:215` came to
assert six documents in an empty table.

### 6.4 What gets deleted from the design system

| Delete | Why |
|---|---|
| `sov-radar-sweep`, `sov-laser-flow`, `sov-glow-sovereign`, `sov-glow-active`, `sov-deflection-burst`, `sov-drift`, `sov-dash`, `sov-trace` (`globals.css:185-237`) | Only consumed by components section 9 deletes. Decorative motion with no state behind it. |
| `glass-chassis` / `glass-chassis-dark` (`globals.css:144-158`) | Backdrop-blur panels are SaaS language, not instrument language, and they hurt text contrast over the `tech-grid`. The nav already open-codes its own blur. |
| `.custom-cursor-enabled` block (`globals.css:273-283`) + `sovereign-cursor.tsx` | `cursor: none !important` on every interactive element. On a shared demo machine with an unfamiliar operator this is actively hostile, and it is an accessibility regression. |

---

## 7. Accessibility and the keyboard model

This is an operator tool that will be driven live, on someone else's laptop, under time
pressure. The keyboard model is a demo asset, not a compliance checkbox.

### 7.1 Command palette

```tsx
// shared/ui/controls/command-palette.tsx
export interface Command {
  id: string
  group: 'Navigate' | 'Task' | 'Evidence' | 'Policy' | 'Routing' | 'Assurance' | 'System'
  label: string
  hint?: string                  // right-aligned context, e.g. "delivered - 42.3s"
  keywords: string[]
  shortcut?: string[]
  run: () => void | Promise<void>
}

export interface CommandPaletteProps {
  /** Sources are registered by feature slices, so the palette has no feature imports. */
  providers: CommandProvider[]
}
export type CommandProvider = (query: string) => Command[] | Promise<Command[]>
```

Providers registered at the app layout:

| Provider | Yields |
|---|---|
| `navigationCommands` | the six routes + the sub-tabs |
| `taskCommands` | recent runs, `prove <id>`, `open <id>`, `cancel <id>`, `compare <a> <b>` |
| `evidenceCommands` | every ledger ID in the current run: typing `V9` opens the inspector |
| `policyCommands` | rule IDs from `/api/policies`: `tool-permissions:code_sandbox` opens the rulebook at that rule |
| `routingCommands` | model IDs: opens `/knowledge/models` focused on a model |
| `systemCommands` | verify audit chain, run sandbox self-test, export audit log, download certificate |

The demo value is specific: when a judge asks *"can you show me the rule behind that
denial?"*, the answer is `⌘K` `code_sandbox` `↵` — one gesture, no hunting through
tabs. That is the one-click rule (section 2.4) implemented for the case where clicking
would be three deep.

### 7.2 Keyboard map

Global:

| Keys | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `?` | Keyboard help overlay |
| `g` then `c` / `t` / `a` / `k` / `s` / `u` | Go to Console / Tasks / Approvals / Knowledge / Assurance / aUdit |
| `Esc` | Close the topmost overlay only (inspector, then palette, then modal) |
| `/` | Focus the primary search/filter on the current screen |

Proof Mode:

| Keys | Action |
|---|---|
| `p` | Toggle NORMAL / PROOF |
| `j` / `k` or `↓` / `↑` | Next / previous stage in the rail |
| `Home` / `End` | First / last stage |
| `1`–`9`, `0`, `-` | Jump to stage 01–11 directly |
| `e` | Open the evidence inspector on this stage's first item |
| `Enter` | Expand the focused stage's detail (mobile accordion) |
| `y` | Copy a deep link to the focused stage (`?view=proof&stage=routing`) |

Evidence inspector:

| Keys | Action |
|---|---|
| `j` / `k` | Next / previous ledger item |
| `f` | Filter by modality |
| `o` | Open the full source page |
| `c` | Copy the evidence ID |
| `Esc` | Close, **restoring focus to the `<Cite/>` chip that opened it** |

`useHotkey(keys, handler, { scope })` with a scope stack, so the inspector's `j`/`k`
shadows the rail's while it is open and unshadows on close. Every binding is disabled
while a text input has focus, except `Esc` and `⌘K`.

### 7.3 Accessibility requirements, per surface

**Proof rail** — `role="tablist"` `aria-orientation="vertical"`, stages are
`role="tab"` with `aria-selected` and `aria-controls`. **Roving tabindex**: one stop for
the whole rail, arrows move within it. The inspector is `role="tabpanel"`
`aria-labelledby` the stage. Eleven separate tab stops would make Tab useless.

**Live regions** — the stream announces **transitions only**, never payloads:

```tsx
<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
  {liveMessage}   {/* "Stage 4 of 11, routing, completed in 180 milliseconds" */}
</div>
```

A denial escalates to `aria-live="assertive"` — it is the one event worth interrupting
for. The candidate table, ledger and claim list are **never** inside a live region; they
would be re-read on every SSE tick.

**Evidence inspector** — `role="dialog"` `aria-modal="true"`, focus trapped, focus
returned to the originating chip on close. The bbox overlay is decorative
(`aria-hidden`) and every box has a **text equivalent in the ledger list**, which is
also the keyboard path to it. The P&ID is not keyboard-navigable as a canvas; it is
keyboard-navigable as a list, and the canvas mirrors the list selection.

**Colour is never the only signal.** Every verdict, stage status and gate result carries
a glyph *and* a text label. Checked against the four status colours: `--sovereign
#16a34a` on `--surface #ffffff` is 3.4:1 — **fails AA for body text**. Therefore status
colours are used for **borders, markers, glyphs and 11px+ bold mono labels only**;
verdict and stage prose renders in `--foreground`. This is already the de-facto pattern
(`primitives.tsx:100-111`); make it a written rule rather than a habit, because
`result-experience.tsx:226` and `registry-view.tsx:341` have already broken it by
setting body-weight text in `--sovereign`.

**Reduced motion** — `globals.css:256-268` already handles it. The only addition: when
`prefers-reduced-motion` is set, the running-stage marker uses a static filled ring
rather than `sov-pulse`.

**Target sizes** — the app uses a lot of 10-11px type. Every *interactive* element gets
a minimum 24x24 hit area via padding, even when the visible glyph is 10px. Current
offenders: `audit-view.tsx:336-347` (clear-search), `navigation.tsx:68-74` (menu at
32px is fine), the `<Cite/>` chip (must gain vertical padding).

---

## 8. Build sequence

Mapped to the roadmap's eight phases. Frontend work is deliberately **back-loaded
behind the backend contracts it needs**, except for the two items that are pure
subtraction and can start immediately.

### Phase 0 — Now, before anything else (no dependencies)

> This is ~1 day and it is the highest-leverage day available.

| # | Work | Files |
|---|---|---|
| F0.1 | **Delete the fabrications** (section 9 list A) | `registry-view.tsx:24-61,95-100,215,223,271,336`; `console-view.tsx:248-288,386-396,499,551`; `security-view.tsx:97-98,145,172,187,204,215-359`; `approvals-view.tsx:303-346,367,386`; `sovereignty-status.tsx:27,30,34,35,70,88`; `ask-view.tsx:337,476` |
| F0.2 | **Delete dead and decorative code** (section 9 list B) | `three-d-layer-view.tsx`, `sovereignty-topology.tsx`, `floating-telemetry-hud.tsx`, `sovereign-cursor.tsx`, `lib/firebase.ts`, `components/sign-in` firebase path |
| F0.3 | **Purge dependencies**: `three`, `@react-three/fiber`, `@types/three`, `firebase`, `@vercel/analytics`, `puppeteer-core`. Fix `package.json:2` name and `app/layout.tsx:19` `generator` | `package.json`, `app/layout.tsx` |
| F0.4 | **Fix the SSE hook**: remove the hardcoded `namedEvents` array; listen generically and surface unmapped events | `hooks/use-event-stream.ts:55-92` |
| F0.5 | **Fix the citation regex** to `[SFVCXH]` and make `confidence` nullable end to end | `result-experience.tsx:15`, `lib/types.ts:111-140`, all four `0.9x` fallbacks |
| F0.6 | **Add error boundaries** (four files) | `app/error.tsx`, `app/(app)/error.tsx`, per-route |
| F0.7 | **Split `lib/types.ts`** into `lib/contract/` and `lib/view/`; delete every legacy alias | `lib/types.ts` |

**Exit:** no number on any screen is unsourced; `npm run build` passes; the app renders
a failure as a failure.

### Phase 1-2 — Foundation + Security (roadmap items 1-6)

Backend is building `backend/evidence/`, `backend/sandbox/`, `backend/security/`.

| # | Work | Depends on |
|---|---|---|
| F1.1 | `shared/ui/` design-system scaffold: `<Timeline/>`, `<InspectorPanel/>`, `<MetricTile/>`, `<VerdictBadge/>`, `<DenialCard/>`, `<EmptyState/>`, `<UnavailableState/>` | nothing |
| F1.2 | Token additions (6.1) + motion/utility deletions (6.4) | nothing |
| F1.3 | Feature-slice migration: move existing views into `features/*` with no behaviour change | nothing |
| F1.4 | **`<Cite/>` + `<EvidenceInspector/>` v1** (text + locator fields; no raster yet) | **DEPENDS-ON: Backend/Evidence — `EvidenceItem` gains `source_id`, `page`, `bbox`, `modality`, `confidence`, `extraction_model`, `source_sha256` (roadmap item 2, line 86)** |
| F1.5 | Sovereignty rebuild: `<SovereigntyPanel/>` reading every `SovereigntyStatus` field; nav chip becomes a real reading | **DEPENDS-ON: Backend/Security — per-task egress attribution and `unapproved_connections` semantics (item 6, line 174-177)** |
| F1.6 | `<DenialCard kind="sandbox">` wired to real sandbox results; **delete `InteractiveASTPlayground`** | **DEPENDS-ON: Backend/Sandbox — an endpoint that runs the real AST guard on submitted source and returns structured violations (item 5, line 149)** |

**Exit:** the security screen contains only measured values and real controls.

### Phase 3-4 — Correctness + Knowledge (items 7-15)

| # | Work | Depends on |
|---|---|---|
| F3.1 | `<AnswerWithClaims/>`: claim spans, verdict underlines, inline explanations | **DEPENDS-ON: Backend/Verification — `Claim[]` with `span`, `verdict`, `evidence_ids`, `explanation` (item 9, lines 231-241)** |
| F3.2 | `<ConflictCard/>` + `<SideBySide/>` | **DEPENDS-ON: Backend/Verification — `Conflict` with two sides, normalized values and authority (item 10, lines 252-256)** |
| F3.3 | `<CalculationCard/>`: formula ID/version, inputs with units + evidence, recompute agreement | **DEPENDS-ON: Backend/Engineering — `CalculationRecord` and the dimensional-refusal list (items 7-8, lines 199, 215)** |
| F3.4 | `<RevisionChip/>` + superseded-source warning in the inspector | **DEPENDS-ON: Backend/Knowledge — document revision status on evidence (item 12, line 297)** |
| F3.5 | `<InjectionChip/>` + quarantined-evidence treatment | **DEPENDS-ON: Backend/Security — `injection_risk` on evidence (item 13, line 314)** |
| F3.6 | Retrieval panel: BM25 vs dense candidates, rerank delta, applied filters | **DEPENDS-ON: Backend/RAG — a retrieval trace, not just results (item 11, lines 48-52)** |

**Exit:** any claim in any answer opens to its reasoning.

### Phase 5 — Industrial intelligence (items 16-18)

| # | Work | Depends on |
|---|---|---|
| F5.1 | `<GraphOverlay/>` + `<Bbox/>` + viewport controls | nothing (pure geometry) |
| F5.2 | `<PageRaster/>` in the evidence inspector | **DEPENDS-ON: Backend/Evidence — `GET /api/evidence/{id}/render` page raster (section 4.3)** |
| F5.3 | `/knowledge/pid/[documentId]` route + `<PidCanvas/>` + `<PidGraphPanel/>` | **DEPENDS-ON: Backend/P&ID — overlay API: nodes/edges with page, bbox, confidence, evidence_id; and the graph operation used for a query (item 18, lines 84-88)** |
| F5.4 | Path/isolation highlighting; click-to-evidence from any node | **DEPENDS-ON: Backend/P&ID — traversal results as node/edge ID lists (item 17, line 79)** |

**Exit:** roadmap line 420 — a judge can visually confirm the answer matches the
highlighted path.

### Phase 6 — Governance transparency (items 19-23)

| # | Work | Depends on |
|---|---|---|
| F6.1 | `<PolicyDecisionPanel/>` + `<PolicyCheckList/>` + `<RuleExcerpt/>` = **Policy Explorer** | **DEPENDS-ON: Backend/Policy — structured `PolicyDecision` persisted for ALLOW and DENY, with `rule_id`, `rule_excerpt`, `policy_version`, `checks[]`, `audit_sequence` (item 21, lines 98-101)** |
| F6.2 | `/assurance/policy` rulebook route | uses existing `GET /api/policies` |
| F6.3 | `<RoutingPanel/>` + `<CandidateTable/>` + `<ScoreBreakdown/>` = **Routing Explorer** | **DEPENDS-ON: Backend/Models — per-stage candidate list with per-gate results and measured quality/latency/memory (item 19, lines 89-93)** |
| F6.4 | `<DigestVerifyChip/>` | **DEPENDS-ON: Backend/Models — model digest + manifest check result (item 20, line 97)** |
| F6.5 | `/knowledge/models` — the **real** model estate replacing `LOCAL_MODELS` | uses existing `GET /api/models/status` (`routes/system.py:152-173`) — **no new backend work; this could ship in Phase 0** |

**Exit:** roadmap line 496 — a judge understands a denial without reading logs.

### Phase 7 — Proof (items 24-28)

| # | Work | Depends on |
|---|---|---|
| F7.1 | `/tasks/[taskId]` route + `<TaskDetail/>` + `<ProofToggle/>` | nothing |
| F7.2 | `useTaskProof` + `proofReducer` + `<ProofRail/>` + `<ProofInspector/>` | **DEPENDS-ON: Backend/Proof — `GET /api/tasks/{id}/proof` returning `TaskProof` reconstructible from persisted state (section 3.6)** |
| F7.3 | All eleven stage panels (most are assembly of F1-F6 components) | the above |
| F7.4 | Live streaming, `<ProofStreamStatus/>`, reconnect | **DEPENDS-ON: Backend/Workflow — stable `id:` on every SSE frame for `Last-Event-ID` resume (section 3.8)** |
| F7.5 | Approval upgrade: REQUEST_REVISION, output-hash invalidation notice, revision diff | **DEPENDS-ON: Backend/Approval — item 25, lines 115-119** |
| F7.6 | Audit panel: Merkle root, Ed25519 signature verdict, tamper detection | **DEPENDS-ON: Backend/Audit — item 26, lines 120-124** |
| F7.7 | Certificate download + `<CertificateSummary/>` | **DEPENDS-ON: Backend/Proof — item 27, line 125** |
| F7.8 | `/tasks/[a]/compare/[b]` using `<SideBySide/>` | **DEPENDS-ON: Backend/Proof — COMPARE RUN API, item 28, line 130** |

**Exit:** roadmap line 531 — a complete run explained visually from input to signed
output without a terminal.

### Phase 8 — Hardening and demo (items 29-34)

| # | Work | Depends on |
|---|---|---|
| F8.1 | `/assurance/benchmarks` + `<BenchmarkGrid/>` + `<FailedCaseTable/>` | **DEPENDS-ON: Backend/Benchmarks — results API with dataset version, run timestamp, per-case detail (item 33, lines 150-153)** |
| F8.2 | Command palette + keyboard map (section 7) | nothing |
| F8.3 | Recovery UI: a resumed task shows its checkpoint in the proof rail | **DEPENDS-ON: Backend/Workflow — recovery recorded as an audit event (item 29, line 137)** |
| F8.4 | Demo-path hardening: the three golden scenarios walked end to end on the demo machine, every screen checked for an unsourced value | **DEPENDS-ON: Demo agent — frozen datasets (item 34, line 157)** |
| F8.5 | Console/Ask merge (section 2.3) — **only if F8.1-F8.4 are done** | nothing |

### Critical path, stated plainly

**F0.1 → F0.7 → F1.4 → F7.2 → F7.3.** Everything else is parallelisable. If the
schedule compresses, the frontend ships Phase 0 plus Proof Mode against whatever
subset of stages the backend can populate, with the rest rendering `unavailable`
(section 3.9). **A Proof Mode with four real stages and seven honest `unavailable`
stages is a stronger demo than eleven fabricated ones**, and it is the only version
that survives a follow-up question.

---

## 9. What to cut

### List A — fabrications to delete on sight (Phase 0)

| Target | Lines | Disposition |
|---|---|---|
| `registry-view.tsx` `LOCAL_MODELS` + `ModelEstateTable` | `:24-61`, `:145-194` | **Delete.** Replace with `<ModelEstate/>` over `GET /api/models/status`, which already exists. |
| `registry-view.tsx` PageHeader meta | `:95-100` | **Delete all four.** Replace with `<MetricTile/>`s for SOP count and chunk count only; drop "Models Online" and "VRAM Usage" until measured. |
| `registry-view.tsx` empty-state text, `chunk_count \|\| 12`, "ENCRYPTED RAM", `: 0.94`, "MiniLM-L6-v2 Cosine" | `:215`, `:223`, `:271`, `:336`, `:329` | **Delete.** Use `<EmptyState/>`; render `retrieval_mode` from the response. |
| `console-view.tsx` fake pipeline simulation | `:248-288` | **Delete the entire catch body.** Replace with an error state: "The workbench service did not accept this task." This is the single most damaging block in the repo. |
| `console-view.tsx` telemetry row + `RESTRICTED` chip + "0 Egress" + "7 stages" | `:386-396`, `:499`, `:551`, `:653` | **Delete.** The classification chip reads `file.classification` or is omitted. |
| `security-view.tsx` `InteractiveASTPlayground` | `:215-359` | **Delete (144 LOC).** Rebuild later against the real AST guard, or not at all — `SandboxSelfTest` below it already does the honest version. |
| `security-view.tsx` hardcoded meta, hero strip, ConnectionTelemetry constants | `:97-98`, `:145`, `:172`, `:187`, `:204`, `:206` | **Delete.** `ConnectionTelemetry` receives `status` and must use it or not take it. |
| `security-view.tsx` always-green check icon | `:449` | **Fix** — icon derives from `d.status`. |
| `approvals-view.tsx` "Cryptographic Sign-Off Seal" block | `:303-346` | **Delete (44 LOC).** Replace with an honest `<ApprovalRecordCard/>`: reviewer, timestamp, output SHA-256 (which is real). Restore the seal only when item 26 ships a real signature. |
| `approvals-view.tsx` "cryptographically locked", `: '0.96'`, always-green check | `:154`, `:367`, `:386` | **Delete / fix.** |
| `sovereignty-status.tsx` invented rows | `:27`, `:30`, `:34`, `:35`, `:70`, `:88` | **Rewrite the component.** It is in the global nav; every value must be live, including subscribing to `sovereignty.status` SSE and calling `api.auditChain()` for the chain row. |
| `ask-view.tsx` host + egress constants | `:337`, `:476` | **Delete.** |
| `evidence-drawer.tsx` `: 0.95`; `result-experience.tsx` `: 0.95` and `: true` | `:49`, `:194`, `:219` | **Delete.** Nullable confidence (section 4.1); unknown verification is `unavailable`, never `passed`. |

**Approximate removal: ~380 lines of fabricated or misleading rendering.**

### List B — components to delete outright

| Component | LOC | Why |
|---|---|---|
| `three-d-layer-view.tsx` | **993** | Fabricated "Sovereignty Score: 100%" x4, "96%", "91%", ~40 raw hex colours outside the token system, zero backend calls. It is a pitch deck rendered before login. The roadmap's own "Do Not Prioritize" list (line 795) names cosmetic UI; this is the cosmetic UI. Its only consumer is `sign-in-view.tsx`, which becomes a sign-in form. |
| `sovereignty-topology.tsx` | **559** | Imported by nothing. |
| `floating-telemetry-hud.tsx` | **274** | Imported by nothing. |
| `sovereign-cursor.tsx` | **194** | `cursor: none !important` globally. An accessibility regression and a live-demo hazard on an unfamiliar machine. |
| `lib/firebase.ts` + the firebase branch of `sign-in-view.tsx` | ~80 + ~60 | A cloud identity provider in an air-gapped product. The contradiction is fatal under questioning and the dependency pollutes the SBOM (item 36, line 165). Local auth already works and is better. |
| `agent-pipeline.tsx` | 163 | **Superseded**, not merely deleted — `<Timeline/>` + `<ProofRail/>` replace it. Its progress ring and "Autonomous Agent Execution Matrix" heading are the theatre Proof Mode makes unnecessary. |
| `evidence-drawer.tsx` | 83 | **Superseded** by `<EvidenceInspector/>`. |
| `animated-technical-background.tsx` | 165 | **Demote**, do not delete. Keep it on sign-in only; remove from `(app)/layout.tsx:12` and the radial glow at `:15-18`. Ambient motion behind a data table costs GPU during a long-running SSE view and buys nothing. |
| `sovereign-radial-hero.tsx` | 311 | **Demote to sign-in.** Its `activeNodeId` prop is driven by `console-view.tsx:320-340`, a hand-written mapping from stage ID to node ID that duplicates routing logic the backend owns. Replace on the console with a compact `<Timeline orientation="horizontal"/>` of the real run. |

**Approximate removal: ~2,000 lines, plus ~2,400 with List A and the superseded pair.**

### List C — dependencies to remove

`three`, `@react-three/fiber`, `@types/three` (declared, **never imported** — `three-d-layer-view.tsx`
is CSS 3D), `firebase`, `@vercel/analytics` (declared, never imported — a telemetry SDK in an
air-gapped product's dependency tree), `puppeteer-core` (a headless Chromium download in
`devDependencies` of a project with no tests using it).

Also: `package.json:2` `"name": "my-project"` and `app/layout.tsx:19`
`generator: 'v0.app'`. Both are visible, both are free to fix, both read as unfinished
to a reviewer who opens the repo.

### List D — demote, do not delete

| Thing | Change |
|---|---|
| `/ask` as a route | Merge into Console in Phase 8 (section 2.3). It is good code; it is a duplicated entry point. Not before Proof Mode. |
| `lib/presentation.ts` `ROLES[].persona` (`:26,:33,:40,:47,:54`) | The file's own docstring warns these are not real people and must never render where they could be taken for the signed-in user. `role-switcher.tsx` and `result-experience.tsx:283` render `role.label`, which is safe — **audit this before demo** and delete `persona` if nothing consumes it. An invented approver name next to an approval would be the single worst screenshot this product could produce. |
| `CONSOLE_TEMPLATES` (`lib/presentation.ts:83-108`) | Keep. These are prompts, not data, and `applyTemplate` (`console-view.tsx:342-349`) already correctly refuses to invent the attachment. Align the three templates with the roadmap's three golden demos (item 34, lines 154-156). |

### What NOT to cut

`lib/api.ts:103-111` and `lib/presentation.ts:1-18` — the two comment blocks explaining
why sample data was removed. They are the product's stated ethics, in the repo, in
writing. Every argument in this document is downstream of them. Keep them verbatim, and
copy the reasoning into `shared/hooks/use-resource.ts` so the next engineer to reach for
a fallback reads it first.

---

## 10. Summary of cross-agent dependencies

| Ref | From | Needed |
|---|---|---|
| D1 | **Backend/Proof** | `GET /api/tasks/{id}/proof` -> `TaskProof` (section 3.6), reconstructible from persisted state, not the 400-entry in-memory bus. **Blocks all of Phase 7.** |
| D2 | **Backend/Evidence** | `EvidenceItem` -> `TypedEvidence`: `modality`, `locator{source_id,page,bbox,char_range}`, nullable `confidence`, `extraction_model`, `source_sha256`, `content_sha256`, `injection_risk`, `revision`. Prefixes extend to `X` and `H`. |
| D3 | **Backend/Evidence** | `GET /api/evidence/{id}/render?dpi=` -> page raster; `GET /api/files/{id}/page/{n}`. Without it the P&ID viewer and bbox highlighting cannot exist. |
| D4 | **Backend/Verification** | `Claim[]` with character `span`, `verdict`, `evidence_ids`, `recomputation`, `explanation`; `Conflict[]` with two sides, `normalized`, `authority`, `blocks_conclusion`. |
| D5 | **Backend/Policy** | `PolicyDecision` persisted for ALLOW and DENY with `checks[]`, `rule_id`, `rule_excerpt`, `policy_version`, `audit_sequence`; emitted as `task.policy_decision` over SSE. |
| D6 | **Backend/Models** | Per-stage `RoutingCandidate[]` with per-gate pass/fail and `measured{quality,p50,p95,memory,benchmark_run_id,dataset_version}`; `selected_digest` + integrity verdict. |
| D7 | **Backend/Engineering** | `CalculationRecord` with formula id/version, inputs carrying original + normalized units and `evidence_ids`, plus the dimensional-refusal list. |
| D8 | **Backend/P&ID** | Overlay API: nodes/edges with page, normalized bbox, confidence, evidence id; the graph operation used; traversal results as ID lists. |
| D9 | **Backend/Benchmarks** | Results API with dataset version, run timestamp, per-metric values and drillable failed cases. |
| D10 | **Backend/Workflow** | Stable monotonic `id:` on every SSE frame (`_sse`, `routes/system.py:437`) for `Last-Event-ID` resume; consistent stage events per item 30 line 141. |
| D11 | **Backend/Security** | Per-task egress attribution, or an explicit statement that it is unavailable — the UI will render `unavailable` rather than `0`. |
| D12 | **All backend agents** | Keep every response Pydantic and expose `/openapi.json` so `lib/contract/` is generated and `contract:check` can fail CI on drift. |

---

## 11. The one-paragraph version

Delete the ~2,400 lines that assert things this host has not measured — starting with
the fabricated GPU table, the simulated pipeline, the regex pretending to be the AST
guard, and the invented key fingerprint — because each of them is a question the team
cannot answer and a judge can reach in two clicks. Then build **one** new screen:
`/tasks/[id]?view=proof`, an eleven-stage rail over a stage inspector, where every stage
opens to a structured record, every number carries a provenance chip, every evidence ID
is the same clickable component opening to the same page and bounding box, and every
denial renders as a card that says what was refused, by which rule, and what did not
happen as a result. Policy Explorer and Routing Explorer are two of those eleven
panels, not two new tabs. The P&ID viewer and the benchmark dashboard are routes,
because they are workspaces. The nav goes from seven tabs to six. Nothing in the palette
changes; density, mono-versus-sans, and rule weight carry the entire hierarchy. And if
the backend is only half built by judging day, the proof rail shows four real stages and
seven honest `unavailable` ones — which is a demo that survives the follow-up question,
which is the only kind worth giving.
