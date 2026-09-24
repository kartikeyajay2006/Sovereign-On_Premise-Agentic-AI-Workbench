# 21 — Landing Page Specification

**Scope:** the public marketing page at `/`. Not the product. Not the sign-in screen
(`11-RESEARCH-LANDING-FIRSTRUN.md` §5 owns that, and this document does not contradict it).

**Audience:** a Smart India Hackathon evaluator who has never heard of AEGIS, arriving cold,
on a laptop, with maybe ninety seconds, possibly with no internet.

**Date:** 2026-09-21.

**Built on:** `11-RESEARCH-LANDING-FIRSTRUN.md` (measured type scales, control sizes, content
widths, microcopy rewrite table) and `10-RESEARCH-CONSOLES.md` (token systems, motion timings,
elevation). Neither is re-derived here. Where a number below is taken from one of those
documents it is cited as `[11 §3.B]` or `[10 §3.16]`.

**Non-negotiables carried in from the brief, restated so they cannot be lost in edits:**

| Constraint | Consequence for this page |
|---|---|
| Warm-paper palette, no new hues | `#f7f7f5` ground, `#ffffff` only where something must be touched or read, `#0a0a0a` ink, four status colours used as *marks* not as *text* |
| `--radius: 4px` | Every control and container on this page is `rounded-[4px]`. `SovButton`'s `rounded-full` is **not** used here (see §5.0) |
| Geist Sans + Geist Mono, self-hosted | `next/font/google` is replaced with `next/font/local` (§9.3). This is a build-time network dependency today and it contradicts the pitch |
| No CDN, no external image, no embed, no analytics | Enforced by a CSP response header, not by discipline (§9.5). The header is itself a proof artifact we can show |
| No framer-motion | CSS transitions + one IntersectionObserver reveal. Total motion budget: §6 |
| Never state a metric the product cannot back | §4 is the whole answer. Every number on this page is either read live from `/api/status`, exported from a real run into a committed fixture, or absent |

---

## 0. Reference sweep — what was taken from where

Eight pages were read for this document in addition to the ten already measured in
`11-RESEARCH-LANDING-FIRSTRUN.md`. Findings from that earlier sweep are *not* repeated; only
the increment is recorded here. Verbatim quotations are marked with quotes; everything else is
description.

Eight pages were read for this document in addition to the ten already measured in
`11-RESEARCH-LANDING-FIRSTRUN.md`. Findings from that earlier sweep are *not* repeated; only
the increment is recorded. Quoted strings are verbatim as fetched on 2026-09-21.

| # | Page | The one thing taken |
|---|---|---|
| 1 | **ollama.com** | The **mechanical negative sentence**. See §0.1 — this is the most valuable single finding in the sweep. |
| 2 | **lmstudio.ai** | Same construction, independently arrived at: *"Your voice and audio data is processed locally and never leaves your device."* Two competing local-AI companies both refuse the word "secure" and state a boundary instead. |
| 3 | **chainloop.dev** | **Sample output as the hero visual** — their own dashboard, above the fold, instead of an illustration. Validates the run-receipt decision in §3.5. Also: *"In production at security-first enterprises"* — a qualitative trust claim where a count would be a lie. |
| 4 | **edera.dev** | **An architecture diagram as the first visual**, because their claim *is* the architecture. Adopted for §04 (`docs/assets/readme/architecture-overview.svg` already exists and is self-hosted). Also *"Containment is the Architecture."* as a section heading shape. |
| 5 | **openbao.org** | The module is called **"Supporters", not "Customers"**. Renaming the module honestly beats faking the row. Proof is governance (OpenSSF, Linux Foundation) and provenance (*"a fork of Vault"*) — zero customers, zero stats, still credible. |
| 6 | **zed.dev** | **"Clone source" as a primary-weight CTA next to "Download now."** For a product whose pitch is auditability, the repo link belongs at CTA weight, not in the footer. Adopted in §3.7. |
| 7 | **modal.com** | The **"Built with Modal" gallery of runnable examples** — capability shown as six things the reader can go run, with no logo involved. And a compact four-tile "Security and governance" grid whose tiles are *"Team controls / Battle-tested isolation / SOC2 & HIPAA / Data residency controls"*. |
| 8 | **osohq.com** | The **five-verb capability spine: Discover → Monitor → Detect → Control → Report.** "Report" as the terminal verb is what an auditor is actually buying. Also confirms that one piece of original research (*"Your employees ignore 96% of their permissions. Agents won't."*) can carry a whole page before you have customers. |
| 9 | **depot.dev** | A section header reading simply **"The problem"**, before any product claim. And **"TALK TO ENGINEERING"** where every other company writes "Contact sales". |
| 10 | **blacksmith.sh** | **An anti-pattern, and a good one.** The live page currently carries two contradictory hard-coded counts — *"Trusted by 600+ world-class teams"* in one block and *"Trusted by 3000+ world-class teams"* in another. A stale string nobody updated. This is the argument for §4's rule that every number is read or exported, never typed. |
| 11 | **chainguard.dev** (re-read) | The **hero stat strip in place of a hero image**: five mono nouns over five hard counts, above the fold, before any logo. We cannot fill it honestly — see §4.4 — but the *form* is what §5.5's receipt card borrows. |
| 12 | **cursor.com** | **"SOC 2 \| ISO27001 \| ISO42001 \| AIUC-1 Certified"** as a single strip. ISO/IEC 42001 is now the shorthand for "this AI system is governed". We hold none of these and must claim none — but see §0.3 for the honest version of this move. |

### 0.1 The mechanical negative sentence — the finding to build the voice on

Ollama and LM Studio, competing for the same buyer, independently converged on the same
grammar, and neither uses the word "secure":

> **"Nothing you run locally ever leaves your machine."** — ollama.com
>
> **"Your voice and audio data is processed locally and never leaves your device."** — lmstudio.ai

Parse it: **subject = the data. Verb = *leaves*. Negated. Boundary named.** No adjective, no
"military-grade", no shield icon. It reads as proof because it is falsifiable — a reader with
Wireshark can disprove it in a minute, and both companies are inviting exactly that.

This is the construction AEGIS should use everywhere it currently reaches for an adjective. Our
version, and the reason it is stronger than theirs:

> **"Nothing the model reads ever leaves the machine it runs on — and the workbench counts the
> attempts."**

The second clause is ours alone. Ollama can make the claim; we can show the counter. That
sentence goes in §02 of the page and nowhere else, because it only lands once.

### 0.2 Sample output as the hero — the open lane

Across nineteen pages fetched for this document, exactly one (chainloop.dev) puts its own
product output above the fold, and none puts the *artifact the buyer's auditor receives* there.
Chainguard shows a logo marquee. Vanta shows a mock UI. Cursor shows a demo. Modal shows
nothing at all in the server-rendered hero.

**Nobody in this category is showing the receipt.** For a product whose entire thesis is "the
answer arrives with its evidence", the hero visual that nobody else is using is the evidence
itself. That is §3.5.

### 0.3 The certification strip we are allowed to build

Cursor ships `SOC 2 | ISO27001 | ISO42001 | AIUC-1 Certified`. Chainguard ships `FedRAMP | PCI
DSS | CMMC 2.0 | SOC 2` as *use-case links* rather than badges. We hold none of these and
**must not imply otherwise** — a fake or ambiguous certification claim is the single fastest
way to be disqualified from a national competition.

There is an honest version, and only one, and it is optional. If shipped, it is text, not
badges, and it reads exactly:

> AEGIS holds no certifications. The control areas it is designed against are named in
> `docs/` — access control, audit logging, human oversight, and data classification map to
> ISO/IEC 42001 clauses 6–9. Nobody has audited that mapping.

If that paragraph makes anyone uncomfortable, delete the whole block. There is no middle
position between "we are certified" and "we are not", and the page must be on the correct side
of it. **Default recommendation: omit the block entirely.** §06 already carries the same
information in a more credible form.

### 0.4 What was deliberately *not* taken

| Seen at | Not taken, because |
|---|---|
| Chainguard's five-number stat strip | Every one of their numbers is counted across a fleet. Ours would be counted across one developer laptop. The form is borrowed (§5.5); the numbers are not. |
| Ollama's benchmark bar chart with anonymised "Provider A/B/C" | Excellent, and unavailable: `benchmarks/` does not exist. **When it does**, copy this exactly — including the dated source line (*"Sources: TokenDyno and provider published figures, August 2026"*) and the **error bars** (`±3%`, `±4%`). Voluntarily printing your own uncertainty is the cheapest credibility on this list and it is precisely our register. |
| Oso's "96%" original research | Manufacturable pre-revenue, and we should manufacture one — but it is a week of adversarial evaluation work, not a copy decision. Flagged as `DEPENDS-ON: backend-evidence-correctness, benchmark harness`. |
| Vanta's "Proof? We've got proof." | Right instinct, wrong voice. `11 §2.6` already flags it as their one tonal slip. Ours is "Check it yourself." |
| Tailscale's "replaces your legacy VPN, SASE, and PAM" | Naming the incumbent is strong, and ours would be "the screenshot-and-spreadsheet audit binder". Tempting. Rejected because it makes the page about compliance admin rather than about engineering correctness, and the second is the harder and truer story. One line of it survives in §02. |
| Zed's "A letter" section | Charming for a developer tool, wrong for a regulated-industry evaluator. |
| Edera's investor-logo-as-proxy row | We have no investors, and borrowing a VC's brand is the same trick as borrowing a customer's. |

---

## 1. POSITIONING

### 1.1 The one-sentence claim

> **AEGIS is an air-gapped AI workbench for regulated industrial work, where every answer is
> cited to a page, checked against your policy, and recorded in a hash-chained log.**

Structural notes on that sentence, because each clause is load-bearing:

- **"is"** — definitional, Resend-shaped (`11 §2.11`). Not "helps you", not "empowers".
- **"air-gapped"** — a deployment fact, checkable by reading `config/app.yaml`
  (`sovereignty.allowed_cidrs: [127.0.0.0/8, ::1/128]`) and `backend/security/sovereignty.py:52`.
- **"regulated industrial work"** — names the buyer, not the technology.
- **"cited / checked / recorded"** — three past participles, no adjectives. Sigstore's
  *Signed / Associated / Witnessed* chain (`11 §2.7`), remapped. This is the backbone of §3 of
  the page and the copy backbone of the whole product.
- **"hash-chained"** — the mechanism, not the virtue. Not "immutable". Not "tamper-proof".

### 1.2 Headline — five candidates

Each is given with its word count, what it asserts, and what could falsify it.

| # | Candidate | Words | What it asserts | Falsifiable by |
|---|---|---|---|---|
| **A** | **Local is not enough.** | 4 | A claim about the *category*, not about AEGIS | Nothing — it is an argument, and one the page then substantiates |
| **B** | Cited. Checked. Recorded. | 3 | That every answer carries all three | A single answer that carries none — so it must be true of the pipeline, and it is (`backend/agents/orchestrator.py`, `backend/policy/gateway.py`, `backend/core/audit.py`) |
| **C** | An AI workbench that keeps its receipts. | 7 | Metaphor; softly true | "Receipts" is a consumer word and reads informal in a regulator's room |
| **D** | Every answer arrives with its evidence. | 6 | A product guarantee | A run where retrieval returns nothing still produces an answer. **Overclaim. Reject.** |
| **E** | Prove what the model did. | 5 | An imperative; promises the capability | Fine, but it is a CTA wearing a headline's clothes |

### 1.3 The pick — **A. "Local is not enough."**

Justification, in the order that matters:

1. **It cannot be an overclaim, because it is not a claim about us.** Every other candidate
   asserts a property of AEGIS that a judge could probe. A says something about the entire
   on-premise-AI category — the category whose *entire* marketing is "it runs on your hardware."
   The page then spends one short section proving the assertion and the rest of the page being
   the answer to it. This is the only headline in the set with zero exposure.
2. **It is the thesis verbatim.** The README already opens with it in long form: *"Running a
   model on your own hardware solves exactly one problem: the prompt does not leave the
   building."* Four words is that paragraph compressed.
3. **It is the right shape.** 4 words. Vanta ships 3 (`"Trust is everything"`), Baseten 3
   (`"Inference is everything"`), Oso 6, Boundary 5 (`11 §2.6, §2.11`). Nothing credible in the
   sweep runs long.
4. **It forces the sub-line to do real work**, which is where the specificity belongs. A judge
   reads headline-then-sub as one unit; splitting *provocation → definition* across the two is
   how Oso's "Agents are here. Oso makes them safe." works.
5. **It survives being read aloud in a hostile room.** "Local is not enough" is a sentence a
   sceptical evaluator can repeat back without smirking. "Explore the World of Agentic Trust"
   is not (`11 §2.10`).

**The risk, stated honestly:** a negative headline does not say what the product is. That is
mitigated by (a) the sub-line, which is definitional and sits 20px below it, (b) the wordmark
in the header, (c) the receipt card directly beneath the fold-line which is unmistakably
product. If user testing on three judges shows the risk is real, the fallback is **B**, which
is the safest headline in the set.

**B is kept, not discarded.** It becomes the §3 section heading. The page therefore contains
both.

### 1.4 The sub-line

> **An air-gapped AI workbench for regulated industrial work. Every answer is cited to a page,
> checked against your policy, and recorded.**

- 22 words, two sentences. Sentence one is definitional; sentence two is the chain.
- Set at 18px, measure capped at **54ch ≈ 560px**, so it breaks to three lines at desktop.
  `11 §3.B`: nothing credible runs body copy wider than 55–67 characters.
- "cited **to a page**" is deliberately concrete — page-level provenance is the differentiator
  and "cited" alone is what every RAG demo says.
- "**your** policy" not "policy" — the policy files are deployment-specific and the README says
  so under Limitations. The possessive does the hedging.
- "recorded" ends the sentence with the quietest verb, not the loudest. Sigstore's "witnessed"
  does the same job.

### 1.5 Voice

Six rules. These are enforceable in review; a line that breaks one is cut.

1. **Name the mechanism, never its virtue.** "Default-deny tool policy resolved per role from
   `policies/tool-permissions.yaml`", not "enterprise-grade access control." (Teleport,
   `11 §2.8`.)
