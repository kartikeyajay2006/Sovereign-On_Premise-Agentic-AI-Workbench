import { ArrowUpRight } from 'lucide-react'
import { CommandBlock } from '@/components/landing/command-block'
import { BENTO, HERO, LIMITS, PIPELINE, PROOF, RUN_IT, USE_CASES } from '@/components/landing/copy'
import { DotField } from '@/components/landing/dot-field'
import { HeroLive } from '@/components/landing/hero-live'
import { BoundaryDiagram } from '@/components/landing/boundary-diagram'
import { LandingButton } from '@/components/landing/landing-button'
import { LiveContainment } from '@/components/landing/live-containment'
import { ProductGallery, type GallerySlide } from '@/components/landing/product-gallery'
import { ProofPipeline, type PipelineData } from '@/components/landing/proof-pipeline'
import { Reveal } from '@/components/landing/reveal'
import { RunReplay, type ReplayCheck, type ReplayStep } from '@/components/landing/run-replay'
import {
  documentCode,
  run,
  runId,
  seconds,
  sectionLabel,
  sectionNumber,
  type EvidenceUnit as Unit,
  type UsageCall,
} from '@/components/landing/run-fixture'
import { SectionHead, SectionRule, SectionShell } from '@/components/landing/section-shell'
import { StackStrip } from '@/components/landing/stack-strip'
import { StatsBand, type Stat } from '@/components/landing/stats-band'
import { AirgapField } from '@/components/landing/airgap-field'
import { AttackList } from '@/components/landing/attack-list'
import { ChainTamper } from '@/components/landing/chain-tamper'
import { PageRequests } from '@/components/landing/page-requests'
import { RevealSection } from '@/components/landing/reveal-section'
import { Spotlight } from '@/components/landing/spotlight'
import { UseCases } from '@/components/landing/use-cases'

/** The first cited sentence, and the passage and phrase it rests on. */
interface StepCited {
  sentence: string
  id: string
  source: string
  excerpt: string
  /** A phrase of the excerpt the sentence rests on, marked where it appears. */
  highlight: string | null
}

/** One verification check, in the words a reader uses. */
interface StepCheck {
  label: string
  passed: boolean
  note: string
}

// --------------------------------------------------------------------------- //
// The run, read once.
//
// Every figure below comes from public/landing/run.json and is derived here, on
// the server, at render. Nothing is defaulted to a number: a value the record
// does not carry comes out as null, and the section that would have printed it
// prints less. Client components receive only the slices they draw.
// --------------------------------------------------------------------------- //

const checks = run.verification?.checks ?? []
const passedChecks = checks.filter((check) => check.passed).length
const durationFact = seconds(run.duration_ms)
const modelStage = run.timeline.stages.find((stage) => stage.model !== null)
const modelName = modelStage?.model ?? run.models[0] ?? null
const modelLabel = modelName ? [modelName, modelStage?.model_version].filter(Boolean).join(' ') : null

type Tone = 'held' | 'released' | 'refused' | 'other'
const outcome: { label: string; tone: Tone } =
  run.status === 'awaiting_approval'
    ? { label: 'Held', tone: 'held' }
    : run.status === 'approved' || run.status === 'completed' || run.status === 'delivered'
      ? { label: 'Released', tone: 'released' }
      : run.status === 'rejected'
        ? { label: 'Refused', tone: 'refused' }
        : { label: run.status, tone: 'other' }

// Passages, in the order the answer first cites them.
const markers = Array.from(new Set((run.answer.match(/\[[SFVCE]\d+\]/g) ?? []).map((m) => m.slice(1, -1))))
const citedUnits = markers
  .map((id) => run.evidence.find((unit) => unit.id === id))
  .filter((unit): unit is Unit => unit !== undefined)
