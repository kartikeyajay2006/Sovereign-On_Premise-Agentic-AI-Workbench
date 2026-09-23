import type { ReactNode } from 'react'
import { atomAt, parseLexemes } from '@/components/landing/audit-hash'
import { ChainAppend } from '@/components/landing/chain-append'
import { ChainCard } from '@/components/landing/chain-card'
import { CitationInspector, type InspectorSource } from '@/components/landing/citation-inspector'
import { CommandBlock } from '@/components/landing/command-block'
import { ANSWER, CHAIN, HERO, LIMITS, PROOF, RUN_IT } from '@/components/landing/copy'
import { DisplayHeading } from '@/components/landing/display-heading'
import { EvidenceUnit } from '@/components/landing/evidence-unit'
import { HashChain } from '@/components/landing/hash-chain'
import { LandingButton } from '@/components/landing/landing-button'
import { LimitList } from '@/components/landing/limit-list'
import { LiveContainment } from '@/components/landing/live-containment'
import { MachineBlock } from '@/components/landing/machine-block'
import { ProductGallery, type GallerySlide } from '@/components/landing/product-gallery'
import { Reveal } from '@/components/landing/reveal'
import { RunReplay, type ReplayCheck, type ReplayStep } from '@/components/landing/run-replay'
import {
  clock,
  documentCode,
  documentTitle,
  run,
  runId,
  seconds,
  sectionLabel,
  type EvidenceUnit as Unit,
} from '@/components/landing/run-fixture'
import { SectionShell } from '@/components/landing/section-shell'
import { SelfTest } from '@/components/landing/self-test'
import { StackStrip } from '@/components/landing/stack-strip'
import { StatsBand, type Stat } from '@/components/landing/stats-band'
import { MONO_LABEL, MONO_VALUE } from '@/components/landing/tokens'
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

// The replay: the run's own stages, checks and seal, paced for a screen.
const STEP_WORDS: Record<string, { label: string; active: string }> = {
  plan: { label: 'Planned', active: 'Planning' },
  retrieve: { label: 'Searched the knowledge base', active: 'Searching the knowledge base' },
  read: { label: 'Read the attachment', active: 'Reading the attachment' },
  sandbox: { label: 'Ran the calculation', active: 'Running the calculation' },
  draft: { label: 'Drafted the answer', active: 'Drafting the answer' },
  verify: { label: 'Verified the claims', active: 'Verifying the claims' },
}
const replaySteps: ReplayStep[] = run.timeline.stages
  .filter((stage) => stage.ran && stage.id in STEP_WORDS)
  .map((stage) => ({
    id: stage.id,
    ...STEP_WORDS[stage.id],
    detail: stage.model ? `${stage.note} · ${stage.model}` : stage.note,
    seconds: seconds(stage.ms),
  }))
const CHECK_WORDS: Record<string, string> = {
  source_verification: 'Sources',
  calculation_verification: 'Calculations',
  code_verification: 'Code',
  document_verification: 'Document',
  hallucination_check: 'Grounding',
}
const replayChecks: ReplayCheck[] = checks.map((check) => ({
  name: check.name,
  label: CHECK_WORDS[check.name] ?? check.name.replace(/_/g, ' '),
  passed: check.passed,
  detail: check.detail,
}))
const held = run.approval.required && run.approval.decision === 'pending'
const sealed =
  run.audit.count > 0 && run.audit.last_sequence !== null
    ? `${run.audit.count} audit records · seq ${run.audit.last_sequence} · ${run.recorded.hash_full.slice(0, 8)}`
    : null