2. **Every strong word takes a hedge.** `tamper-evident`, not `immutable`. `append-only`, not
   `unalterable`. `no outbound calls are configured in this build`, not `zero egress`. `observed`,
   not `guaranteed`. Sigstore writes *"tamper-resistant"* and is trusted for it (`11 §2.7`).
3. **Numbers carry a unit, a scope and a source, or they are deleted.** There is no number on
   this page that is not either read live from the running host or exported from a named run.
4. **No adjective of praise about our own software.** Banned on sight: revolutionary, seamless,
   best-in-class, cutting-edge, military-grade, bank-grade, enterprise-grade, next-generation,
   powerful, robust, comprehensive, unparalleled, state-of-the-art.
5. **State, then next action, no apology.** Applies to every error and empty state.
   (Stripe, `11 §2.9`.)
6. **Sentence case everywhere except machine values.** Uppercase + `Geist Mono` +
   `letter-spacing: 0.08em` is reserved for labels over machine-readable data — hashes, hosts,
   sequence numbers, run ids. It is never used for a slogan. When everything is mono, nothing is.

### 1.6 The overclaim audit — fix this class of error repo-wide

`11 §6.2` supplies the rewrite table. These are the instances that exist **today**, with file
and line, and they must all be fixed before the page ships, because the page links to the repo
and a judge who greps will find them.

| Where | Current text | Replace with |
|---|---|---|
| `frontend/components/sign-in/sign-in-view.tsx:~150` | "…and **immutable** audit logs never leave your physical premises." | "…stay on the machine you install this on. The audit log is append-only and hash-chained." |
| `backend/core/audit.py:1–8` (module docstring) | "…makes the reference architecture's **'immutable**, searchable, exportable, stored locally' claim checkable" | "…makes the reference architecture's 'immutable…' claim checkable **as tamper-evidence**: the chain detects edits, it does not prevent them." |
| `frontend/components/sign-in/sign-in-view.tsx` footer | "Default-Deny Policy · 127.0.0.1:8000 · **Zero Outbound Egress**" | Build-time facts only — see `11 §5.3` |
| `README.md` hero strip | "`LOCAL` • `PRIVATE` • `CONTROLLED` • `VERIFIABLE`" | `CITED` • `CHECKED` • `RECORDED` — aligns the README with the page |
| `README.md` closing | "**Private intelligence. Provable control.**" | Keep. It is two noun phrases and neither is a superlative. |
| `README.md` closing | "YOUR DATA. YOUR MODELS. YOUR INFRASTRUCTURE. YOUR CONTROL." | Cut. Four shouted possessives is the Drata register (`11 §2.10`). |
| Anywhere | "Sovereignty Posture" | "Deployment" or "Containment" |
| Anywhere | "military-grade" / "enterprise-grade" | the actual algorithm, or delete |

**The one word that must never appear on this page: `immutable`.** A hash chain makes edits
*detectable*. It does not make the file unwritable. Saying otherwise is the exact kind of claim
a competent evaluator disproves with `truncate -s`.

---

## 2. SECTION-BY-SECTION STRUCTURE

Nine blocks. Total scroll ≈ 5.5 viewport heights at 1440×900. Most technical landing pages run
9–14 sections; this one runs 7 content sections because every one of them has a job that no
other one does, and the cut list is in §2.2.

| # | Block | Job — one sentence | Height @1440 | Why it earns its scroll |
|---|---|---|---|---|
| 00 | **Header** | Say the product's name and offer the only two doors. | 64px | — |
| 01 | **Hero** | Land the thesis, define the product, show one real artifact. | ~720px | It is the fold. |
| 02 | **The premise** | Prove "local is not enough" in five lines, then stop. | ~380px | Without it the headline is a slogan. With it, the headline is an argument the reader has now accepted, and the rest of the page is the answer. |
| 03 | **Cited / Checked / Recorded** | Name the three mechanisms and attach a real machine artifact to each. | ~640px | This is the product. Three columns, three verbs, three artifacts a judge can verify. |
| 04 | **One run, end to end** | Show the seven stages as a table of facts, beside one real screenshot. | ~700px | Converts "it has a pipeline" into "here is what it left behind at each stage." Sourcegraph's real query result beats any feature list (`11 §2.11`). |
| 05 | **Check it yourself** | Hand the reader the four things they can verify without trusting us. | ~820px | The proof section. §4 is entirely about this block. |
| 06 | **What this is not** | List the limitations, verbatim from the README, unsoftened. | ~460px | The highest-trust block on the page. Nobody fakes a limitations list. |
| 07 | **Run it** | Six shell commands and the hardware it needs. | ~420px | A judge can run it. That is worth more than any testimonial we could not honestly obtain. |
| 08 | **Footer** | Repo, docs, licence, the live status line, the contributor names. | ~220px | — |

### 2.1 Why there is no section for…

- **Customer logos** — we have none. A logo wall of names we cannot verify is the single
  fastest way to lose a technical judge (`11 §3.H`).
- **Testimonials** — same.
- **Pricing** — not a commercial product yet; a pricing table would be fiction.
- **"Trusted by" / badge row** — no certifications exist. Chainguard demotes real frameworks to
  use-case links rather than stickers (`11 §2.5`); we have nothing even to demote.
- **A benchmark chart** — `benchmarks/` does not exist yet (`00-SHARED-BRIEF.md`). When it does,
  it becomes a 10th block between 05 and 06, and not before.
- **An integrations grid** — there is one integration and it is Ollama over loopback. Saying so
  in one line in §07 is more honest than a grid of nine logos.
- **A newsletter / demo-request form** — no server to receive it, no list to add to.
- **An animated hero** — nothing in the credible set animates above the fold (`11 §5.4`).

### 2.2 Cut list, in cutting order

If the page has to get shorter, cut in this order and stop when it fits:

1. **04 — One run, end to end.** The most content for the least unique argument. §03 already
   carries the chain; §05 already carries the proof.
2. **07 — Run it.** Move the six commands into the footer as a single link to the README.
3. **02 — The premise.** Painful, but the headline plus sub-line can carry it if forced; fold
   its best line into the hero sub.

Never cut **05** or **06**. Those two are the reason a judge believes the rest.
---

## 3. THE HERO — fully specified

### 3.1 Desktop wireframe — 1440 × 900, DPR 1

Content column `max-width: 1120px`, centred ⇒ `x = 160 → 1280`. Side gutter at this width is
therefore 160px; the gutter *rule* is 16px minimum (§7).

```
 x=0                                                                          x=1440
┌──────────────────────────────────────────────────────────────────────────────────┐ y=0
│ #f7f7f5                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ ◆ AEGIS                          Product   Proof   Limits      [Sign in]   │  │ header 64px
│  └────────────────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────────┤ y=64  1px #dcdad6
│                                                                                  │
│                                                                                  │
│                        ← 152px empty (17% of viewport) →                         │
│                                                                                  │
│  Local is not enough.                                                            │ y=216
│  ···· 64px / 500 / lh 61 / ls −0.032em / #0a0a0a / one line, 612px wide ····      │
│                                                                                  │
│                                ← 20px →                                          │
│                                                                                  │
│  An air-gapped AI workbench for regulated                                        │ y=297
│  industrial work. Every answer is cited to a                                     │ 18px/400/lh 28
│  page, checked against your policy, and recorded.                                │ #5f5b57, max 560px
│                                                                                  │
│                                ← 32px →                                          │
│                                                                                  │
│  ┌─────────────────────┐  ┌───────────────────────┐                              │ y=413
│  │  Open the workbench │  │  Read the source   ↗  │                              │ both 40px tall
│  └─────────────────────┘  └───────────────────────┘                              │ r4, 12px gap
│   #0a0a0a fill            1px #c8c5bf, transparent                               │
│                                                                                  │
│  github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench           │ 12px mono #5f5b57
│                                                                                  │
│                                ← 48px →                                          │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │ y=533
│  │ RUN RECEIPT                                        tsk_9c41f0e2 · 21 Sep 26│  │ 40px header row
│  ├────────────────────────────────────────────────────────────────────────────┤  │ 1px #dcdad6
│  │ CITED      4 passages from 2 documents            SOP-INS-014 p.12         │  │ 56px
│  ├────────────────────────────────────────────────────────────────────────────┤  │
│  │ CHECKED    Claims traced to evidence, figures recomputed    6 / 6 checks   │  │ 56px
│  ├────────────────────────────────────────────────────────────────────────────┤  │
│  │ COMPUTED   Corrosion rate, remaining life         sandbox · 0 sockets      │  │ 56px
│  ├────────────────────────────────────────────────────────────────────────────┤  │ ▁▁▁ fold @ y=900
│  │ APPROVED   Released by Approving Reviewer         2026-09-21 09:42 UTC     │  │ 56px
│  ├────────────────────────────────────────────────────────────────────────────┤  │
│  │ RECORDED   Appended to the audit chain            seq 412 · 111c2ffb…      │  │ 56px
│  └────────────────────────────────────────────────────────────────────────────┘  │
│  Exported from a real run. Values are read from frontend/public/landing/run.json.│ 12px #5f5b57
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

The fold at `y = 900` lands **inside** the receipt card, between `COMPUTED` and `APPROVED`.
That is deliberate and it is the one composition decision in the hero: the reader sees that
there are more rows, in a table of machine facts, and scrolls. No scroll cue, no chevron, no
bouncing arrow.

### 3.2 Mobile wireframe — 390 × 844 (iPhone 14 / Pixel 7 class)

16px side gutters ⇒ content width 358px.

```
┌────────────────────────────────────┐ 390
│ ◆ AEGIS                  [Sign in] │ 56px header
├────────────────────────────────────┤ 1px
│                                    │
│            ← 48px →                │
│                                    │
│  Local is not                      │ 36px/500
│  enough.                           │ lh 37 / ls −0.02em
│                                    │
│            ← 16px →                │
│  An air-gapped AI workbench for    │ 16px/400/lh 25
│  regulated industrial work. Every  │ #5f5b57
│  answer is cited to a page,        │
│  checked against your policy,      │
│  and recorded.                     │
│                                    │
│            ← 28px →                │
│  ┌──────────────────────────────┐  │ full-width
│  │      Open the workbench      │  │ 44px tall
│  └──────────────────────────────┘  │
│            ← 10px →                │
│  ┌──────────────────────────────┐  │
│  │     Read the source     ↗    │  │ 44px
│  └──────────────────────────────┘  │
│                                    │
│            ← 40px →                │
│  ┌──────────────────────────────┐  │
│  │ RUN RECEIPT                  │  │ 2-line header
│  │ tsk_9c41f0e2 · 21 Sep 26     │  │
│  ├──────────────────────────────┤  │
│  │ CITED                        │  │ stacked:
│  │ 4 passages from 2 documents  │  │ label on its
│  │ SOP-INS-014 p.12             │  │ own line,
│  ├──────────────────────────────┤  │ 76px per row
│  │ CHECKED                      │  │
│  │ Claims traced to evidence,   │  │
│  │ figures recomputed           │  │
│  │ 6 / 6 checks                 │  │
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

### 3.3 Exact type specification

Every value below is a literal. `[11 §…]` marks the measured source it is derived from.

| Role | Size | Weight | Line-height | Letter-spacing | Colour | Measure |
|---|---|---|---|---|---|---|
| `h1` desktop (≥1024) | **64px** | **500** | 61px (0.955) | **−0.032em** (−2.05px) | `#0a0a0a` | `max-w-[16ch]` |
| `h1` tablet (768–1023) | 48px | 500 | 47px (0.98) | −0.028em | `#0a0a0a` | `max-w-[14ch]` |
| `h1` mobile (<768) | 36px | 500 | 37px (1.03) | −0.02em | `#0a0a0a` | full |
| Sub-line desktop | **18px** | 400 | 28px (1.56) | −0.011em | `#5f5b57` | `max-w-[54ch]` ≈ 560px |
| Sub-line mobile | 16px | 400 | 25px (1.56) | −0.008em | `#5f5b57` | full |
| CTA label | 14px | 500 | 20px | −0.006em | per variant | — |
| Receipt row label | 11px **mono** | 500 | 16px | **+0.08em**, uppercase | `#5f5b57` | fixed 104px col |
| Receipt row value | 14px sans | 400 | 20px | −0.006em | `#0a0a0a` | 1fr |
| Receipt row meta | 12px **mono** | 425 | 16px | 0 | `#5f5b57` | auto |
| Receipt caption | 12px sans | 400 | 18px | 0 | `#5f5b57` | `max-w-[68ch]` |
| Header nav link | 13px | 400 | 20px | 0 | `#5f5b57` → `#0a0a0a` on hover | — |

Notes that matter:

- **Weight 500, never 600 or bold.** Linear's marketing `h1` runs 510 (`11 §2.1`); Vanta's runs
  **300** at 88px (`11 §2.6`). The current sign-in page runs `font-extrabold` at 48–60px and
  that single decision is most of why the founder reads the UI as cheap. Geist Sans is variable
  and 500 is available; do not substitute `font-semibold`.
- **Mono at weight 425**, not 400, so hashes and ids optically match the sans beside them
  (`10 §3.20`; Geist Mono is variable so this is free).
- Headline colour is `#0a0a0a` at **19.2:1** on `#f7f7f5`. Do not reduce it to a grey for
  "softness" — that is where pages start to look unfinished.
- The `−0.032em` on the `h1` is the single most important typographic number on the page.
  Chainguard ships −3% and Vanta −3% at these sizes (`11 §4.11`). Geist at 64px with default
  tracking looks loose and amateur; measure it if in doubt.

### 3.4 Vertical rhythm — the literal stack

All gaps are multiples of 4. From the bottom of the header border downwards:

```
header bottom border
  ↓ 152   (desktop) / 88 (tablet) / 48 (mobile)
h1
  ↓ 20    (desktop) / 20 / 16
sub-line
  ↓ 32    (desktop) / 32 / 28
CTA row  (40px tall desktop, 44px mobile)
  ↓ 16
repo path, 12px mono (desktop only; hidden below md)
  ↓ 48    (desktop) / 48 / 40
receipt card
  ↓ 16
receipt caption
  ↓ 120   (desktop) / 96 / 72   → section 02 begins
```

