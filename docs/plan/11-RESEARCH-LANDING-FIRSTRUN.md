# 11 — Research: Landing Pages, Sign-In, and the First Sixty Seconds

Beat: landing pages, sign-in / first-run, and the first sixty seconds of technical products.
Date of capture: 2026-09-21. All measurements at viewport 1440×900 unless stated.

---

## 0. Method, and what is measured vs. estimated

Two instruments were used:

1. **Text extraction** (fetch + markdown conversion) for copy. Everything in quotation marks in
   this document is verbatim from the page on the capture date.
2. **A real browser** (Playwright, Chromium, 1440×900 DPR 1) running `getComputedStyle` over the
   above-the-fold DOM, for type sizes, weights, line-heights, letter-spacing, colours, control
   dimensions and y-offsets. Where a number is labelled **[measured]** it came out of the browser.
   Where it is labelled **[est.]** I derived it (e.g. characters-per-line from pixel width ÷ average
   glyph advance) and it is approximate.

**What I could not get:**

- `sigstore.dev` renders client-side and returned a bare loading shell to the fetcher. I used
  `docs.sigstore.dev` instead, which is static. The *visual* design of sigstore.dev is therefore
  **not** described here — only its language.
- `app.vanta.com/auth/login` 302s to an error route for unauthenticated non-tenant visitors. Vanta's
  actual sign-in screen was **not** captured. Vanta below is homepage-only.
- `1password.com/sign-in` returns 404 (their sign-in is per-tenant at `<team>.1password.com`).
  1Password below is homepage-only.
- `workos.com` served their LLM-facing docs index rather than the marketing homepage to the fetcher,
  twice. WorkOS copy below is from that index and their blog, and is thinner than the rest.
- `resend.com` likewise served `llms.txt`. Resend is cited for voice only, not layout.
- Linear's marketing homepage scroll position moved under the instrument, so hero y-offsets for
  `linear.app` are unreliable and omitted. Its **login** page measured cleanly.

No screenshots were taken; everything visual below is either a computed-style number or a
description derived from DOM geometry. I have not invented any figure.

---

## 1. Shortlist — 10 products, and why each one maps to our problem

| # | Product | Why it maps to AEGIS |
|---|---------|----------------------|
| 1 | **Linear — `linear.app/login`** | The taste benchmark for auth screens. Its sign-in `h1` is **18px**. Proof that the confident move on an auth page is to go *smaller*, not bigger. We are currently doing the opposite. |
| 2 | **Vercel — `vercel.com/login`** | Ships **Geist Sans**, the exact typeface we use, at a known-good size ramp. Gives us a literal set of numbers to copy rather than guess. Also the canonical ordering of email vs. SSO vs. passkey. |
| 3 | **Tailscale — `login.tailscale.com/start`** | Identity-provider-first auth for an infrastructure/security product. Headline 20px. Shows how to make "your admin controls this account" feel like a feature, not a restriction — which is our RBAC story. |
| 4 | **Doppler — `dashboard.doppler.com/login`** | A secrets-management vendor's auth screen. Puts exactly **one** true number at the bottom of the login page and nothing else. That is the restrained version of the trust panel we are currently overbuilding. |
| 5 | **Chainguard** | The best "audited" visual vocabulary I found: uppercase mono micro-labels at +6% tracking over large numerals, hard 0px corners, no gradients. Directly portable to Geist Mono. |
| 6 | **Vanta** | Three-word headline set in a **light (300) weight at 88px**. Compliance vendor that refuses to look like a compliance vendor. The anti-"military-grade" reference. |
| 7 | **Sigstore** | Gives us a three-verb vocabulary — *signed / associated / witnessed* — that describes an evidence chain without a single adjective. This is the single most stealable thing in this document. |
| 8 | **Teleport** | Nouns-as-capabilities for access control ("Cryptographic Identity", "Ephemeral Privileges", "Session Recording and Playback"). Shows how to name a mechanism instead of praising it. |
| 9 | **Stripe** | Voice discipline: every proof point is a number with a unit. "99.999% historical uptime", not "incredibly reliable". This is the correction our copy needs. |
| 10 | **Drata** | **Included as the anti-pattern.** "Explore the World of Agentic Trust." "Transmit AI-Fueled Customer Assurance." Read these out loud next to Vanta's "Trust is everything" and the diagnosis of our own copy writes itself. |

Honourable mentions used in the patterns list but not given a full breakdown: **Fly.io** (voice),
**Oso** (one hard claim), **Infisical** (specific cryptography instead of adjectives),
**HashiCorp Vault/Boundary** (plain-spoken security headlines), **Modal**, **Baseten**,
**Sourcegraph**, **1Password**, **Cloudflare**, **Railway**, **Resend**, **Anthropic**.

---

## 2. Per-product breakdown

### 2.1 Linear — `linear.app/login` and `linear.app`

**Hero (marketing page).**
Headline: *"The product development system for teams and agents"* — 7 words, set on two lines.
Sub-line: *"Purpose-built for planning and building products. Designed for the AI era."* — 11 words, two
sentences, the second one four words long. Eyebrow is a changelog pill: *"New — Loops →"*.
First visual is an animated composite of the real app UI (Pulse / Inbox / My Issues / Reviews /
Initiatives), not a photograph and not an abstraction.

**Typography [measured], marketing hero:**

| Role | Size | Weight | Line-height | Letter-spacing | Colour |
|---|---|---|---|---|---|
| `h1` | 64px | 510 | 64px (1.00) | −1.408px (−0.022em) | `#F7F8F8` |
| sub | 15px | 400 | 24px (1.60) | −0.165px (−0.011em) | `#8A8F98` |
| nav | 13px | 400 | 19.5px | normal | `#8A8F98` |
| in-app chrome | 12–13px | 510 | 14–20px | normal | `#D0D6E0` / `#62666D` |

Body background `#08090A`. Typeface Inter Variable. Note the weight: **510**, not 600 or 700. Linear
never uses a heavy weight anywhere above the fold. The sub-line renders 505px wide ⇒ **≈67
characters per line [est.]**.

**Sign-in page [measured] — the important part.**
Layout: **centred single column, 288px wide.** No split. No marketing panel. No screenshot. No
gradient mesh. Light surface.

