# 14 — Research: Visual Craft, Editorial Design, and the Difference Between Competent and Beautiful

**Beat:** visual craft, editorial design, texture, micro-detail, restraint.
**Complements, does not repeat:** `10-RESEARCH-CONSOLES.md` (console token systems),
`11-RESEARCH-LANDING-FIRSTRUN.md` (landing/auth typography), `12-RESEARCH-EVIDENCE-UI.md`
(evidence/timeline). Both 10 and 11 were read in full before this was written; where I land on the
same conclusion from a different source I say so rather than restating their evidence.
**Written against:** `frontend/app/globals.css` (285 lines, read in full), `frontend/app/layout.tsx`,
`components/primitives.tsx`, `components/sign-in/sign-in-view.tsx`,
`components/sovereign-radial-hero.tsx`, plus a mechanical grep of all 39 `.tsx` files under
`app/` and `components/`.
**Constraint I stayed inside:** `#f7f7f5` / `#ffffff` / `#0a0a0a`, radius 4px, Geist Sans + Geist
Mono, four status hues, fully offline. Nothing below asks for a new hue or a new typeface.
**Date:** 2026-09-21.

---

## 0. Method, and how to trust each line

Every claim is tagged:

- **[OBSERVED]** — I fetched the artefact and read the actual value. For live pages that means either
  a headless browser reading `getComputedStyle` at 1440×900 / DPR 1, or the site's own shipped
  stylesheet pulled with `curl` and parsed. Values are quoted as the source writes them.
- **[REPORTED]** — cited secondhand from a writeup or from a research agent I dispatched.
- **[INFERENCE]** — my reasoning. Opinions are marked as such and are meant to be argued with.

**Sites I could not reach, named rather than guessed at:** `land-book.com` (403), `lapa.ninja`
(403), `mobbin.com` (403), `refero.design` (returned a bare title, no listing), `godly.website`
(301s to `recent.design`, which is now a motion-pattern gallery, not a curated site list),
`screenlane.com` (301s to `pageflows.com`), Typewolf's annual typography-trends essay (no such page
found; the homepage carries only a stale 2022 list), `grainy-gradients.vercel.app` (404),
`ciechanow.ski/js/` (403 to plain fetch — but `/gears/` rendered fine in a browser and is the source
of every Ciechanowski number below), `makingsoftware.com` (403 to fetch; its stylesheet is 3.2 KB and
yielded nothing usable).

**One methodological caveat that matters:** the session's WebSearch budget was exhausted before this
work started, so there is no keyword-search layer under this document. Everything here comes from
direct fetches of pages and stylesheets I named in advance. That biases the sample toward sites I
already knew to look at. It does not affect the accuracy of any measured value.

---

## 1. The shortlist — 13 references, and what each one teaches us

| # | Reference | URL | What it teaches AEGIS, specifically |
|---|---|---|---|
| 1 | **Bartosz Ciechanowski, *Gears*** | https://ciechanow.ski/gears/ | That an explanation is paced by **figures, not headings**: 31 diagrams across 108 paragraphs, a figure every 3.48 paragraphs, and never more than 8 paragraphs of unbroken prose. This is the model for explaining the pipeline to a judge. |
| 2 | **Distill** (article template) | https://distill.pub/template.v2.js | The only complete, readable answer to *"when may a layout break its own grid?"*: five named widths — `text` 480 / `middle` 600 / `page` 720 / `gutter` / `screen` — so an outset is a **declared role**, not an exception. |
| 3 | **Oxide Computer** | https://oxide.computer/ | A hardware-infrastructure company whose entire visual language is hairlines, 1–6px radii, absolute-rem line-heights, and a **dedicated type scale for ASCII diagrams**. Closest tonal match to what AEGIS should be. |
| 4 | **Klim Type Foundry** | https://klim.co.nz/ | Restraint as a measurable fact: **2px radius, one easing curve, one transition, one `::selection` rule** in the whole bundle — and a palindromic 8-step grey ramp that inverts cleanly for dark mode. |
| 5 | **37signals** | https://37signals.com/ | Measure in `ch` (39ch / 49ch), underlines in `em`, shadows in `em`, and `--flow-space: calc(var(--line-height) * 1.2)` — vertical rhythm *derived from type*, not from a separate spacing scale. |
| 6 | **Linear's grain layer** | https://static.linear.app/web/_next/static/css/Grain.D_EBlr94.css | The only correct way to apply noise: `mix-blend-mode: overlay`, a 256×256 tile, `border-radius: inherit`, `pointer-events: none`, and **inset by 1px** in the markup so grain never crosses the container's own hairline. |
| 7 | **Rauno Freiberg, Web Interface Guidelines** | https://interfaces.rauno.me/ | The single densest list of micro-craft rules on the web, written by a Vercel design engineer. Roughly a third of it is directly actionable for us today. |
| 8 | **Anthropic** | https://www.anthropic.com/ | Shadow restraint at production scale: a 3-layer card shadow at **1% / 2% / 4% alpha**, and `text-wrap: balance` on 21 selectors / `pretty` on 10. |
| 9 | **Maggie Appleton** | https://maggieappleton.com/ | The "smooth shadow" ramp — 6 layers, constant `-10px` spread, alpha *rising* from `1a` to `26` — which is how you get a soft shadow without a grey smudge. |
| 10 | **Honest (Samuel Räikkönen)** | https://honest.fi/ | Zero `box-shadow` and zero `border-radius` declarations in the entire stylesheet. Hierarchy is 100% type scale and whitespace. Mono appears exactly once, on the contact line. |
| 11 | **Stripe Press** | https://press.stripe.com/ | Line-height locked to a **1.5 ratio** across every text role, and per-item colour taken from the object being described (the book jacket) rather than from a system palette. |
| 12 | **Butterick, *Practical Typography*** | https://practicaltypography.com/typography-in-ten-minutes.html | The measured floor: body 15–25px on screen, line spacing 120–145%, measure 45–90 characters. Anything outside those is a decision you must be able to defend. |
| 13 | **Berkeley Graphics** | https://berkeleygraphics.com/ | Technical-drawing aesthetic done with `letter-spacing: .1rem` as the *only* tracking value in the bundle, and `box-shadow: 0 0 0 .1rem rgba(0,0,0,.2)` rings instead of borders. A cautionary case too — see §11. |

---

## 2. Typographic systems

### 2.1 The scale is a multiplier on the root, and it is short

**Ciechanowski [OBSERVED]** (measured live, 1440×900): root 16px; body paragraphs **19.2px**
(= 1.2rem), section headings **28.8px** (= 1.8rem), article title **38.4px** (= 2.4rem). Three sizes.
That is the entire scale of a 108-paragraph, 31-figure technical article.