Desktop empty space above the first word = 64 (header) + 152 = **216px = 24% of a 900px
viewport**, inside the 17–29% band measured across Vercel, Tailscale, Doppler, Linear,
Chainguard and Vanta (`11 §3.C`).

### 3.5 The first visual, and how it is produced

**What it is:** a *run receipt* — one card, five rows, rendered as **real DOM** from a JSON
fixture that is an export of an actual completed run on a real host.

**Why not a screenshot.** A screenshot of the console at hero size would be illegible at
1120px wide and would be a picture of chrome rather than of evidence. Real DOM is crisp at
every DPR, weighs ~2KB instead of ~180KB, re-themes with the tokens, is readable by a screen
reader, and — the point — can be *selected and pasted* by a sceptical judge who wants to grep
the hash.

**Why not a stylised abstraction.** Stripe can afford an abstract wave field because a
screenshot of their product is a picture of someone else's money (`11 §2.9`). Our product's
entire argument is that it produces inspectable artifacts. Abstracting them away is
self-defeating.

**How the fixture is produced — this is a hard requirement, not a suggestion.**

Create `scripts/capture_landing_fixture.py`. It takes a completed `task_id`, reads the task
record, the verification report, the approval record and the matching audit events out of the
real stores, and writes `frontend/public/landing/run.json`. It performs exactly two
transformations, both of which it records in the file:

1. Redacts nothing (the demo corpus is synthetic, seeded by `scripts/seed_demo_data.py`).
2. Truncates hashes to their first 8 hex characters for display, keeping the full value in a
   sibling field.

```jsonc
// frontend/public/landing/run.json  — shape, not content.
// Content is written by scripts/capture_landing_fixture.py and is never hand-edited.
{
  "captured_at": "2026-09-21T09:43:11Z",
  "captured_from": "developer host, ollama loopback, CPU-only",
  "task_id": "tsk_9c41f0e2",
  "prompt": "…",                       // verbatim from the run
  "cited":    { "value": "4 passages from 2 documents",
                "meta": "SOP-INS-014 p.12" },
  "checked":  { "value": "Claims traced to evidence, figures recomputed",
                "meta": "6 / 6 checks" },
  "computed": { "value": "Corrosion rate, remaining life",
                "meta": "sandbox · 0 sockets" },
  "approved": { "value": "Released by Approving Reviewer",
                "meta": "2026-09-21 09:42 UTC" },
  "recorded": { "value": "Appended to the audit chain",
                "meta": "seq 412 · 111c2ffb",
                "hash_full": "111c2ffb8d0021d93ffb2ae83560fcd2b173e4555efe3dd2ba29f1e4f24c7d71" }
}
```

**If `run.json` is absent, the build fails.** Not "falls back to sample data" — fails. The
import is a static `import run from '@/public/landing/run.json'` (or a `fs.readFileSync` in
the server component), and a missing file is a module-resolution error. This mirrors
`frontend/lib/api.ts`'s existing refusal to fall back to sample data, which the shared brief
calls "the product's conscience." A marketing page that fabricates the one artifact it uses to
prove it does not fabricate things would be the worst possible failure.

**Until a real run has been captured, section 01's receipt card does not ship.** The hero ships
headline + sub + CTAs and nothing else. That is an acceptable hero. A fabricated receipt is not.

### 3.6 Header

Static markup, `position: sticky; top: 0; z-index: 50`. No scroll listener, no JS.

- Height 64px desktop / 56px mobile.
- Background `rgba(247,247,245,0.88)` + `backdrop-filter: blur(12px)`. Bottom border
  `1px solid #dcdad6`, always present — the "border appears on scroll" trick needs a listener
  and buys nothing.
- Left: the mark + wordmark. **Reuse `AegisLogo` with `variant="mark"`** plus a plain
  `<span>AEGIS</span>` at 15px/500/`ls −0.01em` in **Geist Sans**, not the existing
  `font-mono font-black tracking-[0.24em]` wordmark. Rationale: `AegisLogo`'s `full` variant
  puts "AGENTIC WORKBENCH" in 9px mono at 0.34em tracking under the name, which at header size
  is costume (`11 §5.1.4`). The mark itself is good; keep it.
- Centre: three anchor links — `Product` → `#chain`, `Proof` → `#proof`, `Limits` →
  `#limits`. 13px/400/`#5f5b57`, 24px apart, hidden below `lg`.
- Right: one button, `Sign in` → `/sign-in`, 32px tall, 12px horizontal padding, 13px/500,
  `1px solid #c8c5bf`, radius 4. **Not** a filled button — the filled button on this page is
  in the hero, and there is only ever one.
  - If a session already exists (`useRole().authenticated`), the label becomes
    `Open workbench` and the href becomes `/console`. Rendered client-side; the server render
    says `Sign in`, so there is a one-frame swap. Acceptable, and the alternative is reading a
    cookie on the server for a marketing page, which is not worth it.

### 3.7 The two CTAs, and why the second one is the repository

**Primary:** `Open the workbench` → `/sign-in`. Filled `#0a0a0a`. The only filled button on the
page.

**Secondary:** `Read the source ↗` → the GitHub repository. Outline.

Zed ships `Clone source` at the same visual weight as `Download now`; Edera and Chainloop both
put GitHub in the primary navigation (§0). For a product whose entire claim is that its
behaviour is inspectable, putting the source behind a footer link is an argument against
ourselves. A judge who clicks it is the judge we want.

Directly beneath the two buttons, at 12px Geist Mono in `#5f5b57`, the repository path is
printed as **selectable text**:

```
github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench
```

Two reasons. It survives an offline demo where the link does not resolve; and it is the one
place on the page where a mono string is doing exactly the job mono is for.

**On the offline rule:** an `<a href>` to an external origin loads nothing and phones nothing.
It is not a CDN dependency and it does not violate the constraint. Add `rel="noreferrer"` so
the click does not leak a referrer header — small, consistent with the rest of the posture, and
exactly the kind of detail this audience notices.

There is no third CTA. No "Get a demo", no "Talk to sales", no newsletter.

---

## 4. HOW WE PROVE THE CLAIM WITHOUT LYING

This is the hardest section and the one the page lives or dies on.

### 4.1 The position we are actually in

- No customers. No logos.
- No certifications. No SOC 2, no ISO, no FedRAMP, and no pending audit.
- No benchmark. `benchmarks/` does not exist (`00-SHARED-BRIEF.md`, "What does not exist yet").
- No uptime history — the product has never run in production.
- 118 tests, ~21,900 LOC, one internal hackathon win. That is the entire evidence base.

Every conventional trust device is therefore unavailable. Anything we manufacture to fill the
gap will read as manufactured, because a technical evaluator's prior for an unknown hackathon
project with a logo wall is "fabricated," and they will be right.

### 4.2 The reframe

**Stop trying to prove the product is trustworthy. Prove that the product makes itself
checkable, then invite the check.**

Vanta, Chainguard and Sigstore all signal seriousness through restraint (`11 §3.H`). Sigstore
in particular has no customer logos above the fold at all; what it has is three verbs, each of
which names a system you can go and inspect. That is the model. We have something better than a
testimonial: we have **artifacts**, and artifacts are falsifiable, which is exactly why they
convince.

The rule for every element in §05: **a judge must be able to disprove it in under two minutes
without asking us anything.** If they cannot, it does not belong on the page.

### 4.3 The four proof artifacts — exactly what to show

Section 05, "Check it yourself", is a 2×2 grid at desktop, stacked at mobile. Each cell has a
mono label, a machine artifact, and one sentence saying what the artifact does and does not
prove.

---

#### Artifact 1 — **The audit chain, three real lines**

Show three consecutive lines of `storage/logs/audit.jsonl`, **verbatim**, in a mono block with
`prev_hash` and `hash` visually linked.

These three are real, from this repository, today:

```
{"sequence": 6, "actor": "system",   "category": "sovereignty", "action": "monitor_started",
 "detail": {"allowed_cidrs": ["127.0.0.0/8", "::1/128"], "poll_interval_seconds": 2},
 "prev_hash": "2fc64b34…", "hash": "331f2a44…"}

{"sequence": 7, "actor": "engineer", "category": "security",    "action": "login_succeeded",
 "detail": {"department": "inspection"},
 "prev_hash": "331f2a44…", "hash": "40f978da…"}

{"sequence": 8, "actor": "engineer", "category": "security",    "action": "login_succeeded",
 "detail": {"department": "inspection"},
 "prev_hash": "40f978da…", "hash": "111c2ffb…"}
```

The design move: render `hash` on line *n* and `prev_hash` on line *n+1* in `#0a0a0a` while
every other token sits at `#5f5b57`, and draw a 1px `#c8c5bf` connector in the left gutter
between them. **No colour. No green.** The chain is shown, not asserted.

Caption, verbatim:

> Three consecutive records from this repository's own log. Each record hashes the one before
> it, so editing or deleting a line changes every hash after it and the verifier names the
> sequence where the chain first fails. It detects tampering. It does not prevent it.

That last sentence is the whole reason this works. We volunteer the limitation before the judge
finds it.

---

#### Artifact 2 — **A real policy denial**

Show the policy *rule* and the *refusal it produces*, side by side. Both are real files.

Left — five lines lifted verbatim from `policies/tool-permissions.yaml`:

```yaml
python_exec:
  description: Execute generated Python inside the secure sandbox.
  allowed_roles: [operator, engineer, reviewer, administrator]
  constraints:
    sandbox_required: true
    network_allowed: false
```

Right — the sandbox self-test result, which is produced by
`backend/tools/sandbox.py:self_test_report()` and is a **real execution on the host**, not a
string:

```
Static import review     PASS   import socket; socket.socket()
                                → rejected before execution
Runtime socket denial    PASS   socket.socket() with the static check bypassed
                                → BLOCKED: OSError
```

Caption, verbatim:

> The policy is a file in the repository. The result beside it is what happened when that code
> was actually submitted to the sandbox on this host — `GET /api/sovereignty/sandbox-test` runs
> it on demand and writes the outcome to the audit log. The second check exists because the
> first one can be bypassed.

This cell does three jobs at once: it shows a real denial, it shows defence in depth, and it
shows that we test the bypass. Teleport's "100% auditable" claim (`11 §2.8`) is what this looks
like when done badly.

---

#### Artifact 3 — **The live containment reading**

`GET /api/status` is already public and unauthenticated —
`backend/api/routes/system.py:59`, whose docstring says exactly why:

> *"The sign-in screen states this platform keeps everything on the host. That claim has to be
> a reading even before anyone authenticates, or it is just a slogan printed on a login page."*

That docstring is the design principle of this entire section, and it was written before this
document. Use it: **quote it on the page.**

The cell renders a single line, live, from the visitor's own browser against their own host:

```
 CONTAINMENT              reading…                    ← initial
 CONTAINMENT              0 unapproved connections    ← monitor_active: true, sovereign: true
                          observed since 04:22:28 UTC
 CONTAINMENT              2 unapproved connections    ← sovereign: false — shown in --critical
 CONTAINMENT              not reachable from this browser ← fetch failed
```

Rules, non-negotiable:

- The three-state render is mandatory: **reading / value / unavailable**. There is no fourth
  state and no default value.
- If the fetch fails the cell says so plainly and **does not** fall back to a pleasant number.
  On a judge's laptop with no backend running, this cell reading *"not reachable from this
  browser"* is worth more than any number, because it demonstrates the page will not print a
  figure it has not obtained.
- `sovereign: true` renders as ink, with a 6px `--sovereign` dot. Not green text —
  `--sovereign` on paper is **3.07:1** and fails AA (§8.3).
- The number is `external_calls` from the response, verbatim. The words around it are
  "unapproved connections **observed** since <monitored_since>" — observed, not zero, not
  guaranteed.

Caption, verbatim:

> Read live from this machine by your browser, from an endpoint that requires no sign-in. It
> reports what the monitor observed on the process tree owned by this workbench. It is a
> measurement of one host over one uptime, not a property of the software.

---

#### Artifact 4 — **The offline guarantee, self-demonstrating**

The page itself is the artifact. Show the Content-Security-Policy that the page is served
under, and invite the reader to open dev-tools.

```
Content-Security-Policy: default-src 'self'; img-src 'self' data:;
  font-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  connect-src 'self'; frame-ancestors 'none'; base-uri 'none'
```

Caption, verbatim:

> This page is served under that header. There is no font CDN, no analytics, no embedded video
> and no third-party script — open the network tab and count the origins. A product that claims
> to work air-gapped should have a marketing page that does.

This is the cheapest and most persuasive item on the page. It costs one `next.config.mjs`
header block (§9.5) and it is verifiable in four seconds by exactly the kind of person we need
to convince. It is also the only "proof" on the page that works with the backend switched off.

---

### 4.4 Proof devices we considered and rejected

| Device | Why not |
|---|---|
| A "sovereignty certificate" JSON, signed | We do not sign anything today. No key management, no `backend/proof/`. A certificate that is just a JSON dump with the word "certificate" on it is theatre, and a judge will ask what key signed it. **Ship it when `backend/proof/` exists, not before.** |
| Zero-egress counters as a big number | `data_leaving_host_bytes: 0` is a real field, but rendering "0 BYTES" at 40px is a Chainguard stat-grid move for numbers that were *counted over a fleet*. Ours is one host, one uptime. Shown as a sentence in Artifact 3 instead of a hero numeral. |
| "118 tests passing" as a stat tile | True, and checkable, but a test count is a proxy for diligence, not for correctness, and a good judge knows that. Keep it — as one line in §07 next to the clone command, where it is a fact about the repo rather than a claim about the product. |
| A logo wall of the *models* (Qwen, Ollama, FastAPI) | Borrowing credibility from other people's trademarks. Also visually it is a logo wall, which is the pattern we are avoiding. The stack is named in plain text in §07. |
| An embedded demo video | Breaks the offline rule outright. A self-hosted `.webm` would not, but a 4MB autoplaying video on a page whose thesis is restraint is the wrong instinct. `docs/assets/readme/aegis-demo.gif` stays in the README. |
| A live interactive demo on the page | Requires a backend the visitor does not have and a corpus we cannot ship. The honest version is §07: here are six commands, run it yourself. |
| "Winner, internal hackathon 2026" badge | Weak, self-referential, and the SIH judges are the next round of the same process. Mention it nowhere on the page. |

