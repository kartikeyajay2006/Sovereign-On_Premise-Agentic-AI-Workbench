# 12 — Research: Evidence, Provenance, Timeline & Audit UI

**Agent beat:** data-dense inspection, provenance, diffing, timelines, audit.
**Target repo:** `~/dev/aegis` (Next 16 / React 19 / Tailwind v4, warm-paper palette,
`--radius: 4px`, Geist Sans + Geist Mono, four status colours at
`frontend/app/globals.css:36-39`).
**Date of research:** 2026-09-21.

---

## 0. Method and honesty note

Everything below is tagged for provenance, because a research document about provenance
that fakes its own would be embarrassing:

- **[FETCHED]** — I fetched and read the page. Quotes and numbers come from it.
- **[SNIPPET]** — I only saw a search-result summary of the page, not the page itself.
  Treat specifics as directionally right, verify before you implement against an API.
- **[MEMORY]** — I am reasoning from prior knowledge of the product, not from a page
  I read today. No numbers are given for these. Verify anything load-bearing.

**Pages that would not give me what I wanted:**
`docs.datadoghq.com/tracing/glossary/` returned no UI detail [FETCHED, empty];
`honeycomb.io/platform/bubbleup` is a marketing page with no layout detail [FETCHED, empty];
`carbondesignsystem.com/patterns/status-indicator-pattern/` and
`carbondesignsystem.com/components/data-table/style/` both truncated in the fetcher — I got
the Carbon table numbers instead from the source `.mdx` on raw.githubusercontent.com [FETCHED];
`annotorious.dev/guides/osd-quick-start/` 404s, only the homepage resolved [FETCHED].

**I have invented no pixel values.** Every number in this document is either (a) quoted
from a page I fetched, (b) already in the AEGIS repo, or (c) explicitly labelled as my
recommendation with the reasoning attached.

---

## 1. Shortlist — the 10 most transferable references

Ordered by how much of it we should actually steal.