**Distill [OBSERVED]** (from `template.v2.js`): title 40px/1.1em/700 · dek 1.2rem/1.55em/**300** ·
abstract 1.25rem/1.6em · h2 24px/1.25em/600 · h3 18px/1.4em/700 · h4 14px/1.4em/600 uppercase ·
body 16px · captions and margin notes 12px · inline code 15px · `pre` 14px · table cells 15px ·
byline 0.8rem · byline labels 0.6rem uppercase.

**Klim [OBSERVED]**: a fixed ladder `14 / 16 / 18 / 24 / 36 / 48 / 64` px, shadowed by a fluid
ladder `--fontSizeFluidN: calc(N / var(--viewportBasis) * 100vw)` for `14 16 18 24 30 48 64 80 100
120`. Note the fixed ladder is *shorter* than the fluid one: display sizes are fluid, text sizes are
fixed.

**[INFERENCE]** Our `20-DESIGN-SPEC.md §2.4` already ships eight named roles (32 / 20 / 16 / 15 / 13
/ 12 / 11 / 10). That is one or two more than any of these references carries, and the bottom three
(12 / 11 / 10) are within 2px of each other. The spec is right to name roles rather than sizes; it is
one step too granular at the bottom. If `--text-meta` (11) and `--text-ledger` (10) differ only by a
pixel and a text-transform, they are the same size wearing two hats.

### 2.2 Line-height: absolute, not ratio, when you need a shared grid

**Oxide [OBSERVED]** declares line-height in **absolute rem** — `1rem`, `1.125rem`, `1.25rem`,
`1.375rem` (15×), `1.5rem`, `2rem`, `2.625rem`, `3.625rem` — and almost never as a ratio. Every text
role therefore lands on a common 2px lattice regardless of its font-size. This is the mechanism
behind the "everything lines up and I can't say why" feeling.

**Ciechanowski [OBSERVED]**: 19.2px text on 30.72px leading = ratio **1.60**, at a 73-character
measure. That is at the top of Butterick's 120–145% band and beyond it — justified by the long
measure.

**Stripe Press [OBSERVED]**: 25px/37.5px and 18px/27px — both exactly **1.5**. One ratio, applied
everywhere.

**Klim [OBSERVED]** keeps ratios but names them by role and lets display go below 1:
`--lineHeightHeading1: 0.98`, `Heading3: 1.1`, `Heading2: 1.25`, `Body1: 1.3333`, `Body2: 1.5`,
`Body4: 1.8`. A 0.98 line-height on a two-line display heading is what makes a masthead read as one
object rather than two lines.

**[INFERENCE]** The rule that falls out: **line-height rises with measure and falls with size.**
Ciechanowski at 73ch runs 1.60. Distill at ~63ch runs its body near 1.5. A 20px title at 28px
leading is 1.40. A 32px display at 36px is 1.125. Our spec's ladder already does this. What it does
*not* do is express the leading in `rem` — and it should, because the whole point of even integers is
a shared lattice, which you only actually get when leading is absolute.

### 2.3 Tracking as a continuous function of size

This is where the good work separates from the competent. **Oxide's tracking ladder [OBSERVED]**,
counted across the whole bundle:

| Value | Uses | Role (inferred from size context) |
|---|---|---|
| `.04rem` (0.64px) | 19 | mono / uppercase micro-labels |
| `.03em` | 9 | small caps |
| `.021em` | 13 | small text |
| `.014em` | 8 | 13–14px UI |
| `.009em`, `.004em` | 3 | 15–16px |
| `0` | 15 | body |
| `-.01em` | 2 | 20px |
| `-.013em` | 6 | 24px |
| `-.02em` / `-.021em` | 5 | 32–40px |
| `-.025em` | 1 | the largest display |

That is a smooth curve from **+0.04em at 10px to −0.025em at display size**, with the zero crossing
around 16px. It is not a two-bucket "tight headings, loose caps" rule; it is a ramp.

Corroborating values: **Anthropic [OBSERVED]** `-.02em`, `-.0025em`, `+.005em`, `+.01666em`.
**Honest [OBSERVED]** `-0.01em` (×8) and `-0.015em` — nothing else in the bundle.
**37signals [OBSERVED]** exactly two: `0.15em` on a micro-label, `-0.01em` on display.
**Berkeley Graphics [OBSERVED]** exactly one: `.1rem`, on everything.
**Ciechanowski [OBSERVED]** `letter-spacing: normal` on every element on the page. Zero.

**Butterick [OBSERVED]**: caps and small caps take **5–12% extra letterspacing**; 9–13pt body needs
none; above ~13pt, remove tracking. The explicit warning: never space letters far enough apart that
"the spaces between letters are large enough to fit more letters."

**[INFERENCE — and this is the single most important typographic finding for AEGIS]** Our codebase
currently ships **thirteen distinct tracking values**, of which `tracking-[0.22em]` (7 uses) and
`tracking-[0.34em]` (1 use) are 22% and 34%. Butterick's ceiling is 12%. `0.34em` on a 9px label is
not typography; it is a costume. The fix is a five-stop ramp bound to the size roles, nothing more —
see §10.

### 2.4 Weight: the top of the range is 590, and light is a legitimate display choice

**Rauno [OBSERVED, quoted]:** *"Font weights below 400 should not be used"* and *"Medium sized
headings generally look best with a font weight between 500-600"* and *"Font weight should not change
on hover or selected state to prevent layout shift."*

**Counter-evidence for display sizes, three independent sources:** Distill's dek is **300**
[OBSERVED]; Oxide declares `--font-weight-light: 300` [OBSERVED]; `11-RESEARCH-LANDING-FIRSTRUN.md`
§5 records Vanta at 88px/300 and Tailscale's 300-weight headlines [REPORTED, via that document].

**[INFERENCE]** The two are not in conflict. Rauno's rule is about *UI* text, where sub-400 weights
lose too much stem at 11–13px. The 300-weight finding is about *display* text above ~28px, where
lightness reads as confidence. AEGIS has exactly one place this applies: the landing display line.
Everywhere else, 400 / 510 / 590 as the spec already says, and **nothing bold**.

### 2.5 Mono and sans: what each is for, mechanically

**Honest [OBSERVED]** uses monospace exactly once on the whole site — the contact email. That one
switch does all the "this is a technical operator" signalling the site needs.

**Oxide [OBSERVED]** goes further and gives ASCII diagrams their own type scale:
`--ascii-xs-font-size: 7.5px`, `--ascii-sm: 10px`, `--ascii-md: 12px`, `--ascii-lg: 13px`. Mono isn't
just a font choice there — it is a *rendering medium* with its own sizes.

**[INFERENCE]** That is a genuinely stealable idea for us. A hash chain, a policy rule path, or a
pipeline-stage diagram drawn in box-drawing characters is a first-class artefact, and it needs sizes
that make the glyph cells line up, not the sizes the prose uses. Our spec's `--text-meta: 11px` is a
label size; an ASCII figure wants `--text-ascii: 12px / 16px` with `letter-spacing: 0` and
`font-variant-ligatures: none`.

### 2.6 Numerals and OpenType — and a live bug in our stack

**[OBSERVED]** `frontend/app/layout.tsx:2` imports `Geist` and `Geist_Mono` from
**`next/font/google`**. `frontend/package.json` has no `geist` dependency.

**[OBSERVED]** `https://fonts.googleapis.com/css2?family=Geist:wght@100..900` returns
`font-weight: 100 900` for both Geist and Geist Mono — so the variable weight axis is intact, and the
spec's `font-variation-settings: 'wght' 425 / 510 / 590` will work. A request that includes an `opsz`
axis is rejected, so **Geist has no optical-size axis** — `font-optical-sizing` is a no-op for us.

**[REPORTED, via research agent, from vercel.com/font]** Vercel's own font page states that the
Google Fonts delivery route ships a **reduced glyph set and does not support
`font-feature-settings`**, while the npm package and the manual download do.

**[INFERENCE — actionable]** `20-DESIGN-SPEC.md §2.4` puts `font-variant-numeric: tabular-nums` in
the base layer for every mono element, and the whole evidence-ledger design depends on digits
aligning. `tabular-nums` is the OpenType `tnum` feature. If Vercel's statement is accurate, **that
declaration silently does nothing on the current font delivery path.** This is cheap to fix and cheap
to verify: `npm i geist`, switch `layout.tsx` to `geist/font/sans` and `geist/font/mono`, then render
`0000000000` and `1111111111` in mono and compare widths. Do this before anyone spends a day tuning
the ledger. It also removes a build-time network dependency, which an air-gapped product should want
on principle.

---

## 3. Grid and composition

### 3.1 Distill's named-line grid — the best answer to "when do you break the grid"

**[OBSERVED]**, verbatim from `template.v2.js`, the widest breakpoint:

```css
grid-template-columns:
  [screen-start] 1fr
  [page-start kicker-start] 60px
  [middle-start] 60px
  [text-start kicker-end] 60px 60px 60px 60px 60px 60px 60px 60px
  [text-end gutter-start] 60px
  [middle-end] 60px
  [page-end gutter-end] 1fr
  [screen-end];
```

Which yields five addressable widths:

| Name | Width | What goes there |
|---|---|---|
| `text` | 480px | all prose, `d-article > *` by default |
| `middle` (`.l-body-outset`) | 600px | a figure that needs +25% |
| `page` (`.l-page`, `d-figure`) | 720px | the default for **every figure** |
| `gutter` | the 60px track right of `text` | `d-article aside` — margin notes, 12px/1.6em, `rgba(0,0,0,.6)` |
| `screen` (`.l-screen`) | full viewport | full-bleed only |

Two details that make it work. First, **figures default to `page`, not `text`** — a diagram is
always wider than the prose, by 50%, automatically. Second, at the middle breakpoint the tracks drop
to 50px (text 400 / middle 500 / page 600), and at the narrow breakpoint the grid becomes
**asymmetric**: `text-start` collapses onto `page-start` so the outsets only extend to the *right*.
Breaking out is a directional decision, not a symmetric one.

**[INFERENCE]** This is exactly the structure the AEGIS answer surface needs. A model's prose sits at
`text`. An evidence table, a stage rail, a P&ID crop, a hash chain sits at `page`. A policy citation
or a confidence note sits in `gutter`. Nothing is ever a floating card that happens to be wider —
every width is a name with a meaning, and a reviewer learns the names in about ninety seconds.

### 3.2 Measure: the references cluster far tighter than the guidance

| Source | Measure | Tag |
|---|---|---|
| Ciechanowski | **704px = 73 characters = 2.80 lowercase alphabets** | [OBSERVED, measured] |
| Distill `text` | 480px at 16px ≈ 63 characters | [OBSERVED, computed] |
| Honest | `max-width: 640px` (×5) | [OBSERVED] |
| Klim prose | `max-width: 430px` (×23) | [OBSERVED] |
| 37signals | `max-width: 49ch` and `39ch` | [OBSERVED] |
| Stripe Press lead | 609px ≈ 46 characters at 25px | [OBSERVED, measured] |
| Butterick | 45–90 characters, or "2–3 lowercase alphabets" | [OBSERVED] |
| `11-RESEARCH` cross-cutting | 55–67 characters | [REPORTED, that document] |

**[INFERENCE]** Two populations, and they are different jobs. **Long-form explanation runs long**
(63–73ch, Ciechanowski and Distill). **Product and marketing copy runs short** (39–49ch, 37signals
and Klim). The mistake is using one number for both. For AEGIS: model prose and the pipeline
explainer at **~68ch**; sign-in copy, empty states, denial reasons and tooltips at **~46ch**. Express
both in `ch` so they track the font, as 37signals does.

### 3.3 Vertical rhythm derived from type, not declared beside it

**37signals [OBSERVED]:** `--flow-space: calc(var(--line-height) * 1.2)`. The gap between block
elements is a function of the line-height, so changing type changes spacing automatically and the two
can never drift.

**Ciechanowski [OBSERVED]:** paragraphs carry `padding: 13.44px 0` — which is exactly `0.7 × 19.2px`,
the font-size. Inter-paragraph gap = 26.88px = 1.4 em. Section headings carry `padding-top: 21.6px`
and **no bottom margin at all**.

**Distill [OBSERVED]:** `h2 { margin: 2rem 0 1.5rem }`, `h3 { margin-top: 2em; margin-bottom: 1em }`
— the h3 margins are in `em` (so they scale with the heading), the h2's in `rem` (so they don't).
That is a deliberate distinction, not sloppiness: an h2 is a page-level rhythm event, an h3 is a
type-level one.

**[INFERENCE]** Our spec's `--space-1..12` ladder is correct for *layout* — control padding, panel
insets, grid gaps. It is the wrong instrument for *prose* rhythm. Add one token,
`--flow: calc(var(--lh-body) * 1.2)` = 24px at 13/20, and use it for every gap between text blocks in
the thread and the explainer. Type-derived spacing is a large part of why Ciechanowski reads as a
book and a console reads as a form.

### 3.4 Asymmetry

**[REPORTED, via gallery agent]** Across seven independently fetched, currently-celebrated sites
(WWAKE, honest.fi, Cozy Journal, Board, Daylight Health, Little Plains, Lambert | Lambert) spanning
three galleries, **asymmetric composition was the default and a symmetric centred layout did not
appear once.**

**[OBSERVED]** Distill's narrow breakpoint encodes the same instinct in a grid: the outsets extend
right only.

**[INFERENCE]** For us, asymmetry has to be earned in a product surface — a compliance console is
not a portfolio. But there is one legitimate and high-value application: the **left-hanging label**.
Distill does it (`d-appendix h3 { grid-column: page-start / text-start }` [OBSERVED]) — appendix
headings hang in the left margin rather than sitting above their content. A stage index, a timestamp,
or a rule id hanging in a 60px left rail while the content occupies the text column is asymmetric,
scannable, and completely appropriate for an instrument of record.

---

## 4. Hairlines, edges and depth

### 4.1 Derive the hairline from the ink, in alpha, and use two alphas only

**Distill [OBSERVED]** uses exactly two rule values across the whole article template:
`rgba(0, 0, 0, 0.1)` for every divider (article top, h2 underline, byline, appendix) and
`rgba(0, 0, 0, 0.2)` for the one heavier rule (table bottom). Text uses a parallel alpha ramp:
`0.8` body, `0.7` abstract, `0.65` appendix heading, `0.6` captions/asides/inline-code, `0.5`
appendix body and byline labels. **Nothing on the page is an opaque grey.** Every neutral is the ink
at an alpha over white.

**Klim [OBSERVED]** does the opaque version but makes it palindromic so it inverts:

```
mix1 #1c1c1c / #e2e2e2      mix5 #717171 / #8d8d8d
mix2 #383838 / #c6c6c6      mix6 #555    / #aaa
mix3 #555    / #aaa         mix7 #383838 / #c6c6c6   ← --borderColor
mix4 #717171 / #8d8d8d      mix8 #1c1c1c / #e2e2e2
```

Steps 5–8 mirror 4–1, and the light and dark values swap. The consequence is that `mix7` means "one
step off the ground" in both themes and every component can name a *distance from the ground*
rather than a colour.

**[INFERENCE]** `10-RESEARCH-CONSOLES.md §3.2` already reached the OKLCH-derivation conclusion via
Supabase, and `20-DESIGN-SPEC.md §2.2` implements it. Distill and Klim confirm it from completely
different traditions, which is about as much corroboration as a design decision ever gets. The one
thing to add from Klim: **make the index mean the same thing in both themes**, so `--line-2` is
`--line-2` whether the ground is `#f7f7f5` or `#121211`, and components stop branching on theme.

### 4.2 The double ring, confirmed independently of Vercel

**Oxide [OBSERVED]**, from its own token file:

```css
--shadow-border-base: 0 0 0 1px #ffffff0d;                /* translucent, outside */
--shadow-border-bg:   0 0 0 1px var(--surface-secondary); /* opaque page colour, inside */
--shadow-border:      var(--shadow-border-base), var(--shadow-border-bg);