### 4.5 The two sentences that do the most work

If everything else is cut, these two survive, because they are the page's whole ethical position
and they are both literally true:

> **"It detects tampering. It does not prevent it."**
>
> **"This page is served under that header — open the network tab and count the origins."**
---

## 5. FULL COMPONENT SPECS

All components live under `frontend/components/landing/`. They import nothing from
`components/` outside that folder except `cn`, `AegisLogo` and lucide icons. That isolation is
deliberate: the landing page must not drag `AnimatedTechnicalBackground`, `SovereignCursor`,
`three`, `@react-three/fiber` or `firebase` into its bundle.

### 5.0 What is *not* reused, and why

| Existing component | Verdict | Reason |
|---|---|---|
| `SovButton` | **Not used.** | `rounded-full` + `transition-all duration-200`. The page is committed to 4px (`11 §4.10`) and `transition: all` is explicitly on the purge list (`10 §3.19`). |
| `AnimatedTechnicalBackground` | **Not used.** | Nothing in the credible set animates behind a hero (`11 §5.4`). |
| `SovereignRadialHero`, `ThreeDLayerView`, `FloatingTelemetryHud`, `SovereignCursor` | **Not used.** | All four pull weight and register we do not want in front of a cold judge. |
| `Reveal` from `components/primitives.tsx` | **Not used.** | Its animation is `0.7s` with a 14px translate. Too slow and too far (§6.3). A landing-local `Reveal` replaces it. |
| `TechnicalLabel` | **Not used.** | `text-[11px] tracking-[0.22em] text-foreground-muted` — `--foreground-muted` is 3.33:1 and fails AA (§8.3), and 0.22em is costume tracking. `MonoLabel` below replaces it at 0.08em on `--foreground-secondary`. |
| `AegisLogo` (`variant="mark"`) | **Used.** | The mark is good. The `full`/`compact` wordmarks are not (§3.6). |
| `cn` from `lib/utils` | **Used.** | — |

### 5.1 `landing/tokens.ts` — the shared class strings

One file so that no component invents a fourth control height or a fifth grey.

```ts
// frontend/components/landing/tokens.ts
//
// Class strings shared across the landing page. Every value here is bound to a
// token in globals.css; nothing introduces a hue, a radius or a size that the
// design system does not already declare.

/** The page's single content column. 1120px is the widest thing on the page. */
export const SHELL = 'mx-auto w-full max-w-[1120px] px-4 md:px-8 lg:px-10'

/** A narrower column for long-form prose: ~66 characters at 16px. [11 §3.B] */
export const PROSE = 'max-w-[62ch]'

/** Uppercase mono micro-label. 0.08em, never 0.16em or 0.22em. [10 §3.20] */
export const MONO_LABEL =
  'font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-foreground-secondary'

/** Machine value: id, hash, host, path. Weight 425 so it sits with the sans. */
export const MONO_VALUE = 'font-mono text-[12px] font-[425] text-foreground-secondary'

/** Section heading, used by every block except the hero. */
export const SECTION_TITLE =
  'text-balance text-[28px] font-medium leading-[1.12] tracking-[-0.024em] text-foreground md:text-[36px] md:leading-[1.08] md:tracking-[-0.028em]'

/** Section lede directly under a section heading. */
export const SECTION_LEDE =
  'mt-4 text-[16px] leading-[26px] tracking-[-0.008em] text-foreground-secondary'

/** Hairline card. No shadow. The border is the elevation. */
export const CARD = 'rounded-[4px] border border-border bg-surface'

/**
 * Focus ring. Ink only, no accent hue. 2px gap in the page colour then 2px of
 * ink, so it reads on both #f7f7f5 and #ffffff. [10 §3.26]
 */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/** The only three control heights on this page. [10 §3.22] */
export const CONTROL = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-5 text-[14px]',
  lg: 'h-11 px-5 text-[15px]',
} as const
```

### 5.2 `LandingButton`

```tsx
// frontend/components/landing/landing-button.tsx
import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CONTROL, FOCUS } from './tokens'

type Variant = 'primary' | 'outline' | 'quiet'
type Size = keyof typeof CONTROL

export interface LandingButtonProps extends Omit<ComponentProps<typeof Link>, 'children'> {
  children: ReactNode
  variant?: Variant
  size?: Size
  /** Full width below the `sm` breakpoint. Used for the hero CTAs. */
  blockOnMobile?: boolean
}

const VARIANTS: Record<Variant, string> = {
  // Exactly one filled button exists on the page, and it is the hero primary.
  primary: 'bg-foreground text-primary-foreground hover:bg-[#1f1f1f]',
  outline:
    'border border-border-strong bg-transparent text-foreground hover:border-foreground hover:bg-surface',
  quiet: 'text-foreground-secondary hover:text-foreground',
}

export function LandingButton({
  children,
  variant = 'outline',
  size = 'md',
  blockOnMobile = false,
  className,
  ...props
}: LandingButtonProps) {
  return (
    <Link
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[4px] font-medium tracking-[-0.006em]',
        // Only the three properties that actually change. Never `transition-all`. [10 §3.19]
        'transition-[background-color,border-color,color] duration-[120ms] ease-out',
        CONTROL[size],
        VARIANTS[variant],
        blockOnMobile && 'w-full sm:w-auto',
        FOCUS,
        className,
      )}
    >
      {children}
    </Link>
  )
}
```

### 5.3 `LandingHeader`

```tsx
// frontend/components/landing/landing-header.tsx
'use client'

import Link from 'next/link'
import { AegisLogo } from '@/components/aegis-logo'
import { useRole } from '@/components/role-context'
import { LandingButton } from './landing-button'
import { SHELL } from './tokens'

const NAV = [
  { href: '#chain', label: 'Product' },
  { href: '#proof', label: 'Proof' },
  { href: '#limits', label: 'Limits' },
] as const

export function LandingHeader() {
  // `authenticated` is false during the initial load and on the server render,
  // so the default label is the one a cold visitor needs.
  const { authenticated } = useRole()

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-[rgba(247,247,245,0.88)] backdrop-blur-[12px]">
      <div className={`${SHELL} flex h-14 items-center justify-between md:h-16`}>
        <Link
          href="/"
          aria-label="AEGIS — home"
          className="flex items-center gap-2.5 rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        >
          <AegisLogo variant="mark" size={26} />
          <span className="text-[15px] font-medium tracking-[-0.01em] text-foreground">AEGIS</span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-6 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-[2px] text-[13px] text-foreground-secondary transition-colors duration-[120ms] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <LandingButton href={authenticated ? '/console' : '/sign-in'} size="sm">
          {authenticated ? 'Open workbench' : 'Sign in'}
        </LandingButton>
      </div>
    </header>
  )
}
```

### 5.4 `SectionShell`

Every block from 02 to 07 is wrapped in this. It owns the index number, the eyebrow, the
heading, the lede and the vertical padding, so no section invents its own rhythm.

```tsx
// frontend/components/landing/section-shell.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { MONO_LABEL, PROSE, SECTION_LEDE, SECTION_TITLE, SHELL } from './tokens'

export interface SectionShellProps {
  /** Anchor target. Must match the header nav hrefs where one exists. */
  id: string
  /** Two-digit ordinal shown at the right of the eyebrow row. e.g. "03". */
  index: string
  /** Uppercase mono eyebrow. 2–4 words. */
  eyebrow: string
  /** The `h2`. Sentence case. */
  title: ReactNode
  /** Optional single paragraph under the heading. */
  lede?: ReactNode
  /** Paints the block on `--surface` instead of `--background`, with hairlines. */
  tone?: 'paper' | 'surface'
  children: ReactNode
  className?: string
}

export function SectionShell({
  id,
  index,
  eyebrow,
  title,
  lede,
  tone = 'paper',
  children,
  className,
}: SectionShellProps) {
  return (
    <section
      id={id}
      // `scroll-mt` clears the 64px sticky header when an anchor is followed.
      className={cn(
        'scroll-mt-16 py-16 md:py-24',
        tone === 'surface' && 'border-y border-border bg-surface',
        className,
      )}
    >
      <div className={SHELL}>
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <span className={MONO_LABEL}>{eyebrow}</span>
          <span className="font-mono text-[11px] font-[425] text-foreground-secondary">
            {index}
          </span>
        </div>

        <h2 className={cn(SECTION_TITLE, 'mt-8 max-w-[22ch]')}>{title}</h2>
        {lede ? <p className={cn(SECTION_LEDE, PROSE)}>{lede}</p> : null}

        <div className="mt-10 md:mt-12">{children}</div>
      </div>
    </section>
  )
}
```

### 5.5 `RunReceipt` — the hero visual

```tsx
// frontend/components/landing/run-receipt.tsx
import { cn } from '@/lib/utils'
import { CARD, MONO_LABEL } from './tokens'

/** One row of the receipt. Every field comes from the captured fixture. */
export interface ReceiptRow {
  /** Uppercase verb: CITED | CHECKED | COMPUTED | APPROVED | RECORDED. */
  label: string
  /** Sentence describing what happened. Sans, ink. */
  value: string
  /** The machine fact. Mono, secondary. Page ref, check count, hash, timestamp. */
  meta: string
}

export interface RunReceiptProps {
  /** Run id, verbatim from the fixture. */
  runId: string
  /** Human date of capture, e.g. "21 Sep 2026". */
  capturedOn: string
  rows: ReceiptRow[]
  /** Sentence printed under the card. Names where the values come from. */
  caption: string
  className?: string
}

export function RunReceipt({ runId, capturedOn, rows, caption, className }: RunReceiptProps) {
  return (
    <figure className={cn('m-0', className)}>
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className="flex h-10 items-center justify-between gap-4 border-b border-border px-4">
          <span className={MONO_LABEL}>Run receipt</span>
          <span className="truncate font-mono text-[11px] font-[425] text-foreground-secondary">
            {runId} · {capturedOn}
          </span>
        </div>

        <dl className="m-0">
          {rows.map((row, i) => (
            <div
              key={row.label}
              className={cn(
                'grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-4',
                'sm:grid-cols-[104px_minmax(0,1fr)_auto] sm:items-baseline sm:py-0 sm:min-h-14',
                i > 0 && 'border-t border-border',
              )}
            >
              <dt className={cn(MONO_LABEL, 'sm:self-center')}>{row.label}</dt>
              <dd className="m-0 text-[14px] leading-[20px] tracking-[-0.006em] text-foreground sm:self-center">
                {row.value}
              </dd>
              <dd className="m-0 font-mono text-[12px] font-[425] leading-[16px] text-foreground-secondary sm:self-center sm:text-right">
                {row.meta}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <figcaption className="mt-4 max-w-[68ch] text-[12px] leading-[18px] text-foreground-secondary">
        {caption}
      </figcaption>
    </figure>
  )
}
```

**Grid note.** `sm:grid-cols-[104px_minmax(0,1fr)_auto]` gives a fixed label gutter so the five
verbs align into a column — that vertical alignment is what makes the card read as an
instrument rather than a list. Below `sm` the grid collapses to one column and each row stacks
label / value / meta, which is the mobile wireframe in §3.2.

### 5.6 `MachineBlock` — the mono artifact container

Used by proof artifacts 1, 2 and 4, and by §07's command block.

```tsx
// frontend/components/landing/machine-block.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CARD, MONO_LABEL } from './tokens'

export interface MachineBlockProps {
  /** Uppercase mono label in the block's header bar. */
  label: string
  /** Optional right-aligned machine fact in the header bar, e.g. a file path. */
  source?: string
  /** Pre-formatted content. Rendered inside `<pre>`; whitespace is preserved. */
  children: ReactNode
  /** Sentence under the block. Says what it proves AND what it does not. */
  caption?: ReactNode
  /** `true` wraps long lines instead of scrolling horizontally. */
  wrap?: boolean
  className?: string
}

export function MachineBlock({
  label,
  source,
  children,
  caption,
  wrap = false,
  className,
}: MachineBlockProps) {
  return (
    <figure className={cn('m-0 flex flex-col', className)}>
      <div className={cn(CARD, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
        <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
          <span className={MONO_LABEL}>{label}</span>
          {source ? (
            <span className="truncate font-mono text-[11px] font-[425] text-foreground-secondary">
              {source}
            </span>
          ) : null}
        </div>
        <pre
          className={cn(
            'm-0 flex-1 overflow-x-auto p-3 font-mono text-[12px] font-[425] leading-[20px] text-foreground-secondary',
            wrap && 'whitespace-pre-wrap break-words',
          )}
        >
          {children}
        </pre>
      </div>
      {caption ? (
        <figcaption className="mt-3 text-[13px] leading-[20px] text-foreground-secondary">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}
```

Inside `children`, the ink-vs-secondary contrast that links the hashes is done with a plain
span:

```tsx
export function Hash({ children }: { children: ReactNode }) {
  return <span className="text-foreground">{children}</span>
}
```

No syntax-highlighting library. Two colours, one weight. `10 §3.33` says theme excerpts from
your own tokens rather than a highlighter's palette; the minimal version of that is two tokens.

### 5.7 `ChainCard` — section 03

```tsx
// frontend/components/landing/chain-card.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { MONO_LABEL } from './tokens'

export interface ChainCardProps {
  /** "01" | "02" | "03". */
  index: string
  /** One past-participle verb. Cited | Checked | Recorded. */
  verb: string
  /** The mechanism, as a bare noun phrase. No adjectives. */
  mechanism: string
  /** Two sentences, maximum. */
  body: ReactNode
  /** The machine artifact for this verb — usually a `<MachineBlock />`. */
  artifact: ReactNode
  className?: string
}

export function ChainCard({
  index,
  verb,
  mechanism,
  body,
  artifact,
  className,
}: ChainCardProps) {
  return (
    <article className={cn('flex flex-col gap-5', className)}>
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h3 className="text-[20px] font-medium tracking-[-0.02em] text-foreground">{verb}</h3>
        <span className="font-mono text-[11px] font-[425] text-foreground-secondary">{index}</span>
      </div>
      <p className={MONO_LABEL}>{mechanism}</p>
      <p className="text-[14px] leading-[22px] text-foreground-secondary">{body}</p>
      <div className="mt-auto pt-1">{artifact}</div>
    </article>
  )
}
```