// The replay: the run's own stages, as the thread's transcript writes them,
// with what each got back -- passages, tokens, checks -- hung under it.
const STEP_WORDS: Record<string, { label: string; active: string }> = {
  classify: { label: 'Classified the request', active: 'Reading the request' },
  plan: { label: 'Planned the run', active: 'Planning' },
  retrieve: { label: 'Searched the knowledge base', active: 'Searching the knowledge base' },
  read: { label: 'Read the attachment', active: 'Reading the attachment' },
  sandbox: { label: 'Ran code in the sandbox', active: 'Running code in the sandbox' },
  draft: { label: 'Drafted the answer', active: 'Drafting' },
  verify: { label: 'Checked every claim', active: 'Checking every claim' },
}
/** Which model call belongs to which line. */
const CALL_STAGE: Record<string, string> = {
  plan: 'planning',
  read: 'vision_extraction',
  sandbox: 'code_generation',
  draft: 'drafting',
}
const calls: readonly UsageCall[] = run.usage ?? []
/** One call's cost as the runtime reported it; an unreported figure is left out. */
function callLine(call: UsageCall | undefined): string | null {
  if (!call) return null
  const parts = [call.display_name || call.model]
  if (call.prompt_tokens !== null) parts.push(`${call.prompt_tokens.toLocaleString('en-US')} in`)
  if (call.output_tokens !== null) parts.push(`${call.output_tokens.toLocaleString('en-US')} out`)
  if (call.tokens_per_second !== null) parts.push(`${call.tokens_per_second.toFixed(1)} tok/s`)
  return parts.join(' · ')
}
const passages = run.evidence.filter((unit) => /^S\d+$/.test(unit.id))
const passageLine =
  passages.length > 0
    ? passages
        .slice(0, 3)
        .map((unit) => `${documentCode(unit)} ${sectionNumber(unit)}`.trim())
        .join(' · ') + (passages.length > 3 ? ` · +${passages.length - 3} more` : '')
    : null
const replaySteps: ReplayStep[] = run.timeline.stages
  .filter((stage) => stage.ran && stage.id in STEP_WORDS)
  .map((stage) => ({
    id: stage.id,
    ...STEP_WORDS[stage.id],
    note:
      stage.id === 'classify'
        ? stage.note.replace(/_/g, ' ')
        : stage.id === 'retrieve'
          ? `${passages.length} passage${passages.length === 1 ? '' : 's'}`
          : stage.id === 'verify'
            ? `${passedChecks} of ${checks.length} passed`
            : null,
    result:
      stage.id === 'retrieve'
        ? passageLine
        : stage.id in CALL_STAGE
          ? callLine(calls.filter((call) => call.stage === CALL_STAGE[stage.id]).at(-1))
          : null,
    seconds: stage.id === 'classify' ? null : seconds(stage.ms),
  }))