--shadow-small:  0px 1px 2px #00000029;
--shadow-medium: 0px 2px 2px #00000052, 0px 8px 8px -8px #00000029;
--shadow-large:  0px 2px 2px #0000000a, 0px 8px 16px -4px #0000000a;
--shadow-menu:   var(--shadow-border-base), 0px 1px 1px #00000005,
                 0px 4px 8px -4px #0000000a, 0px 16px 24px -8px /* … */;
--shadow-toast:  0px 1px 1px #00000005, 0px 4px 8px -4px #0000000a,
                 0px 16px 24px -8px #0000000f;
--inset-outline: 1px solid #ffffff15;
```

Same technique as Geist, arrived at by a different company: translucent ring outside, opaque
ground-colour ring inside, shadow between them. `20-DESIGN-SPEC.md §2.6` already ships this. Treat
Oxide as the second witness.

Oxide's radii, counted across the bundle [OBSERVED]: `0.0625rem` (1px) ×4, `0.125rem` (2px) ×7,
`0.25rem` (4px) ×7, `0.375rem` (6px) ×1, `0` ×3, `--radius-full` ×1. **The largest non-pill radius on
the entire site is 6px.** Klim's is 2px. Our house radius of 4px sits exactly in that band.

### 4.3 Shadows: alpha, and where it should go

Three ramps, three philosophies, all [OBSERVED]:

```css
/* Anthropic — card. Three layers, 1% / 2% / 4%. */
box-shadow: 0 2px 2px #00000003, 0 4px 4px #00000005, 0 16px 24px #0000000a;

/* Anthropic — deep. Six layers, alpha rises, offsets ×~1.8 each step. */
box-shadow: 0 4px 3px #00000005, 0 10px 8px #00000008, 0 19px 15px #0000000a,
            0 34px 27px #0000000a, 0 63px 50px #0000000d, 0 150px 120px #00000012;

/* Maggie Appleton — constant -10px spread; alpha rises 1a → 26. */
box-shadow: .2px .4px .8px -10px #0000001a, .4px .9px 2px -10px #0000001c,
            .8px 1.8px 3.8px -10px #0000001f, 1.3px 3.1px 6.7px -10px #00000021,
            2.5px 5.8px 12.5px -10px #00000026, 6px 14px 30px -10px /* … */;

/* 37signals — everything in em, so the shadow scales with the type. */
box-shadow: 0 0 0 1px rgba(var(--rgb-black), .03),
            0 .2em 1.6em -.8em rgba(var(--rgb-black), .1),
            0 .4em 2.4em -1.2em rgba(var(--rgb-black), .1);
```

**[INFERENCE] Note the disagreement with our own spec.** `20-DESIGN-SPEC.md §2.6` says "Alpha FALLS
as elevation rises," citing Linear. Anthropic and Maggie Appleton both do the opposite *within a
single shadow*: alpha rises across the layers of one ramp. Both are true and they are about different
things. **Across elevation rungs**, alpha falls (Linear is right — a big soft shadow must be fainter
or it becomes a smudge). **Within one multi-layer shadow**, alpha rises with blur (Anthropic is
right — the near-contact layer is tight and faint, the ambient layer is broad and slightly stronger).
Our rungs already follow the first rule. Nothing to change; worth writing down so nobody "fixes" it.

**[OBSERVED]** Josh Comeau's rule on shadow geometry: every shadow on a page should share one offset
ratio, with vertical offset **2× the horizontal**, and the shadow colour should be a desaturated,
darkened version of the *background* hue rather than pure black. Anthropic and Oxide both use pure
`#000000` at very low alpha instead, which is the simpler and — **[INFERENCE]** — correct choice on a
near-neutral warm paper, because a hue-matched shadow on `#f7f7f5` would be indistinguishable from
black at 3% and would only add a token nobody can verify.

### 4.4 Underlines are a hairline problem, and everybody solves it in `em`

```css
/* Oxide */      text-decoration-color: color-mix(in srgb, currentColor 50%, transparent);
                 text-decoration-thickness: 1px; text-underline-offset: 1px;
/* Anthropic */  text-underline-offset: .2em; text-decoration-thickness: .07em;
/* 37signals */  text-decoration-thickness: .085em; text-underline-offset: .0875em;
/* Ciechanowski */ underline 1.152px, offset 1.92px  (= .06em / .10em at 19.2px)
/* Honest */     text-underline-offset: 3px;
/* Maggie */     text-decoration-skip-ink: auto;
```