Grid container for the three: `grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8`.

### 5.8 `LiveContainment` — proof artifact 3

The only component on the page that fetches. Three states, no fourth.

```tsx
// frontend/components/landing/live-containment.tsx
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { CARD, MONO_LABEL } from './tokens'

/** Exactly the fields `GET /api/status` returns. backend/api/routes/system.py:59 */
interface PublicStatus {
  name: string
  sovereign: boolean
  external_calls: number
  monitor_active: boolean
  monitored_since: string
  checked_at: string
}

type State =
  | { kind: 'reading' }
  | { kind: 'read'; status: PublicStatus }
  | { kind: 'unavailable' }

export interface LiveContainmentProps {
  className?: string
}

export function LiveContainment({ className }: LiveContainmentProps) {
  const [state, setState] = useState<State>({ kind: 'reading' })

  useEffect(() => {
    const controller = new AbortController()
    // 2.5s: a local loopback call that has not answered by then is not running.
    const timer = setTimeout(() => controller.abort(), 2500)

    fetch('/api/status', { signal: controller.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((status: PublicStatus) => setState({ kind: 'read', status }))
      // No fallback value. A page that prints a number it did not obtain is the
      // one thing this product cannot do. lib/api.ts refuses the same way.
      .catch(() => setState({ kind: 'unavailable' }))
      .finally(() => clearTimeout(timer))

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [])

  const breached = state.kind === 'read' && !state.status.sovereign

  return (
    <div className={cn(CARD, 'p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className={MONO_LABEL}>Containment</span>
        <span
          aria-hidden
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            state.kind === 'reading' && 'bg-border-strong',
            state.kind === 'unavailable' && 'bg-border-strong',
            state.kind === 'read' && !breached && 'bg-[var(--sovereign)]',
            breached && 'bg-[var(--critical)]',
          )}
        />
      </div>

      <p
        aria-live="polite"
        className={cn(
          'mt-2 text-[15px] leading-[22px] tracking-[-0.008em]',
          breached ? 'text-critical' : 'text-foreground',
        )}
      >
        {state.kind === 'reading' && 'Reading from this machine…'}
        {state.kind === 'unavailable' && 'Not reachable from this browser.'}
        {state.kind === 'read' &&
          `${state.status.external_calls} unapproved connection${
            state.status.external_calls === 1 ? '' : 's'
          } observed.`}
      </p>

      <p className="mt-1 font-mono text-[11px] font-[425] leading-[16px] text-foreground-secondary">
        {state.kind === 'read'
          ? `since ${state.status.monitored_since.slice(11, 19)} UTC · checked ${state.status.checked_at.slice(11, 19)} UTC`
          : state.kind === 'unavailable'
            ? 'GET /api/status — no response'
            : 'GET /api/status'}
      </p>
    </div>
  )
}
```

**Read the `breached` branch carefully.** It is the only place on the entire page where
`--critical` is used as *text*. That is permitted: `#dc2626` on `#f7f7f5` measures **4.51:1**
and passes AA for normal text (§8.3). `--sovereign` never becomes text anywhere — it is a
6px dot and nothing else.

### 5.9 `StageTable` — section 04

```tsx
// frontend/components/landing/stage-table.tsx
import { cn } from '@/lib/utils'
import { CARD, MONO_LABEL } from './tokens'

export interface Stage {
  /** "01".."07" */
  index: string
  /** Classify | Plan | Read | Retrieve | Sandbox | Draft | Verify */
  name: string
  /** What the stage does. One clause, present tense. */
  action: string
  /** What the stage leaves behind, in machine terms. */
  leaves: string
}

export function StageTable({ stages, className }: { stages: Stage[]; className?: string }) {
  return (
    <div className={cn(CARD, 'overflow-hidden', className)}>
      <div className="hidden h-9 items-center gap-4 border-b border-border px-4 sm:grid sm:grid-cols-[32px_112px_minmax(0,1fr)_minmax(0,1fr)]">
        <span className={MONO_LABEL} aria-hidden>
          #
        </span>
        <span className={MONO_LABEL}>Stage</span>
        <span className={MONO_LABEL}>What runs</span>
        <span className={MONO_LABEL}>What it leaves</span>
      </div>

      <ul className="m-0 list-none p-0">
        {stages.map((s, i) => (
          <li
            key={s.index}
            className={cn(
              'grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[32px_112px_minmax(0,1fr)_minmax(0,1fr)] sm:items-baseline sm:py-0 sm:min-h-11',
              i > 0 && 'border-t border-border',
            )}
          >
            <span className="font-mono text-[11px] font-[425] text-foreground-secondary sm:self-center">
              {s.index}
            </span>
            <span className="text-[14px] font-medium text-foreground sm:self-center">{s.name}</span>
            <span className="text-[14px] leading-[20px] text-foreground-secondary sm:self-center">
              {s.action}
            </span>
            <span className="font-mono text-[12px] font-[425] leading-[18px] text-foreground-secondary sm:self-center">
              {s.leaves}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

Row height 44px at `sm` and up — between Grafana's 36px list row and a comfortable marketing
row (`10 §3.23`). Seven rows ⇒ 308px + 36px header.

### 5.10 `ScreenFrame` — the only place a screenshot appears

```tsx
// frontend/components/landing/screen-frame.tsx
import Image from 'next/image'
import { cn } from '@/lib/utils'

export interface ScreenFrameProps {
  /** Path under /public. Never an external URL. */
  src: string
  /** Describes the STATE shown, not the product. Read by a screen reader. */
  alt: string
  /** Intrinsic pixel dimensions of the asset (capture at 2x, declare 2x). */
  width: number
  height: number
  /** One sentence naming the screen and the state. */
  caption: string
  /** `true` when the image is above the fold. Exactly one per page may set it. */
  priority?: boolean
  className?: string
}

export function ScreenFrame({
  src,
  alt,
  width,
  height,
  caption,
  priority = false,
  className,
}: ScreenFrameProps) {
  return (
    <figure className={cn('m-0', className)}>
      <div className="overflow-hidden rounded-[4px] border border-border bg-surface">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes="(max-width: 767px) 100vw, 640px"
          className="block h-auto w-full"
        />
      </div>
      <figcaption className="mt-3 text-[12px] leading-[18px] text-foreground-secondary">
        {caption}
      </figcaption>
    </figure>
  )
}
```

`next.config.mjs` already sets `images.unoptimized: true`, so `next/image` here is a layout
primitive (intrinsic sizing, no CLS) and not an optimiser. Assets are `.webp`, captured at 2×,
and live in `frontend/public/landing/`. **No frame chrome** — no fake browser bar, no macOS
traffic lights, no perspective transform, no drop shadow. A 1px border and nothing else.

### 5.11 `LimitList` — section 06

```tsx
// frontend/components/landing/limit-list.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Limit {
  /** The limitation as a bare statement. Bold lead-in, sentence case. */
  title: string
  /** One or two sentences. No softening, no "but". */
  body: ReactNode
}

export function LimitList({ items, className }: { items: Limit[]; className?: string }) {
  return (
    <dl className={cn('m-0 grid grid-cols-1 gap-x-10 gap-y-7 md:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.title} className="border-t border-border pt-4">
          <dt className="text-[15px] font-medium leading-[22px] tracking-[-0.01em] text-foreground">
            {item.title}
          </dt>
          <dd className="m-0 mt-2 max-w-[58ch] text-[14px] leading-[22px] text-foreground-secondary">
            {item.body}
          </dd>
        </div>
      ))}
    </dl>
  )
}
```

### 5.12 `CommandBlock` — section 07

```tsx
// frontend/components/landing/command-block.tsx
'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CARD, FOCUS, MONO_LABEL } from './tokens'

export interface CommandBlockProps {
  label: string
  /** Each entry is one shell line. `#` comments are rendered at secondary ink. */
  lines: string[]
  className?: string
}

