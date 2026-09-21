# 20 — AEGIS Design Specification

**Status:** buildable. This is the document an engineer implements from.
**Supersedes for implementation purposes:** the design sections of `10-RESEARCH-CONSOLES.md`,
`11-RESEARCH-LANDING-FIRSTRUN.md`, `12-RESEARCH-EVIDENCE-UI.md`. Those remain the evidence;
this is the decision.
**Written against:** `frontend/app/globals.css` (285 lines, read in full),
`components/{primitives,page-header,navigation,sov-button,agent-pipeline}.tsx`,
`components/{sign-in/sign-in-view,console/console-view,security/security-view}.tsx`,
`app/(app)/layout.tsx`, `lib/{types,presentation}.ts`.
**Date:** 2026-09-21.

> **Paradigm note.** Sections 1, 2, 4, 5 and 6 are paradigm-independent — they hold whether the
> product is a console or a chat. Section 3 (layout), section 7 (the thread surface) and section 8
> (where everything else goes) are written against the **chat-first** target: a conversation thread
> is the primary surface and evidence, policy, routing, verification, proof and audit hang off
> messages within it. Section 9 is ordered against that target.

**Settled and not relitigated here:** warm-paper palette (`--background #f7f7f5`,
`--surface #ffffff`, `--foreground #0a0a0a`), `--radius: 4px`, Geist Sans + Geist Mono, no new
brand hues, no CDN assets, no framer-motion, Next 16 App Router / React 19 / Tailwind v4
CSS-first `@theme inline` / `@base-ui/react` / `lucide-react`.

---

## 1. Design principles

Six. Each is one sentence, each is traceable to a cited finding, each is falsifiable by
inspecting the running app.

**P1 — Absence renders as an em dash, never as a favourable default.**
*Source:* `00-SHARED-BRIEF.md` "never render a number the backend did not measure";
`lib/api.ts:103-111`; `01-FRONTEND-ARCHITECTURE.md §6.3.7`.
*Falsifier:* grep the frontend for `?? 0`, `|| 6`, `: 0.95`, `: true` in a ternary whose other
arm reads an API field. Any hit fails this principle. The `no-numeric-fallback` lint rule
(§9, step 3) is the mechanical test.