All [OBSERVED]. Two ideas worth taking whole. First, **thickness and offset in `em`** so a link
looks the same at 11px and 32px — 0.07–0.085em thickness, 0.09–0.2em offset. Second, **Oxide's
`color-mix(in srgb, currentColor 50%, transparent)`**, which makes an underline automatically half
the weight of whatever text it's under, in any colour, in any theme, from one declaration. That is
the most elegant single line of CSS I found in this entire sweep.

---

## 5. Texture and surface

### 5.1 The only grain implementation worth copying

Linear ships grain, and I have the stylesheet verbatim [OBSERVED]
(`static.linear.app/web/_next/static/css/Grain.D_EBlr94.css`, 482 bytes, entire file):

```css
.grain {
  pointer-events: none;
  border-radius: inherit;
  opacity: .9;
  mix-blend-mode: overlay;
  background-size: 256px 256px;
  position: absolute;
  inset: 0;
}
.grain::after {                      /* a +6% white wash on top of the grain */
  content: "";
  pointer-events: none;
  border-radius: inherit;
  background: #ffffff0f;
  position: absolute;
  inset: 0;
}
@supports ((-webkit-hyphens: none)) {      /* Safari: drop the wash */
  .grain::after { background: 0 0; }
}
.grainSubtle { opacity: .6; background-size: 256px 256px; }
.grainSubtle::after { content: none; }
```

And in the markup [OBSERVED]:
`<div class="grain grainSubtle grainOverlay" style="inset:1px">` — also `style="top:1px"`.

Five craft decisions in 482 bytes, and every one of them is the reason it doesn't look cheap:

1. **`mix-blend-mode: overlay`**, not opacity over a flat fill. Grain modulates what is beneath it
   rather than sitting on it, so it disappears in the darkest and lightest regions and only shows in
   the midtones — which is how real film grain behaves.
2. **`background-size: 256px 256px`** — a tiled 256px texture. Large enough that no repeat is
   visible, small enough to stay tiny.
3. **`border-radius: inherit`** — the grain layer takes its container's radius automatically. Nobody
   has to remember.
4. **`pointer-events: none`** — it never eats a click.
5. **`style="inset: 1px"`** — the grain is inset by one pixel so it sits *inside* the container's own
   hairline and never muddies the edge. This is the detail that separates someone who read a tutorial
   from someone who shipped it.

Plus a Safari carve-out: `@supports ((-webkit-hyphens: none))` is the standard Safari sniff, and the
white wash is dropped there because Safari composites `overlay` differently.

### 5.2 The noise texture itself, offline

**[REPORTED, via research agent, from CSS-Tricks "Grainy Gradients"]** the one concrete parameter set
published is:

```xml
<feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch' />
```

`fractalNoise` (not `turbulence`) is what gives soft cloudy grain rather than sharp static;
`stitchTiles='stitch'` is what makes a 256px tile repeat without a visible seam.

Encoded as a data URI so it never leaves the bundle — which is mandatory for us:

```css
--grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
```

**[REPORTED]** the tasteful band is roughly **3–8% effective opacity**, becoming visible-as-noise
above ~12–15%. **[INFERENCE]** On a light warm paper this band is *lower* than on Linear's near-black
ground, because grain has far more luminance headroom to disturb on `#f7f7f5` than on `#08090a`. My
recommendation is a ceiling of **4%** on paper, with `mix-blend-mode: multiply` rather than `overlay`
— overlay on a light ground brightens more than it darkens, which reads as a smudge rather than a
fibre.

### 5.3 Grids: what ours is doing wrong

`globals.css:130-142` ships `@utility tech-grid` — two 1px `linear-gradient`s at `--grid #eceae6`,
`background-size: 56px 56px` [OBSERVED, our source].

**[INFERENCE]** Two problems. First, 56px is an arbitrary number with no relationship to any spacing
token; the spacing ladder tops out at 64 and the row heights are 32/36. A grid whose pitch matches
nothing looks like wallpaper. Second, a *line* grid is a strong statement — it draws an actual cage —
where a *dot* grid states the same thing at a fraction of the visual cost:

```css
/* line grid — reads as a cage */
background-image: linear-gradient(to right, var(--grid) 1px, transparent 1px),
                  linear-gradient(to bottom, var(--grid) 1px, transparent 1px);

/* dot grid — reads as graph paper, ~1/8 the ink at the same pitch */
background-image: radial-gradient(circle at 1px 1px, var(--grid) 1px, transparent 0);
background-size: 32px 32px;
```

Pick 32px (= `--space-9`) so the grid pitch is a spacing token, and use dots. Use it on **one**
surface — the empty first-run canvas — and nowhere else.

### 5.4 The tint-instead-of-fill trick

**Klim [OBSERVED]:** `box-shadow: 0 0 0 1000px var(--foregroundColorMix8) inset`.

A 1000px inset spread fills the entire element with a tint via `box-shadow`, leaving
`background-color` free. **[INFERENCE]** Worth knowing for exactly one case: a selected or hovered
table row that already owns its `background-color` from a zebra or status rule. You can tint it
without touching, or having to recompute, the underlying fill — and unlike a background change, it
composites over an image or a chart.

---

## 6. Micro-craft — the details that read as expensive

All of §6.1 is **[OBSERVED]**, quoted from Rauno Freiberg's *Web Interface Guidelines*
(interfaces.rauno.me). I have selected the items that apply to us and dropped the rest.

### 6.1 Rules quoted verbatim

- *"Interactive elements in a vertical or horizontal list should have no dead areas between each
  element, instead, increase their padding."* — **[INFERENCE]** the highest-value item on the list for
  a 36px-row queue. Gaps between rows are a hit-target bug that reads as sloppiness.
- *"Input prefix and suffix decorations, such as icons, should be absolutely positioned on top of the
  text input with padding, not next to it, and trigger focus on the input."*
- *"Font weight should not change on hover or selected state to prevent layout shift."*
- *"Box shadow should be used for focus rings, not outline which won't respect radius."* With the
  footnote: Safari did not honour `border-radius` on custom outlines until 16.4.
- *"Animation duration should not be more than 200ms for interactions to feel immediate."*
- *"Don't animate dialog scale in from 0 → 1, fade opacity and scale from ~0.8."*
- *"Don't scale buttons on press from 1 → 0.8, but ~0.96, ~0.9, or so."*
- *"To open immediately on press, dropdown menus should trigger on mousedown, not click."*
- *"Show a temporary inline checkmark on a successful copy, not a notification."*
- *"Disabled buttons should not have tooltips, they are not accessible"* — because a disabled button
  is out of tab order, so a keyboard user never hears why it is disabled.
- *"Decorative elements (glows, gradients) should disable pointer-events to not hijack events."*
- *"Interactive elements should disable user-select for inner content."*
- *"Switching themes should not trigger transitions and animations on elements."*
- *"Hover states should not be visible on touch press, use `@media (hover: hover)`."*
- *"Disable the default iOS tap highlight with `-webkit-tap-highlight-color: rgba(0,0,0,0)`, but
  always replace it with an appropriate alternative."*
- *"Where available, tabular figures should be applied with `font-variant-numeric: tabular-nums`."*
- *"Scaling and blurring filled rectangles will cause banding, use radial gradients instead."*
- *"When using nested menus, use a 'prediction cone' to prevent the pointer from accidentally closing
  the menu when moving across other elements."*
- *"Gradient text should unset the gradient on `::selection` state."*
- *"Style the document selection state with `::selection`."*
- *"Actions that are frequent and low in novelty should avoid extraneous animations"* — listing
  right-click menus, list add/delete, and trivial button hovers.

Independent corroboration for `-webkit-tap-highlight-color: transparent`: Klim ships it 6× and Oxide
and Anthropic each ship it [all OBSERVED]. Nobody good leaves the iOS tap flash on.

### 6.2 Focus rings — the actual spec numbers

**[OBSERVED, via research agent, from w3.org/TR/WCAG22]** — and this corrects a citation that appears
in our own design spec:

- **SC 2.4.11 "Focus Not Obscured (Minimum)", Level AA** is about *occlusion*: *"When a user interface
  component receives keyboard focus, the component is not entirely hidden due to author-created
  content."* It contains **no numeric contrast or area threshold.**
- **SC 2.4.13 "Focus Appearance", Level AAA** is the one with the numbers: *"…an area of the focus
  indicator …is at least as large as the area of a 2 CSS pixel thick perimeter of the unfocused
  component …and has a contrast ratio of at least 3:1 between the same pixels in the focused and
  unfocused states."* Minimum-area formulas given: rectangle `4h + 4w`; circle `4πr`; rounded
  rectangle `4h + 4w − (16 − 4π)r`. The 3:1 is measured **between the focused and unfocused states of
  the same pixels**, not against the background.