```
h1  "Log in to Linear"        18px / 500 / colour #2F2F31 / column width 288px / y = 187
btn "Continue with Google"    288 × 44 / radius 9999px / fill #6D78D5 / text #FEFEFF / 13px / 500
btn "Continue with email"     288 × 44 / radius 9999px / fill #FEFEFF / text #2F2F31 / 13px / 500
btn "Continue with SAML SSO"  288 × 44 / radius 9999px / fill #FEFEFF / text #2F2F31 / 13px / 500
btn "Log in with passkey"     288 × 44 / radius 9999px / fill #FEFEFF / text #2F2F31 / 13px / 500
    (vertical pitch between buttons: 60px — 44px control + 16px gap)
footer  "Sign up"  ·  "learn more"     13px / 450 / y = 488
```

**The headline on Linear's sign-in page is 18px.** Their marketing `h1` is 64px. That is a 3.5×
demotion, deliberate. The auth screen is not a place to sell; it is a place to let someone in.

**Proof.** On the marketing page: *"Linear powers over 40,000 product teams. From ambitious startups
to major enterprises."* plus three named-and-titled pull quotes (Gabriel Peal at OpenAI, Nik Koblov at
Ramp, Kaz Nejatian at Opendoor). On the sign-in page: **nothing**. Zero proof elements.

**Voice.** *"You'll probably build a better product, just because of the craft that using Linear
infuses on your brain."* — they published a testimonial that begins with "probably". That hedge is
the whole brand.

---

### 2.2 Vercel — `vercel.com/login`

The most directly copyable page in this document, because it is Geist Sans on a warm-neutral
background, which is our exact stack.

**Layout [measured]:** centred single column, **320px wide**, `x = 560` on a 1440 viewport.
Background `#FAFAFA`. Body font `GeistSans`.

| Element | Value [measured] |
|---|---|
| `h1` "Log in to Vercel" | 32px / 600 / lh 40px (1.25) / ls −0.96px (**−0.03em**) / `#171717` / `y = 154` |
| Email input | 320 × 40px, 16px text |
| Primary button "Continue with Email" | 320 × 40px, label 16px / 500, white text on black |
| Provider buttons | 320 × 40px, label 16px / 500, `#171717` on white; pitch **56px** (40 + 16) |
| Footer legal "Terms" / "Privacy Policy" | 12px / 400 / `#A8A8A8`, pinned at `y = 860` |
| "Sign Up" link | 16px / 400 / `#0072F5` |

**Order of methods — this is the B2B-correct order and we should mirror it:**
1. Email **field** (live, focusable, first)
2. "Continue with Email" — primary, filled black
3. "Continue with Google"
4. "Continue with GitHub"
5. "Continue with ChatGPT"
6. "Continue with SAML SSO"
7. "Continue with Passkey"
8. "Show other options" — progressive disclosure, the long tail is hidden
9. "Don't have an account? Sign Up"

Note that the credential path is **first and is the only filled button**; federated identity follows.
Consumer products invert this. We are B2B/on-prem, so Vercel's order is ours.

**Everything else about the page is absence.** No logo strip, no stat, no screenshot, no illustration,
no background texture, no card. The form floats directly on `#FAFAFA`. 154px of empty space above the
headline, and roughly 200px of empty space below the last control before the legal line.

---

### 2.3 Tailscale — `login.tailscale.com/start` and `tailscale.com`

**Sign-in [measured]:** centred, content column **560px** (wider than Linear/Vercel because the
provider tiles are laid out in a grid). Background `#FFFFFF`.

| Element | Value [measured] |
|---|---|
| `h1` "Sign up with your identity provider" | **20px** / 600 / lh 29px / ls −0.6px (−0.03em) / `#242424` / `y = 116` |
| `h2` "You'll use this provider to log in to your network (more)" | 16px / 400 / lh 23.2px / `#343433` |
| Legal "Terms of Service" / "Privacy Policy" | 12.8px / 400 / `#666666` |
| "Contact our team" | 14.4px / 400 / `#343433` |

Two things to steal. First, the headline is again tiny — **20px** — confirming Linear. Second, the
sub-line is a *sentence about the consequence of the choice you are about to make*: "You'll use this
provider to log in to your network." It teaches the model rather than praising the product, and it
ends with an inline `(more)` rather than a tooltip icon.

**Marketing hero.** Headline: *"The best secure connectivity platform for the AI era"*.
Sub-line: *"A Zero Trust identity-based connectivity platform that replaces your legacy VPN, SASE,
and PAM and connects remote teams, multi-cloud environments, CI/CD pipelines, Edge & IoT devices, and
AI workloads."* — 38 words. This is **too long** and is a counter-example; it reads as SEO. The hero
headline's "The best" is also a claim with no referent. Tailscale's craft is in the product and the
auth flow, not in this sentence.

**Proof that reads as credible:** *"1,000+ hours saved with fewer connectivity issues"* (Corelight),
*"90% reduction in internal support requests"* (Instacart) — attributed to a named customer.
**Proof that reads as cheap:** *"40,000 businesses choose Tailscale"* with an unattributed logo wall.

---

### 2.4 Doppler — `dashboard.doppler.com/login`

A secrets manager's login screen. Dark, `#16171A`, Inter.

| Element | Value [measured] |
|---|---|
| `h1` "Welcome back" | 40px / 600 / lh 60px / `#FFFFFF` / `y = 163` |
| `h2` "Log in to manage, orchestrate, and govern your secrets at scale." | 16px / 400 / lh 24px / `#D2D5DA` / width 487px ⇒ **≈61 chars [est.]** |
| Card heading "Log in" | 20px / 600 / lh 30px, card width **550px** |
| Provider buttons "Google" \| "GitHub" | side-by-side, labels 14px / 600 |
| Divider "or" | 16px / 400 / `#8E95A2` |
| Field label "Email address" | **12px** / 400 / `#FFFFFF` |
| Input | 548 × 38px, 14px |
| Primary "Log in" | label 14px / 600, dark text `#16171A` on light fill |
| "Sign up" link | 14px / 600 / `#06ACF9` |
| Bottom strip | **"75B+ secrets read every month"** — 16px / 600 / white, spanning the full 1280px content width at `y = 754` |

**The steal: one true number, once, at the bottom of the auth screen.** Not a panel of four tiles.
Not a badge row. One sentence, one number, full bleed, below the form where it cannot compete with
the task. It is also a number that is *a fact about their fleet*, not a claim about your session —
which is precisely the distinction the comment already sitting in our `sign-in-view.tsx` identified.

