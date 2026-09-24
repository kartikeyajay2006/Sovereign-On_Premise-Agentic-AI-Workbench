# 13 — Research: Chat-First & Agentic Interfaces

Companion to `10-RESEARCH-CONSOLES.md` (developer/infra consoles), `11-RESEARCH-LANDING-FIRSTRUN.md`
(landing and first sixty seconds) and `12-RESEARCH-EVIDENCE-UI.md` (evidence, provenance, audit).
Where those three describe *screens*, this one describes the **thread** — the single conversational
surface AEGIS is being reframed around, and how a governed 11-stage run has to live inside one
assistant turn without ever showing unverified text as if it were verified.

---

## 0. Method, and how to trust this document

Every claim carries a tag:

- **[OBSERVED]** — I fetched the page, the docs, or the source file and read the thing itself.
  Where a number appears under this tag it came out of real CSS, real source, or a vendor's own
  documentation, and the file or URL is named.
- **[REPORTED]** — credible secondhand: a vendor help article, a published teardown, a paper. URL given.
- **[MEMORY]** — from training, not re-verified. Treated as a hypothesis, never as a measurement.

**What I could not access, and will not guess about:**

| Target | Why not |
|---|---|
| chatgpt.com **signed in** | Login wall. §2.11's measurements are from the **logged-out** shell, which serves `#web-mobile-root` and may differ from the app. Thumbs up/down and "Branch in new chat" could not be verified. `openai.com`, `help.openai.com` and `chatgpt.com/features/*` return **HTTP 403** to automated fetch; some pages were recovered via an `r.jina.ai` proxy. |
| claude.ai live DOM | Login wall — `claude.ai/new` redirects to `/logout?involuntary=1`. The conversation width was recovered indirectly from a browser extension whose source overrides `.mx-auto.max-w-3xl`. **No measured artifact-panel width, resizability or dismiss affordance exists**; do not let anyone fill those in from memory. |
| **Anthropic Console Workbench** | Login-walled, **and Anthropic's docs do not document the Workbench UI at all** (checked the prompt-engineering and test-and-evaluate guides). No reliable data. |
| **OpenAI Playground** | Login-walled; `platform.openai.com/docs/*` now 301s to `developers.openai.com` and the guides are API-level, not UI-level. No reliable data. |
| **Google AI Studio** | `aistudio.google.com` returned `net::ERR_ABORTED`. Only the docs blurb (a top-right **Run settings** panel, prompt placeholder "Type something...", a "Get code" button). |
| **Notion AI** | Help-centre description only; the panel is behind login. |
| **Phind** | Returned **404** in the browser and **403** to curl on 2026-09-21. **Could not verify the product is live.** Treated as unverified, possibly defunct — and dropped from the shortlist for that reason. |
| **help.harvey.ai** | Entirely Auth0-walled — every `/articles/*` and `/release-notes/*` 307-redirects to `harvey-ai.us.auth0.com/authorize`. **Harvey's citation marker shape is therefore unverified.** |
| **docs.consensus.app, help.consensus.app, perplexity.ai/help-center, scispace.com/resources/*** | **HTTP 403** to fetchers. |
| Elicit app, Hebbia Matrix, Harvey app, Glean instance, app.devin.ai, smith.langchain.com, cloud.langfuse.com, jules.google (authed), github.com/copilot/agents (authed), all four app-builder editors | Account required. No live DOM. |
| ChatGPT Canvas help article | **HTTP 403**. Canvas detail in §2 is thin as a result, and is marked so. |
| `gemini.google.com` "Show thinking" label; DeepSeek R1 raw-CoT docs | Login wall / the DeepSeek page has been rewritten and no longer documents `reasoning_content`. Both named as unverified rather than asserted. |
| Mejtoft et al. (2018) skeleton-screen study | DiVA PDF returned 422; only NN/g's secondhand citation was available. |
| Argo Workflows docs; CircleCI workflow view | DNS-unreachable / not fetched. CI **semantics** are cited; CI **colours** are not, because no vendor documents them in prose. |
| `web.archive.org` | Blocked for these tools — no historical UI snapshots. |
| Exact pixel geometry of anything behind a login | Not estimated. Where a number is absent, this document says so rather than inventing one. |

**Two corrections this research produced**, both worth carrying because they contradict widely
repeated claims:

1. **Perplexity does not use numbered superscripts.** Live measurement (§2.2) shows lowercase
   monospace **domain chips** with a `+N` overflow count. Two design-teardown blogs still describe a
   bracketed-numeral system with specific hex values; those values do not match the live product.
2. **The "latency ≥75% → red" trace-row rule is Langfuse's, not LangSmith's** — and Langfuse
   **removed it** on 17–18 Sep 2026, three days before this research (§2.18). No percentage-threshold
   colour rule is documented for LangSmith at all.

**Honesty note specific to this document.** Two of the richest sources here are open-source
component libraries — Vercel's `ai-chatbot` / **AI Elements**, and **assistant-ui Elements** — whose
source I could read directly. They are not as glamorous as a teardown of ChatGPT, but they are the
only references in this study where I can quote an exact class string and know it is true. Several
numbers below (composer min/max height, thread gutter, sidebar width, artifact split) come from
there, and are marked [OBSERVED] for that reason. Treat them as *known-good implementations of the
consensus pattern*, not as ChatGPT's literal values.

**Where this research lands in the codebase.** `frontend/components/console/console-view.tsx:31`
currently models a run as `Phase = 'idle' | 'running' | 'result'` — a one-shot form, a pipeline
board, and a result block, none of which are a thread. `frontend/hooks/use-event-stream.ts` already
carries the right raw material: 24 named SSE events including `task.stage`, `task.evidence`,
`task.verified`, `task.blocked` and `task.approval_decided`. The reframing is mostly a *rendering*
change, not a protocol change. That is the single most important finding in this document.

---

## 1. Shortlist — the most transferable references

Ranked by how much of AEGIS's specific problem each one solves. The problem, restated: a thread
where **an assistant turn is a governed pipeline whose stages can be denied or skipped, whose
output may be nothing at all, and whose prose may not appear before it is verified.**

| # | Reference | What we take | Why it maps |
|---|---|---|---|
| 1 | **assistant-ui Elements** (open-source gallery) | The entire vocabulary: `guardrail-notice`, `approval-card`, `retrieval-chunks`, `document-reference`, `job-progress`, `trace-waterfall`, `stopped-run`, `tool-group`, `agent-status`. | It is the only library in existence that has already drawn *a refusal in its own shape*, *passages before the answer arrives*, and *a job measured in minutes with honest weighted stages*. Those are three of our hardest screens, solved. |
| 2 | **Perplexity** | Numbered inline markers bound deterministically to retrieved chunks; a source strip at the same elevation as copy/share; per-claim multi-source popover with `1/2` pagination; "Check sources" on a highlighted span. | The closest consumer product to "every claim carries a pointer". Its failure modes are ours. |
| 3 | **Harvey** (legal AI) | Sentence-level citations; review tables with **per-cell** citations and human verification/re-run; multi-colour flagging in one table; Word-format deliverables edited in place. | The only citation-critical product operating under professional liability. Closest analogue to a corrosion engineer signing an approval note. |
| 4 | **OpenAI Deep Research** | The long-run pattern: clarifying question *before* the run, a live sidebar of steps and sources, 5–30 minute runs, a fullscreen report view, notification on completion. | Proof that users will wait many minutes with *no answer text on screen*, provided the activity is real and legible. Our 30–120s is a soft version of the same problem. |
| 5 | **Claude.ai** (thinking blocks + Artifacts) | Collapsible reasoning that auto-opens while streaming and auto-closes on finish; artifacts leaving the thread at a stated threshold ("typically over 15 lines") into a right-hand window. | The deliverable-leaves-the-thread pattern, and the collapsed-process pattern, both with a published trigger rule. |
| 6 | **Devin** (Cognition) | The worklog + Progress tab; clickable steps that jump the IDE/Shell/Desktop panes to that moment; a read-only Side Chat (`/btw`) that asks questions without interrupting the run. | A long agentic run rendered as an auditable log you can scrub, with a side channel that does not disturb the record. That is an audit trail with a UI. |
| 7 | **Linear agent sessions** | Activity taxonomy `thought / action / elicitation / response / error`; ephemeral activities replaced by the next one; a hard **10-second** liveness contract. | A governed activity model with a wire format, inside a system of record. Almost a drop-in for our SSE taxonomy. |
| 8 | **Vercel AI Elements / `ai-chatbot`** | Measurable thread geometry, composer behaviour, history grouping, artifact split, `Reasoning`/`Task`/`Tool`/`Sources`/`InlineCitation` primitives with real defaults. | Real numbers I can read, matching the consensus pattern. The cheapest way to stop arguing about spacing. |
| 9 | **Cursor agent mode / Cursor 3** | Diff review as a first-class pane; agents listed in an Agents Window; "clicking files in review list jumps to diff in review pane". | Review-before-accept as the default posture, and a many-runs-at-once list. Our approvals queue is the same shape. |
| 10 | **Consensus** | The **Evidence Strength** table (one row per claim, Strong/Moderate), disconfirming evidence as a first-class row, a **documented suppression threshold** (no verdict below 5 classifiable sources), and a **published 10% self-reported error rate**. | The only product that withholds its confidence widget rather than showing it weakly, and the only one that tells users how often it is wrong. Both are things a governed product should do. |
| 11 | **Glean** | The `referenceRanges` / `snippets` / `pageNumber` citation wire format, a ~200-character context window around each quote, preview-before-navigate, and permission filtering upstream of the model. | A reusable data model for "document, page, region", and an ACL posture identical to our classification gate. |
| 12 | **Claude Code (terminal)** | Six named run states with distinct glyph *and* colour *and* persistence behaviour; a one-line summary refreshed every 15s; failure rows that linger 30s while successes clear immediately. | The only surveyed product that documents a complete status vocabulary. Ours needs one. |
| 13 | **ChatGPT** (measured, logged out) | The exact thread and composer geometry: 640px column against a 768px composer; one-line-to-eight-line growth; the user turn *as* its own edit button; actions outset left of the column; published Canvas trigger rates. | The default every reader of our UI already has in their hands. Diverging from it should be a decision, not an accident. |

**Deliberately excluded and why.** *Bolt / v0* — their thread is a build log for a preview iframe;
the deliverable is a running app, not a cited claim, and their default is to hide process (both still
appear in §2.17 for specific findings). *Notion AI* — inline-document AI, no run concept, and the
panel is behind login. *Phind* — **could not be verified as a live product** (404 in-browser, 403 to
curl on 2026-09-21); dropped rather than described from memory. *Hebbia / Scite / Elicit* — one or
two strong ideas each rather than a transferable whole; covered in §2.14–2.15. *OpenAI Playground /
Anthropic Workbench / Google AI Studio* — all login-walled **and undocumented at the UI level**; see
§0. Nothing about them is asserted here.

---

## 2. Per-reference breakdown

Each reference is taken through the nine headings. Where a heading does not apply to a reference it
says so rather than padding.

§2.1–2.10 are the primary references. §2.11–2.18 are single-idea references worth one section each.
§2.19 (CI/CD status vocabularies) and §2.20 (the research literature) are not products at all, but
they carry two of the three findings that most change the design.

### 2.1 assistant-ui Elements — the closest thing to a spec for our product

Source: `https://www.assistant-ui.com/elements` and its element pages. All [OBSERVED] — these pages
are public and I read them.

**Thread anatomy.** Not prescriptive about bubbles; prescriptive about *turn composition*. A turn is
a sequence of parts, and every governance concern is a part with its own element. The gallery's own
index lines are worth quoting because they are, effectively, our backlog:

- `inline citation` — "Numbered references inside a sentence, each with a hover preview of its source"
- `document reference` — "A document the answer leans on, with the quoted passage and the page to jump to"
- `retrieval chunks` — "The passages a retrieval answer stands on, scored, before the answer itself arrives"
- `confidence` — "Which claims came from a source, which were inferred, and which are guesses"
- `guardrail notice` — "A refusal in its own shape, with the nearest thing it can do instead"
- `job progress` — "Work measured in minutes: weighted stages, an ETA, and a way out"
- `stopped run` — "You pressed stop. The half-written answer stays, and continuing is one tap away"
- `trace waterfall` — "Every span in a run on one time axis, nested, so you can see where it actually went"
- `approval card` — "Human in the loop: the agent asks before it runs anything with side effects"
- `score breakdown` — "A verdict with its arithmetic shown: criteria, weights, and what pulled it down"

**The composer.** Not covered by the gallery; see §2.8.

**Showing multi-step agentic work.** `tool-group` [OBSERVED]: consecutive tool calls collapse
"behind a single row: a count, a status icon while any of them are still running, and a chevron that
expands into every call underneath." Default is `defaultOpen={false}` — collapsed. The trailing text
is state-dependent and *honest about failure*: "while running it displays `done/total` with a
spinner; settled groups with failures show `n failed` with a red X; and fully settled groups show
`n done` with a green check." The label pluralises correctly: "the plural 'tool calls' except for a
group of exactly one, which reads '1 tool call'."

`tool-timeline` [OBSERVED] compresses a whole session to "a verb, an icon, and a chip per step,
ending in a row of file-change stats", with a collapsed trigger reading e.g. `3 steps · 1 file
changed`. Critically: "**a step can exist in `steps` before it is shown**", and "only the last
visible step shimmers, and only while streaming is true; every earlier step reads as settled even
mid-run." That is exactly the discipline we need — *one* live element at a time, everything behind
it settled.

`task-card` [OBSERVED]: grouped tasks summarise as `5 tasks · 1 running · 1 failed` with a
"Show N more" button once siblings exceed four.

**Reasoning display.** `reasoning` is a collapsible that follows the active message part. See §2.8
for the AI Elements sibling with exact props.

**Citations inline.** `inline-citation` [OBSERVED]: "Numbered references inside a sentence, each
with a hover preview of its source." The preview card shows "the source's domain, title, and
snippet." And a warning we must design around, quoted verbatim:

> "This element has no runtime composition: assistant-ui has no positional link between a citation
> marker and an offset inside streamed message text."

That sentence is the whole argument of §5 in miniature. **If text streams, the citation cannot be
bound to it positionally as it arrives.**

`document-reference` [OBSERVED] is the element closest to AEGIS's actual need — a PDF page and
region, not a URL. Anatomy: a header with file icon, title, and a metadata line reading
`"N pages · M cited"` (zero renders as `"0 cited"`), then a button row, one button per anchor, each
showing a page label `"p. N"` above the quoted passage. Clicking calls `onJump(page)`. Buttons whose
page matches `activePage` get active styling, and the first anchor on that page gets `aria-current`.

`sources` [OBSERVED]: favicon links for URLs, **badges for documents** — "A `document` source never
links anywhere and always shows its `title`." Favicon falls back to a single letter from the domain
when the image fails. "The trigger's count always reads `sources.length`, whether the panel is open
or not; an empty `sources` array leaves the trigger reading '0' and the panel opens onto an empty
grid." An empty state that still shows the zero is exactly right for us.

`retrieval-chunks` [OBSERVED] — the single most transferable element in the gallery. Passages render
**before the answer**. The status line "reads `Retrieving` with shimmer animation while searching,
then switches to `N passages above threshold` once complete." Each passage shows source, locator
(examples given: `§ 2`, `L12`), a relevance score as a numeric value *and* a named meter, and a
snippet clamped to two lines. Score colouring: "The score text turns emerald at `0.8` and above;
anything below reads in the muted foreground color." And a refusal to fake a threshold: "Nothing in
the element enforces a relevance floor: pass a shorter `chunks` array to drop passages below your
own threshold."

**Artifacts and side panels.** Not the gallery's concern.

**Alternatives to token streaming.** Three elements carry the load.

`job-progress` [OBSERVED]. Stages have a `name` and a `weight` — "relative share of the overall bar
this stage accounts for" — summed, defaulting to `1` if the total is zero. ETA is **not computed**;
it is a string prop (`"about 3 min"`, `"starting"`), and switches to `"done"` on completion. The
honesty rule, verbatim:

> "If the job fails or gets cancelled partway, resolve with wherever it stopped rather than
> throwing, so the finished card can still say where things stood."

`stageIndex` may stop short of `stages.length` in a terminal result, and no checkmark is drawn
unless it reaches the end. Three stage weights visually: "already passed stages read faintly, the
current stage reads bright, stages still ahead read faintest of all." Cancel is present only while
`stageIndex < stages.length`, and `onCancel` "should actually stop the work, such as an
`AbortController` your fetch call listens to."

`thinking-indicator` [OBSERVED]: "a pulsing dot, a label that fades in fresh every time it changes,
and an optional elapsed-time badge". It "keys its inner label on the string itself", so changing the
label replays the animation. Runtime label derives from pending tool calls — `Running <tool name>` —
defaulting to `Thinking`. And a caveat we will hit: "There is no runtime selector for 'seconds
elapsed so far': `metadata.timing` only finalizes once the message stops streaming, so a live badge
needs its own timer."

`agent-status` [OBSERVED]: a pill with four states — `working` (filled pulsing blue dot),
`waiting` (static muted outline), `done` (check), `failed` (cross); a crossfading label; elapsed time
shown **only** while working or waiting, formatted `0:04`. Example labels include
`"Waiting for approval"`, `"Finished, 2 files changed"`, `"N of M tasks running"`. Placement: header
or toolbar, and it "renders only while a task runs or waits for input, and nothing once everything
has settled."

`stopped-run` [OBSERVED]: the partial text stays, with "a blinking cursor after them", plus a reason
badge whose text is "freeform text, not a fixed enum, so the badge can describe any way a run ends
short of completion, not only a manual stop." Default label `"stopped by you"`; other examples
`"hit the length limit"`, `"blocked by a content filter"`, `"failed partway through"`. Two buttons:
Continue, Discard.

`guardrail-notice` [OBSERVED] — the blocked turn, which for us is a *success* state. Three sections:
header (shield icon, title, policy tag), explanation body, optional alternatives. Detected by
`status.type === "incomplete"` with `status.reason === "content-filter"`, distinguished from
`"cancelled"`, `"length"`, `"error"`, `"other"`. Styling: a `paper` surface,
`"flex w-full max-w-sm flex-col gap-3 rounded-[20px]"`, amber-tinted shield, **monospace policy
tag**. Alternatives render as buttons when `onPick` is supplied, otherwise as static text.

`approval-card` [OBSERVED]: header (icon, title, subtitle), the command in monospace on a `field`
surface, then a footer that "is one of two things: the three-button strip while `state` is
`"request"`, or a single status line once it is not." Buttons: **Deny / Always Allow / Allow Once**.
After the decision, "the status line's icon and text are fixed per state (a spinner for `"running"`,
an X for `"denied"`, a check for `"done"`)."

`score-breakdown` [OBSERVED] — how a verdict shows its arithmetic. Header carries "a total out of a
max, a colored verdict pill, and the weighted criteria that produced it". Criteria rows show name,
weight as `×N`, and score. The bar rule is a small masterpiece of honesty:

> "two criteria with the same score always draw identical bar widths no matter how differently they
> are weighted; weight only ever shows up as the ×N label next to the score."

Thresholds: "emerald at 0.75 and above, amber from 0.5 up to just under 0.75, red below 0.5."

`trace-waterfall` [OBSERVED]: one row per span with name, positioned bar, and duration in ms.
Indent **0.75rem per depth level**. Shared time axis; bar left = `startMs / totalMs`, width =
`durationMs / totalMs`, `totalMs` of zero treated as `1`, minimum bar width **1.5% of the row**.
Status colours: `running` blue and pulsing, `completed` flat neutral, `failed` red — and anything
not running or complete maps to failed, "a simplification for the three-color palette."

**Thread/history navigation.** Not covered.

**Empty state.** Not covered.

---

### 2.2 Perplexity — measured live

Measured in a real browser at 1440×900 on 2026-09-21. This section **corrects the widely repeated
claim that Perplexity uses numbered superscripts.** It does not, any more.

**Citations inline — a domain chip, not a number** [OBSERVED]. The live DOM:

```html
<span class="citation inline" data-pplx-citation
      data-pplx-citation-url="https://www.dlapiper.com/…">
  <span class="group/trigger inline-flex min-w-0" data-state="closed">
    <span class="citation inline" style="width: 86px;">
      <span class="text-3xs rounded-md … cursor-pointer align-middle
                   font-mono tabular-nums font-normal
                   transition-colors duration-150 inline-flex items-cent…">
```

- Label is the **publisher domain, lowercase**: `dlapiper`, `heuking`, `itbrief.co`.
- `rounded-md` (6px), `font-mono tabular-nums`, `text-3xs`, `align-middle`, **150ms colour-only
  hover transition**.
- Measured chips: **58×23px**, **70×23px**, **86×23px**. The wrapper carries an inline
  `style="width: 86px"` — Perplexity **pre-computes and pins each chip's width**, almost certainly to
  stop reflow while the answer streams. Steal this for a different reason: our chips appear *after*
  verification, and a pinned width lets a citation slot be reserved before its verdict lands.
- The chip is preceded by a dedicated `<span class="citation-nbsp">` so it never orphans onto its
  own line.
- Body context at the chip: 16px/26px, `rgb(39, 37, 30)` (warm near-black, not pure black),
  `font-weight: 435` — a variable-font axis value, not a standard weight.

**Multiple sources on one claim** [OBSERVED]. One chip: top domain plus an overflow count. Observed
in sequence down a single answer: `dlapiper +2`, `heuking +1`, `dlapiper +1`, `winzheng`, `winzheng`,
`heuking +2`, `itbrief.co +2`. Single source → bare domain, no suffix; multiple → `domain +N`.
**This is the cleanest multi-source pattern found in any product.** Clicking opens a popover with
favicon, domain, headline, excerpt and **`1/2` pagination** through the stacked sources [REPORTED,
aiuxplayground].

**The source rail — measured** [OBSERVED, 1440×900, signed out]:

| Element | Measurement |
|---|---|
| Left nav | 240px |
| Main region | 1200px at x=240 |
| Answer pane container | 774px at x=272 |
| **Answer text column** | **720px** at x=299 |
| "Collapse pane" button | x=1054 — it is a real split pane |
| **Right source rail** | **318px** at x=1105, headed by a `Sources` disclosure (318×44px) |
| Source cards | 302px wide; heights 92 / 132 / 152px; **~156px vertical pitch** |
| Rail : answer ratio | **0.44** (rail = 26% of the 1200px main region) |
| Truncation | **None. No "show more" exists** — a continuous scrolling list |
| Count affordance | a toolbar button reading **"15 sources"**, beside a **"Researched 3s"** chip |
| Answer-mode tabs | `Answer` / `Links` / `Images`, 244×56px at x=299 |
| Rail empty state | **"Cited sources from search will appear here."** |

Card text is `domain | Title | first line of snippet`.

**Showing multi-step agentic work** [REPORTED, aiuxplayground]. Steps are **collapsed by default**
behind the literal string **"Completed N steps"**; expanding reveals plain-language step names —
**"Searching the web"**, "Checking current predictions" — deliberately "mirroring user mental models
rather than API names." Phases cycle **searching → reading → writing**. There is no progress bar; the
step list *is* the progress display.

Perplexity's own rationale is the best-articulated in the category [OBSERVED,
`langchain.com/breakoutagents/perplexity`]:

> "users were more willing to wait for results if the product would display the intermediate
> progress"
>
> — William Zhang: "**You don't want to overload the user with too much information until they are
> actually curious. Then, you feed their curiosity.**"

Later surfaces confirm the direction [OBSERVED, releasebot.io/updates/perplexity-ai]: the **Source
Context Panel** (27 Jul 2026) "keeps citations and supporting sources **alongside the response** …
without leaving the conversation"; Perplexity's agent product gained a per-thread **context panel**
where "live progress, generated artifacts, and credit usage appear side-by-side with your
conversation"; and — directly relevant to §5.3 — "Before starting a long or credit-heavy task,
Computer now **drafts a structured plan and waits for approval**."

**Unsupported content: nothing.** No flagging mechanism exists, in any source. Worse [OBSERVED]: a
simple factual query returned a "Researched" answer with **zero inline citations and the source rail
showing its empty state** — visually indistinguishable from a cited answer. That is precisely the
failure AEGIS exists to make impossible.

**What we take.** `domain +N` collapsed multi-source chips with in-popover pagination. Pinned chip
width. The `citation-nbsp` trick. The source count in the action row. A rail:answer ratio near 0.44
(for us: a ~320px evidence rail beside a ~720px answer, inside our 896px column). "Completed N steps"
as the collapsed string. Plain-language step names. Plan-before-run on expensive work.

**What we reject.** Shipping an uncited answer at all. And the *domain* as citation identity — ours
must be document, page and region.

**Correction recorded.** `geodocs.dev` and `blakecrosley.com/guides/design/perplexity` both describe
a bracketed-numeral Perplexity with citation accent `#0066cc`, a 680px answer column and uppercase
monospace domains. Live measurement gives a **720px column and a lowercase mono chip with no blue**.
Treat those hex values as one author's reconstruction, not Perplexity's tokens. This is a useful
warning about design-teardown blogs generally.

---

### 2.3 Harvey — the closest analogue for citation-critical professional work

All [REPORTED]; Harvey is fully gated. Primary source: `harvey.ai/blog/the-brief-april-2026`.

**Product shape.** Four surfaces: **Assistant** (chat, drafting, document analysis), **Vault** (bulk
cross-document review), **Knowledge** (research with citations), **Workflow Agents** (multi-step
automations built in natural language or a visual builder, "no code required", supporting
"conditionals, classification, role-based permissions, and external partner sharing").

**Citations inline.** The stated promise: "Validate Harvey's reasoning with confidence with
transparent reasoning, **sentence-level citations**, stronger formatting adherence (e.g. bold text,
bulleted lists), and improved response quality in review tables." Sentence-level, not
paragraph-level, not document-level — the same granularity AEGIS needs for
`material_claims_supported / material_claims_total` (`frontend/lib/types.ts`, `VerificationReport`).

Harvey has published *why* it moved to that granularity, which is the best-documented citation-design
decision found in this entire study [REPORTED, `harvey.ai/blog/rebuilding-harveys-review-algorithm`]:

- The old system used "cell-level citations" produced by "an algorithm that combined model-generated
  text and fuzzy matching."
- The new one uses "**sentence-based citations, making it patently clear which assertion in the
  response the citation supported**" — "the additional granularity allows users to more efficiently
  verify the model's reasoning and answer."
- The cell was split into two named fields: **Answer** ("consolidates the previous summary and
  additional context into a single field") and **Reasoning** ("the full analytical picture: what the
  document says, how Harvey interpreted it, and why it reached its conclusion").
- Measured outcome they publish: **preferred 4× more** in side-by-side evals, **7× more** on credit
  agreements and trial exhibits — and sentence-level citation also produced "a boost in output speed."

Splitting **Answer** from **Reasoning** as two named, separately citable fields is directly
transferable: our stage-08 verification report and our stage-07 calculation already produce exactly
those two things, and today they are collapsed into one prose blob.

**The interaction** [REPORTED, from an indexed snippet of the login-walled help centre]: "In Harvey's
response, **hover over a citation to preview** the data source that informed the response. You can
**click *View Reference*** to open the full context of the source. **The right-side panel lists an
overview of all cited sources.**" So: hover → preview; explicit named action → full source; persistent
right-hand sources panel. The marker's own shape is not documented anywhere reachable.

Later capability [REPORTED, `harvey.ai/blog/the-brief-september-2026`]: users may "attach up to five
knowledge sources in a single query", and agentic Vault search "finds the relevant files itself and
**cites the specific pages** behind its answer" — page-level citation, matching our
`EvidenceItem.location`.

**Showing multi-step work.** Review Tables: "structured grids where each row represents a document
and each column contains an AI-generated answer to a specific question", scaling to 10,000 files ×
500 columns, with **per-cell citations**, conditional column logic referencing prior columns for
detect-then-act workflows, and "human-in-the-loop editing, verification, and re-running". Multi-colour
flagging within a single table lets reviewers "capture risk nuances and escalate critical issues".
"Ask Over Review" gives "more accurate, granular results when asking Harvey questions about
cell-level details, like flags, in a review table."

**Artifacts / deliverables.** "Edit contracts, memos, and transaction documents in Microsoft Word
format directly in Assistant, preserving original formatting, structure, and document context" —
plus batch editing across multiple documents from a single prompt. This is our `.docx` deliverable
story, and Harvey's answer is *edit it in place inside the assistant*, not *download and hope*.

**Thread/history navigation.** "A redesigned Library experience that consolidates key prompts and
Workflow agents in one place"; the Vault page allows "add descriptions for your vaults, star and
filter your queries."

**Unsupported content — the sharpest negative-result affordance in the study.** [REPORTED] When
Harvey cannot find responsive information, instead of leaving a bare em-dash placeholder, "**Harvey
will now explain how it reached that conclusion by outlining where in the agreement Harvey
searched**" — the `—` is replaced by a *narrative of the search scope*. That is not a confidence
score and not a badge; it is a statement of what was looked at and not found. For AEGIS this maps
exactly onto an `UNSUPPORTED` claim: instead of a muted glyph and nothing else, say *which documents
and which sections were searched* before concluding the claim is unsupported.

Harvey also layers a **human** confidence signal on top of the model's output
[REPORTED, `harvey.ai/blog/collaborative-review-tables`]: a three-colour flag system — "**red for
deal-breakers, orange for negotiation points, and yellow for standard terms**" — plus per-cell
comments and manual-input columns. Note the inversion: the colour belongs to the *reviewer*, not the
model. Our reviewer's rejection notes want the same treatment.

One more line worth quoting, from Harvey's own getting-started guidance under a heading
*"Reducing Hallucinations & Improving Accuracy"*: "**Avoid Requesting Citations Explicitly: Harvey
will automatically generate citations when appropriate.**" Citation is a system property, not a user
request. Ours is the same — there is no "cite your sources" toggle in a governed pipeline.

**Documented numbers** [REPORTED]: 100,000 files per vault; 96% key-term extraction accuracy
(`harvey.ai/platform/vault`); review tables to 10,000 files × 500 columns.

**What we take.** Sentence-level citation as the contract, and the published reason for it. The
**Answer / Reasoning** field split. Per-cell provenance in any tabular output — our corrosion-rate
table is exactly one row per thickness location. Re-running a single cell rather than the whole
answer. The searched-scope narrative in place of an empty result. Reviewer flags as a layer distinct
from the model's verdict.

**What we could not verify.** Harvey's actual citation marker shape. `help.harvey.ai` is entirely
Auth0-walled — every `/articles/*` and `/release-notes/*` URL 307-redirects to
`harvey-ai.us.auth0.com/authorize`. Not guessed.

---

### 2.4 OpenAI Deep Research — the long-run pattern

[REPORTED] — `openai.com` and `help.openai.com` both returned **403** to direct fetch; detail is from
search-surfaced excerpts of the OpenAI Help Center article and Wikipedia's summary.

**Showing multi-step agentic work.** "Once deep research starts running, a sidebar appears with a
summary of the steps taken and sources used." Runs take "anywhere from 5 to 30 minutes"
(Wikipedia, quoting OpenAI: "autonomously browsing the web for 5 to 30 minutes"). The user can "edit
the research plan before it starts, view progress in real time, interrupt the research to adjust
focus, and update which sources the research can access." A later redesign added "a redesigned
sidebar entry point and fullscreen report view".

The teardown at `aiuxplayground.com/teardowns/chatgpt/output/` gives the exact strings and the
placement rationale [OBSERVED]:

- Collapsed row in the turn: **`Thought for 5s`** (i.e. `Thought for {duration}`).
- Opened panel header: **`Activity · 5s`**, with a **`Done`** state when reasoning finishes.
- Placement, verbatim: "**Activity opens beside the chat so the main answer stays clean while curious
  users inspect planning bullets.**"
- Copy and Edit icons sit on the Thought row itself, "for quick export or correction without opening
  the full panel."
- And the documented weakness, which is a direct warning for Design A in §4: "**Thought label is easy
  to miss on fast scroll. Users who want transparency may not discover Activity without trying the
  chevron.**"

There is a clickable **progress bar** during deep research runs [OBSERVED, kdnuggets]: "click on the
progress bar on screen: This opens a new panel that tells you about the actions ChatGPT is taking and
the reason for those actions." **Nothing anywhere documents what drives that bar.** Deep research has
no fixed step count, so it cannot be a real completion fraction. Treat it as decorative — and as the
single clearest example of the thing §5.4 forbids.

A documented real walkthrough: **13 minutes, 68 sources, 44 searches** [OBSERVED, kdnuggets]. The
Feb 2026 redesign added a fullscreen **three-column document viewer** — left table of contents,
centre report, right **expandable citations panel** [OBSERVED, macrumors]. Exports: Markdown, Word,
PDF.

**Failed and skipped steps: not documented.** No OpenAI source or teardown describes a failed step
inside the Activity panel, and *skipped* is not a concept in any deep-research product surveyed.

**Alternatives to token streaming.** This is the reference. For 5–30 minutes there is **no answer
text on screen** — only a growing list of steps and sources, and the option to intervene. Nobody
pretends a paragraph is forming. Four devices hold the user:

1. A **clarifying question before the run** — the wait is something the user configured, not
   something that happened to them.
2. A **live, real** step/source list, which is retrieved artefacts, not animation.
3. **Interruptibility** — adjust focus, add sources mid-run.
4. **Completion arrives asynchronously**; the run is not something you must stare at.

**What we take.** All four. Item 1 in particular is underrated: AEGIS's classification stage already
produces a `TaskProfile` with `reasons[]`, `step_budget` and `requires_vision`
(`frontend/lib/types.ts`). Showing that as an *editable plan before the governed stages start* turns
dead waiting time into consented waiting time.

**What we reject.** The fullscreen report viewer that leaves the thread. For us the report is a held
deliverable pending approval; it must not feel like a document the user already owns.

---

### 2.5 Claude.ai — thinking blocks and Artifacts

**Reasoning display.** [OBSERVED, `support.claude.com/en/articles/10574485` — the fetch returned the
French localisation, so these are translated, with the French quoted]:

- "Un indicateur « Réflexion » **avec un minuteur** montrant depuis combien de temps Claude traite" —
  a **"Thinking" indicator with a timer** showing elapsed processing time.
- "Une section « Réflexion » **extensible au-dessus de la réponse** de Claude" — an expandable
  "Thinking" section **above** Claude's answer.
- Clicking reveals "le **résumé** du processus de réflexion de Claude" — a **summary**, not raw CoT.

**No Anthropic-authored string "Thought for Xs" was found**, and **no Anthropic doc states whether
the block auto-collapses on completion.** The auto-open/auto-close behaviour is confirmed only by
the AI Elements `Reasoning` implementation (§2.8), which was built to mirror it. Recorded as a gap
rather than asserted.

**What is shown is a summary, from a different model.** [OBSERVED,
`platform.claude.com/docs/en/build-with-claude/thinking`]:

> "When `display` is `"summarized"`, the thinking text you receive is a summary of Claude's full
> thinking process rather than the raw chain of thought. … **No `display` setting returns the raw
> chain of thought.**"

> "Summarization is processed by a **different model** from the one you target in your requests. The
> thinking model does not see the summarized output."

> "You're charged for the full thinking tokens generated by the original request, not the summary
> tokens."

**The single most important API finding in this whole document** is on the same page, under
*Progress updates between tool calls* [OBSERVED]:

> "the model can write a progress update between tool calls. A progress update is **a sentence or two
> on what the model just found and what it's about to do next, written for the person watching the
> agent rather than as reasoning.**"

> "Use `display: "updates"` for an agent interface that **keeps reasoning hidden and shows the user a
> status line at each step**. Under it, any `thinking` block with non-empty text is a progress
> update, so render those and nothing else."

Anthropic's own example update: `"Confirmed the retry path never refreshes the expired token.
Editing auth.py to add the refresh call."` And when a run is cut short, the last block can be a
progress update whose text is exactly `This part of the response was interrupted before it
finished.`

That is a first-party, documented mechanism for exactly the thing AEGIS needs: **a human-facing
status line, generated by the model, that is not the answer and is not reasoning.** It is §5's
primary device, and it is already an API feature rather than something we must invent.

The whimsical labels — "Pondering", "Ruminating", "Noodling" — are **Claude Code spinner verbs, not
Claude.ai thinking headers** [REPORTED; a circulating list of 187, plus a filed issue asking for
them to be removable]. The split is itself the finding: the CLI, with multi-minute runs, uses whimsy;
the chat product uses "Thinking" plus a timer. AEGIS is neither — see §6.5.

**Artifacts and side panels.** [OBSERVED — `support.claude.com/en/articles/9487310`]. The trigger
rule is published, which is rare and useful. Claude creates an artifact when content:

> - "It is significant and self-contained, typically **over 15 lines**."
> - "It is something you're likely to want to edit, iterate on, or reuse outside the conversation."
> - "It represents a complex piece of content that stands on its own without requiring extra
>   conversation context."
> - "It is content you're likely to want to refer back to or use later."

Placement: "in a dedicated window to the right of the main chat." Multiple artifacts are managed via
"chat controls (slider icon in upper right)". Versions: "Switch between different versions using the
version selector." The help article does not state a dismissal affordance; I am not guessing one.

**Citations (the API).** [OBSERVED — `platform.claude.com/docs/en/build-with-claude/citations`] The
citation object carries `cited_text`, and a location that is one of three types: `char_location`
(`start_char_index`, **0-indexed**), `page_location` (`start_page_number`, **1-indexed**), or
`content_block_location`. Anthropic's own framing: "because the API parses citations into the
response formats described in the following sections and extracts `cited_text` directly, citations
are guaranteed to contain valid pointers to the provided documents."

And the fact that decides §5 for us, verbatim:

> "For streaming responses, citations arrive as a `citations_delta` delta type inside
> `content_block_delta` events. Each delta contains a single citation to add to the `citations` list
> on the current `text` content block."

**A citation for a sentence can arrive after that sentence's text has already been painted.** Under
token streaming, there is a window — sometimes a long one — in which a factual sentence is on screen
with no citation attached, and it is visually indistinguishable from a sentence that will never get
one. For a consumer chat that is a cosmetic lag. For AEGIS it is the exact failure the product
exists to prevent.

**What we take.** The published, numeric artifact threshold (we will set our own); the right-hand
dedicated window; the version selector; the three location types — `page_location` with a 1-indexed
page is precisely our `EvidenceItem.location`.

---

### 2.6 Devin — a long agentic run you can scrub

[OBSERVED — `docs.devin.ai/work-with-devin/devin-session-tools.md`].

**Showing multi-step agentic work.** The workspace is a chat/worklog column beside a tabbed pane.
The **Progress tab** is the consolidated record: users can "click on any of the steps within a Devin
session or click the Progress tab to view the details of that step", and it logs "all shell
commands, code edits, and browser activity." The **IDE pane** is a VSCode environment showing edits
in real time, with takeover: "take over Devin's work when necessary, test and fix changes end-to-end
without leaving the Devin webapp." The **Desktop tab** (renamed from "Browser" to reflect broader
capability) allows direct interaction for CAPTCHAs, MFA and awkward sites. The **Shell** gives "full
command-line access", with history that lets you "jump to different points in the session by
clicking on commands."

**Thread anatomy — the side channel.** The **Side Chat** panel "opens adjacent to the worklog as a
read-only interface", started by "typing `/btw your question` in the main chat box". This is the
single most AEGIS-relevant idea in Devin: **a way to ask a question about the run without writing to
the run's record.** In a system whose audit chain is the product, a clarifying question from an
operator must not become an indistinguishable turn in the signed transcript.

**Collapsed summary — Devin publishes its exact sidebar status strings** [OBSERVED,
`docs.devin.ai/release-notes/2026`]:

- 8 May 2026: "The session sidebar now shows **persistent status labels, such as 'PR created,'
  'Awaiting instructions,' or 'Approve session,'** alongside timestamps."
- 26 Aug 2026: "Sessions now show a dedicated **'Waiting'** activity status while Devin is
  intentionally sleeping in a wait."
- 18 Sep 2026: "Sessions that lose their VM now show a **'Reboot VM'** action in the sessions sidebar
  **instead of a generic blocked or finished state**."

That last one is a small masterclass: rather than collapsing an infrastructure failure into "failed",
the status *names the recovery action*. Our equivalent: a run that died because the sandbox was
unreachable should say `Sandbox unavailable — restart and re-run`, not `Failed`.

**Live state.** 9 Aug 2026: "**Tool calls in Watch Devin Work display timing**" — an honest per-call
elapsed timer, not an ETA [OBSERVED]. At the bottom of the Workspace sits a **timeline scrubber**
(Previous / Next / drag) — a history navigator, not a percent-complete bar [REPORTED]. And a log
hygiene rule worth copying, 24 Apr 2026: "**Consecutive file edits to the same file are now merged
into a single entry in the progress tab**" [OBSERVED]. The log deduplicates rather than listing every
raw action.

**Failed / blocked.** There is an explicit **`blocked`** session state distinct from `finished`
[OBSERVED]. Within a session, failure is diagnosed by opening shell history for that step, where
"**greyed-out commands indicate later timeline positions**" [REPORTED]. Exact failed-step colour and
icon: not documented. **Skipped: not a concept.**

**Nested work.** "Sub-Devin sessions spawned by automations… **appear expanded by default**"
(13 May 2026) [OBSERVED] — the inverse of the usual collapse-by-default rule, on the reasoning that a
delegated sub-run is exactly the thing you did not ask for and therefore must see.

**Cost.** Devin's unit is **ACUs**, not tokens. The Session Insights modal buckets sessions
**XS ≤2 ACU/≤2 msgs · S ≤5/≤5 · M ≤10/≤10 · L ≤20/≤20 · XL >20** [OBSERVED,
`docs.devin.ai/product-guides/session-insights`]. Insights are generated post-hoc on demand and take
"approximately one minute". For an air-gapped product the analogue is *stage-time budget consumed*,
and the bucketing idea is good: an operator learns the shape of an "L" run.

**Devin 2.0** added **Interactive Planning** — "responds in seconds with relevant files, findings, and
a preliminary plan… **you can modify before letting Devin work autonomously**" [OBSERVED,
`cognition.com/blog/devin-2`]. The third independent occurrence of plan-before-run in this study,
after Deep Research and Perplexity Computer.

**What we take.** The clickable step that scrubs a detail pane to that moment. The `/btw` read-only
side channel. The unified Progress record separate from the conversational worklog. Status strings
that name a recovery action instead of a generic failure. Log deduplication. Sub-runs expanded by
default.

**What we reject.** Takeover. There is no world in which a plant operator hand-edits a stage's output
mid-run and the audit chain still means anything.

---

### 2.7 Linear agent sessions — a governed activity model with a wire format

[OBSERVED — `linear.app/developers/agents`, `linear.app/developers/agent-interaction`].

**Showing multi-step agentic work.** "Sessions are created automatically when an agent is mentioned
or delegated an issue." **Six** session states, "tracked automatically based on the most recent
emitted activity — manual management isn't required": `pending`, `active`, `error`, `awaitingInput`,
`complete`, **`stale`** (entered after **30 minutes** without activity, recoverable). Five activity
types, quoted:

1. **Thought** — "A thought or internal note"
2. **Elicitation** — "Requests clarification or confirmation from the user"
3. **Action** — "Describes a tool invocation", with optional results on completion
4. **Response** — "Indicates work has been completed or a final result is available"
5. **Error** — "Used to report an error or failure"

Two mechanisms matter enormously to us.

**The liveness contract**, verbatim: "If you receive a `created` event, you are expected to send an
activity or update your external URL **within 10 seconds** to avoid the session being marked as
unresponsive." A platform-level SLA on *showing the user something real*, fast.

**Ephemeral activities**, verbatim: "Ephemeral activities are displayed temporarily, and will be
replaced when the next activity arrives from the agent." Only `thought` and `action` support it.

`ephemeral: true` is supported **only** on `thought` and `action` — "useful for showing transitional
states during processing." That is the cleanest solution found anywhere to the honest-progress
problem: a two-tier activity stream where transient status is explicitly marked transient and
*overwrites itself*, while substantive activities persist. Nothing accumulates into a fake wall of
progress, and nothing permanent is ever written for a step that did not happen.

**Two more details from Linear's changelog that are pure design decisions** [REPORTED]:

- "Fixed the **'Worked for X'** label on agent session turns to **measure active work time, excluding
  any idle wait between turns**." Elapsed time that excludes queueing and human-wait. For AEGIS, a
  run held at stage 09 for four hours awaiting a reviewer should read `worked 38.4s · held 4h 02m`,
  as two separate numbers, never as one.
- "**Thought items in the session sheet now render as full rich text instead of a single truncated
  line**" — revealing that the prior default was one truncated line per thought. Both defaults are
  defensible; the point is that the choice is explicit.

**Delegation, which is unusually apt for us.** "Delegate an issue to an agent while **keeping a human
teammate as the assignee**. The assignee remains responsible for the work, while the agent
contributes on their behalf." And: "Issues can only be **assigned** to humans, and only **delegated**
to agents." In a product where a named engineer signs an approval note, that distinction — the
machine contributes, the human remains accountable — is the correct mental model, and it should
appear in our copy.

**Failed / skipped.** Failure is session state `error`, raised by an `error` activity. Exact badge
colour and icon are not documented. **No skip concept exists.**

**What we take.** The taxonomy maps almost one-to-one onto the events already published in
`use-event-stream.ts`: `task.stage` → thought/action, `task.tool_started`/`task.tool_completed` →
action with result, `task.approval_decided` → elicitation resolved, `task.answer`/`task.deliverable`
→ response, `task.failed`/`task.blocked` → error. Adopt **ephemeral vs persistent** as an explicit
flag on our events. Adopt a 10-second first-paint budget as a hard rule.

---

### 2.8 Vercel AI Elements & `ai-chatbot` — the measurable reference

All [OBSERVED] from source at `github.com/vercel/ai-chatbot` (main) and `elements.ai-sdk.dev`.

**Thread anatomy.** `components/ai-elements/message.tsx`:

```
"group flex w-full max-w-[95%] flex-col gap-2"
from === "user" ? "is-user ml-auto justify-end" : "is-assistant"
```

User turns are right-aligned (`ml-auto`), assistant turns left, **no avatar on either**, and both
capped at 95% of the column. `MessageContent` is `"flex min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm"`.
`MessageActions` is a plain `"flex items-center gap-1"` row; each `MessageAction` is a ghost
icon-button of size `icon-sm` with a tooltip and an `sr-only` label — i.e. **icon-only actions with
accessible names**, not labelled buttons.

**Branching is a first-class primitive.** `MessageBranch` / `MessageBranchContent` with
`currentBranch`, `totalBranches`, `goToPrevious`, `goToNext`, wrapping round at both ends. Retry does
not overwrite; it adds a branch you page through.

**Thread column and rhythm.** `components/chat/messages.tsx`:

```
"mx-auto flex min-h-full min-w-0 max-w-4xl flex-col gap-5 px-2 py-6 md:gap-7 md:px-4"
```

`max-w-4xl` = **56rem / 896px**. Vertical rhythm between turns: **20px mobile, 28px ≥md**. Column
padding 24px vertical. A scroll-to-bottom pill sits `"absolute bottom-4 left-1/2 ... rounded-full ...
h-7 text-[10px]"` — 28px tall, 10px type, floating, not docked. Note that the *library's* generic
`ConversationContent` uses `"flex flex-col gap-8 p-4"` (**32px**) — so 20/28/32px is the band, and
the app deliberately tightens it. ChatGPT is looser still, at a 72px outer turn-group padding and a
measured **50px** gap from user bubble to assistant text (§2.11).

**The width question, with three real measurements that disagree:**

| Source | Thread column | Composer |
|---|---|---|
| ChatGPT [OBSERVED, measured] | **640px** (40rem) | **768px** |
| claude.ai [REPORTED, via extension selectors] | **768px** (`.mx-auto.max-w-3xl`) | not measured |
| Perplexity [OBSERVED, measured] | **720px** answer text | 640px shell |
| Vercel template [OBSERVED, source] | 896px (`max-w-4xl`) | same column |

The claude.ai figure is recovered from `github.com/johnson00111/wide-chat`'s `content.js`, which
overrides `".mx-auto.max-w-3xl"`, `".mx-auto[class*="max-w-"]"` and `"main .mx-auto"` with a
configurable 600–1600px. Published typographic guidance puts the target at **65–72 characters per
line**, with WCAG 2.2 capping at 80 [REPORTED, setproduct.com].

So the real consensus for *prose* is **640–768px**, not 896. The Vercel template is the outlier
because it carries code blocks. AEGIS carries evidence rows, an 11-row ledger and tables — closer to
the code case than the prose case. §4's recommendation resolves this by splitting the two.

AEGIS's console is currently `max-w-[1400px]` (`console-view.tsx:214`) — right for a dashboard, far
too wide for a reading thread under any of these measurements.

**The composer.** `components/ai-elements/prompt-input.tsx`:

- Textarea class: `"field-sizing-content max-h-48 min-h-16"` → **min 64px, max 192px**, autogrowing
  via CSS `field-sizing: content` rather than JS measurement. Above 192px it scrolls internally.
- Default placeholder: `"What would you like to know?"`
- Keyboard, verbatim from source: `if (e.key === "Enter") { if (isComposing || e.nativeEvent.isComposing) return; if (e.shiftKey) return; e.preventDefault(); … form?.requestSubmit(); }` —
  Enter sends, Shift+Enter newlines, and **IME composition is explicitly respected**. It also checks
  `submitButton?.disabled` before submitting.
- **Backspace on an empty composer removes the last attachment.**
- **Paste-to-attach**: `handlePaste` walks `clipboardData.items` and attaches anything with
  `item.kind === "file"`.
- **Drag-and-drop** binds to the nearest `<form>` by default, with an opt-in `globalDrop` prop that
  binds to `document` instead.
- Send/stop: **one button with four states** — idle `CornerDownLeftIcon`; `status === "submitted"` a
  spinner; `status === "streaming"` a **`SquareIcon`** (the stop square); `status === "error"` an
  `XIcon`. `aria-label={isGenerating ? "Stop" : "Submit"}`, and
  `type={isGenerating && onStop ? "button" : "submit"}` — the same control, relabelled, retyped.
  App-level styling `h-7 w-7 rounded-xl`, disabled when `!input.trim() || uploadQueue.length > 0`.
- **Queueing is explicitly refused**: `if (status === "ready" || status === "error") submitForm();
  else toast.error("Please wait for the model to finish its response!")`.
- **Slash commands** are in-composer: `/` opens a menu, arrows navigate, **Enter or Tab** selects,
  Escape closes (and also cancels message editing).

**Reasoning display.** `elements.ai-sdk.dev/components/reasoning`: `defaultOpen: true`; the component
"automatically opens when reasoning streams and closes when finished"; props `isStreaming`,
`defaultOpen`, `open`, `onOpenChange`, `duration` (seconds). The trigger renders via
`getThinkingMessage()`, following a `"Thought for N seconds"` pattern once complete, with a pulsing
indicator while streaming. It "consolidates multiple reasoning parts into a single collapsible
block, preventing duplicate 'Thinking...' indicators."

**Task display.** `elements.ai-sdk.dev/components/task`: `Task` / `TaskTrigger` / `TaskContent` /
`TaskItem` / `TaskItemFile`. `defaultOpen` defaults to `true`, but the canonical example opens only
the first: `<Task key={taskIndex} defaultOpen={taskIndex === 0}>`. Status enum in the schema:
`z.enum(["pending", "in_progress", "completed"])`, with error handled as an implicit state. "Visual
icons for pending, in-progress, completed, and error states" and a "built-in progress counter showing
completed vs total tasks."

**Citations inline.** `InlineCitation` renders a **hoverable badge pill** showing source hostname and
a `+N` count; interaction is hover-based via a `HoverCard`, **no click required**. Multiple sources
per claim go into a carousel with prev/next and a live index (`1/5`), plus `InlineCitationSource`
(title, URL, description) and an optional `InlineCitationQuote` blockquote. Markdown `[1]`, `[2]`
markers in the text are parsed and mapped to structured citation objects.

`Sources` is a collapsible that "starts in a collapsed state", with `SourcesTrigger` taking a `count`
prop described as "The number of sources to display in the trigger".

**Artifacts and side panels.** `components/chat/artifact.tsx`: the artifact column is
`"flex h-dvh w-[60%] shrink-0 flex-col overflow-hidden border-l border-border/50 bg-sidebar
transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"` — **60% of the viewport, left
border, sidebar surface, 300ms with a strong ease-out**. The thread column animates its width to
zero alongside. There is a dedicated `ArtifactCloseButton`, and on mobile `width: "100dvw"`.

**Thread/history navigation.** `components/ui/sidebar.tsx`: `SIDEBAR_WIDTH = "16rem"` (**256px**),
`SIDEBAR_WIDTH_MOBILE = "18rem"` (288px), `SIDEBAR_WIDTH_ICON = "3rem"` (48px), toggle bound to
`SIDEBAR_KEYBOARD_SHORTCUT = "b"` (⌘/Ctrl+B). `components/chat/sidebar-history.tsx` groups with
`date-fns` `isToday` / `isYesterday` / `subWeeks` / `subMonths` into five labelled buckets, exact
strings: **`Today`, `Yesterday`, `Last 7 days`, `Last 30 days`, `Older`**.

**Empty state.** `components/chat/greeting.tsx`, verbatim and complete:

```
What can I help with?
Ask a question, write code, or explore ideas.
```

Headline `text-2xl md:text-3xl font-semibold tracking-tight`, subtitle `mt-3 text-sm
text-muted-foreground/80`, both fading up 10px with `delay: 0.35` and `0.5`, `duration: 0.5`,
`ease: [0.22, 1, 0.36, 1]`. **Two lines and nothing else — no suggestion chips in the shipped
template**, though a `Suggestion` primitive exists in AI Elements for those who want them.

---

### 2.9 Cursor — review before accept

[OBSERVED — `cursor.com/changelog/3-0`; REPORTED for the rest].

**Thread anatomy / navigation.** Cursor 3 introduces an **Agents Window** (`Cmd+Shift+P → Agents
Window`) to "run many agents in parallel across repos and environments: locally, in worktrees, in
the cloud, and on remote SSH", with **Agent Tabs** that "allow you to view multiple chats at once,
side-by-side or in a grid." The IDE stays open alongside.

**Showing multi-step work / artifacts.** [REPORTED] A dedicated **agent diff review pane**; "clicking
files in review list jumps to diff in review pane"; a commit & push button lives inside that pane.
The agent's output is a reviewable diff, not an applied change.

**What we take.** The many-runs list (our approvals queue and task list are the same object). The
review pane where the *list* and the *detail* are linked by click. The framing that an agent
produces a **proposal**, and acceptance is a separate, deliberate act — which is precisely
`AWAITING_APPROVAL` in `backend/core/schemas.py:62`.

**What we reject.** Parallel agent tabs as a default posture. One governed run at a time, per
operator, per thread — concurrency is a queue feature, not a thread feature.

---

### 2.10 Trace views (LangSmith / Langfuse), via `trace-waterfall`

Covered under §2.1. The transferable core: one shared time axis, depth indentation at a fixed step,
three status colours only, per-row duration, and **it lives behind a disclosure**. An 11-row
waterfall is the right answer to "where did the 38 seconds go"; it is the wrong answer to "what does
the procedure require".

---

### 2.11 ChatGPT — measured live

Measured in a real browser at 1440×900 on 2026-09-21, **logged out**. The logged-out product serves a
lightweight shell (`#web-mobile-root`), so the signed-in app may differ — but the measured column
width independently corroborates the `--thread-content-max-width: 40rem` custom property that
third-party width-fix userscripts target.

**Thread anatomy** [OBSERVED]:

| Thing | Measured |
|---|---|
| Sidebar | **260px** (exposed as a CSS var) |
| Content area right of sidebar | 1180px, `padding: 0 64px` |
| **Thread / message column** | **640px** (= 40rem), centred |
| **Composer shell** | **768px — wider than the message column** |
| User turn | a `<button>`; `background: rgb(232,232,232)`, `border-radius: 22px`, `padding: 10px 16px`, **`max-width: 70%`**, right-aligned within the 640px column |
| Assistant turn | **no bubble, no background, no avatar** — plain text filling the full 640px |
| Assistant type | 16px / **26px line-height** |
| User type | 16px / 24px line-height — *tighter than the assistant* |
| Turn-group spacing | outer wrapper `padding: 72px 0 0`; inner `<li>` `padding: 12px 0 0` |
| Gap, user bubble bottom → assistant text top | **50px** |
| Avatars in thread | **zero** |
| Semantics | `<li>` inside an `<ol>`; screen-reader labels are literally **"You said:"** and **"ChatGPT said:"** |

Two details worth stealing outright. First, **the composer is wider than the thread** (768 vs 640) —
a deliberate asymmetry that is easy to miss when cloning, and which makes the input read as a tool
rather than as another message. Second, **the user's turn is a `<button>` whose `aria-label` is the
message text** — the edit affordance *is* the bubble, with no separate pencil.

**Turn actions** [OBSERVED]: below the assistant message and **outset left** of the text column —
buttons at x=520 against a column starting at x=530. Labels present logged out: `Copy response`,
`Share`, `Retry`, all at full opacity in this shell. Thumbs up/down and "Branch in new chat" were
**not present logged out and could not be verified**.

**The composer** [OBSERVED] — the single most useful set of numbers in this document:

- A `<textarea>`, placeholder **"Ask ChatGPT"**.
- **`min-height: 24px`, `max-height: 192px`, `line-height: 24px`, `font-size: 17px`,
  `overflow-y: auto`** → **starts at exactly one line, grows to exactly eight (192 ÷ 24), then
  scrolls internally.**
- Shell 768px, **`border-radius: 28px`**, white, `1px solid rgba(0,0,0,0.2)`, form `padding: 7px 10px`.
- Left affordance is **one button, `aria-label="Add files and more"` — a menu, not a bare paperclip**.
  Its items span both attachment (`Camera`, `Photos`, `Files`) and mode (`Web search`,
  `Create image`, `Deep research`). Selected modes become **removable chips**
  (`aria-label="Web search, click to remove"`).
- Right: `Start dictation`, then `Send message`.
- **Send disabled state = `opacity: 0.35`.**
- `Scroll to bottom` is centred and `opacity: 0; visibility: hidden` when already at the bottom.

**Empty state** [OBSERVED]: headline **"Where should we begin?"** — *not* "What can I help with?",
which is the Vercel template's string. Two chips only: **"Chat with ChatGPT"** and
**"What can you do?"**.

**History grouping** [REPORTED]: `Today`, `Yesterday`, **`Previous 7 Days`**, **`Previous 30 Days`**,
then **individual month names**. Note the wording differs from the Vercel template's "Last 7 days".
And a behaviour worth deciding on deliberately: **grouping is by last activity, not creation** — a
January thread you reply to today jumps to `Today`, with no setting to change it. For an audit
product that is arguably wrong; a run's record should sort by when the run happened.

**Canvas** [OBSERVED, `openai.com/index/introducing-canvas/` — the launch post was reachable even
though the help article 403s]:

- **"Canvas opens in a separate window"** — not an in-thread split.
- **"Canvas opens automatically when ChatGPT detects a scenario in which it could be helpful. You can
  also include 'use canvas' in your prompt"** — automatic plus an explicit escape hatch.
- Highlight-to-scope: "You can highlight specific sections to indicate exactly what you want ChatGPT
  to focus on. Like a copy editor or code reviewer, it can give inline feedback and suggestions."
- Version history via "the back button in canvas".
- Shortcut labels, writing: `Suggest edits`, `Adjust the length`, `Change reading level`,
  `Add final polish`, `Add emojis`. Coding: `Review code`, `Add logs`, `Add comments`, `Fix bugs`,
  `Port to a language`.
- **OpenAI published the trigger-accuracy numbers, and the direction they biased them:** correct
  triggering reached **83% for writing and 94% for coding**; they "prioritized improving 'correct
  triggers' (at the expense of 'correct non-triggers')" for writing, and "for coding, we
  **intentionally biased the model against triggering** to avoid disrupting our power users."
- And the editing rule, verbatim: "We trained the model to perform **targeted edits when users
  explicitly select text** through the interface, **otherwise favoring rewrites**."

The published trigger rates are the template for how we should decide when a deliverable leaves the
thread: pick a bias direction, state it, and measure it. For AEGIS the bias is obvious — a `.docx`
deliverable *always* opens the panel; an answer-only turn *never* does.

---

### 2.12 Consensus — the best evidence-strength design in production

Observed live, signed out, on a Pro answer at `consensus.app/search/does-creatine-improve-memory/…`.
This is the richest *evidence-qualification* design anywhere in the study, and the one whose ideas
transfer most directly to a verification verdict.

**Citations inline** [OBSERVED]. Not numbers, not domains — **stacked AUTHOR + YEAR tokens**,
uppercase surname over the year, appended to the sentence. Verbatim from the rendered answer:

> "Creatine supplementation significantly improves memory function with a pooled SMD of 0.31
> (95% CI: 0.18–0.44) across 24 studies and 1,000 participants **XU 2024**."

**Multiple sources** [OBSERVED]: adjacent repeated tokens, **no `+N`, no collapse** — up to three
side by side (`PROKOPIDIS 2022  SAL-SARRIA 2026  MAO 2021`). Note the observed
`PROKOPIDIS 2022 PROKOPIDIS 2022`: two distinct citations into the same paper render as two
identical-looking tokens. **That is a legibility bug to avoid** — two of our citations into different
pages of the same SOP must not render identically.

A 2026 addition [REPORTED, UVA library guide]: "**a checkmark icon on in-line citations to show when
full text was used**" — `✓ = full text was analyzed`, versus abstract only. A one-glyph statement of
*how deep the evidence goes*. Our equivalent: a glyph distinguishing a citation to an extracted
vision region from a citation to a retrieved text chunk.

**The Consensus Meter** [OBSERVED]. Rendered with both percentages and raw counts:

> "Does creatine supplementation improve memory?
> **Yes 38%, Possibly 44%, Mixed 6%, No 13%** · **N = 16** · 6  7  1  2"

Four categories (**Yes / Possibly / Mixed / No**), percentages *and* underlying counts against N, an
**"All details"** expander, and it is labelled **"FIGURE 1"** — the meter is presented as a numbered
figure inside the report, not as chrome.

**Unsupported / low-confidence — the pattern to steal** [OBSERVED]. Consensus renders an explicit
**"Evidence Strength" two-column table**, one row per claim:

| Evidence Strength | Claim |
|---|---|
| **Strong** | "…pooled SMD of 0.31 (95% CI: 0.18–0.44) across 24 studies… XU 2024." |
| **Moderate** | "In healthy individuals, creatine enhances memory with an SMD of 0.29… PROKOPIDIS 2022." |
| **Moderate** | "The European Food Safety Authority concluded that a cause-and-effect relationship has **not** been established… TURCK 2024 CZERNY 2026." |

Labelled **"FIGURE 2 Evidence strength for creatine's effect on memory across key studies."** Note
that a *contradicting* finding gets a row of its own rather than being dropped. **Disconfirming
evidence is first-class content.** AEGIS has exactly this need: a clause that argues *against* the
recommended severity must appear in the report, not be filtered out by a relevance score.

**The run header is fully legible too** [OBSERVED]: **"Pro · 4 steps"**, then each search query with
its corpus hit count (`creatine improve memory — 4.9M`), then **"Read / Abstracts and PDFs / 20."**
A step list that states *what was searched and how much was read* — the direct analogue of our
stage-05 row.

**Documented guardrails, and the most honest number in this document** [REPORTED, Consensus's own
blog]:

- "The meter will run over the **first 20 results** and will only classify answers that our model
  believes are relevant enough to your question."
- "all the results that power the Consensus Meter can be seen directly below its interface with
  corresponding tags indicating how they were classified."
- Extraction, not generation: "the results that power the Consensus Meter are **all extracted
  word-for-word quotes** from papers."
- **"our model will incorrectly classify results 10% of the time."** — a vendor publishing its own
  error rate *to end users, in product documentation*.
- Stated limitation: "each claim counts the same on the roll-up interface regardless if it comes from
  a meta-analysis or an n=1 case report."
- **Suppression rule**: the meter "may not appear if there are **less than 5 relevant papers**
  returned for your search that can be classified." A documented minimum-evidence threshold below
  which the confidence widget is **withheld entirely** rather than shown at low confidence.

Those last two are the most important findings in this section. **Withholding a verdict below an
evidence threshold, and publishing your own error rate, are both things AEGIS should do and nobody
else does.**

**Depth tiers** [REPORTED]: Quick (10 papers) / Pro (20) / Deep (50, "comprehensive report with
diagrams"). Deep Search runs "up to 20 targeted searches", reviews "the top 1000 results", screens to
"the top 50". Paper cards carry badges — **"highly cited" (top 5%)**, **"rigorous journal"** — plus
method tags, and a "Study Snapshot" card with Population, Sample Size, Duration, Location, Methods,
Outcomes, Results. A **References** control opens "a full table breakdown of all sources cited in the
answer."

**What we take.** The Evidence Strength table as the shape of our verification report. Disconfirming
evidence as a first-class row. The suppression threshold. Publishing our own error rate. Counts
alongside percentages, always. Figure numbering for the governance widgets, so a deliverable can
reference them.

---

### 2.13 Glean — the citation data model worth copying wholesale

All [REPORTED]; `docs.glean.com` and `developers.glean.com` are public and were fetched.

**Citations inline.** Citations "appear within the response, immediately following statements that
need backing", at **sentence level** — "so you can click through to the exact passage in the source
document rather than scanning an entire file"; a secondary source adds that Glean "attaches citation
chips to specific **sentence fragments** inside a paragraph, not to the paragraph as a whole."

**Hover and click.** "Hover over a citation to preview context." "Opening a source shows a preview
so you can **confirm you are looking at the right place before you click through**." A deliberate
confirm-before-you-leave step, which matters when leaving means opening a 400-page P&ID.

Deep-linked citations (Beta): "You will see the **cited text highlighted in blue**, with the rest of
the paragraph visible for full context." "In addition to the source information, the citation popover
**displays the page number**." For some file types "the link may jump to a specific section, for
example, a slide within a presentation."

**Two honest limitations Glean publishes**, both of which we will hit:

> "The ability to click on a citation and navigate directly to the cited page **is not yet
> supported** in this release."

> deep-linked citations from non-plaintext sources "are displayed as **simple plaintext**. This
> presentation may make the cited information **difficult to read or parse**."

That second one is our scanned-PDF and P&ID problem exactly: a table or a drawing callout reduced to
plaintext in a hover card is worse than useless. Our evidence preview must render the *region image*
for vision-extracted citations, not the OCR text.

**The citation data model** [REPORTED, `developers.glean.com/guides/chat/deep-linked-citations`] —
the most directly reusable artefact in this section:

```json
{
  "sourceDocument": { "id": "DOC_ID", "datasource": "gdrive", "title": "…", "url": "https://…" },
  "referenceRanges": [
    { "textRange": { "startIndex": 50, "endIndex": 120, "type": "LINK" },
      "snippets": [ { "text": "quoted text from source", "pageNumber": 1 } ] }
  ]
}
```

Their rendering guidance: always render the document-level citation pill from `sourceDocument`; if
`referenceRanges[].snippets[]` exists, populate hover cards with direct quotes; fetch the full
document and show **~200 characters before and after each snippet** as surrounding context; display
page numbers when present. **That ~200-character context window is the only documented hover-card
sizing rule found anywhere in this study.**

**Grounding and the uncited case.** "Glean Assistant generates citations only from passages it has
actually retrieved and verified, so every reference links to a real, accessible source." The absence
of citations is tied to a **visible composer toggle** rather than a per-claim badge: "When both
*Search the web* and *Use company sources* are unselected in the composer, Assistant doesn't search
company sources or the web … responses generated this way **usually won't include citations**."
Permissions are enforced upstream of the model, replicating each source app's ACLs at query time, so
a user never sees a citation to a document they cannot open — which is precisely our RBAC and
classification model (`max_data_classification` in `frontend/lib/types.ts`).

**No per-claim unsupported badge is documented.**

**What we take.** The `referenceRanges` / `snippets` / `pageNumber` shape as the wire format for
`EvidenceItem`. The ~200-character context window. Preview-before-navigate. Permission filtering
before retrieval, not after generation. And the discipline of publishing the limitation rather than
hiding it.

---

### 2.14 Elicit — the grid, and a flag nobody has photographed

All [REPORTED]; the app requires an account.

**The core surface is a grid, not prose.** From Elicit's own design post: "an in-browser data grid
(instead of an Excel sheet), with **papers in the rows, and data extractions from those papers in the
columns**", built so the result set can "grow, shrink, or change on both the X and Y axis as the user
adds filters, new columns, and new papers."

**Citations.** Per-cell, click-to-reveal. Help centre, verbatim: "**Click on any cell** in the
finished data extraction table **to view supporting quotes from the paper** and check the
AI-generated answers for accuracy." The marker is described by a third-party guide as "a small
'speech bubble' or icon" on the cell value. In Reports mode: "Elicit **cites every claim with exact
quotes** from the original source", and Elicit's own competitive evaluation notes that most rivals
"do not cite specific passages in text and instead reference entire papers."

**Low-confidence flagging — confirmed to exist, visual treatment undocumented.** Elicit's design post
says the interface "**subtly flags low-confidence answers**" so users can "quickly scan the table and
decide whether they want to rephrase the data extraction question." **No source — including Elicit's
own docs — describes what that flag looks like.** Named as a gap rather than guessed.

**The exclusion pattern, which is concrete and excellent.** In systematic-review screening,
"**Excluded papers appear at the bottom of results, each with the criterion it failed and the
reason**", and "Click any paper to see its per-criterion decisions, exclusion reasons, and **source
quotes from the abstract supporting each decision**." Users can override, then press **"Save & next."**

That is a fully-formed design for *showing what was rejected and why*, with evidence for the
rejection. AEGIS needs the identical thing for evidence chunks that scored below threshold, and for
stages that were skipped — see §4.

**Cost display**: coins on the action — "One, two, or three coins maps to small, medium, and heavy
requests respectively." A three-step ordinal instead of a number.

**Published accuracy, shown to users**: abstract screening 97% sensitivity / 93% specificity;
full-text screening 99.5% / 70%; data extraction 96% on Methods, Participants, Interventions. Their
own report evaluation graded citation support as **Fully supported (1) / Partially supported (0.5) /
Unsupported (0)** — a three-level vocabulary, though applied by human evaluators rather than shipped
as a badge. It is very close to our `VERIFIED / SUPPORTED / UNSUPPORTED`.

---

### 2.15 Hebbia and Scite — two ideas worth one paragraph each

**Hebbia Matrix** [REPORTED]. Rows = documents, columns = questions, cells = agent outputs. The rule:
"**Every output cell requires a 1:1 citation linking to the exact sentence in the source document**",
and "every output cell includes a clickable reference to the exact **page, paragraph, and sentence**."
The transferable idea is what the drill-down contains: "click on a cell in the table to see exactly
where in the document an answer was sourced from, **along with a step-by-step breakdown of how the
answer was derived**" [Contrary Research]. **Provenance and chain-of-work share one surface** — click
a number, get both the passage and the arithmetic. That is exactly what an AEGIS corrosion-rate cell
should do. Hebbia's own marketing calls it a "Verifiable Fact Layer", and its rendered product page
shows a `Metric | Value | Basis` sub-table where the **Basis** column states the derivation period
next to the number — a lightweight provenance affordance for computed values. **No unsupported-content
flagging is documented anywhere reachable**; Hebbia's position is prevention (mandatory 1:1 citation)
rather than flagging.

**Scite** [REPORTED]. The only product in the study with a *directional* evidence taxonomy rather
than a strength scale: every citation statement is classified **supporting / contrasting /
mentioning**, colour-coded **green / red / grey**, from a model trained on 1.6B+ citation statements.
Two things to take: (1) *contrasting* as a first-class category — our evidence set will contain
clauses that contradict each other and the UI must be able to say so; (2) the badge's documented
empty-state rule — `data-show-zero` defaults to **false**, so **the badge hides itself when there are
zero citations**. That is the opposite of assistant-ui's `sources` rule (show the 0). For AEGIS,
assistant-ui is right and Scite is wrong: a zero must be visible.

---

### 2.16 Claude Code (terminal) — the most precisely documented status vocabulary found

[OBSERVED, `code.claude.com/docs/en/*`]. Worth a section despite being a terminal product, because it
is the only surveyed product that documents its full state glyph set.

**Agent view row glyphs:**

| Glyph | Meaning |
|---|---|
| `✽` animated | Working |
| `✻` yellow | Needs input |
| `∙` dimmed | Idle |
| `✻` green | Completed successfully |
| `✻` **red** | **Failed** (ended with error) |
| `✻` grey | **Stopped** (user- or process-stopped) |
| `✢` | sleeping loop, with run count + countdown |

Row anatomy: glyph + name + **a one-line summary that "updates every 15 seconds during work"** +
elapsed time, e.g. `✽ collision detection   Adding swept-AABB checks to CollisionSystem   2m`.
A 15-second refresh on a human-readable summary is a good, honest cadence — fast enough to prove
liveness, slow enough not to flicker.

**Failure encoded by persistence, not just colour**: "When a subagent **fails or you stop it**,
Claude Code keeps its row for **30 seconds**. To clear the row sooner, select it and press `x`" —
versus on success, "Claude Code **removes its row immediately**." A failed thing lingers; a successful
thing gets out of the way.

**Collapse defaults**: an empty task list "starts **collapsed**"; if left expanded it restores
expanded on resume. Thinking is "collapsed by default" and revealed as **grey italic text**. MCP tool
calls collapse to a documented one-line format: **`Called slack [server] 3 times`**.

**Honest run footer strings**: `esc to interrupt` during a run;
`Usage limit reached · continuing automatically at 3:45pm · esc to cancel` while rate-limited — a
live line that names the cause, the resumption time and the exit.

**Hard layout thresholds** — the only real numbers of this kind found anywhere in the survey: the
diff panel needs **≥110 columns** to open, **≥144 columns** to auto-open; the todo list shows **up to
5 tasks**; failed subagent rows linger **30s**; a session recap is capped at **400 characters**.

**What we take.** Six named states with distinct glyphs *and* distinct colours *and* distinct
persistence behaviour. A one-line summary refreshed on a fixed slow cadence. A footer string that
names the interrupt key. And the principle that failure persists longer on screen than success.

---

### 2.17 The long-run cohort — Lovable, Jules, Codex, Replit, Copilot Workspace

Grouped because they answer one question together: **what happens when the run outgrows the thread.**

**Lovable — the best "click a step to go deeper" flow in the survey** [OBSERVED,
`docs.lovable.dev/features/agent-mode`]. Work appears inline as **activity cards** (one per file
edit, command, web search, browser test, delegated subagent). "You can **click an activity card while
Lovable works, or click Details on a finished change**, to open the **Details view, which opens where
the preview usually appears**." The detail pane **replaces the preview** — not a modal, not inline
expansion. Two tabs, **Timeline** (every step including tool calls) and **Changes** (diffs), plus a
**"Hide details"** button. Per-message labels **"Working for"** (live elapsed) and **"Credits used"**
(live running total), switching to **"Worked for"** on completion.

Lovable's failure design is the most explicit of any product here: the Publish dialog shows a
**"Publishing failed"** heading; transient errors get a **"Try again"** button; real build/config/DB
errors get a **"Try to fix"** button showing "a short summary of the build error"; DB-schema conflicts
get an additional **"Ask the assistant to help"** button "since those touch live data." Three
different failure classes, three different affordances, one of which is deliberately *not*
automatic because the blast radius is real. That distinction — *this failure I will retry for you,
this one you must look at* — is exactly the distinction AEGIS needs between a sandbox timeout and a
policy denial.

And the counter-example, from a troubleshooting write-up [REPORTED, axonbuild.com]: Lovable's live
label is the bare word **"Thinking"**, and "a step that landed two minutes ago and a step that landed
thirty seconds ago are two very different situations, and **the word Thinking looks identical in
both**."

**Google Jules** [OBSERVED, `jules.google/docs/*`]. Plan is natural-language intent + step breakdown
+ assumptions; "**Open each step by expanding them**"; the button is literally **"Approve plan."**
Critically: "**If you don't respond, Jules will eventually auto-approve its plan**" — on an
undocumented timer. **Never do that.** An approval that times out into consent is the single most
dangerous pattern in this entire study, and AEGIS's stage 09 must do the opposite: hold forever, and
say so.

Jules's failure design is good, though: the failing step is logged in the activity feed **and** a
**red dot** notification badge appears "whether the task has **failed completely or simply requires
your intervention**" — one signal for "needs you", covering both. Transient failures are auto-retried
before the task is marked failed. Its completion summary uses documented emoji glyphs — **"✅ Files
changed," "⏱ Total runtime," "➕ Lines added/changed," "🌿 Branch name and commit message."**

**OpenAI Codex — a documented anti-pattern with receipts** [OBSERVED, github.com/openai/codex issues].
Issue **#46174** records three surfaces disagreeing about one task at one moment: the task list showed
**"Failed"** in red, the detail page showed **"Working on your task"** with a **"Cancel task"**
button, and the CLI reported **`[PENDING]`** with `Error: No diff available for task <id>; it may
still be running.` Issue **#45934** reports a spinner still spinning after a PC restart. **A run's
status must have exactly one source of truth across every surface, and a spinner must have a
timeout.** For AEGIS — where the task list, the thread and the audit log all show the same run —
this is a correctness requirement, not a polish item.

Codex's **progress row above the composer** is nonetheless the best long-run-in-chat pattern found
[OBSERVED, learn.chatgpt.com/docs/long-running-work]: paused/running state, truncated goal, **elapsed
time `10h 9m`**, a solution count, priority, and pause/resume/edit-goal/clear-goal buttons. States
include **"Paused goal"** and **"Goal."** Note what it does not include: a percentage.

**Replit — the strongest evidence that the thread stops scaling.** Agent 3 runs autonomously "up to
**200 minutes**"; **Agent 4 abandoned the linear thread entirely** for a shared **Kanban board** with
columns **"Drafts," "Active," "Ready," "Done"** plus an infinite design canvas [OBSERVED,
`replit.com/blog/whats-changed-agent3-to-agent4`]. VS Code did the same thing by adding a separate
**Agents window**; GitHub did it by adding an **Agents panel** and `/copilot/agents`. Three
independent products concluding that past roughly ten minutes, the thread metaphor breaks. AEGIS's
runs are 30–120 seconds, so the thread holds — but the approvals queue is our Kanban, and it should
be built as one.

**GitHub Copilot Workspace (retired 30 May 2025)** — the strongest precedent for an editable plan as
the primary UI, worth citing *because* it was retired [OBSERVED, the archived user manual]. Named
sequential stages **Brainstorm → Spec → Plan → Code**, where Spec and Plan were **directly editable
text, not read-only logs**: Spec was "two bullet-point lists: one for the **current state** of the
codebase, one for the **desired state**"; Plan listed "**every file it intends to create, modify, or
delete**". Buttons: **Regenerate**, **Update selected files**, **Add file**, **View references**, plus
**Undo/Redo** across spec/plan/implementation states. Even the generated diff was editable before PR.

**GitHub Copilot's current subagent pattern** is the best-documented of its kind [OBSERVED,
github.blog changelog 19 Mar 2026]: "**subagent activity appears collapsed by default with a status
display**", expandable "at any time to see the full output"; collapsed entries show "a real-time
summary of what the subagent is doing (**its current focus, task status, elapsed time**)." Each
agent-authored commit carries an **`Agent-Logs-Url`** trailer linking back to the full session log
[REPORTED] — a durable per-artefact link to the step record. Our deliverable's `sha256` should carry
the same thing: a permalink from the `.docx` back to the run that produced it.

**VS Code** contributes two exact strings and one rule [OBSERVED, code.visualstudio.com/docs]:
multi-step tool sequences collapse under the literal heading **"Completed N steps"**; "**By default,
tool call details are collapsed in the chat conversation**", with `chat.agent.thinking.collapsedTools`
taking `off` / `withThinking` / `always`; and — the only documented responsive behaviour in the entire
survey — the Agents window sessions sidebar "**auto-hides when the window is narrow**" and restores
"when there is room", with **no breakpoint number published**.

---

### 2.18 Langfuse and LangSmith — and a very recent reversal worth heeding

**LangSmith** [OBSERVED, `docs.langchain.com/langsmith/view-traces`]. The trace UI is a **side panel**
that "keeps the surrounding conversation visible so you can understand where a run fits in the
agent's broader execution" — the escalating-detail ladder made literal, with three keyboard-switchable
views: **Messages (`M`)**, **Turns (`T`)** — "each turn in the thread as a **card** showing its inputs
and outputs, with expand/collapse" — and **Details (`D`)**, "the debugging layer": "the full run tree
on the left; click any node to open its detail panel on the right."

Errors "are **propagated up the call hierarchy** so you can easily see where in the execution the
chain failed." A distinct **"Incomplete"** status exists: "the 'end' event for a trace was never
successfully received" — runs sit in **Pending** and later resolve to Incomplete. That is a real state
we will need: our SSE bus drops events for a slow subscriber, so a run whose terminal event never
arrived is *incomplete*, not *failed*, and the difference matters to an auditor. **No "skipped" status
exists.** Thought blocks "appear inline when models use extended thinking, **collapsed by default**."

**Langfuse** [OBSERVED, `langfuse.com/changelog/*`]. Ten observation types, each with its own icon and
colour: `event · span · generation · agent · tool · chain · retriever · evaluator · embedding ·
guardrail`. Nesting guidance is explicit: "A tool call should nest under the agent or span observation
that orchestrates the step, **as a sibling of the generation that requested it**." Severity is a
`level` attribute — **DEBUG / DEFAULT / WARNING / ERROR** — and you can "filter your trace view using
observation log-levels… focus on the most critical observations" by toggling visibility. A **Log view**
gives "a new concatenated view [that] displays all trace data sequentially… particularly useful for
**verbose, looping agents**."

**The reversal.** Langfuse shipped a documented colour rule in Oct 2024: a span's latency or cost as a
ratio of the whole trace — **≥75% red, 50–75% amber, <50% no colour** — behind a **`%` button**. In
**17–18 Sep 2026**, days before this research, PRs #17619 and #17590 **removed it**: "tree metrics
emphasised in bold at half the trace, **colour-code toggle removed**"; rows now show "**only its own
cost**; no summed cost, no subtree duration badge"; the toggle was relabelled from "Show Cost/Tokens"
to **"Show Cost"**; and the bordered type chip was replaced with a **bare icon**.

The direction of travel is unambiguous: **fewer numbers per row, no aggregated subtree maths, no
colour-coding toggle.** A mature observability product, having tried per-row colour thresholds and
summed subtree metrics, took them out. Our 11-row ledger should start where Langfuse ended up — one
number per row, bold on the outlier, colour reserved for status — not where it began.

**Agent Graph** offers one more idea: two modes, **Aggregated** (repeated calls collapse into one node
with a counter, e.g. `retrieve_docs (3/3)`; loops appear as cycles) and **Expanded** (one node per
call, loops unrolled). Langfuse's own framing — "**Neither is 'correct' — they answer different
questions**" — is the right posture for our compact-versus-timeline toggle.

---

### 2.19 CI/CD pipeline vocabularies — where "skipped" and "denied" have already been solved

None of the sixteen AI products surveyed has a **skipped-step state**. Every one is binary
(success / error) plus pending or waiting. That is a genuine differentiation opportunity — and the
prior art we need is not in AI products at all. It is in CI.

**GitHub Checks** [OBSERVED, `docs.github.com/en/rest/checks/runs`] — a check run's `conclusion` is
exactly one of **eight**:

`success` · `failure` · `neutral` · `cancelled` · **`skipped`** · `timed_out` · **`action_required`** · `stale`

Four of those are "didn't succeed, isn't a failure": `neutral`, `cancelled`, `skipped`, `stale`. And
`action_required` is precisely our stage-09 held-for-approval state — a first-class conclusion, not
an error.

A cautionary note from the same docs [OBSERVED,
`docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs`]: a workflow skipped via
`[skip ci]` leaves its checks "in a **'Pending' state**", and a PR requiring them is "**blocked from
merging**". **A skip that is indistinguishable from never-started creates a stuck state.** Model
`skipped` as a distinct terminal conclusion, never as absence — which is exactly what
`console-view.tsx` already does when it marks unreached stages `skipped` rather than `done`.

**GitLab** [OBSERVED, `docs.gitlab.com/api/pipelines/`] enumerates thirteen:

`created` · `waiting_for_resource` · `preparing` · `waiting_for_callback` · `pending` · `running` ·
`success` · `failed` · `canceling` · `canceled` · `skipped` · `manual` · `scheduled`

**Four distinct pre-run states.** GitLab treats "why isn't this running yet" as information worth a
name — which maps straight onto our `task.queued` with `queue_position`, and onto a stage waiting on
a model to load. GitLab also has a third colour for *tolerated* failure: `allow_failure` leaves the
pipeline "successful and the associated commit… marked as passed", while "an **orange warning
(`status_warning`)** indicates that a job failed" [OBSERVED, `docs.gitlab.com/ci/yaml/`]. And a
**blocked** pipeline "does not run any jobs in later stages until the manual job is started and
completes successfully."

**Buildkite** [OBSERVED, `buildkite.com/docs/pipelines/configure/defining-steps`] gives the single
best sentence in this whole section:

> "**Broadly, jobs break because of something inside the build, and are skipped by something outside
> the build.**"

Its terminal states are `passed` · `failed` · `canceled` · **`skipped`** · **`broken`**, plus
non-terminal **`blocked`** ("waiting on a block step to finish"), `waiting`, `running`, `scheduled`.
`skipped` = a condition returned false or a newer build superseded it. `broken` = "the job's
configuration means that it **can't be run**".

That distinction is exactly the one AEGIS needs and nobody in AI has drawn:

| Buildkite | AEGIS stage meaning | Example |
|---|---|---|
| `skipped` | the plan said this stage was not needed | no attachment, so **06 Vision extraction** never applied |
| `broken` / `blocked` | the stage could not run because an earlier decision forbade it | **03 Policy gate** denied, so **04–10** were never reachable |
| `action_required` (GitHub) | held for a human | **09 Approval** |
| `stale` (GitHub) / `waiting_for_callback` (GitLab) | the terminal event never arrived | our SSE bus dropped events for a slow subscriber |

Four different absences, four different meanings, and today `StageStatus` collapses three of them
into `skipped`. §4 proposes fixing that.

**Rendering: not documented anywhere.** GitHub, GitLab, Buildkite and Primer all define *semantics*
and none of them documents the hex/icon mapping in prose. The conventional mapping (green check /
red X / yellow dot / grey skip glyph / grey circle-slash) is widely observed but **has no citable
source**, and Argo Workflows' docs were unreachable. Do not copy colours from memory — copy the
*vocabulary*, and apply `12-RESEARCH-EVIDENCE-UI.md §4`'s position → shape → weight → hue order to
the rendering.

---

### 2.20 The research literature — what visible process actually does to trust

This section exists because the intuition "showing our work builds trust" is half true, and the
false half is dangerous for a product whose turns are sometimes denials.

**Visible reasoning persuades more than it informs.** Palod, Biswas & Kambhampati (2026),
*Evaluating the False Trust Engendered by LLM Explanations*, arXiv:2605.10930 [OBSERVED, abstract]:

> "We find that **reasoning traces and post-hoc explanations are persuasive but not informative: they
> increase user acceptance of LLM predictions regardless of their correctness.** In contrast,
> **dual explanation** is the only condition that genuinely improves users' ability to distinguish
> correct from incorrect AI outputs."

Their "dual explanation" condition presents **arguments for and against** the AI's answer. That is a
direct instruction for AEGIS: a verification panel that only lists passing checks is a persuasion
device. One that lists **the checks that failed, the evidence that contradicts, and the limitations**
(`VerificationReport.limitations[]` already exists in `frontend/lib/types.ts` and is not rendered)
is a calibration device.

**Explanations help only when they lower the cost of checking.** Vasconcelos et al. (2023),
*Explanations Can Reduce Overreliance on AI Systems During Decision-Making*, arXiv:2212.06823 (CSCW),
five studies, **731 participants** [OBSERVED]: people "strategically weigh costs and benefits", and
explanations reduce overreliance **specifically when they lower verification cost**. Narration of
reasoning lowers no verification cost. A clickable citation that opens page 7 of SOP-114 with the
cited region highlighted lowers it enormously.

**Chains of thought are not reliably faithful.** Turpin et al. (2023), arXiv:2305.04388 [OBSERVED]:
"CoT explanations can **systematically misrepresent the true reason** for a model's prediction",
with accuracy drops up to **36%** under biasing features. Anthropic's own 2025 study,
*Reasoning models don't always say what they think* [OBSERVED]: averaged over hint types, Claude 3.7
Sonnet mentioned the hint **25%** of the time and DeepSeek R1 **39%**; under reward-hacking training
models admitted the hack in CoT **"less than 2% of the time."** A thinking block is therefore not
evidence, and must never be positioned near our citation chips where it might be mistaken for some.

**Structure and intervenability beat narration.** Pang et al., *Interactive Reasoning*, IUI 2026
(DOI 10.1145/3742413.3789091) [OBSERVED]: rendering CoT as an **interactive tree** rather than linear
text produced greater sense of control, better comprehension, "heightened awareness of the model's
underlying assumptions", and "**reducing passive acceptance** of AI outputs."

**Response-time limits, with the exact numbers.** Nielsen, *Response Time Limits*, NN/g, published
**1 January 1993** [OBSERVED]: **0.1s** = feels instantaneous, no feedback needed; **1.0s** = flow of
thought uninterrupted, delay noticed; **10s** = "the limit for keeping the user's attention focused
on the dialogue", beyond which "feedback indicating completion time is essential." NN/g's
*Progress Indicators* [OBSERVED]: spinners for **2–10s**, percent-done for **10s or more**, and
participants shown a progress bar "**were willing to wait on average 3 times longer**".

Nielsen's own prescription for work of *unknown* duration is the one that matters here: report
**work completed** — "naming each database processed" — rather than a percentage. That 1993 sentence
is, line for line, the Deep Research sidebar and Anthropic's `display: "updates"`.

**Progress-bar psychophysics.** Harrison, Amento, Kuznetsov & Bell, *Rethinking the Progress Bar*,
UIST '07, pp. 115–118 [OBSERVED, full text]: 22 participants, 9 progress functions, all bars fixed at
**5.5 seconds**, 990 paired comparisons. Functions perceived **slower** than linear were "the only
functions with pauses near the process conclusion"; functions perceived **faster** were exponential,
accelerating toward the end. Their recommendation, verbatim:

> "**users are most willing to tolerate negative progress behavior (e.g., stalls and inconsistent
> progress) at the beginning of an operation. Hence, process stages can be arranged such that the
> slower or variable operations are completed first.**"

The authors' own caveat, which must be carried: all bars were 5.5s, and "it would be interesting to
investigate if our findings scale to other durations." **Do not assume this transfers to 120s.**
Harrison, Yeo & Hudson, *Faster Progress Bars*, CHI '10, pp. 1545–1548 [OBSERVED] measured backwards
decelerating ribbing reducing perceived duration by **11%** (5s solid ≈ 5.61s ribbed; 15s ≈ 16.75s).
Interesting, and **exactly the kind of perceptual trick §6 forbids us**.

**Skeleton screens: the evidence is mixed and the famous counter-study is real.** Faulkner & Olvera
(Viget), *A Bone to Pick with Skeleton Screens*, 19 Oct 2017 [OBSERVED]. N = 136 (skeleton 39,
spinner 39, blank 58), identical durations:

| Condition | Agreed "loads quickly" | Disagreed | Avg perceived wait | Task completion |
|---|---|---|---|---|
| Skeleton screen | 59% | 36% | **2.82s** | 10.54s |
| Loading spinner | **74%** | **10%** | 2.41s | 9.49s |
| Blank screen | 66% | 26% | **2.29s** | 9.50s |

The skeleton lost on every measure. Caveats the authors would want stated: small unbalanced cells,
GIF simulation, self-selected sample, no significance testing. NN/g's own *Skeleton Screens* guidance
caps them at "**a wait time that's under 10 seconds**" and excludes "downloads, uploads, or file
conversions — use progress bars instead". **For a 30–120s run whose output shape is unknown, both
sources point away from skeletons.**

**The labor illusion — and the experiment that inverts it.** Buell & Norton, *The Labor Illusion:
How Operational Transparency Increases Perceived Value*, *Management Science* **57(9), Sept 2011,
1564–1579** [OBSERVED, full text]. The headline finding is the one everyone quotes: replacing a
progress bar with "**a running tally of the tasks being performed**" made people *prefer* a longer
wait to instant results for identical output, mediated by perceived effort and reciprocity.
Experiment 4 (N=116, all waited 30s) found a main effect of transparency on perceived value
(transparent M=4.89 SD=0.98 vs blind M=4.46 SD=1.22, F(1,112)=4.69, p<.05) with **no main effect of
actual labour** — perceived effort beat real effort.

**Experiment 5 is the part nobody quotes, and it is the most important number in this document.**
N=280, 2 (15s / 30s) × 2 (transparent / blind) × 3 (favourable / average / unfavourable outcome),
plus instantaneous controls. Predicted **transparency × outcome interaction, F(2,152)=4.42, p<.05** —
participants valued transparent service more for favourable and average outcomes, "**but actually
valuing it less for unfavourable outcomes.**"

| Cell | Mean value rating |
|---|---|
| Favourable, 15s, transparent | **4.06** (SD 1.28) — highest in the paper |
| Favourable, 15s, instantaneous | 3.34 (SD 1.32) |
| Unfavourable, 15s, transparent | **2.47** (SD 0.76) — worse than instantaneous, t(62)=2.40, p<.05 |
| Unfavourable, 15s, instantaneous | 3.24 (SD 1.20) |
| Unfavourable, 30s, transparent | **2.10** (SD 1.12) — worst in the paper, t(58)=2.97, p<.01 |

Authors, verbatim: "**while a 15-second wait with transparency for favorable outcomes led to the very
highest ratings of value, waiting with transparency for unfavorable outcomes led to the very worst
value perceptions**… When a service demonstrates that it is trying hard and yet still fails to come
up with anything but poor results… **people blame the service.**"

**A denied run, a blocked run, and an UNSUPPORTED verdict are all unfavourable outcomes.** Showing
elaborate work and then producing one of them is measurably worse than producing it quickly and
plainly. This changes the §5 recommendation materially, and §5.6 states the rule that follows.

**On fake progress specifically: there is no peer-reviewed study isolating the trust damage.** What
exists is Experiment 5 above, Harrison 2007's finding that late stalls read as slowest, and
practitioner argument. The sharpest version of the latter, from a Hacker News thread [REPORTED]:
"A fake progress bar that shows steady progress when the actual work is stuttering is not benevolent,
unless you can be sure the operation will finish in a fixed amount of time approximately at the end
of the progress bar." We cannot be sure of that, so we do not get the bar.

**Gap, stated plainly:** arXiv has **no** results for "labor illusion", and no study was found
directly measuring whether a visible thinking panel increases *latency tolerance* in AI chat. The
link from operational transparency to wait tolerance in our setting is an **argument by analogy from
1993 and 2011 service-operations work**, not a measured result. The document should not imply
otherwise, and §5 does not.


---

## 3. Patterns worth stealing — 75 one-line instructions

Each is implementable as written, and attributed.

**Thread anatomy**

1. Use **two widths**: prose and citations at **720px** (inside the 65–72 characters-per-line band),
   and let the stage ledger, evidence rows and tables span the full **896px** column. *(ChatGPT
   measures 640px prose, Perplexity 720px, claude.ai 768px; the Vercel template's 896px is an outlier
   driven by code blocks. Typographic target from setproduct.com; WCAG 2.2 caps at 80 chars.)*
2. Make the **composer wider than the thread** — 768px against a 720px column. *(ChatGPT: 768 vs
   640. It reads as a tool rather than as another message.)*
3. Right-align the user turn with `ml-auto`, left-align the assistant turn full-bleed in the column,
   and give **neither an avatar**. *(Vercel `message.tsx`.)*
4. Set turn rhythm to `gap-5` / `md:gap-7` (20/28px) — not margin on the message, gap on the column.
   *(Vercel `messages.tsx`.)*
5. Make turn actions icon-only ghost buttons with `sr-only` labels and tooltips, in a
   `flex items-center gap-1` row under the turn. *(Vercel `MessageAction`.)*
6. Implement retry as a **branch**, not an overwrite: keep `currentBranch / totalBranches` with
   prev/next. A regenerated answer must never delete the one an auditor may have already read.
   *(Vercel `MessageBranch`.)*
7. Add a read-only side channel — a `/btw`-style question that renders beside the thread and is
   never written into the signed record. *(Devin Side Chat.)*
8. Float the scroll-to-bottom control as a 28px pill at `bottom-4 left-1/2`, 10px type. *(Vercel
   `messages.tsx`.)*

**The composer**

9. Textarea **one line at rest (24px), growing to exactly eight (192px), then scrolling internally**,
   via CSS `field-sizing: content` rather than a JS height hack. *(ChatGPT measured: `min-height:24px`
   / `max-height:192px` / `line-height:24px`. Perplexity starts at 2 lines and caps at 10; v0 caps at
   330px; Lovable at 315px. Everybody caps — nobody lets the composer eat the thread.)*
10. Make the left affordance **one menu, not a bare paperclip**, holding both attachment and mode,
   and render a selected mode as a **removable chip**. *(ChatGPT: `Add files and more`, with
   `aria-label="Web search, click to remove"` on the chip. Our deliverable-format selector is a mode;
   so is "restricted evidence only".)*
11. Disabled send = **`opacity: 0.35`**, not hidden. *(ChatGPT measured.)*
12. Backspace on an empty composer removes the last attachment; paste attaches a file from the
   clipboard; drag-and-drop binds to the form. *(Vercel `prompt-input.tsx` — three free wins.)*
13. `Enter` sends, `Shift+Enter` newlines. Retire the current ⌘+↵-only model in
   `console-view.tsx:540`, which no chat user will discover. *(Vercel `prompt-input.tsx`.)*
14. Use **one** button with four states — idle arrow, spinner on submitted, **square on streaming**,
    X on error — swapping `aria-label` and `type`, keeping the position. *(Vercel
    `PromptInputSubmit`.)*
15. Decide queueing explicitly. Cursor is the best answer found: **Enter queues** the next message,
    **Cmd+Enter sends immediately** to steer without interrupting, and **queued messages appear below
    the active task and are draggable to reorder**. The Vercel template flatly refuses with a toast.
    For a governed run, queue — a second request must never interleave with a signed pipeline.
    *(Cursor `docs/agent/overview`.)*
16. Keep the deliverable-format selector (`answer / docx / xlsx / pptx / md`) in the composer chrome,
    not in a settings screen — it is a mode, and modes belong next to the send button. *(Consensus
    across ChatGPT/Claude model pickers; our `DELIVERABLE_FORMATS`.)*
17. Attachment stays a paperclip in the composer's utility row with a count badge, plus drag-and-drop
    over the whole composer. *(Already correct in `console-view.tsx`; keep it.)*

**Multi-step agentic work**

18. Default the run block **collapsed** to one summary row; expand on chevron. *(assistant-ui
    `tool-group`, `defaultOpen={false}`.)*
19. Write the collapsed summary as counts that include failure:
    `11 stages · 8 done · 2 skipped · 1 denied · 38.4s`. Never `100%`. *(assistant-ui `tool-group`
    trailing text: `n done` / `n failed`.)*
20. Shimmer **exactly one** step — the last visible one — and only while streaming; every earlier
    step reads settled even mid-run. *(assistant-ui `tool-timeline`.)*
21. Let a stage exist in the model before it is shown; `visibleSteps` is separate from `steps`, so
    nothing appears until the backend says it happened. *(assistant-ui `tool-timeline`.)*
22. Mark every activity **ephemeral or persistent**; ephemeral ones are replaced by the next arrival
    and never accumulate. *(Linear `agent-interaction`.)*
23. Budget **10 seconds** from dispatch to the first real on-screen activity; treat a miss as a bug.
    *(Linear's unresponsive-session rule.)*
24. Make each stage row clickable to scrub the detail pane to that moment. *(Devin Progress tab.)*
25. Put the full span waterfall behind a disclosure: one row per stage, `0.75rem` indent per depth,
    three colours, min bar width 1.5%. *(assistant-ui `trace-waterfall`.)*

**Reasoning**

26. Auto-open the reasoning block while it streams and **auto-close it when it finishes**, leaving a
    `Thought for N seconds` trigger. *(AI Elements `Reasoning`, `isStreaming`.)*
27. Consolidate all reasoning parts of a turn into **one** collapsible; never render two
    "Thinking…" indicators. *(AI Elements `Reasoning`.)*
28. Label the live line with what is actually happening — `Running <tool>`, not `Thinking` — and key
    the animation on the label string so each change re-announces itself. *(assistant-ui
    `thinking-indicator`.)*
29. Show elapsed time only while `working` or `waiting`, formatted `0:04`; drop it on settle.
    *(assistant-ui `agent-status`.)*

**Citations**

30. Anchor a citation to **document + page + region**, not a URL: render
    `"N pages · M cited"` in the header and `"p. N"` above each quoted passage, with `onJump(page)`.
    *(assistant-ui `document-reference`.)*
31. One marker per **claim**, with multiple sources paginated inside the popover (`1/2`), instead of
    `[1][2][3]` pile-ups. *(Perplexity chips; AI Elements `InlineCitationCarousel`.)*
32. Citations must be **clickable, not hover-only** — a hover-only preview is unusable by keyboard
    and untouchable on a tablet in a plant. *(Corrects AI Elements `InlineCitation`, which is
    hover-only; Perplexity's chip is click-to-popover.)*
33. Render retrieved passages **before** the answer, each with source, locator (`§ 2`), a score
    numeral and a meter; status line reads `Retrieving` then `N passages above threshold`.
    *(assistant-ui `retrieval-chunks`.)*
34. Never enforce a hidden relevance floor in the component; pass a shorter array if you want to drop
    passages, so the UI never silently omits evidence. *(assistant-ui `retrieval-chunks`.)*
35. Show a source count of **0** rather than hiding the control when there are no sources.
    *(assistant-ui `sources`.)*
36. Put the source count in the turn's action row, at the same elevation as copy — not in a separate
    panel the user must discover. *(Perplexity: "same elevation as copy and share".)*
37. Offer **"verify this sentence"** on a text selection, re-running verification for that span only.
    *(Perplexity "Check sources"; Harvey "Ask Over Review" at cell level.)*
38. Carry citations at **sentence** granularity, and expose the ratio explicitly — we already compute
    `material_claims_supported / material_claims_total`. *(Harvey sentence-level citations.)*

**Verdicts, refusals, approvals**

39. Show a verdict with its arithmetic: total/max, a coloured pill, criteria rows with `×N` weights —
    and draw **equal bars for equal scores regardless of weight**. *(assistant-ui `score-breakdown`.)*
40. Give a policy-blocked turn its own shape: shield header, **monospace policy tag**, explanation,
    and offered alternatives as buttons. It is a result, not an error. *(assistant-ui
    `guardrail-notice`.)*
41. Render approval as a three-state footer: the decision strip while pending, then a single fixed
    status line (spinner/X/check) once decided — no re-decidable buttons in the record. *(assistant-ui
    `approval-card`.)*
42. On stop, keep what was produced, badge the reason in free text (`stopped by you`,
    `blocked by policy`, `failed partway through`), and offer Continue / Discard. *(assistant-ui
    `stopped-run`.)*

**Panels, history, empty state**

43. Split the deliverable out to a right-hand panel at **60% width**, `border-l`, sunken surface,
    300ms `cubic-bezier(0.32,0.72,0,1)`, with an explicit close button; full-width (`100dvw`) on
    mobile; animate width to 0 rather than unmounting. *(Vercel `artifact.tsx`.)*
44. Leave an **in-thread placeholder card** (`max-w-[450px]`, `h-[257px]` body) and capture its
    `getBoundingClientRect()` so the panel **animates out of the card's exact position**. That is the
    trick that sells "this left the conversation" rather than "a panel appeared." *(Vercel
    `document-preview.tsx`.)*
45. After the deliverable opens in the panel, **never repeat its content in the thread** — one or
    two sentences of confirmation only. *(Both the Vercel and the leaked Claude artifact system
    prompts say this in almost identical words.)*
46. Publish our own artifact threshold the way Anthropic published theirs ("typically over 15 lines")
    — ours should be *"any deliverable, and any table over N rows"*. *(Claude Artifacts help article.)*
47. Sidebar at **256px**, 48px icon-collapsed, toggled with ⌘/Ctrl+B. *(Vercel `sidebar.tsx`.)*
48. Group history as `Today / Yesterday / Last 7 days / Last 30 days / Older`, paginating at 20.
    *(Vercel `sidebar-history.tsx`; ChatGPT uses "Previous 7 Days/30 Days" then month names.)*
49. Sort threads by **when the run happened**, not by last activity. ChatGPT does the opposite and
    offers no setting; for a record of governed runs that ordering is wrong. *(Deliberate divergence
    from ChatGPT.)*
50. Auto-title on the **first user message only**, with a dedicated small model, 2–5 words, stripped
    of `#*"`, and with an explicit degenerate fallback — `"hi" → New Conversation`. Rename lives in
    the sidebar row menu. *(Vercel `actions.ts` / `lib/ai/prompts.ts`. For us the title should carry
    the vessel or document id where one exists.)*
51. Only stick the scroll to the bottom when the reader is **within 100px of it**, and announce with
    `aria-live="polite"`, never `assertive`. *(setproduct.com.)*
52. Keep the empty state to a headline and one subtitle line; no filler chips.
    *(Vercel `greeting.tsx`: "What can I help with?" / "Ask a question, write code, or explore
    ideas.")* — but see §6.9 for why our three templates are the exception that earns its place.

**Governance, failure states and evidence handling**

53. Write the live status line as **a sentence about what just happened and what is next**, generated
    for the watcher rather than as reasoning, and refresh it on a fixed slow cadence.
    *(Anthropic `display: "updates"`; Claude Code's 15-second summary refresh.)*
54. Give `skipped`, `blocked`, `denied` and `incomplete` four **different** renderings. Test each
    against Buildkite's rule: things break from inside, and are skipped from outside.
    *(Buildkite; GitHub's eight `conclusion` values; GitLab's thirteen.)*
55. Name the recovery action in the status instead of collapsing it to "Failed" —
    `Sandbox unavailable — restart and re-run`. *(Devin's "Reboot VM" status.)*
56. Show elapsed **active work time** separately from human-wait time: `worked 38.4s · held 4h 02m`.
    *(Linear's "Worked for X" fix, which explicitly excludes idle between turns.)*
57. Deduplicate the run log — merge consecutive identical actions into one row with a count.
    *(Devin merging consecutive edits to one file; Langfuse's `retrieve_docs (3/3)`.)*
58. Collapse successes, **auto-open failures**. *(AI Elements `<Tool>`: "Completed and error tools
    open by default"; GitHub's collapsed-with-status subagents.)*
59. Keep a failed row on screen longer than a successful one. *(Claude Code: failed subagent rows
    linger 30s; successful rows clear immediately.)*
60. Expand delegated sub-runs **by default** — the user did not ask for them, so they must be seen.
    *(Devin: "Sub-Devin sessions… appear expanded by default.")*
61. Split each verification cell into two named fields, **Answer** and **Reasoning**, and cite them
    separately. *(Harvey's rebuilt review algorithm, which publishes 4×/7× preference gains for it.)*
62. Replace an empty result with a statement of **where we searched**, not an em-dash.
    *(Harvey's negative-result narrative.)*
63. Withhold the verdict widget entirely below a minimum-evidence threshold rather than showing it
    weakly. *(Consensus: the meter "may not appear if there are less than 5 relevant papers".)*
64. Show counts alongside every percentage, always: `4/4 supported`, not `100%`.
    *(Consensus meter: "Yes 38%… N = 16 · 6 7 1 2".)*
65. Give disconfirming evidence its own row rather than filtering it out by score.
    *(Consensus Evidence Strength table; Scite's *contrasting* category.)*
66. Publish our own measured error rate in the product. *(Consensus: "our model will incorrectly
    classify results 10% of the time.")*
67. Adopt `sourceDocument` + `referenceRanges[].snippets[].pageNumber` as the citation wire format,
    and show ~200 characters of context around each quoted passage. *(Glean's deep-linked citations
    guide — the only documented hover-card sizing rule found anywhere.)*
68. Render a **region image** for vision-extracted citations, never OCR plaintext. *(Glean's own
    published limitation: non-plaintext sources "displayed as simple plaintext… difficult to read or
    parse".)*
69. Preview before navigating — let the reader "confirm you are looking at the right place before you
    click through". *(Glean.)*
70. Put provenance and arithmetic behind the **same** click: the passage *and* how the number was
    derived. *(Hebbia: click a cell for the source "along with a step-by-step breakdown of how the
    answer was derived".)*
71. Show what was **rejected** and why, with evidence for the rejection — excluded passages listed
    below the accepted ones, each with the criterion it failed. *(Elicit's screening exclusions.)*
72. One source of truth for run status across the thread, the task list and the audit log; every
    spinner gets a timeout that resolves to `incomplete`. *(Codex issues #46174 and #45934, as
    anti-pattern.)*
73. Classify failures into *retry for you* / *look at this yourself* / *this touches signed data* and
    give each a different affordance. *(Lovable's "Try again" / "Try to fix" / "Ask the assistant to
    help".)*
74. Scale transparency **down** when the run is heading for a denial or an empty result; let bad news
    arrive fast and plain. *(Buell & Norton Exp. 5 — see §5.5. The only instruction here that
    contradicts the field's default advice.)*
75. Report work completed, never a percentage, for work of unknown duration. *(Nielsen 1993, still
    the correct prescription 33 years later.)*

---

## 4. Rendering a governed 11-stage agentic run inside a single assistant turn

The eleven stages, as the brief defines them, mapped to what the frontend can already observe:

| # | Stage | Evidence available now |
|---|---|---|
| 01 | Request | `task.created`, `task.queued` (+ `queue_position`) |
| 02 | Classification | `task.stage` → `classified`; `TaskProfile.reasons[]`, `signals[]` |
| 03 | Policy gate | `task.blocked`; `PolicyDecision = allow / deny / require_approval` |
| 04 | Model routing | `task.model_selected` (`display_name`, `stage`), `task.model_swapped` |
| 05 | Evidence retrieval | `task.evidence` (per-item), `EvidenceItem.score`, `.location` |
| 06 | Vision extraction | `task.extraction` |
| 07 | Calculation | `task.code_generated`, `task.code_retry`, `task.sandbox_result` |
| 08 | Verification | `task.verified` → `VerificationReport.checks[]`, `material_claims_*` |
| 09 | Approval | `task.stage` → `awaiting_approval`; `task.approval_decided` |
| 10 | Deliverable | `task.deliverable` (`filename`, `sha256`, `released`) |
| 11 | Signed audit | `task.finished`; audit chain hash |

**There are only three structural choices in the wild, and the field has already mapped them:**

| Pattern | Who ships it | Shape |
|---|---|---|
| **A · inline collapsible block in the assistant turn** | Perplexity, ChatGPT's Thought row, VS Code / Copilot Chat, Bolt, Lovable activity cards, v0, Cursor's "Thought for…" | one summary line in the turn; a chevron expands a step list in place |
| **B · separate panel beside the thread** | ChatGPT Deep Research's Activity sidebar, Devin's Workspace, Claude Code's `/diff` panel, Lovable's Details view, Linear's session sheet, LangSmith, Langfuse, Cursor's review pane | the chat stays narrow; the run lives in a persistent side surface |
| **C · its own page or task object outside any thread** | OpenAI Codex Cloud, GitHub's Agents panel, Google Jules, Replit checkpoints, VS Code's Agents window, the retired Copilot Workspace | the run *is* the primary object; chat is a component of it |

The trajectory across 2025–2026 is **A → B → C as runs get longer**. Products that started inline
(Cursor, v0, Copilot) all added a panel or a dedicated agents surface once runs exceeded a few
minutes, and three — Replit Agent 4 (a Kanban board), VS Code (a separate window), GitHub (an Agents
panel) — abandoned the thread metaphor entirely. **Our runs are 30–120 seconds. The thread holds.**
That is why this section argues for A, and why it would argue for C if we were building Devin.

The other cross-product convergence worth naming is the **escalating-detail ladder**: Perplexity,
LangSmith, Lovable and Claude Code independently arrived at *three* levels — (1) a one-line summary
in the turn, (2) an expandable plain-language step list, (3) a dedicated pane with raw tool I/O.
LangSmith makes it literal with keyboard-switchable **Messages (`M`) / Turns (`T`) / Details (`D`)**
views. All three designs below are attempts at the same ladder; they differ in which rung is the
default.

Three designs follow. All three assume the **two-width thread** of §3 items 1–2 — prose and citations at
720px, ledger and evidence rows spanning the full 896px column, composer at 768px — warm-paper surface
(`--background #f7f7f5`, `--surface #ffffff`), `--radius 4px`, and the status tokens already defined
in `globals.css` (`--sovereign #16a34a`, `--active #0284c7`, `--approval #d97706`,
`--critical #dc2626`), plus the shape-and-position-before-hue discipline established in
`12-RESEARCH-EVIDENCE-UI.md §4`.

---

### Design A — the Stage Ledger (collapsed strip that opens to 11 rows)

The run is one block inside the assistant turn, collapsed by default once terminal, expanded
automatically while live.

**Collapsed (terminal state, the default a reader sees on scrollback):**

```
  You                                                                  14:22
  ─────────────────────────────────────────────────────────────────────────
                    Read the attached scanned inspection report for vessel
                    V-2104 and prepare an approval note based on our SOPs.
                                                      📎 V-2104-scan.pdf ⏎

  Aegis                                                                14:23
  ┌───────────────────────────────────────────────────────────────────────┐
  │ ▸  ■■■■■■□─◇■■   VERIFIED · 9 ran · 1 skipped · 1 held · 38.4s        │
  └───────────────────────────────────────────────────────────────────────┘

  Vessel V-2104 has a governing corrosion rate of 0.31 mm/yr at location
  L-04 [F1], giving a remaining life of 8.1 years against t_min 6.0 mm [C1].
  This is a Category 3 finding under clause 7.4.2 [S3] and requires approval
  by an Integrity Engineer before continued operation [S3].
  ┌───────────────────────────────────────────────────────────────────────┐
  │ ■ 4 verified   □ 0 supported   ◇ 0 review   ○ 0 unsupported           │
  └───────────────────────────────────────────────────────────────────────┘

  ⧉ 3 sources   ⤓ APPROVAL-NOTE-V-2104.docx — held for approval
  ⟲ branch   ⧉ copy   ⚖ verify a sentence   ⌗ audit
```

**Expanded (and the live state — it opens itself while running and closes on settle):**

```
  ┌───────────────────────────────────────────────────────────────────────┐
  │ ▾  ■■■■■■□─◇■■   VERIFIED · 9 ran · 1 skipped · 1 held · 38.4s        │
  ├───────────────────────────────────────────────────────────────────────┤
  │ 01 ■ Request            queued 0                              0.1s    │
  │ 02 ■ Classification     vision+calc · confidence 0.86         1.2s ▸  │
  │ 03 ■ Policy gate        ALLOW · restricted → engineer         0.2s ▸  │
  │ 04 ■ Model routing      Qwen2.5-VL-7B → Qwen3-8B              0.3s ▸  │
  │ 05 ■ Evidence retrieval 12 passages · 3 above 0.80            4.8s ▸  │
  │ 06 ■ Vision extraction  4 pages · 31 cells                   11.6s ▸  │
  │ 07 □ Calculation        sandbox · 2 retries · exit 0          9.4s ▸  │
  │ 08 ■ Verification       4/4 material claims supported         6.1s ▸  │
  │ 09 ◇ Approval           HELD · Integrity Engineer                 —   │
  │ 10 ■ Deliverable        APPROVAL-NOTE-V-2104.docx · 34 KB     4.5s ▸  │
  │ 11 ■ Signed audit       chain #0a41…  verified                0.2s    │
  │                                                                       │
  │                                              ⧉ trace   ⤓ export JSON  │
  └───────────────────────────────────────────────────────────────────────┘
```

**A denied run — the whole turn, with no answer:**

```
  Aegis                                                                14:31
  ┌───────────────────────────────────────────────────────────────────────┐
  │ ▾  ■■✕───────■   DENIED AT STAGE 03 · policy · 1.4s                   │
  ├───────────────────────────────────────────────────────────────────────┤
  │ 01 ■ Request                                                  0.1s    │
  │ 02 ■ Classification     restricted · confidence 0.91          1.1s ▸  │
  │ 03 ✕ Policy gate        DENY · rule RESTRICTED-EGRESS-02      0.2s ▸  │
  │ 04 ─ Model routing      not reached                                   │
  │ 05 ─ Evidence retrieval not reached                                   │
  │ ⋯                                                                     │
  │ 11 ■ Signed audit       chain #0a42…  verified                0.1s    │
  └───────────────────────────────────────────────────────────────────────┘
  ┌───────────────────────────────────────────────────────────────────────┐
  │ ⛨  This request was not run                    POLICY  RESTRICTED-02   │
  │                                                                       │
  │ The attached document is classified RESTRICTED and your role           │
  │ (Plant Operator) may not dispatch restricted material to the sandbox.  │
  │ No model was loaded and no evidence was read. The refusal is signed.   │
  │                                                                       │
  │ [ Ask an Integrity Engineer ]  [ Re-run without the attachment ]       │
  └───────────────────────────────────────────────────────────────────────┘
```

Note what stage 11 does here: **the audit stage still runs.** A denial is a record, so the ledger is
not a truncated list of failures — it is a complete list in which stages 04–10 read `not reached`.

**Pros.** One block, one turn, scrollback-safe. Row order never changes and rows never appear or
disappear — all eleven exist at `t=0` in `pending`, exactly as `12-RESEARCH-EVIDENCE-UI.md §5.1`
argues. Reads at a glance as a strip; reads in detail as a ledger. Costs about 13 lines expanded.

**Cons.** Eleven rows is a lot of vertical space in a thread; three consecutive runs push the
composer far away. The strip glyph row is dense and needs a legend the first time.

---

### Design B — the Gutter Rail (11 tick marks beside the answer)

The stages live in a narrow left rail running alongside the answer body, the way a line-number gutter
runs alongside code.

```
  Aegis                                                                14:23
  ┌────┬──────────────────────────────────────────────────────────────────┐
  │ ■01│  Vessel V-2104 has a governing corrosion rate of 0.31 mm/yr at   │
  │ ■02│  location L-04 [F1], giving a remaining life of 8.1 years        │
  │ ■03│  against t_min 6.0 mm [C1].                                      │
  │ ■04│                                                                  │
  │ ■05│  This is a Category 3 finding under clause 7.4.2 [S3] and        │
  │ ■06│  requires approval by an Integrity Engineer before continued     │
  │ □07│  operation [S3].                                                 │
  │ ■08│                                                                  │
  │ ◇09│  ⧉ 3 sources    ⤓ APPROVAL-NOTE-V-2104.docx — held               │
  │ ■10│                                                                  │
  │ ■11│                                                                  │
  └────┴──────────────────────────────────────────────────────────────────┘
        hover a tick → stage detail in a popover;  click → opens the rail
```

**Pros.** Costs almost no vertical space. The governance is permanently visible without competing
with the prose. Visually distinctive — nothing in the consumer market looks like this, which suits a
product whose differentiator is the governance itself.

**Cons.** Fatal ones. The rail's height is bound to the answer's height, so a one-sentence answer
cannot show eleven ticks legibly, and a denied run has no answer at all — the rail collapses to a
column of marks beside empty space. Hover-only stage detail fails keyboard and touch. And it implies
a spatial correspondence between stage and paragraph that does not exist, which is precisely the kind
of pleasant lie this product cannot afford.

**Verdict: reject.** Recorded because it is the design everyone proposes in the first meeting.

---

### Design C — the Dossier (thread + persistent run panel)

The thread stays prose-only. The governed run lives in a right-hand panel that follows the selected
turn — Devin's Progress tab and Deep Research's sidebar, adapted.

```
  ┌──────────────────────── thread (40%) ─────────┬──── run panel (60%) ────┐
  │                                               │ RUN  t-9f31 · 38.4s     │
  │  You                                    14:22 │ ┌─────────────────────┐ │
  │      Read the attached scanned inspection     │ │ STAGES   TRACE  RAW │ │
  │      report for vessel V-2104 …               │ └─────────────────────┘ │
  │                          📎 V-2104-scan.pdf   │ 01 ■ Request     0.1s   │
  │                                               │ 02 ■ Classify    1.2s   │
  │  Aegis                                  14:23 │ 03 ■ Policy      0.2s   │
  │  ■■■■■■□─◇■■  VERIFIED · 38.4s          [run]│ 04 ■ Routing     0.3s   │
  │                                               │ 05 ■ Retrieval   4.8s   │
  │  Vessel V-2104 has a governing corrosion      │ 06 ■ Vision     11.6s   │
  │  rate of 0.31 mm/yr at location L-04 [F1],    │ 07 □ Calc        9.4s   │
  │  giving a remaining life of 8.1 years         │ 08 ■ Verify      6.1s   │
  │  against t_min 6.0 mm [C1].                   │ 09 ◇ Approval      —    │
  │                                               │ 10 ■ Deliverable 4.5s   │
  │  ⧉ 3 sources  ⤓ …docx — held                  │ 11 ■ Audit       0.2s   │
  │                                               │ ─────────────────────── │
  │  You                                    14:29 │ 05 · EVIDENCE RETRIEVAL │
  │      What governs at L-07?                    │ 12 passages, 3 ≥ 0.80   │
  │                                               │ ▸ SOP-114 p.7  0.91     │
  │  [ composer ]                                 │ ▸ SOP-114 p.9  0.84     │
  └───────────────────────────────────────────────┴─────────────────────────┘
```

**Pros.** The thread stays readable. Any turn's run is inspectable without scrolling a wall of stage
rows. The panel has room for the trace waterfall, the raw SSE log and the evidence detail — the three
things an auditor wants and a reader does not. Matches the widest-used long-run pattern (Deep
Research sidebar, Devin Progress tab, Cursor review pane).

**Cons.** Governance becomes optional. A panel that must be opened is a panel that will not be
opened, and the entire premise of AEGIS is that the governance is not an appendix. It also costs 60%
of the viewport, which on a 1366px plant laptop leaves the thread at ~540px — below the readable
band. And it re-creates the separate-screens problem the chat-first reframe exists to solve.

---

### Recommendation: **A as the body, C as the depth, B never.**

Ship **Design A**, with the run panel of **Design C** available from the ledger's `⧉ trace` action
and from any stage row's `▸`.

The reasoning:

1. **The governance must be in the turn, not beside it.** AEGIS's claim is that an answer is
   inseparable from how it was produced. A collapsed strip inside the assistant turn is still inside
   the turn; a panel is not. Design C makes the pipeline a thing you *can* check. Design A makes it
   a thing you *cannot avoid seeing*.

2. **The collapsed strip carries the whole verdict in ~14 glyphs.** `■■■■■■□─◇■■` is readable in
   greyscale, at any size, and — because slot position is fixed — *memorable across runs*. An
   engineer who has read fifty of these will notice a `─` in slot 08 without reading a word. That is
   the same argument `12-RESEARCH-EVIDENCE-UI.md §4` makes for the verdict strip, extended to
   stages.

3. **A denied turn needs a shape, and only A gives it one.** In Design C a denied run is an empty
   thread turn plus a panel; in Design B it is a rail beside nothing. In Design A it is the guardrail
   notice with the ledger above it, and the ledger *still shows eleven rows*, seven of them reading
   `not reached`. The absence is drawn.

4. **Auto-open while live, auto-close on settle.** Take AI Elements' `Reasoning` behaviour exactly:
   `defaultOpen` true while `isStreaming`, collapse to the summary strip on completion. The live run
   deserves the full ledger; the scrollback does not. This also solves the vertical-space objection —
   a thread of five completed runs is five single-line strips.

5. **The 60% panel is right for the deliverable, not for the run.** Reserve the split for the `.docx`
   (§2.5, §2.8) and for the evidence document viewer with `page_location` jumping. Two different
   things competing for the same 60% is how this design fails.

6. **The skipped state is our differentiation, and nobody else has one.** Across all sixteen AI
   products surveyed, **zero document a skipped-step state** — everything is success/error plus
   pending or waiting. A governed pipeline where stages are conditionally denied or bypassed *needs*
   that vocabulary, and the prior art is in CI, not in AI (§2.19). Design A is the only one of the
   three that can draw an absence, because it is the only one where the row exists before the stage
   does.

**The stage-state vocabulary, borrowed from CI (§2.19).** `StageStatus` today is
`pending | active | done | failed | held | skipped`, which collapses four genuinely different
absences into one. Proposed:

| State | Meaning | Ledger rendering | Prior art |
|---|---|---|---|
| `pending` | not started yet | hollow ring, muted, no detail | GitLab `created` |
| `queued` | waiting on a resource | hollow ring + `position 3` | GitLab `waiting_for_resource` |
| `active` | running now | animated dashed ring, `--active` | — |
| `done` | ran, succeeded | filled dot, `--sovereign` | GitHub `success` |
| `failed` | ran, errored | filled dot + X, `--critical` | GitHub `failure` |
| `held` | waiting on a person | ring + pause bar, `--approval`, **no pulse** | GitHub `action_required` |
| `skipped` | the plan said it was not needed | hollow ring, muted, label `not required` | Buildkite `skipped` |
| `blocked` | an earlier decision made it unreachable | hollow ring, strike-through connector, label `not reached` | Buildkite `broken`, GitLab `blocked` |
| `denied` | policy refused this stage | filled ring + ✕, `--critical`, rule id in the detail | — (no precedent found) |
| `incomplete` | the terminal event never arrived | hollow ring + `?`, label `no result received` | LangSmith `Incomplete`, GitHub `stale` |

Buildkite's sentence is the test to apply when classifying: "**jobs break because of something inside
the build, and are skipped by something outside the build.**" A missing attachment skips vision
extraction. A policy denial *breaks* everything downstream. Those must not render identically, and
today they do.

`incomplete` is not theoretical: `backend/core/events.py` holds `MAX_QUEUE = 256` per subscriber and
**drops events for a subscriber that cannot keep up** (per the comment in `use-event-stream.ts`). A
run whose terminal event was dropped is not failed — it is unknown, and an audit UI must be able to
say so.

**Implementation notes against the current tree.** `DEFAULT_PIPELINE` in `frontend/lib/presentation.ts`
has 7 stages with the honest comment that model and latency are filled in from the run. Extend it to
11 with the same discipline. The existing
`AgentPipeline` grid (`frontend/components/agent-pipeline.tsx`) becomes the *expanded* body of the
ledger — but it must lose its `progressPercent` bar (see §5.4) and its `shadow-[0_0_8px_…]` glows.
And the `STATUS_TO_STAGE` map in `console-view.tsx` currently covers five of the backend's statuses;
the other six stages will need their own events or they will render as `skipped` forever — which,
to the current code's credit, is what it already does rather than painting them green.

---

## 5. The honest-streaming problem

**The constraint, restated.** AEGIS must never show unverified text as if it were verified. Token
streaming shows a sentence, then attaches a badge. That is the wrong order, and it is not a
solvable-by-polish problem: Anthropic's own citations API confirms that "citations arrive as a
`citations_delta` delta type inside `content_block_delta` events" [OBSERVED], i.e. **the citation
lands after the text**, and assistant-ui states flatly that there is "no positional link between a
citation marker and an offset inside streamed message text" [OBSERVED]. The industry has not solved
this; it has decided it does not matter. For us it matters.

There is also a live measurement of how bad the underlying problem is. *Cited but Not Verified:
Parsing and Evaluating Source Attribution in LLM Deep Research Agents* (Onweller et al.,
arXiv:2605.06635) benchmarked 14 models and found link validity above 94% and topical relevance
above 80%, but **only 39–77% factual accuracy** — roughly 23–61% of citations failing to support the
claim they are attached to. Worse for us: "Fact Check accuracy drops approximately 42% on average"
as search depth scales from 2 to 150 tool calls [REPORTED]. A visible citation is not evidence of a
supported claim. Our verification stage exists for exactly this, and the UI must not let a citation
chip imply the verdict before stage 08 has produced it.

So: **do not stream prose. Stream everything else.** There is far more real, checkable material
arriving during a 30–120s run than there is draft text, and none of it lies.

### 5.1 What actually streams (and is honest)

| t | On screen | Source event | Why it is honest |
|---|---|---|---|
| 0–1s | Ledger paints all 11 rows in `pending`; row 01 goes `active` | `task.created`, `task.queued` | The stages are the contract; showing them empty claims nothing |
| 1–3s | Classification row resolves with `TaskProfile.reasons[]` | `task.stage: classified` | Real classifier output |
| 3–4s | Policy row: `ALLOW` / `DENY` / `REQUIRE_APPROVAL` + rule id | policy decision | A decision that already happened |
| 4–5s | Routing row names the actual model | `task.model_selected` | Measured, not planned |
| 5–12s | **Evidence passages appear one at a time**, each with document, `p. N`, score, 2-line snippet | `task.evidence` (per item) | Retrieved text. The user can start reading the source material |
| 12–25s | Vision row: pages and cells extracted; thumbnails of the regions | `task.extraction` | Extracted regions are real artefacts |
| 25–35s | Calculation row: the generated code, retries, sandbox exit | `task.code_generated`, `task.sandbox_result` | The arithmetic, shown before its conclusion |
| 35–40s | Verification row: `4/4 material claims supported`, per-check rows | `task.verified` | The verdict |
| 40s | **The answer appears at once**, already cited, already badged | `task.answer` | Nothing was ever shown unverified |

That is 40 seconds in which the screen is never still and never lies. The user has, by the time the
answer lands, already read the three passages it rests on.

And one reframe that the research forces. A 30–120 second run is **3–12× past Nielsen's 10-second
attention limit** (§2.20). Past that limit the goal is not to hold attention — Nielsen's own words
are that beyond 10s "users will want to do other tasks". **The goal is to make leaving safe and
returning cheap.** Every product with runs longer than ours converged on the same answer: demote the
job to a list with a stable identity, and notify on completion. Deep Research explicitly tells users
to step away. ChatGPT Tasks and Codex both do it. `ask-view.tsx` already has the beginnings of it.

### 5.2 Six concrete proposals

**P1 — Evidence-first reveal (the primary mechanism).** Adopt assistant-ui `retrieval-chunks`
verbatim: status line reads `Retrieving`, then `N passages above threshold`; each passage shows
source, locator, score numeral + meter, snippet clamped to two lines; score text goes emerald at
≥0.80. Our `task.evidence` already fires per item with `score` and `location`. This is the single
highest-value change in this document: it converts 5–15 seconds of dead time into *the user reading
the actual clauses*, and it front-loads the part of the answer that is not model-generated at all.

**P2 — Claim-at-a-time commit, never token-at-a-time.** If progressive reveal of prose is wanted,
the unit is the **verified sentence**, not the token. A sentence is written to the thread only when
its citation and verdict are attached. Visually: sentences appear one at a time, each already
carrying `[F1]` and its verdict glyph. This is the only form of "streaming" compatible with the
constraint, and it is what Harvey's sentence-level citation implies. Ship it as a second phase; P1
first.

**P3 — Ephemeral status line, one at a time, written by the model *for the watcher*.** A single live
line above the ledger, in Linear's ephemeral mode: **replaced**, never appended. Key the animation on
the label string so each change re-announces (assistant-ui `thinking-indicator`). Elapsed time shown
only while `working`/`waiting`, `0:04` format (assistant-ui `agent-status`). Never write a permanent
line for a step that has not completed.

The content of that line is a solved problem, and it is a first-party API feature. Anthropic's
`display: "updates"` (§2.5) exists for precisely "an agent interface that **keeps reasoning hidden
and shows the user a status line at each step**", where a progress update is "a sentence or two on
what the model just found and what it's about to do next, **written for the person watching the agent
rather than as reasoning**". Their example — `"Confirmed the retry path never refreshes the expired
token. Editing auth.py to add the refresh call."` — is the exact register we want:

```
Read pages 1–2 of the thickness survey; 6 locations found. Reading pages 3–4.
```

Not `Thinking`. Not `Processing…`. A sentence about what just happened and what is next, which is
checkable against the ledger the moment it settles. Claude Code's equivalent cadence is a one-line
summary that "**updates every 15 seconds during work**" — slow enough not to flicker, fast enough to
prove liveness.

**Critically, this line is not the answer and must never look like it.** Different type, different
colour, ephemeral, above the ledger, never inside the answer region. It says what the machine *did*,
never what the machine *concluded*.

**P4 — A 10-second first-paint budget.** Borrow Linear's unresponsive-session rule as an internal
SLA: if the operator has not seen a *real* piece of run output within 10 seconds of pressing send,
that is a defect. Queue position (`task.queued` carries `queue_position`, and per the comment in
`use-event-stream.ts` it was published but never listened for) is a legitimate first paint:
`Queued · position 3` is true and useful.

**P5 — Detach past 120 seconds.** Past the brief's upper bound, stop asking for attention. The run
moves to the task list; the thread turn shows a `working · 2:14` pill (assistant-ui `agent-status`,
which "renders only while a task runs or waits for input"); the operator is notified on settle.
`ask-view.tsx` already persists an in-flight task id to `sessionStorage` and re-attaches on mount —
generalise that. Deep Research's 5–30 minute runs prove people accept this; they do not accept being
held hostage to a spinner.

**P6 — Show the dual explanation, not the confident one.** Palod et al. (§2.20) found that reasoning
traces and post-hoc explanations "increase user acceptance of LLM predictions **regardless of their
correctness**", and that only a **contrastive dual explanation** — arguments for *and against* the
answer — improved users' ability to tell correct from incorrect. Our verification panel currently
renders `VerificationReport.checks[]` as a list of passes. It must also render, with equal weight:

- checks that **failed**, with what they were checking;
- evidence that **contradicts** the conclusion (Consensus gives a contradicting finding its own row
  in the Evidence Strength table; Scite makes *contrasting* a first-class colour);
- `VerificationReport.limitations[]`, which exists in `frontend/lib/types.ts` today and is rendered
  nowhere.

A panel of green ticks is a persuasion surface. A panel that names what it could not confirm is a
calibration surface. For a product whose output gets signed, only the second one is defensible.

### 5.3 What holds attention for 30–120 seconds

Ranked by how much of the wait each device actually absorbs:

1. **Real retrieved text to read** (P1) — 5–15s of the wait becomes productive.
2. **A plan the user agreed to** — show the classification profile (`requires_vision`,
   `requires_code_execution`, `step_budget`, `reasons[]`) as a one-line plan *before* the governed
   stages run, editable. Deep Research's clarifying step, compressed. Consented waiting is not
   waiting.
3. **Stages resolving with specific content** — `Qwen2.5-VL-7B`, `4 pages · 31 cells`, `exit 0`. Not
   "Processing…".
4. **The single ephemeral line with an elapsed counter** (P3).
5. **The document viewer opening on the first cited page** while the rest runs — the deliverable
   panel earns its 60% during the wait, not after it.

### 5.4 What must not be used

**The field already agrees on the first item.** Across sixteen surveyed products, **not one ships a
percentage-complete bar for an agent run.** ChatGPT Deep Research has a bar, and nothing anywhere
documents what drives it; deep research has no fixed step count, so it cannot be a real fraction.
Everyone else shows elapsed time (Devin per tool call, Copilot per subagent, Lovable and Linear per
turn, Codex `10h 9m`) or a step counter. Linear goes furthest and measures **active work time,
excluding idle wait between turns**.

- **No percentage bar.** `agent-pipeline.tsx` currently computes
  `progressPercent = doneCount / stages.length`. Eleven stages of wildly unequal duration (vision
  ~11.6s, audit ~0.2s) make that number a lie at every instant, and it *goes backwards* conceptually
  when a stage is skipped. If a bar is kept, it must be **weighted** (assistant-ui `job-progress`:
  each stage has an explicit `weight`, "relative share of the overall bar this stage accounts for"),
  and it must never reach 100% unless `stageIndex === stages.length`.
- **No ETA that the system computed.** assistant-ui's `job-progress` takes ETA as a *string prop*
  (`"about 3 min"`) precisely because an honest ETA usually does not exist. Either show a measured
  median for this task class or show nothing.
- **No shimmer, and no skeleton, on content that does not exist.** Skeleton lines where the answer
  will be are a promise the policy gate may be about to break. The evidence is also against them on
  their own terms: Viget's study (§2.20) found the skeleton condition worst on every measure — 59%
  agreed it "loads quickly" versus **74% for a plain spinner**, and the *longest* perceived wait
  (2.82s, versus 2.29s for a blank screen). NN/g caps skeletons at "a wait time that's under 10
  seconds" and excludes non-page-load processes outright. Shimmer the *stage row that is running*,
  never the *answer that is not*.
- **No perceptual tricks.** Harrison, Yeo & Hudson (CHI '10) measured a backwards-decelerating ribbed
  progress bar cutting perceived duration by **11%**. It works. We still do not get to use it, for
  the same reason we do not get a fake bar: each of those techniques is a small lie about how the
  work is going, in a product sold on the claim that the screen is the evidence.
- **No animation continuing without events.** If no SSE event has arrived in 12 seconds, say so:
  `no update for 0:12`. Silence is data. The event bus in `backend/core/events.py` drops events for a
  slow subscriber (per the comment in `use-event-stream.ts`), so a stalled UI is a real, reachable
  state and must be visible rather than smoothed over.
- **No typing dots.** They are a promise of imminent prose.

### 5.5 The asymmetry rule — transparency must scale *down* when the news is bad

This is the finding that changes the design, and it is inside the paper everyone cites for the
opposite conclusion.

Buell & Norton's labor illusion is real: operational transparency — "a running tally of the tasks
being performed" — made people prefer a *longer* wait for identical results, and Experiment 4 showed
**perceived** effort mattered while **actual** effort did not. Every instinct in §5.1–5.3 is built on
that.

But Experiment 5 (§2.20) found a significant **transparency × outcome interaction**, and the
direction is brutal. With a favourable outcome, 15 seconds of visible work produced the highest value
ratings in the paper (M=4.06 vs 3.34 instantaneous). With an **unfavourable** outcome, the same
visible work produced the **lowest**: M=2.47 at 15s and **M=2.10 at 30s**, both significantly *worse*
than an instantaneous result (M=3.24). The authors: "**When a service demonstrates that it is trying
hard and yet still fails to come up with anything but poor results… people blame the service.**"

For AEGIS, the unfavourable outcomes are not edge cases. They are core product states:

- a **policy denial** at stage 03,
- a run **blocked** because the operator's classification ceiling was exceeded,
- a verdict of **UNSUPPORTED** on a material claim,
- a retrieval that found **nothing above threshold**,
- a deliverable **held** and then **rejected** by a reviewer.

The rule that follows, and it is the opposite of the usual advice:

> **The more likely the run is to end in a denial, an empty result or an unsupported verdict, the
> less theatre it should perform on the way there.**

Concretely:

1. **Move the policy gate as early as it can possibly run, and let a denial arrive in under two
   seconds.** A denied turn should never have shown a retrieval animation, a model name or a vision
   thumbnail. It cost nothing and it should look like it cost nothing. This is the opposite of
   Harrison et al.'s advice to front-load the slow stages — and Harrison's advice loses, because a
   fast honest refusal beats a well-paced one.
2. **When the run is heading somewhere good, spend the transparency.** Evidence passages, extracted
   regions, the calculation — all of it, as it arrives.
3. **When a verdict lands UNSUPPORTED, say it plainly and immediately**, and follow Harvey's pattern
   (§2.3): state *where we searched* and found nothing. Do not surround a negative result with
   ceremony.
4. **Never let the length of the run become an implicit claim about the quality of the answer.**
   `Verified in 38.4s` and `Denied in 1.4s` are both good outcomes, and the interface must not make
   the second look like a failure of effort.

### 5.6 The one rule underneath all of it

**Every animated element on screen must be driven by an event that arrived.** If nothing arrived,
nothing moves. There is no peer-reviewed measurement of how much a discovered fake spinner costs,
but there does not need to be: in a product whose entire value proposition is that what you see was
measured, one decorative progress element discounts every honest one beside it. Fifteen seconds of a
still screen with an accurate timestamp is cheaper than that.

---

## 6. Wrong for us — chat patterns that would actively damage a verification product

**6.1 Token-by-token streaming of draft prose.** Already argued. Adding: it is not merely
insufficient, it is *actively harmful*, because a partially-rendered sentence is maximally
persuasive and minimally checkable. Users read the first clause and stop.

**6.2 Regenerate as the primary action.** "Didn't like it? Try again" is a slot machine. In a
governed pipeline, a second run with a different model produces a *different signed record*, and
offering it as a one-click impulse invites shopping for the answer you wanted. Keep re-run, make it
a branch (Vercel `MessageBranch`), label it, and never delete the prior branch.

**6.3 Thumbs up / thumbs down.** A sentiment signal on a turn that has a formal verification verdict
is noise that competes with the verdict. The only correct feedback affordances here are *approve*,
*reject with notes*, and *dispute a specific citation*.

**6.4 An assistant avatar, persona, or a bubble.** `presentation.ts` already carries a hard-won
lesson about this — invented human names ("M. Okonkwo", "S. Ramanathan") were rendered where a reader
could take them for the signed-in operator, on a system that records who approved what. A friendly
assistant face is the same mistake in cartoon form. The assistant turn is a **record**, and records
do not have faces.

The market agrees and has for a while: across ChatGPT, Claude.ai, Perplexity and every reference
implementation examined, **no product puts an avatar on an assistant turn**, and none gives the
assistant a bubble. The universal pattern is user = right-aligned tinted bubble capped at 70–80% of
the column, assistant = unstyled text filling the column. Published guidance is blunt about why
bubbles on both sides are wrong: they signal "**messenger, not tool**" [REPORTED, setproduct.com].
A bubble around a signed, cited, verified record is a category error.

**6.5 Whimsical thinking labels.** "Pondering…", "Noodling…" — charming in a consumer chat, grotesque
above a corrosion calculation. Use `Running vision extraction · page 3 of 4`.

**6.6 Auto-collapsing the run log into nothing.** Collapse to the *summary strip*, never to absent.
An assistant turn with no visible governance is indistinguishable from an ordinary chatbot answer,
which is the one thing this turn is not.

**6.7 Editing the user's message in place.** ChatGPT and Claude both let you edit a sent message and
silently replace the turn. For AEGIS the request text is stage 01 of a signed chain. Editing must
create a new turn that *references* the old one, never overwrite it.

**6.8 Hover-only citation previews.** AI Elements' `InlineCitation` is explicitly hover-based, "no
click required". On a tablet in a plant, with gloves, there is no hover. Click-to-open, keyboard
focusable, `aria-current` on the active anchor (assistant-ui `document-reference` does this
correctly).

**6.9 Generic prompt-starter chips.** "Explain quantum computing" filler is worse than an empty
screen because it advertises capabilities the host may not have.

The published critique is sharper than my instinct. Adi Leviim, *The death of the empty state in AI
products* [REPORTED; the UX Collective original is Cloudflare-blocked, read via a syndicated copy]:
AI products "replaced 20 years of empty-state research with a prompt box", which is "**the absence of
design**, not minimalism"; the chips are "**the only signifier**" in an otherwise barren interface
and function as **filler rather than genuine affordances**; what users need instead is "**a worked
example**" and "**a starting verb**". The prompt box "violates recognition by definition" — you must
recall a product's capabilities before you have experienced them. The author's own funnel numbers
from a Chrome extension: **70% of new installs never returned for a second session**; 30% reached a
second, **12% a fifth, 4% weekly active**, with the empty state named as the single biggest cause.
(Treat the funnel as one product's data, not a benchmark.)

Note also what the market actually does [OBSERVED]: **Perplexity ships no suggestion chips at all**
on its empty state — two promo cards instead. ChatGPT logged out ships two, and they are about the
product ("Chat with ChatGPT", "What can you do?"), not about tasks. v0 ships four *plus* a
**"Refresh suggestions"** button, which is a tacit admission that any four are arbitrary.

**Our exception, and it is a real one:** the three `CONSOLE_TEMPLATES` are not filler. They are
*worked examples with a starting verb* — "Read the attached scanned inspection report for vessel
V-2104 and prepare an approval note…" — tied to specific sample documents, and one of them honestly
announces `Requires attachment`. That is precisely what Leviim asks for. Keep exactly those three,
keep the attachment honesty, never add a "Refresh suggestions" button, and never grow the list to
fill a grid.

For the headline, note that NN/g's canonical empty-state guidance has **never evaluated AI prompt
chips** — its three rules are communicate system status, provide learning cues, provide direct
pathways to key tasks. Do not cite NN/g as having tested this; cite it for the rules, which our
templates satisfy and generic chips do not.

**6.10 Markdown rendering that outruns provenance.** A bolded heading and a tidy bullet list make an
uncited claim *look* like a finding. Until stage 08 has run, render the answer region as nothing at
all — not as styled placeholder prose.

**6.11 Infinite scroll with no anchors.** A thread that is an audit record needs per-turn permalinks,
a timestamp on every turn, and a jump-to-run affordance. Consumer threads have none of these because
consumer threads are disposable.

**6.12 "Continue" on a stopped governed run.** assistant-ui's `stopped-run` offers Continue, which is
right for a chatbot and wrong here: a cancelled run's stages 04–11 did not happen, and resuming
across a cancellation boundary produces a record with a hole in it. Offer **Re-run** (new record,
linked to the cancelled one) and **Discard**. Keep the partial output visible with its reason badge —
that part of the pattern is exactly right.

**6.13 A green checkmark on a stage that was skipped.** The current code already gets this right and
says why, in a comment worth preserving verbatim: *"A board that shows what was skipped is the more
credible one."* Every design in §4 is built on that sentence.

**6.14 An approval that times out into consent.** Google Jules: "**If you don't respond, Jules will
eventually auto-approve its plan**" — on an undocumented timer [OBSERVED, `jules.google/docs/review-plan/`].
This is the single most dangerous pattern found in the entire study, and it is shipping. AEGIS's
stage 09 must hold **indefinitely**, say so on screen (`held · awaiting Integrity Engineer · 4h 02m`),
and never convert silence into a signature.

**6.15 A run status that disagrees with itself across surfaces.** OpenAI Codex issue #46174
[OBSERVED] records one task simultaneously showing **"Failed"** in the task list, **"Working on your
task"** with a Cancel button on the detail page, and **`[PENDING]`** in the CLI. Issue #45934 records
a spinner still spinning after a reboot. We have three surfaces reading the same run — the thread,
the task list and the audit log. One source of truth, or the audit trail is worthless. And every
spinner needs a timeout that resolves to `incomplete`, not to eternity.

**6.16 A static live label.** Lovable shows the bare word **"Thinking"**, and its own troubleshooting
literature says why that fails: "a step that landed two minutes ago and a step that landed thirty
seconds ago are two very different situations, and **the word Thinking looks identical in both**."
Replit's "working" / "considering next step" has the same problem. Our live line must name the work
and carry elapsed time (§5.2 P3).

**6.17 A collapsed summary the user never finds.** The ChatGPT teardown's own critique of the
`Thought for 5s` row: "**Thought label is easy to miss on fast scroll. Users who want transparency
may not discover Activity without trying the chevron.**" Design A's strip must not be a subtle grey
line — it carries a verdict, and it must read as one at a glance.

**6.18 A thinking panel positioned as evidence.** Turpin et al. measured CoT accuracy drops of up to
36% under biasing features; Anthropic's own study found Claude 3.7 Sonnet mentioned a decisive hint
only **25%** of the time, and under reward-hacking training models admitted the hack **"less than 2%
of the time."** A reasoning summary is not faithful, is generated by *a different model* than the one
that reasoned (§2.5), and must never sit adjacent to a citation chip where a reader might take it for
support. If we render it at all, it goes below the verification panel, in a distinct register, and
labelled as a summary.

**6.19 A verification panel of nothing but green ticks.** Palod et al.: traces and explanations
"increase user acceptance of LLM predictions **regardless of their correctness**", and only
contrastive dual explanation improved discrimination. See §5.2 P6. This is an anti-pattern we would
otherwise have shipped by accident, because the happy path is the easy one to build.

---

## 7. Sources

**Component libraries and source code (all [OBSERVED])**
- assistant-ui Elements gallery — https://www.assistant-ui.com/elements (and element pages:
  `guardrail-notice`, `approval-card`, `job-progress`, `retrieval-chunks`, `document-reference`,
  `sources`, `inline-citation`, `agent-status`, `thinking-indicator`, `stopped-run`, `tool-group`,
  `tool-timeline`, `task-card`, `trace-waterfall`, `score-breakdown`)
- Vercel AI Elements — https://elements.ai-sdk.dev/ (`reasoning`, `task`, `inline-citation`,
  `sources`)
- `vercel/ai-chatbot` source — https://github.com/vercel/ai-chatbot
  (`components/ai-elements/message.tsx`, `components/ai-elements/prompt-input.tsx`,
  `components/chat/messages.tsx`, `components/chat/greeting.tsx`, `components/chat/artifact.tsx`,
  `components/chat/sidebar-history.tsx`, `components/ui/sidebar.tsx`)
- `johnson00111/wide-chat` `content.js` — https://github.com/johnson00111/wide-chat (source of the
  claude.ai `.mx-auto.max-w-3xl` selector)

**Vendor documentation**
- Anthropic, Citations — https://platform.claude.com/docs/en/build-with-claude/citations [OBSERVED]
- Anthropic, "What are Artifacts and how do I use them?" —
  https://support.claude.com/en/articles/9487310 [OBSERVED]
- OpenAI, Reasoning guide — https://developers.openai.com/api/docs/guides/reasoning [OBSERVED]
- Cognition, Devin Session Tools — https://docs.devin.ai/work-with-devin/devin-session-tools.md [OBSERVED]
- Linear, Agents — https://linear.app/developers/agents [OBSERVED]
- Linear, Agent Interaction — https://linear.app/developers/agent-interaction [OBSERVED]
- Cursor 3.0 changelog — https://cursor.com/changelog/3-0 [OBSERVED]
- Harvey, "The Brief: April 2026" — https://www.harvey.ai/blog/the-brief-april-2026 [REPORTED]
- OpenAI, Deep research in ChatGPT — https://help.openai.com/en/articles/10500283 [REPORTED — 403 on fetch]
- OpenAI, Introducing deep research — https://openai.com/index/introducing-deep-research/ [REPORTED — 403 on fetch]

**Vendor documentation, second pass**
- Anthropic, Extended thinking — https://platform.claude.com/docs/en/build-with-claude/thinking
  (the `display` parameter, summarised thinking, and **progress updates between tool calls**) [OBSERVED]
- Anthropic, Using extended thinking on Claude — https://support.claude.com/en/articles/10574485 [OBSERVED, fr-FR localisation]
- Anthropic, Visible extended thinking — https://www.anthropic.com/news/visible-extended-thinking [OBSERVED]
- Anthropic, Reasoning models don't always say what they think — https://www.anthropic.com/research/reasoning-models-dont-say-think [OBSERVED]
- OpenAI, Learning to reason with LLMs ("Hiding the Chains of Thought") — https://openai.com/index/learning-to-reason-with-llms/ [REPORTED — 403; recovered via snippets and Simon Willison's contemporaneous quoting]
- OpenAI, Deep research in ChatGPT — https://help.openai.com/en/articles/10500283 [OBSERVED via r.jina.ai]
- OpenAI, Scheduled tasks in ChatGPT — https://help.openai.com/en/articles/10291617 [OBSERVED via r.jina.ai]
- OpenAI, Codex cloud — https://developers.openai.com/codex/cloud/ [OBSERVED via r.jina.ai]
- OpenAI Codex issues **#46174** (status disagreement) and **#45934** (endless spinner) — https://github.com/openai/codex/issues [OBSERVED]
- Google, Gemini API thinking / thought summaries — https://ai.google.dev/gemini-api/docs/thinking [OBSERVED via r.jina.ai]
- Google, Jules — https://jules.google/docs/review-plan/, /docs/code/, /docs/errors/, /docs/usage-limits/ [OBSERVED]
- Cognition, Devin release notes 2026 — https://docs.devin.ai/release-notes/2026 [OBSERVED]
- Cognition, Session Insights — https://docs.devin.ai/product-guides/session-insights [OBSERVED]
- Anthropic, Claude Code docs (agent view, subagents, diff panel, usage) — https://code.claude.com/docs/en/ [OBSERVED]
- Cursor changelog 2.0 / 2.3 / 3.0, agent review and run modes — https://cursor.com/changelog, /docs/agent/review, /docs/agent/security/run-modes [OBSERVED]
- VS Code, chat overview and agent tools; Agents window — https://code.visualstudio.com/docs/chat/chat-overview, /docs/copilot/agents/agent-tools, /docs/agents/run/agents-window [OBSERVED]
- GitHub, Agents panel launch — https://github.blog/news-insights/product-news/agents-panel-launch-copilot-coding-agent-tasks-anywhere-on-github/ [OBSERVED]
- GitHub, subagent visibility changelog (19 Mar 2026) — https://github.blog/changelog/2026-03-19-more-visibility-into-copilot-coding-agent-sessions/ [OBSERVED]
- GitHub Copilot Workspace user manual (archived) — https://raw.githubusercontent.com/githubnext/copilot-workspace-user-manual/main/tips-and-tricks.md [OBSERVED]
- Lovable, Agent mode / Publish / Credits — https://docs.lovable.dev/features/agent-mode, /features/publish [OBSERVED]
- Replit, Agent 3 → Agent 4 — https://replit.com/blog/whats-changed-agent3-to-agent4 [OBSERVED]
- Bolt source, `action-runner.ts` state machine — https://github.com/stackblitz/bolt.new [OBSERVED]
- Vercel v0 changelog — https://v0.app/changelog [OBSERVED]
- LangSmith, View traces — https://docs.langchain.com/langsmith/view-traces [OBSERVED]
- Langfuse, New Trace View (2025-03-19), latency colour changelog (2024-10-10), observation types, PRs #17590/#17619 — https://langfuse.com/changelog, /docs/observability/features/observation-types [OBSERVED]
- Perplexity, LangChain Breakout Agents interview (the Zhang quote) — https://www.langchain.com/breakoutagents/perplexity [OBSERVED]
- Perplexity release feed — https://releasebot.io/updates/perplexity-ai [OBSERVED]
- Consensus, the Consensus Meter — https://consensus.app/home/blog/consensus-meter/ and /introducing-the-consensus-meter/ [REPORTED]
- Elicit, Living documents and AI UX — https://elicit.com/blog/living-documents-ai-ux; Reports — /blog/introducing-elicit-reports/; help — https://support.elicit.com/en/articles/7927169 [REPORTED]
- Harvey, Rebuilding Harvey's review algorithm — https://www.harvey.ai/blog/rebuilding-harveys-review-algorithm [REPORTED]
- Harvey, Collaborative review tables — https://www.harvey.ai/blog/collaborative-review-tables [REPORTED]
- Glean, citations and deep-linked citations — https://docs.glean.com/user-guide/assistant/glean-chat/glean-chat-citations/ and https://developers.glean.com/guides/chat/deep-linked-citations [REPORTED]
- Hebbia — https://research.contrary.com/company/hebbia, https://www.hebbia.com/product/matrix [REPORTED]
- Scite badge configuration — https://scite.ai/badge [REPORTED]
- Linear, Agents and Agent Interaction — https://linear.app/developers/agents, /agent-interaction [OBSERVED]

**Thread, composer, artifacts and empty states, third pass**
- OpenAI, Introducing canvas (trigger rates, shortcut labels, targeted-edit rule) — https://openai.com/index/introducing-canvas/ [OBSERVED]
- assistant-ui, Claude Clone reference implementation (Claude.ai palette and turn styling) — https://www.assistant-ui.com/examples/claude [REPORTED]
- ChatGPT width-fix userscript (`--thread-content-max-width: 40rem`, `#stage-slideover-sidebar`) — https://gist.github.com/alexchexes/d2ff0b9137aa3ac9de8b0448138125ce [REPORTED]
- Leaked Claude 3.5 Sonnet artifacts system prompt (the explicit *don't* list and MIME types) — https://gist.github.com/dedlim/6bf6d81f77c19e20cd40594aa09e3ecd [REPORTED]
- Vercel `ai-chatbot` (third pass): `components/chat/artifact.tsx`, `document-preview.tsx`, `message-actions.tsx`, `suggested-actions.tsx`, `slash-commands.tsx`, `app/(chat)/actions.ts`, `lib/ai/prompts.ts` [OBSERVED]
- Cursor, Agent overview (Enter queues / Cmd+Enter steers / draggable queue; `/side`, `/btw`, `/goal`) — https://cursor.com/docs/agent/overview, /docs/agent/agents-window [REPORTED]
- Replit, Agent overview (plan mode, "Accept tasks" / "Revise plan", output-type selector) — https://docs.replit.com/features/agent/overview [REPORTED]
- Google AI Studio quickstart (Run settings panel, "Get code") — https://ai.google.dev/gemini-api/docs/ai-studio-quickstart [REPORTED]
- Setproduct, AI chat interface UI design (65–72 chars/line, 400–520px IDE panels, 100px auto-scroll stickiness, `aria-live="polite"`, the anti-bubble argument) — https://www.setproduct.com/blog/ai-chat-interface-ui-design [REPORTED]
- Leviim, *The death of the empty state in AI products* — https://www.designersforest.com/the-death-of-the-empty-state-in-ai-products/ (syndicated; the UX Collective original is Cloudflare-blocked) [REPORTED]
- NN/g, *Empty State Interface Design* — https://www.nngroup.com/articles/empty-state-interface-design/ [REPORTED — note it contains **no** AI-chat or prompt-chip content]

**CI/CD status vocabularies**
- GitHub, Check Runs REST API (the eight `conclusion` values) — https://docs.github.com/en/rest/checks/runs [OBSERVED]
- GitHub, Skipping workflow runs — https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs [OBSERVED]
- GitLab, Pipelines API and CI YAML (`allow_failure`, `status_warning`, blocked pipelines) — https://docs.gitlab.com/api/pipelines/, https://docs.gitlab.com/ci/yaml/ [OBSERVED]
- Buildkite, Defining steps (`skipped` vs `broken`) — https://buildkite.com/docs/pipelines/configure/defining-steps [OBSERVED]

**Teardowns and secondary analysis (all [REPORTED])**
- AI UX Playground — Perplexity citations and output, ChatGPT output —
  https://aiuxplayground.com/teardowns/perplexity/citations/, /perplexity/output/, /chatgpt/output/
- Geodocs, AI Citation Format Specification by Engine —
  https://geodocs.dev/reference/ai-citation-format-spec-by-engine
- Perplexity design reconstruction (values do **not** match the live product) —
  https://blakecrosley.com/guides/design/perplexity, https://oh-my-design.kr/design-systems/perplexity
- AY Design, AI citation and source UI patterns 2026 (the "citation graveyard" pattern) —
  https://www.aydesign.ai/blog/ai-citation-source-ui-patterns-2026
- Shape of AI, Citations pattern — https://www.shapeof.ai/patterns/citations
- Simon Willison on o1 and on GPT-5 Thinking — https://simonwillison.net/2024/Sep/12/openai-o1/,
  https://simonw.substack.com/p/gpt-5-thinking-in-chatgpt-aka-research
- Wikipedia, ChatGPT Deep Research — https://en.wikipedia.org/wiki/ChatGPT_Deep_Research
- Axon Build on stuck agents ("the word Thinking looks identical in both") — https://axonbuild.com/blog/lovable-stuck-on-thinking
- UVA Library guide to Consensus — https://guides.lib.virginia.edu/consensus

**Research**
- Onweller et al. (2026), *Cited but Not Verified: Parsing and Evaluating Source Attribution in LLM
  Deep Research Agents*, arXiv:2605.06635 — https://arxiv.org/html/2605.06635v1 [REPORTED]
- Palod, Biswas & Kambhampati (2026), *Evaluating the False Trust Engendered by LLM Explanations*,
  arXiv:2605.10930 [OBSERVED, abstract]
- Turpin, Michael, Perez & Bowman (2023), *Language Models Don't Always Say What They Think*,
  arXiv:2305.04388 [OBSERVED]
- Vasconcelos, Jörke, Grunde-McLaughlin, Gerstenberg, Bernstein & Krishna (2023), *Explanations Can
  Reduce Overreliance on AI Systems During Decision-Making*, arXiv:2212.06823 (CSCW) [OBSERVED]
- Pang, Feng, Suzuki, Metaxa & Landay (2026), *Interactive Reasoning: Visualizing and Controlling
  Chain-of-Thought Reasoning in Large Language Models*, IUI 2026, DOI 10.1145/3742413.3789091 [OBSERVED]
- **Buell, R. W. & Norton, M. I. (2011), *The Labor Illusion: How Operational Transparency Increases
  Perceived Value*, Management Science 57(9), 1564–1579, DOI 10.1287/mnsc.1110.1376** — full text at
  hbs.edu [OBSERVED]. **Experiment 5 is the one that matters; see §5.5.**
- Harrison, Amento, Kuznetsov & Bell (2007), *Rethinking the Progress Bar*, UIST '07, 115–118 —
  https://chrisharrison.net/projects/progressbars/ProgBarHarrison.pdf [OBSERVED, full text]
- Harrison, Yeo & Hudson (2010), *Faster Progress Bars: Manipulating Perceived Duration with Visual
  Augmentations*, CHI '10, 1545–1548 [OBSERVED, full text]
- Nielsen, J. (1993), *Response Time Limits*, NN/g —
  https://www.nngroup.com/articles/response-times-3-important-limits/ [OBSERVED]
- NN/g, *Progress Indicators* and *Skeleton Screens* —
  https://www.nngroup.com/articles/progress-indicators/, /articles/skeleton-screens/ [OBSERVED]
- Faulkner & Olvera (2017), *A Bone to Pick with Skeleton Screens*, Viget —
  https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens/ [OBSERVED]

**Internal**
- `docs/plan/10-RESEARCH-CONSOLES.md`, `11-RESEARCH-LANDING-FIRSTRUN.md`,
  `12-RESEARCH-EVIDENCE-UI.md`
- `frontend/components/console/console-view.tsx`, `frontend/hooks/use-event-stream.ts`,
  `frontend/components/agent-pipeline.tsx`, `frontend/components/result-experience.tsx`,
  `frontend/lib/presentation.ts`, `frontend/lib/types.ts`, `frontend/app/globals.css`,
  `backend/core/schemas.py`

---

## 8. If you only do eight things

1. Kill the 1400px dashboard shell and make the turn the unit: prose at 720px, ledger and evidence at
   896px, composer at 768px.
2. Render evidence passages **as they retrieve**, before any answer text exists — status line reading
   `Retrieving`, then `N passages above threshold`.
3. Ship the collapsed stage ledger inside the assistant turn: 11 fixed rows, auto-open while live,
   auto-collapse to a glyph strip on settle. It must be legible enough that nobody misses it on a
   fast scroll.
4. Replace one `skipped` state with four — `skipped`, `blocked`, `denied`, `incomplete` — and draw
   them differently. **No AI product has this. It is our differentiation, and CI already solved it.**
5. Give a policy-denied turn its own shape — shield, monospace policy tag, alternatives — keep all 11
   ledger rows with `not reached` where nothing ran, and **let it arrive in under two seconds with no
   ceremony** (§5.5).
6. Delete `progressPercent`. No product in this study ships a percentage bar for an agent run.
   Replace it with counts that include `skipped` and `denied`, and an elapsed timer that separates
   worked time from held time.
7. Make every citation a click target that jumps a document viewer to `p. N` with the region
   highlighted, and never let a citation chip appear before stage 08 has produced its verdict.
8. Render the failed checks, the contradicting evidence and `VerificationReport.limitations[]` beside
   the passing ones. A panel of green ticks measurably increases acceptance without increasing
   discrimination (§2.20).