**[INFERENCE]** `20-DESIGN-SPEC.md §2.7` justifies replacing `--ring: #8a8783` by citing "WCAG
2.4.11's 3:1 against adjacent colours." The *conclusion* is right — `#8a8783` on `#f7f7f5` is 3.33:1
and on `--border` is 2.56:1, and an ink ring is far better — but the *citation* is to the wrong
success criterion, and the criterion that does carry the number is AAA rather than AA. Fix the
citation before a regulator or an accessibility auditor reads it, because in a compliance product a
mis-cited standard is worse than no citation. The spec's gap ring (2px paper, 2px ink) clears 2.4.13
comfortably on its own merits.

### 6.3 Selection, caret, scrollbars

```css
/* Klim  */ ::selection { background-color: var(--foregroundColor); }   /* full ink */
/* Anthropic */ ::selection { background: rgba(204, 120, 92, .5); }     /* brand @ 50% */
/* 37signals */ ::selection { background: rgba(var(--rgb-white), .15); }
/* Oxide */ ::selection { background-color: var(--surface-accent); }
/* Honest */ scrollbar-width: none; ::-webkit-scrollbar { display: none; }
/* rauno.me */ scrollbar-width: thin; scrollbar-color: var(--colors-gray9) transparent;
```

All [OBSERVED]. **[INFERENCE]** Our `globals.css:121-124` already does the Klim thing —
`::selection { background: #0a0a0a; color: #f7f7f5 }` — and it is the right answer for us: full ink,
no hue, maximum confidence, and it survives printing and greyscale. Keep it. Add `scrollbar-width:
thin; scrollbar-color: var(--line-strong) transparent;` and `scrollbar-gutter: stable` on the thread
and ledger panes — **[OBSERVED, via agent, from MDN]** `scrollbar-gutter` reached Baseline in
December 2024, and it eliminates the horizontal jump when a list crosses the overflow threshold,
which in a live queue happens constantly. Hiding scrollbars entirely, as Honest does, is wrong for
us: an auditor needs to know how much of a 1,908-row ledger they are looking at.

### 6.4 Wrapping and trimming

**[OBSERVED]** Anthropic ships `text-wrap: balance` on 21 selectors and `text-wrap: pretty` on 10.
Oxide ships both. **[OBSERVED, via agent, from MDN]** `balance` is capped at **6 lines in Chromium
and 10 in Firefox** — past the cap it silently falls back — so it belongs on headings, chips, captions
and button labels, never on body copy. `pretty` has no cap but costs render time, so it belongs on
paragraphs only.

**[OBSERVED, via agent, from MDN]** `text-box-trim` / `text-box-edge` reached **Baseline in August
2026**:

```css
.heading { text-box: trim-both cap alphabetic; }   /* shorthand */
```

This removes the half-leading above cap-height and below the baseline, which is the reason a 20px
heading in a 28px line box never sits where you drew it in Figma. **[INFERENCE]** Behind
`@supports (text-box-trim: trim-both)`, this is the cheapest single improvement available to our
headings, chips and buttons — it makes padding mean what it says. It is Baseline as of a month ago,
so treat it as progressive enhancement, not as load-bearing.

`hanging-punctuation: first` [OBSERVED, via agent, from MDN] is **not Baseline** and Firefox has not
shipped it. **[INFERENCE]** Skip it. It is the kind of detail that is invisible when it works and
inconsistent when it doesn't.

### 6.5 Two things nobody sets that everybody should

**[OBSERVED]** Ciechanowski's `body` computes to `-webkit-font-smoothing: auto` and
`text-rendering: auto` — he sets neither. Our `globals.css:118-119` sets both `antialiased` and
`optimizeLegibility`. Rauno recommends both [OBSERVED]. **[INFERENCE]** `antialiased` is defensible
and now conventional; `text-rendering: optimizeLegibility` is not — it is a documented source of
layout jank and inconsistent ligature behaviour, it has no effect that `font-feature-settings`
doesn't give you deliberately, and on a page of monospace identifiers it can enable ligatures you
explicitly do not want (`!=` and `=>` becoming glyphs in a hash or a rule path is a correctness
problem, not a style one). Delete it and add `font-variant-ligatures: none` to the mono base rule.

---

## 7. Editorial patterns for explaining complex things

This is the section for "explain a governed AI pipeline to a judge in ninety seconds." The two gold
standards behave very differently and both are right.

### 7.1 Ciechanowski: the figure is the argument, prose is the connective tissue

All **[OBSERVED]**, measured live on `/gears/`:

- **31 interactive figures against 108 paragraphs.** Mean **3.48 paragraphs between figures.**
- The actual run lengths, in document order: `1, 3, 2, 3, 2, 3, 3, 3, 7, 2, 3, 2, 4, 6, 3, 1, 1, 8,
  2, 2, 2, 3, 2, 7, 2, 3, 4, 4, 5, 7`. **The longest stretch of unbroken prose in the entire article
  is eight paragraphs, and the mode is two to three.**
- **Figure widths vary and are mostly narrower than the text.** Measured: 500×270, 350×368, 650×293,
  280×280, 704×352, 350×350, against a 704px measure. A figure is sized to what it has to show. It is
  never stretched to the column and never allowed past it.
- **Section headings are visually quiet**: 28.8px against 19.2px body — a ratio of 1.5 — with
  `padding-top: 21.6px` and *no bottom margin*. And they are all `<h1>`, i.e. a flat hierarchy: one
  level of section, no subsections.
- **Headings are lighter than the body text**: `#535353` against `#444444`. The heading recedes; the
  argument advances.
- Ground is `#f8f8f8` — two points off our own `#f7f7f5` — and body ink is `#444444`, not black.

**[INFERENCE] What this means for the AEGIS explainer.** Do not write a page with five headings and
a diagram at the top. Write **eleven short passages, each anchored to one figure of the stage it
describes**, with the figure sized to the thing it shows. A judge scrolling at speed reads the
figures and the first line under each; a judge reading carefully gets the prose. The same page serves
both, which is the whole trick.

### 7.2 Distill: the apparatus around the argument

All **[OBSERVED]** from `template.v2.js`. Distill's contribution is not pacing, it is the **scaffolding
for a claim that has to be checkable** — which is precisely our problem.

```css
d-article { border-top: 1px solid rgba(0,0,0,.1); padding-top: 2rem;
            color: rgba(0,0,0,.8); contain: layout style; }
d-article h2 { font: 600 24px/1.25em; margin: 2rem 0 1.5rem;
               border-bottom: 1px solid rgba(0,0,0,.1); padding-bottom: 1rem; }
d-article h3 { font: 700 18px/1.4em; margin-top: 2em; margin-bottom: 1em; }
d-article h4 { font: 600 14px/1.4em; text-transform: uppercase; }
d-article aside { grid-column: gutter; font-size: 12px; line-height: 1.6em;
                  color: rgba(0,0,0,.6); }
figcaption    { font-size: 12px; line-height: 1.5em; color: rgba(0,0,0,.6); }
d-code        { background: rgba(0,0,0,.04); border-radius: 2px; padding: 4px 7px;
                font-size: 15px; color: rgba(0,0,0,.6); white-space: nowrap; }
d-byline      { border-top: 1px solid rgba(0,0,0,.1); font-size: .8rem;
                line-height: 1.8em; padding: 1.5rem 0; }
d-byline h3   { font-size: .6rem; font-weight: 400; text-transform: uppercase;
                color: rgba(0,0,0,.5); }
d-appendix    { margin-top: 60px; padding-top: 60px;
                border-top: 1px solid rgba(0,0,0,.1);
                font-size: .8em; line-height: 1.7em; color: rgba(0,0,0,.5); }
d-appendix h3 { grid-column: page-start / text-start; font-size: 15px;
                font-weight: 500; color: rgba(0,0,0,.65); }
sup           { font-size: .75em; top: -.5em; line-height: 1em; }
```

Five patterns worth lifting wholesale:

1. **A rule under every h2, not a bigger h2.** Section separation is a 1px line at 10% ink plus
   `padding-bottom: 1rem`, not a jump in type size. This lets the scale stay short.
2. **Margin notes live in a named grid track**, at 12px / 60% ink. A model's confidence caveat, a
   policy citation, or a "this figure is estimated" note goes here — beside the claim, not inside it,
   and never in a tooltip.
3. **Inline code is a 4%-ink chip with a 2px radius and `white-space: nowrap`.** A rule path or a
   hash is a single unbreakable object. Note the radius: 2px on a 15px chip, *not* the house 4px.
4. **The appendix is typographically demoted, not hidden**: 80% size, 50% ink, separated by 60px of
   space above and below a hairline. Its headings hang in the left margin. This is exactly the right
   treatment for "how this was computed" — present, findable, subordinate.
5. **The whole ink ramp is alpha**: .8 body / .7 abstract / .65 / .6 captions / .5 appendix. Five
   steps, all the same colour.

### 7.3 A composite structure for our pipeline explainer

**[INFERENCE]**, built from the two above and nothing else:

| Element | Treatment |
|---|---|
| Title | `--text-display` 32/36 at `-0.03em`, weight 400 |
| Dek | 20px/28px at weight 400, ink at 70% — one sentence, one claim |
| Section heading (×11, one per stage) | `--text-heading` 16/24 with a `--line-default` rule under it and 16px of padding below; **no** size jump, **no** second level |
| Stage index | mono `--text-meta`, hanging in the left rail, not inline |
| Prose | `--text-answer` 15/24, measure ~68ch, `text-wrap: pretty` |
| Figure | 1.5× the prose width (the `page` track), **sized to content**, centred, never wider than `page` |
| Caption | `--text-ui` 12/16 at 60% ink, left-aligned under the figure, never centred |
| Margin note | `--text-ui` 12/16 at 60% ink in the `gutter` track |
| Machine value | mono chip, `--surface-sunken`, 2px radius, `white-space: nowrap` |
| Method appendix | 80% size, 50% ink, 48px above and below a hairline, heading hanging left |

Pacing target, from Ciechanowski's measured figures: **a diagram every 2–4 paragraphs, and never
more than 8 paragraphs without one.**

---

## 8. Restraint as a signal, and the mechanism behind it

Restraint reads as confidence for a specific, mechanical reason: **every additional visual device is
a claim that the content could not carry itself.** A glow says "this needs help being noticed." A
gradient says "this surface is not interesting enough as a surface." Bold says "you would not have
found this on your own." When the content genuinely is the point, each device you remove is a small
assertion that it doesn't need the help — and readers hear that assertion even when they can't name
it.

The evidence that the best work is *countably* smaller, all **[OBSERVED]** by counting declarations in
shipped stylesheets:

| Site | Distinct radii | `transition` declarations | `cubic-bezier` values | `box-shadow` values | Tracking values |
|---|---|---|---|---|---|
| **Klim** | 2 (`2px`, `50%`) | **1** (`opacity 300ms, visibility 300ms`) | **1** | **1** (an inset tint) | **0** |
| **Honest** | **0** | 15, all on `opacity` | 1 (`--ease-out`) | **0** | 2 |
| **Oxide** | 6, max **6px** | **1** (`opacity .1s ease-in-out`) | 21 declared, 2 used | 6 named tokens | ~17, on a ramp |
| **Berkeley Graphics** | 13 | — | — | 19 | **1** (`.1rem`) |
| **Ciechanowski** | — | — | — | none on the article | **0** (`normal` everywhere) |
| **AEGIS today** | **6 classes, `rounded-full` the most common at 45 uses** | 29× `transition-all` + 47 others | (see §10) | — | **13** |

Klim is a **type foundry**. Their entire product is typographic sophistication. They ship one radius,
one curve, one transition, and zero letter-spacing declarations — because they are demonstrating that
they don't need any of it. That is the mechanism, stated as plainly as it can be stated.

Honest ships **zero shadows and zero radii on the whole site** and is currently featured across
multiple galleries for looking expensive.

**[INFERENCE]** The test to apply to every AEGIS screen: *remove the device and see whether anything
is actually lost.* Remove the card border — is the group still legible from the tint and the
hairline? Remove the glow — is the active stage still findable from position and weight? Remove the
pulse — does anyone fail to notice the run is live? In almost every case in the current codebase the
answer is no, nothing is lost, which means the device was carrying no information and was therefore
pure cost.

---

## 9. Patterns worth stealing — 35 implementable instructions

Each one fits inside our tokens. No new hues, no new typefaces, nothing that needs the network.

**Type**