Doppler's provider order (SSO above `or` above email) is the **consumer** order and is worse than
Vercel's for our case; ignore that part.

---

### 2.5 Chainguard — `chainguard.dev`

**Hero.** Headline: *"Secure-by-default open source software"* — 5 words, one compound adjective, no
verb, no superlative. Sub-line: *"Hardened, secure, and production-ready builds that prevent AI
attacks."* — 10 words. (The "prevent AI attacks" clause is the weakest thing on the page; it is a
promise, and it is the one line that reads like marketing.)
CTAs: *"Talk to an expert"* / *"Get started free"*.

**Typography [measured]:**

| Role | Size | Weight | lh | ls | Colour |
|---|---|---|---|---|---|
| `h1` | 64px | (bold face) | 64px (1.00) | **−3%** | `#0D161C` |
| sub | 18px | 400 | 24px (1.33) | normal | **`rgba(13,22,28,0.70)`** |
| stat label | 14px | 400 mono | 20px | **+6%** | **`rgba(13,22,28,0.40)`** |
| stat numeral | 40px | bold | 48px | −3% | `#000000` |
| nav | 14px | 500 | 20px | normal | `#0D161C` |

`h1` box is 729px at 64px ⇒ the headline wraps to two lines of **≈20–24 characters each [est.]** —
a deliberately short measure. Headline `y = 234`, i.e. **26% of the 900px viewport is empty above the
first word [measured]**. Sub-line box 584px at 18px ⇒ **≈65 chars [est.]**.

**Three things to steal, all directly portable to our palette:**

1. **Secondary text is the ink colour at reduced alpha, not a separate grey.** `rgba(13,22,28,0.70)`
   for the sub-line, `rgba(13,22,28,0.40)` for micro-labels. One hue, three densities. Our tokens
   currently declare three *separate* greys (`#5f5b57`, `#8a8783`); an alpha ramp off `#0a0a0a`
   would be cleaner and is what the serious sites do.
2. **`border-radius: 0` on primary buttons.** Hard corners. Combined with a mono label it reads
   industrial rather than consumer. (We are committed to 4px, which is close enough — do **not**
   drift up to 8/10px.)
3. **The stat grid vocabulary:** `PROJECTS / 3,000+`, `VERSIONS / 260K+`, `IMAGES / 520K+`,
   `BUILD MANIFESTS / 1B+`, `LIBRARY VERSIONS / 2M+`. Uppercase mono micro-label at 40% ink and +6%
   tracking, sitting above a 40px numeral at 100% ink. **That pairing — quiet mono caption, loud
   numeral — is the entire visual grammar of "this was counted, not claimed."** It is what we should
   use for evidence counts inside the app, and it is exactly why our Geist Mono is an asset.

Chainguard's compliance mentions (FedRAMP, PCI DSS, CMMC 2.0, SOC 2) appear as *use-case links*, not
as a badge row. That reads better: the framework is a destination, not a sticker.

---

### 2.6 Vanta — `vanta.com`

**Hero.** Headline: **"Trust is everything"** — *three words*. Sub-line: *"Earn and prove it with 35+
compliance frameworks, automated and continuously monitored."* CTAs: *"Get a demo"*, *"See an
interactive demo"*.

**Typography [measured]:**

| Role | Size | Weight | lh | ls | Colour |
|---|---|---|---|---|---|
| `h1` | **88px** | **300** | 83.6px (0.95) | −3% | `#181822` |
| sub | **30px** | 400 | 39px (1.30) | −1% | `#373744` |
| nav | 16px | 400 | 25.6px | normal | `#181822` |

Headline `y = 257` [measured], beneath a 56px announcement bar. Sub-line box 832px at 30px ⇒
**≈55 chars [est.]**.

**This is the most instructive single data point in the research.** A compliance company — the
category most at risk of looking like a padlock-and-shield cliché — sets its headline in a
**300-weight** face at 88px. The entire feeling of authority comes from scale plus restraint, with
*zero* bold weight and *zero* security iconography above the fold. Compare to our current sign-in,
which uses `font-extrabold` at 48–60px plus a pulsing dot plus a radial glow plus an animated
technical background. We are shouting in a room where the credible people are whispering.

**Proof.** Numbers, attributed, mostly per-customer: *"Eliminated 10 spreadsheets"*, *"2,000 hrs.
saved annually"*, *"20% faster deal cycles"*, *"Automated 93% of questionnaires"*. Credible.
*"16,000+ customers, from startup to enterprise"* — fine, generic. *"Saved hundreds of thousands"* —
cheap, because it has no unit and no name attached. Section heading *"Proof? We've got proof."* is
the one tonal slip on the page.

**Alternate headlines observed in their rotation:** *"The new standard for trust"* and
*"Cool, calm, and audit-ready"*. The second one is the target register for AEGIS — it names the
emotional state of the buyer (calm) rather than the ferocity of the product.

---

### 2.7 Sigstore — `docs.sigstore.dev`

Visual design not captured (client-rendered shell). Language captured, and the language is the point.

Self-description: *"Sigstore is an open source project for improving software supply chain
security."* One sentence. No adjectives.

The three-verb chain, verbatim:

> **Signed** — "By using a Sigstore client (Cosign)"
> **Associated** — "With an identity through our certificate authority (Fulcio)"
> **Witnessed** — "By recording the signing information in a permanent transparency log (Rekor)"

And: *"Signatures are generated with ephemeral signing keys so there's no need to manage keys.
Signing events are recorded in a tamper-resistant public log so software developers can audit signing
events."*

**Note the word choice: "tamper-resistant", not "tamper-proof". Not "immutable".** That one-word
hedge is why the project is trusted. We currently write "immutable audit logs" in our sign-in
sub-line. "Immutable" is a claim about physics; "append-only" and "tamper-evident" are claims about
an implementation, and are both true and checkable.

**The steal: a three-verb chain for the AEGIS evidence path.** Sigstore's *signed / associated /
witnessed* maps almost one-to-one onto what our product actually does:

> **Cited** — every claim carries the span it came from
> **Checked** — every action is evaluated against the policy in `/policies`
> **Recorded** — every decision is appended to the audit log

Three past-participles. No adjectives. No "military-grade". This is the copy backbone for our
landing page and for the one line on our sign-in screen.

---

### 2.8 Teleport — `goteleport.com`

