import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { atomAt, parseLexemes } from '@/components/landing/audit-hash'
import { ChainAppend } from '@/components/landing/chain-append'
import { ChainCard } from '@/components/landing/chain-card'
import { CitationInspector, type InspectorSource } from '@/components/landing/citation-inspector'
import { CommandBlock } from '@/components/landing/command-block'
import {
  ANSWER,
  CHAIN,
  HERO,
  LIMITS,
  PREMISE,
  PROOF,
  RUN,
  RUN_IT,
  SCREENSHOT_TASK_ID,
  type Rich,
} from '@/components/landing/copy'
import { DisplayHeading } from '@/components/landing/display-heading'
import { EvidenceUnit } from '@/components/landing/evidence-unit'
import { HashChain } from '@/components/landing/hash-chain'
import { HeroField } from '@/components/landing/hero-field'
import { LandingButton } from '@/components/landing/landing-button'
import { LimitList } from '@/components/landing/limit-list'
import { LiveContainment } from '@/components/landing/live-containment'
import { MachineBlock } from '@/components/landing/machine-block'
import { PremiseLedger, Value, type LedgerEntry } from '@/components/landing/premise-ledger'
import { ProductShot } from '@/components/landing/product-shot'
import { Reveal } from '@/components/landing/reveal'
import { RunReceipt } from '@/components/landing/run-receipt'
import {
  documentCode,
  documentTitle,
  receiptRows,
  run,
  runId,
  seconds,
  sectionLabel,
  sectionNumber,
  clock,
  type EvidenceUnit as Unit,
} from '@/components/landing/run-fixture'
import { RunTimeline, type TimelineSegment } from '@/components/landing/run-timeline'
import { ScrollRevealText } from '@/components/landing/scroll-reveal-text'
import { SectionShell } from '@/components/landing/section-shell'
import { SelfTest } from '@/components/landing/self-test'
import { StageTable, type StageReading } from '@/components/landing/stage-table'
import { CARD, MONO_LABEL, MONO_VALUE, PROSE, SHELL } from '@/components/landing/tokens'
import { VerificationReport } from '@/components/landing/verification-report'
import { cn } from '@/lib/utils'

// --------------------------------------------------------------------------- //
// The run, read once.
//
// Every figure below comes from public/landing/run.json and is derived here, on
// the server, at render. Nothing is defaulted to a number: a value the record
// does not carry comes out as null, and the section that would have printed it
// prints less. Client components receive only the slices they draw.
// --------------------------------------------------------------------------- //

/** The picture and the record are the same run. Compared, not assumed. */
const isScreenshotRun = run.task_id === SCREENSHOT_TASK_ID
/** The page's hand-written reading applies to one run and is dropped for any other. */
const annotation = run.task_id === ANSWER.annotation.taskId ? ANSWER.annotation : null

const checks = run.verification?.checks ?? []
const passedChecks = checks.filter((check) => check.passed).length
const checksFact = checks.length > 0 ? `${passedChecks} of ${checks.length} checks passed` : null
const durationFact = seconds(run.duration_ms)
const modelStage = run.timeline.stages.find((stage) => stage.model !== null)
const modelName = modelStage?.model ?? run.models[0] ?? null
const modelLabel = modelName ? [modelName, modelStage?.model_version].filter(Boolean).join(' ') : null

type Tone = 'held' | 'released' | 'refused' | 'other'
const outcome: { label: string; tone: Tone } =
  run.status === 'awaiting_approval'
    ? { label: ANSWER.outcome.held, tone: 'held' }
    : run.status === 'approved' || run.status === 'completed'
      ? { label: ANSWER.outcome.released, tone: 'released' }
      : run.status === 'rejected'
        ? { label: ANSWER.outcome.refused, tone: 'refused' }
        : { label: run.status, tone: 'other' }

const shotFacts = isScreenshotRun
  ? [outcome.tone === 'held' ? HERO.shotHeld : null, checksFact, durationFact, modelLabel].filter(
      (fact): fact is string => Boolean(fact),
    )
  : []

// Passages, in the order the answer first cites them.
const markers = Array.from(new Set((run.answer.match(/\[[SFVCE]\d+\]/g) ?? []).map((m) => m.slice(1, -1))))
const citedUnits = markers
  .map((id) => run.evidence.find((unit) => unit.id === id))
  .filter((unit): unit is Unit => unit !== undefined)
