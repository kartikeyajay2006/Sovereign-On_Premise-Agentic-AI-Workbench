# MEASURED LIGHT

> **Superseded on 24 Sep 2026.** The product moved from this dark-first
> direction to a calm, light-first one set by the best AI product sites: warm
> ivory and near-black ink with a dark theme on a switch, one sans family
> (Geist), two-tone sentence-case headlines, ink pills for actions, product
> screens in soft frames, and one cheap fade-up for motion. The mechanism is
> the token blocks and the THE PUBLIC PAGES and LABELS sections of
> `frontend/app/globals.css`; the mark is `frontend/components/aegis-logo.tsx`.
> What stays from this document is its rule about honesty: hue only for a
> state the system measured, and nothing drawn that nobody measured. The
> motion primitives in `frontend/shared/motion/` remain in use.


**Dark by default. Lit by evidence.**

The design direction for AEGIS. This is the argument; the mechanism is the MEASURED LIGHT and SIGNATURE MOTIONS sections of `frontend/app/globals.css` and the primitives in `frontend/shared/motion/`. `PLAYBOOK.md` says, screen by screen, how to apply it.

---

## 1. The idea

AEGIS is an instrument in a dark room. The room is warm and deep and quiet: warm near-black ground, ink at a few strengths, hairlines you feel more than see. **The only light in it comes from something the system measured.** A run that passes verification emits green light; a deliverable held for a person emits amber; a policy refusal emits red and settles; a stage that is running now is blue, and only while it runs. Where nothing was measured, nothing glows.

This is how AEGIS gets richer and more colourful without lying. Colour stops being paint on the interface and becomes *light emitted by events*. The more the system does, the more alive the screen is. A screen with the backend stopped is dark and says so, and that darkness is part of the argument. The product's thesis is *"Local is not enough. So prove the rest."* The interface proves it by never lighting anything it cannot account for.

Motion follows the same rule. Light arrives at the moment a state is reached, blooms, and cools to what the settled state keeps. Content arrives by *moving*, at full opacity, so it is always readable. Nothing breathes, pulses or drifts while idle. The screen is alive in exact proportion to what the machine is actually doing.

---

## 2. Principles

Eight. Each one can be checked by inspecting the running app, and each comes with the check.

**P1 — Dark by default, lit by evidence.** A status hue or a glow on screen means a measured state.
*Check:* stop the backend and load every screen. Nothing may glow, pulse or wear a status hue. Every reading shows as absent (an em dash, or nothing), and every screen says the service is unreachable.

**P2 — Every colour is a sentence, and there are only five sentences.** *Proved. Running. Held for a person. Refused or failed. You can act.* Everything else is warm ink at some strength.
*Check:* point at any hue on screen and say which of the five it is and what measured it. If you can't, or if two hues say the same thing, this fails. A hue on a *category* (a log's "model" rows in blue) fails outright, because categories are not states.

**P3 — Ink never fades in; light does.** Text, numbers, rows and panels arrive by moving, at full opacity. Only light (glows, washes, rims, the palette scrim) animates its opacity.
*Check:* throttle the CPU 6× in DevTools, record a run and scrub it. At every frame all content is fully legible. Only light varies.

**P4 — Every motion has a referent.** Each animation is bound to one backend event or one user action, named in a comment where it is defined. Nothing loops unless the thing it depicts is running.
*Check:* load any screen, touch nothing, watch for sixty seconds. The only things that move are bound to a running process: the active stage's dot, the dwell counter.

**P5 — A number never passes through values it did not have.** Counters *roll* between measured values and never tween. A first reading appears; it does not count up from zero.
*Check:* record any count changing. Every glyph in every frame belongs to either the old reading or the new one.

**P6 — Arrive once.** An answer, a verdict or a certificate appears once, whole and already checked. It is never streamed and then badged.
*Check:* no character of answer prose appears in the answer register before verification completes. The labelled "Drafting — not yet verified" register is the one exception, and it is visibly not the answer.

**P7 — The instrument yields to the work.** Chrome is quiet (muted tabs, hairlines, no chrome hue) and content state is loud. From Linear: *"Don't compete for attention you haven't earned."*
*Check:* in any screenshot, the brightest and most saturated thing is a content state or the one lime action. It is never the header, a border or a decoration.