**Hero.** Eyebrow: *"THE AI INFRASTRUCTURE IDENTITY COMPANY"*. Headline: *"Unified Identity Securing
Classic & AI Infrastructure"* — 7 words, and clunky ("Securing" as a participle doing too much work).
Sub-line: *"Faster engineering. Resilient infrastructure."* — two two-word fragments. That sub-line
is excellent: it names the two outcomes, one per audience, and stops.
CTAs: *"Contact Sales"* / *"Try Teleport for Free"*.

**Proof, ranked by credibility as I read them cold:**

| Claim | Verdict |
|---|---|
| *"Nasdaq, Vonage, DoorDash, dbt Labs, Accenture, GoTo, Discord, GitLab, Carta"* logo wall | **Credible.** These are verifiable and the category (regulated + infra) matches the product. |
| *"20k GitHub stars"*, *"5000+ Community members"* | **Credible**, because they are checkable in one click. |
| *"4.6 out of 5 Gartner reviews"* | **Credible-ish.** Third-party, sourced, and notably *not* rounded to 5. |
| *"95% reduction in exposed attack surface"* | **Cheap.** No baseline, no methodology, no customer named. |
| *"100% auditable agentic workflow"* | **Cheap.** "100%" of an unmeasurable denominator. |
| *"0 standing privileges"* / *"0 identity fragmentation"* | **Mixed.** The first is a real architectural property. The second is a marketing noun pretending to be a metric. |

**The genuinely good part is the capability naming.** Section headings are bare noun phrases that
each name a mechanism: *"Cryptographic Identity"*, *"Ephemeral Privileges"*, *"Agentic Control"*,
*"Vault-free Privileged Access (PAM)"*, *"Session Recording and Playback"*, *"Identity-Based Audit
Events"*, *"Detailed audit logs for every user action"*. Not one adjective of praise. The reader
supplies the admiration.

This is the model for our feature names. "Evidence Ledger", "Policy Gate", "Approval Queue",
"Session Transcript" — nouns that name the machine part, not its virtue.

---

### 2.9 Stripe — `stripe.com`

