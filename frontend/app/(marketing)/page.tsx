import { ArrowUpRight } from 'lucide-react'
import { ChainCard } from '@/components/landing/chain-card'
import { CommandBlock } from '@/components/landing/command-block'
import { DisplayHeading } from '@/components/landing/display-heading'
import { CHAIN, HERO, LIMITS, PREMISE, PROOF, RUN, RUN_IT } from '@/components/landing/copy'
import { HeroField } from '@/components/landing/hero-field'
import { LandingButton } from '@/components/landing/landing-button'
import { LimitList } from '@/components/landing/limit-list'
import { LiveContainment } from '@/components/landing/live-containment'
import { MachineBlock } from '@/components/landing/machine-block'
import { Reveal } from '@/components/landing/reveal'
import { ScrollRevealText } from '@/components/landing/scroll-reveal-text'
import { ProductShot } from '@/components/landing/product-shot'
import { RunReceipt } from '@/components/landing/run-receipt'
import { receiptRows, runId, run } from '@/components/landing/run-fixture'
import { SectionShell } from '@/components/landing/section-shell'
import { StageTable } from '@/components/landing/stage-table'
import { CARD, MONO_LABEL, MONO_VALUE, PROSE, SHELL } from '@/components/landing/tokens'

/**
 * The public page at `/`.
 *
 * A server component. The only client components it mounts are the header
 * (which reads session state for one label), LiveContainment (the page's single
 * fetch), CommandBlock (clipboard) and Reveal (one IntersectionObserver). The
 * hero itself is static and does not animate: nothing credible in this category
 * animates above the fold, and a headline that fades in is the clearest single
 * tell of a template.
 */