const retrievalMode = run.retrieval?.mode ?? null
// "similarity" is only true of an embedding search, where the score is a
// cosine similarity (backend/rag/knowledge_base.py). A lexical search scores
// with normalised BM25, and is labelled plainly as a score.
const scoreLabel = retrievalMode === 'embedding' ? ANSWER.labels.similarity : ANSWER.labels.score

const sources: InspectorSource[] = run.evidence.map((unit) => ({
  id: unit.id,
  rank: unit.rank,
  cited: unit.cited,
  code: documentCode(unit),
  section: sectionLabel(unit),
  title: documentTitle(unit),
  score: unit.score,
  classification: unit.classification,
  excerpt: unit.excerpt,
}))

/** A sentence with values in it, values set in mono. */
function rich(parts: Rich): ReactNode {
  return parts.map((part, i) => (typeof part === 'string' ? part : <Value key={i}>{part.v}</Value>))
}

// The premise ledger: five questions, five readings of the record.
const modelCalls = run.policy_events.filter((event) => event.action === 'model.invoke')
const refusedCalls = modelCalls.filter((event) => event.decision !== 'allow').length
const calculation = checks.find((check) => check.name === 'calculation_verification')
const approval = run.approval
const [holdRule = '', ...holdReason] = (approval.reasons[0] ?? '').split(': ')

const authorised: Pick<LedgerEntry, 'answer' | 'state'> =
  approval.required && approval.decision === 'pending'
    ? {
        state: { label: PREMISE.ledger.authorised.held, tone: 'held' },
        answer: rich(
          PREMISE.ledger.authorised.pending(holdRule, holdReason.join(': '), approval.approver_roles.join(' or ')),
        ),
      }
    : approval.decision === 'approved'
      ? { answer: rich(PREMISE.ledger.authorised.decided(approval.reviewer_name ?? 'a reviewer', approval.decided_at ?? '')) }
      : approval.decision === 'rejected'
        ? { answer: rich(PREMISE.ledger.authorised.refused(approval.decided_at ?? '')) }
        : { answer: PREMISE.ledger.authorised.none }

// How many of the five the record cannot settle yet: a calculation check that
// did not pass (or never ran), and a release no one has decided.
const openQuestions =
  (calculation?.passed ? 0 : 1) + (approval.required && approval.decision === 'pending' ? 1 : 0)

const ledger: LedgerEntry[] = [
  {
    question: PREMISE.ledger.model.question,
    answer:
      modelCalls.length === 0
        ? PREMISE.ledger.model.none
        : refusedCalls > 0
          ? rich(PREMISE.ledger.model.mixed(refusedCalls, modelCalls.length))
          : rich(PREMISE.ledger.model.answer(modelLabel ?? modelCalls[0].subject, modelCalls.length, modelCalls[0].reason)),
    source: PREMISE.ledger.model.source(modelCalls[0]?.rule ?? 'policy_events'),
  },
  {
    question: PREMISE.ledger.read.question,
    answer:
      run.evidence.length === 0
        ? PREMISE.ledger.read.none
        : rich(
            PREMISE.ledger.read.answer(
              run.evidence.length,
              retrievalMode ?? 'an unrecorded',
              citedUnits.map((unit) => `${documentCode(unit)} ${sectionNumber(unit)}`),
            ),
          ),
    source: PREMISE.ledger.read.source,
  },
  {
    question: PREMISE.ledger.arithmetic.question,
    answer: !calculation
      ? PREMISE.ledger.arithmetic.none
      : rich(
          calculation.passed
            ? PREMISE.ledger.arithmetic.passed(calculation.detail)
            : PREMISE.ledger.arithmetic.failed(calculation.detail),
        ),
    source: PREMISE.ledger.arithmetic.source,
  },
  {
    question: PREMISE.ledger.authorised.question,
    ...authorised,
    source: PREMISE.ledger.authorised.source,
  },
  {
    question: PREMISE.ledger.regulator.question,
    answer:
      run.audit.count === 0 || run.audit.first_sequence === null || run.audit.last_sequence === null
        ? PREMISE.ledger.regulator.none
        : rich(
            PREMISE.ledger.regulator.answer(
              run.audit.count,
              run.audit.first_sequence,
              run.audit.last_sequence,
              run.recorded.hash_full.slice(0, 8),
            ),
          ),
    source: PREMISE.ledger.regulator.source,
  },
]