// The line the turn ends on: every call's tokens, and the answer's speed.
const knownIn = calls.filter((call) => call.prompt_tokens !== null)
const knownOut = calls.filter((call) => call.output_tokens !== null)
const answerCall = calls.filter((call) => call.stage === 'drafting').at(-1)
const usageLine =
  calls.length > 0
    ? [
        Array.from(new Set(calls.map((call) => call.display_name || call.model))).join(', '),
        knownIn.length === calls.length
          ? `${knownIn.reduce((sum, call) => sum + (call.prompt_tokens ?? 0), 0).toLocaleString('en-US')} in`
          : null,
        knownOut.length === calls.length
          ? `${knownOut.reduce((sum, call) => sum + (call.output_tokens ?? 0), 0).toLocaleString('en-US')} out`
          : null,
        answerCall?.tokens_per_second != null ? `${answerCall.tokens_per_second.toFixed(1)} tok/s` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null
const CHECK_WORDS: Record<string, string> = {
  source_verification: 'Sources',
  calculation_verification: 'Calculations',
  code_verification: 'Code',
  citation_verification: 'Citations',
  page_citation_verification: 'Pages',
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
const stats: Stat[] = [
  // The task's own duration, the figure the replay and the answer card
  // print, so the page gives one number for one run.
  (run.duration_ms ?? run.timeline.total_ms) !== null
    ? {
        label: 'One question, end to end',
        value: ((run.duration_ms ?? run.timeline.total_ms ?? 0) / 1000).toFixed(1),
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
  run.sandbox_self_test && run.sandbox_self_test.detail.assessable !== false && run.sandbox_self_test.detail.total > 0
    ? {
        label: 'Containment checks held',
        value: `${run.sandbox_self_test.detail.passed}/${run.sandbox_self_test.detail.total}`,
        sub: 'adversarial payloads, this host',
      }
    : null,
].filter((stat): stat is Stat => stat !== null)

// How it works, drawn small from the run: the first cited sentence and the
// passage it rests on, the checks, and the run's last records.
const firstCited = citedUnits[0] ?? null
const citedSentence = firstCited
  ? (run.answer
      .split(/(?<=[.!?])\s+/)
      .find((sentence) => sentence.includes(`[${firstCited.id}]`)) ?? run.answer)
      .replace(/\s*\[[SFVCE]\d+\]\s*/g, ' ')
      .trim()
  : null
const figure = citedSentence?.match(/\d+(?:\.\d+)?\s*(?:months?|years?|days?|hours?|mm|%)/i)?.[0] ?? null
const stepCited: StepCited | null =
  firstCited && citedSentence
    ? {
        sentence: citedSentence,
        id: firstCited.id,
        source: `${documentCode(firstCited)} ${sectionLabel(firstCited)}`,
        excerpt: clip(
          firstCited.excerpt
            .replace(/^#+[^\n]*\n+/, '')
            .replace(/\s+/g, ' ')
            .trim(),
          240,
        ),
        highlight: figure,
      }
    : null
/** Cut at a word, not inside one, and say so. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`
}
function checkNote(name: string, detail: string): string {
  const counted = detail.match(/(\d+) of (\d+) material claim/)
  if (name === 'source_verification' && counted) return `${counted[1]} of ${counted[2]} traced`
  if (name === 'hallucination_check' && counted) return `${counted[1]} of ${counted[2]} traceable`
  if (/No numeric calculations/i.test(detail)) return 'none asserted'
  if (/No code was generated/i.test(detail)) return 'none generated'
  return detail.replace(/\.$/, '')
}
const stepChecks: StepCheck[] = checks.map((check) => ({
  label: CHECK_WORDS[check.name] ?? check.name.replace(/_/g, ' '),
  passed: check.passed,
  note: checkNote(check.name, check.detail),
}))
const verdict = held ? `held for ${run.approval.approver_roles.join(' or ')}` : 'released without a hold'
const tail = run.audit.tail

// How it works: the run above, as the five steps the pinned section scrolls
// through. Every value is the record's; where it has none, the step says less.
const stageOf = (id: string) => run.timeline.stages.find((stage) => stage.id === id) ?? null
const classifyStage = stageOf('classify')
const draftStage = stageOf('draft')
const retrieveStage = stageOf('retrieve')
const draftCall = calls.filter((call) => call.stage === 'drafting').at(-1) ?? null
// "[S1] A vessel ... 48 months. [S1]": the opening marker repeats the one at
// the end of the sentence, and is dropped from the display only then.
const opening = run.answer.match(/^\s*\[([SFVCE]\d+)\]\s*/)
const shownAnswer =
  opening && run.answer.slice(opening[0].length).includes(`[${opening[1]}]`)
    ? run.answer.slice(opening[0].length)
    : run.answer
const excerptParts = (() => {
  if (!stepCited?.highlight) return null
  const at = stepCited.excerpt.indexOf(stepCited.highlight)
  if (at < 0) return null
  // Enough either side of the figure to read it in its clause.
  const before = stepCited.excerpt.slice(Math.max(0, at - 110), at)
  const after = stepCited.excerpt.slice(at + stepCited.highlight.length, at + stepCited.highlight.length + 70)
  return {
    before: before.slice(before.indexOf(' ') + 1),
    mark: stepCited.highlight,
    after: after.slice(0, after.lastIndexOf(' ')),
  }
})()
const pipeline: PipelineData = {
  runId,
  skill: run.skill ? { id: run.skill.id, name: run.skill.name } : null,
  request: run.skill ? run.skill.input : run.prompt,
  classify: {
    tags: (classifyStage?.note ?? '')
      .split(/\s*·\s*/)
      .map((part) => part.replace(/_/g, ' ').trim())
      .filter(Boolean),
    ms: classifyStage?.ms ?? null,
  },
  retrieve: {
    passages: passages.map((unit) => ({
      id: unit.id,
      code: documentCode(unit),
      section: sectionLabel(unit),
      score: unit.score,
      cited: unit.cited,
    })),
    ms: retrieveStage?.ms ?? null,
    mode: run.retrieval?.mode ? `${run.retrieval.mode} search` : null,
  },
  draft: {
    answer: shownAnswer,
    model: draftCall ? draftCall.display_name || draftCall.model : null,
    meta: draftCall
      ? [
          draftCall.prompt_tokens !== null ? `${draftCall.prompt_tokens.toLocaleString('en-US')} tokens in` : null,
          draftCall.output_tokens !== null ? `${draftCall.output_tokens.toLocaleString('en-US')} out` : null,
          draftCall.tokens_per_second !== null ? `${draftCall.tokens_per_second.toFixed(1)} tok/s` : null,
          seconds(draftStage?.ms) ? `${seconds(draftStage?.ms)} on a laptop CPU` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null,
  },
  verify: {
    claim: stepCited?.sentence ?? null,
    passage:
      stepCited && excerptParts ? { label: `${stepCited.id} · ${stepCited.source}`, ...excerptParts } : null,
    checks: stepChecks,
    verdict: `${passedChecks} of ${checks.length} passed · ${verdict}`,
  },
  record: {
    records: tail.map((record) => ({
      sequence: record.sequence,
      what: `${record.category} · ${record.action}`,
      hash: record.hash,
    })),
    summary:
      run.audit.count > 0 && run.audit.first_sequence !== null && run.audit.last_sequence !== null
        ? `${run.audit.count} records appended for this run, seq ${run.audit.first_sequence}–${run.audit.last_sequence}`
        : null,
  },
}

// Security: the recorded self-test, one payload a line.
const selfTest = run.sandbox_self_test?.detail ?? null
const attacks = selfTest?.checks.map((check) => ({ name: check.name, passed: check.passed, detail: check.detail })) ?? []
const attacksFoot =
  selfTest && selfTest.assessable !== false && selfTest.total > 0
    ? `${selfTest.passed} of ${selfTest.total} held · recorded ${run.sandbox_self_test?.at.slice(0, 10)} · seq ${run.sandbox_self_test?.sequence}`
    : null

// The limits, one line each. The latency line is the run's own.
const limits = LIMITS.brief.map((item) =>
  item.id === 'latency' && durationFact ? { ...item, line: LIMITS.latencyLine(durationFact) } : item,
)

// The gallery: screenshots of the running product, captured on the demo host
// in both themes (public/landing/shots).
const GALLERY: GallerySlide[] = [
  {
    id: 'thread',
    label: 'Thread',
    title: 'Ask in plain language.',
    body: 'A run reads like a terminal session: each step with its time, the passages it found, the model’s tokens and the checks, then the cited answer.',
    light: '/landing/shots/thread-light.png',
    dark: '/landing/shots/thread-dark.png',
    alt: 'The AEGIS thread: a /clause request, the run as a transcript of its steps with times, tokens and four passed checks, and the answer citing S1.',
  },
  {
    id: 'skills',
    label: 'Skills',
    title: 'Save an instruction. Call it with /.',
    body: 'Type / for every skill and harness. A skill changes only what a run is asked, so every run it starts still meets every check.',
    light: '/landing/shots/skills-light.png',
    dark: '/landing/shots/skills-dark.png',
    alt: 'The composer with its / menu open on a new thread: the five skills, each with its command and what it does.',
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
    alt: 'The approval queue: held runs on the left, one open on the right with the reasons it was held and the document it would release.',
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    title: 'Code runs under the host’s limits.',
    body: 'Real payloads, refused before they run or contained while they do, with the memory, CPU and exit the host measured.',
    light: '/landing/shots/sandbox-light.png',
    dark: '/landing/shots/sandbox-dark.png',
    alt: 'The sandbox: a memory bomb contained at the 1024 MB cap, with its traceback, peak memory and CPU time.',
  },
  {
    id: 'audit',
    label: 'Audit',
    title: 'Every step on the record.',
    body: 'Model calls, tool runs and decisions, hash-chained. Recompute the whole chain in your browser.',
    light: '/landing/shots/audit-light.png',
    dark: '/landing/shots/audit-dark.png',
    alt: 'The audit screen: the chain verified by the server and recomputed in this browser, both ending at the same head, over the newest records, each one checked.',
  },
]

export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="hero-title" className="ae-hero">
        {/*
          The band takes the dark palette whatever the page's theme, and runs
          up under the header, which goes clear while it sits over it.
        */}
        <div id="hero-band" data-theme="dark" data-band data-dot-field-host className="ae-hero-band">
          <DotField className="ae-hero-dots" />
          <div aria-hidden className="ae-hero-glow" />
          <div className="ae-shell ae-hero-split">
            <div className="ae-hero-copy">
              <p className="ae-tag ae-load-1">
                <span aria-hidden className="blk" />
                {HERO.tag}
              </p>
              <h1 id="hero-title" className="ae-statement">
                {HERO.lines.map((line, n) => (
                  <span
                    key={line}
                    className={n === HERO.lines.length - 1 ? 'ae-w line grad' : 'ae-w line'}
                    style={{ ['--i' as string]: n }}
                  >
                    {line}
                  </span>
                ))}
              </h1>
              <p className="ae-lead ae-load-2 mt-6 max-w-[46ch]">{HERO.sub}</p>
              <div className="ae-load-3 mt-8 flex flex-col gap-3 sm:flex-row">
                <LandingButton href={HERO.primary.href} variant="primary" blockOnMobile>
                  {HERO.primary.label}
                  <span className="ar" aria-hidden>
                    →
                  </span>
                </LandingButton>
                <LandingButton href={HERO.secondary.href} variant="outline" rel="noreferrer" target="_blank" blockOnMobile>
                  {HERO.secondary.label}
                  <ArrowUpRight className="size-4 opacity-70" aria-hidden />
                </LandingButton>
              </div>
              <HeroLive className="ae-load-4 mt-7" />
            </div>
            <div className="ae-hero-visual ae-load-2">
              <BoundaryDiagram className="ae-bd" />
            </div>
          </div>
          <div aria-hidden className="ae-hero-horizon" />
        </div>

        <div className="ae-shell ae-hero-stage ae-load-4 pb-10">
          <p data-theme="dark" className="ae-fig">
            <span className="n">fig. 01</span>
            <span className="rule" aria-hidden />
            <span>a recorded run, replayed</span>
          </p>
          {/* The replay is drawn in the dark palette too: a terminal on the paper. */}
          <div data-theme="dark" className="ae-frame">
            <RunReplay
              runId={runId}
              prompt={run.prompt}
              skill={run.skill ? { id: run.skill.id, name: run.skill.name, input: run.skill.input } : null}
              usage={usageLine}
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

      {/* ---------------------------------------------------------------- */}
      {/* Use cases: what people ask it, running both ways                  */}
      {/* ---------------------------------------------------------------- */}
      <RevealSection id={USE_CASES.id} aria-labelledby={`${USE_CASES.id}-title`} className="scroll-mt-16 pb-20 md:pb-24">
        <SectionRule />
        <div className="ae-shell pt-14 md:pt-20">
          <SectionHead
            id={`${USE_CASES.id}-title`}
            index="01"
            eyebrow={USE_CASES.eyebrow}
            title={USE_CASES.title}
            titleTurn={USE_CASES.titleTurn}
            lede={USE_CASES.lede}
          />
        </div>
        <div className="ae-reveal mt-12" style={{ transitionDelay: '0.12s' }}>
          <UseCases rows={USE_CASES.rows} note={USE_CASES.note} />
        </div>
      </RevealSection>

      {/* ---------------------------------------------------------------- */}
      {/* How it works: the run, proved in five steps, as the page scrolls   */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={PIPELINE.id}
        index="02"
        eyebrow={PIPELINE.eyebrow}
        title={PIPELINE.title}
        titleTurn={PIPELINE.titleTurn}
        lede={PIPELINE.lede}
        density="tight"
      >
        <ProofPipeline steps={PIPELINE.steps} data={pipeline} />
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* The product, screen by screen                                     */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id="product"
        index="03"
        texture="grid"
        eyebrow="Product"
        title="One workbench."
        titleTurn="Every step on the record."
        lede="The thread, skills, harnesses, the approval queue, the sandbox and the audit chain, as they run on the demo host."
      >
        <Reveal step={1}>
          <ProductGallery slides={GALLERY} />
        </Reveal>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* Security: four claims, each with its proof one click away         */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell
        id={PROOF.id}
        index="04"
        tone="night"
        eyebrow={PROOF.eyebrow}
        title={PROOF.title}
        titleTurn={PROOF.titleTurn}
        lede={PROOF.lede}
      >
        <Spotlight className="ae-bento">
          <article className="ae-tile span-6">
            <div>
              <h3 className="ti">{BENTO.tamper.title}</h3>
              <p className="li">{BENTO.tamper.line}</p>
            </div>
            {tail.length > 0 ? (
              <ChainTamper
                records={tail.map((record) => ({ sequence: record.sequence, line: record.line }))}
                edit={{ ...BENTO.tamper.edit, path: [...BENTO.tamper.edit.path] }}
                labels={{
                  restore: BENTO.tamper.restore,
                  verified: BENTO.tamper.verified,
                  broken: BENTO.tamper.broken,
                  brokenLast: BENTO.tamper.brokenLast,
                  idle: BENTO.tamper.idle,
                }}
              />
            ) : null}
          </article>

          <article className="ae-tile span-2">
            <div>
              <h3 className="ti">{BENTO.airgap.title}</h3>
              <p className="li">{BENTO.airgap.line}</p>
            </div>
            <div className="ae-airgap">
              <AirgapField className="ae-airgap-canvas" />
              <span className="tag">this machine</span>
            </div>
            <LiveContainment />
          </article>

          <article className="ae-tile span-2">
            <div>
              <h3 className="ti">{BENTO.attacks.title}</h3>
              <p className="li">{BENTO.attacks.line}</p>
            </div>
            {attacks.length > 0 ? <AttackList attacks={attacks} foot={attacksFoot} /> : null}
          </article>

          <article className="ae-tile span-2">
            <div>
              <h3 className="ti">{BENTO.requests.title}</h3>
              <p className="li">{BENTO.requests.line}</p>
            </div>
            <PageRequests />
          </article>
        </Spotlight>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* Limits, one line each                                             */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell id={LIMITS.id} index="05" eyebrow={LIMITS.eyebrow} title={LIMITS.title} titleTurn={LIMITS.titleTurn} lede={LIMITS.lede}>
        <ul className="ae-limits ae-reveal">
          {limits.map((item, n) => (
            <li key={item.title}>
              <span className="n">L{String(n + 1).padStart(2, '0')}</span>
              <p className="t">{item.title}</p>
              <p className="l">{item.line}</p>
            </li>
          ))}
        </ul>
        <a
          href={LIMITS.readme.href}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 text-[0.9rem] font-medium text-foreground-secondary transition-colors hover:text-foreground"
        >
          {LIMITS.readme.label} <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </SectionShell>

      {/* ---------------------------------------------------------------- */}
      {/* Get started                                                       */}
      {/* ---------------------------------------------------------------- */}
      <SectionShell id={RUN_IT.id} index="06" eyebrow={RUN_IT.eyebrow} title={RUN_IT.title} lede={RUN_IT.lede}>
        <div className="ae-reveal mb-12">
          <StackStrip label="What it runs on" />
        </div>
        <div className="ae-reveal grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-12">
          <CommandBlock label="Terminal" lines={[...RUN_IT.commands]} wrap />
          {/* No button here: the footer's call to action is the next thing
              on the page, and two of the same button a screen apart read as
              the page not knowing it had already asked. */}
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {RUN_IT.next.map((line, i) => (
              <li key={line} className="flex gap-3.5">
                <span className="ae-step-n shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <span className="pt-0.5 text-[0.95rem] leading-[1.55] text-foreground-secondary">{line}</span>
              </li>
            ))}
          </ol>
        </div>
      </SectionShell>
    </>
  )
}