// Four numbers, each read from the record. A figure the record does not
// carry is dropped, never drawn as a placeholder.
const selfTest = run.sandbox_self_test?.detail ?? null
const stats: Stat[] = [
  run.timeline.total_ms !== null
    ? {
        label: 'One question, end to end',
        value: (run.timeline.total_ms / 1000).toFixed(1),
        suffix: 's',
        sub: modelLabel ? `${modelLabel} on a laptop CPU` : 'on a laptop CPU',
      }
    : null,
  checks.length > 0
    ? {
        label: 'Checks on the answer',
        value: `${passedChecks}/${checks.length}`,
        sub: outcome.tone === 'held' ? 'held for a reviewer' : outcome.label.toLowerCase(),
      }
    : null,
  run.audit.count > 0 && run.audit.first_sequence !== null && run.audit.last_sequence !== null
    ? {
        label: 'Audit records appended',
        value: String(run.audit.count),
        sub: `hash-chained, seq ${run.audit.first_sequence}–${run.audit.last_sequence}`,
      }
    : null,
  selfTest && selfTest.assessable !== false && selfTest.total > 0
    ? {
        label: 'Containment checks held',
        value: `${selfTest.passed}/${selfTest.total}`,
        sub: 'adversarial payloads, this host',
      }
    : null,
].filter((stat): stat is Stat => stat !== null)

// The chain: the run's last records, as stored.
const tail = run.audit.tail
const previous = tail.length >= 2 ? tail[tail.length - 2] : null
const appended = tail.length >= 1 ? tail[tail.length - 1] : null
const firstCited = citedUnits[0] ?? run.evidence[0] ?? null
// The edit is offered only when the first record shown really carries a
// failed verification to flip. Otherwise the button would promise to "make
// the failed verification pass" on a record that has none.
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

const modelCalls = run.policy_events.filter((event) => event.action === 'model.invoke')
const modelMs = run.timeline.stages
  .filter((stage) => stage.ran && stage.model !== null && typeof stage.ms === 'number')
  .reduce((sum, stage) => sum + (stage.ms as number), 0)
const limits = LIMITS.items.map((item) =>
  'id' in item && item.id === 'latency' && durationFact && modelMs > 0
    ? { ...item, body: LIMITS.latency(durationFact, seconds(modelMs) ?? '', modelCalls.length) }
    : item,
)

// The gallery: screenshots of the running product, captured on the demo host
// in both themes (public/landing/shots).
const GALLERY: GallerySlide[] = [
  {
    id: 'thread',
    label: 'Thread',
    title: 'Ask in plain language.',
    body: 'Every answer arrives cited to the passage it rests on, with the checks it passed and the time it took.',
    light: '/landing/shots/thread-light.png',
    dark: '/landing/shots/thread-dark.png',
    alt: 'The AEGIS thread: a question, and an answer held for review with its citations, checks and model usage.',
  },
  {
    id: 'harness',
    label: 'Harnesses',
    title: 'Run a whole job, not one question.',
    body: 'A sweep of questions or a requirements register runs as governed tasks and ends in one hashed report.',
    light: '/landing/shots/harness-light.png',
    dark: '/landing/shots/harness-dark.png',
    alt: 'A finished SOP question sweep: three runs settled, an answer matrix and a hashed report.',
  },
  {
    id: 'approvals',
    label: 'Approvals',
    title: 'A person signs what leaves.',
    body: 'Held work waits for a reviewer, and never for the one who ran it. Built for the keyboard: j, k, a, r.',
    light: '/landing/shots/approvals-light.png',
    dark: '/landing/shots/approvals-dark.png',
    alt: 'The approval queue: held runs on the left, one open on the right with the reason it was held.',
  },
  {
    id: 'audit',
    label: 'Audit',
    title: 'Every step on the record.',
    body: 'Model calls, tool runs and decisions, hash-chained. Recompute the whole chain in your browser.',
    light: '/landing/shots/audit-light.png',
    dark: '/landing/shots/audit-dark.png',
    alt: 'The audit screen: the chain verified by the server, and the newest records with their hashes.',
  },
]

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
            <span className="mt-3 block border-l border-line-default pl-4">
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
 * the part it draws. The hero is a replay of that run: the question, the
 * passages retrieval returned, the answer arriving with its citations, the
 * checks, the hold and the audit seal -- every value from the record, only
 * the pacing compressed. The page below it opens the same run's artifacts.
 */