// The run's timeline: measured stage durations, and the remainder named.
const stageName = new Map<string, string>(RUN.stages.map((stage) => [stage.id, stage.name]))
const totalMs = run.timeline.total_ms
const segments: TimelineSegment[] = run.timeline.stages
  .filter((stage) => stage.ran && typeof stage.ms === 'number' && stage.ms > 0)
  .map((stage) => ({
    id: stage.id,
    name: stageName.get(stage.id) ?? stage.id,
    ms: stage.ms as number,
    model: stage.model !== null,
  }))
const knownMs = segments.reduce((sum, segment) => sum + segment.ms, 0)
const betweenMs = totalMs !== null ? Math.max(0, totalMs - knownMs) : null
const modelMs = segments.filter((segment) => segment.model).reduce((sum, segment) => sum + segment.ms, 0)
const smallSegments =
  totalMs !== null && totalMs > 0
    ? [
        ...segments
          .filter((segment) => segment.ms / totalMs < 0.06)
          .map((segment) => `${segment.name} ${seconds(segment.ms)}`),
        ...(betweenMs !== null && betweenMs > 0 ? [`${RUN.between} ${seconds(betweenMs)}`] : []),
      ]
    : []
const stagesRan = run.timeline.stages.filter((stage) => stage.ran).length
const stagesIdle = RUN.stages.length - stagesRan
const readings: Record<string, StageReading> = Object.fromEntries(
  run.timeline.stages.map((stage) => [
    stage.id,
    {
      ran: stage.ran,
      duration: seconds(stage.ms),
      note: stage.model ? `${stage.model} · ${stage.note}` : stage.note,
    },
  ]),
)

// The chain: the run's last records, as stored.
const tail = run.audit.tail
const previous = tail.length >= 2 ? tail[tail.length - 2] : null
const appended = tail.length >= 1 ? tail[tail.length - 1] : null
const firstCited = citedUnits[0] ?? run.evidence[0] ?? null
// The edit is offered only when the first record shown really carries a
// failed verification to flip. Otherwise the button would promise to "make
// the failed verification pass" on a record that has none, change nothing,
// and the chain would go on verifying under a label that said it had been
// tampered with.
const editPath = [...PROOF.chain.edit.path]
const chainEdit =
  tail.length > 0 && atomAt(parseLexemes(tail[0].line), editPath) === 'false'
    ? { sequence: tail[0].sequence, path: editPath, value: PROOF.chain.edit.value }
    : null
const chainSource =
  tail.length > 0
    ? `${PROOF.chain.labels.source} · seq ${tail[0].sequence}–${tail[tail.length - 1].sequence}`
    : PROOF.chain.labels.source
// Printed only when the records shown actually carry the field it explains.
const carriesFixedNetworkClaim = tail.some((record) => record.line.includes('"network_activity"'))

const limits = LIMITS.items.map((item) =>
  'id' in item && item.id === 'latency' && durationFact && modelMs > 0
    ? { ...item, body: LIMITS.latency(durationFact, seconds(modelMs) ?? '', modelCalls.length) }
    : item,
)

function artifact(kind: 'evidence' | 'verification' | 'audit', label: string, source: string): ReactNode {
  if (kind === 'evidence') {
    return firstCited ? (
      <EvidenceUnit unit={firstCited} label={label} source={source} scoreLabel={scoreLabel} caption={CHAIN.evidenceCaption} />
    ) : null
  }
  if (kind === 'verification') {
    return run.verification ? (
      <VerificationReport
        verification={run.verification}
        label={label}
        source={source}
        caption={
          <>
            <span className="block">{CHAIN.checkedCaption}</span>
            <span className="mt-3 block border-l border-border-strong pl-4">
              <span className="block text-foreground">“{CHAIN.verifierQuote}”</span>
              <span className={cn(MONO_VALUE, 'mt-2 block')}>— {CHAIN.verifierQuoteSource}</span>
            </span>
          </>
        }
      />
    ) : null
  }
  return previous && appended ? (
    <ChainAppend
      previous={{
        sequence: previous.sequence,
        category: previous.category,
        action: previous.action,
        prev: previous.prev_hash,
        hash: previous.hash,
      }}
      appended={{
        sequence: appended.sequence,
        category: appended.category,
        action: appended.action,
        prev: appended.prev_hash,
        hash: appended.hash,
      }}
      label={label}
      source={source}
      caption={CHAIN.recordedCaption}
    />
  ) : null
}