**P2 — Hue is the scarcest channel and is spent last: position → shape → weight → hue.**
*Source:* `12-RESEARCH-EVIDENCE-UI.md §4` (PatternFly: "status icons … should never communicate
severity alone"); `10-RESEARCH-CONSOLES.md §4.9` (print is a real output).
*Falsifier:* screenshot any verdict strip, stage rail or status chip, convert to greyscale, and
ask a second person to read it. If any state becomes ambiguous, this principle failed.

**P3 — Every separated surface is a 1px `box-shadow` ring, never a `border`; depth is a
three-rung ladder and there is no fourth rung.**
*Source:* `10-RESEARCH-CONSOLES.md §2.2` (Geist `--ds-shadow-border-*`), §3 items 11–13, and
§2.6 (Stripe's card-less dashboard: "the fix is not better cards; it is fewer frames").
*Falsifier:* hover any row or open any panel and measure layout. If any element's box changes
size by 1px on hover, focus or selection, this principle failed.

**P4 — Mono means machine-issued, sans means human- or model-authored, and nothing else
distinguishes them.**
*Source:* `10-RESEARCH-CONSOLES.md §2.1` (Temporal reserves mono for `.body-small-mono`);
`11-RESEARCH-LANDING-FIRSTRUN.md §5.1.4` ("when everything is mono, nothing is");
`01-FRONTEND-ARCHITECTURE.md §6.2.2`.
*Falsifier:* find one mono string in the app that is not an id, hash, unit, latency, coordinate,
rule path, model name, host or timestamp. `EMAIL ADDRESS` in Geist Mono at
`sign-in-view.tsx:304` is the current violation.

**P5 — Motion is a readout with a named referent; response to input is instant and only decay is
animated.**
*Source:* `04-MOTION-AND-PRODUCT-EXPERIENCE.md §2.1` ("motion is a readout, not a finish");
`10-RESEARCH-CONSOLES.md §2.3` (Linear `--speed-highlightFadeIn: 0s` / `FadeOut: .15s`, called
"the highest-ROI item in this document").
*Falsifier:* load any page, touch nothing, and watch for 60 seconds. If any pixel moves, this
principle failed. Second test: grep for `transition: all` and for any `transition-duration`
above `0ms` on a `:hover` *enter*.

**P6 — Verification precedes display: unverified prose is never rendered and then badged.**
*Source:* `12-RESEARCH-EVIDENCE-UI.md §6.8` ("streaming an answer that has not yet been
claim-verified shows the judge unverified text and then retroactively badges it — the worst
possible order of operations for a product about verification").
*Falsifier:* run a task and record the screen. If a single character of answer prose appears
before `task.verified`, this principle failed. See §7.4 for what replaces streaming.

### 1.1 Conflicts between the research documents, resolved

| # | Conflict | Sources | **Decision** |
|---|---|---|---|
| C1 | Temporal spends **six** hues on event taxonomy alongside four on status; our brief forbids new hues. | `10 §2.1` + `10 §3.28` vs `00-SHARED-BRIEF` | **Taxonomy gets no hue.** Evidence modality and stage kind are carried by a mono glyph (`¶ ⎗ ◱ ∑ ⌘ ☑`) plus rule weight, exactly as `01 §4.2` already proposes. Temporal can afford six taxonomy hues because its status set is chip-sized and its taxonomy is rail-sized; we cannot afford the review burden of ten hues in a product whose output gets printed. |
| C2 | Stripe ships **card-less** depth (background tint only, zero shadows); Geist ships a ring on **every** separated surface. Our current UI is bordered cards everywhere. | `10 §2.6` vs `10 §2.2` | **Split by whether the surface floats.** In-flow content (stage rows, ledger rows, message turns, tables, stage panels) is **card-less**: grouped by a hairline and a background tint, zero shadow, zero border. Floating content (menus, popovers, the evidence rail when it overlays, modals, toasts) gets the Geist double ring. That is `--elev-0` and `--elev-2/3`, with exactly one rung between them. Eight cards on one screen becomes one container with eight rules. |
| C3 | Linear tracks body text **negative** (−0.013em at 14px); Grafana tracks it **positive** (+0.0107em at 14px) for glanceability at distance. | `10 §2.3` vs `10 §2.5` | **Split by size, at 16px.** ≥20px: negative (−0.015em → −0.03em, tightening as size grows). 12–16px: `0`. ≤11px: positive (+0.01em, and +0.06em for uppercase mono labels). AEGIS is read at a desk *and* over a shoulder on a projector; the small type is where the projector loses, so that is where tracking opens up. |
| C4 | `01 §4.4` maps `UNSUPPORTED → --critical` and `CONFLICTED → --approval`. `12 §4` maps `UNSUPPORTED → muted ink (no hue)` and `CONFLICTED → --critical`. `04 §3.7` maps `SUPPORTED → --active`, `UNSUPPORTED → --approval`, `CONFLICTED → --critical`. Three documents, three mappings. | `01` vs `12` vs `04` | **Adopt `12 §4`.** UNSUPPORTED means *we found nothing*, which is an absence; red says *wrong*, which is a judgement we have not made (the IAM implicit-vs-explicit-deny distinction, `12 §2.11`). CONFLICTED means *the evidence disagrees with itself and a human must arbitrate*, which is the loudest thing a verification product can say. `04`'s `SUPPORTED → --active` is rejected outright: `--active` means *a stage is running*, and reusing it for a verdict makes a finished claim look like a live one. Full table in §5.2. |
| C5 | `12 §2.8` says audit rows at **32px** with a **24px** compact toggle (Carbon sm/xs); `10 §3.23` says all rows at **36px** (Grafana, enforced with a `throw`). | `12` vs `10` | **Two row scales, by job.** Interactive/navigational rows (thread list, approvals queue, candidate table, menu rows) are **36px** — they are click targets and 36 is the Vercel/Grafana control height. Read-only data-grid rows (audit ledger, evidence ledger) are **32px**, compact **28px**. 24px is rejected on `12 §2.8`'s own grounds ("xs/24px is too tight for a 4px-radius instrument panel with Geist"). |
| C6 | `11 §4.8` and Chainguard want secondary/tertiary text as an **alpha ramp off the ink**; our tokens are three separate opaque greys. | `11 §2.5` vs `globals.css:18-20` | **Keep the three opaque tokens, document them as the composite of the ramp.** `--foreground-secondary #5f5b57` and `--foreground-muted #8a8783` stay (6.27:1 and 3.33:1 on paper — both measured, both already wired through ~300 call sites). An alpha ramp over paper would be non-deterministic on a coloured status tint, which is where we need those greys most. The ramp is used for *lines* (§2.2), where the ground is always paper. |
| C7 | `04 §2.3` defines six duration tiers (90/160/240/320/480/640). `10 §3.16-17` wants Linear's asymmetric hover (0ms in / 150ms out) and Sentry's split enter/exit curves. | `04` vs `10` | **Both, at different layers.** `04`'s six tiers are the canonical *animation* ladder and are kept verbatim. Linear's asymmetry governs *transitions*, which is a different thing: `--hover-in: 0ms`, `--hover-out: 150ms`. Sentry's curves are added as `--ease-enter-sharp` / `--ease-exit-sharp` and are used only where `04` does not already name a curve. |
| C8 | `01 §3.9` needs nine stage states; `04 §3.2` ships seven; `12 §4` ships seven with `blocked` added. | `01` vs `04` vs `12` | **Nine.** The seven in the brief (`pending / active / done / skipped / failed / held / blocked`) plus `denied` (`04 §3.2`: "a denial is the product working; a failure is a bug" — conflating them means our crashes look like security or our security looks like a crash) and `unavailable` (`01 §3.9`: "the state that keeps the screen honest while the backend is half-built"). Full drawings in §5.3. |

---

## 2. The token set

This is the complete set of additions to `frontend/app/globals.css`, ready to paste. Every value
carries a comment naming its source. **No existing colour value changes** except the three line
tokens, which move by ≤2/255 and are noted.

### 2.0 What is replaced, what is kept, what is deleted

| Disposition | Tokens |
|---|---|
| **Kept, byte-identical** | `--background` `--surface` `--surface-sunken` `--foreground` `--foreground-secondary` `--foreground-muted` `--ink` `--ink-surface` `--ink-foreground` `--ink-muted` `--ink-border` `--ink-grid` `--sovereign` `--active` `--approval` `--critical` `--radius` `--font-sans` `--font-mono` and every shadcn compatibility mapping (`--card` … `--input`). |
| **Kept by name, value re-derived** | `--grid` `#eceae6` → `oklch(from var(--line-ink) …/6%)` = **`#ebebe8`** (Δ ≤ 2/255). `--border` `#dcdad6` → `…/14%` = **`#dadad7`** (Δ ≤ 2/255). `--border-strong` `#c8c5bf` → `…/24%` = **`#c6c5c2`** (Δ ≤ 3/255). All three become aliases of the new `--line-*` family so a single knob moves them together. Nothing that consumes them needs to change. |
| **Replaced** | `--ring: #8a8783` → `var(--foreground)`. A 3.33:1 focus ring fails WCAG 2.4.11 (3:1 against *adjacent* colours, and `#8a8783` against `--border #dcdad6` is 2.56:1). The new focus affordance is the gap ring in §2.7. |
| **Added** | everything in §2.1–§2.9 below. |
| **Deleted** | `@utility glass-chassis`, `@utility glass-chassis-dark` (`globals.css:144-158`) — `04 §7.3`: a full-width `backdrop-filter` re-samples everything beneath it every frame the stage board changes. The `@media (pointer: fine)` custom-cursor block (`:273-283`) — `04 §1.3`: `cursor: none !important` is an unrecoverable failure on a judging laptop. The keyframes `sov-drift`, `sov-spin-slow`, `sov-radar-sweep`, `sov-laser-flow`, `sov-glow-pulse`, `sov-glow-pulse-active`, `sov-deflection`, `sov-trace`, `sov-dash`, `sov-blink` and their classes (`:169-240`) — every one is an infinite loop or a celebration burst, both banned by `04 §2.2`. The blanket `prefers-reduced-motion` override (`:256-268`) — replaced by the token contract in §2.6. `sov-pulse` and `sov-reveal` and `sov-line-grow` **survive**. |

### 2.1 Colour — status text variants (the measured fix)

The problem, measured against `--background #f7f7f5`:

| Token | Hex | vs `#f7f7f5` | vs `#ffffff` | vs `#f2f1ee` | Verdict |
|---|---|---|---|---|---|
| `--sovereign` | `#16a34a` | **3.07:1** | 3.30:1 | 2.92:1 | fails AA body 4.5, passes UI 3.0 on paper, **fails UI 3.0 on sunken** |
| `--active` | `#0284c7` | **3.82:1** | 4.10:1 | 3.63:1 | fails AA body |
| `--approval` | `#d97706` | **2.97:1** | 3.19:1 | 2.82:1 | **fails both thresholds, everywhere** |
| `--critical` | `#dc2626` | **4.50:1** | 4.83:1 | 4.28:1 | passes on paper, fails on sunken |

And on fills: white on `--approval` is **3.19:1** (unreadable); `#0a0a0a` on `--approval` is
**6.21:1**.

Grafana ships a separate `main` and `text` value per status for exactly this reason
(`10 §2.5`: warning's fill is `#ff9900` in both themes while its light-theme text is `#b04e0c`).
Temporal ships the same split as `content` step 12 vs `content.static` step 11 (`10 §2.1`).
We adopt it.

**Method.** Each base colour was converted to OKLCH, its hue and chroma held, and its lightness
lowered until it cleared 4.5:1 against the darkest ground it can legally sit on — its own 8%
tint over `--surface-sunken`. The results were then snapped to the nearest in-gamut sRGB hex and
re-measured. The four land within **L 0.490–0.510** in OKLCH, i.e. they share an optical weight,
which is the whole point of Temporal's `content.static` ramp.

> The derivation is *not* shipped as a live `oklch(from …)` expression. At the lightness these
> need, `oklch(from var(--sovereign) 0.49 c h)` falls outside sRGB on all four hues (verified:
> every one produces a negative linear channel), so the browser would gamut-map it and the
> shipped ratio would not be the ratio proved here. Literal hex, proved.

```css
  /* ---------------------------------------------------------------- */
  /* Status — text variants.                                          */
  /*                                                                  */
  /* Source: 10-RESEARCH-CONSOLES §2.5 (Grafana ships `main` and      */
  /* `text` per status) and §2.1 (Temporal ships content step 12 for  */
  /* text on paper, step 11 for text on its own fill).                */
  /*                                                                  */
  /* Derived by holding OKLCH hue and chroma and lowering lightness   */
  /* to ~L 0.50, then snapping in-gamut. Hue drift from the base is   */
  /* at most 2.9 degrees, so these read as the same colour, darker.   */
  /*                                                                  */
  /* Measured contrast (WCAG 2.x relative luminance), in the order    */
  /* --surface #ffffff / --background #f7f7f5 / --surface-sunken      */
  /* #f2f1ee / its own 8% tint over --background / over --sunken:     */
  /* ---------------------------------------------------------------- */

  /* base oklch(0.627 0.170 149.21)  ->  oklch(0.490 0.132 149.72), dH +0.51deg
     6.02 / 5.61 / 5.33 / 5.09 / 4.84  — was 3.30 / 3.07 / 2.92 */
  --sovereign-text: #0b7434;

  /* base oklch(0.588 0.139 241.97)  ->  oklch(0.497 0.117 242.91), dH +0.94deg
     6.02 / 5.61 / 5.33 / 5.09 / 4.84  — was 4.10 / 3.82 / 3.63 */
  --active-text: #08689f;

  /* base oklch(0.666 0.157 58.32)   ->  oklch(0.510 0.124 55.42),  dH -2.90deg
     6.01 / 5.60 / 5.32 / 5.18 / 4.91  — was 3.19 / 2.97 / 2.82.
     This is the token that fixes the only outright failure in the set. */
  --approval-text: #9a4f04;

  /* base oklch(0.577 0.215 27.33)   ->  oklch(0.505 0.191 27.52),  dH +0.19deg
     6.47 / 6.03 / 5.73 / 5.34 / 5.09  — was 4.83 / 4.50 / 4.28 */
  --critical-text: #b91c1c;

  /* ---------------------------------------------------------------- */
  /* Status — text ON a solid status fill.                            */
  /* Measured against each fill. A solid status fill may carry a      */
  /* GLYPH or a >=11px 500-weight mono label and nothing else; body   */
  /* prose never sits on a status fill (01-FRONTEND-ARCHITECTURE §7.3)*/
  /* ---------------------------------------------------------------- */
  --on-sovereign: #0a0a0a;   /* 6.01:1 on #16a34a. White would be 3.30:1. */
  --on-active:    #0a0a0a;   /* 4.83:1 on #0284c7. White would be 4.10:1. */
  --on-approval:  #0a0a0a;   /* 6.21:1 on #d97706. White would be 3.19:1 — unreadable. */
  --on-critical:  #ffffff;   /* 4.83:1 on #dc2626. Ink would be 4.10:1.
                                Critical is the one status whose glyph inverts. That is
                                correct: it is the one status that must not be mistaken
                                for any of the others, and the inversion is a fifth,
                                free, non-hue channel. */
```

**Usage rule, stated once and enforced in review:**
`--sovereign / --active / --approval / --critical` are for **fills, rings, markers, rails and
glyphs only**. Any status colour applied to a text node uses the `-text` variant. There is no
third case.

### 2.2 Colour — the hairline family (Supabase-style OKLCH derivation, warm-paper corrected)

Supabase derives every border from the foreground colour at roughly half chroma and a low alpha
(`10 §2.7`), so rules inherit the page's warmth instead of reading grey. Applied naively here it
fails: `--foreground` is `#0a0a0a`, which is **achromatic** — `oklch(0.1448 0.0000 89.88)` —
so `oklch(from var(--foreground) …)` produces grey rules on warm paper, which is exactly the
"grey and dirty" failure `10 §2.7` names.

So the donor is a separate token, and its hue is **measured from the paper the product already
ships**: the existing `--border #dcdad6` is `oklch(0.8888 0.0059 84.57)`, so `h = 84.57deg`.

```css
  /* ---------------------------------------------------------------- */
  /* Lines.                                                           */
  /*                                                                  */
  /* Source: 10-RESEARCH-CONSOLES §2.7 (Supabase derives every        */
  /* hairline as `oklch(from <ink> l calc(c * .54) h / <alpha>)` and  */
  /* exposes one contrast knob) and §2.3 (Linear keeps `line` tokens  */
  /* for dividers SEPARATE from `border` tokens for controls; a table */
  /* rule at #f0f0f0 and an input border at #e4e2e4 do different      */
  /* jobs). 10 §7 calls this the second-highest-ROI change available. */
  /*                                                                  */
  /* --line-ink is NOT --foreground. --foreground is #0a0a0a, chroma  */
  /* 0.0000, so deriving from it yields grey. The donor's hue is      */
  /* measured off the palette's own --border (#dcdad6 =               */
  /* oklch(0.8888 0.0059 84.57)), so the derived rules land exactly   */
  /* where the hand-picked ones already were, and now move together.  */
  /* ---------------------------------------------------------------- */
  --line-ink: oklch(0.275 0.0255 84.57);   /* ~#2d2719 — donor only, never painted */
  --line-chroma: 0.54;                     /* Supabase's half-chroma multiplier */
  --contrast-lines: 0;                     /* user knob, 0 -> 1. Settings exposes it
                                              as "Increase rule contrast". One
                                              variable, every hairline. */

  /* dividers, table rules, grid — LIGHTER than control borders */
  --line-subtle:   oklch(from var(--line-ink) l calc(c * var(--line-chroma)) h
                         / calc(6%  + 5%  * var(--contrast-lines)));  /* #ebebe8 on paper */
  --line-default:  oklch(from var(--line-ink) l calc(c * var(--line-chroma)) h
                         / calc(14% + 10% * var(--contrast-lines)));  /* #dadad7 on paper */
  --line-strong:   oklch(from var(--line-ink) l calc(c * var(--line-chroma)) h
                         / calc(24% + 16% * var(--contrast-lines)));  /* #c6c5c2 on paper */

  /* control borders — inputs, buttons, chips. Deliberately DARKER than
     the divider at the same nominal step. (Linear: --color-line-tertiary
     #f0f0f0 vs --color-border-secondary #e4e2e4.) */
  --control-subtle:  oklch(from var(--line-ink) l calc(c * var(--line-chroma)) h
                           / calc(10% + 8%  * var(--contrast-lines)));  /* #e3e2e0 */
  --control-default: oklch(from var(--line-ink) l calc(c * var(--line-chroma)) h
                           / calc(18% + 12% * var(--contrast-lines)));  /* #d2d2cf */
  --control-strong:  oklch(from var(--line-ink) l calc(c * var(--line-chroma)) h
                           / calc(30% + 18% * var(--contrast-lines)));  /* #bab9b5 */

  /* Legacy names keep working. Every existing className that says
     border-border or bg-grid resolves through these and needs no edit. */
  --grid:          var(--line-subtle);    /* was #eceae6, now #ebebe8 — delta <= 2/255 */
  --border:        var(--control-default);/* was #dcdad6, now #d2d2cf — see note */
  --border-strong: var(--control-strong); /* was #c8c5bf, now #bab9b5 — see note */
```

> **Note on the two-step shift.** `--border` moving from `#dcdad6` (1.30:1 vs paper) to
> `#d2d2cf` (1.41:1) is a deliberate darkening, not a rounding error: the old value was being
> used for *both* dividers and control borders, which is the single structural gap `10 §2.3`
> identifies. Dividers keep the old weight under the new name `--line-default` (`#dadad7`,
> 1.31:1 — visually the old `--border`). Controls get the darker step they always needed.
> Migration step 5 in §9 rewires call sites; until it runs, everything still compiles and the
> only visible change is that input and button edges gain about one step of definition.

### 2.3 Colour — status surfaces, borders and rails (derived, never hand-picked)

```css
  /* ---------------------------------------------------------------- */
  /* Status surfaces + borders.                                       */
  /* Source: 10-RESEARCH-CONSOLES §2.7 — Supabase makes EVERY status  */
  /* border exactly 30% alpha of its status colour. One rule, four    */
  /* applications, zero hand-picked hex. §3.4 makes fills 8%.         */
  /* These are safe as live oklch(from ...) because only alpha        */
  /* changes: no gamut mapping can occur.                             */
  /* ---------------------------------------------------------------- */
  --sovereign-surface: oklch(from var(--sovereign) l c h / 8%);   /* #e5f0e7 on paper */
  --active-surface:    oklch(from var(--active)    l c h / 8%);   /* #e3eef1 */
  --approval-surface:  oklch(from var(--approval)  l c h / 8%);   /* #f5ede2 */
  --critical-surface:  oklch(from var(--critical)  l c h / 8%);   /* #f5e6e4 */

  --sovereign-border:  oklch(from var(--sovereign) l c h / 30%);  /* #b3dec2 on paper */
  --active-border:     oklch(from var(--active)    l c h / 30%);  /* #add4e7 */
  --approval-border:   oklch(from var(--approval)  l c h / 30%);  /* #eed1ad */
  --critical-border:   oklch(from var(--critical)  l c h / 30%);  /* #efb8b7 */

  /* A status tint may be composited over --background or --surface only,
     NEVER over --surface-sunken. The -text contrast figures in §2.1 are
     proved against the sunken case anyway, so this is belt and braces. */

  /* Selection is deliberately NOT the interactive accent.
     Source: 10 §2.5 — Grafana's action.selectedBorder is orange while its
     primary is blue, so "selected" never reads as "link". Ours is ink,
     because ink is the one value that is never a status. */
  --selected-rail:    var(--foreground);
  --selected-surface: var(--surface-sunken);

  /* Overlay scrim. Source: 10 §2.2 — Vercel dims a light UI with a LIGHT
     scrim (--ds-overlay-backdrop-color: hsla(0,0%,95%,1) at .8). A black
     scrim makes paper-coloured UI look cheap. Ours is warm near-white. */
  --scrim: color-mix(in srgb, #efeeea 80%, transparent);

  /* Disabled. Source: 10 §2.1 — Temporal's opacity.disabled: 0.32,
     applied as opacity on the live colour so disabled things keep their
     hue and recede rather than turning to mud. */
  --opacity-disabled: 0.32;

  /* Dim, for "selecting anything dims everything else" (12 §3.10). */
  --opacity-dim: 0.45;
```

### 2.4 Type scale

```css
  /* ---------------------------------------------------------------- */
  /* Type.                                                            */
  /*                                                                  */
  /* Sizes and line-heights are even integers so baselines land on a  */
  /* shared grid (10 §2.5 — Grafana enforces this with a throw()).    */
  /* Tracking splits at 16px (conflict C3): negative above, zero in   */
  /* the middle, positive below, because the small type is what a     */
  /* projector loses.                                                 */
  /*                                                                  */
  /* Role names, not sizes: 01 §6.1 notes the current code hardcodes  */
  /* [10px]..[15px] in roughly 300 places.                            */
  /* ---------------------------------------------------------------- */
  /* Raw sizes are `--size-*`, NOT `--text-*`: Tailwind v4 owns the `--text-*`
     namespace (it generates `text-<name>` from it and writes the result back
     into :root), so declaring both here and in @theme inline is circular.
     §2.10 maps --size-* -> --text-* and binds each line-height. */
  --size-display:    32px; --lh-display:    36px; --ls-display:    -0.03em;  /* landing only */
  --size-title:      20px; --lh-title:      28px; --ls-title:      -0.015em; /* page + sign-in h1 */
  --size-heading:    16px; --lh-heading:    24px; --ls-heading:    -0.01em;  /* section, turn header */
  --size-answer:     15px; --lh-answer:     24px; --ls-answer:     -0.006em; /* model prose ONLY */
  --size-body:       13px; --lh-body:       20px; --ls-body:        0;       /* app default */
  --size-ui:         12px; --lh-ui:         16px; --ls-ui:          0;       /* labels, dense rows */
  --size-meta:       11px; --lh-meta:       16px; --ls-meta:        0.01em;  /* mono: ids, times */
  --size-ledger:     10px; --lh-ledger:     14px; --ls-ledger:      0.06em;  /* mono uppercase caption
                                                    — 11 §2.5, Chainguard's +6% stat label */

  /* Weights. Geist Sans is variable, so the non-integer stops Linear
     ships (510 / 590) are available today. 10 §2.3: "510 is just barely
     heavier than 400; it lifts a label without making it shout."
     Nothing in the product surface goes above 590. Grafana caps at 500
     and refuses to go higher anywhere in the UI (10 §2.5). */
  --weight-normal:   400;
  --weight-medium:   510;
  --weight-strong:   590;

  /* Mono regular is 425, not 400. Source: 10 §2.4 — Sentry ships
     weight.mono.regular = 425 because a monospace face at the same
     nominal weight reads lighter beside its sans counterpart. Geist
     Mono is variable. Set a run id in 400 next to a 400 sans label and
     the id looks washed out. */
  --weight-mono:     425;
  --weight-mono-med: 510;
```

```css
/* Applied once, at the base layer, so no component re-states it. */
@layer base {
  code, kbd, samp, pre, .font-mono, [class*='font-mono'] {
    font-variation-settings: 'wght' var(--weight-mono);
    font-variant-numeric: tabular-nums;
    /* 12 §2.8 (Strom): columns of numbers that do not align read as
       untrustworthy. Every id, hash, latency and coordinate in this
       product is mono, so tabular-nums belongs here, not on a utility. */
  }
}
```

### 2.5 Spacing, radii, control sizes, densities

```css
  /* ---------------------------------------------------------------- */
  /* Spacing. 4px scale plus Sentry's 6px step (10 §2.4) — exactly the */
  /* value you want for tight control padding where 4 is cramped and  */
  /* 8 is loose — plus Grafana's 20 (10 §2.5).                        */
  /* ---------------------------------------------------------------- */
  --space-0: 0px;  --space-1: 2px;  --space-2: 4px;  --space-3: 6px;
  --space-4: 8px;  --space-5: 12px; --space-6: 16px; --space-7: 20px;
  --space-8: 24px; --space-9: 32px; --space-10: 40px; --space-11: 48px;
  --space-12: 64px;

  /* ---------------------------------------------------------------- */
  /* Radii. House radius stays 4px. The rest exist for nesting:       */
  /* inner radius = outer radius - padding (10 §2.2, Vercel's         */
  /* concentric popover trick, "it reads as machined").               */
  /* ---------------------------------------------------------------- */
  --radius-xs: 2px;
  --radius-sm: 3px;
  --radius:    4px;   /* unchanged, settled */
  --radius-md: 6px;   /* floating surfaces: menu, popover, toast */
  --radius-lg: 8px;   /* sheets, modals, the composer */
  --menu-pad:  4px;
  --radius-menu-row: 2px;  /* = --radius-md (6) - --menu-pad (4) */

  /* ---------------------------------------------------------------- */
  /* Control sizes. Exactly three, and font size and radius bind to   */
  /* each so no component invents a fourth (10 §3.22, Vercel          */
  /* --ds-size-small/medium/large).                                   */
  /* ---------------------------------------------------------------- */
  --control-sm: 32px;  /* label --text-ui   12/16, radius --radius    */
  --control-md: 36px;  /* label --text-body 13/20, radius --radius    — default */
  --control-lg: 40px;  /* label --text-body 13/20, radius --radius    — auth + composer */

  /* ---------------------------------------------------------------- */
  /* Row heights. Conflict C5: two scales, by job.                    */
  /* ---------------------------------------------------------------- */
  --row-interactive: 36px;  /* thread list, queue, candidate table, menu rows */
  --row-data:        32px;  /* audit + evidence ledger (12 §2.8, Carbon sm)   */
  --row-data-compact:28px;  /* the compact toggle. 24px rejected — 12 §2.8    */

  /* ---------------------------------------------------------------- */
  /* Density — the primary expressive tool once hue is fixed.         */
  /* Source: 01 §6.2.1 "density encodes altitude".                    */
  /* ---------------------------------------------------------------- */
  --pad-comfortable: 12px;  /* reading: a stage headline, a denial reason */
  --pad-compact:      8px;  /* scanning: list rows                       */
  --pad-dense:        4px;  /* ledgers, candidate tables                 */
```

### 2.6 Elevation — rings, not borders

```css
  /* ---------------------------------------------------------------- */
  /* Elevation. Three rungs and no fourth (principle P3, conflict C2).*/
  /*                                                                  */
  /* Every ring is a box-shadow, never a border, so it does not       */
  /* consume layout: a 36px row is 36px and hover never shifts it by  */
  /* 1px (10 §3.11, Geist --ds-shadow-border-*).                      */
  /*                                                                  */
  /* Each floating rung ends with an OPAQUE ring in the page colour   */
  /* (10 §3.12, --ds-shadow-menu). Translucent black outside, opaque  */
  /* paper inside: that double ring is what makes a menu read as a    */
  /* physical object rather than a rectangle with a shadow.           */
  /*                                                                  */
  /* Alpha FALLS as elevation rises (10 §3.13, Linear --shadow-low    */
  /* 9% -> --shadow-high 6%). Big soft shadows must be fainter, not   */
  /* darker.                                                          */
  /* ---------------------------------------------------------------- */

  /* Rung 0 — seated. In-flow content. This is most of the app. */
  --elev-0: 0 0 0 1px var(--line-default);

  /* Rung 1 — raised. The composer, the evidence rail when docked. */
  --elev-1:
    0 0 0 1px oklch(0 0 0 / 0.07),
    0 1px 1px oklch(0 0 0 / 0.04),
    0 0 0 1px var(--background);

  /* Rung 2 — floating. Menus, popovers, the citation popover, toasts. */
  --elev-2:
    0 0 0 1px oklch(0 0 0 / 0.07),
    0 1px 1px oklch(0 0 0 / 0.03),
    0 4px 8px -4px oklch(0 0 0 / 0.04),
    0 16px 24px -8px oklch(0 0 0 / 0.06),
    0 0 0 1px var(--surface);

  /* Rung 3 — modal. Exactly one element on screen may use this. */
  --elev-3:
    0 0 0 1px oklch(0 0 0 / 0.07),
    0 8px 24px -12px oklch(0 0 0 / 0.08),
    0 32px 72px -12px oklch(0 0 0 / 0.06),
    0 0 0 1px var(--surface);

  /* The seat. Source: 10 §3.14, Linear --shadow-stack-low's inset top
     highlight. One 1px inset under a raised row reads as a physical
     lip. Used only on the composer. */
  --elev-seat: inset 0 -1px 1px oklch(0 0 0 / 0.07);
```

### 2.7 Focus

```css
  /* ---------------------------------------------------------------- */
  /* Focus. A GAP ring: 2px of page colour, then 2px of ink.          */
  /* Source: 10 §3.26 (Vercel --ds-focus-ring). The gap is what makes */
  /* a focus ring read as deliberate rather than as a border that got */
  /* thick.                                                           */
  /*                                                                  */
  /* Ink, not an accent hue. Source: 11 §5.4 — "ink-only focus; no    */
  /* accent hue". --foreground on --background is 18.46:1, which      */
  /* clears WCAG 2.4.11's 3:1 against any adjacent colour in this     */
  /* palette by a wide margin. The old --ring #8a8783 was 3.33:1 on   */
  /* paper and 2.56:1 against --border: it failed.                    */
  /* ---------------------------------------------------------------- */
  --focus-gap: 2px;
  --focus-ring:
    0 0 0 var(--focus-gap) var(--surface),
    0 0 0 calc(var(--focus-gap) + 2px) var(--foreground);
  --focus-ring-on-paper:
    0 0 0 var(--focus-gap) var(--background),
    0 0 0 calc(var(--focus-gap) + 2px) var(--foreground);
  --focus-ring-on-sunken:
    0 0 0 var(--focus-gap) var(--surface-sunken),
    0 0 0 calc(var(--focus-gap) + 2px) var(--foreground);
  --ring: var(--foreground);   /* shadcn compat, replaces #8a8783 */
```

### 2.8 Motion

```css
  /* ---------------------------------------------------------------- */
  /* Motion.                                                          */
  /*                                                                  */
  /* The six-tier ladder is 04-MOTION §2.3, kept verbatim: it is the  */
  /* project's doctrine and every animation in Appendix A of that     */
  /* document is authored against it.                                 */
  /*                                                                  */
  /* The hover pair is new and is conflict C7's resolution: Linear    */
  /* ships --speed-highlightFadeIn: 0s and --speed-highlightFadeOut:  */
  /* .15s (10 §2.3). A row highlight appears in ZERO milliseconds and */
  /* decays over 150. Everyone else transitions both directions and   */
  /* the product feels laggy on hover. 10 §7 calls this the single    */
  /* highest-ROI change available against the current globals.css.    */
  /* ---------------------------------------------------------------- */

  /* durations — 04-MOTION §2.3 */
  --dur-tick:   90ms;   /* a glyph or colour flipping in place            */
  --dur-state: 160ms;   /* a stage changing status; a connector drawing   */
  --dur-enter: 240ms;   /* a new row arriving in a ledger                 */
  --dur-panel: 320ms;   /* a drawer, sheet or rail opening                */
  --dur-hold:  480ms;   /* the denial settle. Only tier above 320.        */
  --dur-seal:  640ms;   /* the certificate signature. Used exactly once.  */

  /* the asymmetric hover pair — Linear */
  --hover-in:   0ms;
  --hover-out:  150ms;

  /* easing — 04-MOTION §2.3's three, plus Sentry's split pair (10 §2.4) */
  --ease-enter: cubic-bezier(0.22, 1, 0.36, 1);      /* arriving: fast out, soft land */
  --ease-exit:  cubic-bezier(0.55, 0, 1, 0.45);      /* leaving: accelerate away      */
  --ease-move:  cubic-bezier(0.4, 0, 0.2, 1);        /* moving in place               */
  --ease-enter-sharp: cubic-bezier(0.24, 1, 0.32, 1);/* Sentry `enter` — near-vertical
                                                        launch, decelerates hard      */
  --ease-exit-sharp:  cubic-bezier(0.64, 0, 0.8, 0); /* Sentry `exit` — no decel      */

  /* stagger and travel — 04-MOTION §2.3 */
  --stagger:   40ms;
  --stagger-cap: 5;     /* min(var(--i), 5): a 40-row burst resolves in 440ms, not 1.6s */
  --shift-sm:  4px;
  --shift-md:  8px;
```

```css
/* ------------------------------------------------------------------ */
/* Reduced-motion contract.                                            */
/*                                                                     */
/* Because every animation is authored against the tokens above, this  */
/* block IS the whole contract. It replaces the `*` / !important       */
/* sledgehammer at the old globals.css:256-268, which also killed      */
/* animation-fill-mode edge cases and did nothing about travel         */
/* distance. 04-MOTION §2.3.                                           */
/*                                                                     */
/* --dur-tick is deliberately retained: a 90ms colour cross-fade       */
/* involves no movement and is not a vestibular trigger. WCAG 2.3.3    */
/* targets motion, not all transition.                                 */
/* ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-state: 0ms; --dur-enter: 0ms; --dur-panel: 0ms;
    --dur-hold:  0ms; --dur-seal:  0ms;
    --hover-out: 0ms; --stagger:   0ms;
    --shift-sm:  0px; --shift-md:  0px;
  }
  /* Transforms are gated at the keyframe, not the duration. */
  .stage-connector[data-state='drawn'] { transform: scaleX(1); animation: none; }
  .stage-marker .stage-glyph { animation: none; transform: none; opacity: 1; }
  .ledger-row { animation: none; }
  .evidence-highlight { animation: none; opacity: 1; transform: none; }
  .certificate-seal-rule { animation: none; transform: scaleX(1); }
  .sov-pulse { animation: none; opacity: 1; transform: none; }
}
```

### 2.9 Z-index

```css
  /* ---------------------------------------------------------------- */
  /* Z-index. Source: 10 §3.25 (Vercel's --ds-z-* ladder).            */
  /* Note the ordering: MENUS SIT ABOVE MODALS. A select inside a     */
  /* modal must not clip. Taking the whole ladder is free and it      */
  /* prevents an entire class of bug.                                 */
  /* ---------------------------------------------------------------- */
  --z-base:    0;
  --z-rail:    20;      /* left thread rail, right evidence rail (docked) */
  --z-strip:   30;      /* the persistent status strip                    */
  --z-topbar:  40;
  --z-drawer:  200;     /* the evidence rail when it overlays (narrow)    */
  --z-modal:   300;
  --z-menu:    2001;    /* above modal, deliberately                      */
  --z-toast:   5000;
  --z-tooltip: 99999;
```

### 2.10 The `@theme inline` block — additions

```css
@theme inline {
  /* ... every existing mapping is kept verbatim ... */

  --color-sovereign-text: var(--sovereign-text);
  --color-active-text:    var(--active-text);
  --color-approval-text:  var(--approval-text);
  --color-critical-text:  var(--critical-text);

  --color-sovereign-surface: var(--sovereign-surface);
  --color-active-surface:    var(--active-surface);
  --color-approval-surface:  var(--approval-surface);
  --color-critical-surface:  var(--critical-surface);

  --color-sovereign-border: var(--sovereign-border);
  --color-active-border:    var(--active-border);
  --color-approval-border:  var(--approval-border);
  --color-critical-border:  var(--critical-border);

  --color-line-subtle:  var(--line-subtle);
  --color-line-default: var(--line-default);
  --color-line-strong:  var(--line-strong);
  --color-control-subtle:  var(--control-subtle);
  --color-control-default: var(--control-default);
  --color-control-strong:  var(--control-strong);

  /* Verdicts. Mapping decided in conflict C4; drawings in §5.2. */
  --color-verdict-verified:    var(--sovereign-text);
  --color-verdict-supported:   var(--foreground);
  --color-verdict-needs-review:var(--approval-text);
  --color-verdict-unsupported: var(--foreground-muted);
  --color-verdict-conflicted:  var(--critical-text);

  /* Stage states. §5.3. */
  --color-stage-pending:     var(--foreground-muted);
  --color-stage-active:      var(--active);
  --color-stage-done:        var(--sovereign);
  --color-stage-skipped:     var(--control-strong);
  --color-stage-failed:      var(--critical);
  --color-stage-held:        var(--approval);
  --color-stage-blocked:     var(--control-strong);
  --color-stage-denied:      var(--critical);
  --color-stage-unavailable: var(--control-strong);

  /* Tailwind v4's `--text-*` namespace generates the `text-<name>` utilities.
     The raw sizes therefore live in :root under `--size-*` (see the note under
     §2.4) and are mapped here; declaring `--text-body: var(--text-body)` would
     be circular, because @theme also writes --text-body into :root. The pair
     syntax `--text-x` + `--text-x--line-height` is what binds the line-height
     to the utility. */
  --text-display: var(--size-display);  --text-display--line-height: var(--lh-display);
  --text-title:   var(--size-title);    --text-title--line-height:   var(--lh-title);
  --text-heading: var(--size-heading);  --text-heading--line-height: var(--lh-heading);
  --text-answer:  var(--size-answer);   --text-answer--line-height:  var(--lh-answer);
  --text-body:    var(--size-body);     --text-body--line-height:    var(--lh-body);
  --text-ui:      var(--size-ui);       --text-ui--line-height:      var(--lh-ui);
  --text-meta:    var(--size-meta);     --text-meta--line-height:    var(--lh-meta);
  --text-ledger:  var(--size-ledger);   --text-ledger--line-height:  var(--lh-ledger);

  --font-weight-normal: var(--weight-normal);
  --font-weight-medium: var(--weight-medium);
  --font-weight-strong: var(--weight-strong);

  --radius-xs: var(--radius-xs);
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);

  --shadow-elev-0: var(--elev-0);
  --shadow-elev-1: var(--elev-1);
  --shadow-elev-2: var(--elev-2);
  --shadow-elev-3: var(--elev-3);
  --shadow-focus:  var(--focus-ring);
}
```

### 2.11 Utilities

```css
/* The 1px vertical connector behind a timeline's markers. */
@utility rail-line {
  width: 1px;
  background: var(--line-default);
}

/* Applied to every latency, score, hash fragment, count and coordinate.
   01 §6.1: "columns of numbers that do not align read as untrustworthy,
   which is a strange thing to be true but it is true." */
@utility tabular { font-variant-numeric: tabular-nums; letter-spacing: 0; }

/* Card-less grouping (conflict C2). One container, hairline rules,
   background tint. This is what replaces eight <Card>s. */
@utility grouped {
  background: var(--surface);
  box-shadow: var(--elev-0);
  border-radius: var(--radius);
}
@utility grouped-row {
  border-bottom: 1px solid var(--line-subtle);
}
@utility grouped-row-last { border-bottom: 0; }

/* The asymmetric hover. Apply to any row that highlights.
   Enter is instantaneous; only the decay is animated. */
@utility hover-decay {
  transition: background-color var(--hover-out) var(--ease-move),
              color            var(--hover-out) var(--ease-move),
              box-shadow       var(--hover-out) var(--ease-move);
}
@utility hover-decay:hover {
  transition-duration: var(--hover-in);
}

/* Forced truncation + popover, for hashes and model ids.
   12 §3.28 (EUI): never wrap, never let one cell change row height. */
@utility truncate-cell {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
}
```


---

## 3. Layout system

Chat-first. A thread is the primary surface; everything else is a rail, a disclosure inside a
message, or one of four routes (§8).

### 3.1 The app shell

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ TOPBAR  48px                                                              z-topbar 40│
│ ◆ AEGIS   Knowledge  Approvals  Assurance  Audit        [⌘K]  [role ▾]  [account ▾]  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ STATUS STRIP  28px   mono 11/16  --surface-sunken                          z-strip 30│
│ HOST 127.0.0.1 · EGRESS 0 B / 0 blocked · MODEL qwen3:8b · AUDIT c19e…4a1 ✓ · POLICY …│
├────────────────┬─────────────────────────────────────────────┬───────────────────────┤
│ THREAD RAIL    │ THREAD COLUMN                               │ INSPECTOR RAIL        │
│ 232px          │ flexible, content max 768px, centred        │ 380px  (720px opened) │
│ z-rail 20      │                                             │ z-rail 20 / drawer 200│
│                │                                             │                       │
│ [+ New thread] │  ┌───────────────────────────────────────┐  │  EVIDENCE · 12 items  │
│                │  │ user turn                             │  │  ───────────────────  │
│ TODAY          │  └───────────────────────────────────────┘  │   S1  SOP-114  p.4    │
│ · V-2104 corr… │                                             │   S4  SOP-114  p.9    │
│ · Isolate P-1… │  ┌───────────────────────────────────────┐  │ ▸ V9  report.pdf p.7  │
│                │  │ assistant turn                        │  │   C3  corrosion.rate  │
│ YESTERDAY      │  │  run header                           │  │   X2  sandbox exit 0  │
│ · Vendor bull… │  │  work log   (11 stages)               │  │  ───────────────────  │
│                │  │  answer     (renders once, verified)  │  │  [ source viewer ]    │
│                │  └───────────────────────────────────────┘  │                       │
│                │                                             │                       │
│                │  ┌───────────────────────────────────────┐  │                       │
│                │  │ COMPOSER  sticky bottom                │  │                      │
│                │  └───────────────────────────────────────┘  │                       │
└────────────────┴─────────────────────────────────────────────┴───────────────────────┘
```

Real numbers:

| Region | Width / height | Source |
|---|---|---|
| Topbar | `48px` | `10 §2.1` — Temporal's `--top-nav-height: 3rem`. One horizontal bar, no persistent product chrome, because the primary object has a deep detail view rather than a wide one. |
| Status strip | `28px`, mono `--text-meta` | `04 §5.3`. Replaces the three literals at `console-view.tsx:444-465` and the dead `floating-telemetry-hud.tsx`. |
| Shell inset | `48 + 28 = 76px` | Exactly the `pt-[76px]` already in `app/(app)/layout.tsx:21`. Nothing below it moves. |
| Thread rail | `232px` | `10 §2.3` — Linear's measured `--sidebar-width`. |
| Thread column | content `max-width: 768px`, centred, `24px` gutters | `10 §2.2` — Geist's 24px page gutter, always. 768 is the narrowest Sentry container width (`10 §2.4`) that holds an 11-row stage rail plus a two-column field grid without wrapping. |
| Prose measure inside it | `max-width: 66ch` | `11 §3.B` — the whole credible set runs 55–67 characters. At `--text-answer` 15px, 66ch ≈ 560px, so prose sits inside the 768px column with room for a verdict gutter. |
| Inspector rail | `380px` docked; `720px` when a source raster is open | `01 §4.3` specifies 720px "because a page render with a bbox needs it". 380 is the resting width that still fits `S12 · report.pdf p.7 · VISION · 0.88` on one line at `--text-meta`. |
| Breakpoint: rail overlays | `< 1280px` | Below this the inspector becomes an overlay at `--z-drawer` with `--scrim`, sliding on `transform` only (`04 §1.9` — `evidence-drawer.tsx:28-34` already does this correctly; keep the mechanics, change the container). |
| Breakpoint: thread rail collapses | `< 1024px` | To a `⌘K`-reachable sheet. The rail is navigation, not content. |

### 3.2 Nav model

Four routes in the topbar, plus the thread rail. Named after the job, not the data model
(`10 §3.29`, Stripe).

```
◆ AEGIS   Knowledge   Approvals   Assurance   Audit
```

`Console`, `Ask`, `Tasks` and `Registry` are gone as nav items: Console and Ask **are** the
thread (`/` is the thread surface), Tasks are the assistant turns inside threads, and Registry
is renamed Knowledge. That is 7 tabs → 4 tabs plus the rail.

The active-route marker is a **2px `--selected-rail` underline inset to the label's width**, no
glow. `navigation.tsx:53` currently ships `shadow-[0_0_8px_rgba(0,0,0,0.3)]` on that underline —
delete it. A glow on a nav indicator is a fifth visual weight competing with the status channels
(`12 §6.9`).

`⌘K` is an **accelerator over fully visible navigation**, never the primary path: `10 §4.10` —
a hidden primary path fails an operator trained on a written SOP and fails a judge clicking
through in 90 seconds.

### 3.3 Master/detail — there isn't one

`10 §2.3` is explicit: Linear's split pane suits issue triage where you move through many items
quickly; our run detail has eleven stages, an evidence ledger and a signed audit block.
`10 §3.27` (Temporal) settles it — **run detail is a route, not a drawer or a split pane,
because an auditor must be able to send a URL that lands on a specific evidence item.**

Under chat-first that becomes: **every assistant turn is addressable.**

```
/                                                 the most recent thread
/t/{threadId}                                     a thread
/t/{threadId}#m{messageId}                        scrolled to one turn
/t/{threadId}?proof=m{messageId}                  that turn's proof disclosure open
/t/{threadId}?proof=m{messageId}&stage=routing    …at one stage
/t/{threadId}?ev=V9                               the inspector rail open on item V9
```

All four keys are read by the route's server component and passed down as `initialX` props; the
client writes them back with `router.replace(…, { scroll: false })`. This is `01 §3.10`'s
reasoning applied to a thread: the view is linkable, it survives a refresh mid-demo, and
`⌘K → prove` navigates straight to it.

Depth beyond that is **nested breadcrumbs, never stacked modals** (`12 §3.9`, Chrome DevTools):

```
Thread “V-2104 corrosion” › turn 3 › evidence › V9 › p.7 › region 2
```

Each segment is clickable and returns to that level without losing context.

### 3.4 The inspector rail — persistent, never an overlay on desktop

`12 §5.2` is unambiguous: `evidence-drawer.tsx:26-35` is a `fixed inset-0` overlay, and *"for a
workbench this should become a persistent right rail, because an overlay forces you to choose
between reading the answer and reading the evidence, which is precisely the choice we do not
want a judge to make."*

```
┌─ INSPECTOR RAIL ─────────────────────────────────┐  380px docked
│ EVIDENCE · 12 items                    [filter ▾]│  32px header, --text-ledger label
├──────────────────────────────────────────────────┤
│ ¶ S1   SOP-114 rev C            p.4      0.91    │  --row-data 32px
│ ¶ S4   SOP-114 rev C            p.9      0.88    │  mono, tabular, right-aligned
│ ⎗ F2   V-2104-survey.csv        B14       —      │  em dash: not scored (P1)
│ ◱ V9   report.pdf               p.7      0.83    │  ← selected: 2px --selected-rail
│ ◱ V11  report.pdf               p.7      0.61  ⚑ │
│ ∑ C3   corrosion.rate@1.2.0      —     exact     │
│ ⌘ X2   sandbox                   —     exit 0    │
│ ☑ H1   l.bergstrom               —       —       │
├──────────────────────────────────────────────────┤
│ SOURCE                              [ ⊕ ⊖ fit ]  │  adaptive toolbar (12 §3.20)
│ ┌──────────────────────────────────────────────┐ │
│ │        [ page 7 raster ]                     │ │  opening this expands the
│ │        ┌═════════════┐  ← every rect,        │ │  rail 380 → 720px
│ │        │ CML-04      │    never a union      │ │  (12 §3.16)
│ │        └═════════════┘                       │ │
│ └──────────────────────────────────────────────┘ │
│ ◂ prev    hit 3 of 9    next ▸        [n] [p]    │  12 §3.19: n-of-m traversal
├──────────────────────────────────────────────────┤
│ EXTRACTED  “CML-04 remaining wall thickness 8.4” │
│ LOCATOR    p.7 · bbox [0.41,0.22,0.58,0.29]      │
│ CONTENT    sha256:b8e4…19aa               [copy] │
│ REVISION   —          INJECTION RISK  none       │
├──────────────────────────────────────────────────┤
│ USED BY                                          │
│ ▸ K2  “The governing CML is CML-04…”  ■ VERIFIED │
│ ▸ C3  input  t_actual = 8.4 mm                   │
└──────────────────────────────────────────────────┘
```

Rail rules:

1. **One path to a source, not three.** Chip → popover → rail. `12 §6.6` rejects Perplexity's
   three overlapping paths explicitly: *"in a 6-minute judged demo, three routes to one place is
   three chances to click the wrong one."*
2. **No inner scroll regions** (`12 §3.13` — Sentry deliberately removed theirs). The rail
   scrolls as one column; a long ledger shows N then `View all`, which expands that section
   rather than adding a second scrollbar.
3. **Zoom and pan persist when stepping between evidence items** (`12 §3.18`, Relativity), with
   `Fit` to reset (`12 §2.2`, Temporal).
4. **Selecting dims the rest** rather than brightening the selection (`12 §3.10`).
5. Every hover affordance has a click and a keyboard equivalent (`12 §6.7` — hover does not
   exist on a projector).
6. The conscience comment at `evidence-drawer.tsx:48-50` is carried across **verbatim**
   (`12 §5.2`: "it is correct and it is the best-written thing in the frontend").

### 3.5 The status strip

```
HOST 127.0.0.1 · EGRESS 0 B / 0 blocked · MODEL qwen3:8b · AUDIT c19e…4a1 ✓ · POLICY 2026.03.1
```

`04 §5.3`, adopted verbatim. Every field reads from an endpoint
(`/api/system/sovereignty`, `/api/system/health`, `/api/audit/chain`); a field that cannot be
read renders `—`, never a zero; values cross-fade at `--dur-tick` and nothing else about it
moves. It is an instrument reading, and instrument readings do not breathe.

This strip is load-bearing for demo 3 (`04 §4.3`): the entire force of that moment is that the
blocked counter moves and the bytes-out figure does not. That only works if nothing else on
screen is moving.

---

## 4. Component specifications

Eleven primitives. Everything else in the product is assembled from these.

Shared types:

```ts
// shared/ui/types.ts
export type Status  = 'sovereign' | 'active' | 'approval' | 'critical'
export type Density = 'comfortable' | 'compact' | 'dense'
export type Size    = 'sm' | 'md' | 'lg'

export type StageState =
  | 'pending' | 'active' | 'done' | 'skipped' | 'failed'
  | 'held' | 'blocked' | 'denied' | 'unavailable'

export type Verdict =
  | 'VERIFIED' | 'SUPPORTED' | 'NEEDS_REVIEW' | 'UNSUPPORTED' | 'CONFLICTED'

export type EvidenceModality =
  | 'DOCUMENT' | 'FILE' | 'VISION' | 'CALCULATION' | 'EXECUTION' | 'HUMAN'

/** Required on every rendered number. There is no way to pass a fallback. */
export interface Provenance {
  source: 'measurement' | 'benchmark' | 'config' | 'derived'
  /** Human sentence: "psutil connection sample, 2s poll". */
  method: string
  /** null renders "age unknown" rather than letting a stale reading look fresh. */
  measuredAt: string | null
  href?: string
  datasetVersion?: string
  runId?: string
}
```

### 4.1 `Button`

Replaces `components/sov-button.tsx` (37 lines). Three changes from what ships today:
`rounded-full` → `--radius` (`11 §4.10`: 0–4px on primary controls, anything rounder reads
consumer); `transition-all duration-200` → the asymmetric hover pair (`10 §3.19`: audit for
`transition: all` and kill it); `focus-visible:ring-2 ring-foreground/30` → the gap ring.

```ts
// shared/ui/controls/button.tsx
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: Size                    // sm 32 | md 36 | lg 40. Default 'md'.
  /** Renders a 14px spinner inside the button; the button keeps its width
   *  so the layout does not jump. (11 §5.5) */
  busy?: boolean
  /** Label while busy, written as a person would say it: "Signing in…". */
  busyLabel?: string
  icon?: LucideIcon
  iconPosition?: 'start' | 'end'
  /** The focus gap must match the ground the button sits on. */
  ground?: 'surface' | 'paper' | 'sunken'
}
```

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: var(--space-3);                        /* 6px — Sentry's step */
  white-space: nowrap;
  border-radius: var(--radius);
  font-family: var(--font-sans);
  font-weight: var(--weight-medium);          /* 510 */
  letter-spacing: var(--ls-body);
  /* Linear's asymmetry: instant in, 150ms decay. Never `all`. */
  transition: background-color var(--hover-out) var(--ease-move),
              color            var(--hover-out) var(--ease-move),
              box-shadow       var(--hover-out) var(--ease-move);
}
.btn:hover          { transition-duration: var(--hover-in); }
.btn:focus-visible  { outline: none; box-shadow: var(--focus-ring); }
.btn[data-ground='paper']  { --focus-ring: 0 0 0 2px var(--background),     0 0 0 4px var(--foreground); }
.btn[data-ground='sunken'] { --focus-ring: 0 0 0 2px var(--surface-sunken), 0 0 0 4px var(--foreground); }
.btn:disabled       { pointer-events: none; opacity: var(--opacity-disabled); }

.btn[data-size='sm'] { height: var(--control-sm); padding-inline: 10px;
                       font-size: var(--text-ui);   line-height: var(--lh-ui);   }
.btn[data-size='md'] { height: var(--control-md); padding-inline: 12px;
                       font-size: var(--text-body); line-height: var(--lh-body); }
.btn[data-size='lg'] { height: var(--control-lg); padding-inline: 16px;
                       font-size: var(--text-body); line-height: var(--lh-body); }

/* Exactly one filled button may be visible in any one decision context. */
.btn[data-variant='primary']        { background: var(--foreground); color: var(--background); }
.btn[data-variant='primary']:hover  { background: oklch(from var(--foreground) calc(l + 0.08) c h); }

.btn[data-variant='secondary']      { background: var(--surface); color: var(--foreground);
                                      box-shadow: 0 0 0 1px var(--control-default); }
.btn[data-variant='secondary']:hover{ background: var(--surface-sunken);
                                      box-shadow: 0 0 0 1px var(--control-strong); }

.btn[data-variant='ghost']          { background: transparent; color: var(--foreground-secondary); }
.btn[data-variant='ghost']:hover    { background: var(--surface-sunken); color: var(--foreground); }

/* Danger uses the TEXT variant, never the fill hue, on a light ground.
   --critical #dc2626 as a label is 4.50:1 on paper and 4.28:1 on sunken;
   --critical-text #b91c1c is 6.03:1 and 5.73:1. */
.btn[data-variant='danger']         { background: var(--critical-surface); color: var(--critical-text);
                                      box-shadow: 0 0 0 1px var(--critical-border); }
.btn[data-variant='danger']:hover   { background: oklch(from var(--critical) l c h / 14%); }
```

No `active:translate-y-px`. A button that moves on press is a consumer gesture and a layout
animation (`04 §2.1 R4`).

### 4.2 `Input`

```ts
// shared/ui/controls/input.tsx
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string                  // required. Geist SANS, never mono (P4).
  size?: Size                    // default 'md'; auth uses 'lg'
  /** Present => the field is in error; the string renders under the field. */
  error?: string
  /** Right-aligned affordance on the label row (e.g. a reveal toggle). */
  labelAction?: ReactNode
  /** Mono is legal only when the VALUE is machine-issued (a host, a hash). */
  mono?: boolean
  describedBy?: string
}
```

```css
.field        { display: flex; flex-direction: column; gap: var(--space-3); }
.field-label  { font-size: var(--text-ui); line-height: var(--lh-ui);
                font-weight: var(--weight-medium); color: var(--foreground-secondary); }
.field-input  {
  width: 100%;
  height: var(--control-md);
  padding-inline: 10px;
  border-radius: var(--radius);
  background: var(--surface);   /* the only #ffffff on the sign-in page — 11 §5.2 */
  color: var(--foreground);
  font-size: var(--text-body);
  box-shadow: 0 0 0 1px var(--control-default);
  transition: box-shadow var(--hover-out) var(--ease-move);
}
.field-input[data-size='lg'] { height: var(--control-lg); padding-inline: 12px; }
.field-input:hover  { box-shadow: 0 0 0 1px var(--control-strong);
                      transition-duration: var(--hover-in); }
.field-input:focus  { outline: none;
                      box-shadow: 0 0 0 1px var(--foreground),
                                  0 0 0 4px oklch(from var(--foreground) l c h / 0.08); }
.field-input[aria-invalid='true'] { box-shadow: 0 0 0 1px var(--critical); }
.field-input::placeholder { color: var(--foreground-muted); }
.field-error  { font-size: var(--text-ui); line-height: var(--lh-ui);
                color: var(--critical-text); margin-top: var(--space-2); }  /* 4px — 11 §5.5 */
```

The focus treatment here is a **soft ink halo**, not the gap ring: an input already has a 1px
edge, and a 2px white gap around a 40px field reads as an error. `11 §5.4` specifies exactly
this — border → `#0a0a0a` plus a 3–4px `rgba(10,10,10,0.08)` halo, ink only, no accent hue.

### 4.3 `Table` / `Row`

One table component; the row-height token is the only density decision (conflict C5).

```ts
// shared/ui/data/table.tsx
export interface Column<T> {
  id: string
  header: string                 // as short as possible; units stated once (12 §2.8)
  align?: 'start' | 'end'        // numeric and hash columns end-align and go mono
  mono?: boolean
  width?: string                 // a CSS grid track: 'minmax(0,1fr)' | '96px'
  /** Long values truncate and open a cell popover. They NEVER wrap and they
   *  never change the row height. (12 §3.28, EUI's forced truncation) */
  truncate?: boolean
  render: (row: T) => ReactNode
}

export interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  scale?: 'interactive' | 'data' | 'compact'   // 36 | 32 | 28
  selectedKey?: string | null
  onSelect?: (key: string) => void
  /** Rendered instead of rows when rows.length === 0. Required, and never a
   *  skeleton: a skeleton implies content of this shape is arriving. (10 §4.2) */
  empty: ReactNode
  /** Shown in the header: "247 entries". An append-only ledger whose length
   *  you cannot see is not obviously append-only. (12 §6.11) */
  total?: number
  /** When the view is hiding something, the view says so. (12 §3.33) */
  truncatedNotice?: string
}
```

```css
.tbl        { width: 100%; background: var(--surface);
              box-shadow: var(--elev-0); border-radius: var(--radius); }
.tbl-head   { font-family: var(--font-mono); font-size: var(--text-ledger);
              line-height: var(--lh-ledger); letter-spacing: var(--ls-ledger);
              text-transform: uppercase; color: var(--foreground-muted);
              background: var(--surface-sunken);
              border-bottom: 1px solid var(--line-default); }

/* Header row height MUST equal body row height. (12 §2.8, Carbon) */
.tbl[data-scale='interactive'] .tbl-head,
.tbl[data-scale='interactive'] .tbl-row { height: var(--row-interactive); }
.tbl[data-scale='data']        .tbl-head,
.tbl[data-scale='data']        .tbl-row { height: var(--row-data); }
.tbl[data-scale='compact']     .tbl-head,
.tbl[data-scale='compact']     .tbl-row { height: var(--row-data-compact); }

/* Rules, not zebra stripes. 12 §3.26 (Ström, against Carbon): our warm-paper
   surfaces are already a two-tone system and striping would fight the
   --surface-sunken selection state. */
.tbl-row       { border-bottom: 1px solid var(--line-subtle);
                 transition: background-color var(--hover-out) var(--ease-move); }
.tbl-row:last-child { border-bottom: 0; }
.tbl-row:hover { background: var(--surface-sunken); transition-duration: var(--hover-in); }
.tbl-row[aria-selected='true'] {
  background: var(--selected-surface);
  box-shadow: inset 2px 0 0 0 var(--selected-rail);  /* ink, not the accent — 10 §3.6 */
}
/* Selecting dims the rest rather than brightening the selection. 12 §3.10 */
.tbl[data-has-selection='true'] .tbl-row:not([aria-selected='true']) { opacity: var(--opacity-dim); }

.tbl-cell { padding-inline: var(--space-5); font-size: var(--text-body); min-width: 0; }
.tbl-cell[data-align='end'] { text-align: right; font-variant-numeric: tabular-nums; }
.tbl-cell[data-mono='true'] { font-family: var(--font-mono); font-size: var(--text-meta); }
```

Backgrounds are reserved for a **domain shift** — a totals row, a chain-break boundary — and
nothing else (`12 §2.8`). A chain break truncates the view with a banner rather than rendering a
red row in a sea of green ones, because everything below a break is unverified and drawing it
normally would be a lie (`12 §5.6`).

### 4.4 `StageTimeline`

Replaces `components/agent-pipeline.tsx` (163 lines) outright. That component maps five states
to four colours correctly at `:8-15` and then undoes it: `shadow-[0_0_8px_…]` glow on
`done` (`:20`) and `failed` (`:26`), and `animate-pulse` on `held` (`:33`). `12 §4` says remove
both — glow adds a visual weight channel that competes with shape and weight, and pulsing `held`
implies work is happening when the system is idle awaiting a person.

```ts
// shared/ui/timeline/stage-timeline.tsx
export interface Stage {
  id: string
  index: string                  // "04" — fixed, so the rail is legible before anything runs
  label: string                  // "Routing"
  state: StageState
  /** ISO. Drives the measured dwell counter. Null until the stage starts. */
  at: string | null
  /** Frozen final elapsed. Null while running or never run. NEVER 0 as a stand-in. */
  elapsedMs: number | null
  /** One short clause, sentence case, BACKEND-AUTHORED. Never templated in the UI. */
  headline: string | null
  /** An ABSENT key renders nothing. A key set to 0 renders "0". These mean
   *  different things and Partial<> enforces the difference. (01 §3.9) */
  counts?: Partial<Record<'allow'|'deny'|'evidence'|'claims'|'conflicts'|'candidates', number>>
  /** Dependent-count box on a collapsed row: "evidence ▸ 12". A row with no
   *  children has no box. (12 §3.7, Honeycomb) */
  childCount?: number | null
  model?: string | null
  auditSequences?: number[]
}

export interface StageTimelineProps {
  stages: Stage[]                // ALWAYS all 11, ALWAYS canonical order, from t=0
  activeId?: string | null
  onSelect?: (id: string) => void
  orientation?: 'vertical' | 'horizontal'   // default vertical
  density?: Density                          // default 'compact'
  /** Renders the stage's panel INLINE beneath its row rather than in a rail.
   *  Temporal opens a child workflow inline without navigating away, so the
   *  parent context is never lost. (12 §2.2) */
  renderPanel?: (stage: Stage) => ReactNode
}
```

Three non-negotiables, all `12 §3`:

1. **All eleven rows exist as `pending` at t=0.** SSE events *mutate* rows; they never append
   them. Zero layout shift by construction — a better fix than any animation (`12 §2.10`).
2. **There is no `pulse` prop.** Pulsing is derived from `state === 'active'`.
   `agent-pipeline.tsx` today lets a caller pulse a finished stage.
3. **A collapsed row advertises what is hidden under it.**

```css
.stage-row       { display: grid; grid-template-columns: 18px 24px 1fr auto;
                   gap: var(--space-4); align-items: start;
                   padding-block: var(--pad-compact);
                   border-bottom: 1px solid var(--line-subtle); }
.stage-row:last-child { border-bottom: 0; }
.stage-index     { font-family: var(--font-mono); font-size: var(--text-meta);
                   color: var(--foreground-muted); }
.stage-label     { font-size: var(--text-body); font-weight: var(--weight-medium); }
.stage-headline  { font-size: var(--text-ui); color: var(--foreground-secondary);
                   max-width: 66ch; }

/* The causal link. Driven by stage N's terminal event; never runs on mount,
   never loops. 04 §3.4 — the one transition worth getting perfect. */
.stage-connector { transform-origin: left center; transform: scaleX(0);
                   background: var(--line-strong); }
.stage-connector[data-state='drawn'] {
  background: var(--sovereign);
  animation: stage-connector-draw var(--dur-state) var(--ease-move) 90ms forwards;
}
/* Out of a denied, failed or blocked stage the connector does NOT draw. The
   absence of the line is the statement: the flow stopped here. */
.stage-connector[data-state='severed'] {
  transform: scaleX(1);
  background: repeating-linear-gradient(90deg, var(--line-strong) 0 3px, transparent 3px 6px);
}
@keyframes stage-connector-draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes stage-glyph-in { from { transform: scale(0.6); opacity: 0; }
                            to   { transform: scale(1);   opacity: 1; } }
.stage-marker[data-state='done']   .stage-glyph,
.stage-marker[data-state='denied'] .stage-glyph,
.stage-marker[data-state='failed'] .stage-glyph {
  animation: stage-glyph-in var(--dur-tick) var(--ease-enter) forwards;
}

/* The denial dim: ONE wrapper, ONE property, ONE composited layer. Never
   filter: saturate() — that forces a stacking context and a full-surface GPU
   pass over 11 rows. 04 §3.5. */
.stage-board[data-interrupted] .stage-row:not([data-state='denied']):not([data-state='failed']) {
  opacity: var(--opacity-dim);
  transition: opacity var(--dur-hold) var(--ease-move);
}
.stage-reason      { display: grid; grid-template-rows: 0fr;
                     transition: grid-template-rows var(--dur-hold) var(--ease-enter); }
.stage-reason > *  { overflow: hidden; }
.stage-row[data-state='denied'] .stage-reason,
.stage-row[data-state='failed'] .stage-reason { grid-template-rows: 1fr; }
```

`StageDwell` is `04 §3.3` verbatim: `setInterval` at 10 Hz (not rAF — it is a text-node update
that must keep running when the tab is backgrounded so the reading stays truthful),
`tabular-nums` so the row does not reflow ten times a second, frozen at its final value on the
terminal event. **It is a measured elapsed counter, not a progress bar. There is no determinate
progress bar for an LLM stage anywhere in this product, permanently** (`04 §9`, cut #10).

### 4.5 `EvidenceChip`

The citation *is* the chip; one component, not two (`01 §6.3.6`).

```ts
// features/evidence/ui/evidence-chip.tsx
export interface EvidenceChipProps {
  id: string                     // "V9"
  /** Absent => the chip renders DANGLING. A citation to nothing is a finding,
   *  not inert text: a model citing [S7] when the ledger holds six items is
   *  hallucinating, and this is a feature to demo, not an error to hide. (01 §4.2) */
  evidence?: {
    modality: EvidenceModality
    /** The source's SHORT NAME, never an opaque number: "[P-101 datasheet +2]"
     *  beats "[3]". (12 §3.21, Perplexity) */
    shortName: string
    locatorLabel: string         // "p.7" | "B14" | "exit 0"
    /** Null when the producer reports no confidence. NEVER defaulted — this
     *  nullability is what removes the home of the invented 0.95. (01 §4.1) */
    confidence: number | null
    /** True when every re-anchor strategy failed. Renders hollow, and the
     *  popover uses cause-agnostic C2PA wording. It does NOT point at page 1.
     *  (12 §3.15) */
    orphaned?: boolean
  }
  /** Additional sources behind this one claim; drives "+N" and the popover's
   *  "1 / N" stepper, which is also the entry point to the conflict view. */
  overflow?: number
  /** Tints the chip's LEFT EDGE only. A full colour fill at 11px reads as
   *  decoration; a 2px edge reads as a state. (01 §4.2) */
  verdict?: Verdict
}

export const MODALITY_GLYPH: Record<EvidenceModality, string> = {
  DOCUMENT: '¶', FILE: '⎗', VISION: '◱',
  CALCULATION: '∑', EXECUTION: '⌘', HUMAN: '☑',
}
```

```css
.ev-chip {
  display: inline-flex; align-items: center; gap: var(--space-2);
  margin-inline: var(--space-1);
  min-height: 24px;                      /* 24px hit area at an 11px glyph — 01 §7.3 */
  padding-block: 3px; padding-inline: var(--space-3);
  vertical-align: middle; transform: translateY(-1px);
  font-family: var(--font-mono); font-size: var(--text-meta);
  font-variation-settings: 'wght' var(--weight-mono);
  color: var(--foreground);
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: 0 0 0 1px var(--control-default);
  transition: box-shadow var(--hover-out) var(--ease-move);
}
.ev-chip:hover         { box-shadow: 0 0 0 1px var(--foreground);
                         transition-duration: var(--hover-in); }
.ev-chip:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.ev-chip-glyph         { color: var(--foreground-muted); }

.ev-chip[data-verdict='VERIFIED']     { box-shadow: 0 0 0 1px var(--control-default),
                                                    inset 2px 0 0 0 var(--sovereign); }
.ev-chip[data-verdict='CONFLICTED']   { box-shadow: 0 0 0 1px var(--control-default),
                                                    inset 2px 0 0 0 var(--critical); }
.ev-chip[data-verdict='NEEDS_REVIEW'] { box-shadow: 0 0 0 1px var(--control-default),
                                                    inset 2px 0 0 0 var(--approval); }
.ev-chip[data-verdict='UNSUPPORTED']  { box-shadow: 0 0 0 1px var(--control-default),
                                                    inset 2px 0 0 0 var(--foreground-muted); }

.ev-chip[data-orphaned='true'] { background: transparent; color: var(--foreground-muted);
                                 box-shadow: 0 0 0 1px var(--control-default); }
.ev-chip[data-dangling='true'] { color: var(--critical-text); text-decoration: line-through;
                                 box-shadow: 0 0 0 1px var(--critical-border); }
```

The popover (`@base-ui/react` `Popover`, `--elev-2`, `--radius-md`, `--z-menu`) carries source
name, locator, the exact quote, a `1 / N` stepper, and exactly one action — `Open source →`,
which pushes the **inspector rail**, never a modal.

The cross-link costs nothing and sells everything (`04 §3.6`): the chip and its ledger row share
`data-ev={id}`, and touching either outlines the other at `--dur-tick`. One property change, no
JS in the animation path.

### 4.6 `VerdictBadge`

```ts
// features/verification/ui/verdict-badge.tsx
type VerdictBadgeBase = {
  size?: 'inline' | 'row' | 'headline'
  /** "1 of 14 claims in this run carry this verdict" — Honeycomb's Minigraph
   *  idea, so a lone UNSUPPORTED reads as a proportion rather than an orphan.
   *  (12 §2.3, §5.3) */
  cohort?: { withThisVerdict: number; total: number }
}
/** `reason` is REQUIRED for the two verdicts that mean "a human must act".
 *  A badge that says UNSUPPORTED without saying why is the failure mode of
 *  every compliance dashboard. Make it a type error. (01 §6.3.5) */
export type VerdictBadgeProps =
  | (VerdictBadgeBase & { verdict: 'UNSUPPORTED' | 'CONFLICTED'; reason: string })
  | (VerdictBadgeBase & { verdict: 'VERIFIED' | 'SUPPORTED' | 'NEEDS_REVIEW'; reason?: string })
```

Rendering is always `glyph + LABEL`, never one without the other (`12 §2.9`, PatternFly:
*"status icons require text labels or additional context and should never communicate severity
alone"*). Exact glyph, fill, border and text per verdict in §5.2.

```css
.verdict        { display: inline-flex; align-items: center; gap: var(--space-3);
                  font-family: var(--font-mono); font-size: var(--text-meta);
                  letter-spacing: var(--ls-meta); text-transform: uppercase;
                  padding: 2px var(--space-3); border-radius: var(--radius-xs); }
.verdict-glyph  { font-size: 11px; line-height: 1; }
.verdict[data-size='headline'] { font-size: var(--text-ui); padding: 3px var(--space-4); }
```

### 4.7 `MetricTile`

```ts
// shared/ui/data/metric-tile.tsx
export interface MetricTileProps {
  label: string
  /** null renders "unavailable" with the method still shown. NEVER a zero. */
  value: string | number | null
  unit?: string
  tone?: Status                  // absent => ink
  provenance: Provenance         // <- REQUIRED. This is the point of the component.
  trend?: { direction: 'up' | 'down' | 'flat'; detail: string }
}
```

```
┌────────────────────────────────────┐
│ EXTERNAL CALLS                     │  --text-ledger mono uppercase +0.06em,
│                                    │  --foreground-muted            (11 §4.9)
│ 0                       [ source ] │  --text-display mono tabular, 100% ink
│ psutil · 2s poll · 14:32:07        │  --text-meta mono, --foreground-muted
└────────────────────────────────────┘
```

That pairing — **quiet mono caption above, loud numeral below** — is `11 §2.5`'s most portable
finding: *"that pairing is the entire visual grammar of 'this was counted, not claimed'."*

`<ProvenanceChip/>` is the `[ source ]` affordance, bottom-right, a `<Link/>` when
`provenance.href` is present. `measuredAt: null` renders the literal string `age unknown`.

**Rewriting `security-view.tsx`'s `127.0.0.1 : 8000` and `127.0.0.1 : 3000` tiles
(`:199`, `:214`) as `MetricTile` is impossible** — there is nothing to put in `provenance`,
because neither is measured. That is the mechanism working: the engineer must wire the real
field or delete the tile (`01 §6.3.7`).

### 4.8 `InspectorPanel`

One container for every stage panel, every rail body, every P&ID side panel — so a user learns
the interaction once.

```ts
// shared/ui/inspector/inspector-panel.tsx
export interface InspectorPanelProps {
  index: string                  // "04"
  title: string                  // "ROUTING"
  state: StageState
  subtitle?: string              // "router v3 · 4 candidates · 1 eligible"
  timing?: { durationMs: number | null; at: string | null }
  actions?: ReactNode
  /** Audit rows this panel is accountable for. ALWAYS rendered in the footer:
   *  every stage links to its own audit rows. */
  auditSequences?: number[]
  children: ReactNode
}

export function InspectorSection(p: {
  label: string; density?: Density; children: ReactNode
}): JSX.Element

export interface InspectorFieldProps {
  label: string
  /** null renders an em dash. THERE IS NO WAY TO PASS A FALLBACK. This is the
   *  anti-fabrication mechanism at the field level. (01 §6.3.2) */
  value: string | null
  mono?: boolean                 // default true — most inspector values are machine-issued
  copyable?: boolean
  truncate?: boolean
}
```

```css
.insp         { background: var(--surface); box-shadow: var(--elev-0);
                border-radius: var(--radius); }
.insp-head    { display: flex; align-items: baseline; gap: var(--space-4);
                padding: var(--pad-comfortable) var(--space-6);
                border-bottom: 1px solid var(--line-default); }
.insp-index   { font-family: var(--font-mono); font-size: var(--text-meta);
                color: var(--foreground-muted); }
.insp-title   { font-size: var(--text-heading); font-weight: var(--weight-medium);
                letter-spacing: var(--ls-heading); }
.insp-sub     { font-size: var(--text-ui); color: var(--foreground-secondary); }
.insp-section { padding: var(--pad-comfortable) var(--space-6);
                border-bottom: 1px solid var(--line-subtle); }
.insp-section-label { font-family: var(--font-mono); font-size: var(--text-ledger);
                letter-spacing: var(--ls-ledger); text-transform: uppercase;
                color: var(--foreground-muted); margin-bottom: var(--space-4); }
.insp-grid    { display: grid; grid-template-columns: 140px minmax(0, 1fr);
                row-gap: var(--space-3); column-gap: var(--space-6);
                font-size: var(--text-body); }
.insp-value   { font-family: var(--font-mono); font-size: var(--text-meta);
                font-variant-numeric: tabular-nums; min-width: 0; }
.insp-value[data-empty='true'] { color: var(--foreground-muted); }
.insp-foot    { padding: var(--space-4) var(--space-6); font-family: var(--font-mono);
                font-size: var(--text-meta); color: var(--foreground-muted); }
```

Every panel implements **exactly five states and may not render a sixth** (`01 §3.9`):
`pending` (hollow marker, no duration, no counts, body reads `Not reached.`), `loading` (no
skeleton anywhere — localhost resolves in ≤200ms), `live`, `failed/denied` (a `DenialCard`), and
`unavailable` (`This host cannot report on this stage. <what would be needed>.`).

### 4.9 `DenialCard`

The most important single component after the timeline, because it turns a refusal into a demo.
`01 §3.1`: *"a denial is not an error state, it is a correct outcome"* — and Demo 3 is entirely
a denial story.

```ts
// features/policy/ui/denial-card.tsx
export interface DenialCardProps {
  kind: 'policy' | 'sandbox' | 'egress' | 'injection' | 'file_guard' | 'integrity' | 'dimensional'
  /** Three-valued, never boolean. "No rule permitted this" is a different
   *  governance fact from "a rule prohibited this". (12 §3.32, AWS IAM) */
  outcome: 'explicit_deny' | 'implicit_deny'
  subject: { label: string; detail: string }[]     // a definition grid
  checks: { label: string; passed: boolean; detail?: string }[]
  /** Only the CONTRIBUTING rule by default. When an explicit deny wins, the
   *  deny is the ONLY entry. "Show all evaluated rules (14)" is a deliberate
   *  expansion. (12 §3.31, AWS IAM) */
  rule?: { id: string; file: string; line: number; excerpt: string; href: string }
  evaluatedCount?: number
  reason: string
  /** "nothing was executed; 0 bytes left this host." Carries its own
   *  Provenance: a containment line with no measurement behind it is
   *  security-view.tsx's old "0 outbound sockets opened" all over again.
   *  OMITTED ENTIRELY, never defaulted, when egress cannot be attributed
   *  to this task. (01 §3.4) */
  containment?: { statement: string; provenance: Provenance }
  /** When any part of the evaluation is withheld, SAY SO. Silence is worse
   *  than refusal. (12 §3.33 / §5.4 — IAM refuses to surface SCP detail and
   *  says that it is refusing) */
  withheld?: string
  auditSequences: number[]
}
```

```css
.denial      { background: var(--surface); border-radius: var(--radius);
               box-shadow: 0 0 0 1px var(--critical-border); }
.denial-head { display: flex; align-items: center; gap: var(--space-4);
               padding: var(--pad-comfortable) var(--space-6);
               background: var(--critical-surface);
               border-bottom: 1px solid var(--critical-border);
               color: var(--critical-text);        /* 5.34:1 on its own tint */
               font-size: var(--text-body); font-weight: var(--weight-strong); }
.denial-check[data-passed='false'] { color: var(--critical-text); }
.denial-check[data-passed='true']  { color: var(--foreground-secondary); }
.denial-rule { font-family: var(--font-mono); font-size: var(--text-meta);
               background: var(--surface-sunken);
               border-left: 2px solid var(--critical);
               padding: var(--space-4) var(--space-5);
               white-space: pre; overflow-x: auto; }
.denial-quote{ /* QUOTED FROM UNTRUSTED SOURCE — NOT EXECUTED */
               font-family: var(--font-mono); font-size: var(--text-meta);
               color: var(--critical-text);
               background: var(--critical-surface);
               border: 1px solid var(--critical-border);
               padding: var(--space-4) var(--space-5); }
```

No shake, no flash, no red strobe, no `sov-deflection-burst`. **The denial is loud because the
other ten stages went quiet** (`04 §3.5`). And the page around it stays completely normal:
`10 §2.4` (Sentry) — *"the error is the content, and the page around it stays completely
normal."*

### 4.10 `EmptyState`

```ts
export interface EmptyStateProps {
  /** Three different facts, three different messages: "No runs match this
   *  filter" ≠ "No runs exist" ≠ "You lack read permission on this
   *  namespace". (10 §4.4) */
  kind: 'never-populated' | 'filtered-out' | 'not-permitted'
  headline: string               // one plain sentence. No illustration, no mascot.
  /** What produces the thing that will appear here, and what marks its absence. */
  explanation: string
  action?: { label: string; onClick?: () => void; href?: string }
}
```

Every empty state names what will appear here, names what produces it, and offers the action
that starts it (`04 §5.6`). They fade in at `--dur-state`, **opacity only** — an empty state
that slides in draws attention to absence.

```
┌─ EVIDENCE ──────────────────────────────────────────────┐
│  No evidence registered yet.                            │
│                                                         │
│  Every page read, chunk retrieved, formula executed and │
│  sandbox run registers an item here with its source     │
│  file, page and hash. Claims that cite nothing in this  │
│  ledger are marked UNSUPPORTED.                         │
│                                                         │
│  Attach a document to begin.              [ Attach ]    │
└─────────────────────────────────────────────────────────┘
```

### 4.11 `ErrorState` (and its sibling `UnavailableState`)

Two components on purpose. Conflating them is how `registry-view.tsx:215` came to assert six
documents in an empty table (`01 §6.3.8`).

```ts
export interface ErrorStateProps {
  /** "Can't reach the API at 127.0.0.1:8000." — state, then next action, no
   *  apology and no blame. (11 §4.21, Stripe: "The card has expired. Check the
   *  expiration date or use a different card.") */
  headline: string
  nextAction: string
  /** Every failure surface carries a COPYABLE identifier. Consumer products
   *  soften errors to reduce churn; a plant inspector needs the code, the
   *  stage, the timestamp and the upstream cause. (10 §4.3) */
  identifier?: { label: string; value: string }
  /** The literal upstream message, mono, verbatim, never rewritten. */
  detail?: string
  retry?: () => void
}

/** "We cannot tell you, and here is what would be needed." NOT an error and
 *  NOT an empty state. This is what keeps the screen honest while the backend
 *  is half-built, and it is the state a judge is most likely to stumble
 *  into. (01 §3.9, 04 §5.6) */
export interface UnavailableStateProps {
  what: string                   // "Per-task egress attribution"
  whyUnavailable: string         // "This host does not scope socket samples to a task."
  whatWouldBeNeeded?: string
}
```

```css
.errstate      { background: var(--surface); border-radius: var(--radius);
                 box-shadow: 0 0 0 1px var(--critical-border);
                 padding: var(--pad-comfortable) var(--space-6); }
.errstate-head { font-size: var(--text-body); font-weight: var(--weight-medium);
                 color: var(--critical-text); }
.errstate-id   { font-family: var(--font-mono); font-size: var(--text-meta);
                 color: var(--foreground-secondary); }
.unavailable   { background: var(--surface-sunken); border-radius: var(--radius);
                 box-shadow: 0 0 0 1px var(--line-default);
                 padding: var(--pad-comfortable) var(--space-6);
                 color: var(--foreground-secondary); font-size: var(--text-body); }
```

---

## 5. The status and verdict vocabulary

Four hues. Five verdicts. Nine stage states. That arithmetic is the whole problem, and `12 §4`
hands over the answer: **hue is the scarcest channel, so spend it last.**

### 5.1 The channel priority

Four channels, applied in this order. A state must be unambiguous using only the channels above
the one that fails.

| Rank | Channel | Survives greyscale? | Survives a projector? | Survives a screen reader? |
|---|---|---|---|---|
| 1 | **Position** — a fixed slot in a fixed-order row | yes | yes | yes (order is read) |
| 2 | **Shape** — glyph silhouette: ■ □ ◇ ○ ⇄ ✓ ✕ ⏸ — | yes | yes | yes (label) |
| 3 | **Weight** — filled vs hollow; 400 vs 590 | yes | yes | no, but redundant |
| 4 | **Hue** — the four status colours | **no** | poorly | no |

`12 §2.9` (PatternFly): *"status icons require text labels or additional context and should
never communicate severity alone."* `10 §4.9`: a black-and-white printout of a run report must
still be unambiguous, and print is a real output here. Therefore: **every verdict and every
stage state carries a glyph AND a text label, always, at every size.** There is no icon-only
rendering of a status anywhere in this product.

The **filled / hollow** distinction is the second channel and it carries a fixed meaning
everywhere: **filled = we actively confirmed; hollow = we did not.** That reads correctly even
at 8px (`12 §4`).

### 5.2 The five verification verdicts

Fixed slot order, most → least severe as a *severity scale*, not a status palette. The summary
strip `■3 □2 ◇1 ○1 ⇄1` is then readable by position alone, at any size, in greyscale, and its
silhouette is memorable across runs (`12 §2.9`: 3–6 icons ordered most→least severe, paired with
counts, explicitly to avoid rainbow overload in tables).

| Slot | Verdict | Glyph | Weight | Fill (marker) | Border | **Text colour** | Measured on `--background` |
|---|---|---|---|---|---|---|---|
| 1 | `VERIFIED` | `■` filled square | 590 | `--sovereign` `#16a34a` | `--sovereign-border` | `--sovereign-text` `#0b7434` | **5.61:1** |
| 2 | `SUPPORTED` | `□` hollow square | 400 | none | `--control-default` | `--foreground` `#0a0a0a` | **18.46:1** |
| 3 | `NEEDS_REVIEW` | `◇` hollow diamond | 400 | none | `--approval-border` | `--approval-text` `#9a4f04` | **5.60:1** |
| 4 | `UNSUPPORTED` | `○` hollow circle | 400 | none | `--control-default` | `--foreground-muted` `#8a8783` † | 3.33:1 † |
| 5 | `CONFLICTED` | `⇄` double chevron | 590 | `--critical` `#dc2626` | `--critical-border` | `--critical-text` `#b91c1c` | **6.03:1** |

† **`UNSUPPORTED` is the one exception and it is deliberate.** `--foreground-muted` is 3.33:1,
which clears the 3:1 UI threshold but not 4.5:1 body. It is therefore only legal as the
**badge label at `--text-meta` 11px/590** paired with its glyph, *and the `reason` string
beneath it renders in `--foreground-secondary` `#5f5b57` (6.27:1)*. The `VerdictBadgeProps`
union makes `reason` mandatory for `UNSUPPORTED`, so the readable sentence always exists. If a
reviewer needs the muted treatment gone, `--contrast-lines: 1` does not affect it; ship
`--foreground-muted` unchanged and rely on the mandatory reason. *Rationale:* the muting is the
message. Red would say *wrong*; grey says *absent*, which is what the system actually found
(`12 §4`).

Why this and not five colours, restated so it is not relitigated:

- **Only the two extremes get hue.** `VERIFIED` and `CONFLICTED` are the two verdicts a judge
  must read across a room. The middle three are read, not glanced.
- **`SUPPORTED` deliberately has no colour.** It means *a source says so, nobody recomputed the
  arithmetic*. Giving it green would be the exact overclaim C2PA warns against (`12 §2.1`:
  *"do not attempt to determine the veracity of an asset for a user"*), and it is why `01 §4.4`
  already sets `--verdict-supported: var(--foreground)`.
- **`UNSUPPORTED` is muted, not red.** Absence is not wrongness — the IAM implicit-deny /
  explicit-deny distinction (`12 §2.11`) applied to evidence.
- **Rejected:** `04 §3.7`'s `SUPPORTED → --active`. `--active` means *a stage is running*;
  reusing it for a verdict makes a finished claim look like a live one.
- **Rejected:** `01 §4.4`'s `UNSUPPORTED → --critical` and `CONFLICTED → --approval`. That
  inverts the severity order relative to the glyph order and puts the loudest hue on the
  quietest finding.

**The verdict strip.** Five fixed slots, always all five, counts included, zeros shown:

```
■ 3   □ 2   ◇ 1   ○ 1   ⇄ 1          14 claims · 1 of 14 conflicted
```

Each slot is a filter toggle — the generalisation of Honeycomb's `Highlight errors` (`12 §5.3`).
A slot with a count of `0` is still drawn, greyed, and is not clickable: the shape of the strip
must be constant across runs or it stops being readable by position.

**In-place rendering.** Every claim carries its verdict glyph **in the left margin, before the
sentence** — the position channel, so the eye can scan the gutter alone (`12 §5.3`).
`UNSUPPORTED` and `CONFLICTED` render their explanation **inline and always expanded**; a reader
must not have to click to discover that a sentence they just read has nothing behind it
(`01 §4.4`). `VERIFIED` and `SUPPORTED` explanations are click-to-open.

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ ■  │ The governing location is CML-04 with a remaining wall of       │
  │    │ 8.4 mm [◱ report.pdf p.7], against a minimum allowable of       │
  │    │ 6.0 mm [¶ SOP-114 p.9].                                         │
  │    │                                                                 │
  │ ◇  │ The short-term corrosion rate is 0.22 mm/yr [∑ corrosion.rate]. │
  │    │                                                                 │
  │ ○  │ Inspection is due within 18 months.                             │
  │    │ ┌─ UNSUPPORTED ─ no evidence in this run's ledger maps to this  │
  │    │ │ claim. 1 of 14 claims in this run carry this verdict. [why →] │
  │    │ └───────────────────────────────────────────────────────────────│
  └──────────────────────────────────────────────────────────────────────┘
```

Underlining the claim span is **dropped**. `01 §4.4` proposes a coloured underline per verdict;
at `--text-answer` 15px on warm paper, four underline colours under running prose is the
rainbow-in-a-table failure `12 §2.9` names, and the gutter glyph already carries the state at
the position channel. One channel, done well.

### 5.3 The nine stage states

Seven from the brief plus `denied` and `unavailable` (conflict C8). Every row is unambiguous
with the colour column deleted.

| State | Glyph | Marker ring | Marker fill | Glyph colour | **Label colour** | Connector out | Motion |
|---|---|---|---|---|---|---|---|
| `pending` | `○` hollow ring, empty | 1px `--control-strong` | none | — | `--foreground-muted` | `idle` (not drawn) | **none** |
| `active` | `◐` ring + 6px dot | 1px `--active` | none | `--active` | `--foreground` | `idle` | dot `sov-pulse`; dwell counter ticking |
| `done` | `✓` | 1px `--sovereign` | `--sovereign` | `--on-sovereign` `#0a0a0a` (6.01:1) | `--foreground` | `drawn` → `--sovereign` | glyph scale-in `--dur-tick`; connector draw `--dur-state` at +90ms |
| `held` | `⏸` pause bar | 1px `--approval` | `--approval-surface` | `--approval-text` (4.91:1 on its own tint) | `--approval-text` | `idle` | **none** — it is waiting on a person, not working |
| `denied` | `⛔` shield-slash | **2px** `--critical` | `--critical` | `--on-critical` `#ffffff` (4.83:1) | `--critical-text` | `severed` (dashed) | the interrupt: `--dur-hold` board dim + reason expand |
| `failed` | `✕` | 1px `--critical` | `--critical-surface` | `--critical-text` (5.09:1 on its own tint) | `--critical-text` | `severed` | **none** — quiet outline and an error string |
| `skipped` | `—` | 1px **dashed** `--line-strong` | none | `--foreground-muted` | `--foreground-muted` | thin rule | **none** |
| `blocked` | `⊘` circle-slash | 1px **dashed** `--line-strong` | none | `--foreground-muted` | `severed`, struck through | `--foreground-muted`, label suffix **`not reached`** | **none** |
| `unavailable` | `?` | 1px `--line-default` | none | `--foreground-muted` | `--foreground-muted` | `idle` | **none** |

Two distinctions carry the whole demo and must not be blurred:

1. **`denied` ≠ `failed`.** `04 §3.2`: *"a denial is the product working; a failure is a bug. A
   denial gets the heavy treatment, a solid fill, and takes over the screen. A failure gets a
   quiet outline and an error string. Conflating them means either our crashes look like
   security or our security looks like a crash."* `denied` is the only state that gets a 2px
   ring, a solid fill and an inverted glyph — three channels at once, because it is the single
   most important thing the product does.
2. **`blocked` ≠ `skipped` ≠ `pending`.** `12 §2.11` (Airflow's `upstream_failed`): if `policy`
   denies, stages 5–10 are not *failed*, they are *not reached*. `skipped` says **the system
   chose not to** (no numeric claims, so no calculation). `blocked` says **the system correctly
   stopped upstream**. `pending` says **we do not know yet**. `01 §3.9` calls this exact
   distinction the difference between "the system broke" and "the system correctly stopped",
   "which is the single most important thing our demo must communicate."

`lib/types.ts:64` currently ships `'pending' | 'active' | 'done' | 'failed' | 'held' |
'skipped'` — six. Three are missing and one (`done`) is retained. See §9 step 7 for the exact
type change and its `tsc` consequences.

### 5.4 Greyscale and projector proof

Convert §5.2 and §5.3 to greyscale and the encoding survives because:

| Rendering | `done` | `failed` | `held` | `blocked` | `denied` |
|---|---|---|---|---|---|
| Glyph | `✓` | `✕` | `⏸` | `⊘` | `⛔` |
| Ring | solid 1px | solid 1px | solid 1px | **dashed** 1px | solid **2px** |
| Fill | **solid** | tint | tint | none | **solid** |
| Connector out | drawn | severed | idle | severed + strike | severed |

No two rows share all four. The same holds for the five verdicts: glyph silhouette
(`■ □ ◇ ○ ⇄`) is distinct before fill, and fill (`solid / hollow`) separates slot 1 and 5 from
the middle three.

`ClassificationTag` in `primitives.tsx:116-127` and `StatusIndicator` at `:86-113` both violate
this today — `StatusIndicator` renders a 1.5px coloured dot plus a label **set in the status
colour** (`:110`), which is `--sovereign` at 3.07:1 for `DELIVERED`. §9 step 4 rewrites both
against this table.

### 5.5 The one thing that must never be added

A **green tick beside a provenance mark**. C2PA is explicit (`12 §2.1`): *"do not add a valid
status, as the icon alone should already indicate the presence of a valid manifest."* Stacking a
validity badge on a provenance mark teaches users that the absence of a tick means invalid, when
it usually means *unknown*. Our equivalent temptation is a green shield beside the sovereignty
indicator in the status strip. Don't. See §10.

---

## 6. The sign-in page

**Verdict on `11 §5.3`: adopt, with six amendments.** The measured proposal is right — the
column width, the type sizes, the vertical rhythm, the microcopy and the error shapes all ship
as written. The amendments are where its numbers collide with the token set in §2, plus two
honesty problems it did not catch.

### 6.1 The six amendments

| # | `11 §5.3` says | **Amendment** | Why |
|---|---|---|---|
| A1 | Controls at `352 × 40`, gap 16 | **Keep 40px height** — it is `--control-lg` — but bind the label to `--text-body` 13/20, not the 14px the proposal implies for inputs. | §2.5 locks control heights to 32/36/40 with font size bound to each (`10 §3.22`). 40px with a 13px label is the `lg` row exactly. The iOS-zoom argument for 16px inputs (`11 §3.D`) does not apply: this product does not ship to mobile Safari. |
| A2 | `Password  ·  Forgot?` on the label row | **Delete `Forgot?`.** | There is no password-reset path in an air-gapped build with no mail transport. A link to nothing is the smallest possible version of the credibility contradiction `11 §5.1.2` is about. The `labelAction` slot on `Input` stays for the reveal toggle. |
| A3 | A footer proof line: *"Every action in this workbench is written to an append-only log."* | **Ship it only if `backend/core/audit.py` appends on every authenticated action, and say `append-only`, never `immutable`.** If the audit writer is not yet unconditional, ship the mono build strip alone. | `11 §2.7`: Sigstore says *tamper-resistant*, not *tamper-proof*. The proposal's own rule — *"only ship this sentence if it is true"* — applied to itself. |
| A4 | Mono build strip: `AEGIS 0.9.3 · api 127.0.0.1:8000 · build 4f2c1a9 · offline` | **Drop the `offline` token.** Keep version, api host and build sha. | `offline` cannot be derived at build time and a browser cannot detect an air gap. `04 §5.5` makes the same call on `AIR-GAPPED 127.0.0.1` → `LOCAL 127.0.0.1`: we can detect that the API is on loopback; we cannot detect the deployment. |
| A5 | Secondary action: a 352×40 outlined button reading `Continue as a sample role ›` | **Make it a `secondary` button that opens a `@base-ui/react` `Select` of the roles, and label it `Demo roles`.** The role is chosen in the select; the button label never interpolates a role name. | `11 §6.1` kills `Authorize & Enter as Engineer`. A button whose label changes with a dropdown is the same construction one step removed. `Teleport's bare noun phrases` (`11 §4.16`) → the control is called what it is. |
| A6 | Focus: border → `#0a0a0a` + 3px `rgba(10,10,10,0.08)` halo | **Adopt for inputs** (it is `.field-input:focus` in §4.2 at 4px) **and use the gap ring `--focus-ring` for the two buttons.** | Two different controls, two different grounds. The halo on a 1px-edged input; the gap ring on a filled button, where a halo would be invisible against ink. |

Everything else in `11 §5.3` ships unchanged, including the 352px column, the 20px/500 `h1`, the
sub-line, the divider, the `OR` label, the caption, and every string in `11 §6.1`.

### 6.2 The specification

Ground `--background #f7f7f5`. The **only** `#ffffff` on the page is the two input fields, which
makes the two things the user must touch the brightest objects on screen and gives the second
neutral a job rather than a mood (`11 §5.2`). No card, no panel, no split, no background art, no
glow, no pulse, no animation of any kind — *nothing in the credible set animates on an auth
screen* (`11 §5.4`).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  --background  #f7f7f5                                        1440 × 900     │
│                                                                              │
│                            ←  196px empty  →                                 │
│                                                                              │
│                  ┌──────────────────────────────────┐  352px  (x 544 → 896)  │
│                  │  ◆ AEGIS                         │  mark 20px + wordmark  │
│                  │                                  │  --text-heading 16/24  │
│                  │  ── 24 ──                        │  weight 510, -0.01em   │
│                  │  Sign in                         │  --text-title 20/28    │
│                  │                                  │  weight 510, -0.015em  │
│                  │  ── 8 ──                         │  --foreground          │
│                  │  This workbench runs on the      │  --text-body 13/20     │
│                  │  machine in front of you.        │  --foreground-secondary│
│                  │                                  │  48 chars              │
│                  │  ── 24 ──                        │                        │
│                  │ ────────────────────────────────  1px --line-default      │
│                  │  ── 24 ──                        │                        │
│                  │  Email                           │  --text-ui 12/16 / 510 │
│                  │  ┌────────────────────────────┐  │  --foreground-secondary│
│                  │  │ operator@site.local        │  │  Geist SANS (P4)       │
│                  │  └────────────────────────────┘  │  352×40, bg --surface  │
│                  │                                  │  1px --control-default │
│                  │  ── 16 ──                        │  r4, --text-body       │
│                  │  Password                 [ 👁 ] │  labelAction = reveal  │
│                  │  ┌────────────────────────────┐  │  24×24 hit area        │
│                  │  │ ••••••••••••               │  │  352×40                │
│                  │  └────────────────────────────┘  │                        │
│                  │                                  │                        │
│                  │  ── 20 ──                        │                        │
│                  │  ┌────────────────────────────┐  │  352×40, r4            │
│                  │  │          Sign in           │  │  primary: ink on paper │
│                  │  └────────────────────────────┘  │  --text-body / 510     │
│                  │                                  │                        │
│                  │  ── 24 ──                        │                        │
│                  │  ─────────── OR ───────────────  │  1px --line-default    │
│                  │                                  │  --text-ledger 10/14   │
│                  │  ── 24 ──                        │  +0.06em --fg-muted    │
│                  │  ┌────────────────────────────┐  │  352×40, secondary     │
│                  │  │  Demo roles            ▾   │  │  base-ui Select        │
│                  │  └────────────────────────────┘  │                        │
│                  │  ── 8 ──                         │                        │
│                  │  For evaluation. No data is      │  --text-meta 11/16     │
│                  │  written to the audit log.       │  --foreground-muted    │
│                  └──────────────────────────────────┘                        │
│                                                                              │
│                            ←  72px empty  →                                  │
│                                                                              │
│        Every action in this workbench is written to an append-only log.      │
│                  --text-body / --foreground-secondary / centred              │
│                                  ── 16 ──                                    │
│            AEGIS 0.9.3  ·  api 127.0.0.1:8000  ·  build 4f2c1a9              │
│         --text-ledger mono / +0.06em / --foreground-muted / centred          │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Column width: 352px.** Linear ships 288, Vercel 320 (`11 §2.1`, `§2.2`); 352 because the mono
build strip needs ~44 characters at `--text-ledger` and because a 40px control reads cramped
below ~320.

**Vertical rhythm, top of column to bottom:**
`logo → 24 → h1 → 8 → sub → 24 → rule → 24 → email → 16 → password → 20 → primary → 24 →
divider → 24 → secondary → 8 → caption → 72 → proof line → 16 → build strip.`
Column height ≈ 508px, so on a 900px viewport it sits with ≈196px above — inside the 17–29%
band measured across the whole credible set (`11 §3.C`).

**Type sizes, final:**

| Element | Token | Computed | Weight | Tracking | Colour | Contrast on `#f7f7f5` |
|---|---|---|---|---|---|---|
| Wordmark | `--text-heading` | 16/24 | 510 | −0.01em | `--foreground` | 18.46:1 |
| `h1` "Sign in" | `--text-title` | 20/28 | 510 | −0.015em | `--foreground` | 18.46:1 |
| Sub-line | `--text-body` | 13/20 | 400 | 0 | `--foreground-secondary` | 6.27:1 |
| Field label | `--text-ui` | 12/16 | 510 | 0 | `--foreground-secondary` | 6.27:1 |
| Input value | `--text-body` | 13/20 | 400 | 0 | `--foreground` on `--surface` | 21.0:1 |
| Button label | `--text-body` | 13/20 | 510 | 0 | `--background` on `--foreground` | 18.46:1 |
| `OR` | `--text-ledger` | 10/14 | 425 mono | +0.06em | `--foreground-muted` | 3.33:1 ‡ |
| Caption | `--text-meta` | 11/16 | 400 | +0.01em | `--foreground-muted` | 3.33:1 ‡ |
| Proof line | `--text-body` | 13/20 | 400 | 0 | `--foreground-secondary` | 6.27:1 |
| Build strip | `--text-ledger` | 10/14 | 425 mono | +0.06em | `--foreground-muted` | 3.33:1 ‡ |

‡ These three are **decorative or redundant** and are the only sub-4.5:1 text on the page: `OR`
is a structural label whose meaning is carried by the rule it sits on; the caption restates what
the `Demo roles` control already says; the build strip is diagnostic. Everything load-bearing —
headline, sub-line, labels, values, button, proof line, and every error string — clears 4.5:1.
If the founder wants the caption at AA, move it to `--foreground-secondary` (6.27:1); it costs
nothing.

**The 18px question.** `11 §3.A` measures Linear's auth `h1` at 18px and Tailscale's at 20px,
against marketing `h1`s of 64–88px, and concludes *"that single decision is most of why the page
looks bad: it is marketing typography on a utility screen."* The current page runs
`text-5xl font-extrabold` (48px/800) in a brand panel plus `text-2xl font-bold` (24px/700) over
the form (`sign-in-view.tsx:147`, `:201`). We take **20px/510**: Tailscale's size at Linear's
restraint, and it is already a token (`--text-title`), so nothing is bespoke.

### 6.3 What is deleted from `sign-in-view.tsx`

| Lines | Thing | Why |
|---|---|---|
| `:116-189` | The entire left brand panel — 7-of-12 columns, `AnimatedTechnicalBackground`, the `--sovereign` radial glow at `:120-123`, the pulsing `AIR-GAPPED 127.0.0.1` pill at `:129-135`, the 48px `font-extrabold` hero at `:147`, the two posture tiles at `:174-188` | `11 §3.F`: *"nobody's good sign-in page has a marketing panel."* The glow and the pulse are *"the exact visual register of a crypto landing page"* (`11 §5.1.1`). |
| `:25-33`, `:88-99`, `:210-245`, `:384-409` | Every Firebase and Google path: the imports, `handleGoogleSignIn`, the `Firebase Auth / Demo Persona` tab pair, the inline four-colour Google `<svg>` | `11 §5.1.2` rates this *"the single highest-severity item in this document"*: a cloud identity provider advertised 200px below the words `AIR-GAPPED 127.0.0.1`. It is a credibility contradiction, not a styling problem. `01 §9 List B` deletes `lib/firebase.ts` and the dependency with it. |
| `:480-483` | `Default-Deny Policy · 127.0.0.1:8000 · Zero Outbound Egress` | Printed before a session exists. The file's own comment at `:160-173` establishes the right principle and this line violates it eleven lines later. |
| `:198-200` | `SESSION AUTHENTICATION` mono eyebrow | The `h1` already says it (`11 §6.1`). |
| `:302-307`, `:324-329` | `EMAIL ADDRESS` / `PASSWORD` in Geist Mono 10px at 0.16em | P4. Mono is for machine values; *"when everything is mono, nothing is"* (`11 §5.1.4`). |
| `:415-417` | `SELECT WORKBENCH CLEARANCE LEVEL` | A Drata sentence (`11 §6.1`). → `Demo roles`. |
| `:473` | `` `Authorize & Enter as ${activePersona.label}` `` | Verbing an abstraction; amendment A5. |
| `:354-370` | `SovButton arrow` with `Sign In with Firebase` / `Authenticating...` | The primary button says the action, not the vendor; and nobody says "authenticating" out loud (`11 §6.1`). → `Sign in` / `Signing in…`. |

Net: **~490 lines → ~150 lines**, and `AnimatedTechnicalBackground`, `ThreeDLayerView` and
`firebase` lose their last consumer on this route.

### 6.4 Error, loading and success states

Stripe's diagnostic pattern throughout: **state, then next action, no apology, no blame**
(`11 §4.21`).

| Condition | Where | Exact copy | Treatment |
|---|---|---|---|
| Field invalid (client) | under the field, 4px gap | `Enter an email address.` | `.field-error`, `--critical-text` `#b91c1c` (6.03:1); field `aria-invalid`, ring `--critical` |
| Bad credentials | one line above the primary button | `Email or password is incorrect.` | `--text-ui`, `--critical-text`. **One message for both fields** — never reveal which was wrong. No "Authentication failed", no exclamation, no "Oops". |
| Rate-limited | same | `Too many attempts. Try again in 5 minutes.` | what happened, what to do, when |
| Backend unreachable | same | `Can't reach the API at `<code>127.0.0.1:8000</code>`.` | the host in Geist Mono — this is the one error where naming the machine fact is the most useful thing we can do |
| Weak password (sign-up) | under the field | `Use at least 6 characters.` | imperative, no "should" |
| Email taken | under the field | `That email already has an account. Sign in instead.` | no "Please" — it is an apology for the user's own action |
| Account created | above the form | `Account created. Sign in to continue.` | no "successfully", no `!` |
| Submitting | in the button | `Signing in…` | 14px spinner inside the button; **the button keeps its width so the layout does not jump** |
| Recorded failure | under the error line, only if the backend returns a real id | `Recorded · evt_7f3c9a2` | `--text-ledger` mono, `--foreground-muted`. `11 §5.5`: *"ship it only if the id is real. If it is not real, ship nothing."* A product whose thesis is "everything is auditable" proving it on the failure path, before you are even logged in, is the single most on-brand detail available to us. |

Errors are **never** a toast and **never** a modal (`11 §5.5`). A toast that fades takes the
diagnostic with it.

### 6.5 The demo-role affordance

It survives — it is genuinely needed — but it is demoted below the divider, labelled as an
evaluation affordance, and it stops using the word "clearance".

```tsx
// features/auth/ui/demo-roles.tsx
export interface DemoRolesProps {
  roles: { id: RoleId; label: string; description: string }[]
  onContinue: (id: RoleId) => Promise<void>
  busy?: boolean
}
```

Rendered as a `@base-ui/react` `Select` in a `secondary` `Button` shell, 352×40, `--radius`,
`--elev-2` on the popup, `--radius-menu-row` on the rows, `--menu-pad` 4px, rows at
`--row-interactive` 36px (`10 §3.24`, the concentric popover). Each row is
`label` in `--text-body`/510 with `description` in `--text-ui`/`--foreground-secondary`
beneath; the role id renders right-aligned in `--text-meta` mono.

Choosing a role submits immediately. There is no second confirm step and no separate
`Continue as …` button, because the select *is* the decision.

Caption beneath, `--text-meta`, `--foreground-muted`:
`For evaluation. No data is written to the audit log.`

**Only ship that sentence if it is true.** If demo sessions *do* write audit entries — which
would be the better behaviour — the sentence becomes
`For evaluation. Sessions are recorded in the audit log like any other.`
`11 §5.4` pre-empts the judge question "so is the audit trail fake?" by answering it before it
is asked; answering it wrongly is worse than not answering it.

---

## 7. The thread surface (the primary screen)

This replaces the console. What the console was for was never clear — `console-view.tsx` opens
with a 64px `font-extrabold` three-line headline, a faint radial diagram driven by a hand-written
stage→node mapping (`:380-400`), a telemetry row containing one live value and two literals
(`:444-465`), and a dispatcher buried 480px below the fold. It is a landing page wearing a
product's clothes, and the dead space is what happens when a marketing hero and a command input
are asked to share a viewport.

### 7.1 What this page is FOR

**One sentence: it is where a person asks the machine to do something, watches it do it, and
checks its work — in that order, in one column, without navigating.**

Three consequences, each of which kills something currently on the page:

1. **The composer is the first thing on screen, not the fourth.** A thread with no messages
   opens with the composer roughly a third of the way down a mostly-empty column and three
   template cards beneath it. There is no headline. `11 §3.C` measures 17–29% of the viewport
   empty above the first element across the entire credible set; that emptiness is the
   composure, and it does not need a slogan in it.
2. **The architecture diagram is deleted, not rebuilt.** `SovereignRadialHero` (311 LOC) is
   driven by `console-view.tsx:380-400`, a hand-written mapping from stage id to node id that
   duplicates routing logic the backend owns, and `04 §1.4` catalogues its hardcoded
   `Qwen 2.5 72B-Instruct`, `14.8 GB VRAM`, `42,890 Embeddings`, `gVisor Kernel` and
   `Append-Only Merkle` — a model this host cannot run, a sandbox that does not exist, and a
   chain that is unbuilt. The thing it was for — explaining the architecture at a glance — is
   done honestly and better by the eleven-stage work log actually running. The diagram, if it
   survives anywhere, belongs on the marketing landing page, which is not this document's
   problem.
3. **There is no separate `/ask` and no separate `/tasks`.** `01 §2.3` already argues the merge:
   *"two dispatchers is a product smell; Ask is the console with `format: 'answer'`."* Under
   chat-first they are the same control with a deliverable-format segment, and a task is an
   assistant turn.

The page is **not** a dashboard. It carries no metrics of its own. The five figures a console
would want — host, egress, model, audit head, policy version — live in the persistent status
strip (§3.5), on every screen, read from endpoints, em-dashed when unread.

### 7.2 Anatomy

```
┌── THREAD COLUMN ──── content max 768px, 24px gutters ───────────────────────┐
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ USER TURN                                                            │  │
│  │ ┃ Read the attached scanned inspection report for V-2104 and prepare │  │
│  │ ┃ an approval note based on our approved SOPs.                       │  │
│  │ ┃                                                                    │  │
│  │ ┃ ⎗ scanned-inspection-report-V-2104.pdf  2.1 MB  CONFIDENTIAL       │  │
│  │ ┃ ⎗ V-2104-thickness-survey.csv           14 kB   CONFIDENTIAL       │  │
│  │                                            m.okonkwo · 14:31:58 UTC  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                            ↑ 2px --line-strong left rule,  │
│                                              --surface-sunken, r4, no      │
│                                              bubble, no avatar             │
│  ── 24 ──                                                                  │
│                                                                            │
│  ASSISTANT TURN                                                            │
│  ┌── ① RUN HEADER ──────────────────────────────────────────────────────┐  │
│  │ ■3 □2 ◇1 ○1 ⇄1    42.3s   qwen2.5:7b → qwen2.5-vl:7b   [Proof ▾] [⋯]│  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌── ② WORK LOG ────────────────────────────────────────────────────────┐  │
│  │  ✓ 01 Request          12ms   3 inputs hashed                        │  │
│  │  ✓ 02 Classification   34ms   CONFIDENTIAL · escalated by DLP        │  │
│  │  ✓ 03 Policy            8ms   2 allow · 0 deny                       │  │
│  │  ✓ 04 Routing         180ms   qwen2.5-vl:7b · 4 candidates ▸         │  │
│  │  ✓ 05 Evidence         1.2s   evidence ▸ 12                          │  │
│  │  ✓ 06 Retrieval        3.4s   3 sources · 1 SUPERSEDED               │  │
│  │  ✓ 07 Calculation      210ms  corrosion.rate@1.2.0 · 0.21 mm/yr      │  │
│  │  ✓ 08 Verification     6.1s   claims ▸ 14                            │  │
│  │  ⏸ 09 Approval          —     held · policy AR-004 requires reviewer │  │
│  │  ○ 10 Deliverable       —     Not reached.                           │  │
│  │  ○ 11 Audit             —     Not reached.                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌── ③ ANSWER ──────────────────────────────────────────────────────────┐  │
│  │ ■ │ The governing location is CML-04 with a remaining wall of 8.4 mm │  │
│  │   │ [◱ report.pdf p.7], against a minimum allowable of 6.0 mm        │  │
│  │   │ [¶ SOP-114 p.9].                                                 │  │
│  │ ◇ │ The short-term corrosion rate is 0.22 mm/yr [∑ corrosion.rate].  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌── ④ DELIVERABLE ─────────────────────────────────────────────────────┐  │
│  │ ⎗ APPROVAL_NOTE.docx  48 kB  sha256:b04f…9a11        [ Download ]    │  │
│  │ Held. Policy AR-004 requires a reviewer with release authority.      │  │
│  │ You are signed in as Engineer.                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ── 32 ──                                                                  │
│  ┌── COMPOSER ─ sticky bottom ──────────────────────────────────────────┐  │
│  │  Ask a procedural question, or describe an analysis task…            │  │
│  │                                                                      │  │
│  │ ────────────────────────────────────────────────────────────────────│  │
│  │ [📎 Attach]  ⎗ 2 files    Deliverable: [Answer|Word|Excel|PPT|MD]    │  │
│  │                                        ⌘↵    [ Run ]                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

**No bubbles, no avatars, no alternating alignment.** Both turns are left-aligned in one column.
The user turn is `--surface-sunken` with a 2px `--line-strong` left rule; the assistant turn sits
directly on `--background` with no container at all. That is conflict C2's card-less rule applied
to chat: grouping by tint and rule, not by frame. A chat bubble is a consumer gesture and it
wastes the right third of a 768px column that the eleven-stage rail and the field grid need.

### 7.3 Types

```ts
// features/thread/model/types.ts
export type TurnRole = 'user' | 'assistant'

export interface UserTurn {
  role: 'user'
  id: string                       // "m12"
  text: string
  attachments: {
    fileId: string
    filename: string
    sizeBytes: number
    /** From the upload response. NEVER a literal: console-view.tsx:567 renders
     *  "RESTRICTED" on every file while :103 uploads them as 'confidential'. */
    classification: string
    sha256: string
  }[]
  author: { userId: string; displayName: string; role: RoleId }
  at: string                       // absolute UTC; relative time is the hover (10 §4.12)
}

export interface AssistantTurn {
  role: 'assistant'
  id: string
  taskId: string
  /** Terminal status of the run. 'running' until a terminal event lands. */
  outcome: 'running' | 'delivered' | 'held' | 'denied' | 'failed' | 'blocked' | 'cancelled'
  /** ALWAYS 11, ALWAYS in canonical order, from the moment the turn mounts. */
  stages: Stage[]
  /** Null until task.verified. NEVER a partial string. See §7.4. */
  answer: { text: string; claims: Claim[] } | null
  evidence: TypedEvidence[]
  verdictCounts: Record<Verdict, number> | null
  deliverable: Deliverable | null
  denial: DenialCardProps | null
  models: { stage: string; model: string }[]
  elapsedMs: number | null
  /** SSE liveness. A frozen timeline that looks live is the same category of
   *  lie as a fabricated number. (01 §3.8) */
  stream: 'live' | 'replaying' | 'detached' | 'closed'
  /** Events this build does not understand, surfaced rather than dropped. */
  unmappedEvents: string[]
}

export type Turn = UserTurn | AssistantTurn
```

### 7.4 What a running agent looks like — the honesty problem, solved

**The problem.** Chat UIs earn their liveness with token-by-token streaming. `12 §6.8` forbids
it here, in terms: *"streaming an answer that has not yet been claim-verified shows the judge
unverified text and then retroactively badges it — the worst possible order of operations for a
product about verification."* `10 §4.2` forbids the usual substitute: *"a skeleton implies
content of this shape is arriving. If the evidence retrieval might return nothing, or might
fail, a skeleton is a lie told at 60 fps."* `04 §2.2` forbids the other substitute: no
determinate progress bar for an LLM stage, ever.

So: no streamed prose, no skeleton, no progress bar. Twenty to sixty seconds of a local 7B model
generating, and nothing may pretend.

**The answer: invert the order of the turn.** In a normal chat product the prose is the content
and the machinery is hidden. Here, **the machinery is the content while the run is live, and the
prose arrives at the end as a single, complete, already-verified object.** The assistant turn is
built bottom-up as a *work record* that resolves into a *deliverable*.

That gives the user three things that are genuinely moving and genuinely measured, for the whole
duration:

| What moves | Driven by | Why it is honest |
|---|---|---|
| **Stage state transitions** in the work log | `task.stage` | Eleven rows exist as `pending` from t=0 and *mutate*; nothing appends, nothing reflows (`12 §3.1`). A stage with no terminal event stays `active` forever, which is how a stall becomes visible instead of invisible (`04 §3.1`). |
| **The dwell counter** on the active stage | `now − stage.at` | Measured elapsed, `tabular-nums`, 10 Hz. The only number on the board during a run, and it is real (`04 §3.3`). |
| **Evidence rows accumulating** in the inspector rail | `task.evidence`, one event per item | Accumulation is the teacher: *"nobody needs the phrase 'evidence ledger' explained after watching one fill"* (`04 §5.1`). Capped stagger `min(--i, 5)`, so a 40-item retrieval burst resolves in 440ms rather than 1.6s (`04 §3.6`). |

And zone ③ — where the prose will go — is **reserved, empty and quiet**, holding exactly one
line:

```
┌── ③ ANSWER ──────────────────────────────────────────────────────────┐
│                                                                      │
│  Answer withheld until claim verification completes.                 │
│  --text-body · --foreground-secondary · no spinner, no shimmer       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

That sentence is not an apology for a missing feature. It is the product's thesis stated on the
one screen where a judge is guaranteed to read it, at the one moment they are guaranteed to be
looking. Every other AI product in the room will be streaming text it has not checked.

**Why the region is reserved rather than absent.** Its height is fixed at 2 lines while
`answer === null`, so when the verified answer lands the column below it does not jump. This is
`12 §3.1`'s zero-layout-shift-by-construction rule applied to prose.

**When `task.verified` lands**, zone ③ renders **once**, complete, with every claim already
carrying its verdict glyph in the gutter and every citation already a live chip. One transition:
`opacity 0 → 1` plus a `--shift-sm` 4px rise over `--dur-enter` 240ms with `--ease-enter`. No
typewriter, no stagger across sentences, no per-claim reveal. `04 §8.1` budgets this as the
demo's reveal beat.

**Backpressure.** The SSE handler never calls `setState`: it pushes to a ref and schedules one
`requestAnimationFrame` flush, so the component sees at most one update per frame regardless of
event rate (`04 §7.4`). `hooks/use-event-stream.ts:47` currently calls `setLastEvent` per
message — one React render per SSE event, unbatched — and `12 §2.10` names that as the jitter
source. It matters more than it looks: `backend/core/events.py:22` sets `MAX_QUEUE = 256` and
`publish()` **drops** events for a subscriber whose queue is full, so **a janky tab silently
loses record-bearing events**. UI jank is a correctness bug in this product (`04 §7`).

### 7.5 The five states of an assistant turn

| Outcome | Zone ① | Zone ② | Zone ③ | Zone ④ |
|---|---|---|---|---|
| `running` | elapsed ticking; verdict strip absent (there are no verdicts yet — it is not `0 0 0 0 0`) | live; one `active` row with a dwell counter; the rest `pending` | reserved, `Answer withheld until claim verification completes.` | absent |
| `delivered` | full verdict strip; frozen elapsed; model chain | all eleven terminal, connectors drawn | the verified answer, rendered once | file, size, sha256, `Download` |
| `held` | verdict strip; `⏸ HELD` | `09 Approval` is `held`, 10 and 11 are `blocked` with the suffix `not reached` | the verified answer *is* shown — verification finished, only release is gated | file present, download **disabled**, with the rule: `Held. Policy AR-004 requires a reviewer with release authority. You are signed in as Engineer.` |
| `denied` | `⛔ DENIED`; no verdict strip | the denying stage `denied`; every downstream stage `blocked`; board dims to `--opacity-dim` at `--dur-hold` | **replaced by a `DenialCard`** (§4.9) | absent, and the card's `containment` line says what did not happen — or is omitted if egress cannot be attributed to this task |
| `failed` | `✕ FAILED` | the failing stage `failed`, quiet outline; downstream `blocked` | replaced by an `ErrorState` carrying a copyable identifier | absent |

Note what `held` does **not** do: it does not pulse. `04 §2.2` clause 5 — the system is idle
awaiting a person, and anything pulsing there says "please wait, working" to the reviewer whose
decision is the only thing that will move it. `agent-pipeline.tsx:33` currently ships
`animate-pulse` on exactly that marker.

Note what `denied` does **not** do: it does not turn the page red, does not shake, does not
burst. The page around it stays completely normal — `10 §4` (Sentry): *"the error is the
content, and the page around it stays completely normal."* The denial is loud because the other
ten stages went quiet (`04 §3.5`).

### 7.6 The composer

```ts
// features/thread/ui/composer.tsx
export interface ComposerProps {
  /** Disabled while the thread's last assistant turn is running. There is
   *  exactly one run in flight per thread. */
  busy: boolean
  attachments: UploadedFile[]
  onAttach: (files: File[]) => void
  onRemove: (fileId: string) => void
  format: DeliverableFormat            // 'answer' | 'docx' | 'xlsx' | 'pptx' | 'md'
  onFormatChange: (f: DeliverableFormat) => void
  onSubmit: (text: string) => Promise<void>
  /** Scope for retrieval. Lifted from ask-view.tsx:344-434, which is the
   *  better of the two pickers (01 §2.3). */
  scope: DocumentScope
  onScopeChange: (s: DocumentScope) => void
}
```

```css
.composer {
  position: sticky; bottom: var(--space-6);
  background: var(--surface);
  border-radius: var(--radius-lg);                     /* 8px, the outermost radius */
  box-shadow: var(--elev-1), var(--elev-seat);
  transition: box-shadow var(--hover-out) var(--ease-move);
}
.composer:focus-within { box-shadow: 0 0 0 1px var(--foreground),
                                     0 0 0 4px oklch(from var(--foreground) l c h / 0.08),
                                     var(--elev-seat); }
.composer-input {
  min-height: 44px; max-height: 200px;                 /* then it scrolls, it never grows the page */
  padding: var(--space-5) var(--space-6);
  font-size: var(--text-answer); line-height: var(--lh-answer);
  background: transparent; resize: none;
}
.composer-bar {                                        /* the utility ribbon */
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--line-subtle);
}
/* Drag target. No animate-bounce on the glyph: console-view.tsx:491 ships one
   and bouncing is a consumer-app gesture (04 §5.5). */
.composer[data-dragging='true'] { box-shadow: 0 0 0 2px var(--foreground), var(--elev-1); }
```

Details that are decided:

- **`⌘↵` submits.** Already wired at `console-view.tsx:543-548`; keep it, and show the `kbd`
  hint at `--text-ledger` in the ribbon.
- **The deliverable format is a 5-way segmented control**, `--control-sm` 32px rows, ink fill on
  the selected segment. It is the thing that makes "Ask" and "Run a task" one control.
- **Attachment chips** render the file's real `classification` from the upload response, or
  nothing. `console-view.tsx:567` prints the literal `RESTRICTED` on every attachment while
  `:103` uploads them as `'confidential'` — the chip is actively wrong today.
- **Empty thread**: the composer is the only thing on screen besides three template rows beneath
  it, rendered as plain rows in one hairline-separated container, not as three hover-lifting
  cards. `console-view.tsx:704` ships `hover:-translate-y-0.5 hover:shadow-md` on each; `04 §9`
  cut #12 removes those ten transitions that buy nothing.
- **The templates keep `applyTemplate`'s existing discipline**: it fills the prompt and the
  format and **names** the file to attach rather than inventing an attachment
  (`console-view.tsx:402-409`). That comment stays verbatim.

### 7.7 Proof inside a thread

`Proof` is a **disclosure on the assistant turn**, not a route and not a mode switch that
replaces the page. Pressing it expands zone ② in place: each of the eleven stage rows gains its
`InspectorPanel` inline beneath it (`StageTimeline.renderPanel`), exactly as Temporal opens a
child workflow inline without navigating away (`12 §2.2`).

```
  ✓ 04 Routing          180ms   qwen2.5-vl:7b · 4 candidates ▾
  ┌──────────────────────────────────────────────────────────────────┐
  │ 04  ROUTING                                      PASS · 180ms    │
  │ router v3 · policy v2025.09.1 · 4 candidates · 1 eligible        │
  ├──────────────────────────────────────────────────────────────────┤
  │  MODEL            INST  CLASS  CAP  MEM   SCORE  VERDICT         │
  │ ▸qwen2.5-vl:7b     ✓      ✓     ✓    ✓    0.86  SELECTED         │
  │  qwen2.5:7b        ✓      ✓     ✗    ✓    0.41  no vision        │
  │  llama3.3:70b      ✗      ✓     ✓    ✗      —   not installed    │
  │  gpt-4o            ✗      ✗     ✓    —      —   unregistered     │
  │                                                                  │
  │  [ open routing.yaml:rules[2] ]      [ audit event #1184 → ]     │
  └──────────────────────────────────────────────────────────────────┘
```

Two things this buys that a separate Proof route does not: the judge never loses the
conversation, and the answer they are questioning stays on screen directly below the evidence
for it. `01 §2.1`'s rule — *a judge must reach the proof of any on-screen claim in one click* —
is satisfied by construction, because proof is a layer over the thing making the claim rather
than a destination.

`?proof=m{id}` deep-links it (§3.3) so the demo script can open a rehearsed turn already
expanded. The toggle is **instant** — a `display` swap, no crossfade, no height animation
(`04 §5.4`: a 320ms transition on a mode switch makes the app feel slower every single time, and
the judge will hit it a dozen times).

Ineligible candidates render `—` for score, **never `0`** — `01 §3.6` makes `score: number |
null` and says "null when ineligible, NOT 0". A zero is a measurement; an em dash is an absence.

### 7.8 Timestamps, ordering and liveness

- **Absolute UTC is primary, relative is the hover** (`10 §4.12`): *"a run's audit record has no
  'ago'."* The work log shows relative offsets (`+1.4s`) while a run is live because that is the
  useful reading during the run, and absolute wall-clock on hover and in every export
  (`12 §3.12`).
- **The thread never auto-reorders.** `10 §4.13`: auto-refresh that silently reorders rows rips
  the row out from under a cursor mid-approval. New turns append at the bottom; the thread rail
  buffers changes behind a `3 new threads — refresh` affordance rather than mutating in place.
- **Claim cards never re-sort** as verdicts land (`04 §3.7`). Sorting is a user action, not an
  animation.
- **Scroll follow uses a 60px intent threshold** (`12 §2.10`):
  `gap = el.scrollHeight - el.scrollTop - el.clientHeight; userScrolled = gap > 60`. Scrolling up
  pauses auto-follow and the follow control becomes `Jump to latest`.
- `role="log"`, `aria-live="polite"`, `aria-atomic="false"` on the work log only. The evidence
  rail, the candidate table and the claim list are **never** inside a live region — they would be
  re-read on every SSE tick. A denial escalates to `aria-live="assertive"`: it is the one event
  worth interrupting for (`01 §7.3`).

---

## 8. Where the non-thread surfaces go

Three dispositions, and the rule for choosing between them:

- **Thread-attached** — it only makes sense *about one run*. It is a disclosure inside an
  assistant turn.
- **Inspector rail** — it is a *side-quest you return from*, and you must be able to read it
  and the answer at the same time.
- **Route** — it is a *workspace* or a *cross-run ledger*: it has its own gesture budget, its
  own URL worth sending, and it outlives any single thread.

| Surface | Disposition | Where exactly | Why |
|---|---|---|---|
| **Proof Mode** | **Thread-attached** | Disclosure on the assistant turn; `?proof=m{id}` | `01 §2.2`: *"proof is always proof of a run; detached from a task it has no subject."* Under chat-first the turn *is* the task, so a separate `/tasks/[id]?view=proof` route would be a second place to look at something already on screen. |
| **Policy decision explorer** | **Thread-attached** | Inside the `03 Policy` stage panel, plus the `DenialCard` | `01 §2.2`: roadmap line 104 — "open the exact policy rule that caused a denial" — is a drill-down *from a decision*. |
| **Policy rulebook** (roles × clearance × rules) | **Route** | `/assurance?tab=policy` | It is a reference document about the host, not about a run. Two different jobs; splitting them is what keeps the panel small. |
| **Routing explorer** | **Thread-attached** | Inside the `04 Routing` stage panel | Roadmap line 106: "candidate models **per stage**". Per-stage means it is a property of a run; a standalone tab would have to invent a run to explain. |
| **Evidence ledger + source viewer** | **Inspector rail** | Right rail, `?ev={id}`, 380 → 720px | `12 §5.2`: an overlay forces a choice between reading the answer and reading the evidence. Never a route — an evidence item has no meaning without the claim that cites it. |
| **Conflict comparison** | **Inspector rail**, two panes | Rail expands to 720px, two independently scrollable panes over one claim | `12 §5.3` + `12 §2.11` (Proxyman's two filtered panes over one stream). **Not** a red/green diff — see §10. |
| **Calculation record** | **Thread-attached** | Inside the `07 Calculation` stage panel; inputs are `EvidenceChip`s that open the rail | The formula, its version, its inputs and the independent recompute are all facts about one run. |
| **Approvals queue** | **Route** | `/approvals` | It is *a different person's inbox*. A reviewer arrives at work with twelve held runs across eleven threads; making them open eleven threads to find them is hostile. The queue is cross-thread by definition. |
| **Approval decision** | **Thread-attached** *and* route | The held assistant turn carries the decision control inline; `/approvals` carries the same control in a row. Both write one record. | The operator who ran it and the reviewer who releases it are different people arriving from different directions at the same object. Relativity's *"click Edit to code"* modality applies to both (`12 §2.6`): **an approval that can be changed by a stray click is not an approval** — the control is explicitly armed before it can be pressed. |
| **Audit log** | **Route** | `/audit` | The append-only ledger is the product's cross-run spine; `audit-view.tsx` is already the best screen in the app and models `UNVERIFIED` as a distinct state (`01 §1.1`). Do not touch it except to add the signature verdict. Individual stage panels deep-link *into* it by sequence number. |
| **Registry / Knowledge** | **Route** | `/knowledge?tab=documents\|models\|diagrams\|search` | Corpus: artefacts on disk. Cross-thread, browsable, and `models` finally reads `GET /api/models/status`, which already exists and already returns real `provider_reachable` / `resident_in_runtime` / `residency`. |
| **P&ID viewer** | **Route** + embeds in the rail | `/knowledge/pid/[documentId]`; the same `<PidCanvas/>` mounts inside the inspector rail for a `region` locator | `01 §2.2`: it is a pan/zoom/select *workspace* with its own gesture budget and its own URL worth sharing, **and** roadmap line 87 demands it appear inline when a claim cites a diagram region. Build the canvas once, mount it twice. |
| **Security / Assurance** | **Route** | `/assurance?tab=sovereignty\|sandbox\|policy\|routing\|benchmarks` | *"Can I trust the system"*, as distinct from *"can I trust this run"*, which is Proof. Everything here describes the host's posture independent of any run. |
| **Benchmark dashboard** | **Route** | `/assurance?tab=benchmarks`, detail at `/assurance/benchmarks/[suite]/[caseId]` | Cross-run, cross-dataset, versioned. It belongs to the system, not a task. |
| **Sovereignty counters** | **Status strip**, everywhere | §3.5 | Not a surface at all. They must be visible on every screen or demo 3's beat — one counter moves, the other does not — has nowhere to happen. |
| **Command palette `⌘K`** | **Overlay**, `--z-menu` | Global | An accelerator over fully visible navigation, never the primary path (`10 §4.10`). `>prove m12`, `>rule tool-permissions:code_sandbox`, `>evidence V9`. |

**What this collapses.** Seven routes (`/ ask tasks approvals registry security audit`) plus a
fake drawer at `tasks-view.tsx:269-380` become: the thread surface, four routes, one rail, and
disclosures. Nothing was cut; three things stopped being separate places.

**The rule for future surfaces**, stated so this does not drift:

1. Per-run truth → a stage panel in the assistant turn.
2. Evidence and its sources → the inspector rail.
3. Host-wide truth → an `/assurance` tab.
4. Artefacts on disk → a `/knowledge` tab.
5. Someone else's inbox, or a cross-run ledger → its own route.

---

## 9. Migration plan

Ordered against the chat-first target. Each step is small enough to review in one sitting, names
the exact files it touches, says what visibly changes, and is marked:

- **[OFFLINE]** — lands and is verifiable with no backend running.
- **[BACKEND]** — needs a live API, or a backend contract change, to verify.
- **[tsc]** — will break `next build` type-checking until the step is complete.
  `next.config.mjs:4-7` refuses to ignore type errors, so a `[tsc]` step must land whole.

**Verified against the tree as it stands today, not as the research docs found it.** Since
`01` and `04` were written, `three-d-layer-view.tsx`, `sovereignty-topology.tsx`,
`floating-telemetry-hud.tsx`, `three`, `@react-three/fiber`, `@types/three`,
`@vercel/analytics` and `puppeteer-core` have already been removed, and `package.json:2` is now
`aegis-frontend`. Those steps are struck from this plan; what remains is what is still there.

### Phase A — Tokens and subtraction (no new surfaces, nothing to design)

| # | Step | Files | Visible change | Flags |
|---|---|---|---|---|
| **A1** | **Install the token set.** Paste §2.1–§2.9 into `:root`; add the `@theme inline` mappings from §2.10; add the `@layer base` mono-weight rule from §2.4; add the four utilities from §2.11. Do **not** yet rewire any call site. | `app/globals.css` | Hairlines shift ≤3/255 and become hue-linked. Mono goes from weight 400 to 425, so every run id, hash and latency in the app visually thickens to match adjacent sans labels. Nothing else. | OFFLINE |
| **A2** | **Delete the decorative motion.** Remove `sov-drift`, `sov-spin-slow`/`.sov-spin-slow`, `sov-radar-sweep`/`.sov-radar-sweep`, `sov-laser-flow`/`.sov-laser-flow`, `sov-glow-pulse`/`.sov-glow-sovereign`, `sov-glow-pulse-active`/`.sov-glow-active`, `sov-deflection`/`.sov-deflection-burst`, `sov-trace`, `sov-dash`, `sov-blink`/`.sov-blink`. Replace the blanket `@media (prefers-reduced-motion)` block at `:256-268` with §2.8's token contract. Keep `sov-pulse`, `sov-reveal`, `sov-line-grow`. | `app/globals.css` | Nothing, until A3 — every one of these is either unconsumed or consumed only by files A3 deletes. | OFFLINE |
| **A3** | **Delete the ambient layer.** Remove `<AnimatedTechnicalBackground/>` and the `--sovereign` radial blur from the app shell (`app/(app)/layout.tsx:12`, `:14-18`); replace with `<div aria-hidden className="tech-grid fixed inset-0 -z-10 opacity-40"/>`. Remove `<SovereignCursor/>` from `components/app-providers.tsx` and delete `components/sovereign-cursor.tsx` (194 LOC) and the `@media (pointer: fine)` block at `globals.css:273-283`. Then delete `components/animated-technical-background.tsx` (165 LOC) once its last consumer (`sign-in-view.tsx:117`) goes in B1. | `app/(app)/layout.tsx`, `components/app-providers.tsx`, `components/sovereign-cursor.tsx`, `app/globals.css` | The custom reticle cursor is gone and the native cursor returns. The moving dot field behind every page stops; a static grid replaces it. The green wash at the top of every page disappears. Roughly 150k canvas path operations per second come off the main thread (`04 §1.2`). | OFFLINE |
| **A4** | **Delete `glass-chassis` / `glass-chassis-dark`** and the `backdrop-blur-xl` on the nav (`navigation.tsx:30`); replace with `background: color-mix(in srgb, var(--surface) 92%, transparent)`. Delete `shadow-[0_0_8px_rgba(0,0,0,0.3)]` from the active-nav underline (`navigation.tsx:53`). | `app/globals.css`, `components/navigation.tsx` | The nav stops blurring what scrolls under it — visually near-identical against flat warm paper, at zero compositing cost (`04 §7.3`). The active tab's underline stops glowing. | OFFLINE |

**Phase A exit:** nothing on any page moves unless a backend event moved it, and the token set
is installed without a single component change.

### Phase B — Primitives (the foundation other agents build on)

| # | Step | Files | Visible change | Flags |
|---|---|---|---|---|
| **B1** | **`Button`.** Create `shared/ui/controls/button.tsx` + the `.btn` CSS from §4.1. Re-export `SovButton` as a thin deprecated shim mapping its five variants onto the new four (`ink` → `primary`, `outline` → `secondary`, `danger` → `danger`, `ghost` → `ghost`). | `shared/ui/controls/button.tsx`, `components/sov-button.tsx`, `app/globals.css` | Every button in the app loses its pill shape (`rounded-full` → 4px), stops animating on hover-in, stops translating on press, and gains the gap focus ring. | OFFLINE |
| **B2** | **`Input`**, **`EmptyState`**, **`ErrorState`**, **`UnavailableState`** per §4.2, §4.10, §4.11. | `shared/ui/controls/input.tsx`, `shared/ui/data/{empty-state,error-state,unavailable-state}.tsx` | Nothing yet — no consumers. | OFFLINE |
| **B3** | **`VerdictBadge`** + the verdict strip, per §4.6 and §5.2. Includes the `VerdictBadgeProps` discriminated union that makes `reason` mandatory for `UNSUPPORTED` and `CONFLICTED`. | `features/verification/ui/verdict-badge.tsx` | Nothing yet. | OFFLINE **[tsc]** — any existing call site that renders a verdict without a reason will fail to compile. There are none today; this is a guard for the future. |
| **B4** | **`MetricTile`** + `ProvenanceChip`, per §4.7. | `shared/ui/data/{metric-tile,provenance-chip}.tsx` | Nothing yet. | OFFLINE |
| **B5** | **`InspectorPanel`** / `InspectorSection` / `InspectorField`, per §4.8. | `shared/ui/inspector/*` | Nothing yet. | OFFLINE |
| **B6** | **`Table`**, per §4.3. | `shared/ui/data/table.tsx` | Nothing yet. | OFFLINE |
| **B7** | **`DenialCard`**, per §4.9. | `features/policy/ui/denial-card.tsx` | Nothing yet. | OFFLINE |

**Phase B exit:** every primitive in §4 exists, is storybook-able without a backend, and nothing
in the product uses them yet. This is the hand-off point for the other agents.

### Phase C — The vocabulary, wired

| # | Step | Files | Visible change | Flags |
|---|---|---|---|---|
| **C1** | **Extend `StageStatus`** to the nine states in §5.3: `'pending' \| 'active' \| 'done' \| 'skipped' \| 'failed' \| 'held' \| 'blocked' \| 'denied' \| 'unavailable'`. Add `at: string \| null`, `elapsedMs: number \| null`, `headline: string \| null`, `counts?`, `childCount?`, `auditSequences?` to `PipelineStage`; **remove `latencyMs: number`**, which is set to `0` for every stage at `lib/presentation.ts:64-72` and never filled in. | `lib/types.ts:64-73`, `lib/presentation.ts:62-72` | Nothing visible yet. | OFFLINE **[tsc] — this is the one step that will break the build.** Four files consume these types: `lib/types.ts`, `lib/presentation.ts`, `components/agent-pipeline.tsx` (the `dot` record at `:8-15` is `Record<StageStatus, string>` and will error on three missing keys), and `components/console/console-view.tsx` (five `status: 'done'` writes at `:184`, `:220`, `:232`, `:238` and the `latencyMs` read at `:121`). C1 and C2 must land in one commit. |
| **C2** | **`StageTimeline`** per §4.4, with the nine-state marker table from §5.3 and the connector CSS. **Delete `components/agent-pipeline.tsx`** (163 LOC) — it is superseded, not wrapped. Point `console-view.tsx` at the new component. | `shared/ui/timeline/{stage-timeline,stage-marker,stage-connector,stage-dwell}.tsx`, `components/agent-pipeline.tsx` (deleted), `components/console/console-view.tsx:742` | The pipeline stops being a dark 3-column grid of cards with a progress percentage gauge and a looping fill bar. It becomes eleven hairline-separated rows on paper with glyph markers, a measured dwell counter on the active row, and a drawn connector on each completion. The `0_0_8px` glow on done/failed and the `animate-pulse` on held are gone. The `{progressPercent}%` gauge at `agent-pipeline.tsx:72-81` is gone — we do not know the fraction. | OFFLINE (renders from `DEFAULT_PIPELINE`) |
| **C3** | **Rewrite `StatusIndicator` and `ClassificationTag`** (`components/primitives.tsx:68-127`) against §5.3. Today `StatusIndicator` sets its label **in the status colour** at `:110` — `--sovereign` at 3.07:1 for `DELIVERED`, `--approval` at 2.97:1 for `PENDING`. Both become `-text` variants, both gain a glyph, and the `pulse` prop is deleted (pulsing is derived from state). | `components/primitives.tsx` | Every status chip in the app becomes readable. `PENDING` and `AWAITING APPROVAL` stop failing contrast outright. Each gains a shape so it survives greyscale. | OFFLINE **[tsc]** — `pulse` is passed from at least `sign-in-view.tsx`; remove those call sites in the same commit. |
| **C4** | **Rewire the line tokens.** Sweep `border-border` → `border-line-default` on dividers, table rules and section separators; leave control edges on `border-border` (which now resolves to `--control-default`). Replace the global `* { border-color: var(--border) }` at `globals.css:112-114` with an explicit default of `--line-default`. | `app/globals.css`, ~20 components | Dividers get one step lighter and control edges get one step darker — the Linear split (`10 §2.3`). Reads as more definition on inputs and less noise between rows. | OFFLINE |

**Phase C exit:** every status, verdict and stage state in the product is drawn from one table,
passes 4.5:1, and survives greyscale.

### Phase D — The thread surface

| # | Step | Files | Visible change | Flags |
|---|---|---|---|---|
| **D1** | **`Composer`** per §7.6, extracted from `console-view.tsx:476-684` with no behaviour change except: the deliverable segment moves into the ribbon, `hover:-translate-y-0.5` comes off the template cards, `animate-bounce` comes off the drop glyph (`:491`), the attachment chip reads `file.classification` instead of the literal `RESTRICTED` (`:567`), and the `AIR-GAPPED 127.0.0.1` chip at `:505-508` and `Local: 127.0.0.1 · 0 Egress` at `:619` are deleted (both literals; both now live in the status strip). | `features/thread/ui/composer.tsx`, `components/console/console-view.tsx` | The dispatcher becomes a single rounded-8px surface with a seated shadow and an ink focus halo. Two false claims disappear. | OFFLINE |
| **D2** | **The status strip** per §3.5, mounted in `app/(app)/layout.tsx` under the nav. Reads `/api/system/sovereignty`, `/api/system/health`, `/api/audit/chain` through **one** shared `EventSource` at the layout, fanned out via context — not one subscription per consumer (`01 §5.6`). Every field em-dashes when unread. | `app/(app)/layout.tsx`, `features/sovereignty/{model/use-sovereignty,ui/status-strip}.tsx` | A 28px mono reading appears under the nav on every screen. With no backend it reads `HOST — · EGRESS — · MODEL — · AUDIT — · POLICY —`, which is the correct behaviour and is worth seeing. | BACKEND to populate; OFFLINE to verify the em-dash path |
| **D3** | **Delete the console hero.** Remove `console-view.tsx:417-473` entirely: the 64px `font-extrabold` three-line headline, the sub-line, the telemetry row (two of whose three values are literals), and `<SovereignRadialHero/>`. Delete `components/sovereign-radial-hero.tsx` (311 LOC) and the `activeNodes` mapping at `:380-400`. | `components/console/console-view.tsx`, `components/sovereign-radial-hero.tsx` | The dead space goes. The composer moves to the top of the column. The hardcoded `Qwen 2.5 72B-Instruct` / `14.8 GB VRAM` / `42,890 Embeddings` / `gVisor Kernel` / `Append-Only Merkle` in `RADIAL_NODES` leave the repo. | OFFLINE |
| **D4** | **The turn model.** Create `features/thread/` with the types in §7.3, `UserTurn` and `AssistantTurn` components, and the four-zone assistant layout from §7.2. `console-view.tsx` becomes `features/thread/ui/thread-view.tsx` and renders a list of turns instead of a single phase machine. `type Phase = 'idle' \| 'running' \| 'result'` (`:31`) is deleted — outcome is per-turn, not per-page. | `features/thread/**`, `app/(app)/page.tsx` | The page becomes a conversation. A completed run stays on screen when the next one starts. | OFFLINE (renders empty thread + composer) |
| **D5** | **Zone ③, the withheld answer.** The reserved two-line region with `Answer withheld until claim verification completes.`, and the single `opacity + 4px rise over 240ms` reveal on `task.verified`. Delete the `AnswerBody` typewriter path if any remains. | `features/thread/ui/assistant-turn.tsx` | While a run is live, the answer region is a quiet reserved block instead of nothing or a skeleton. When verification lands, the complete verified answer appears once. | BACKEND |
| **D6** | **rAF-coalesce the SSE stream.** Add `useCoalescedEvents` per `04 §7.4` around `hooks/use-event-stream.ts`; the reducer applies a whole batch in one `setState` and assigns `--i` from the index *within the batch*, capped at 5. Remove the hardcoded `namedEvents` array so unmapped events are surfaced rather than silently dropped (`01 §1.3a` lists seven event types currently thrown away, including `task.queued`, which is why the queue UI has never worked). | `hooks/use-event-stream.ts`, `features/thread/model/turn-reducer.ts` | Nothing visible on a quiet stream. On a 40-item retrieval burst: one render per frame instead of forty, and a 440ms capped cascade instead of a 1.6s one. Fixes silent event loss under jank (`04 §7`). | BACKEND to verify |
| **D7** | **The inspector rail** per §3.4. Convert `components/evidence-drawer.tsx` from `fixed inset-0` to a docked right rail above 1280px, overlay below. Keep its transform-slide mechanics and **keep the comment at `:48-50` verbatim**. Delete the `: 0.95` similarity fallback at `:49` and render `—` when `confidence === null`. | `features/evidence/ui/evidence-rail.tsx`, `components/evidence-drawer.tsx` (deleted) | Evidence and the answer are readable at the same time. The invented 0.95 similarity bar disappears from the one screen whose job is provenance. | OFFLINE to verify layout; BACKEND for content |
| **D8** | **`EvidenceChip`** per §4.5 + the citation parser widened from `/(\[[SF]\d+\])/g` to `/(\[[SFVCXH]\d+\])/g`. Today a `[V9]` vision citation or a `[C3]` recomputation citation renders as inert grey text, while `orchestrator.py:90-95` already mints S/F/V/C. Dangling ids render struck-through. | `features/evidence/ui/evidence-chip.tsx`, `features/evidence/model/parse-citations.ts`, `components/result-experience.tsx:15` | Four of the six evidence modalities become clickable for the first time. A hallucinated citation becomes visible instead of invisible. | BACKEND |

**Phase D exit:** the primary screen is a thread, the answer is never shown before it is
verified, and every citation opens the same rail.

### Phase E — The routes and the rest

| # | Step | Files | Visible change | Flags |
|---|---|---|---|---|
| **E1** | **Sign-in** per §6. Rewrite `components/sign-in/sign-in-view.tsx` (490 → ~150 LOC): delete the brand panel (`:116-189`), every Firebase/Google path (`:25-33`, `:88-99`, `:210-245`, `:384-409`), the mono field labels, the footer claim at `:480-483`, and the `SESSION AUTHENTICATION` eyebrow. Build the 352px column. Delete `lib/firebase.ts` and remove `firebase` from `package.json` (currently `^12.18.0` at `:16`). | `components/sign-in/sign-in-view.tsx`, `lib/firebase.ts` (deleted), `package.json` | The screen the founder is unhappiest with becomes a 352px centred column on paper. A cloud identity provider leaves an air-gapped product's dependency tree and its SBOM. | OFFLINE **[tsc]** — `requireAuth`, `googleProvider`, `firebaseEnabled`, `signInWithPopup`, `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `signOut` all lose their module. Grep for every import of `@/lib/firebase` before deleting. **[BACKEND]** for the local-credential path itself. |
| **E2** | **Nav** per §3.2: seven links → four, plus the thread rail. `/ask` and `/tasks` routes redirect to `/`; `/registry` → `/knowledge`; `/security` → `/assurance`. | `components/navigation.tsx:12-20`, `app/(app)/{ask,tasks,registry,security}/page.tsx` | Four tabs. Two dispatchers become one. | OFFLINE |
| **E3** | **Security → Assurance.** Rewrite `components/security/security-view.tsx` against `MetricTile`: the four `PageHeader` meta values (`:83-100`) and the three `ConnectionTelemetry` tiles become `MetricTile`s — **and the two that have no provenance (`127.0.0.1 : 8000` at `:199`, `127.0.0.1 : 3000` at `:214`) cannot be written and must be deleted.** The `PolicyMatrixTable` at `:362-436` becomes `Table` at `--row-data`, with `ALLOW`/`DENY` rendered as `-text` variants plus glyphs instead of `--sovereign`/`--critical` fills set as body text (`:422`). | `components/security/security-view.tsx` | Two unfounded tiles disappear. The policy matrix stops failing contrast in both its ALLOW and DENY columns. | BACKEND |
| **E4** | **Proof disclosure** per §7.7: `StageTimeline.renderPanel` wired to eleven `InspectorPanel` stage panels, with `?proof=m{id}&stage=…` in the URL. Panels for stages the backend cannot report render `unavailable`, not `pending`. | `features/proof/**` | Every stage row opens in place to a structured record. | BACKEND — `GET /api/tasks/{id}/proof` (`01 §3.6`, dependency D1) |
| **E5** | **Error boundaries.** `app/error.tsx`, `app/(app)/error.tsx`, plus a per-stage-panel boundary so one malformed payload does not take down the other ten. | 3 new files, `features/proof/ui/proof-mode.tsx` | One thrown render stops blanking the application mid-demo. | OFFLINE |
| **E6** | **The `no-numeric-fallback` lint rule** — flags `?? <number literal>` and `: <number literal>` in a ternary whose other arm reads an API field. `01 §5.9` notes this single rule would have caught every fabricated figure in the repo: `?? 3`, `\|\| 6`, `\|\| 142`, `: 0.95`, `: '0.96'`, `: 0.94`, `\|\| 12`. | `eslint.config.mjs`, one custom rule (~40 LOC) | P1 stops being aspirational. | OFFLINE |

### 9.1 What breaks `tsc`, in one list

1. **C1** — `StageStatus` gains three members. `agent-pipeline.tsx:8-15`'s
   `Record<StageStatus, string>` fails on the missing keys; `console-view.tsx` writes
   `status: 'done'` at `:184`, `:220`, `:232`, `:238`; `PipelineStage.latencyMs` is read at
   `console-view.tsx:121` and written at `lib/presentation.ts:64-72`. **C1 and C2 land together.**
2. **C3** — deleting `StatusIndicator`'s `pulse` prop breaks every call site passing it.
3. **B3** — `VerdictBadgeProps`'s discriminated union makes `reason` mandatory for two verdicts.
   No current call sites; it will break future ones, which is the point.
4. **E1** — deleting `lib/firebase.ts` removes seven exported symbols. Grep
   `from '@/lib/firebase'` first.
5. **D4** — deleting `type Phase` from `console-view.tsx:31` breaks every `phase === …` guard in
   that file (there are twelve). The file is rewritten in the same step.

Everything else in this plan is additive or CSS-only.

### 9.2 What is safe with no backend

Phase A entire, Phase B entire, C1–C4, D1, D3, D4, D7 (layout only), E1 (layout only), E2, E5,
E6. That is the large majority of the work and all of the foundation.

The four steps that genuinely need a running API are D2 (populating the strip), D5 (the verified
answer reveal), D6 (burst behaviour) and E4 (proof panels) — and each of those has a verifiable
offline path: the em-dash state, the reserved region, the quiet stream, and `unavailable`.

---

## 10. What I rejected

Research findings I deliberately did not adopt, and why. Everything here is a good decision for
the product that ships it.

### 10.1 From the console research (doc 10)

| Rejected | Source | Why |
|---|---|---|
| **A separate taxonomy hue budget** — six event-kind hues alongside four status hues. | `10 §2.1`, `§3.28` (Temporal `action.workflow.*`) | Ten hues in a product whose output is printed and projected. Conflict C1: modality is carried by a mono glyph and rule weight instead. |
| **A warm-shifted `--foreground`** off pure black, toward `#2a2724`–`#33302b`. | `10 §2.6`, `§3.7` (Stripe's `#3c4257`) | Genuinely good advice, and explicitly out of scope: the palette is settled. The idea survives where it costs nothing — `--line-ink` (§2.2) is exactly that warm deep ink, used as the hue donor for every hairline. |
| **A `syntax.*` token family** for code and evidence excerpts. | `10 §2.4`, `§3.33` (Sentry) | Correct, and premature. There is no policy DSL viewer or code panel in the current tree. Adding eight tokens with no consumer is how token sets rot. Revisit when the policy rulebook route lands. |
| **A user-facing density toggle.** | `10 §4.8` names it an anti-pattern, and I agree | A compliance console's screenshots end up in evidence packs; if two auditors see different row heights, screenshot comparison gets harder. The one exception is the audit ledger's `compact` toggle (§2.5), which `12 §2.8` specifically calls for and which affects one table. |
| **Dark mode.** | `10 §4.7` | The `@custom-variant dark` and the whole `--ink-*` family exist, and shipping a second fully-verified theme before Proof Mode is exactly the "cosmetic UI redesign" the roadmap's Do-Not-Prioritize list names. The `--ink-*` tokens stay for contrast surfaces; they are not a theme. |
| **A `0.5px` hairline on hi-DPI.** | `10 §2.3` (Linear ships one) | A sub-pixel rule is invisible on a projector and disappears entirely in a printed run report. Both are real outputs here. |
| **Relative timestamps as the primary reading.** | `10 §4.12` names it an anti-pattern | Adopted as written: absolute UTC primary, relative on hover — except inside a live work log, where the relative offset is the useful reading and the absolute is the hover. Stated so the inconsistency is deliberate rather than accidental. |

### 10.2 From the auth/landing research (doc 11)

| Rejected | Source | Why |
|---|---|---|
| **The `Forgot?` link** on the password row. | `11 §5.3` | Amendment A2: there is no reset path in an air-gapped build with no mail transport. A link to nothing is a small credibility contradiction on the page whose whole job is credibility. |
| **`offline` in the build strip.** | `11 §5.3` | Amendment A4: it cannot be derived at build time and a browser cannot detect an air gap. |
| **16px input text** to avoid iOS zoom. | `11 §3.D` | This product does not ship to mobile Safari. 13px on a 40px control, bound to `--control-lg`. |
| **A light (300) weight for authority at display size.** | `11 §4.12` (Vanta 88px/300, Tailscale, Stripe's sohne-300) | The best single finding in that document, and it belongs to the marketing landing page, not here. The largest type in the product surface is 20px, where 300 reads as thin rather than confident. Geist Sans at 300 also loses too much stem at 11–13px, which is where this product actually lives. |
| **A stat grid on the sign-in page.** | — (`11 §3.G` already rejects it) | Confirmed and extended: **no** proof tiles before a session exists, because nothing on that screen can be measured. The single bottom proof line survives, and only if it is true. |
| **The pulsing `AIR-GAPPED 127.0.0.1` pill.** | current code, `sign-in-view.tsx:129-135` | Deleted. It is both an animation with no referent and a claim the browser cannot check. |

### 10.3 From the evidence-UI research (doc 12) — the patterns flagged as wrong for a verification product

All eleven of `12 §6` are adopted as rejections. Restated here because this is the section a
future contributor will reach for when they want to add one of them back.

| Rejected | Why it is wrong here |
|---|---|
| **A similarity / confidence progress bar.** | A lie unless the number is measured. `evidence-drawer.tsx:48-50` already refuses it and that refusal is correct. Extended: no confidence bar on verdicts, no "97% verified", no routing-score meter. If the backend did not compute it, the row is omitted — not drawn at a flattering default. |
| **A green tick beside a provenance mark.** | C2PA: *"do not add a valid status, as the icon alone should already indicate the presence of a valid manifest."* Stacking a validity badge teaches users that the absence of a tick means invalid, when it usually means *unknown*. Our temptation is a green shield next to the sovereignty reading in the status strip. |
| **A single aggregate "trust score" for a run.** | Our runs aggregate a handful of internal documents. One number would compress VERIFIED, CONFLICTED and UNSUPPORTED into a figure no judge could audit and no engineer could defend. The five-slot count strip (§5.2) is the same glance and it decomposes. |
| **Averaged-state colour gradients** (Airflow blends a day's runs between green and red). | There is no average of VERIFIED and CONFLICTED. Every verdict stays discrete. |
| **Red/green add-remove diff for two conflicting sources.** | Gorgeous and semantically wrong: it encodes "this version superseded that one". Two conflicting P&ID datasheets have no before and after, and rendering one red implies it is the deletion — a judgement we have not made and often cannot make. §8 specifies a neutral two-pane comparison with an explicit disagreement axis, both panes styled identically. |
| **Three overlapping paths to the same source** (popover + sidebar + Links tab). | Perplexity's own teardown calls it out. In a 6-minute judged demo, three routes to one place is three chances to click the wrong one. One path: chip → popover → rail. |
| **Hover-only source previews.** | Hover does not exist on a projector, on a touchscreen, or when someone else is driving. Every hover affordance has a click and a keyboard equivalent. |
| **Typewriter / token-by-token streaming of the answer.** | The single most important rejection in this document, and §7.4 is the whole answer to it. Streaming unverified text and then badging it is the worst possible order of operations for a product about verification. |
| **Glow, pulse and drop shadows on status markers.** | Glow adds a visual weight channel that competes with the shape and weight channels §5 depends on, and pulsing `held` implies work is happening when the system is idle awaiting a human. `agent-pipeline.tsx:20,26,33` ships all three today. |
| **BubbleUp-style "what is statistically different about this selection".** | The best idea in observability, and it needs thousands of events. On a single run with eleven stages it would produce confident-looking histograms over n≈1. We take the *Minigraph* — put one item in the context of its peers, which is `VerdictBadge.cohort` — and leave the rest. |
| **Infinite scroll on the audit log.** | Virtualize, yes; but keep a visible total (`247 entries`) and a scrollbar that reflects it. An append-only ledger whose length you cannot see is not obviously append-only. |
| **Skeleton shimmer placeholders for pipeline stages.** | A skeleton promises "content of this shape is arriving". A stage that has not run yet may never run — if `policy` denies, stages 5–10 are `blocked` forever. Render `pending` as a real, quiet, empty row. |

### 10.4 From the frontend architecture doc (doc 01)

| Rejected | Source | Why |
|---|---|---|
| **The verdict-colour mapping.** | `01 §4.4`: `UNSUPPORTED → --critical`, `CONFLICTED → --approval` | Conflict C4. It inverts the severity order relative to the glyph order and puts the loudest hue on the quietest finding. `12 §4`'s mapping is adopted instead. |
| **Coloured underlines under claim spans in the answer body.** | `01 §4.4` | Four underline colours under running prose at 15px on warm paper is the rainbow-in-a-table failure `12 §2.9` names. The gutter glyph already carries the state at the position channel. One channel, done well. |
| **`--density-comfortable/compact/dense` as a *user* preference.** | `01 §6.1` defines them as tokens; a toggle was never proposed but is the obvious next step | Kept as authored tokens (§2.5), rejected as a control. See `10 §4.8`. |
| **`/tasks/[taskId]?view=proof` as a route.** | `01 §2.2`, `§3` — the whole of Proof Mode | Correct for a console; superseded by the chat-first reframe. The turn *is* the task, so a route would be a second place to look at something already on screen. Everything else about Proof Mode — the eleven stages, the nine states, the payload shapes, the five panel states, the `unavailable` doctrine — is adopted wholesale into §7.7. |

### 10.5 From the motion doc (doc 04)

| Rejected | Source | Why |
|---|---|---|
| **`SUPPORTED → --active`.** | `04 §3.7` | `--active` means *a stage is running*. Reusing it for a verdict makes a finished claim look like a live one. |
| **Salvaging `sovereignty-topology.tsx`'s pan/zoom** for the P&ID viewer. | `04 §1.7` | The file is already gone from the tree. `12 §2.11` has the better answer anyway: one OpenSeadragon `svg-overlay` `<g>` in viewport coordinates, not N absolutely-positioned divs and not a hand-rolled pan/zoom. |
| **Keeping the radial hero as a live readout** driven by `activeNodes`. | `04 §1.4` proposes stripping it to truth rather than deleting it | Rejected in favour of deletion (§7.1). The `activeNodes` mapping at `console-view.tsx:380-400` duplicates routing logic the backend owns, and the thing the diagram was for — explaining the architecture at a glance — is done better by the eleven-stage work log actually running. If a diagram is wanted, it belongs on the marketing landing page. |
| **`useReveal` on more than three sections.** | `04 §9` cut #16 already limits it | Confirmed: `Reveal` stays for at most the thread's first paint and is never applied to a stage board. A reveal on a stage board is a delay between an event and the reader seeing it. |

### 10.6 The one thing I would flag to the founder

Two sentences in §6 are conditional on facts I cannot check from the frontend:

- `Every action in this workbench is written to an append-only log.` — true only if
  `backend/core/audit.py` appends unconditionally on every authenticated action.
- `For evaluation. No data is written to the audit log.` — true only if demo-role sessions are
  genuinely excluded, which would arguably be the worse behaviour.

Both are on the sign-in screen, which is the one screen a judge sees before they can verify
anything for themselves. `11 §5.4`: *"only ship this sentence if it is true."* Someone with
backend knowledge must confirm each before E1 lands, and the alternative wording for both is in
§6.1 A3 and §6.5.