export function CommandBlock({ label, lines, className }: CommandBlockProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard is unavailable over plain HTTP in some browsers. Say nothing
      // and leave the text selectable — it is a <pre>, not a widget.
    }
  }

  return (
    <div className={cn(CARD, 'overflow-hidden', className)}>
      <div className="flex h-9 items-center justify-between border-b border-border px-3">
        <span className={MONO_LABEL}>{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Commands copied' : 'Copy commands'}
          className={cn(
            'inline-flex h-6 items-center gap-1.5 rounded-[3px] px-2 font-mono text-[11px] text-foreground-secondary',
            'transition-colors duration-[120ms] hover:bg-surface-sunken hover:text-foreground',
            FOCUS,
          )}
        >
          {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-3 font-mono text-[12px] font-[425] leading-[22px] text-foreground">
        {lines.map((line) => (
          <div key={line} className={line.trimStart().startsWith('#') ? 'text-foreground-secondary' : undefined}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}
```

### 5.13 `Reveal` — the landing-local scroll reveal

```tsx
// frontend/components/landing/reveal.tsx
'use client'

import type { ReactNode } from 'react'
import { useReveal } from '@/hooks/use-reveal'
import { cn } from '@/lib/utils'

export interface RevealProps {
  children: ReactNode
  /** 0 | 1 | 2 — a stagger step, not a millisecond value. Max 2. */
  step?: 0 | 1 | 2
  className?: string
}

export function Reveal({ children, step = 0, className }: RevealProps) {
  const { ref, inView } = useReveal<HTMLDivElement>()
  return (
    <div
      ref={ref}
      data-inview={inView ? 'true' : 'false'}
      style={{ transitionDelay: `${step * 60}ms` }}
      className={cn(
        'translate-y-2 opacity-0 transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        'data-[inview=true]:translate-y-0 data-[inview=true]:opacity-100',
        // If motion is reduced, the element is simply present. No transform, no
        // fade, no delay — and crucially no dependence on the observer firing.
        'motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none',
        className,
      )}
    >
      {children}
    </div>
  )
}
```

`hooks/use-reveal.ts` is reused unchanged — it already unobserves after first intersection and
falls back to `inView = true` when `IntersectionObserver` is missing, which is the correct
no-JS-features behaviour.

### 5.14 `LandingFooter`

```tsx
// frontend/components/landing/landing-footer.tsx
import Link from 'next/link'
import { AegisLogo } from '@/components/aegis-logo'
import { MONO_LABEL, SHELL } from './tokens'

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Sign in', href: '/sign-in' },
      { label: 'How a run is proved', href: '#chain' },
      { label: 'What this is not', href: '#limits' },
    ],
  },
  {
    heading: 'Source',
    links: [
      { label: 'Repository', href: 'https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench' },
      { label: 'Architecture notes', href: 'https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench/tree/main/docs' },
    ],
  },
] as const

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className={`${SHELL} grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4`}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <AegisLogo variant="mark" size={24} />
            <span className="text-[14px] font-medium tracking-[-0.01em] text-foreground">AEGIS</span>
          </div>
          <p className="max-w-[34ch] text-[13px] leading-[20px] text-foreground-secondary">
            An air-gapped AI workbench for regulated industrial work.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.heading} aria-label={column.heading} className="flex flex-col gap-3">
            <span className={MONO_LABEL}>{column.heading}</span>
            {column.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[13px] text-foreground-secondary transition-colors duration-[120ms] hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ))}

        <div className="flex flex-col gap-3">
          <span className={MONO_LABEL}>Build</span>
          <span className="font-mono text-[12px] font-[425] text-foreground-secondary">
            api 127.0.0.1:8000
          </span>
          <span className="font-mono text-[12px] font-[425] text-foreground-secondary">
            inference 127.0.0.1:11434
          </span>
        </div>
      </div>

      <div className="border-t border-border">
        <div className={`${SHELL} flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between`}>
          <span className="font-mono text-[11px] font-[425] text-foreground-secondary">
            Smart India Hackathon 2026
          </span>
          <span className="font-mono text-[11px] font-[425] text-foreground-secondary">
            No analytics on this page.
          </span>
        </div>
      </div>
    </footer>
  )
}
```

Note the footer does **not** reuse `SiteFooter`. `SiteFooter` calls `api.health()`, which is an
authenticated endpoint; on a public page it would render "service unreachable" in four places
for every anonymous visitor. The landing footer states build-time facts only, and the one live
reading on the page lives in §05 where it is framed correctly.
---

## 6. MOTION

The motion budget for this entire page is **four transitions and one reveal**. That is the
whole list. Nothing else moves.

### 6.1 The complete inventory

| What | Trigger | Property | Duration | Easing | Notes |
|---|---|---|---|---|---|
| Button / link colour | hover in | `background-color`, `border-color`, `color` | **0ms** | — | Highlight appears instantly (`10 §3.16`) |
| Button / link colour | hover out | same | **150ms** | `ease-out` | Decays gently |
| Focus ring | `:focus-visible` | `box-shadow` | **0ms** | — | A focus ring that animates in feels laggy to a keyboard user |
| Copy-button label | click | `color`, `background-color` | 120ms | `ease-out` | `Copy` → `Copied`, reverts after 1600ms |
| Section reveal | first intersection | `opacity`, `transform` | **320ms** | `cubic-bezier(0.22, 1, 0.36, 1)` | 8px upward translate. Fires once. Max 3-step stagger at 60ms |

### 6.2 What explicitly does not move

- **The hero.** No entrance animation on the headline, sub-line, CTAs or receipt card. They are
  present at first paint. `11 §5.4`: nothing in the credible set animates above the fold, and a
  headline that fades in is the single clearest tell of a template.
- **No parallax, no scroll-linked anything.** No `scroll-timeline`, no sticky-scrub sections.
- **No number count-ups.** The live containment figure renders once, at its value. A number
  that animates from 0 is asserting drama about a measurement.
- **No pulsing dots.** `sov-pulse` is used on this page **zero** times. The `--sovereign` dot in
  `LiveContainment` is static. The pulsing air-gap pill on the current sign-in screen is
  identified in `11 §5.1.1` as reading like a crypto landing page; it does not come here.
- **No glows.** `sov-glow-sovereign`, `sov-glow-active`, the radial `--sovereign/5` gradient in
  `app/(app)/layout.tsx` — none of these appear on the landing page.
- **No marquees.** Chainguard's logo marquee is the first thing above their fold; we have no
  logos and an empty marquee is worse than none.
- **No cursor effects.** `SovereignCursor` is not mounted. `cursor: none` on a marketing page
  visited by an evaluator on an unfamiliar laptop is hostile.
- **No skeleton shimmer.** `LiveContainment`'s reading state is the word "Reading…" in ink.

### 6.3 Why the existing `.reveal` is replaced

`globals.css` defines:

```css
@keyframes sov-reveal { from { opacity: 0; transform: translateY(14px); } to { … } }
.reveal.in-view { animation: sov-reveal 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
```

700ms and 14px. Scrolled at any speed, the content arrives visibly late and the page feels
underneath the scroll rather than attached to it. The landing-local `Reveal` (§5.13) uses
**320ms and 8px** and is a `transition` rather than an `animation`, which means it composes
with `prefers-reduced-motion` through a class instead of through the global `!important`
override.

`globals.css` is **not modified**. The existing `.reveal` keeps working for the app; the
landing page simply does not use it.

### 6.4 Reduced motion

Three independent layers, because the global override alone is not sufficient:

1. **Global.** `globals.css` already ships
   `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important;
   transition-duration: 0.001ms !important; } .reveal { opacity: 1 !important; } }`. Left
   untouched.
2. **Component.** Every landing component that transitions carries Tailwind's
   `motion-reduce:transition-none`. `Reveal` additionally carries
   `motion-reduce:translate-y-0 motion-reduce:opacity-100`, so the element is **visible from
   first paint** rather than relying on the observer firing at a 1ms duration.
3. **Anchor scrolling.** The header's three anchor links would otherwise smooth-scroll if
   `scroll-behavior: smooth` were ever added to `html`. It is not added, and must not be. Add
   this to the landing layout's own stylesheet scope if smooth scrolling is later wanted:
   `@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth } }` —
   never unconditionally.

**Acceptance test.** With "Reduce motion" enabled in the OS, load the page and scroll to the
bottom in one gesture. Every section must be fully opaque and in final position at all times.
If any section appears blank for even one frame, layer 2 is wrong.

---

## 7. RESPONSIVE

Mobile-first. The Tailwind v4 defaults are used unchanged: `sm: 640`, `md: 768`, `lg: 1024`,
`xl: 1280`.

### 7.1 The gutter and column rule

```
< 768      px-4   (16px each side)   content = viewport − 32
768–1023   px-8   (32px each side)   content = viewport − 64
≥ 1024     px-10  (40px each side)   content = min(1120, viewport − 80)
```

`SHELL` (§5.1) is the only place this is expressed. No component sets its own horizontal
padding.

**Horizontal-scroll guarantees:**

- The landing `<body>` scope carries `overflow-x-hidden` on the layout wrapper.
- Every `<pre>` on the page is inside a parent with `overflow-x-auto`, so a long hash scrolls
  *its own block*, not the document.
- Every mono string that could exceed its box (`runId`, hashes, the repo path) carries
  `truncate` or `break-all`. The hero repo path uses `break-all` and is `hidden md:block`.
- No element uses a fixed `width` in px. The only fixed dimension anywhere is the receipt's
  `104px` label column, which exists only at `sm` and above.

**Acceptance test:** at 320px wide (the narrowest device worth supporting),
`document.documentElement.scrollWidth === document.documentElement.clientWidth`.

### 7.2 Per-section behaviour

| Section | `< 768` | `768–1023` | `≥ 1024` |
|---|---|---|---|
| **Header** | 56px tall. Mark + wordmark, one button. Nav links hidden. **No hamburger** — three anchors do not justify a menu. | 64px. Nav still hidden. | 64px. Three nav links visible. |
| **Hero h1** | 36px / lh 37 / ls −0.02em | 48px / lh 47 / ls −0.028em | 64px / lh 61 / ls −0.032em |
| **Hero sub** | 16px / lh 25, full width | 18px / lh 28, `max-w-[54ch]` | 18px / lh 28, `max-w-[54ch]` |
| **Hero CTAs** | Stacked, `w-full`, 44px tall, 10px gap | Inline, 40px, 12px gap | Inline, 40px, 12px gap |
| **Repo path** | hidden | visible | visible |
| **Receipt card** | One column per row; label / value / meta stack. Row height auto (~76px). Card header wraps to two lines. | Three-column grid, 56px rows | Three-column grid, 56px rows |
| **02 The premise** | Single column, the two panels stack with a 32px gap | Two columns | Two columns, 80px gap |
| **03 Chain cards** | Stacked, 40px gap, each artifact full width | Three columns, 32px gap | Three columns, 32px gap |
| **04 Stage table** | Each stage becomes a stacked block: index + name on line 1, action on line 2, `leaves` on line 3. Column headers hidden. | Four-column grid, 44px rows | Four-column grid, 44px rows |
| **04 Diagram** | `architecture-overview.svg` at full width, `overflow-x-auto` with a `min-w-[560px]` inner wrapper so it stays legible and scrolls horizontally *inside its own frame* | Full width, no scroll | Full width |
| **05 Proof grid** | 1 column, 32px gap | 2 columns | 2 columns, 32px gap |
| **06 Limits** | 1 column | 2 columns | 2 columns, 40px column gap |
| **07 Run it** | Command block full width; the three facts stack below it | Command block + facts side by side, 2 columns | Same, `3fr 2fr` |
| **Footer** | 1 column, 40px between groups | 2 columns | 4 columns |

### 7.3 Section vertical padding

```
< 768      py-14   (56px)
768–1023   py-20   (80px)
≥ 1024     py-24   (96px)
```

Expressed once, in `SectionShell` (`py-16 md:py-24` in the code above — adjust to
`py-14 md:py-20 lg:py-24` to match this table exactly).

### 7.4 Touch targets

Every interactive element on the page is ≥ 44×44 CSS px at `< 768`:

- Hero CTAs: `h-11` (44px) at mobile via `CONTROL.lg`, dropping to `h-10` at `sm`.
- Header sign-in button: `h-8` (32px) — **too small at mobile.** Fix: at `< 640` the header
  button uses `CONTROL.md` (`h-10`) and adds `py-1` to the header row. 40px is acceptable under
  WCAG 2.2 *Target Size (Minimum)* at 24px, and the 44px AAA figure is met by the two hero CTAs
  which are the real conversion path.
- `CommandBlock`'s copy button: `h-6` (24px) — **meets the 24px WCAG 2.2 AA minimum exactly.**
  Give it `p-2 -m-2` so the hit area is 40px while the visual stays 24px.
- Anchor nav links only exist at `≥ 1024`, where pointer is fine.

---

## 8. ACCESSIBILITY

### 8.1 Heading order

Exactly one `h1`. No level is skipped anywhere on the page.

```
h1   Local is not enough.                                       (section 01, hero)
h2   Running the model locally answers one question.            (02)
h2   Cited. Checked. Recorded.                                  (03)
  h3   Cited
  h3   Checked
  h3   Recorded
h2   One run, end to end.                                       (04)
h2   Check it yourself.                                         (05)
  h3   The audit chain
  h3   A policy that refuses
  h3   Containment, read live
  h3   This page
h2   What this is not.                                          (06)
h2   Run it.                                                    (07)
```

The section eyebrow (`MONO_LABEL`) and the two-digit index in `SectionShell` are `<span>`s, not
headings. `LimitList` uses `<dt>`/`<dd>`, not `h3`, because the items are term/definition pairs
and turning eight of them into headings would flood a screen-reader's heading list.

### 8.2 Landmarks and structure

```html
<header>            <!-- LandingHeader, with <nav aria-label="Sections"> -->
<main id="main">    <!-- every section -->
  <section id="chain" aria-labelledby="…">   <!-- SectionShell renders the h2 -->
<footer>            <!-- two <nav aria-label="Product"> / aria-label="Source"> -->
```

- A **skip link** is the first focusable element in the DOM:
  `<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[4px] focus:bg-foreground focus:px-4 focus:py-2 focus:text-[14px] focus:text-primary-foreground">Skip to content</a>`
- `SectionShell` gets an `aria-labelledby` pointing at its own `h2` id, so the section landmark
  is named.
- Every `<figure>` (`RunReceipt`, `MachineBlock`, `ScreenFrame`) has a real `<figcaption>`. The
  caption is the accessible description and it is never decorative.
- `ScreenFrame` `alt` text describes **the state shown**, not the product. `alt="Approval queue
  with one held deliverable awaiting a reviewer"`, never `alt="AEGIS screenshot"`.
- Decorative marks — the status dot in `LiveContainment`, the `#` column header in
  `StageTable`, the arrow glyph in the secondary CTA — all carry `aria-hidden`.
- `LiveContainment`'s value paragraph carries `aria-live="polite"` so the transition from
  "Reading…" to the value is announced once, without interrupting.

### 8.3 Contrast — the measured table

Computed against the page ground `#f7f7f5` (relative luminance 0.9289).

| Token | Hex | Ratio on `#f7f7f5` | Verdict | Where it may be used on this page |
|---|---|---|---|---|
| `--foreground` | `#0a0a0a` | **19.16 : 1** | AAA | All headings, receipt values, command text |
| `--foreground-secondary` | `#5f5b57` | **6.27 : 1** | AAA (normal text) | **All secondary copy, all mono labels, all captions** |
| `--foreground-muted` | `#8a8783` | **3.33 : 1** | **Fails AA for text of any size below 18.66px bold** | **Not used on this page at all** |
| `--border` | `#dcdad6` | 1.17 : 1 | n/a (non-text) | Hairlines only |
| `--border-strong` | `#c8c5bf` | 1.42 : 1 | n/a (non-text) | Control borders. **1.42:1 fails the 3:1 WCAG 2.2 non-text contrast minimum for the *boundary of a control*.** See §8.4 |
| `--critical` | `#dc2626` | **4.51 : 1** | AA (normal text) | Permitted as text. Used exactly once, in `LiveContainment`'s breach state |
| `--active` | `#0284c7` | **3.81 : 1** | AA-large only (≥24px, or ≥18.66px bold) | Not used on this page |
| `--sovereign` | `#16a34a` | **3.07 : 1** | Fails AA body | **Marks only.** One 6px dot. Never text, never a border that carries meaning alone |
| `--approval` | `#d97706` | **2.97 : 1** | Fails AA body | Not used on this page |

**The rule that follows from this table, and it is the most consequential accessibility
decision in the document:** `--foreground-muted` (`#8a8783`) is banned from the landing page.
The existing `TechnicalLabel` primitive and most of the current sign-in screen use it for 9–11px
mono labels, which is a 3.33:1 failure at the smallest text on the screen. The landing page's
`MONO_LABEL` uses `--foreground-secondary` at 6.27:1 instead. This is also why the page looks
more solid: at these sizes, `#8a8783` reads as unfinished rather than as quiet.

### 8.4 Non-text contrast, and the one fix required

WCAG 2.2 SC 1.4.11 requires **3:1** for the visual boundary of a user-interface component and
for graphics needed to understand content.

- **Outline button borders.** `--border-strong` `#c8c5bf` is **1.42:1**. The secondary CTA and
  the header button therefore have no perceivable boundary for a low-vision user. **Fix:** the
  `outline` variant's border becomes `border-foreground/35`, which computes to roughly
  `#a8a7a5` against the paper ⇒ **≈2.3:1** — still short. Use `border-foreground/55`
  (≈`#8a8986`, ≈3.2:1). Implemented as:

  ```
  outline: 'border border-[color-mix(in_oklab,var(--foreground)_55%,var(--background))] …'
  ```

  This introduces **no new hue** — it is `--foreground` mixed into `--background`, which is
  Chainguard's alpha-ramp discipline (`11 §4.8`) expressed as a colour-mix. It is the single
  change to the visual language this document proposes, and it is required for compliance.
- **Hairlines between rows** are decorative grouping, not "needed to understand content" — the
  label/value pairing survives without them. `--border` at 1.17:1 is acceptable there.
- **The `--sovereign` status dot** is never the sole carrier of meaning: the adjacent sentence
  always states the status in words. That satisfies SC 1.4.1 (Use of Colour).

### 8.5 Focus

- Every interactive element uses `FOCUS` from §5.1: a **2px ink ring with a 2px offset in the
  page colour**, i.e. a gap ring (`10 §3.26`). Never `outline: none` without a replacement.
- The ring is ink, not an accent hue, so it reads identically on `--background` and
  `--surface`.
- Focus order is DOM order throughout. There is no `tabindex` above 0 anywhere.
- The copy button in `CommandBlock` announces its state change through `aria-label`, which
  flips from `Copy commands` to `Commands copied`.
- No focus traps. No modals, no dialogs, no overlays on this page.

### 8.6 Keyboard

The whole page is operable with Tab / Shift-Tab / Enter. Full path:

```
1  Skip to content
2  AEGIS home link
3  Product   (anchor, ≥1024 only)
4  Proof     (anchor, ≥1024 only)
5  Limits    (anchor, ≥1024 only)
6  Sign in
7  Open the workbench
8  Read the source
9  Copy commands            (section 07)
10 Sign in                  (footer)
11 How a run is proved      (footer)
12 What this is not         (footer)
13 Repository               (footer)
14 Architecture notes       (footer)
```

Fourteen tab stops for a whole marketing page. That number is itself a design goal.

### 8.7 Other

- **Zoom.** At 200% browser zoom on a 1280×800 viewport, no content is lost and no horizontal
  scroll appears (SC 1.4.10). Guaranteed by the `ch`/`%`-based measures and the absence of
  fixed pixel widths.
- **Text spacing** (SC 1.4.12): no element uses a fixed `height` that contains text. Receipt and
  stage rows use `min-h-*`, never `h-*`.
- **Language.** `<html lang="en">` is already set in the root layout.
- **Reduced transparency.** The header's `backdrop-blur` is cosmetic; the background colour
  beneath it is opaque enough (`0.88` alpha over `#f7f7f5`) that text on it stays above 4.5:1
  regardless.
