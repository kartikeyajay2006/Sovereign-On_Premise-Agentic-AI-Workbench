import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { AttackList } from '@/components/landing/attack-list'
import { ChainTamper } from '@/components/landing/chain-tamper'
import { CopyCommands } from '@/components/landing/copy-commands'
import { BENTO, HERO, LIMITS, PIPELINE, PROOF, RUN_IT, USE_CASES } from '@/components/landing/copy'
import { HeroLive } from '@/components/landing/hero-live'
import { LiveContainment } from '@/components/landing/live-containment'
import { PageRequests } from '@/components/landing/page-requests'
import { ProductGallery, type GallerySlide } from '@/components/landing/product-gallery'
import { RevealSection } from '@/components/landing/reveal-section'
import { documentCode, run, runId, sectionLabel, sectionNumber, seconds, type EvidenceUnit as Unit } from '@/components/landing/run-fixture'
import { StoryScene, type SceneData } from '@/components/landing/story-scene'
import { checkLabel } from '@/lib/presentation'

// --------------------------------------------------------------------------- //
// The run, read once.
//
// Every figure and every quoted word below comes from public/landing/run.json
// and is derived here, on the server, at render. Nothing is defaulted to a
// number: a value the record does not carry comes out as null, and the part
// of the page that would have printed it prints less.
// --------------------------------------------------------------------------- //

const checks = run.verification?.checks ?? []
const passedChecks = checks.filter((check) => check.passed).length
const total = seconds(run.duration_ms ?? run.timeline.total_ms)
const statusWord = run.status.charAt(0).toUpperCase() + run.status.slice(1).replace(/_/g, ' ')
const hash8 = run.recorded?.hash_full ? run.recorded.hash_full.slice(0, 8) : null
const audit = run.audit
const auditRange = audit.count > 0 && audit.first_sequence !== null && audit.last_sequence !== null ? { first: audit.first_sequence, last: audit.last_sequence } : null


// Passages, and the first one the answer cites.
const passages = run.evidence.filter((unit) => /^S\d+$/.test(unit.id))
const markers = Array.from(new Set((run.answer.match(/\[[SFVCEH]\d+\]/g) ?? []).map((m) => m.slice(1, -1))))
const cited = markers.map((id) => run.evidence.find((unit) => unit.id === id)).filter((unit): unit is Unit => unit !== undefined)
const first = cited[0] ?? null
const answerText = run.answer.replace(/\s*\[[SFVCEH]\d+\]\s*/g, ' ').trim()