export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <div className="ae-shell pb-12 pt-14 text-center md:pb-16 md:pt-24">
          <a href="#proof" className="ae-announce ae-load-1">
            <span className="tag">{HERO.announce.tag}</span>
            {HERO.announce.text}
            <span aria-hidden className="text-foreground-muted">
              →
            </span>
          </a>
          <DisplayHeading
            id="hero-title"
            as="h1"
            scale="hero"
            align="center"
            lead={HERO.headline}
            turn={HERO.headlineTurn}
            className="ae-load-1 mt-7"
          />
          <p className="ae-lead ae-load-2 mx-auto mt-6 max-w-[56ch]">{HERO.sub}</p>
          <div className="ae-load-3 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LandingButton href={HERO.primary.href} variant="primary" blockOnMobile>
              {HERO.primary.label}
              <span className="ar" aria-hidden>
                →
              </span>
            </LandingButton>
            <LandingButton href={HERO.secondary.href} variant="outline" rel="noreferrer" target="_blank" blockOnMobile>
              {HERO.secondary.label}
            </LandingButton>
          </div>
        </div>

        <div className="ae-shell ae-load-4 pb-10">
          <div className="ae-frame">
            <RunReplay
              runId={runId}
              prompt={run.prompt}
              answer={run.answer}
              sources={run.evidence.map((unit) => ({
                id: unit.id,
                code: documentCode(unit),
                section: sectionLabel(unit),
                score: unit.score,
                cited: unit.cited,
              }))}
              steps={replaySteps}
              checks={replayChecks}
              held={held}
              heldFor={run.approval.approver_roles.join(' or ')}
              sealed={sealed}
              total={durationFact}
            />
          </div>
          <p className="ae-note mx-auto mt-4 max-w-[70ch] text-center">{HERO.replayNote}</p>
        </div>
      </section>

      <section aria-label="The run above, in four numbers" className="ae-shell pb-8 pt-6">
        <StatsBand stats={stats} label="The run above, in four numbers" />
      </section>

      <section aria-label="What runs on the host" className="ae-shell py-14 md:py-16">
        <StackStrip label="Runs on your own hardware" />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The product, screen by screen                                     */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id="product"
        eyebrow="Product"
        title="One workbench."
        titleTurn="Every step on the record."
        lede="The thread, the harnesses, the approval queue and the audit chain, as they run on the demo host."
      >
        <Reveal step={1}>
          <ProductGallery slides={GALLERY} />
        </Reveal>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* How it works                                                      */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell id={CHAIN.id} eyebrow={CHAIN.eyebrow} title={CHAIN.title} titleTurn={CHAIN.titleTurn} lede={CHAIN.lede}>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-8 lg:[grid-template-rows:auto_auto_1fr_auto]">
          {CHAIN.cards.map((card) => (
            <ChainCard
              key={card.verb}
              className="ae-reveal w-full min-w-0 lg:row-span-4 lg:grid lg:grid-cols-1 lg:grid-rows-subgrid lg:gap-5"
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
      {/* The answer, every citation opening                                */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={ANSWER.id}
        tone="surface"
        eyebrow={ANSWER.eyebrow}
        title={ANSWER.title}
        titleTurn={ANSWER.titleTurn}
        lede={annotation ? ANSWER.ledeAnnotated : ANSWER.lede}
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
            <figcaption className="ae-note mt-4 max-w-[72ch]">
              {ANSWER.caption(runId, run.captured_on, modelLabel ?? 'a local model')}
            </figcaption>
          </figure>
        </Reveal>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* Security: check it yourself                                       */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell id={PROOF.id} eyebrow={PROOF.eyebrow} title={PROOF.title} titleTurn={PROOF.titleTurn} lede={PROOF.lede}>
        {/*
          Every cell is min-w-0: a grid item's default min-width is its
          min-content width, which for the policy block is its longest
          unwrapped YAML line, wider than a phone.
        */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-8">
          <Reveal step={1} className="flex min-w-0">
            <section aria-labelledby="proof-chain" className="flex w-full min-w-0 flex-col gap-4">
              <h3 id="proof-chain" className="ae-h3">
                {PROOF.chain.label}
              </h3>
              {tail.length > 0 ? (
                <HashChain
                  records={tail.map((record) => ({ sequence: record.sequence, line: record.line }))}
                  edit={chainEdit}
                  labels={{ ...PROOF.chain.labels, source: chainSource }}
                />
              ) : null}
              <p className="ae-body text-[0.9rem]">{chainEdit ? PROOF.chain.caption : PROOF.chain.captionNoEdit}</p>
              {carriesFixedNetworkClaim ? <p className="ae-note m-0">{PROOF.chain.networkNote}</p> : null}
            </section>
          </Reveal>

          <Reveal step={2} className="flex min-w-0">
            <section aria-labelledby="proof-policy" className="flex w-full min-w-0 flex-col gap-4">
              <h3 id="proof-policy" className="ae-h3">
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

          <Reveal step={1} className="flex min-w-0">
            <section aria-labelledby="proof-containment" className="flex w-full min-w-0 flex-col gap-4">
              <h3 id="proof-containment" className="ae-h3">
                {PROOF.containment.label}
              </h3>
              <LiveContainment />
              <p className="ae-body text-[0.9rem]">{PROOF.containment.caption}</p>
              <figure className="m-0 border-l border-line-default pl-4">
                <blockquote className="m-0 text-[0.93rem] leading-[1.6] text-foreground">“{PROOF.containment.quote}”</blockquote>
                <figcaption className={`${MONO_VALUE} mt-2`}>— {PROOF.containment.quoteSource}</figcaption>
              </figure>
            </section>
          </Reveal>

          <Reveal step={2} className="flex min-w-0">
            <section aria-labelledby="proof-page" className="flex w-full min-w-0 flex-col gap-4">
              <h3 id="proof-page" className="ae-h3">
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
      {/* Limits                                                            */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={LIMITS.id}
        tone="surface"
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
      {/* Get started                                                       */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell id={RUN_IT.id} eyebrow={RUN_IT.eyebrow} title={RUN_IT.title} lede={RUN_IT.lede}>
        <Reveal step={1}>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-10">
            <div className="flex min-w-0 flex-col gap-6">
              <CommandBlock label="Terminal" lines={[...RUN_IT.commands]} />
              {/*
                The question, so a reader who runs it can ask exactly what the
                page asked and press the same markers.
              */}
              <div className="flex flex-col gap-2">
                <CommandBlock label={RUN_IT.question.label} lines={[run.prompt]} wrap />
                <p className="ae-note m-0">{RUN_IT.question.note}</p>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-8">
              <div>
                <span className={MONO_LABEL}>{RUN_IT.policies.label}</span>
                <ul className="m-0 mt-3 flex list-none flex-col p-0">
                  {RUN_IT.policies.files.map((file) => (
                    <li key={file.path} className="border-t border-line-subtle py-3 first:border-t-0 first:pt-0">
                      <p className={cn(MONO_VALUE, 'm-0 break-all text-foreground')}>{file.path}</p>
                      <p className="ae-note m-0 mt-1">{file.line}</p>
                    </li>
                  ))}
                </ul>
                <p className="ae-note m-0 mt-1">{RUN_IT.policies.note}</p>
              </div>

              <dl className="m-0 flex flex-col gap-4">
                {RUN_IT.facts.map((fact) => (
                  <div key={fact.label}>
                    <dt className={MONO_LABEL}>{fact.label}</dt>
                    <dd className="m-0 mt-1.5 text-[0.93rem] leading-[1.55] text-foreground">{fact.line}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Reveal>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* Closing                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="closing-title" className="ae-shell pb-24 pt-4">
        <div className="ae-painted rounded-[28px] px-6 py-16 text-center sm:px-12 md:py-24">
          <h2 id="closing-title" className="ae-h2 mx-auto max-w-[18ch]">
            Local is not enough. <span className="soft">So prove the rest.</span>
          </h2>
          <p className="ae-lead mx-auto mt-5 max-w-[52ch]">
            Put a workbench on your own hardware whose every answer shows its sources, its checks and its record.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LandingButton href={HERO.primary.href} variant="primary">
              {HERO.primary.label}
              <span className="ar" aria-hidden>
                →
              </span>
            </LandingButton>
            <LandingButton href={HERO.secondary.href} variant="outline" rel="noreferrer" target="_blank">
              {HERO.secondary.label}
            </LandingButton>
          </div>
        </div>
      </section>
    </>
  )
}