1. Express every line-height in absolute `rem`, not as a ratio, so all roles land on one 2px lattice. *(Oxide — `1rem / 1.125 / 1.25 / 1.375 / 1.5 / 2 / 2.625rem`)*
2. Ship tracking as a five-stop ramp bound to size — `+0.04em ≤11px · +0.02em 12px · 0 13–16px · −0.013em 20px · −0.025em 32px` — and delete every other value. *(Oxide's measured ladder)*
3. Cap uppercase tracking at **0.12em**; anything above is outside the published range. *(Butterick: caps take 5–12%)*
4. Use weight 300 at one place only — the landing display line above 28px — and 400/510/590 everywhere else. *(Distill's 300 dek; Rauno: "font weights below 400 should not be used")*
5. Never change `font-weight` on hover or selection; change colour or background instead. *(Rauno)*
6. Give ASCII and box-drawing figures their own size token (`--text-ascii: 12px/16px`) plus `letter-spacing: 0` and `font-variant-ligatures: none`. *(Oxide's `--ascii-*-font-size` family)*
7. Set prose measure in `ch`, not px: ~68ch for explanation, ~46ch for product copy. *(37signals `49ch` / `39ch`)*
8. Put `text-wrap: balance` on headings, chips and button labels only — it silently gives up past 6 lines in Chromium. *(Anthropic ×21; MDN)*
9. Put `text-wrap: pretty` on paragraphs only, never globally — it costs render time. *(Anthropic ×10; MDN)*
10. Add `text-box: trim-both cap alphabetic` behind `@supports`, so heading and button padding finally means what it says. *(MDN — Baseline Aug 2026)*
11. Delete `text-rendering: optimizeLegibility` from the base layer and add `font-variant-ligatures: none` to mono. *(Ciechanowski sets neither; ligatures in a hash are a correctness bug)*
12. Move off `next/font/google` to the `geist` npm package so `font-feature-settings` and `tabular-nums` actually apply. *(Vercel's own font page; verify with a `0000000000` vs `1111111111` width test)*

**Lines, edges, depth**

13. Set underline thickness and offset in `em` — `0.07em` and `0.12em` — so links look identical at 11px and 32px. *(37signals `.085em`/`.0875em`; Anthropic `.07em`/`.2em`)*
14. Draw every underline with `text-decoration-color: color-mix(in srgb, currentColor 50%, transparent)` — one declaration, correct in every colour and both themes. *(Oxide)*
15. Give the `--line-*` family an index that means the same distance-from-ground in light and dark, so components never branch on theme. *(Klim's palindromic `mix1..mix8`)*
16. Keep exactly two rule alphas — a default and one heavier for table bottoms — and derive both from the ink. *(Distill: `rgba(0,0,0,.1)` and `rgba(0,0,0,.2)`)*
17. Inside one multi-layer shadow, let alpha **rise** as blur grows; across elevation rungs, let it **fall**. Write this down so nobody "corrects" it. *(Anthropic; Maggie Appleton; vs Linear)*
18. Keep the card shadow at 1% / 2% / 4% — `0 2px 2px #00000003, 0 4px 4px #00000005, 0 16px 24px #0000000a`. *(Anthropic, verbatim)*
19. Hold every offset at a 1:2 horizontal-to-vertical ratio across all shadows on the page. *(Josh Comeau)*
20. Cap non-pill radius at 6px, and stop using `rounded-full` for anything that isn't a dot or an avatar. *(Oxide's largest is 6px; Klim's only radius is 2px)*
21. Use `box-shadow: 0 0 0 1000px <tint> inset` to tint a row that already owns its `background-color`. *(Klim)*

**Composition**

22. Replace ad-hoc widths with four named grid tracks — `text` / `middle` / `page` / `screen` — plus a `gutter` for margin notes, and make every figure default to `page`. *(Distill)*
23. Make the grid asymmetric at narrow widths: collapse `text-start` onto `page-start` so outsets extend one direction only. *(Distill's narrow breakpoint)*
24. Hang stage indices, timestamps and rule ids in a left rail spanning `page-start / text-start` rather than setting them inline. *(Distill `d-appendix h3`)*
25. Derive prose rhythm from type: `--flow: calc(var(--lh-body) * 1.2)` and use it between every text block. *(37signals `--flow-space`)*
26. Separate sections with a hairline under the heading plus 16px of padding, not with a bigger heading. *(Distill `h2`)*
27. Size figures to their content, centre them, and never stretch one to fill the column. *(Ciechanowski: 280–704px figures against a 704px measure)*
28. Pace the explainer at a figure every 2–4 paragraphs, hard ceiling of 8. *(Ciechanowski, measured: mean 3.48, max 8)*
29. Set section headings in an ink *lighter* than the body, not darker. *(Ciechanowski: `#535353` headings over `#444444` body)*

**Micro-craft**

30. Remove dead space between list rows by growing row padding instead of adding a gap. *(Rauno)*
31. Absolutely position input icons over the field with padding, not beside it, and make them focus the input. *(Rauno)*
32. Add `scrollbar-gutter: stable` and `scrollbar-width: thin` to the thread and ledger panes so crossing the overflow threshold never shifts the layout. *(rauno.me; MDN — Baseline Dec 2024)*
33. Confirm a copy with an inline checkmark on the trigger, never a toast. *(Rauno)*
34. Open menus on `mousedown`, not `click`. *(Rauno)*
35. Put `pointer-events: none` on every decorative layer, and `border-radius: inherit` on every overlay so it takes its container's corners automatically. *(Linear's grain layer)*

---

## 10. What is specifically wrong with the current AEGIS visual language

Read against everything above. All counts are **[OBSERVED]** from a mechanical grep over the 39
`.tsx` files in `app/` and `components/`, plus a full read of `globals.css`. I have ordered these by
how much each one costs us with a cold reader, and I am not going to be polite about it, because
being polite about it is how it got here.

### 10.1 The app is written in monospace. It should not be.

**232 uses of `font-mono`. 4 uses of `font-sans`.**

Monospace is not the app's accent. It is the app's **default voice**, by a factor of 58. Per our own
principle P4, mono means machine-issued. When 232 things are machine-issued, nothing is, and the
product stops reading as an instrument and starts reading as a set dressing of one. Honest.fi
[OBSERVED] uses mono exactly once on an entire website and gets more technical credibility from that
one switch than this codebase gets from 232.

**Replace with:** mono on ids, hashes, hosts, timestamps, latencies, rule paths, model names,
coordinates, and ASCII figures. Nothing else. `11-RESEARCH-LANDING-FIRSTRUN.md §5.1.4` already said
this about the sign-in screen; it is true of every screen.

### 10.2 The tracking is theatre

Thirteen distinct tracking values, of which the most common are:

| Value | Uses | Verdict |
|---|---|---|
| `tracking-[0.16em]` | 31 | 16% — above Butterick's 12% ceiling |
| `tracking-wider` (0.05em) | 22 | fine |
| `tracking-[0.14em]` | 12 | 14% — above the ceiling |
| `tracking-[0.2em]` | 11 | 20% |
| `tracking-[0.22em]` | 7 | 22% |
| `tracking-[0.12em]` | 6 | at the ceiling |
| `tracking-[0.18em]` | 3 | 18% |
| `tracking-[0.34em]` | 1 | **34%** |

Butterick's published band for caps is **5–12%**, with the explicit rule that you must not open the
spacing wide enough to fit another letter between the existing ones. `tracking-[0.34em]` on a 9px
label does exactly that. Oxide's entire tracking ladder tops out at `0.04rem` — **0.64px** — for its
uppercase mono labels. Ours runs five times wider.

The canonical offender is `components/primitives.tsx:20`, `TechnicalLabel`:

```tsx
'inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-foreground-muted'
```

mono + 11px + uppercase + 22% tracking + muted, in one atom, used across the entire application. That
is five costume decisions stacked on one element. **Replace with** `--text-ledger` (10px) in mono at
`+0.06em`, sentence case where it is a label and uppercase only where it is a section marker, and cut
the number of places it appears by at least half.

### 10.3 The type scale is 344 hardcoded arbitrary values, centred two sizes too small

```
text-[11px] × 88    text-[10px] × 84    text-[13px] × 67    text-[12px] × 62
text-[9px]  × 19    text-[15px] × 10    text-[14px] × 9     text-[20px] × 3
text-[64px] × 2
```

The centre of gravity of this application is **10–11px**. Butterick's floor for screen body text is
**15px**. Distill's smallest role is 12px and it is reserved for captions and margin notes.
Ciechanowski's smallest anything is 19.2px. **19 uses of `text-[9px]`** — including a tooltip at
`sovereign-radial-hero.tsx:251` — are below the point where Geist's stems survive rendering, and
completely unreadable on a projector or in a printed evidence pack, which our own §4.9 anti-pattern
list says is a real output.

Nine distinct sizes, none of them named, spread across 344 call sites. `20-DESIGN-SPEC.md §2.4`
already defines the role tokens. **The work is not designing a scale — it is deleting 344 arbitrary
values.** Until that happens every other typographic decision here is unenforceable.

### 10.4 The display type is marketing typography, and it is inside the product

```tsx
// components/ask/ask-view.tsx:307
<h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-[-0.035em] … md:text-[64px]">
// components/console/console-view.tsx:475  — same
// components/sign-in/sign-in-view.tsx:147
<h1 className="text-balance text-5xl font-extrabold leading-[1.02] tracking-[-0.035em] … xl:text-6xl">
```

**64px `font-extrabold`** on the Ask page and the Console page — not the landing page, the *working
surfaces*. `11-RESEARCH-LANDING-FIRSTRUN.md §3.A` measured the equivalent auth headline across ten
good products: Linear 18px, Tailscale 20px, Doppler 20px, Vercel 32px as the outlier. And every
independent authority in this document points the other way on weight: Distill's dek is **300**,
Vanta's 88px display is **300**, Rauno's ceiling for headings is **600**, Grafana refuses to exceed
500 anywhere in its UI. `font-extrabold` is 800.

`font-bold` appears **48** times, `font-semibold` 31, `font-medium` 28, `font-extrabold` 3,
`font-black` 1. Five weights above normal, with bold the most common.

**Replace with:** `--text-title` (20/28) as the largest thing on any product screen; `--text-display`
(32/36) at weight 400 reserved for the landing; `font-bold`, `font-extrabold` and `font-black` deleted
from the codebase entirely.

### 10.5 The radius token is 4px and the most-used radius is infinity

```
rounded-full × 45    rounded × 32    rounded-lg × 24    rounded-xl × 21
rounded-md   × 10    rounded-none × 3
```

`rounded-full` is the single most common radius in a product whose declared house radius is 4px, and
`rounded-xl` (12px) appears 21 times. Oxide's largest non-pill radius across its whole site is 6px.
Klim ships 2px and nothing else. `11-RESEARCH-LANDING-FIRSTRUN.md §4.10` already recorded the rule:
"anything rounder reads consumer."

A pill-shaped status chip in a compliance console reads as a notification badge. **Replace with:**
`rounded-full` on dots and avatars only; everything else 2/4/6px per the spec's nesting rule.

### 10.6 Depth is 195 borders and zero rings

```
border × 195    border-border × 162    border-foreground × 53
border-b × 25   border-t × 20          border-critical × 13
```

Every separated surface in this application is a `border`, which means every hover and focus state
that touches an edge shifts layout by a pixel, and every nested container adds a visible frame.
Meanwhile `bg-surface*` appears 87 times and `bg-surface-sunken*` 47 — so surfaces are being fenced
*and* filled, doubling the separation cost. `10-RESEARCH-CONSOLES.md §3.11` and
`20-DESIGN-SPEC.md §2.6` both already call for rings; Oxide independently ships the same double-ring
construction. Nothing in the codebase uses it yet.

### 10.7 Motion is decoration, and it never stops

```
transition-all × 29       transition-colors × 47     transition-opacity × 5
transition-transform × 5  (87 total)                 duration-200 × 17
duration-300  × 5         duration-500 × 1           duration-150 × 7
animate-spin  × 17        animate-pulse × 3          animate-ping × 1
animate-bounce × 1        backdrop-blur-* × 11
```

`globals.css:163-237` defines ten infinite-loop keyframes — `sov-pulse`, `sov-blink`, `sov-drift`,
`sov-spin-slow`, `sov-radar-sweep`, `sov-laser-flow`, `sov-glow-pulse`, `sov-glow-pulse-active`,
`sov-trace`, `sov-dash` — plus a `sov-deflection-burst`. `20-DESIGN-SPEC.md §2.0` already marks these
for deletion. Two further points it does not make:

- **`animate-bounce` and `animate-ping` are in a compliance console.** Rauno's rule is 200ms for
  interactions; Tailwind's `bounce` is a 1s infinite loop. There is no reading of our product in
  which something bounces.
- **`transition-all` × 29.** Klim's *entire* stylesheet contains one transition declaration. Oxide's
  contains one: `opacity .1s ease-in-out`. Ours has **87** across four properties.

`sov-glow-pulse` is worth calling out by name, because it is the most expensive single mistake in the
file:

```css
0%, 100% { box-shadow: 0 0 12px rgba(22,163,74,.25), inset 0 0 8px rgba(22,163,74,.1); }
50%      { box-shadow: 0 0 24px rgba(22,163,74,.50), inset 0 0 16px rgba(22,163,74,.25); }
```

A pulsing green glow on a status element. Nothing in this document's entire reference set — not
Oxide, not Linear, not Anthropic, not Stripe — glows. `10-RESEARCH-CONSOLES.md §4.6` already
identified glow as reading as marketing; I will put it more bluntly: **a pulsing green glow around a
"sovereign" indicator is the visual grammar of a crypto landing page, and a regulator will read it
that way.**

### 10.8 The focus ring is functionally invisible

`sign-in-view.tsx:318` and `:340`:

```tsx
focus:border-foreground focus:bg-surface focus:outline-none focus:ring-2 focus:ring-foreground/10
```

`--foreground` at **10% alpha** over `--surface-sunken` is roughly 1.1:1. WCAG 2.4.13's threshold for
the focused/unfocused delta is **3:1** [OBSERVED, w3.org/TR/WCAG22]. This ring is decorative; it does
not function. The `focus:border-foreground` beside it is doing all the real work, and it is a 1px
border on a control, which is the weakest legal indicator. `20-DESIGN-SPEC.md §2.7` fixes this with
the ink gap ring — it just has not shipped, and it cites the wrong success criterion while doing it
(see §6.2).

### 10.9 The hero is a technical-looking object that reports nothing

`components/sovereign-radial-hero.tsx` contains, all **[OBSERVED]** in that one file: a radar sweep
gradient (`radialGradient id="radarSweepGrad"`), four hardcoded `rgba(140,138,134,…)` /
`rgba(160,158,154,…)` stroke colours that exist in no token, a
`bg-[var(--sovereign)]/10 blur-sm` halo, `shadow-[0_0_12px_rgba(22,163,74,0.45)]` on the active node,
`hover:scale-105`, `backdrop-blur-md`, `shadow-xl`, and a 9px mono tooltip.

Every one of those is a device. None of them carries a measurement. Per our own P1 and P5 — motion
must have a named referent, absence must render as an em dash — a radar sweep that sweeps whether or
not anything is being scanned is a decorative animation wearing a technical costume, and it is the
exact thing a judge is trained to distrust.

### 10.10 Texture: a 56px grid with no relationship to anything

`@utility tech-grid` at `background-size: 56px 56px` [OBSERVED]. 56 is not in the spacing ladder
(`…32, 40, 48, 64`), is not a row height (32/36), and is not a control size (32/36/40). A grid whose
pitch matches nothing is wallpaper. **Replace with** a dot grid at 32px — see §5.3 — used on exactly
one surface.

### 10.11 Summary — the five changes with the highest ratio of effect to effort

**[INFERENCE]**, judged against everything above:

1. **Delete `font-mono` from ~200 of its 232 call sites.** Highest single visual delta in the
   codebase. The product stops cosplaying and starts reading as an instrument.
2. **Collapse 13 tracking values to 5 and 9 arbitrary sizes to the spec's named roles.** 344 edits,
   almost all mechanical, and it makes every subsequent typographic decision enforceable.
3. **Delete every infinite keyframe, the radial hero's glow/sweep/scale, and all 29 `transition-all`s.**
   `20-DESIGN-SPEC.md §2.0` already sanctions most of this. Nothing is lost; §8's removal test passes
   on every one.
4. **Swap `next/font/google` for the `geist` npm package**, then verify tabular figures actually
   render. Half an hour, and without it the evidence ledger's number alignment is built on a
   declaration that does nothing.
5. **Replace `border` with the `--elev-0` ring on the ~50 container-level uses**, and let tint plus a
   hairline group everything else. This is the de-carding work `10-RESEARCH-CONSOLES.md §7.3` already
   ranked third; it is still the biggest structural improvement available.

---

## 11. Wrong for us — beautiful things that would be inappropriate here

These are all genuinely good, and all of them would cost us credibility with a regulator, an
inspector, or a judge. Listed with the reason, so the reason can be argued with rather than the
conclusion.

1. **Grain on the product surface.** Linear's grain layer is the best-executed texture in this
   document and I would happily use it on a portfolio. On an instrument of record it is the wrong
   claim: grain says *analogue, warm, hand-made*, and an audit trail's entire value proposition is
   that it is none of those things. **[INFERENCE]** If it is used at all, it belongs on the landing
   page above the fold and nowhere past the sign-in boundary — and at ≤4%, with `multiply`, never
   `overlay`, on a light ground.

2. **Fluid type keyed to viewport width.** Klim's `calc(N / var(--viewportBasis) * 100vw)` and
   Rauno's `clamp(48px, 5vw, 72px)` are both elegant. They are wrong for us for the same reason our
   own anti-pattern list rejects a density toggle: **screenshots from this product end up in evidence
   packs.** If two auditors at two window widths capture the same screen and the type is a different
   size, screenshot comparison gets harder. Fixed sizes. One density. Always.

3. **Per-object colour taken from the object.** Stripe Press gives every book its jacket's colour —
   14 distinct heading colours on one index page [OBSERVED]. It is lovely and it is the correct
   solution to a catalogue. For us it would mean, say, per-document accent colours in the evidence
   ledger, which breaks P2 (hue is the scarcest channel), breaks greyscale printing, and invents a
   colour vocabulary nobody can audit.

4. **Hiding the scrollbar.** Honest's `scrollbar-width: none` looks immaculate. An auditor reading
   row 412 of 1,908 needs to know where they are in the set. Scrollbar position is information here,
   not chrome.

5. **The all-`<h1>` flat hierarchy.** Ciechanowski's every section heading is an `<h1>` [OBSERVED],
   which is fine for an essay read linearly. Our explainer will be deep-linked, cited by paragraph,
   and read by a screen reader following a heading outline. Use the structure honestly.

6. **A radar sweep, a laser flow, or any animation of scanning.** Beautiful in a demo, and it is
   exactly what `04-MOTION §2.1` means by motion without a referent. If nothing is being scanned,
   nothing should sweep. This is already in our codebase and should not be.

7. **Optical/optimistic flourishes on destructive or legally-meaningful actions.** Rauno's
   *"Optimistically update data locally and roll back on server error"* is correct for a task app. An
   approval is a signed act; `10-RESEARCH-CONSOLES.md §4.1` already ruled on this and it is worth
   restating because Rauno's list is otherwise near-universally applicable and it would be easy to
   adopt wholesale.

8. **Berkeley Graphics' full technical-drawing pastiche.** Thirteen radii, nineteen shadow values,
   `2px 2px #ddd` hard offset shadows, and shadows used to draw glyph decorations. It commits to a
   1970s draughting aesthetic completely, and commitment is why it works. A half-committed version —
   which is what we would build, because we also need to be a usable console — reads as a theme, and
   a themed compliance tool is a less trustworthy compliance tool. We already have one foot in this
   trap: mono everywhere, ASCII-adjacent labels, coordinate annotations, "SOVEREIGNTY POSTURE."

9. **A command palette as the primary path, illustrated empty states, skeleton screens, relative-only
   timestamps, infinite scroll.** Already covered in `10-RESEARCH-CONSOLES.md §4`; listed here only so
   this document's "wrong for us" section isn't read as complete on its own.

10. **`hanging-punctuation`.** Not Baseline, not in Firefox [OBSERVED, MDN]. A typographic refinement
    that works in two browsers and not the third is worse than not doing it, because the difference is
    visible in a side-by-side and unexplainable.

---

## 12. Sources

**Measured first-hand in a browser (computed styles at 1440×900, DPR 1):**
- https://ciechanow.ski/gears/ — type, measure, figure pacing, figure widths, colour, link craft
- https://press.stripe.com/ — type roles, line-height ratio, per-book colour

**Read first-hand (shipped stylesheets and templates pulled and parsed):**
- https://distill.pub/template.v2.js — the full article grid and editorial type system
- https://oxide.computer/ — tracking ladder, rem line-heights, shadow/ring tokens, easing set, ASCII scale
- https://klim.co.nz/ — radius, grey ramp, fluid/fixed type ladders, selection, inset-tint trick
- https://37signals.com/ — `ch` measure, em underlines, em shadows, `--flow-space`
- https://www.anthropic.com/ — shadow ramps, underline craft, `text-wrap` usage, selection
- https://maggieappleton.com/ — the smooth-shadow ramp
- https://honest.fi/ — zero shadows, zero radii, easing token, measure
- https://berkeleygraphics.com/ — single tracking value, ring-instead-of-border
- https://static.linear.app/web/_next/static/css/Grain.D_EBlr94.css — the grain layer, complete
- https://rauno.me/craft/interaction-design — gesture and interruptibility reasoning
- https://fonts.googleapis.com/css2?family=Geist:wght@100..900 — Geist variable axis, absence of `opsz`

**Read first-hand (prose):**
- https://interfaces.rauno.me/ — Web Interface Guidelines, quoted verbatim in §6.1
- https://practicaltypography.com/typography-in-ten-minutes.html — size, leading, measure
- https://practicaltypography.com/letterspacing.html — the 5–12% caps range
- https://www.joshwcomeau.com/css/designing-shadows/ — offset ratio, shadow hue
- https://www.joshwcomeau.com/css/custom-css-reset/ — `text-wrap`, `font: inherit`, `isolation`

**Cited secondhand via dispatched research agents (verify before relying on):**
- w3.org/TR/WCAG22 — SC 2.4.11 and SC 2.4.13 exact text and area formulas
- MDN — `text-box-trim` (Baseline Aug 2026), `scrollbar-gutter` (Baseline Dec 2024),
  `text-wrap` line caps, `hanging-punctuation` support, `::selection` allowed properties
- css-tricks.com "Grainy Gradients" — the `feTurbulence` parameter set
- vercel.com/font — Geist weights; the Google-Fonts-route feature-settings limitation
- emilkowal.ski/ui/great-animations — duration guidance
- radix-ui.com/primitives/docs/guides/animation — `ease-out` in / `ease-in` out at 300ms
- siteinspire.com, minimal.gallery, typewolf.com, httpster.net, onepagelove.com,
  darkmodedesign.com — the current-gallery sweep summarised in §3.4

**Read in full before writing, to avoid duplication:**
- `docs/plan/10-RESEARCH-CONSOLES.md`, `docs/plan/11-RESEARCH-LANDING-FIRSTRUN.md`,
  `docs/plan/20-DESIGN-SPEC.md` §§1–2, `frontend/app/globals.css`

**Could not access** — named in §0 rather than guessed at.