// The clause the answer rests on: the first cited passage, split around the
// phrase -- from the comma before it up to the figure the answer states.
// Where the record will not split cleanly, the scene shows no clause.
const clause = (() => {
  if (!first) return null
  const lines = first.excerpt.split('\n')
  const heading = lines.find((line) => /^#+\s/.test(line))?.replace(/^#+\s*/, '').trim() ?? sectionLabel(first)
  const body = lines
    .filter((line) => !/^#+\s/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const figure = answerText.match(/\d+(?:\.\d+)?\s*(?:months?|years?|days?|hours?|mm|bar\(g\)|%)/i)?.[0] ?? null
  if (!figure) return null
  const at = body.indexOf(figure)
  if (at < 0) return null
  const from = body.lastIndexOf(',', at) + 1
  return {
    doc: documentCode(first),
    section: sectionNumber(first),
    heading,
    before: body.slice(0, from) + ' ',
    mark: body.slice(from, at).trimStart(),
    figure,
    after: body.slice(at + figure.length),
  }
})()

// The steps, timed as the record timed them.
const ms = (value: number | null | undefined) => (value == null ? null : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`)
const stage = (id: string) => run.timeline.stages.find((item) => item.id === id && item.ran) ?? null
const STEP_TIME: Record<string, string | null> = {
  classify: ms(stage('classify')?.ms),
  retrieve: ms(stage('retrieve')?.ms),
  draft: ms(stage('draft')?.ms),
  verify: checks.length > 0 ? `${passedChecks} of ${checks.length}` : null,
  record: auditRange ? `seq ${auditRange.first}–${auditRange.last}` : null,
}
const draftCall = (run.usage ?? []).filter((call) => call.stage === 'drafting').at(-1) ?? null

const scene: SceneData = {
  runId,
  url: `127.0.0.1:3000/console?run=${run.task_id}`,
  skill: run.skill ? { id: run.skill.id, name: run.skill.name } : null,
  input: run.skill ? run.skill.input : run.prompt,
  classify: stage('classify')?.note?.replace(/_/g, ' ') ?? null,
  passages: passages.map((unit) => ({
    id: unit.id,
    label: `${documentCode(unit)} ${sectionNumber(unit)}`.trim(),
    score: unit.score === null ? null : unit.score.toFixed(2),
    cited: unit.cited,
  })),
  retrieveTime: STEP_TIME.retrieve,
  draftLine: draftCall
    ? [
        draftCall.display_name || draftCall.model,
        draftCall.prompt_tokens !== null ? `${draftCall.prompt_tokens.toLocaleString('en-US')} in` : null,
        draftCall.output_tokens !== null ? `${draftCall.output_tokens.toLocaleString('en-US')} out` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null,
  draftTime: STEP_TIME.draft,
  answer: answerText,
  citeId: first?.id ?? '',
  citeLabel: first ? `${documentCode(first)} ${sectionNumber(first)}`.trim() : '',
  checks: checks.map((check) => ({ label: checkLabel(check.name), passed: check.passed })),
  checksLine: checks.length > 0 ? `${passedChecks} of ${checks.length} checks passed` : null,
  clause,
  chain: audit.tail.map((record) => ({ seq: record.sequence, what: `${record.category} · ${record.action}`, hash: record.hash })),
  seal: hash8,
  total,
  status: statusWord,
  steps: PIPELINE.steps.map((step) => ({ key: step.key, label: step.label, title: step.title, line: step.line, time: STEP_TIME[step.key] ?? null })),
}

// Security: the recorded self-test, one payload a line, and the chain's tail.
const selfTest = run.sandbox_self_test?.detail ?? null
const attacks = selfTest?.checks.map((check) => ({ name: check.name, passed: check.passed, detail: check.detail })) ?? []
const attacksFoot =
  selfTest && selfTest.assessable !== false && selfTest.total > 0
    ? `${selfTest.passed} of ${selfTest.total} held · recorded ${run.sandbox_self_test?.at.slice(0, 10)} · seq ${run.sandbox_self_test?.sequence}`
    : null
const tail = audit.tail

// The limits, one line each. The latency line is the run's own.
const limits = LIMITS.brief.map((item) => (item.id === 'latency' && total ? { ...item, line: LIMITS.latencyLine(total) } : item))

const cases = USE_CASES.grid.map(([row, index]) => USE_CASES.rows[row][index])

// The gallery: screenshots of the running product, captured on the demo host.
const GALLERY: GallerySlide[] = [
  {
    id: 'thread',
    label: 'Thread',
    title: 'Ask in plain language.',
    body: 'A run reads like a terminal session: each step with its time, the passages it found, the model’s tokens and the checks, then the cited answer.',
    light: '/landing/shots/thread-light.png',
    dark: '/landing/shots/thread-dark.png',
    alt: 'The AEGIS thread: a /clause request delivered in 18.8 s with six of six checks passed, and the answer citing S1, SOP-INS-014 §2.2.',
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

/** A section's head: the label, the claim with its turn in serif italic, one line of lede. */
function Head({ id, eyebrow, title, em, lede, center }: { id: string; eyebrow: string; title: string; em?: string; lede?: string; center?: boolean }) {
  return (
    <div className={`lp-head lp-rise${center ? ' center' : ''}`}>
      <p className="lp-kicker">{eyebrow}</p>
      <h2 id={id} className="lp-h2">
        {title}
        {em ? (
          <>
            {' '}
            <em>{em}</em>
          </>
        ) : null}
      </h2>
      {lede ? <p className="lp-lede">{lede}</p> : null}
    </div>
  )
}

const ROMAN = ['i.', 'ii.', 'iii.', 'iv.', 'v.', 'vi.', 'vii.', 'viii.']

export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* The scene: the hero, and the run played in the workbench          */}
      {/* ---------------------------------------------------------------- */}
      <StoryScene
        data={scene}
        hero={
          <div className="lp-hero-copy">
            {total ? (
              <a href="#how" className="lp-pill lp-load-1">
                <span aria-hidden className="dot" />
                {HERO.pill(total)}
                <span aria-hidden className="ar">
                  ↓
                </span>
              </a>
            ) : null}
            <h1 id="hero-title" className="lp-display lp-load-2">
              {HERO.title}
              {/* On a phone the line breaks where it falls: "Answers you / can prove." */}
              <br className="max-sm:hidden" /> <em>{HERO.titleEm}</em>
            </h1>
            <p className="lp-lede lp-load-3">{HERO.lede}</p>
            <div className="lp-hero-actions lp-load-3">
              <Link href={HERO.primary.href} className="lp-btn primary">
                {HERO.primary.label}
                <span className="ar" aria-hidden>
                  →
                </span>
              </Link>
              <a href={HERO.secondary.href} rel="noreferrer" target="_blank" className="lp-btn ghost">
                {HERO.secondary.label}
                <ArrowUpRight className="size-4 opacity-70" aria-hidden />
              </a>
            </div>
            <div className="lp-hero-live lp-load-4">
              <HeroLive />
            </div>
          </div>
        }
      />

      {/* ---------------------------------------------------------------- */}
      {/* What people ask it                                                */}
      {/* ---------------------------------------------------------------- */}
      <RevealSection id={USE_CASES.id} aria-labelledby={`${USE_CASES.id}-title`} className="lp-section">
        <div className="lp-shell">
          <Head id={`${USE_CASES.id}-title`} eyebrow={USE_CASES.eyebrow} title={USE_CASES.title} em={USE_CASES.titleTurn} lede={USE_CASES.lede} />
          <ul className="lp-cases lp-rise">
            {cases.map((item) => {
              const command = item.text.match(/^(\/[a-z-]+)\s+(.*)$/)
              return (
                <li key={item.text}>
                  <span className="kind">{item.kind}</span>
                  <span className="q">
                    {command ? (
                      <>
                        <span className="cmd">{command[1]}</span> {command[2]}
                      </>
                    ) : (
                      item.text
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="lp-cases-note">{USE_CASES.note}</p>
        </div>
      </RevealSection>

      {/* ---------------------------------------------------------------- */}
      {/* The product, screen by screen                                     */}
      {/* ---------------------------------------------------------------- */}
      <RevealSection id="product" aria-labelledby="product-title" className="lp-section">
        <div className="lp-shell">
          <Head
            id="product-title"
            eyebrow="Product"
            title="One workbench."
            em="Every step on the record."
            lede="The thread, skills, harnesses, the approval queue, the sandbox and the audit chain, as they run on the demo host."
          />
          <div className="lp-rise mt-12">
            <ProductGallery slides={GALLERY} variant="dark" />
          </div>
        </div>
      </RevealSection>

      {/* ---------------------------------------------------------------- */}
      {/* Security: each claim something the reader can check               */}
      {/* ---------------------------------------------------------------- */}
      <RevealSection id={PROOF.id} aria-labelledby={`${PROOF.id}-title`} className="lp-section">
        <div className="lp-shell">
          <Head id={`${PROOF.id}-title`} eyebrow={PROOF.eyebrow} title={PROOF.title} em={PROOF.titleTurn} lede={PROOF.lede} />
          <div className="lp-bento lp-rise">
            {tail.length > 0 ? (
              <article className="lp-tile wide">
                <div>
                  <h3 className="ti">{BENTO.tamper.title}</h3>
                  <p className="li">{BENTO.tamper.line}</p>
                </div>
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
              </article>
            ) : null}
            <article className="lp-tile">
              <div>
                <h3 className="ti">{BENTO.airgap.title}</h3>
                <p className="li">{BENTO.airgap.line}</p>
              </div>
              <LiveContainment />
            </article>
            <article className="lp-tile">
              <div>
                <h3 className="ti">{BENTO.attacks.title}</h3>
                <p className="li">{BENTO.attacks.line}</p>
              </div>
              {attacks.length > 0 ? <AttackList attacks={attacks} foot={attacksFoot} /> : null}
            </article>
            <article className="lp-tile">
              <div>
                <h3 className="ti">{BENTO.requests.title}</h3>
                <p className="li">{BENTO.requests.line}</p>
              </div>
              <PageRequests />
            </article>
          </div>
        </div>
      </RevealSection>

      {/* ---------------------------------------------------------------- */}
      {/* Limits, one line each                                             */}
      {/* ---------------------------------------------------------------- */}
      <RevealSection id={LIMITS.id} aria-labelledby={`${LIMITS.id}-title`} className="lp-section">
        <div className="lp-shell">
          <Head id={`${LIMITS.id}-title`} eyebrow={LIMITS.eyebrow} title={LIMITS.title} em={LIMITS.titleTurn} lede={LIMITS.lede} />
          <ol className="lp-limits lp-rise">
            {limits.map((item, i) => (
              <li key={item.id}>
                <span className="n">{ROMAN[i]}</span>
                <span className="t">{item.title}</span>
                <span className="l">{item.line}</span>
              </li>
            ))}
          </ol>
          <a href={LIMITS.readme.href} target="_blank" rel="noreferrer" className="lp-link mt-12">
            {LIMITS.readme.label} <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </div>
      </RevealSection>

      {/* ---------------------------------------------------------------- */}
      {/* Get started                                                       */}
      {/* ---------------------------------------------------------------- */}
      <RevealSection id={RUN_IT.id} aria-labelledby={`${RUN_IT.id}-title`} className="lp-section">
        <div className="lp-shell">
          <Head id={`${RUN_IT.id}-title`} eyebrow={RUN_IT.eyebrow} title={RUN_IT.title} em={RUN_IT.titleEm} lede={RUN_IT.lede} />
          <div className="lp-start lp-rise">
            <CopyCommands lines={[...RUN_IT.commands]} />
            <ol className="lp-next">
              {RUN_IT.next.map((line, i) => (
                <li key={line}>
                  <span className="n">{ROMAN[i]}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </RevealSection>
    </>
  )
}