**P8 — Keyboard first, and the keyboard does not wait.** Every screen, run and demo action is reachable from keys. Changes a key causes do not animate.
*Check:* run the whole demo script without touching the mouse, and see no animation between keypress and result except the 120ms palette settle.

---

## 3. Colour

### 3.1 The five lights

Each state has three forms: a **fill** for marks, rings and rails; a **text** variant (the only form a word may take); and, new in this direction, an **emission** colour for light.

| Light | Fill | Text | Emission | It means | It may light when | It never |
|---|---|---|---|---|---|---|
| **Proved** | `--sovereign` #16a34a | `--sovereign-text` | `--emit-sovereign` oklch(.80 .19 150) | a check passed; the record holds; the host is contained | a claim verifies, a chain recomputes, a run is delivered verified, a seal commits | means "good" or "success" in general |
| **Running** | `--active` #0284c7 | `--active-text` | `--emit-active` oklch(.76 .15 238) | a process is executing right now | a stage becomes active; only for as long as it is | appears on anything finished, or on a verdict |
| **Held** | `--approval` #d97706 | `--approval-text` | `--emit-approval` oklch(.82 .16 66) | a person must look or decide | a run is held, a report needs sign-off, the queue grows | pulses. Held means the system is idle, waiting. |
| **Refused / failed** | `--critical` #dc2626 | `--critical-text` | `--emit-critical` oklch(.70 .21 26) | policy said no (the system working), or something broke (a bug) | a denial settles, a seal breaks, a check fails | shakes, flashes or strobes. It is also never used for "unsupported", which is an absence, not a wrong. |
| **Act** | `--action` #dcf23c | (as text 15.43:1) | `--emit-action` = lime | you can press this | only under the pointer, on the one primary action | appears twice in one decision context |

A refusal and a failure share a hue, so they are told apart by shape. A refusal is a solid fill with an inverted glyph (⛔); a failure is a critical edge on a tint (✕). *A denial is the product working; a failure is a bug* (docs/plan/04 §3.2).

Everything that is not one of the five is **ink**: `--foreground`, `--foreground-secondary` and `--foreground-muted` on the warm ground, plus the `--line-*` and `--control-*` hairlines. Selection is ink (an ink rail and a tint). Tracing a citation is ink. Hover is ink. None of them may take a hue, or "selected" would read as "verified".

### 3.2 Three intensities of light

Light comes in three strengths, each with a place it may appear.

1. **Bloom:** arrival. The state's emission colour flares around the object that reached it (a 1px rim plus an 18px falloff), then cools over `--afterglow` (1200ms) to what the state keeps. One bloom per event, on the object that carries the state. Primitive: `<Light bloomKey>`.
2. **Rim:** a state that holds. A resting 1px edge of light at about half strength, for states that stay true and matter while they are true: a refusal, a verified chain head, the one running stage. `<Light rest="rim">`.
3. **Wash:** a state falling across a surface from the edge that owns it. A gradient from 11% of the fill hue to nothing by 70%, used on a panel whose whole subject is the state: the held deliverable, the refusal card, the broken-chain notice. `wash-approval` etc.

**On a wash, words are ink.** This was measured, not assumed. The `-text` tokens have almost no margin on `--surface`: active-text is 4.54:1 there, and on its own wash it falls to 4.08:1. So a washed panel labels its state with a rule or glyph in the fill hue (non-text, at least 3.70:1), and its words are `--foreground` (13.28:1 or better) or `--foreground-secondary` (7.61:1 or better). The full table is in globals.css beside `--wash-*`.

### 3.3 The spectrum: where AEGIS is most colourful