**Hero.** Eyebrow: *"Global GDP running on Stripe:"* (with a live counter). Headline: *"Financial
infrastructure to grow your revenue."* — 6 words. Sub-line: *"Accept payments, offer financial
services and implement custom revenue models – from your first transaction to your billionth."* —
the "from your first transaction to your billionth" clause does the range-of-scale work that a
bullet list would otherwise do. First visual is an abstract wave field, not a product screenshot —
notable, because Stripe is the one company here whose product screenshot would be a liability
(it is a dashboard of somebody else's money).

**Proof — the purest example of the quantitative-only discipline:**
*"135+ currencies and payment methods"*, *"US$1.9tn in payments volume processed in 2025"*,
*"99.999% historical uptime"*, *"200M+ active subscriptions"*, *"500M+ API requests per day"*,
*"10K+ API requests per second"*, *"150K+ transactions per minute"*. Every single one is a number
with a unit and, where relevant, a time window. There is no sentence of the form "X is very Y."

Note especially **"99.999% *historical* uptime"**. The word "historical" is a hedge that costs them
nothing and buys enormous credibility: it converts a promise into a measurement.

**Voice.** Independent write-ups of Stripe's style converge on the same observations: the words
"revolutionary", "game-changing", "seamless" and "best-in-class" are effectively absent from their
homepage, docs and blog; CTAs are lowercase verb-plus-object ("Start now.", "Contact sales."); there
are no exclamation marks; and their error copy is diagnostic rather than apologetic — the canonical
example being *"The card has expired. Check the expiration date or use a different card."*
(state, then the next action, no apology, no blame).

That error pattern is exactly what our auth error states should do.

---

### 2.10 Drata — `drata.com` — **the anti-pattern exhibit**

Same category as Vanta. Read these verbatim and then re-read Vanta's "Trust is everything":

> Headline: **"Explore the World of Agentic Trust"**
> Sub-line: *"Leverage autonomous AI agents to automate compliance, manage internal and third-party
> risk, and continuously prove your security posture."*
> Section headings: *"The Agentic Trust Management Platform"*, *"Engage Continuous Compliance on AI
> Autopilot"*, *"Transmit AI-Fueled Customer Assurance"*, *"Activate Agentic Third-Party Risk
> Management"*
> CTAs: *"Transmit Trust"*, *"Boost Questionnaire Velocity"*, *"Engage Compliance Autopilot"*

Every CTA is an invented verb phrase. "Transmit Trust" is not a thing a person does. "Boost
Questionnaire Velocity" is three abstractions stacked. The headline invites you to "explore a world",
which is a theme-park verb.

And yet **Drata's numbers are better sourced than Vanta's**: *"75% reduced SOC 2 audit duration"*,
*"7,980 fewer hours spent on audit preparation annually for average enterprise"*, *"$20M annual
revenue accelerated with Trust Center for average enterprise"*, *"4.8 / 5.0 G2 Reviews"*. Good data,
buried under language nobody believes. That is precisely our failure mode: **we have a genuinely
unusual technical story and we are wrapping it in Drata's voice.**

The specific tell both Drata and our current sign-in share: **verbing an abstraction.** "Transmit
Trust" ↔ "Authorize & Enter as Engineer". "Engage Compliance Autopilot" ↔ "Select Workbench Clearance
Level".

---

### 2.11 Quick notes on the rest

- **Anthropic** — *"AI research and products that put safety at the frontier"*; sub-line is a
  factual corporate statement (*"Anthropic is a public benefit corporation dedicated to securing its
  benefits and mitigating its risks"*). CTA: *"Try Claude"*. Neutral off-white ground, high contrast,
  no product screenshot above the fold. Proof of how far plain declaration gets you.
- **Fly.io** — best pure voice on the list. *"Fly.io: computers for agents"*. *"Sandboxes aren't
  enough. Give your agent a real computer and get back to building."* Body copy: *"The bill goes to
  zero when nobody's home."*, *"Nobody migrates anything."*, *"The agent does the setup, and you get
  your afternoon back."* Specific, concrete, slightly funny, never boastful. Steal the *structure*
  (concrete consequence sentences), not the jokes — we are in a regulated-industry pitch.
- **Oso** — *"Agents are here. Oso makes them safe."* (6 words, two sentences). And the single
  sharpest line in the whole sweep: *"Your employees ignore 96% of their permissions. Agents won't."*
  That is one statistic doing the work of an entire section.
- **HashiCorp Vault** — *"Secure application, machine, and AI agent identities and protect sensitive
  data"*, with *"Fight secret sprawl by using short-lived, just-in-time credentials that expire
  automatically"*. Mechanism-first. **Boundary** is even better: *"Simple and secure remote access"*
  / *"Securely access any system from anywhere based on user identity."* Five-word headline for an
  enterprise security product.
- **Infisical** — the model for replacing adjectives with cryptography: *"Secrets are encrypted with
  AES-256-GCM at rest and TLS 1.2 minimum in transit"*, *"FIPS 140-3 validated cryptographic modules
  available"*, *"More than 10 billion secrets secured every day."* Nobody writing that sentence needs
  the phrase "bank-grade security".
- **1Password** — *"Secure access for every human and AI agent"* / *"Zero standing privilege enforced
  through just-in-time, and just-enough access."* Note **"enforced through"** — the construction that
  converts a claim into a mechanism. We should use that construction constantly.
- **Baseten** — *"Inference is everything"* (3 words, same shape as Vanta). Relevant to us: they put
  the deployment story in plain words — *"right in your own VPCs"* — and park SOC 2 / HIPAA badges in
  the **footer**, not the hero.
- **Sourcegraph** — *"The context layer for your entire codebase"*. Their most credible hero element
  is a concrete in-product number used as an illustration: *"31 files referencing User across 7
  layers"*. A real query result beats a feature bullet.
- **Modal** — *"AI infrastructure that developers love"* is weak (unverifiable), but the case-study
  stats are strong and attributed: *"65% latency reduction"* (Decagon), *"4 months faster to launch"*
  (Suno).
- **Railway login** — centred, minimal, two buttons ("Continue with GitHub", "Log in using email"),
  and a footer that reads **"All systems operational"** linked to the status page. A live system fact
  on the auth screen. Same family of move as Doppler's one number.
- **Resend** — *"Resend is the email API for developers."* Seven words, `is`, done. The template for
  a definitional headline.
- **Vercel / Cloudflare** — Cloudflare's hero I fetched resolved to the Workers page; not a clean
  homepage capture, so I am not drawing conclusions from it beyond noting the *"330+ data centers"*
  style of countable proof.

---

## 3. Cross-cutting findings

**A. The auth-page headline is small.** Linear 18px, Tailscale 20px, Doppler's card heading 20px.
Vercel's 32px is the outlier and is the largest in the set. Meanwhile marketing `h1`s are 64–88px.
Our current sign-in runs a 48px/60px `font-extrabold` hero. **That single decision is most of why the
page "looks bad": it is marketing typography on a utility screen.**

**B. Body measure converges on 55–67 characters.** Linear ≈67, Chainguard ≈65, Doppler ≈61,
Vanta ≈55 [all est.]. Nothing in the set runs long-form copy wider than that.

**C. Whitespace above the fold headline is 150–260px at 900px viewport height** — 17% to 29% of the
viewport, empty, before the first word. [measured: Vercel login 154, Tailscale 116, Doppler 163,
Linear login 187, Chainguard 234, Vanta 257.]

**D. Form controls are 38–44px tall with 16px gaps.** Vercel 40px / 56px pitch; Linear 44px / 60px
pitch; Doppler 38px. Input font-size is 14–16px (never smaller — 16px avoids iOS zoom).

**E. Secondary text is the ink colour at 40–70% alpha, not a separate grey** (Chainguard is explicit
about this; Linear's `#8A8F98` on `#08090A` is the same idea in a dark theme).

**F. Nobody's good sign-in page has a marketing panel.** Linear, Vercel, Tailscale, Railway: centred
column, nothing beside it. The split-screen-with-brand-photo is a mid-tier SaaS pattern.

**G. Where a sign-in page does carry proof, it carries exactly one item, below the form**
(Doppler's "75B+ secrets read every month"; Railway's "All systems operational"). Never a grid of
tiles.

**H. The credible proof formats, in order:** (1) a number with a unit, a time window and a hedge
("99.999% *historical* uptime"); (2) a named customer attached to a delta ("90% reduction in internal
support requests" — Instacart); (3) a checkable third-party figure (GitHub stars, G2 score);
(4) a logo wall of recognisable names in your own category. **The cheap ones:** percentages with no
baseline ("95% reduction in exposed attack surface"), "100%" of anything, superlatives without a
referent ("the best…"), and money figures with no unit ("saved hundreds of thousands").

---

## 4. Patterns worth stealing — 22 one-line instructions

1. Set the sign-in headline at **18–20px / 500**, not 32px+ and never bold. — *Linear (18px), Tailscale (20px)*
2. Make the auth content column **288–352px** wide and centre it; delete the marketing panel. — *Linear 288, Vercel 320*
3. Size every auth control at **40px tall with a 16px gap** (56px pitch) and make them all the same width as the column. — *Vercel [measured]*
4. Put the **email field first, as the only filled button**, then federated methods, then SSO, then the exotic ones behind "Show other options". — *Vercel*
5. Hide the long tail of auth methods behind one text link rather than showing six buttons. — *Vercel "Show other options"*
6. Give the sub-line under the headline a **consequence**, not a boast: tell the user what the choice they're about to make will mean. — *Tailscale, "You'll use this provider to log in to your network"*
7. Put **exactly one true fact** at the bottom of the sign-in page, full width, below the form. — *Doppler "75B+ secrets read every month"; Railway "All systems operational"*
8. Derive secondary and tertiary text from the ink colour at **70% and 40% alpha** instead of introducing new greys. — *Chainguard*
9. Pair an **uppercase mono micro-label at +6% tracking and 40% ink** above a **large numeral at 100% ink** for anything that was counted. — *Chainguard stat grid*
10. Keep `border-radius` at **0–4px** on primary controls; anything rounder reads consumer. — *Chainguard (0px)*
11. Set the marketing headline at **−0.03em letter-spacing and line-height 0.95–1.00**. — *Chainguard −3%/1.00, Vanta −3%/0.95, Vercel −0.03em*
12. Use a **light weight (300) at large size** for authority instead of a heavy weight. — *Vanta 88px/300*
13. Cap the headline at **3–7 words** and let it wrap to ~22 characters per line. — *Vanta (3), Oso (6), Boundary (5), Resend (7)*
14. Hold body measure to **55–67 characters**. — *cross-cutting [est.]*
15. Leave **17–29% of the viewport empty above the first word**. — *cross-cutting [measured]*
16. Name features as **bare noun phrases describing a mechanism**, never as adjectives of praise. — *Teleport: "Ephemeral Privileges", "Session Recording and Playback"*
17. Use the construction **"X enforced through Y"** to turn every claim into a mechanism. — *1Password: "Zero standing privilege enforced through just-in-time… access"*
18. Replace security adjectives with the **actual algorithm and version**. — *Infisical: "AES-256-GCM at rest and TLS 1.2 minimum in transit"*
19. Attach a **hedge word** to every strong metric ("historical", "tamper-resistant", "probably"). — *Stripe, Sigstore, Linear*
20. Describe an evidence chain with **three past-participle verbs and no adjectives**. — *Sigstore: "Signed / Associated / Witnessed"*
21. Write error copy as **state + next action, no apology and no blame**. — *Stripe: "The card has expired. Check the expiration date or use a different card."*
22. Attribute every percentage to a **named customer and a baseline**, or delete it. — *Instacart "90% reduction in internal support requests" vs. Teleport's unattributed "95% reduction in exposed attack surface"*

---

## 5. Proposed direction for the AEGIS sign-in page

### 5.1 The four problems with the current page

Read against everything above, `frontend/components/sign-in/sign-in-view.tsx` has four distinct
failures, in order of how much they cost us with a cold judge:

1. **It is a marketing hero bolted to a login form.** A 7/12-column brand panel with a 48–60px
   `font-extrabold` headline, an animated technical background, a radial `--sovereign` glow and a
   pulsing status dot. None of the four best auth pages in this sweep has *any* of those five things.
   The glow and the pulse in particular are the exact visual register of a crypto landing page.
2. **It advertises Firebase and Google on the sign-in screen of an air-gapped product.** "Firebase
   Auth" as a labelled tab, and a Google SSO button with the four-colour Google `<svg>` inline, sit
   about 200px below the words "AIR-GAPPED 127.0.0.1". A judge who notices this — and a good one
   will — stops believing the rest of the page. This is not a styling problem; it is a **credibility
   contradiction**, and it is the single highest-severity item in this document.
3. **It overclaims in the footer.** "Default-Deny Policy · 127.0.0.1:8000 · Zero Outbound Egress" is
   printed before a session exists. The file's own comment already establishes the right principle
   ("Nothing on this screen is measured") and then the footer violates it two lines later.
4. **Mono uppercase is used for ordinary field labels.** "EMAIL ADDRESS" and "PASSWORD" in Geist Mono
   at 10px with 0.16em tracking is costume. Mono should be reserved for *machine values* — hosts,
   hashes, build ids, event ids. When everything is mono, nothing is.

Also: "SELECT WORKBENCH CLEARANCE LEVEL" and "Authorize & Enter as Engineer" are Drata sentences.

### 5.2 The direction

**Centred single column, no split, no card, no background art.** Page ground `#f7f7f5`. The **only**
`#ffffff` on the page is the input fields — which makes the two things the user must touch the
brightest objects on screen, and gives the warm-paper palette a job rather than a mood. One hairline
rule at `#dcdad6` under the header block. Radius 4px everywhere. Geist Sans for language, Geist Mono
only for the four machine facts. No status colour appears until a real state exists.

Local credentials are the only promoted path. The demo-persona selector survives — it is genuinely
needed for the hackathon — but it is demoted below a divider, labelled as an evaluation affordance,
and it stops using the word "clearance". Firebase/Google is removed from the UI entirely; if the
build still needs it, it lives behind `?dev=1`, not on the screen a judge sees.

### 5.3 ASCII layout — 1440 × 900, content column 352px centred (x = 544 → 896)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  #f7f7f5                                                                     │
│                                                                              │
│                              ← 196px empty →                                 │
│                                                                              │
│                    ┌────────────────────────────────┐  352px                 │
│                    │  ◆ AEGIS                       │  mark 20px + wordmark  │
│                    │                                │  16px/500, ls -0.01em  │
│                    │  ── 24px ──                    │                        │
│                    │  Sign in                       │  20px / 500 / lh 28    │
│                    │                                │  ls -0.01em / #0a0a0a  │
│                    │  This workbench runs on the    │  13px / 400 / lh 20    │
│                    │  machine in front of you.      │  #5f5b57  (48 chars)   │
│                    │                                │                        │
│                    │ ──────────────────────────────  1px #dcdad6, 24px below │
│                    │                                │                        │
│                    │  Email                         │  12px / 500 / #5f5b57  │
│                    │  ┌──────────────────────────┐  │  Geist SANS, not mono  │
│                    │  │ operator@site.local      │  │  352 × 40, bg #ffffff  │
│                    │  └──────────────────────────┘  │  1px #dcdad6, r4, 14px │
│                    │                                │  ── 16px ──            │
│                    │  Password        Forgot?       │  label left, link right│
│                    │  ┌──────────────────────────┐  │  "Forgot?" 12px #5f5b57│
│                    │  │ ••••••••••          [👁]  │  │  352 × 40              │
│                    │  └──────────────────────────┘  │                        │
│                    │                                │  ── 20px ──            │
│                    │  ┌──────────────────────────┐  │  352 × 40, r4          │
│                    │  │        Sign in           │  │  #0a0a0a / #f7f7f5     │
│                    │  └──────────────────────────┘  │  13px / 500            │
│                    │                                │                        │
│                    │  ───────── or ──────────────   │  hairline + 10px mono  │
│                    │                                │  "OR" ls .14em #8a8783 │
│                    │  ┌──────────────────────────┐  │  352 × 40, r4          │
│                    │  │  Continue as a sample    │  │  transparent fill,     │
│                    │  │  role  ›                 │  │  1px #dcdad6, #0a0a0a  │
│                    │  └──────────────────────────┘  │  13px / 500            │
│                    │  For evaluation. No data is    │  11px / 400 / #8a8783  │
│                    │  written to the audit log.     │                        │
│                    └────────────────────────────────┘                        │
│                                                                              │
│                              ← 72px empty →                                  │
│                                                                              │
│       Every action in this workbench is written to an append-only log.       │
│                        13px / 400 / #5f5b57 / centred                        │
│                                                                              │
│       AEGIS 0.9.3  ·  api 127.0.0.1:8000  ·  build 4f2c1a9  ·  offline       │
│            11px Geist Mono / ls +0.06em / #8a8783 / centred                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Vertical rhythm, top of column to bottom: logo → 24 → `h1` → 8 → sub → 24 → rule → 24 → email
label/field → 16 → password label/field → 20 → primary → 24 → divider → 24 → secondary → 8 →
secondary caption → 72 → proof line → 16 → mono strip. Total column height ≈ 508px, so on a 900px
viewport it sits with ≈196px above [derived; matches the 17–29% band observed].

### 5.4 Why each piece is there, and what it is stolen from

| Piece | Source | Rationale |
|---|---|---|
| Centred 352px column, no panel | Linear 288 / Vercel 320 | Four of the best auth pages have no second column. 352 because Geist Mono's build strip needs ~44 chars. |
| `h1` 20px / 500 "Sign in" | Linear 18px, Tailscale 20px | The demotion *is* the taste signal. Two words. Not "Sign in to Aegis" — the wordmark is directly above it. |
| Sub-line "This workbench runs on the machine in front of you." | Tailscale's consequence sub-line | Literally true, unglamorous, and says the one thing that differentiates us. 48 chars. |
| Only the inputs are `#ffffff` | Vercel's ground/field contrast | Gives the second neutral a function. Nothing else on the page needs to be white. |
| Field labels in **Geist Sans 12px/500**, not mono | Chainguard's mono discipline | Mono is reserved for machine values so it still means something when it appears. |
| Focus ring: border→`#0a0a0a`, 3px `rgba(10,10,10,0.08)` halo | Vercel/Linear | Ink-only focus; no accent hue. Also satisfies the "focus states are the thing that reads unfinished" point from the login-design surveys. |
| Primary `#0a0a0a` on `#f7f7f5`, 352×40, r4 | Vercel's black primary | One filled button on the page. |
| Divider hairline + `OR` in 10px mono +0.14em | Doppler's `or`, Chainguard's tracking | The only decorative use of mono, and it is a label on a structural break. |
| Demo roles demoted below the divider | — | Keeps the hackathon affordance without letting it read as the product's auth model. |
| Caption "For evaluation. No data is written to the audit log." | Sigstore's hedging | Pre-empts the judge question "so is the audit trail fake?" by answering it before it is asked. Only ship this sentence if it is true. |
| One proof line, 13px, below the form | Doppler's single bottom stat | "Every action in this workbench is written to an append-only log." — a fact about the build, not a measurement of the host. Passes the file's own existing standard. |
| Mono build strip, 11px, +0.06em, 40%-ink grey | Chainguard's `roobertSemiMono` labels | Four build-time facts. `offline` only if it can be derived at build time; otherwise drop that token. |
| No glow, no pulse, no animated grid | Vanta / Linear / Vercel | Nothing in the credible set animates on an auth screen. |

### 5.5 Error and loading states

Follow Stripe's diagnostic pattern: **state, then next action, no apology.**

- **Field-level:** field border → `var(--critical)`, plus 12px `#dc2626` text directly beneath the
  field, 4px gap. Never a modal, never a toast.
- **Form-level (bad credentials):** a single 12px line above the primary button reading
  **"Email or password is incorrect."** — one message for both fields (never reveal which was wrong),
  present tense, no "Authentication failed", no exclamation, no "Oops".
- **Locked out:** **"Too many attempts. Try again in 5 minutes."** — Stripe shape exactly: what
  happened, what to do, when.
- **Backend unreachable:** **"Can't reach the API at 127.0.0.1:8000."** with the host in Geist Mono.
  This is the one error where naming the machine fact is the most useful thing we can do.
- **Loading:** button label swaps to **"Signing in…"** (not "Authenticating…" — nobody says that out
  loud), button stays the same width so the layout does not jump, spinner at 14px inside the button.
- **Optional, only if the backend returns it:** after a failed attempt, a 11px mono line
  **"Recorded · evt_7f3c9a2"**. This is the single most on-brand detail available to us — a product
  whose thesis is "everything is auditable" proving it on the failure path, before you are even
  logged in. Ship it only if the id is real. If it is not real, ship nothing.

### 5.6 The first sixty seconds after sign-in — three notes for whoever owns the landing state

- Land on **one answered question with its citations already expanded**, not an empty prompt box.
  Sourcegraph's hero uses a real query result (*"31 files referencing User across 7 layers"*) rather
  than a feature list, and it is the most convincing thing on their page.
- The posture figures the sign-in page is (correctly) forbidden from claiming — resident models,
  egress counters, audit-chain head — belong **here**, in Chainguard's stat-grid form: mono +6%
  uppercase label at 40% ink over a 40px numeral. That is where "audited" gets to look audited,
  because by then the numbers come from the API and can be wrong.
- Give the three-verb chain a physical home: a **Cited / Checked / Recorded** strip on the answer
  card, where each word is a link to the thing itself (the source span, the policy rule, the log
  entry). Sigstore's credibility comes from the fact that each of its three verbs names a system you
  can go and inspect.

---

## 6. Microcopy rewrite table

Left column: current AEGIS strings (from `sign-in-view.tsx` and the product brief) plus the general
pattern. Right column: the replacement, with the observed source for the register.

### 6.1 Sign-in screen

| Overclaiming / off-register | Calmer replacement | Register borrowed from |
|---|---|---|
| "Air-gapped access terminal for confidential plant operations." | "This workbench runs on the machine in front of you." | Tailscale, "You'll use this provider to log in to your network" |
| "SESSION AUTHENTICATION" (mono eyebrow) | *(delete — the `h1` already says it)* | Linear, Vercel: no eyebrow on auth |
| "Sign in to Aegis" under an AEGIS wordmark | "Sign in" | Linear "Log in to Linear" is the *whole* page; ours is redundant with the mark |
| "Default-Deny Policy · 127.0.0.1:8000 · Zero Outbound Egress" | "AEGIS 0.9.3 · api 127.0.0.1:8000 · build 4f2c1a9" | Railway's "All systems operational" — only build-time facts on a pre-session screen |
| "AIR-GAPPED 127.0.0.1" (pulsing pill) | *(delete the pill; move the host into the mono build strip)* | file's own comment: "Nothing on this screen is measured" |
| "SELECT WORKBENCH CLEARANCE LEVEL" | "Demo roles" | Teleport's bare noun phrases |
| "Authorize & Enter as Engineer" | "Continue as Engineer" | Vercel/Linear "Continue with …" |
| "Sign In with Firebase" | "Sign in" | Vercel: the primary button says the action, not the vendor |
| "Authenticating…" | "Signing in…" | Stripe: write what a person would say |
| "Authentication failed" | "Email or password is incorrect." | Stripe, "The card has expired." |
| "Invalid email address or password." | "Email or password is incorrect." | same; present tense, no "invalid" |
| "Account created successfully! Please sign in with your email and password." | "Account created. Sign in to continue." | Stripe: state, then next action; drop "successfully" and the "!" |
| "Password should be at least 6 characters." | "Use at least 6 characters." | Google/Stripe imperative form |
| "An account with this email already exists. Please sign in." | "That email already has an account. Sign in instead." | drop "Please" — it is an apology for the user's action |
| "Firebase Auth" / "Demo Persona" (tab pair) | *(remove the tab pair; local credentials are the page, demo roles are a link below the divider)* | Vercel's "Show other options" progressive disclosure |

### 6.2 Product and landing copy

| Overclaiming | Calmer replacement | Register borrowed from |
|---|---|---|
| "immutable audit logs" | "append-only audit log" / "tamper-evident audit log" | Sigstore, "tamper-resistant public log" — never "immutable" |
| "never leave your physical premises" | "stay on the machine you install this on" | Baseten, "right in your own VPCs" |
| "Confidential industrial AI workbench." | "An on-premise AI workbench for regulated industrial work." | Resend, "Resend is the email API for developers." |
| "ON-PREMISE AGENTIC AI" (mono eyebrow) | "On-premise AI workbench" (sentence case) | Chainguard reserves uppercase mono for *data labels*, not slogans |
| "every AI output is evidence-backed, policy-gated, human-approved and auditable" | "Every answer is **cited** to its sources, **checked** against your policy, and **recorded**." | Sigstore, "Signed / Associated / Witnessed" |
| "guaranteed" (anywhere) | "enforced by the policy engine" | 1Password, "enforced through just-in-time… access" |
| "military-grade encryption" / "bank-grade security" | "AES-256-GCM at rest, TLS 1.2 minimum in transit" | Infisical, verbatim construction |
| "100% auditable" | "Every approved action writes one log entry." | Teleport's own "100% auditable agentic workflow" is the counter-example — don't copy it |
| "Zero Outbound Egress" | "No outbound network calls are configured in this build." | Stripe's "*historical* uptime" — hedge to the thing you actually measured |
| "Sovereignty Posture" | "Deployment" | Teleport: name the mechanism, not the virtue |
| "Enterprise-grade" | *(delete; name the specific feature — SAML, SCIM, audit export)* | WorkOS lists "Enterprise SSO", "Directory Sync (SCIM)", "Audit Logs" instead |
| "Revolutionary / seamless / best-in-class / cutting-edge" | *(delete on sight)* | Stripe: these words appear zero times across their site |
| "Unlock the power of…" / "Transform your…" | *(delete; start the sentence with the noun)* | Drata's "Explore the World of Agentic Trust" is what this becomes at scale |
| "Trusted by leading manufacturers" (unattributed) | *(delete until a customer lets us name them)* | Teleport's named logo wall is credible precisely because the names are checkable |
| "99.9% accurate" | "On our 240-question evaluation set, 94% of answers cited the correct span." | Stripe's number-with-a-unit-and-a-window discipline |
| CTA "Get Started Now!" | "Get started" / "Talk to us" | Stripe: lowercase verb-plus-object, no exclamation marks |

### 6.3 Voice examples worth keeping on the wall

**The register we want:**

- "Trust is everything" — Vanta
- "Simple and secure remote access. Securely access any system from anywhere based on user identity." — HashiCorp Boundary
- "Signed. Associated. Witnessed." — Sigstore
- "Resend is the email API for developers." — Resend
- "Faster engineering. Resilient infrastructure." — Teleport
- "Your employees ignore 96% of their permissions. Agents won't." — Oso
- "The bill goes to zero when nobody's home." — Fly.io
- "The card has expired. Check the expiration date or use a different card." — Stripe
- "You'll probably build a better product…" — Linear (note "probably")

**The register we are currently in:**

- "Explore the World of Agentic Trust" — Drata
- "Transmit AI-Fueled Customer Assurance" — Drata
- "Engage Compliance Autopilot" — Drata
- "Proof? We've got proof." — Vanta (their one slip)
- "100% auditable agentic workflow" — Teleport (their one slip)
- "Authorize & Enter as Engineer" — **AEGIS**
- "SELECT WORKBENCH CLEARANCE LEVEL" — **AEGIS**

---

## 7. Sources

Captured 2026-09-21.

- Linear — https://linear.app/ , https://linear.app/login
- Vercel — https://vercel.com/login
- Tailscale — https://tailscale.com/ , https://login.tailscale.com/start
- Doppler — https://www.doppler.com/ , https://dashboard.doppler.com/login
- Chainguard — https://www.chainguard.dev/
- Vanta — https://www.vanta.com/ (app.vanta.com/auth/login redirected; sign-in not captured)
- Sigstore — https://docs.sigstore.dev/ (www.sigstore.dev returned a client-rendered shell)
- Teleport — https://goteleport.com/ , https://goteleport.com/docs/
- Stripe — https://stripe.com/ ; voice notes corroborated via https://technicalwriterhq.co/12-tips-you-can-learn-from-stripes-documentation-portal-8da41b37f85e and https://stripe.com/resources/more/how-to-write-key-messages-for-a-startup
- Drata — https://drata.com/
- Anthropic — https://www.anthropic.com/
- Modal — https://modal.com/
- Fly.io — https://fly.io/
- Oso — https://www.osohq.com/
- HashiCorp Vault — https://www.hashicorp.com/en/products/vault
- HashiCorp Boundary — https://developer.hashicorp.com/boundary
- Infisical — https://infisical.com/
- 1Password — https://1password.com/ (1password.com/sign-in returns 404)
- Sourcegraph — https://sourcegraph.com/
- Baseten — https://www.baseten.co/
- Clerk — https://clerk.com/
- WorkOS — https://workos.com/ , https://workos.com/blog (marketing homepage served docs index to the fetcher)
- Railway — https://railway.com/login
- Resend — https://resend.com/ (served llms.txt)
- Cloudflare — https://www.cloudflare.com/ (resolved to the Workers page; not used for conclusions)
- Login-design surveys consulted for the credential-vs-SSO ordering convention — https://blog.logrocket.com/ux-design/login-screen-design-examples/ , https://www.eleken.co/blog-posts/login-page-examples