- **Page title.** `AEGIS — an air-gapped AI workbench for regulated industrial work` (§9.4).
  Not `AEGIS | Home`.

---

## 9. FILE PLAN

### 9.1 Route structure — how public and authenticated coexist

Today: `app/(app)/page.tsx` serves `/` (the console) behind `AuthGuard`, and `app/sign-in`
serves the sign-in screen. The landing page must own `/`. Two route groups cannot both define
`/`, so the console moves.

```
frontend/app/
├── layout.tsx                       MODIFIED — fonts become local; metadata slimmed
├── globals.css                      UNCHANGED
├── icon.svg                         unchanged
│
├── (marketing)/                     NEW — public, no AuthGuard
│   ├── layout.tsx                   NEW — LandingHeader + <main> + LandingFooter
│   └── page.tsx                     NEW — the landing page. URL: /
│
├── (app)/                           MODIFIED
│   ├── layout.tsx                   MODIFIED — AuthGuard stays; nav hrefs updated
│   ├── page.tsx                     DELETED  — moves to console/page.tsx
│   ├── console/page.tsx             NEW      — `export { default } from` the old file body. URL: /console
│   ├── ask/page.tsx                 unchanged
│   ├── tasks/page.tsx               unchanged
│   ├── approvals/page.tsx           unchanged
│   ├── registry/page.tsx            unchanged
│   ├── security/page.tsx            unchanged
│   └── audit/page.tsx               unchanged
│
└── sign-in/page.tsx                 unchanged (its view is rewritten under doc 11, not here)
```

**Why route groups and not middleware.** `(marketing)` and `(app)` are parentheses-wrapped, so
neither appears in a URL. `(app)/layout.tsx` already wraps its subtree in `AuthGuard`;
`(marketing)/layout.tsx` simply does not. No middleware, no matcher config, no edge runtime —
which matters, because an air-gapped deployment runs `next start` on Node and the fewer runtime
surfaces the better.

**Why not keep the console at `/` and put the landing at `/welcome`.** A judge types the host
and port. They land on `/`. That has to be the front door.

**What an authenticated user sees at `/`.** The landing page, with the header button reading
`Open workbench`. There is deliberately **no auto-redirect** from `/` to `/console` for a
signed-in visitor: a redirect makes the marketing page unreachable for the one person most
likely to want to send its URL to someone else, and an auto-redirect on a public page is a
surprise.

### 9.2 New files, in build order

| # | Path | Purpose | Lines (est.) |
|---|---|---|---|
| 1 | `frontend/components/landing/tokens.ts` | Shared class strings (§5.1) | 40 |
| 2 | `frontend/components/landing/landing-button.tsx` | §5.2 | 55 |
| 3 | `frontend/components/landing/reveal.tsx` | §5.13 | 30 |
| 4 | `frontend/components/landing/section-shell.tsx` | §5.4 | 55 |
| 5 | `frontend/components/landing/machine-block.tsx` | §5.6 | 60 |
| 6 | `frontend/components/landing/run-receipt.tsx` | §5.5 | 65 |
| 7 | `frontend/components/landing/chain-card.tsx` | §5.7 | 40 |
| 8 | `frontend/components/landing/live-containment.tsx` | §5.8 | 85 |
| 9 | `frontend/components/landing/stage-table.tsx` | §5.9 | 55 |
| 10 | `frontend/components/landing/screen-frame.tsx` | §5.10 | 45 |
| 11 | `frontend/components/landing/limit-list.tsx` | §5.11 | 35 |
| 12 | `frontend/components/landing/command-block.tsx` | §5.12 | 65 |
| 13 | `frontend/components/landing/landing-header.tsx` | §5.3 | 55 |
| 14 | `frontend/components/landing/landing-footer.tsx` | §5.14 | 80 |
| 15 | `frontend/components/landing/copy.ts` | **The entire copy deck as one typed object** (§10.12) | 180 |
| 16 | `frontend/app/(marketing)/layout.tsx` | Public shell | 35 |
| 17 | `frontend/app/(marketing)/page.tsx` | Composes sections 01–07 from `copy.ts` | 220 |
| 18 | `frontend/app/(app)/console/page.tsx` | Moved console route | 5 |
| 19 | `frontend/app/fonts/` | `Geist-Variable.woff2`, `GeistMono-Variable.woff2` | — |
| 20 | `frontend/public/landing/run.json` | The captured run fixture (§3.5) | — |
| 21 | `frontend/public/landing/*.webp` | 2–3 real screenshots, captured at 2× | — |
| 22 | `scripts/capture_landing_fixture.py` | Exports a real run into `run.json` | 90 |

Total new TSX/TS ≈ **1,125 lines**, plus assets.

### 9.3 Fonts — the change that makes the offline claim true

`frontend/app/layout.tsx` currently imports `Geist` and `Geist_Mono` from `next/font/google`.
Next self-hosts the result, so **at runtime this is already offline-safe**. But it fetches from
Google's servers **at build time**, which means the build does not run on an air-gapped machine.
For a product pitched on air-gap, that is a real contradiction and a judge who reads
`app/layout.tsx` will find it in ten seconds.

**Fix.** `geist` is already an implicit dependency via the font package, but add it explicitly
and vendor the two variable files:

```bash
npm i geist
mkdir -p frontend/app/fonts
cp node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2       frontend/app/fonts/
cp node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2   frontend/app/fonts/
```

```tsx
// frontend/app/layout.tsx  — replaces the next/font/google import
import localFont from 'next/font/local'

// Vendored, not fetched. A build of this project must succeed on a machine with
// no route to the internet, because that is the machine it is designed to run on.
const geistSans = localFont({
  src: './fonts/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

const geistMono = localFont({
  src: './fonts/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
})
```

`weight: '100 900'` is what makes `font-[425]` and `font-medium` (500) resolve against the
variable axis rather than snapping to a static cut. Without it, every `425` in §5 silently
becomes 400.

**Verification step, and put it in the PR description:** `npm run build` with the network
disabled must succeed.

### 9.4 Changes to existing files

| File | Change |
|---|---|
| `frontend/app/layout.tsx` | `next/font/google` → `next/font/local` (§9.3). Move the page-specific `metadata` out of the root layout into each route group's layout; the root keeps only `metadataBase`, `icons` and `viewport`. |
| `frontend/app/(app)/layout.tsx` | No structural change. Optional, recommended: delete the `AnimatedTechnicalBackground` and the `--sovereign/5` radial glow — they are the same register the landing page is rejecting, and consistency matters more than either. Out of scope for this document; flagged. |
| `frontend/app/(app)/page.tsx` | **Deleted.** Its two-line body moves to `(app)/console/page.tsx`. |
| `frontend/components/navigation.tsx` | `LINKS[0]` becomes `{ href: '/console', label: 'Console' }`. `isActive` loses its `href === '/'` special case and becomes `pathname.startsWith(href)`. Add a trailing item or a brand-link change so the AEGIS mark in the app header points at `/console`, not `/` — otherwise clicking the logo inside the app exits to the marketing page. |
| `frontend/components/sign-in/sign-in-view.tsx` | `router.push('/')` → `router.push('/console')`, in both `handleFirebaseSubmit` and `handlePersonaSignIn`. **This is a silent breakage if missed** — sign-in would deposit the user on the marketing page. |
| `frontend/components/auth-guard.tsx` | No change. It redirects to `/sign-in`, which is still correct. |
| `frontend/next.config.mjs` | Flip the `/console` redirect; add the CSP header (§9.5). |
| `frontend/package.json` | `+ "geist": "^1.5.0"`. Nothing else. No new runtime dependency. |
| `README.md` | Overclaim fixes from §1.6. |
| `backend/core/audit.py` | Docstring overclaim fix from §1.6. |

**`next.config.mjs` redirect change:**

```js
async redirects() {
  return [
    // '/console' used to redirect to '/'. It is now the console's real home,
    // and '/' is the public page. The old aliases follow it.
    { source: '/workspace', destination: '/console', permanent: false },
    { source: '/library',   destination: '/registry', permanent: false },
    { source: '/knowledge', destination: '/registry', permanent: false },
    { source: '/history',   destination: '/tasks',    permanent: false },
    { source: '/record',    destination: '/audit',    permanent: false },
  ]
}
```

### 9.5 The CSP header — proof artifact 4, implemented

```js
// frontend/next.config.mjs
//
// The landing page claims there is no CDN, no analytics and no third-party
// script on it. A claim a browser does not enforce is a slogan, so the browser
// enforces it. 'unsafe-inline' for styles is required by Next's streamed style
// injection; it permits inline CSS from this origin only and loads nothing.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ')

async headers() {
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: CSP },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    },
  ]
}
```

**Caveat that must be verified before shipping:** if Firebase auth is still wired into the
sign-in route, `script-src 'self'` will break it, because the Firebase SDK is bundled (fine) but
its auth popup navigates to `*.firebaseapp.com` (not fine under `frame-src`/`form-action`).
`11 §5.1.2` already recommends removing Firebase from the visible sign-in UI entirely, and this
header is a second, independent reason to do it. If Firebase must survive, scope the CSP to
`source: '/'` only rather than weakening it.

### 9.6 Build-order plan

1. **Fonts** (§9.3). Verify an offline `npm run build`. Half a day. Nothing else depends on it,
   but it is the change most likely to be forgotten.
2. **Routes** (§9.1) — move the console, fix the three `push('/')` call sites, fix
   `navigation.tsx`, flip the redirect. Verify sign-in still lands correctly. Half a day.
3. **`tokens.ts` + `LandingButton` + `SectionShell` + `Reveal`**. Half a day.
4. **Hero without the receipt** — headline, sub, CTAs, repo path, header, footer. Ships a
   complete, honest page at this point. One day.
5. **`capture_landing_fixture.py` + a real seeded run + `RunReceipt`.**
   `DEPENDS-ON: a working end-to-end run on the demo corpus.` One day.
6. **Sections 02, 03, 06** — the argument, the chain, the limits. These need only copy and the
   components from step 3. One day.
7. **Section 05** — `MachineBlock`, `LiveContainment`, the CSP header. One day.
8. **Sections 04 and 07** — screenshots, `StageTable`, `CommandBlock`. Half a day. **Cut first
   if the schedule slips** (§2.2).
9. **Accessibility pass** — the §8.7 acceptance tests, axe, keyboard walk, 200% zoom, reduced
   motion. Half a day, non-negotiable.

≈ **6.5 days** for one engineer. The page is shippable and honest after step 4.
---

## 10. COPY DECK

Every string on the page, final, ready to paste. Nothing here is a placeholder. Values that
must come from the fixture or from the API are marked `{…}` and have a source named.

### 10.1 Document head

| Field | Value |
|---|---|
| `<title>` | `AEGIS — an air-gapped AI workbench for regulated industrial work` |
| `description` | `AEGIS runs on one machine. Every answer is cited to a page, checked against your policy, and recorded in an append-only, hash-chained log.` |
| `og:title` | `AEGIS` |
| `og:description` | same as `description` |
| `og:image` | **none.** No social card until one can be generated locally. A missing card is better than a card we fetch a font to render. |

### 10.2 Header

| Element | String |
|---|---|
| Skip link | `Skip to content` |
| Wordmark | `AEGIS` |
| Nav 1 | `Product` |
| Nav 2 | `Proof` |
| Nav 3 | `Limits` |
| Button (anonymous) | `Sign in` |
| Button (session present) | `Open workbench` |

### 10.3 Section 01 — Hero

> **Local is not enough.**
>
> An air-gapped AI workbench for regulated industrial work. Every answer is cited to a page,
> checked against your policy, and recorded.
>
> `[ Open the workbench ]`  `[ Read the source ↗ ]`
>
> `github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench`

**Run receipt card**

| Label | Value | Meta |
|---|---|---|
| header | `Run receipt` | `{run.task_id} · {run.captured_on}` |
| `CITED` | `{run.cited.value}` | `{run.cited.meta}` |
| `CHECKED` | `{run.checked.value}` | `{run.checked.meta}` |
| `COMPUTED` | `{run.computed.value}` | `{run.computed.meta}` |
| `APPROVED` | `{run.approved.value}` | `{run.approved.meta}` |
| `RECORDED` | `{run.recorded.value}` | `{run.recorded.meta}` |

Caption:

> Every value above was exported from one real run by `scripts/capture_landing_fixture.py` and
> is served from `public/landing/run.json`. Nothing on this card is typed by hand. If that file
> is missing, this card does not render.

### 10.4 Section 02 — The premise

Eyebrow `THE PROBLEM` · index `01`

> ## Running the model locally answers one question.
>
> Self-hosting solves privacy. It is silent on everything a regulated organisation is actually
> asked afterwards.

Two panels, side by side at `≥768`:

**Panel A** — mono label `SOLVED BY RUNNING IT YOURSELF`

> The prompt never leaves the building.

**Panel B** — mono label `STILL OPEN`

> - Which model answered, and was it permitted to?
> - What did it read, and on which page?
> - Is the arithmetic right, or was it predicted?
> - Who authorised the result before it was acted on?
> - What can you hand a regulator in six months?

Closing line, full width, 18px, ink:

> **Nothing the model reads ever leaves the machine it runs on — and the workbench counts the
> attempts.**

*(Source note for the writer: the first clause is the Ollama/LM Studio construction from §0.1.
The second clause is the part only we can say. Do not soften either half.)*

### 10.5 Section 03 — The chain

Eyebrow `THE CHAIN` · index `02` · `id="chain"`

> ## Cited. Checked. Recorded.
>
> Three things happen to every answer before it is allowed to become an action. Each one leaves
> an artifact you can open.

**Card 01 — Cited**

- Mechanism label: `PAGE-LEVEL PROVENANCE`
- Body: *Retrieval returns evidence units that keep their document, page and section. A cited
  claim points at the span it came from, not at a filename. A scanned report with no text layer
  is rasterised and read by a local vision model, and the page number survives that too.*
- Artifact — `MachineBlock label="EVIDENCE UNIT" source="backend/core/schemas.py:192"`:

```
id            ev_4a1c
source        SOP-INS-014 — Vessel Inspection Procedure
location      page 12, §4.3
kind          knowledge_base
excerpt       "Minimum allowable thickness for Class 2 pressure
               vessels shall be recalculated at each inspection…"
```