export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* 01 — Hero                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden pb-16 pt-12 md:pb-20 md:pt-[88px] lg:pt-[128px]"
      >
        {/*
          Two ambient layers, both aria-hidden and both cheap: a 1px dot
          field and one very soft warm pool behind the headline. Neither
          animates and neither carries meaning — this is texture, so that
          the page has a surface rather than being a white void, which is
          the difference between "restrained" and "unfinished".
        */}
        {/*
          The chain, building. Replaces a static dot grid: the page argued
          that every record commits to the one before it while nothing on it
          moved. Masked hard at the edges so it never competes with the
          headline sitting on top of it, and it renders nothing at all under
          prefers-reduced-motion.
        */}
        <HeroField
          // z-0, not -z-10.
          //
          // A negative z-index child paints behind the background of its
          // nearest ancestor that has one, and the app shell sets an opaque
          // rgb(16,14,11). So everything here at -z-10 -- this field, and the
          // dot grid and radial pool that preceded it -- was rendering
          // perfectly and being covered by the page's own background. The
          // gradients were invisible for as long as they have existed.
          //
          // Bounded to the headline band: the hero is 1655px tall because it
          // carries the product shot and the receipt below the fold, so a
          // full-height canvas put the chain at y=860, behind the screenshot
          // and off the first screen.
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[560px] w-full"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-18%] -z-10 h-[520px] w-[min(900px,100vw)] -translate-x-1/2"
          /* Clamped to the viewport. At 900px fixed it made the hero 638px
             wide inside a 375px screen -- clipped by overflow-hidden, so
             nothing escaped, but the section still laid out and painted
             263px of pool that could never be seen. */
          style={{
            background:
              'radial-gradient(closest-side, oklch(0.92 0.02 84.57 / 0.55), transparent)',
          }}
        />

        <div className={`${SHELL} relative z-10`}>
          {/*
            Centred, not left-aligned.

            Left-aligned, the hero filled the leftmost 640px of the viewport
            and the entire right half was empty. Asymmetry reads as a choice
            only when something holds the other side; with nothing there it
            reads as a page that failed to finish loading. The references this
            page was measured against centre their heroes, and it costs
            nothing here: the type is unchanged, only its axis.
          */}
          <div className="flex flex-col items-center text-center">
            <DisplayHeading
            id="hero-title"
            as="h1"
            scale="hero"
            lead={HERO.headline}
            turn={HERO.headlineTurn}
          />

          <p className="mt-4 max-w-[54ch] text-heading tracking-[-0.008em] text-foreground-secondary md:mt-5 md:text-[18px] md:leading-[28px] md:tracking-[-0.011em]">
            {HERO.sub}
          </p>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:gap-3 md:mt-8">
            <LandingButton href={HERO.primary.href} variant="primary" size="lg" blockOnMobile className="sm:h-10 sm:text-body">
              {HERO.primary.label}
            </LandingButton>
            <LandingButton
              href={HERO.secondary.href}
              variant="outline"
              size="lg"
              blockOnMobile
              rel="noreferrer"
              target="_blank"
              className="sm:h-10 sm:text-body"
            >
              {HERO.secondary.label}
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </LandingButton>
          </div>

          {/*
            Selectable text, not just a link. It survives an offline demo where
            the href does not resolve, and it is the one place on the page where
            a mono string is doing exactly the job mono is for.
          */}
          <p className={`${MONO_VALUE} mt-4 hidden break-all md:block`}>{HERO.repoPath}</p>
          </div>

          {/*
            The product first, then the paperwork that proves it ran. A page
            arguing you should not take its word for anything ought to show
            the thing before it shows the receipt.
          */}
          <ProductShot
            caption="The console after a real run on this host. The answer is withheld until claim verification finishes, and this one did not pass: three checks of four, so it was held for a reviewer rather than released. The work log folds to a line once the run is over and opens again if you want to audit it."
            facts={['held for review', '3 of 4 checks passed', '195.2s', 'qwen2.5:3b · local']}
          />

          <RunReceipt
            className="mt-10 md:mt-12"
            runId={runId}
            capturedOn={run.captured_on}
            rows={receiptRows}
            caption={HERO.receiptCaption}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 02 — The premise                                                  */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={PREMISE.id}
        density="tight"
        index={PREMISE.index}
        eyebrow={PREMISE.eyebrow}
        title={PREMISE.title}
        titleTurn={PREMISE.titleTurn}
        lede={PREMISE.lede}
      >
        <Reveal>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12 lg:gap-20">
            <div className={`${CARD} p-5`}>
              <span className={MONO_LABEL}>{PREMISE.solved.label}</span>
              <p className="mt-3 text-answer text-foreground">{PREMISE.solved.body}</p>
            </div>

            <div className={`${CARD} p-5`}>
              <span className={MONO_LABEL}>{PREMISE.open.label}</span>
              <ul className="mt-3 flex list-none flex-col gap-2.5 p-0">
                {PREMISE.open.items.map((item) => (
                  <li key={item} className="text-body leading-[22px] text-foreground-secondary">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/*
            The one sentence on the page that earns a scroll-linked effect:
            it is the claim the whole product rests on. Words reach full ink
            as the line is scrolled through, and the sentence is legible at
            every position including the first frame -- what changes is the
            weight of the ink, never whether the words are there.
          */}
          <ScrollRevealText
            text={PREMISE.closing}
            className={`mt-10 text-heading md:text-[18px] md:leading-[28px] ${PROSE}`}
          />
        </Reveal>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* 03 — Cited. Checked. Recorded.                                    */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={CHAIN.id}
        index={CHAIN.index}
        eyebrow={CHAIN.eyebrow}
        title={CHAIN.title}
        titleTurn={CHAIN.titleTurn}
        lede={CHAIN.lede}
        tone="surface"
      >
        {/*
          Four explicit rows, and each card is a subgrid spanning them, so
          heading sits level with heading and artifact with artifact across
          all three.

          Before this they were three independent flex columns. The cards
          stretched to equal height and the artifact was pushed down with
          mt-auto, which bottom-aligned three blocks of unequal height --
          281px, 221px and 181px -- so their header bars landed 100px apart
          and a row meant to read as one set read as a mistake.

          The Reveal wrapper is gone from between the grid and the cards:
          subgrid needs the card to be the grid item, and an element in
          between breaks the row inheritance. The lift moves onto the card
          itself, so the motion survives.
        */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8 md:[grid-template-rows:auto_auto_1fr_auto]">
          {CHAIN.cards.map((card, i) => (
            <Reveal key={card.verb} step={i === 0 ? 0 : i === 1 ? 1 : 2} className="contents">
              <ChainCard
                className="w-full min-w-0 md:row-span-4 md:grid md:grid-cols-1 md:grid-rows-subgrid md:gap-5"
                index={card.index}
                verb={card.verb}
                mechanism={card.mechanism}
                body={card.body}
                artifact={
                  <MachineBlock label={card.artifact.label} source={card.artifact.source}>
                    {card.artifact.lines.join('\n')}
                  </MachineBlock>
                }
              />
            </Reveal>
          ))}
        </div>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* 04 — One run, end to end                                          */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={RUN.id}
        density="tight"
        index={RUN.index}
        eyebrow={RUN.eyebrow}
        title={RUN.title}
        titleTurn={RUN.titleTurn}
        lede={RUN.lede}
      >
        <Reveal>
          <StageTable stages={[...RUN.stages]} />
          <p className={`mt-6 text-body leading-[22px] text-foreground-secondary ${PROSE}`}>
            {RUN.closing}
          </p>
        </Reveal>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* 05 — Check it yourself                                            */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={PROOF.id}
        density="full"
        index={PROOF.index}
        eyebrow={PROOF.eyebrow}
        title={PROOF.title}
        titleTurn={PROOF.titleTurn}
        lede={PROOF.lede}
        tone="surface"
      >
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Cell 1 — the audit chain */}
          <Reveal className="flex">
            <section aria-labelledby="proof-chain" className="flex w-full flex-col gap-4">
              <h3 id="proof-chain" className="text-heading font-medium text-foreground">
                {PROOF.chain.label}
              </h3>
              <MachineBlock
                className="flex-1"
                label={PROOF.chain.label}
                source={PROOF.chain.source}
                caption={PROOF.chain.caption}
              >
                {PROOF.chain.lines.join('\n')}
              </MachineBlock>
            </section>
          </Reveal>

          {/* Cell 2 — a policy that refuses */}
          <Reveal step={1} className="flex">
            <section aria-labelledby="proof-policy" className="flex w-full flex-col gap-4">
              <h3 id="proof-policy" className="text-heading font-medium text-foreground">
                {PROOF.policy.label}
              </h3>
              <MachineBlock label={PROOF.policy.label} source={PROOF.policy.source}>
                {PROOF.policy.lines.join('\n')}
              </MachineBlock>
              <MachineBlock
                className="flex-1"
                label={PROOF.sandbox.label}
                source={PROOF.sandbox.source}
                caption={PROOF.sandbox.caption}
              >
                {PROOF.sandbox.lines.join('\n')}
              </MachineBlock>
            </section>
          </Reveal>

          {/* Cell 3 — containment, read live */}
          <Reveal step={2} className="flex">
            <section aria-labelledby="proof-containment" className="flex w-full flex-col gap-4">
              <h3 id="proof-containment" className="text-heading font-medium text-foreground">
                {PROOF.containment.label}
              </h3>
              <LiveContainment />
              <p className="text-body leading-[20px] text-foreground-secondary">
                {PROOF.containment.caption}
              </p>
              <figure className="m-0 border-l border-border-strong pl-4">
                <blockquote className="m-0 text-body leading-[22px] text-foreground">
                  “{PROOF.containment.quote}”
                </blockquote>
                <figcaption className={`${MONO_VALUE} mt-2`}>
                  — {PROOF.containment.quoteSource}
                </figcaption>
              </figure>
            </section>
          </Reveal>

          {/* Cell 4 — this page */}
          <Reveal step={2} className="flex">
            <section aria-labelledby="proof-page" className="flex w-full flex-col gap-4">
              <h3 id="proof-page" className="text-heading font-medium text-foreground">
                {PROOF.page.label}
              </h3>
              <MachineBlock
                className="flex-1"
                label={PROOF.page.label}
                source={PROOF.page.source}
                caption={PROOF.page.caption}
                wrap
              >
                {PROOF.page.lines.join('\n')}
              </MachineBlock>
            </section>
          </Reveal>
        </div>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* 06 — What this is not                                             */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={LIMITS.id}
        index={LIMITS.index}
        eyebrow={LIMITS.eyebrow}
        title={LIMITS.title}
        titleTurn={LIMITS.titleTurn}
        lede={LIMITS.lede}
      >
        <Reveal>
          <LimitList items={[...LIMITS.items]} />
        </Reveal>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* 07 — Run it                                                       */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={RUN_IT.id}
        density="tight"
        index={RUN_IT.index}
        eyebrow={RUN_IT.eyebrow}
        title={RUN_IT.title}
        lede={RUN_IT.lede}
        tone="surface"
      >
        <Reveal>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[3fr_2fr]">
            <CommandBlock label="Terminal" lines={[...RUN_IT.commands]} />
            <dl className="m-0 flex flex-col gap-6">
              {RUN_IT.facts.map((fact) => (
                <div key={fact.label}>
                  <dt className={MONO_LABEL}>{fact.label}</dt>
                  <dd className="m-0 mt-1.5 text-body leading-[20px] text-foreground">
                    {fact.line}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </SectionShell>
    </>
  )
}