/**
 * The public page at `/`.
 *
 * A server component. It reads the captured run once and hands each section
 * the part it draws. The client components it mounts are the header (session
 * state for one label), the citation inspector, the two audit-chain surfaces,
 * LiveContainment (the page's single fetch), CommandBlock (clipboard), Reveal
 * and ScrollRevealText.
 *
 * The hero does not animate beyond the HeroField behind it: nothing credible
 * in this category animates above the fold, and a headline that fades in is
 * the clearest single tell of a template. The motion on this page is below
 * it, and each piece of it answers something -- a section arriving, a passage
 * opening, a record being appended, a hash being recomputed.
 */
export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden pb-16 pt-12 md:pb-20 md:pt-[88px] lg:pt-[128px]"
      >
        {/*
          The chain, building. Replaces a static dot grid: the page argued
          that every record commits to the one before it while nothing on it
          moved. Masked hard at the edges so it never competes with the
          headline sitting on top of it, and it renders nothing at all under
          prefers-reduced-motion.

          The radial pool that sat beside it is gone. It was at -z-10 under
          an ancestor with an opaque background, the same trap the comment
          below describes, so it never painted; and its colour was the light
          theme's warm paper at 55%, which on this ground would have been a
          bright blot had it ever appeared.
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

        <div className={`${SHELL} relative z-10`}>
          {/*
            Centred, not left-aligned.

            Left-aligned, the hero filled the leftmost 640px of the viewport
            and the entire right half was empty. Asymmetry reads as a choice
            only when something holds the other side; with nothing there it
            reads as a page that failed to finish loading.
          */}
          <div className="flex flex-col items-center text-center">
            <DisplayHeading id="hero-title" as="h1" scale="hero" lead={HERO.headline} turn={HERO.headlineTurn} />

            <p className="mt-4 max-w-[54ch] text-heading tracking-[-0.008em] text-foreground-secondary md:mt-5 md:text-[18px] md:leading-[28px] md:tracking-[-0.011em]">
              {HERO.sub}
            </p>

            <div className="mt-7 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:gap-3 md:mt-8">
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
              Selectable text, not just a link. It survives an offline demo
              where the href does not resolve, and it is the one place on the
              page where a mono string is doing exactly the job mono is for.
            */}
            <p className={`${MONO_VALUE} mt-4 hidden break-all md:block`}>{HERO.repoPath}</p>
          </div>

          {/*
            The product first, then the paperwork that proves it ran. A page
            arguing you should not take its word for anything ought to show
            the thing before it shows the receipt.
          */}
          <ProductShot
            caption={isScreenshotRun ? HERO.shotCaption : HERO.shotCaptionOther}
            alt={HERO.shotAlt}
            facts={shotFacts}
          />

          <RunReceipt
            className="mt-10 md:mt-12"
            runId={runId}
            capturedOn={run.captured_on}
            rows={receiptRows}
            caption={isScreenshotRun ? HERO.receiptCaption : HERO.receiptCaptionOther}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 01 — The answer: the product's own gesture, on its own data       */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={ANSWER.id}
        density="full"
        index={ANSWER.index}
        eyebrow={ANSWER.eyebrow}
        title={ANSWER.title}
        titleTurn={ANSWER.titleTurn}
        lede={annotation ? ANSWER.ledeAnnotated : ANSWER.lede}
        tone="surface"
      >
        <Reveal step={1}>
          <figure className="m-0">
            <CitationInspector
              runLabel={`${runId} · ${run.captured_on}`}
              outcome={outcome}
              facts={[checksFact, durationFact].filter((fact): fact is string => Boolean(fact))}
              question={run.prompt}
              askedAt={clock(run.created_at)}
              answer={run.answer}
              sources={sources}
              annotation={
                annotation
                  ? {
                      marks: annotation.marks,
                      sentence: annotation.sentence,
                      note: annotation.note,
                      more: annotation.more,
                      attribution: annotation.attribution,
                      legend: annotation.legend,
                    }
                  : null
              }
              labels={{ ...ANSWER.labels, similarity: scoreLabel }}
            />
            <figcaption className="mt-4 max-w-[72ch] text-ui leading-[18px] text-foreground-secondary">
              {ANSWER.caption(runId, run.captured_on, modelLabel ?? 'a local model')}
            </figcaption>
          </figure>
        </Reveal>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* 02 — The premise                                                  */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={PREMISE.id}
        index={PREMISE.index}
        eyebrow={PREMISE.eyebrow}
        title={PREMISE.title}
        titleTurn={PREMISE.titleTurn}
        lede={PREMISE.lede(openQuestions)}
      >
        <Reveal step={1}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-8">
            <div className={cn(CARD, 'flex flex-col gap-3 p-5 md:self-start')}>
              <span className={MONO_LABEL}>{PREMISE.solved.label}</span>
              <p className="m-0 text-answer text-foreground">{PREMISE.solved.body}</p>
              <p className="m-0 text-ui leading-[18px] text-foreground-secondary">{PREMISE.solved.note}</p>
            </div>
            <PremiseLedger
              className="min-w-0"
              label={PREMISE.ledger.label}
              runLabel={PREMISE.ledger.run(runId)}
              entries={ledger}
            />
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

          Three columns from lg, not md: the artifacts are real reports now,
          with full sentences in them, and at 768px a third of the row is
          220px -- too narrow to read a verification detail in. Below lg the
          cards stack.

          No Reveal between the grid and the cards. Subgrid needs the card to
          be the grid item, and the old wrapper was display: contents, which
          has no box to move -- its lift never ran. The Recorded card carries
          the section's motion instead, where it means something.
        */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-8 lg:[grid-template-rows:auto_auto_1fr_auto]">
          {CHAIN.cards.map((card) => (
            <ChainCard
              key={card.verb}
              className="w-full min-w-0 lg:row-span-4 lg:grid lg:grid-cols-1 lg:grid-rows-subgrid lg:gap-5"
              index={card.index}
              verb={card.verb}
              mechanism={card.mechanism}
              body={card.body}
              artifact={artifact(card.artifact.kind, card.artifact.label, card.artifact.source)}
            />
          ))}
        </div>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* 04 — One run, end to end                                          */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={RUN.id}
        index={RUN.index}
        eyebrow={RUN.eyebrow}
        title={RUN.title}
        titleTurn={RUN.titleTurn}
        lede={RUN.lede(stagesRan, stagesIdle)}
      >
        <Reveal step={1}>
          {totalMs !== null && durationFact && segments.length > 0 ? (
            <RunTimeline
              className="mb-8"
              label={RUN.timelineLabel}
              total={durationFact}
              totalMs={totalMs}
              segments={segments}
              small={smallSegments}
              format={(ms) => seconds(ms) ?? ''}
            />
          ) : null}
          <StageTable
            stages={[...RUN.stages]}
            readings={readings}
            runLabel={RUN.runColumn}
            labels={{ notRun: RUN.notRun, notMeasured: RUN.notMeasured }}
          />
          <div className="mt-6 flex flex-col gap-3">
            <p className={`m-0 text-body leading-[22px] text-foreground-secondary ${PROSE}`}>{RUN.closing}</p>
          </div>
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
        {/*
          Every cell is min-w-0. The grid items are the Reveal wrappers, and a
          grid item's default min-width is its min-content width -- which for
          the policy block is its longest unwrapped YAML line, 62 characters
          of 12px mono, roughly 450px.
          At 390px that set the column wider than the screen, and the layout's
          overflow-x-hidden clipped the right edge of every cell instead of
          letting the block scroll inside itself.
        */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-8">
          {/* Cell 1 — the audit chain, recomputed by the reader */}
          <Reveal step={1} className="flex min-w-0">
            <section aria-labelledby="proof-chain" className="flex w-full min-w-0 flex-col gap-4">
              <h3 id="proof-chain" className="text-heading font-medium text-foreground">
                {PROOF.chain.label}
              </h3>
              {tail.length > 0 ? (
                <HashChain
                  records={tail.map((record) => ({ sequence: record.sequence, line: record.line }))}
                  edit={chainEdit}
                  labels={{ ...PROOF.chain.labels, source: chainSource }}
                />
              ) : null}
              <p className="m-0 text-body text-foreground-secondary">
                {chainEdit ? PROOF.chain.caption : PROOF.chain.captionNoEdit}
              </p>
              {carriesFixedNetworkClaim ? (
                <p className="m-0 text-ui leading-[18px] text-foreground-muted">{PROOF.chain.networkNote}</p>
              ) : null}
            </section>
          </Reveal>

          {/* Cell 2 — a policy, and what the self-test recorded on this host */}
          <Reveal step={2} className="flex min-w-0">
            <section aria-labelledby="proof-policy" className="flex w-full min-w-0 flex-col gap-4">
              <h3 id="proof-policy" className="text-heading font-medium text-foreground">
                {PROOF.policy.label}
              </h3>
              <MachineBlock label={PROOF.policy.label} source={PROOF.policy.source}>
                {PROOF.policy.lines.join('\n')}
              </MachineBlock>
              {run.sandbox_self_test ? (
                <SelfTest
                  test={run.sandbox_self_test}
                  label={PROOF.sandbox.label}
                  caption={
                    run.sandbox_self_test.detail.assessable !== false && run.sandbox_self_test.detail.checks.length > 0
                      ? PROOF.sandbox.captionAssessed
                      : PROOF.sandbox.captionNotAssessable
                  }
                />
              ) : null}
            </section>
          </Reveal>

          {/* Cell 3 — containment, read live */}
          <Reveal step={1} className="flex min-w-0">
            <section aria-labelledby="proof-containment" className="flex w-full min-w-0 flex-col gap-4">
              <h3 id="proof-containment" className="text-heading font-medium text-foreground">
                {PROOF.containment.label}
              </h3>
              <LiveContainment />
              <p className="m-0 text-body leading-[20px] text-foreground-secondary">{PROOF.containment.caption}</p>
              <figure className="m-0 border-l border-border-strong pl-4">
                <blockquote className="m-0 text-body leading-[22px] text-foreground">“{PROOF.containment.quote}”</blockquote>
                <figcaption className={`${MONO_VALUE} mt-2`}>— {PROOF.containment.quoteSource}</figcaption>
              </figure>
            </section>
          </Reveal>

          {/* Cell 4 — this page */}
          <Reveal step={2} className="flex min-w-0">
            <section aria-labelledby="proof-page" className="flex w-full min-w-0 flex-col gap-4">
              <h3 id="proof-page" className="text-heading font-medium text-foreground">
                {PROOF.page.label}
              </h3>
              <MachineBlock label={PROOF.page.label} source={PROOF.page.source} caption={PROOF.page.caption} wrap>
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
        <Reveal step={1}>
          <LimitList items={limits} />
        </Reveal>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* 07 — Run it                                                       */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={RUN_IT.id}
        index={RUN_IT.index}
        eyebrow={RUN_IT.eyebrow}
        title={RUN_IT.title}
        lede={RUN_IT.lede}
        tone="surface"
      >
        <Reveal step={1}>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8">
            <div className="flex min-w-0 flex-col gap-6">
              <CommandBlock label="Terminal" lines={[...RUN_IT.commands]} />
              {/*
                The question, so a reader who runs it can ask exactly what the
                page asked and press the same markers. It wraps: it is prose to
                paste, not a shell line.
              */}
              <div className="flex flex-col gap-2">
                <CommandBlock label={RUN_IT.question.label} lines={[run.prompt]} wrap />
                <p className="m-0 text-ui leading-[18px] text-foreground-secondary">{RUN_IT.question.note}</p>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-8">
              <div>
                <span className={MONO_LABEL}>{RUN_IT.policies.label}</span>
                <ul className="m-0 mt-3 flex list-none flex-col p-0">
                  {RUN_IT.policies.files.map((file) => (
                    <li key={file.path} className="border-t border-border py-3 first:border-t-0 first:pt-0">
                      <p className={cn(MONO_VALUE, 'm-0 break-all text-foreground')}>{file.path}</p>
                      <p className="m-0 mt-1 text-ui leading-[18px] text-foreground-secondary">{file.line}</p>
                    </li>
                  ))}
                </ul>
                <p className="m-0 mt-1 text-ui leading-[18px] text-foreground-muted">{RUN_IT.policies.note}</p>
              </div>

              <dl className="m-0 flex flex-col gap-4">
                {RUN_IT.facts.map((fact) => (
                  <div key={fact.label}>
                    <dt className={MONO_LABEL}>{fact.label}</dt>
                    <dd className="m-0 mt-1.5 text-body leading-[20px] text-foreground">{fact.line}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Reveal>
      </SectionShell>
    </>
  )
}