When one screen holds many records (a harness's twenty-four items, an audit chain of seven hundred, a stage board), each record gets a **cell**, coloured by what it measurably came to. This is the most colourful thing in the product, and it is also where colour carries the most information. A progress bar says "62%"; a spectrum says *which* 62%, which ones are held, and the one that was refused.

Nine cell states, and no two share both a fill style and a hue: pending (empty, control edge), active (lit), proved, review (approval edge on a tint), held (approval fill), refused (critical fill), failed (critical edge on a tint), neutral (muted fill, meaning delivered with nothing to check), and skipped (a dash). As non-text marks every fill clears 3:1 on the ground and on `--surface`; critical is the lowest, at 3.99 and 3.70. Empty cells are drawn in `--control-strong` (3.64:1) rather than a line token (line-strong is 2.04:1), because an empty cell must still be seen. Primitive: `<Spectrum>`; classes `.aegis-strip-cell[data-state]`.

### 3.4 Neutrals that give depth without hue

* **The lamp.** One static radial falloff of the ground's own hue at the top of the app frame (`--lamp`). The working surface is lit from above, like an instrument panel, and the page has depth instead of being a flat void. It never moves and carries no state.
* **The rim.** A 1px inner highlight along the top edge of every raised object (`--rim`, folded into `--elev-1..3`). On a dark ground this is what makes a menu, the composer or a modal read as a machined object rather than a rectangle.
* **Line and control hairlines**, as already built: dividers lighter than control edges, both derived from one warm donor.

### 3.5 Rationing rules

1. **One lime per decision context.** The primary button is the only lime fill, and it emits light only under the pointer.
2. **One bloom per event, on the object that carries it.** A verified answer blooms. The page around it does not.
3. **No hue on taxonomy.** Audit categories, evidence modalities and model names are told apart by glyph, position and label, never by colour. The audit trail currently colours "model" rows `--active`, which says *running*; that goes (see the Playbook).
4. **No hue for identity.** Colour never brands a space, a user, a model or a harness. (Arc gives each space its own colour; that is the opposite of this product.)
5. **A light is never the only carrier.** Every lit object also states its state as a glyph, a word or a fill, so it survives greyscale, projectors, reduced motion and screen readers.
6. **Status text uses `-text` tokens, and never sits on a wash.**

### 3.6 Forbidden

Ambient gradients, and any gradient that animates. Mesh or aurora backgrounds. Glows on hover, except the lime action. Glows on idle objects. Film grain in the app (a blend-mode layer re-composites everything under it on every frame a run changes the page; grain is acceptable on the landing hero, at no more than 4%, if the landing wants texture). `backdrop-filter` on anything that can sit over a live board. Pure black. Pure white. Tailwind palette colours (`text-green-500` etc.): every hue comes from a token.

### 3.7 Why emission is written in OKLCH

The fills are literal hex because their contrast ratios are proved, and a live `oklch()` expression outside sRGB would be gamut-mapped to a different value. The emission colours are the reverse. They are light, not labels, so no ratio applies to them, and they are written in OKLCH with more chroma than the fills. Computed: active, approval and critical sit just outside sRGB and inside Display P3; sovereign's fits sRGB. On a P3 laptop those three render more saturated than sRGB can show. On an sRGB projector the browser maps them down along chroma, which only ever makes a light quieter. It is the one place the product reaches for colour beyond sRGB, and it is where that colour carries meaning.

---

## 4. Type

The system in globals.css stands: eight roles from display (32/36) to ledger (10/14), tracking that turns negative above 16px and positive below it, weights 400/510/590, mono at 425. What this direction adds and settles:

* **Mono means machine-issued.** Ids, hashes, counts, latencies, rule paths and model names are set in mono. What a person or a model wrote is set in sans. Nothing else decides between them.
* **The figure role.** A measured value at headline size, once per panel: 28/32, −0.02em, tabular. It is the `type-figure` utility, deliberately not a `text-*` token, because `cn()` in lib/utils.ts would drop an unknown `text-*` size as a colour. Use it for the one number a panel exists to show: non-loopback connections, a sandbox run's peak memory, a harness's proved count. Render the value with `<MeasuredNumber>`.
* **10px is the floor.** The logo's 9px sub-label was the last thing under it and is now ledger.
* **The serif turn** (a system serif, italic, on the second line of a display heading) belongs to the landing page and sign-in only. The app never uses it.
* **Numbers are tabular everywhere**, and changing numbers roll (P5).

**Fonts are local.** Geist Sans and Geist Mono come from the `geist` package (Vercel's distribution, loaded through `next/font/local`), so neither the build nor the running pages reach Google. The switch was made after a dev server that could not download from Google silently rendered every ledger figure in a fallback face: the air-gap blocker, observed rather than predicted. The package sets the same CSS variables, so nothing else changed.

---

## 5. Motion

### 5.1 Laws

1. **Ink never fades in; light does** (P3).
2. **Every motion names its referent** (P4).
3. **A number never passes through values it did not have** (P5).
4. **Keyboard-caused changes do not animate.** Rauno's frequency principle and Emil Kowalski's rule: a list moved with j/k, a palette row, a tab switched from the keyboard are all instant.
5. **Transform and opacity only.** The one layout animation is `grid-template-rows` for a disclosure. Everything is composited, so it holds its frame rate while the main thread parses an event burst and the CPU runs a model.
6. **Nothing overshoots.** No springs. A spring passes through positions the object does not hold, which is P5 applied to space. Curves decelerate into place.
7. **Reduced motion loses nothing.** Under `prefers-reduced-motion` every duration is zero: the three tiers, the hold, the seal, the afterglow and the landing. Travel is also removed at each rule. Every animation completes on its first frame and holds its end state, and every fact it carried is still on screen as a fill, glyph, word or count. There are no exceptions, not even for opacity-only light, so code written later cannot fall through the contract.

### 5.2 Durations

| Token | Value | For |
|---|---|---|
| `--micro` | 120ms, `--ease-micro` | feedback under the pointer or key; the palette settle; the tab hover glide |
| `--standard` | 200ms, `--ease-standard` | a thing changing state: an appended row, a roll, the turn between screens, a sweep step |
| `--spatial` | 300ms, `--ease-spatial` | a thing occupying space: a block appearing, a rail, the active-tab glide, a disclosure |
| `--dur-hold` | 480ms | the refusal settling. Used for nothing else. |
| `--dur-seal` | 640ms | a hash committing. Once per event, and the longest motion in the product. |
| `--afterglow` | 1200ms | light cooling after an event. Opacity only. |
| `--dur-land` | 900ms | a trace landing: contract, hold, release |
| hover pair | 0ms in, 150ms out | every highlight. Highlights appear at once and decay. |

The delight-impact curve (from Family) sets the ceremony: the rarer the event, the more it may do. A hover is instant; a row settles in 200ms; a verified answer blooms; a seal takes 640ms and happens a handful of times a day.

### 5.3 The signature motions

| Motion | Means | Referent (only this may trigger it) | What moves | Tier | Primitive / class |
|---|---|---|---|---|---|
| **APPEND** | a record joined the chain | a row the backend wrote *while the list was on screen* (an evidence item, an audit record, a settled harness item, a stage event) | the row settles 4px at full opacity; a wash and a 2px rule in its tone cool behind it | standard + afterglow; stagger 40ms, capped at 5 | `<AppendScope>` + `<Append tone index>` · `.aegis-append` |
| **VERIFY** | a check moved across a set, exactly as far as it has got | counted progress from a real check: the browser's chain recompute, a per-claim verifier, harness children settling | a sovereign fill advancing to `done/total`, with an active leading edge that turns critical and stops on a failure; each checked cell ticks | standard per step | `<Sweep done total state>` · `<Spectrum>` ticks · `.aegis-sweep` |
| **RELEASE** | the answer, arriving once and already checked | the authoritative read after verification (the thread's `settle()`) | the answer rises 8px at full opacity; the verdict blooms around it once (sovereign if every check passed, approval if held, none if unverified) and lets go | spatial + afterglow | `<Release verdict>` |
| **REFUSE** | policy said no, and it has settled | `task.blocked`, a policy 403, a sandbox denial | the rest of the scope recedes to `--opacity-dim`; a critical rule draws down the refused object's edge; a critical light blooms and rests as a rim; the reason opens | hold (480ms) | `<DimScope>` + `<Refused>` + `<Disclose tempo="hold">` |
| **SEAL** | a hash committed | an audit write or verify completing, a deliverable's sha256, a harness report hash, a decision recorded | a 1px rule draws under the (already legible) hash, left to right; a filled mark seats at its end. **No character is ever scrambled or typed on.** | seal (640ms) | `<Seal sealed token>` · `.aegis-seal` |
| **TRACE** | this claim rests on that source | the reader activating a citation or evidence reference | the source scrolls into view and an ink ring contracts onto it, holds, and lets go; hovering either end lights both | land (900ms) | `<TraceTarget active token>` + `<TraceScope>` with `data-trace` |
| **TURN** | same instrument, different reading | a navigation (a React transition) | the header holds still; the old screen is cut; the new one settles 6px up at full opacity | standard | `<RouteStage>` (React `<ViewTransition>`) |
| **ROLL** | a reading changed | a new value for a measured number | only the changed characters move: the old glyph leaves and the new one arrives from the direction the value went | standard | `<MeasuredNumber>` |

Also: **APPEAR** (`<Appear>`) is a block mounting because its data arrived (spatial, full opacity). It is plumbing, not a signature.

### 5.4 What "alive" means here, a beat sheet

A run in the thread, from dispatch to decision. Every beat names its event.

| Event | On screen |
|---|---|
| dispatch accepted | the turn mounts (APPEAR); the stage board is legible before anything runs |
| `task.stage` → classify active | its marker lights blue (rim), the dot pulses (the one permitted loop, because it is running), the dwell counter counts real time |
| stage passes | the marker blooms green and rests; the connector draws into the next stage |
| `task.evidence` | rows APPEND in the rail, lit and cooling; the count above them ROLLS |
| verify stage | checks resolve as they report; if they report together, they APPEND in reading order, and no sweep is drawn over results that already exist |
| `settle()` delivered | the answer RELEASES; the sovereign bloom lets go; the deliverable hash SEALS |
| or held | amber bloom; the deliverable row takes the approval wash and lock glyph; the Approvals tab's count rises and lights |
| or refused | REFUSE: the board dims, the refusal settles with its rule and rim, the reason opens |
| reader clicks [S3] | TRACE: the rail opens, and the row lands |
| reviewer approves | on the Approvals screen the row's ⏸ becomes ✓ and blooms green; the decision's record SEALS |

With the backend stopped, none of these happens, and the screen says why.

---

## 6. Interaction

**Keyboard.** Ctrl/⌘K opens the palette from anywhere. Every screen, recent run, recent harness run and demo action is in it: New run, Containment self-test, and, when searched for, account switches and Sign out. Each list says whether it is reading, read (with the time), empty or failed. **G then a letter** jumps: T Thread, H Harnesses, A Approvals, K Knowledge, P Posture, S Sandbox, L Audit. The palette lists them and so does each tab's title. Screen-level keys stay with their screens (Approvals: j/k, Enter, a/r, Esc), and the G sequence is resolved in the capture phase so G-then-A navigates instead of opening an approval. Nothing listens while a field has focus or a modal is open.

**Hover.** Instant in, 150ms out, on every highlight (`hover-decay`). In the header, the highlight glides from tab to tab while the pointer moves across the group, appears at once where the pointer enters, and decays on leave. Hover never lights anything with a hue except the lime action.

**Focus.** An ink gap ring, instant, never replaced by a hover style (the lime hover glow yields to it). A list with a roving selection keeps an inset ring so the scroll container cannot clip it.

**Press.** The house button gives 2% (`scale(.98)`) for as long as it is held, instantly. Other pressables use the `press` utility. There is never a translate, because a translate moves a control off its row.

**Lists.** Pointer selection follows mouse*move*, not mouse*enter*, so a list scrolled by the keyboard under a still pointer never has its selection stolen. Rows never re-sort as results arrive. Sorting is something the reader does.

**Drag.** Files can be dropped onto the composer, which outlines in ink while one is over it. Nothing in the product is reordered by dragging.

**Selection** is ink: an inset 2px `--selected-rail` and `--selected-surface`. **Tracing** is ink.

---

## 7. The shell and the information architecture

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ ▣ AEGIS   Thread  Harnesses  Approvals ³  Knowledge  Assurance    [⌕ Go to… Ctrl K] ● MONITORED  [A] │ 56px
│                                                     ▔▔▔▔▔▔▔▔▔                          │ ink rule, glides
│           Posture   Sandbox   Audit                  (Assurance screens only)          │ 36px
│           ▔▔▔▔▔▔▔                                                                      │
└───────────────────────────────────────────────────────────────────────────────────────┘
  lamp: static falloff from the top ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Five places, seven screens.** The reduction from seven tabs to five removed *duplicates*: Ask and Tasks were the thread under other names. The rule it followed was one place per job, not per subsystem, and that same rule places the two new screens.

* **Harnesses** is a new job (ask the same question of many things, as one governed run), so it is a place.
* **Sandbox** is not a new job. It is the most direct way to see this host contain a real payload, which is exactly what Assurance is for. The Assurance screen already defines itself as *"what this host can show about its own conduct"*, and the audit chain is that host's record of its conduct. So **Assurance holds three readings (Posture, Sandbox and Audit)** behind a second header row that exists only on those screens.
* The places are **Thread · Harnesses · Approvals · Knowledge · Assurance**. The navigation now reads like the product's promise: work, the gate, the knowledge, the proof.
* Every URL is unchanged. The Assurance tab opens `/audit` for the auditor role and `/security` for everyone else.

**The shell's rules.** A flat bar on a hairline, with no backdrop blur. The current place is an ink rule sitting on the header's own hairline, and it glides between tabs as a composited transform. The Approvals tab shows the live count of held runs: a real read of `GET /api/approvals`, dated in its title, absent when unread or empty, lit amber when it rises. `--shell-top` (72px, or 108px with the second row) is the only top inset a full-height screen may use. The palette opens in 120ms at full opacity. **TURN** moves between screens, with the header anchored.

---

## 8. What I studied, what I took, and what I refused

Patterns taken, expressed in AEGIS's identity; no brand or palette copied. Items marked † are from direct reading this session (URLs at the end). The rest are from knowledge, or from the repo's earlier research in docs/plan/10–14.

| Reference | Took | Refused |
|---|---|---|
| **attest** (the user's sister product) † | Colour says a few things and no more, which here becomes five lights. Three motion tiers by purpose (already adopted). **TURN**: the header holds still and the workspace turns over, and "a refresh animates not at all". A context drawer growing out of the row that opened it, which informs TRACE. A palette that "proposes nothing it cannot do". | Space Grotesk/Mono from a Google CDN (air-gapped). 0.13–0.2em label tracking. |
| **Linear** † | "Don't compete for attention you haven't earned", so chrome is dimmer than content. "Structure should be felt not seen", so hairlines and fewer separators. Perceptual colour generation (LCH), which here becomes OKLCH emission. Warmer greys. | Marketing-page glow gradients and grain. |
| **Vercel / Geist** † | Colour steps with fixed purposes (backgrounds, borders, fills, text), already mirrored in line vs control. The **sliding hover highlight on tabs**. A search trigger in the header that advertises ⌘K. | Monochrome-only status. We need state hues. |
| **Stripe** † | Perceptually uniform lightness, so contrast is predictable across hues; mirrored in the `-text` tokens at matched L. Every ratio stated. | The animated WebGL gradient: ambient motion with no referent. |
| **Raycast** † | Glow tied to the object that emits it, which becomes the **Light** primitive. | Frosted glass (`backdrop-filter` over a live board). |
| **Rauno Freiberg** † | Interruptibility (CSS transitions are interruptible for free). **Frequency**: high-frequency actions lose their animation. Spatial consistency. A press of 0.96 or less, which here is a more restrained 0.98. | — |
| **Emil Kowalski** † | Under 300ms, ease-out, transform and opacity only, no animation on keyboard-initiated actions. | — |
| **Family (Benji Taylor)** † | "If a component will persist in the next phase, it should remain consistent", so the header never moves and the answer region holds its height from withheld to released. **Text morphing through shared letters**, which becomes ROLL: only the changed characters move. **The delight-impact curve**: rare events get the ceremony. | Easter eggs. |
| **Perplexity** | Sources as first-class, numbered objects. The citation is the interface. | Streaming answers before they are checked (P6). |
| **Cursor / emergent.sh** | An agent's work shown as a log that folds when done (the thread already does this). Emergent was seen only through search results this session; there was nothing further to take. | — |
| **Arc** | — | Colour as the identity of a space. In AEGIS, colour is only ever state. |
| **Framer** | Scroll-linked ink on the landing (already built as ScrollRevealText). | Springs anywhere: they overshoot (law 6). |
| **Resend / Clerk** | Crisp dark surfaces with a top rim light, which becomes `--rim`. | Animated "shine" sweeps along borders (an ambient loop). |
| **potpie.ai** | Scroll-driven word fill and the hatched selection marquee (both built; the marquee stays inside passages). | The boxed floating nav in the app. The flattening to a bar was deliberate, and "boxed" survives only as the sunken track of a segmented control. |

The repo's own prior research (docs/plan/04, 14, 20) is the foundation this builds on: motion as a readout, the stage-state vocabulary, the verdict colour mapping and the measured contrast work. Where this direction departs from it:
(a) it brings back one route transition (TURN). docs/plan/04 cut page transitions because "instant navigation reads as fast"; TURN keeps navigation instant, since the new screen is readable on its first frame, and adds only the settle.
(b) it adds a light register to the palette. docs/plan/20 settled "no new hues"; there are still none. The emission colours are the existing four hues and the lime, as light.

---

## 9. Technology

**No motion library.** Everything in this direction is CSS keyframes and transitions on `data-*` state, plus React's built-in `<ViewTransition>` for TURN. The WAAPI is available for dynamic sequences (a P&ID path, lit in order) and needs no package. What `motion` would add is spring physics (refused, law 6), FLIP reordering (rows never re-sort), gestures and drag (nothing is dragged) and exit presence (covered by keeping panels mounted, or by ViewTransition). In exchange it would add about 18–34 KB gzipped and a row in the air-gapped install's SBOM. **Recommendation: do not install it.** Revisit only if a pan-and-zoom P&ID viewer wants inertial drag.

**View transitions** work in the Next 16 App Router with no configuration (per `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`). `ViewTransition` is exported by React's server build, so `<RouteStage>` renders inside the (app) layout, which is a Server Component. Browsers without the API navigate without the settle.

**Performance budget** (the event bus drops records for a subscriber that falls behind, so jank is a correctness bug):
* composited properties only; `backdrop-filter` and `mix-blend-mode` never over a live board;
* at most about 12 elements animating at once, which the stagger cap (`--stagger-cap: 5`) makes structural;
* `data-append-bulk` lands a burst of more than sixty rows without animation;
* no `requestAnimationFrame` loop in the app except the audit chain check, which paces real hashing work, and the landing hero field (20fps, paused when hidden);
* timers: the 10Hz dwell counter, and the 30s posture sample.

---

## 10. Decisions this needs from the lead

1. **Fonts:** done. `geist` is installed and `app/layout.tsx` loads it locally.
2. **Motion library:** recommended no (§9).
3. **Template leftovers in `frontend/public/`:** `icon.svg` (a v0 template mark, which may also collide with the `/icon.svg` route that `app/icon.svg` generates), `apple-icon.png`, `icon-*-32x32.png`, `placeholder-*`. These are outside the files I own. They should be deleted or redrawn from the new mark.
4. **A count endpoint for approvals.** The header reads `GET /api/approvals`, which returns whole task records, only to count them. It does so on navigation, never on a timer. A `GET /api/approvals/count` would make it cheap.

---

## Sources

* Family values: https://benji.org/family-values
* How we redesigned the Linear UI: https://linear.app/now/how-we-redesigned-the-linear-ui
* A calmer interface for a product in motion: https://linear.app/now/behind-the-latest-design-refresh
* Stripe, Designing accessible color systems: https://stripe.com/blog/accessible-color-systems
* Geist colours: https://vercel.com/geist/colors
* Invisible details of interaction design: https://rauno.me/craft/interaction-design
* Great animations: https://emilkowal.ski/ui/great-animations
* Raycast: https://www.raycast.com
* attest workspace stylesheet: github.com/kunalKumar-13/attest, `attest/ui/workspace.html`
* Emergent (search results only, page not read): https://emergent.sh/build
* potpie.ai and Perplexity's blog were fetched but returned no styling (text-only markup) or a 403. What this document takes from them comes from the user's own description and from knowledge.
* Next.js view transitions guide: `frontend/node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`