**Card 02 — Checked**

- Mechanism label: `DEFAULT-DENY POLICY, RECOMPUTED FIGURES`
- Body: *Tool calls are refused unless a rule in `policies/` permits that role, that data
  classification and that side effect. Every figure that reaches a document is executed as
  Python in a sandbox rather than predicted, then recomputed by the verifier.*
- Artifact — `MachineBlock label="VERIFICATION REPORT" source="GET /api/tasks/{id}"`:

```
source_trace        PASS   4 material claims, 4 supported
calculation_recheck PASS   corrosion_rate recomputed, Δ 0.0000
code_review         PASS   no disallowed import or call target
policy              PASS   tool python_exec permitted for role engineer
approval            HELD   deliverable requires reviewer sign-off
```

**Card 03 — Recorded**

- Mechanism label: `APPEND-ONLY HASH CHAIN`
- Body: *Each record hashes the one before it. Editing or deleting a line changes every hash
  after it, and the verifier names the sequence where the chain first fails. It detects
  tampering. It does not prevent it.*
- Artifact — `MachineBlock label="AUDIT CHAIN" source="storage/logs/audit.jsonl"`:

```
seq 7   security  login_succeeded
        prev 331f2a44…   hash 40f978da…
                             │
seq 8   security  login_succeeded
        prev 40f978da…   hash 111c2ffb…
```

### 10.6 Section 04 — One run, end to end

Eyebrow `THE RUN` · index `03` · tone `surface`

> ## One run, end to end.
>
> Seven stages. Each one declares what capability it needs, is routed to a model policy permits
> and the host can actually hold in memory, and leaves something behind.

| # | Stage | What runs | What it leaves |
|---|---|---|---|
| 01 | Classify | Type, complexity and sensitivity are determined from `config/classification.yaml` | `task.classified` |
| 02 | Plan | Steps are decomposed before any of them execute | `task.planned` |
| 03 | Read | A PDF with no text layer is rasterised and read by the vision model | extraction + page refs |
| 04 | Retrieve | The local corpus is searched; passages keep their provenance | `[S1] [S2] …` |
| 05 | Sandbox | Generated Python runs under AST validation and POSIX resource limits | script, stdout, rusage |
| 06 | Draft | The answer is composed against the retrieved evidence only | draft + citations |
| 07 | Verify | Claims are traced, figures recomputed, checks scored | verification report |

Closing line under the table:

> The task then stops. A deliverable is held until a role holding `approval.decide` signs it,
> and the role that ran the task is not that role.

Architecture figure, using the existing self-hosted asset:

- `ScreenFrame` is not used here; the SVG is inlined or `<img src="/landing/architecture-overview.svg">`
  (copy it from `docs/assets/readme/`).
- `alt`: `Architecture diagram: browser to local API, through task analysis, model routing,
  agent orchestration, tools, verification, policy gateway and human approval, to a verified
  output, with audit and containment monitoring across all of it.`
- Caption: *Everything in that diagram runs on one machine. Inference is reached over loopback.*

### 10.7 Section 05 — Check it yourself

Eyebrow `PROOF` · index `04` · `id="proof"`

> ## Check it yourself.
>
> AEGIS has no customers, no certifications and no published benchmark. What it has is
> artifacts. Four of them are below, and all four can be disproved without asking us anything.

**Cell 1 — `THE AUDIT CHAIN`**

Artifact: the three real records from §4.3.

> Three consecutive records from this repository's own log. Each record hashes the one before
> it, so editing or deleting a line changes every hash after it and the verifier names the
> sequence where the chain first fails. It detects tampering. It does not prevent it.

**Cell 2 — `A POLICY THAT REFUSES`**

Artifact: the `python_exec` block from `policies/tool-permissions.yaml`, and the two sandbox
self-test results.

> The policy is a file in the repository. The result beside it is what happened when that code
> was actually submitted to the sandbox on this host — `GET /api/sovereignty/sandbox-test` runs
> it on demand and writes the outcome to the audit log. The second check exists because the
> first one can be bypassed.

**Cell 3 — `CONTAINMENT, READ LIVE`** (`LiveContainment`)

States:

| State | Line 1 | Line 2 |
|---|---|---|
| reading | `Reading from this machine…` | `GET /api/status` |
| read, clean | `{n} unapproved connections observed.` | `since {monitored_since} UTC · checked {checked_at} UTC` |
| read, breach | `{n} unapproved connections observed.` *(in `--critical`)* | same |
| unavailable | `Not reachable from this browser.` | `GET /api/status — no response` |

Caption:

> Read live from this machine by your browser, from an endpoint that requires no sign-in. It
> reports what the monitor observed on the process tree owned by this workbench. It is a
> measurement of one host over one uptime, not a property of the software.

Pull quote beneath, attributed to the source file — this is the strongest single line available
to us and it was written before this page existed:

> *"The sign-in screen states this platform keeps everything on the host. That claim has to be a
> reading even before anyone authenticates, or it is just a slogan printed on a login page."*
>
> — `backend/api/routes/system.py`

**Cell 4 — `THIS PAGE`**

Artifact: the CSP header from §9.5.

> This page is served under that header. There is no font CDN, no analytics, no embedded video
> and no third-party script — open the network tab and count the origins. A product that claims
> to work air-gapped should have a marketing page that does.

### 10.8 Section 06 — What this is not

Eyebrow `LIMITS` · index `05` · `id="limits"`

> ## What this is not.
>
> Stated plainly, because these affect whether AEGIS is right for a deployment. Every item is
> also in the README, and none of it gets softer there.

| Title | Body |
|---|---|
| **Application-level sandboxing is not VM isolation.** | Execution is a subprocess with static validation, POSIX resource limits and a socket shim. It is not a VM, a container, a namespace or a seccomp boundary, and should not be described as one. A deployment handling genuinely hostile input should put this process inside an OS-level boundary as well. |
| **The audit chain detects tampering. It does not prevent it.** | Hash-chained, append-only, locked across processes. An operator with write access to the file can still truncate it — and the verifier will say which sequence broke. |
| **Latency is hardware-bound.** | On a CPU-only host a full question takes roughly 45–75 seconds. A GPU changes this substantially. Nothing in the design hides the cost. |
| **Vision is the expensive path.** | Rasterising and reading a large scanned PDF is far slower than a text query and scales with page count. |
| **Cold starts matter.** | Single-model residency trades throughput for fitting on a small host. The first call after an eviction pays the load time. |
| **Policy files are deployment-specific.** | The shipped roles, classifications and approval rules are a sensible default, not your organisation's. |
| **Compliance is not a software property.** | The audit chain supports an assurance process. It does not constitute one, and AEGIS holds no certifications. |
| **There is no published benchmark yet.** | Accuracy claims are absent from this page because the evaluation set that would justify them has not been built. When it is, the numbers and the method will be here together. |

### 10.9 Section 07 — Run it

Eyebrow `RUN IT` · index `06`

> ## Run it.
>
> Python 3.11+, Node 20+, and Ollama on the same machine. No account, no key, no network.

`CommandBlock label="TERMINAL"`:

```
git clone https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench
cd Sovereign-On_Premise-Agentic-AI-Workbench

python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && cd ..

ollama pull qwen3:8b && ollama pull nomic-embed-text

# optional — seeds the demonstration corpus
python scripts/seed_demo_data.py

./scripts/run.sh
```

Three facts beside it, each a mono label over a sans line:

| Label | Line |
|---|---|
| `INTERFACE` | `http://127.0.0.1:3000` |
| `API` | `http://127.0.0.1:8000` |
| `INFERENCE` | `Ollama on 127.0.0.1:11434, pinned to loopback and refused otherwise` |

Closing line:

> The repository is ~21,900 lines and carries 118 tests across security, queue, evidence,
> deliverables and verification. Both numbers are `wc -l` and `pytest --collect-only`, and both
> are checkable in the clone you just made.

*(Writer's note: keep these two numbers **only** while they are true. They are the one place on
the page where a count is typed rather than read, and blacksmith.sh — §0 — is the cautionary
example of what happens when such a string goes stale. Put a comment in `copy.ts` saying how to
regenerate them.)*

### 10.10 Footer

| Group | Strings |
|---|---|
| Brand | `AEGIS` · `An air-gapped AI workbench for regulated industrial work.` |
| `PRODUCT` | `Sign in` · `How a run is proved` · `What this is not` |
| `SOURCE` | `Repository` · `Architecture notes` |
| `BUILD` | `api 127.0.0.1:8000` · `inference 127.0.0.1:11434` |
| Bottom left | `Smart India Hackathon 2026` |
| Bottom right | `No analytics on this page.` |

### 10.11 Strings that must never appear

Grep the page for these before merging. All of them exist in the repo today.

```
immutable            military-grade       bank-grade        enterprise-grade
100% auditable       zero egress          guaranteed        unbreakable
revolutionary        seamless             best-in-class     cutting-edge
next-generation      state-of-the-art     unparalleled      trusted by
clearance level      Authorize & Enter    Unlock the power  Transform your
```

### 10.12 `copy.ts` — the shape

Every string above lives in one typed module, so that a copy change is a one-file diff and a
reviewer can read the whole page's language without opening a component.

```ts
// frontend/components/landing/copy.ts
//
// The entire text of the public page. One file, so the voice can be reviewed in
// one sitting and so no string is invented inside a component.
//
// Rules this file is held to (docs/plan/21-LANDING-PAGE-SPEC.md §1.5):
//   1. Name the mechanism, never its virtue.
//   2. Every strong word takes a hedge. Never "immutable".
//   3. Numbers carry a unit, a scope and a source — or they are deleted.
//   4. No adjective of praise about our own software.
//   5. State, then next action, no apology.
//   6. Sentence case, except labels over machine values.

export const HERO = {
  headline: 'Local is not enough.',
  sub: 'An air-gapped AI workbench for regulated industrial work. Every answer is cited to a page, checked against your policy, and recorded.',
  primary: { label: 'Open the workbench', href: '/sign-in' },
  secondary: {
    label: 'Read the source',
    href: 'https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench',
  },
  repoPath: 'github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench',
  receiptCaption:
    'Every value above was exported from one real run by scripts/capture_landing_fixture.py and is served from public/landing/run.json. Nothing on this card is typed by hand.',
} as const

// … PREMISE, CHAIN, RUN, PROOF, LIMITS, RUN_IT, FOOTER follow the same shape.

/**
 * Typed once so a stale count cannot hide in prose.
 * Regenerate before every release:
 *   loc:   git ls-files '*.py' '*.tsx' '*.ts' | xargs wc -l | tail -1
 *   tests: pytest --collect-only -q | tail -1
 */
export const REPO_FACTS = {
  loc: '~21,900 lines',
  tests: '118 tests',
  verifiedOn: '2026-09-21',
} as const
```

---

## 11. WHAT I WOULD CUT, AND THE OPEN RISKS

### 11.1 Cut

- **The architecture SVG in §04.** It is the second-best visual in a section that already has
  the stage table. If the section survives the cut list at all, the table is the part that
  earns it.
- **`ScreenFrame` and the screenshot assets entirely**, if a real run cannot be captured in
  time. A page with the receipt card and no screenshots is coherent. A page with stale
  screenshots of a UI that has since been rebuilt is a liability under questioning.
- **The `Product` / `Proof` / `Limits` header anchors.** Three links to a page that is five
  screens long. They cost 15 lines and three tab stops. Keep only if the page grows.
- **The `REPO_FACTS` closing line in §07.** The only two hand-typed numbers on the page. If
  nobody will own regenerating them, delete them and the page loses nothing it cannot afford.

### 11.2 Risks, flagged honestly

| Risk | Severity | Mitigation |
|---|---|---|
| **No real run has been captured.** `storage/logs/audit.jsonl` currently holds 8 records — start-up, seeding and two logins. There is no completed pipeline run in this repository today. The receipt card, the verification artifact and the citation artifact all depend on one existing. | **High** | `DEPENDS-ON: backend — one successful end-to-end run on the seeded corpus.` Until then, ship §3.5's reduced hero. Do not hand-write the fixture. |
| **Firebase is still in the sign-in path**, and the CSP in §9.5 will break its popup. A judge also sees "Firebase Auth" and a Google SSO button on the sign-in screen of an air-gapped product, which `11 §5.1.2` calls the highest-severity credibility contradiction in that document. | **High** | Remove Firebase from the visible sign-in UI. Both this spec and doc 11 independently require it. |
| **`next/font/google` makes the build network-dependent** on a product pitched as air-gapped. | Medium | §9.3. Half a day. |
| **`--foreground-muted` at 3.33:1** is used for micro-labels across the existing app, not just the landing page. | Medium | The landing page bans it (§8.3). The app should follow, but that is `01-FRONTEND-ARCHITECTURE`'s call, not this document's. |
| **`--border-strong` at 1.42:1** fails WCAG 2.2 non-text contrast for control boundaries, app-wide. | Medium | §8.4 proposes a `color-mix` off `--foreground` that introduces no hue. Applies beyond this page. |
| **"Local is not enough" may not read as a product** to a judge skimming in four seconds. | Medium | The sub-line is definitional and the receipt card is unmistakably product. Fallback headline is `Cited. Checked. Recorded.` (§1.2 candidate B), which is a one-line change in `copy.ts`. |
| **Moving the console off `/`** breaks any bookmark, demo script or slide deck that points at `http://127.0.0.1:3000/` expecting the console. | Low | The redirect table in §9.4 handles the old aliases; `/` now shows the landing page with a one-click `Open workbench`. Tell the demo presenter. |
| **The `/api/status` fetch will fail** on any machine where only the frontend is running — including, plausibly, a judge's laptop. | Low | **By design.** The "not reachable from this browser" state is a feature of §4.3 Artifact 3, not a bug. |

### 11.3 The one-sentence summary for the founder

The page stops trying to look trustworthy and starts being checkable: a four-word headline
that makes an argument about the category rather than a claim about us, a hero visual that is
the actual receipt from a real run, four artifacts a hostile judge can disprove in two minutes,
a limitations section nobody would fake, and a Content-Security-Policy that makes the
air-gap claim something the browser enforces rather than something the copy asserts.