| # | Reference | What specifically we take |
|---|---|---|
| 1 | **C2PA UX Recommendations** ([spec.c2pa.org](https://spec.c2pa.org/specifications/specifications/2.0/ux/UX_Recommendations.html)) | The **L1/L2/L3/L4 disclosure ladder** for provenance, and — more important — the rule that the UI *presents the record, it does not adjudicate truth*. This is the single most important reference in this document for AEGIS. It is a standards body that already argued out "how do you show provenance without implying trustworthiness", which is exactly the question a judge will ask. |
| 2 | **Temporal Workflow UI** ([design writeup](https://temporal.io/blog/the-dark-magic-of-workflow-exploration), [timeline view](https://temporal.io/blog/lets-visualize-a-workflow)) | The **Event Group** abstraction (N raw events collapse into 1 meaningful row), the dual **Compact / Timeline** toggle, and the *dashed-animated-line = pending* idiom. Closest structural analogue to our 11-stage pipeline that exists in a shipped product. |
| 3 | **Honeycomb Trace Waterfall** ([docs](https://docs.honeycomb.io/reference/honeycomb-ui/query/trace-waterfall)) | Four-region layout (identification / summary / waterfall / collapsible right sidebar), the **dependent-span count box** on parent rows, the **Minigraph** in the sidebar that puts the selected span in distributional context, and the `Highlight errors` toggle. |
| 4 | **Chrome DevTools Performance panel** ([reference](https://developer.chrome.com/docs/devtools/performance/reference)) | **Nested breadcrumbs for zoom** — the only good answer to "how do you not lose the user three levels down" in a timeline. Plus: select-an-event → dim everything else; Summary / Bottom-up / Call Tree as three views of one selection; connector arrows from initiator to request. |
| 5 | **Hypothesis fuzzy anchoring** ([blog](https://web.hypothes.is/blog/fuzzy-anchoring/)) + **MDN Text Fragments** ([docs](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments)) | The **three-selector citation record** (range / position / quote-with-32-char-context) and the four-strategy re-anchor cascade. This is how an AEGIS citation survives a document being re-parsed, and how it degrades honestly when it doesn't. |
| 6 | **Relativity document review** ([docs](https://help.relativity.com/RelativityOne/Content/Solutions/Reviewing_documents_in_Relativity.htm)) | The **legal-grade** review workspace: viewer + coding card + related-items card + history card, persistent highlight sets, and `Go To Next/Previous Highlight` traversal. Judges from a regulated industry recognise this shape; it signals "this was built by people who have done discovery". |
| 7 | **Perplexity citation UI** ([teardown](https://aiuxplayground.com/teardowns/perplexity/citations/)) + **AI citation pattern survey** ([aydesign](https://www.aydesign.ai/blog/ai-citation-source-ui-patterns-2026)) | The inline chip + anchored popover + source rail triad — *and the documented critique of it*. We take the chip and popover; we deliberately reject parts (see §6). |
| 8 | **Carbon data table** ([style.mdx source](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/data-table/style.mdx)) + **EUI DataGrid** ([docs](https://eui.elastic.co/docs/components/data-grid/)) + **Matt Ström on tables** ([essay](https://mattstromawn.com/writing/tables/)) | Concrete density numbers, virtualization strategy, forced truncation + cell popover, and the alignment/tabular-figures discipline for our audit ledger. |
| 9 | **PatternFly status & severity** ([pattern](https://www.patternfly.org/patterns/status-and-severity/)) | The status-vs-severity split, "status icons require text labels and should never communicate severity alone", and the anti-rainbow rule for tables: 3–6 icons ordered most→least severe with counts. |
| 10 | **Smashing: Designing Stable Interfaces For Streaming Content** ([article](https://www.smashingmagazine.com/2026/05/designing-stable-interfaces-streaming-content/)) | The concrete anti-jitter mechanics for our SSE pipeline: 60px scroll-intent threshold, rAF-batched flush, extend-the-text-node instead of rebuilding, `role="log"` + `aria-live="polite"` + `aria-atomic="false"`, and `prefers-reduced-motion` behaviour. |

**Honourable mentions** used in specific sections below: OpenSeadragon `svg-overlay`,
PDF.js viewport coordinate conversion, Sentry breadcrumbs, GitHub PR "Files changed",
Airflow Grid view, Datasette facets, AWS IAM Policy Simulator, Dagster run details.

---

## 2. Per-reference breakdown

### 2.1 C2PA Content Credentials — UX Recommendations `[FETCHED]`
<https://spec.c2pa.org/specifications/specifications/2.0/ux/UX_Recommendations.html>

**Status vocabulary / disclosure depth.** Four levels, explicitly defined:

- **L1** — "An indication that C2PA data is present and its cryptographic validation status."
  One mark. Presence + validity. Nothing else.
- **L2** — "A summary of C2PA data available for a given asset." Mandatory fields:
  **signing entity, claim generator, date**. Recommended: manifest thumbnail, signer logo,
  link to L3.
- **L3** — "A detailed display of all relevant provenance data", full manifest inspection.
- **L4** — forensic: "all the granular detail of signatures and trust signals."

**Citation & provenance.** The L1 mark is a fixed glyph ("cr" in an outlined circle with a
90° corner) that may not be modified. The spec forbids: solid fills, drop shadows,
**status indicators overlaid on the characters**, and — critically — *"Do not add a valid
status, as the icon alone should already indicate the presence of a valid manifest."*

**Failure and incompleteness.** When a manifest is tampered with or signed by an untrusted
entity, *"no additional prior data can be displayed."* The recommended wording is
**"Content Credential unavailable or invalid"** — deliberately not attributing a cause. For
partial records: **"Some edits or activity may not have been recorded."**

**The governing principle** — and the sentence I would put on the wall of this project:
implementers should *"not attempt to determine the veracity of an asset for a user"* but
present the data transparently.

**Wording.** Consumer-facing labels over technical ones: "Content Credentials issued by"
not "signer"; assertions are called "Details" or "Information"; action codes are rendered
as human phrases ("Color or exposure edits").

> **Take for AEGIS:** our whole evidence/verification stack is a C2PA-shaped problem.
> Adopt the ladder wholesale (§5), adopt the no-veracity-verdict rule, adopt
> cause-agnostic failure wording, and adopt the "do not stack a validity badge on the
> provenance mark" prohibition — because we *will* be tempted to put a green tick on
> everything.

---

### 2.2 Temporal Workflow UI `[FETCHED]`
<https://temporal.io/blog/the-dark-magic-of-workflow-exploration> ·
<https://temporal.io/blog/lets-visualize-a-workflow>

**Timeline and trace design.** Three views over one history:

| View | What it encodes | Ignores |
|---|---|---|
| **Compact** | "a linear progression of Event Groups", left-to-right, logical order | clock time |
| **Timeline** | "clock-time durations as the length of each line connecting Events"; position conveys parallelism | — |
| **Full History** | every raw event including Workflow Tasks, in a "git tree" style | readability |

The **Event Group** is the key abstraction: `ActivityTaskScheduled` +
`ActivityTaskStarted` + `ActivityTaskCompleted` collapse into **one Activity row that spans
the duration of the activity**. Repeated identical event types "collapse under counted
headers."

**Visual language** — five channels, only one of which is hue:

- **Dots** = individual events (point-in-time things like Markers and Signals stay points,
  they never get a bar)
- **Lines** = relationship between events; **dashed + forward-animating = pending**
- **Icons** = category (Activity, Child Workflow, Command, Local Activity, Marker, Signal,
  Timer, Update, Workflow)
- **Colour** = outcome only: *"Red means failure, dashed red means retrying, dashed purple
  is pending, green means completion"*
- **Liveness** = real-time propagation across all views

Retries render as "a retry icon with the current attempt number."

**Inspector pattern.** Clicking an Event Group opens a summary detail. Child workflows open
their own timeline **inline, without navigating away** — the parent context is never lost.

**Interaction.** Pinch or `+/-` to zoom, a `Fit` button restores initial zoom. Hover gives
"exact start and end times as well as the duration up to the millisecond." An Event Type
filter in the history table controls Timeline visibility.

> **Take for AEGIS:** our 11 stages are Event Groups. A stage that emitted 14 SSE events
> is *one row* that spans the stage duration, expandable to the 14. Steal
> dashed-and-animating for `active`/`pending` and solid for terminal. Steal "point events
> stay points" — `audit` signing is a point, `retrieval` is a span. Steal the compact ⇄
> timeline toggle: compact for the demo narrative, timeline for the sceptic.

---

### 2.3 Honeycomb Trace Waterfall `[FETCHED]`
<https://docs.honeycomb.io/reference/honeycomb-ui/query/trace-waterfall>

**Layout — four regions:** trace identification (top) → trace summary → waterfall (main) →
**collapsible right sidebar** with span details.

**Timeline design.** Horizontal bars, width ∝ duration. Each row shows, "at a minimum, the
span's relationship, its name, and a representation of its duration." Spans with children
show **"a box with the number of dependent spans"** — so a collapsed parent still advertises
how much is hidden underneath it. Spans with no children have no box. Errors: *"Spans with
errors appear in red"*, plus a **`Highlight errors`** toggle in the summary that emphasises
them throughout.

**Inspector pattern.** Selecting a span highlights its row **in blue** and repopulates the
sidebar with its fields, span events and links. At the top of that sidebar is a
**Minigraph**: "a heatmap view of the selected span relative to others with the same fields
displayed in the waterfall" — i.e. the detail panel immediately tells you whether this span
is normal or an outlier, without a second query.

**Navigation.** Caret to collapse the summary, a `Reload Trace` button, and search for spans
containing a field or value name.

> **Take for AEGIS:** the dependent-count box is free information density — put
> `evidence ▸ 12` on a collapsed stage. The Minigraph is the best idea on this page and we
> have an exact analogue: when a claim is selected, show *how many other claims in this run
> got the same verdict*, so a single UNSUPPORTED reads as "1 of 14" rather than as an
> orphan. The `Highlight errors` toggle becomes `Highlight unsupported`.

---

### 2.4 Chrome DevTools Performance panel `[FETCHED]`
<https://developer.chrome.com/docs/devtools/performance/reference>

**Timeline design.** A **Timeline overview** (CPU + NET charts) sits above stacked tracks:
Main (flame chart), Network, Interactions, Layout shifts, Animations, GPU, Thread Pool.
X = time, Y = call stack depth.

**Duration encoding beyond bar length:** long tasks are marked "with a red triangle, and
with the part over 50 milliseconds shaded in red" — *the bar shows both the whole and the
offending portion of the whole*. Network bars use dark/light segments for request-sent vs
server-response vs content-download phases. Render-blocking requests carry a red triangle in
the upper-right corner. Connector arrows link initiator → request.

**Inspector pattern — the important one.** Users can "create multiple nested breadcrumbs in
succession, increasing zoom levels", and click a breadcrumb to jump back to any zoom level
without losing context. Selecting an event **highlights its trace region and dims the
others**. One selection feeds three tabs: **Summary**, **Bottom-up**, **Call Tree** (plus
Event Log), each sortable by Self Time / Total Time / Activity.

**Status vocabulary without hue proliferation:** green frame = on time, yellow-with-dashes =
partially presented, red = dropped, purple diamond = layout shift, clustered.

> **Take for AEGIS:** (a) nested breadcrumbs are our answer to depth —
> `Run 8f21 › evidence › EV-07 › page 14 › region`, each segment clickable, never a modal
> stack; (b) the two-tone bar: a stage bar that shows *total* and, inside it, the
> *verification* sub-portion, so "calculation took 4s of which verification was 3.1s" is
> visible without expanding; (c) dim-the-rest on selection beats highlight-the-one.

---

### 2.5 Hypothesis fuzzy anchoring + Text Fragments `[FETCHED]`
<https://web.hypothes.is/blog/fuzzy-anchoring/> ·
<https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments>

**Citation and provenance — the data model.** Hypothesis stores **three selectors per
annotation target**:

1. `RangeSelector` — XPath to a DOM element + character offsets
2. `TextPositionSelector` — "a pair of string offsets, marking the start and end of the
   selected text in the character string representing the whole document"
3. `TextQuoteSelector` — the exact selected text **plus 32-character context strings before
   and after**

Re-anchoring tries four strategies in order: range → position → **context-first fuzzy match**
(find prefix and suffix fuzzily, then verify the text between them) → text-only fuzzy match.
(The page does **not** describe the orphan-annotation UI; I know from memory that Hypothesis
surfaces failed anchors as "orphans" in a separate tab, but I did not verify that today
`[MEMORY]`.)

**Text Fragments** give the same idea a URL grammar:
`#:~:text=[prefix-,]textStart[,textEnd][,-suffix]`. Highlight is stylable via
`::target-text`. Limitations that matter to us: percent-encoding required (dashes as `%2D`),
case-insensitive, each of `textStart`/`textEnd`/`prefix`/`suffix` must sit wholly inside one
block-level element, **"if linked document text changes, fragments no longer match"**, main
frame only, user-initiated navigation only, feature-detect via `document.fragmentDirective`.

> **Take for AEGIS:** our `EvidenceItem` should carry a **selector triple**, not a page
> number. Page number is a display convenience; the quote-plus-context is the thing that
> survives re-ingestion of a revised P&ID datasheet. And when the cascade fails we must say
> so — an **orphaned citation** is a first-class state, not a silent fallback to page 1.
> This is the mechanism that lets us claim "revision-aware retrieval" in the roadmap and
> actually mean it.

---

### 2.6 Relativity document review `[FETCHED]`
<https://help.relativity.com/RelativityOne/Content/Solutions/Reviewing_documents_in_Relativity.htm>

**Inspector pattern.** The Review Interface composes a viewer with a **Coding card**, and a
**Related items and History cards** region. Layouts contain read-only fields, single-choice
fields (radio / dropdown) and multi-choice fields (checkbox). **Required fields carry an
orange asterisk.** Coding is explicitly modal: you *click Edit on the layout* before you can
change a decision.

**Overlay on imagery / document.** Page layout modes: **Single**, **Single Continuous**
(vertical stack), **Facing Continuous** (horizontal). Zoom persists across documents.
The toolbar is adaptive: "Relativity automatically hides toolbar buttons and controls that
are not applicable to the currently loaded document type."

**Highlight traversal.** A search bar plus **`Go To Next/Previous Highlight`** — "moves
through previous and next highlighted terms in the document." (Relativity's *persistent
highlight sets* — named, colour-coded, admin-configured term sets — I know from memory and
could not confirm on this page `[MEMORY]`.)

> **Take for AEGIS:** three things. (1) **Zoom persists across documents** — when a reviewer
> steps EV-07 → EV-08, do not reset the P&ID viewer. (2) **Adaptive toolbar** — the evidence
> viewer for a PDF and for a P&ID should not show each other's controls. (3) **Next/previous
> hit traversal with a counter** (`3 of 9`) is mandatory; scrolling to find your own
> highlight is a failure. Also steal the "click Edit to code" modality for approvals — an
> approval that can be changed by a stray click is not an approval.

---

### 2.7 Perplexity citations + the 2026 AI-citation pattern survey `[FETCHED]`
<https://aiuxplayground.com/teardowns/perplexity/citations/> ·
<https://www.aydesign.ai/blog/ai-citation-source-ui-patterns-2026>

**Citation affordance.** Perplexity uses **rounded chips carrying a publisher domain plus a
`+N` overflow count** ("northjersey +3") at the end of a claim — not bare superscript
numbers. Clicking opens an **inline popover anchored to the chip**, with favicon, domain,
title, snippet, and a **position indicator (`1/2`)** for stepping through the sources behind
that one chip. A collapsible **sources sidebar** opens from the answer bar with a favicon
stack + count ("10 sources"); each card repeats favicon / URL / title / snippet / thumbnail.
A **Links tab** sits as a peer to Answer and Images. Research steps ("Searching the web",
"Checking current predictions") appear **collapsed above the answer**.

**The teardown's own critique** — worth more than the pattern: *three overlapping paths to
sources (popover, sidebar, Links tab) may confuse new users*; domain abbreviations are
locale-hostile; the full source list stays hidden behind favicon truncation.

**The survey's seven patterns** [FETCHED]: inline numbered citation + hover preview;
source-card sidebar; **claim-level attribution** (Notion AI Q&A, Harvey — sentence
granularity, not paragraph); **deep-link to source passage** (Notion, Glean, ChatPDF — scroll
to exact passage via offsets or text-fragment URLs); **confidence/citation-strength
indicators** (Consensus "strong support" / "mixed evidence"; scite.ai citation context);
source filtering/trust controls; and **"citation graveyard"** — unsourced claims get a visible
**"no source" badge instead of blending in**.

**Anti-patterns it names:** footnote dumps at the end of the answer, and paragraph-level
citation that "masks unsourced inferences as evidence-backed claims."

**Research corroboration** `[FETCHED]` — arXiv 2512.12207 compared collapsible lists, hover
cards, footer lists and sidebars: high-visibility designs increased *hovering* but clicking
stayed low across all conditions; high-visibility interfaces **initially reduced** knowledge
gain and interest, reversing only as users actually engaged; sidebar drew the most visual
attention and uniquely shifted agreement. Conclusion: *"source presentation alone may not
enhance engagement and can even reduce it when insufficient sources are provided."*

> **Take for AEGIS:** claim-level, not paragraph-level. Chips that carry the **document
> name**, not an opaque number — `[ISO-10628 §4.2 +2]` is better than `[3]`. The
> popover's `1/2` stepper is exactly right for a claim with two conflicting sources. And
> take the **citation graveyard**: an AEGIS deliverable must visibly badge unsourced
> sentences. See §6 for what we reject.

---

### 2.8 Tables at density — Carbon + EUI + Ström `[FETCHED]`
<https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/data-table/style.mdx> ·
<https://eui.elastic.co/docs/components/data-grid/> ·
<https://mattstromawn.com/writing/tables/>

**Carbon's measured spec** (from the source `.mdx`, so these are real):

| Size | Row height |
|---|---|
| xs | 24px / 1.5rem |
| sm | 32px / 2rem |
| md | 40px / 2.5rem |
| lg | 48px / 3rem |
| xl | 64px / 4rem |

Padding: 16px (`$spacing-05`) left/right on the table header and between columns; 8px
(`$spacing-03`) around the sort icon; expanded panel is 16px top/right, **48px left**, 24px
bottom. Type: column header `$heading-compact-01` (14px, SemiBold 600); row text
`$body-compact-01` (14px, Regular 400). Rows use `$border-subtle` bottom borders; the "zebra"
state uses `$layer-accent` on alternating rows. Text is vertically centred except xl, which
offsets `padding-top: 16px` for two-line content. Column header row size must always match
the body row size.

**EUI DataGrid** — the engineering answers:

- Virtualized on **react-window**; tunable via `virtualizationOptions`
  (`overscanRowCount`, `overscanColumnCount`, `estimatedRowHeight`, scroll callbacks).
- *"Unlike tables, the data grid **forces truncation**."* Overflow is resolved by a **cell
  popover** (`renderCellPopover`), which by default wraps the value in `EuiText` and puts
  cell actions in an `EuiPopoverFooter`.
- Density and row height are **user controls in a toolbar**
  (`toolbarVisibility.showDisplaySelector.allowDensity`), adjusting `fontSize` and
  `cellPadding`; `rowHeightsOptions` supports line counts, pixel values, and auto.
- Per-column header `actions` (sort / move / hide, extensible), optional
  `renderFooterCellValue` footer row, fullscreen toggle, optional pagination.
- Choose a data grid over a table "when there are many columns, the data in those columns is
  fairly uniform, and when schemas and sorting are important for comparison" — which
  describes our audit log exactly.

**Ström's discipline:** numerical right-aligned, textual left-aligned, headers aligned with
their data, never centre. **Tabular lining figures** (monospace as fallback). Consistent
decimal places per column. Horizontal rules sparingly; **he is against zebra striping**.
Backgrounds only to mark a domain shift (e.g. a sum row). Keep tables monochromatic —
"colour creates accessibility issues and misinterpretation risk"; use symbols (✻, †, ▵)
instead. Headers as short as possible; units stated once, at the first data point.

**Faceting** — Datasette `[FETCHED]` <https://docs.datasette.io/en/stable/facets.html>:
facets are grouped summaries with per-value counts; selecting a value filters, and the JSON
carries a `toggle_url` per value so on/off is a link, not state. Facets are **suggested
automatically** when a column returns ≤30 distinct options, >1 distinct value, fewer options
than rows, **and the query completes in under 50ms**. Default facet size 30, raisable to 100,
capped by `max_returned_rows` (default 1000); responses carry a `truncated` flag.

> **Take for AEGIS:** xs/24px is too tight for a 4px-radius instrument panel with Geist;
> **use sm/32px as the audit-log default with an xs/24px "compact" toggle**, header row
> matching. Follow Ström over Carbon on zebra: **rules, not stripes** — our warm-paper
> surfaces (`#f7f7f5` / `#ffffff`) are already a two-tone system and striping would fight
> the `--surface-sunken` selection state that `evidence-drawer.tsx:64` already uses.
> `font-variant-numeric: tabular-nums` on every numeric column, or just `--font-mono`
> (Geist Mono is already loaded at `globals.css:64`). Adopt EUI's **forced truncation + cell
> popover** — an audit log cell containing a 64-char hash must truncate and expand, never
> wrap. Adopt Datasette's **50ms rule** as an honesty constraint: if a facet count can't be
> computed fast, don't show a fake one.

---

### 2.9 PatternFly status & severity `[FETCHED]`
<https://www.patternfly.org/patterns/status-and-severity/>

Five statuses (danger, warning, success, info, custom) and **seven severities** (critical,
important, moderate, minor, none, undefined) held deliberately apart:
*"Status refers to the current state of a connected data source, system, or similar object"*
while severity indicates *"how critical an identified issue is."* They are not
interchangeable.

Two rules we need:

1. **"Status icons require text labels or additional context and should never communicate
   severity alone."**
2. For aggregated data, **use 3–6 icons arranged most→least severe paired with counts** —
   explicitly to avoid rainbow overload in tables.

Corroborating `[SNIPPET]`: WCAG's don't-use-colour-alone, and the standard three-channel
remedy — colour + **shape** (checkmark / X / triangle / circle are distinguishable by
silhouette) + text. See <https://www.patternfly.org/patterns/status-and-severity/> and
<https://carbondesignsystem.com/patterns/status-indicator-pattern/>.

> **Take for AEGIS:** we have 4 hues and 5 verdicts. That arithmetic is the whole problem
> and PatternFly hands us the answer: **VERIFIED / SUPPORTED / UNSUPPORTED / CONFLICTED /
> NEEDS_REVIEW is a severity scale, not a status palette.** Encode it as a fixed-order
> row of five glyph slots with counts (`✓3 ·2 ✗1 ⇄1 ?0`), and let colour carry only the
> two extremes. Full scheme in §4.

---

### 2.10 Streaming without jitter `[FETCHED]`
<https://www.smashingmagazine.com/2026/05/designing-stable-interfaces-streaming-content/>

Concrete mechanics:

- **Scroll intent threshold:** `const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
  userScrolled = gap > 60;` — a 60px buffer so a small layout change doesn't cancel
  auto-follow.
- **Don't rebuild nodes.** "For a regular character, we extend the text node by one
  character. The browser doesn't need to recalculate the layout for that; the text grew, but
  nothing moved."
- **Batch with `requestAnimationFrame`.** Buffer arrivals, flush once per frame: "All the
  characters that arrive after the last frame are then rendered together, right before the
  browser paints them." Separate *data arrival* timing from *UI update* timing.
- **A11y:** `aria-live="polite"` + `aria-atomic="false"` on the container; `role="log"` on
  streaming regions; under `prefers-reduced-motion: reduce` render the full response instantly
  and `animation: none` on the cursor.
- **Edge cases:** clear pending buffers on stop, remove cursors cleanly, reset `userScrolled`
  on a new stream, stop the current stream before starting another.

Complementary live-tail conventions `[SNIPPET]`: scrolling up pauses auto-scroll while the
stream keeps running; the Pause control becomes a **"Jump to Bottom"** affordance; a bottom
status banner ("Streaming new entries" / "Go to tail"); ring buffers to cap memory.
(Sumo Logic, Logz.io, elastic/kibana#44923.)

> **Take for AEGIS:** `hooks/use-event-stream.ts` currently calls `setLastEvent` **per
> message** (`hooks/use-event-stream.ts:47`) — one React render per SSE event, unbatched.
> That is the jitter source. Buffer into a ref, flush on rAF. And the 11-stage timeline
> must **reserve all 11 rows from t=0** (they exist as `pending`), so arriving events change
> a row's state rather than growing the list — zero layout shift by construction. That is a
> better fix than any animation.

---

### 2.11 Supporting references — shorter notes

**Sentry breadcrumbs** `[FETCHED]` <https://docs.sentry.io/product/issues/issue-details/breadcrumbs/>
Row anatomy: **type** (each type has its own colour/icon), **category** (e.g. `auth`),
**message** ("displayed as text with all whitespace preserved"), **data** as key-value pairs,
**level** on a five-value scale — *"fatal, error, warning, info, and debug, in order of
severity"* — and a timestamp that toggles **absolute (user timezone / 24h preference) or
relative to the first breadcrumb**. The issue page shows a *preview* of a few breadcrumbs;
**"View All" opens a slide-out drawer** with search (matches type, category, message, data),
filter (type, level), sort (newest/oldest), and the absolute/relative toggle. Sentry
explicitly **removed the inner scroll** in favour of that drawer `[SNIPPET]`.
Trace-waterfall changelog `[FETCHED]` adds: standalone spans are now visible, the span
details panel shows "a clear set of attributes that you can search in the Trace Explorer",
and logs can be viewed for the whole trace or one span.
→ *Take:* the **relative/absolute timestamp toggle** is non-negotiable for a live pipeline —
`+1.4s` while running, wall-clock in the audit export. And **no inner scroll**: preview N,
then a drawer.

**GitHub "Files changed"** `[FETCHED]`
<https://github.blog/changelog/2026-01-22-improved-pull-request-files-changed-page-on-by-default/>
Resizable file tree with **indicators for files that have comments, errors and warnings**;
an **Overview panel** so the PR description is readable without leaving the diff; pending
comments surfaced in the review-submission panel before you submit; split ⇄ unified switching
**without a full page refresh**; experimental **virtualization** for large PRs; keyboard
navigation, screen-reader landmarks, **increased line-spacing options**; filterable comment
side panel. Blame view `[FETCHED]`: line-by-line history "separated by commit. Each commit
lists the author, commit description, and commit date", a **versions icon** to "see versions
of a file before a particular commit", and a banner when `.git-blame-ignore-revs` hides
commits. (GitHub's split-diff announcement gives **no rationale** for split vs unified —
I fetched it and it only documents the toggle. Any "split is better for X" claim you have
heard, including from me, is folklore.)
→ *Take:* **counts on the tree, not just on the file** — our evidence tree should badge
`3 unsupported` at the folder level. And the `.git-blame-ignore-revs` banner is a lovely
honesty pattern: *when the view is hiding something, the view says so.*

**Airflow Grid view** `[FETCHED]` <https://airflow.apache.org/docs/apache-airflow/stable/ui.html>
"Each row represents a task, and each column represents a Dag run"; colour-coded state;
hover for detail, click to "drill down into logs and metadata"; a **mini Gantt-style timeline
per row**; states named include success, failed, **upstream failed**, **skipped**, retried.
`[SNIPPET]` adds that when a day holds multiple runs in different states the square shows
"the average state for the day, on a color gradient between green and red."
→ *Take:* **`upstream_failed` as a distinct state from `failed`** is exactly what our
pipeline needs — if `policy` denies, stages 5–10 are not *failed*, they are *not reached*.
Our `StageStatus` at `lib/types.ts:64` has `skipped` but no `blocked`/`upstream_failed`; that
distinction is the difference between "the system broke" and "the system correctly stopped",
which is the single most important thing our demo must communicate.
The gradient-average square is a pattern to **reject** (§6).

**Dagster run details** `[FETCHED]` <https://docs.dagster.io/guides/operate/webserver>
"The upper left pane contains a Gantt chart, indicating how long each asset or op took to
execute", alongside timing, errors and logs. Two log classes side by side: **structured logs**
("enriched and categorized with metadata… a label of which asset a log is about, links to an
asset's metadata, and what type of event it is") and raw stdout/stderr compute logs,
toggleable and downloadable.
→ *Take:* the **structured / raw toggle** is the honest way to show an audit log. Structured
for humans, raw for the sceptic, same data, one click apart, and the raw one is downloadable.

**AWS IAM Policy Simulator** `[SNIPPET]`
<https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html>
Each result row shows allowed / **implicitly denied** / **explicitly denied** plus a short
explanation; a **"List contributing statements"** link reveals the responsible statement and
**"Show statement"** displays it. Only statements that *contributed to the reported decision*
are included; when an explicit deny wins, **the deny statement is the only entry returned**.
Notably, the simulator **refuses to surface SCP evaluation detail for security reasons** —
and says so.
→ *Take:* this is our Policy Decision Explorer, almost verbatim. Three-valued outcome
(allow / implicit deny / explicit deny) beats two. Show **only the deciding rule by default**,
with "show all evaluated rules" as a deliberate expansion. And when we withhold something,
say we are withholding it.

**Kibana Discover** `[SNIPPET]`
<https://www.elastic.co/docs/explore-analyze/discover/discover-get-started>
Field sidebar listing all available fields with the currently selected ones as columns;
expand-arrow on each row opens the full field table; a **Summary column** with fallback logic
(first field with a value, descending priority); an optional **RAW/JSON collapsible-tree**
rendering with objects/arrays collapsed by default; display-density control.
→ *Take:* the **summary column with explicit fallback order** is right for our audit ledger —
one column that shows the most meaningful available field, with the rule documented rather
than magic.

**Proxyman / Charles** `[SNIPPET]` <https://proxyman.com/>
Proxyman can hold **two traffic views open in the same tab, each with its own filters,
selected request and inspector, both fed by the same live capture**. Charles shows request
and response combined in one split panel.
→ *Take:* two independently-filtered panes over one stream is the correct shape for our
**conflicting-sources** view (§4) and for comparing two candidate models in the routing
explorer.

**OpenSeadragon `svg-overlay`** `[SNIPPET]`
<https://openseadragon.github.io/svg-overlay/> ·
<https://openseadragon.github.io/examples/viewport-coordinates/>
The plugin returns **an SVG `<g>` element**; you add your shapes to it in **viewport
coordinates**, and "as the user zooms and pans, the `g` element will transform to match."
Viewport coordinates are a neutral space: a single image spans x ∈ [0, 1], with y bounded by
aspect ratio. `Overlay.getBounds()` returns bounds in viewport coordinates; conversion
helpers exist between image / viewport / web coordinates.
→ *Take:* **one transformed `<g>`, not N absolutely-positioned divs.** This is the entire
answer to "how do bounding boxes stay aligned during zoom/pan" and it is one DOM node.
Store P&ID boxes in image coordinates, convert once to viewport coordinates, never touch
them again during interaction.

**PDF.js highlight geometry** `[SNIPPET]`
<https://www.nutrient.io/blog/pdfjs-text-highlight-annotations/>
`Range.getClientRects()` returns **multiple rects** for a selection spanning lines, in
*viewport* coordinates. Subtract `canvasWrapper.getBoundingClientRect()` and divide by
`scale` to get page-relative coordinates; store in PDF user space via
`viewport.convertToPdfPoint` (PDF user space has its origin bottom-left with a bottom-up Y
axis); render via `viewport.convertToViewportRectangle()`, which also accounts for current
scale and page rotation. Highlights are appended to **an overlay div anchored to the canvas**,
not positioned against the document body, "so they stay aligned during scrolling and zoom."
→ *Take:* a cited region is an **array of rects**, not a rect. A three-line quote that wraps
produces three boxes and must render as three boxes; a single bounding box around all three
silently claims territory the citation does not cover.

---

## 3. Patterns worth stealing — 30 implementable instructions

Each is one change, attributed. Ordered roughly by value per hour.

1. **Render all 11 stages as `pending` rows at t=0**; SSE events mutate rows, never append
   them. Zero layout shift by construction. *(Smashing; our own `StageStatus` already has
   `pending` at `lib/types.ts:64`.)*
2. **Buffer SSE into a ref and flush on `requestAnimationFrame`**, not `setState` per
   message. *(Smashing — fixes `hooks/use-event-stream.ts:47`.)*
3. **Collapse N raw events per stage into one Event Group row** spanning the stage duration,
   expandable to the raw events. *(Temporal.)*
4. **Dashed + slowly animating stroke = in-flight; solid = terminal.** Never spin a spinner
   for a stage that is actually waiting on a human. *(Temporal.)*
5. **Point events stay points, spans get bars.** `audit` signing is a dot; `retrieval` is a
   bar. *(Temporal.)*
6. **Add `blocked` / `upstream_not_reached` to `StageStatus`**, rendered as a hollow row with
   a rule through it — visually distinct from both `failed` and `skipped`. *(Airflow's
   `upstream_failed`.)*
7. **Put a dependent-count box on every collapsed row**: `evidence ▸ 12`, `retrieval ▸ 47`.
   *(Honeycomb.)*
8. **Two-tone stage bars**: full width = stage duration, inner darker segment = verification
   time inside it. *(Chrome DevTools' >50ms shading.)*
9. **Nested clickable breadcrumbs for depth**, not stacked modals:
   `Run 8f21 › evidence › EV-07 › p.14 › region 2`. *(Chrome DevTools.)*
10. **Selecting anything dims everything else** rather than brightening the selection.
    *(Chrome DevTools.)*
11. **One selection, three tabs.** A selected claim shows Summary / Sources / Raw — same
    object, three depths, no navigation. *(Chrome DevTools; Dagster structured-vs-raw.)*
12. **Relative timestamps while live, absolute in export**, with a user toggle.
    *(Sentry breadcrumbs.)*
13. **No inner scroll regions.** Show N, then "View all" opens a drawer with search + filter +
    sort. *(Sentry — they removed the inner scroll deliberately.)*
14. **Store every citation as a selector triple** (range + position + quote-with-32-char-
    context), not a page number. *(Hypothesis.)*
15. **Make orphaned citations a visible state.** If re-anchoring falls through all four
    strategies, the chip says so; it does not point at page 1. *(Hypothesis + C2PA's
    "some activity may not have been recorded".)*
16. **A cited region is an array of rects, not one rect.** Wrapped quotes draw multiple
    boxes. *(PDF.js.)*
17. **Draw P&ID overlays into a single transformed SVG `<g>` in viewport coordinates.**
    *(OpenSeadragon svg-overlay.)*
18. **Zoom and pan persist when stepping between evidence items.** *(Relativity.)*
19. **`Next / Previous hit` with an `n of m` counter** in every document viewer.
    *(Relativity.)*
20. **Adaptive toolbar:** hide controls that don't apply to the loaded artifact type.
    *(Relativity.)*
21. **Citation chips carry the source's short name plus `+N`**, not an opaque number:
    `[P-101 datasheet +2]`. *(Perplexity.)*
22. **The chip popover has a `1 / 2` stepper** when a claim has multiple sources — which is
    also the entry point to the conflict view. *(Perplexity.)*
23. **Badge unsourced sentences explicitly** in the deliverable. *(The "citation graveyard"
    pattern.)*
24. **Claim-level attribution, never paragraph-level.** *(Survey's named anti-pattern.)*
25. **Audit-log rows at 32px with a 24px compact toggle**, header row matching body size.
    *(Carbon's sm/xs.)*
26. **Rules, not zebra stripes**; monochrome table; reserve background changes for domain
    shifts like a totals row. *(Ström, against Carbon.)*
27. **`font-variant-numeric: tabular-nums` (or Geist Mono) on every numeric and hash column,
    right-aligned, fixed decimal places.** *(Ström.)*
28. **Force truncation + cell popover for long values** (hashes, model IDs); never wrap,
    never let one cell change the row height. *(EUI DataGrid.)*
29. **Virtualize the audit log with `overscanRowCount` and `estimatedRowHeight`** rather than
    paginating; pagination hides "how much is there". *(EUI / react-window.)*
30. **Facets are only shown when they can be counted quickly** — Datasette's 50ms rule — and
    a truncated facet says `truncated`. *(Datasette.)*
31. **Show only the deciding policy rule by default**, with "show all evaluated rules" as an
    explicit expansion; when an explicit deny wins, show the deny alone. *(IAM Policy
    Simulator.)*
32. **Three-valued policy outcome: allow / implicit deny / explicit deny.** Absence of a
    permitting rule is not the same event as a prohibition. *(IAM.)*
33. **When the view hides something, the view says so** — a banner, not silence.
    *(GitHub's `.git-blame-ignore-revs` banner; IAM's SCP disclosure.)*
34. **Roll counts up the tree**: the evidence folder badges `3 unsupported` before you open
    it. *(GitHub file tree indicators.)*
35. **Two independently-filtered panes over one live stream** for side-by-side comparison.
    *(Proxyman.)*
36. **`role="log"` + `aria-live="polite"` + `aria-atomic="false"` on the pipeline; under
    `prefers-reduced-motion` render final state instantly.** *(Smashing.)*

---

## 4. Status vocabulary: 4 colours, 5 verdicts, 6 stage states

We have `--sovereign #16a34a`, `--active #0284c7`, `--approval #d97706`, `--critical #dc2626`
(`globals.css:36-39`) and `StageStatus = pending | active | done | failed | held | skipped`
(`lib/types.ts:64`), plus five verification verdicts. That is more meaning than hue can carry,
and PatternFly's rule applies: **status icons "should never communicate severity alone."**

**Proposal — hue is the scarcest channel, so spend it last.**

Four channels, applied in this priority order: **position → shape → weight → hue.**

| Verdict | Glyph (shape) | Type weight | Hue | Position in the fixed 5-slot row |
|---|---|---|---|---|
| `VERIFIED` | filled square ■ | SemiBold | `--sovereign` | 1 |
| `SUPPORTED` | hollow square □ | Regular | *none* (ink) | 2 |
| `NEEDS_REVIEW` | hollow diamond ◇ | Regular | `--approval` | 3 |
| `UNSUPPORTED` | hollow circle ○ | Regular | *none* (muted ink) | 4 |
| `CONFLICTED` | double chevron ⇄ | SemiBold | `--critical` | 5 |

Why this and not five colours:

- **Only the two extremes get hue.** `VERIFIED` and `CONFLICTED` are the two verdicts a judge
  must see across a room; the middle three are read, not glanced.
- **`SUPPORTED` deliberately has no colour.** It means "a source says so, nobody checked the
  arithmetic" — giving it green would be the exact overclaim C2PA warns against.
- **`UNSUPPORTED` is muted, not red.** Red implies "wrong". Unsupported means "we found
  nothing", which is an absence, and absences should read quiet. *(Compare IAM's implicit
  deny vs explicit deny.)*
- **Fixed slot order** means the summary strip `■3 □2 ◇1 ○1 ⇄1` is readable by position
  alone, at any size, in greyscale, and the shape of the strip is memorable across runs.
  *(PatternFly: 3–6 icons most→least severe, with counts.)*
- **Filled vs hollow** is the second channel: filled = we actively confirmed; hollow = we did
  not. That reads correctly even if the glyph is 8px.

**Stage states** reuse the same discipline, with the one addition from Airflow:

| State | Drawing |
|---|---|
| `pending` | hollow ring, ink-muted, dashed connector above |
| `active` | ring with animated dashed stroke, `--active` |
| `done` | filled dot, `--sovereign`, solid connector |
| `failed` | filled dot with an X, `--critical` |
| `held` | ring with a pause bar, `--approval` — **no pulse** (it is waiting on a person, not working) |
| `skipped` | hollow ring, ink-muted, connector drawn as a thin rule |
| `blocked` *(new)* | hollow ring with a strike-through connector, ink-muted, label `not reached` |

`components/agent-pipeline.tsx:8-16` already maps five states to four colours correctly.
The changes needed are: add `blocked`; drop the `shadow-[0_0_8px_...]` glow on `done` and
`failed` (`agent-pipeline.tsx:22,30`) — glow is decoration that adds a fifth visual weight
and fights the warm-paper restraint; and stop `animate-pulse` on `held`
(`agent-pipeline.tsx:36`), because pulsing communicates *activity* and `held` is the absence
of activity.

---

## 5. Screen → reference → the specific pattern

### 5.1 Pipeline timeline (11 stages, live SSE)
**Primary reference: Temporal Workflow UI.** Secondary: Chrome DevTools, Smashing.

- All 11 rows exist at t=0 in `pending`; events mutate, never append. Nothing reflows.
- Each stage is an **Event Group**: one row spanning its duration, with a dependent-count box
  (`evidence ▸ 12`) and an expander to the raw SSE events.
- **Compact ⇄ Timeline toggle.** Compact (logical order, equal-width steps) is the default —
  it is the demo narrative and it is stable while streaming. Timeline (width ∝ real duration)
  is one click away for the sceptic who asks "how long did verification actually take".
- Dashed animated connector above the active stage; solid behind; struck-through ahead of a
  `blocked` stage.
- Two-tone bars in Timeline mode: total duration, with the verification sub-segment darker.
- Relative timestamps (`+1.4s`) live; absolute on hover and in export.
- `role="log"`, `aria-live="polite"`, `aria-atomic="false"`; full state instantly under
  `prefers-reduced-motion`.

### 5.2 Evidence ledger (claim → file, page, region)
**Primary reference: Hypothesis + Text Fragments (data model), Perplexity (affordance).**

- `EvidenceItem` gains a **selector triple**: `{ quote, prefix, suffix, charStart, charEnd,
  pageRects[] }`. Page number is derived display, not the identity.
- Inline affordance: a **chip carrying the source short-name + `+N`**, monospace, 4px radius,
  1px border — it should look like a part number, not a footnote.
- Click opens an **anchored popover** with source name, location, the exact quote, and a
  `1 / N` stepper. "Open source" from the popover pushes the right-hand inspector, not a
  modal.
- **Orphan state** is first class: if all four re-anchor strategies fail, the chip renders
  hollow and the popover reads *"Quoted text not found in the current revision of this
  document"* — cause-agnostic, C2PA style.
- The existing `evidence-drawer.tsx` is the right skeleton but the wrong container: at
  `components/evidence-drawer.tsx:26-35` it is a `fixed inset-0` overlay drawer. For a
  workbench this should become a **persistent right rail** (Honeycomb's collapsible sidebar),
  because an overlay forces you to choose between reading the answer and reading the
  evidence, which is precisely the choice we do not want a judge to make.
- Keep the conscience comment at `evidence-drawer.tsx:48-50` verbatim. It is correct and it
  is the best-written thing in the frontend.

### 5.3 Claim-level verification (5 verdicts, conflicting sources side by side)
**Primary reference: Perplexity popover stepper + Proxyman dual-pane + §4 vocabulary.**

- Verdict strip at the top of the result: five fixed slots with counts, `■3 □2 ◇1 ○1 ⇄1`,
  each clickable as a filter. This is the Honeycomb `Highlight errors` toggle generalised.
- Every claim carries its verdict glyph **before** the sentence, in the left margin — position
  channel, so the eye can scan the margin alone.
- **CONFLICTED opens a two-pane comparison**, not a diff. Two independently scrollable panes
  over the same claim, each with its own source header (document, revision, date), the
  quoted region highlighted in each, and — this is the part that matters — **a middle column
  that names the axis of disagreement** (`Design pressure: 12 barg vs 10.5 barg`) rather than
  leaving the reader to spot it.
- Because two documents are not two versions of one document, **do not use a red/green
  add/remove diff**. See §6.
- Honeycomb's **Minigraph** idea: the verdict detail panel says "1 of 14 claims in this run
  carry this verdict" so a lone UNSUPPORTED reads as proportion, not as catastrophe.

### 5.4 Policy decision explorer
**Primary reference: AWS IAM Policy Simulator.**

- Three-valued outcome per request: **allowed / implicitly denied / explicitly denied**, each
  with a one-line explanation. The implicit/explicit split is the whole point: "no rule
  permitted this" is a different governance fact from "a rule prohibited this".
- **Show only the contributing rule(s) by default.** If an explicit deny won, show the deny
  alone — the IAM behaviour — with `Show all evaluated rules (14)` as an expansion.
- Each rule row: rule id (mono), the matched condition with the matching values highlighted
  inline, and the source YAML file + line from `policies/*.yaml`, click-through to the raw
  file with the line highlighted.
- If any part of the evaluation is withheld (e.g. a classification rule we won't print),
  **say it is withheld**, IAM-style. Silence is worse than refusal.

### 5.5 Model routing explorer
**Primary reference: Chrome DevTools Call Tree / Bottom-up + Honeycomb span detail.**

- A **candidate table**, not a graph. Columns: model, verdict (`selected` / `rejected` /
  `not eligible`), the deciding constraint, and the measured value vs the threshold.
  Right-aligned tabular numerals, one decimal place, consistent units per column.
- Selection reveals the full constraint evaluation for that model in the right rail; the
  other rows dim.
- **Rejections are the content, not the footnote.** Order the table by "how close did it come"
  so the near-misses sit adjacent to the winner. A routing explorer that lists only the winner
  explains nothing.
- Never draw a confidence bar for a routing score the router did not emit — the rule already
  enforced at `evidence-drawer.tsx:48`.

### 5.6 Append-only audit log with hash-chain verification
**Primary reference: EUI DataGrid + Carbon density + Dagster structured/raw toggle.**

- Virtualized grid, 32px rows (Carbon `sm`), 24px compact toggle, header row matching.
  Rules between rows, no zebra. Mono for hashes, timestamps and sequence numbers, right-
  aligned, forced truncation with a cell popover for the full hash.
- **Summary column with a documented fallback order** (Kibana Discover): the most meaningful
  available field per event type, with the precedence rule printed in the column header
  tooltip.
- Facets down the left (actor, stage, decision, task) with counts, Datasette-style, each a
  toggle link; facets that cannot be counted fast are not shown rather than shown wrong.
- **Chain verification is a per-row glyph plus a single run-level statement.** Per row: a link
  glyph that is filled when `hash(prev) == prev_hash` and hollow-with-break when it is not.
  Run level: one line — `247 entries · chain intact · verified 2026-09-21T10:04:11Z` — and a
  `Re-verify` button that recomputes client-side and re-renders. A chain that has *just been
  recomputed in front of the judge* is worth ten static green badges.
- Structured ⇄ raw toggle (Dagster), with the raw JSONL downloadable. The download is the
  proof artifact.
- A **break in the chain must not be a red row in a sea of green rows** — it should truncate
  the view with a banner (`Chain verification stopped at entry 118`) because after a break,
  everything below it is unverified and drawing it normally would be a lie.

### 5.7 P&ID viewer with bounding boxes and graph path highlighting
**Primary reference: OpenSeadragon `svg-overlay` + PDF.js coordinate conversion + Relativity viewer behaviour.**

- One OpenSeadragon viewer, one `svg-overlay` `<g>`. All boxes and path polylines are children
  of that `<g>`, authored in **viewport coordinates**; zoom/pan alignment is then free and
  correct at every scale, including during inertial pan.
- Store detections in **image coordinates** in the backend; convert once on load. Never store
  screen coordinates.
- Box styling: 1px stroke, no fill, 2px radius, plus a small tag label anchored to the
  top-left corner that hides below a zoom threshold (otherwise labels crowd at low zoom).
  Selected box: 2px stroke plus a 4px translucent halo — never a fill, because a fill hides
  the drawing underneath, which is the thing being inspected.
- **Path highlighting**: draw the graph path as a polyline in the same `<g>`, above the boxes,
  with the non-path region dimmed by a single translucent rect with the path punched out
  (`mask`), not by dimming every non-path element. One node, correct at all zooms.
- **Zoom persists when stepping between evidence items** (Relativity), with `Fit` to reset
  (Temporal's Fit button).
- `n of m` hit traversal across boxes, with keyboard `n` / `p`.
- Multi-rect citations: when a citation spans lines or symbols, draw **every** rect. Do not
  union them.

---

## 6. Beautiful patterns that would be WRONG for AEGIS

This is the section to read twice. Each of these is a pattern I admire and am telling you not
to use, because it asserts a confidence our backend cannot back.

1. **A similarity / confidence progress bar.**
   Beautiful, universal, and a lie unless the number is measured. The repo already refuses
   this at `components/evidence-drawer.tsx:48-50` and that refusal is correct. Extend the
   rule: no confidence bar on verdicts, no "97% verified", no routing-score meter. If the
   backend did not compute it, the row is omitted — not drawn at a flattering default.

2. **A green tick next to "Content Credentials"-style provenance.**
   C2PA is explicit: *"Do not add a valid status, as the icon alone should already indicate
   the presence of a valid manifest."* Stacking a validity badge on a provenance mark teaches
   users that the absence of a tick means invalid, when it usually means *unknown*. Our
   equivalent temptation is a green shield beside the sovereignty indicator. Don't.

3. **A single aggregate "trust score" for a run.**
   Consensus-style "strong support" badges work because they aggregate hundreds of independent
   papers. Our runs aggregate a handful of internal documents; one number would compress
   VERIFIED, CONFLICTED and UNSUPPORTED into a figure that no judge could audit and no
   engineer could defend under questioning. Use the five-slot count strip instead — it is the
   same glance, and it decomposes.

4. **Airflow's averaged-state colour gradient.**
   Airflow blends multiple runs in a day into "the average state… on a color gradient between
   green and red." That is fine for operational triage and catastrophic for evidence. There is
   no average of VERIFIED and CONFLICTED. Every verdict stays discrete.

5. **Red/green add-remove diff for two conflicting sources.**
   Google Docs suggestion mode (green underline insert, red strikethrough delete `[SNIPPET]`)
   and GitHub's split diff are gorgeous and *semantically wrong here*: they encode "this
   version superseded that one". Two conflicting P&ID datasheets have no before and after.
   Rendering one red implies it is the deletion, i.e. the wrong one — a judgement we have not
   made and often cannot make. Use a **neutral two-pane comparison with an explicit
   disagreement axis** instead, both panes styled identically.

6. **Perplexity's three overlapping paths to the same source.**
   The teardown itself calls this out: popover, sidebar, and a Links tab all lead to the same
   sources and confuse new users. In a 6-minute judged demo, three routes to one place is
   three chances to click the wrong one. Ship **one** path: chip → popover → inspector rail.

7. **Hover-only source previews.**
   arXiv 2512.12207 found clicking stayed low across all source presentations and that high
   visibility alone did not improve engagement. More practically: hover doesn't exist on a
   projector, on a touchscreen, or when someone else is driving. Every hover affordance must
   have a click equivalent and a keyboard equivalent.

8. **Typewriter / token-by-token streaming of the answer.**
   It reads as "AI is thinking" theatre. AEGIS's whole claim is that the interesting streaming
   object is the *pipeline*, not the prose. Stream stage transitions; render the deliverable
   when it is complete and verified. Streaming an answer that has not yet been claim-verified
   shows the judge unverified text and then retroactively badges it — the worst possible order
   of operations for a product about verification. (The Smashing techniques still apply to the
   stage feed.)

9. **Glow, pulse and drop shadows on status markers.**
   `components/agent-pipeline.tsx:22,30` puts `shadow-[0_0_8px_...]` on done/failed markers and
   `animate-pulse` on `held`. Glow adds a visual weight channel that competes with the shape
   and weight channels §4 depends on, and pulsing `held` implies work is happening when the
   system is idle awaiting a human. Remove both. The warm-paper Swiss language earns
   credibility by not glowing.

10. **Honeycomb's BubbleUp as a pattern to imitate.**
    It is the best idea in observability and it does not belong here. BubbleUp answers "what
    is statistically different about this selection" — it needs thousands of events and it
    outputs correlations, not causes. On a single run with 11 stages it would produce
    confident-looking histograms over n≈1. Take the *Minigraph* (put one item in the context
    of its peers) and leave the rest.

11. **Infinite scroll on the audit log.**
    Virtualize, yes; but keep a visible total (`247 entries`) and a scrollbar that reflects it.
    An append-only ledger whose length you cannot see is not obviously append-only.

12. **Skeleton shimmer placeholders for pipeline stages.**
    Skeletons imply "content is coming". A stage that has not run yet may never run — if
    `policy` denies, stages 5–10 are `blocked` forever. A shimmering skeleton would promise a
    result the system has correctly decided not to produce. Render `pending` as a real, quiet,
    empty row.

---

## 7. What I would cut

- The dual Compact/Timeline toggle can ship Compact-only for the first pass; Timeline is the
  second-day feature. Compact alone is defensible; a jittery Timeline is not.
- Full Hypothesis four-strategy re-anchoring is overkill for v1. Ship selectors 2 and 3
  (position + quote-with-context) and the orphan state. The XPath range selector buys little
  on re-parsed PDFs.
- Faceting on the audit log can be three fixed facets (actor / stage / decision) rather than
  Datasette-style suggested facets. Suggestion needs the 50ms budget machinery to be honest.
- The L4 forensic level of the provenance ladder is the raw JSON download. Do not build a
  fourth UI for it.

---

## 8. Cross-agent dependencies

- `DEPENDS-ON: backend-evidence` — `EvidenceItem` must carry the **selector triple**
  (`quote`, `prefix`, `suffix`, char offsets) and `pageRects: Rect[]` in image coordinates,
  not a single page number. Without this, §5.2 and §5.7 are decoration.
- `DEPENDS-ON: backend-evidence` — a per-claim `verdict` on the five-value enum, emitted
  per claim, not per paragraph.
- `DEPENDS-ON: backend-security-governance` — policy decisions must emit
  `{ outcome: 'allow' | 'implicit_deny' | 'explicit_deny', contributing_rules: [...],
  evaluated_count: n }`. A boolean allow/deny cannot drive §5.4.
- `DEPENDS-ON: backend-security-governance` — routing must emit rejected candidates with the
  deciding constraint and the measured vs threshold values, or §5.5 is a one-row table.
- `DEPENDS-ON: frontend-architecture` — `StageStatus` at `lib/types.ts:64` needs `blocked`;
  `hooks/use-event-stream.ts` needs rAF batching; `evidence-drawer.tsx` needs to become a
  persistent rail rather than an overlay.
- `DEPENDS-ON: backend-evidence` — audit entries must expose `prev_hash` and `hash` per row so
  the chain can be **recomputed client-side on demand** (§5.6). A server-asserted "chain
  intact" boolean is exactly the kind of unverifiable claim this product exists to eliminate.

---

## 9. Sources

Fetched and read today:

- C2PA UX Recommendations 2.0 — <https://spec.c2pa.org/specifications/specifications/2.0/ux/UX_Recommendations.html>
- Temporal, *The dark magic of workflow exploration* — <https://temporal.io/blog/the-dark-magic-of-workflow-exploration>
- Temporal, *Let's visualize a workflow* — <https://temporal.io/blog/lets-visualize-a-workflow>
- Honeycomb, Trace Waterfall reference — <https://docs.honeycomb.io/reference/honeycomb-ui/query/trace-waterfall>
- Chrome DevTools, Performance features reference — <https://developer.chrome.com/docs/devtools/performance/reference>
- Hypothesis, *Fuzzy anchoring* — <https://web.hypothes.is/blog/fuzzy-anchoring/>
- MDN, Text fragments — <https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments>
- Relativity, *Reviewing documents in Relativity* — <https://help.relativity.com/RelativityOne/Content/Solutions/Reviewing_documents_in_Relativity.htm>
- AI UX Playground, *Perplexity citations teardown* — <https://aiuxplayground.com/teardowns/perplexity/citations/>
- AYDesign, *AI citation and source UI design patterns for 2026* — <https://www.aydesign.ai/blog/ai-citation-source-ui-patterns-2026>
- arXiv 2512.12207, *Not All Transparency Is Equal* — <https://arxiv.org/abs/2512.12207>
- Carbon Design System, data table style source — <https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/data-table/style.mdx>
- Elastic EUI, Data grid — <https://eui.elastic.co/docs/components/data-grid/>
- Matt Ström-Awn, *Design better data tables* — <https://mattstromawn.com/writing/tables/>
- Datasette, Facets — <https://docs.datasette.io/en/stable/facets.html>
- PatternFly, Status and severity — <https://www.patternfly.org/patterns/status-and-severity/>
- Sentry, Using Breadcrumbs — <https://docs.sentry.io/product/issues/issue-details/breadcrumbs/>
- Sentry, Trace waterfall view improvements — <https://sentry.io/changelog/trace-waterfall-view-improvements/>
- GitHub Changelog, Improved PR "Files changed" — <https://github.blog/changelog/2026-01-22-improved-pull-request-files-changed-page-on-by-default/>
- GitHub Docs, Viewing and understanding files (blame) — <https://docs.github.com/en/repositories/working-with-files/using-files/viewing-and-understanding-files>
- Apache Airflow, UI Overview — <https://airflow.apache.org/docs/apache-airflow/stable/ui.html>
- Dagster, Webserver and UI — <https://docs.dagster.io/guides/operate/webserver>
- Smashing Magazine, *Designing Stable Interfaces For Streaming Content* — <https://www.smashingmagazine.com/2026/05/designing-stable-interfaces-streaming-content/>

Seen only as search-result summaries (verify before implementing):

- OpenSeadragon svg-overlay — <https://openseadragon.github.io/svg-overlay/> · viewport coordinates — <https://openseadragon.github.io/examples/viewport-coordinates/>
- Nutrient, *Text highlight annotations with PDF.js* — <https://www.nutrient.io/blog/pdfjs-text-highlight-annotations/>
- AWS, Testing IAM policies with the policy simulator — <https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html>
- Elastic, Discover — <https://www.elastic.co/docs/explore-analyze/discover/discover-get-started>
- Proxyman — <https://proxyman.com/>
- scite.ai — <https://scite.ai/>
- Sumo Logic Live Tail — <https://help.sumologic.com/docs/search/live-tail/about-live-tail/> · kibana#44923 — <https://github.com/elastic/kibana/pull/44923>
- Carbon status indicator pattern — <https://carbondesignsystem.com/patterns/status-indicator-pattern/>
- Google Docs suggestion mode — <https://support.google.com/docs/answer/6033474>
- Annotorious — <https://annotorious.dev/>

Reasoned from memory, not fetched: Relativity persistent highlight sets; Hypothesis orphan-
annotation tab; Linear activity feeds; Notion suggestion mode; Figma version history panel
internals; Charles Proxy pane details; Weights & Biases; Grafana Explore; Splunk; Everlaw;
Jupyter; Observable.
