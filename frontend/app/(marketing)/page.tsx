import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { AttackList } from '@/components/landing/attack-list'
import { ChainTamper } from '@/components/landing/chain-tamper'
import { CopyCommands } from '@/components/landing/copy-commands'
import { BENTO, EXHIBIT, HERO, LIMITS, PIPELINE, PLANT, PROOF, RUN_IT, USE_CASES } from '@/components/landing/copy'
import { Exhibit } from '@/components/landing/exhibit'
import { HeroLive } from '@/components/landing/hero-live'
import { LiveContainment } from '@/components/landing/live-containment'
import { PageRequests } from '@/components/landing/page-requests'
import { ProductGallery, type GallerySlide } from '@/components/landing/product-gallery'
import { RevealSection } from '@/components/landing/reveal-section'
import { documentCode, run, runId, sectionLabel, sectionNumber, seconds, type EvidenceUnit as Unit } from '@/components/landing/run-fixture'
import { SphereField, type SphereTag } from '@/components/landing/sphere-field'
import { VesselField, type VesselCallout } from '@/components/landing/vessel-field'

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
const modelStage = run.timeline.stages.find((stage) => stage.model !== null)
const modelName = modelStage?.model ?? run.models[0] ?? null
const held = run.approval.required && run.approval.decision === 'pending'
const verdict = held ? `and the run was held for ${run.approval.approver_roles.join(' or ')}` : 'before the answer was released'
const statusWord = run.status.charAt(0).toUpperCase() + run.status.slice(1).replace(/_/g, ' ')
const hash8 = run.recorded?.hash_full ? run.recorded.hash_full.slice(0, 8) : null
const audit = run.audit
const auditRange = audit.count > 0 && audit.first_sequence !== null && audit.last_sequence !== null ? { first: audit.first_sequence, last: audit.last_sequence } : null

const CHECK_WORDS: Record<string, string> = {
  source_verification: 'Sources',
  calculation_verification: 'Calculations',
  code_verification: 'Code',
  citation_verification: 'Citations',
  page_citation_verification: 'Pages',
  document_verification: 'Document',
  hallucination_check: 'Grounding',
}
const checkLabels = checks.map((check) => CHECK_WORDS[check.name] ?? check.name.replace(/_/g, ' '))

// Passages, in the order the answer first cites them.
const passages = run.evidence.filter((unit) => /^S\d+$/.test(unit.id))
const markers = Array.from(new Set((run.answer.match(/\[[SFVCE]\d+\]/g) ?? []).map((m) => m.slice(1, -1))))
const cited = markers.map((id) => run.evidence.find((unit) => unit.id === id)).filter((unit): unit is Unit => unit !== undefined)
const first = cited[0] ?? null
const answerText = run.answer.replace(/\s*\[[SFVCE]\d+\]\s*/g, ' ').trim()

// The exhibit: the first cited passage, split around the phrase the answer
// rests on -- the clause, from the comma before it up to the figure the
// answer states. Where the record will not split cleanly, there is no exhibit.
const exhibit = (() => {
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
    heading,
    before: body.slice(0, from) + ' ',
    mark: body.slice(from, at).trimStart(),
    figure,
    after: body.slice(at + figure.length),
    doc: documentCode(first),
    section: sectionNumber(first),
    citeId: first.id,
    score: first.score === null ? null : first.score.toFixed(2),
  }
})()

// The timed steps, as the record timed them.
const ms = (value: number | null | undefined) => (value == null ? null : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`)
const stage = (id: string) => run.timeline.stages.find((item) => item.id === id && item.ran) ?? null
const STEP_TIME: Record<string, string | null> = {
  classify: ms(stage('classify')?.ms),
  retrieve: ms(stage('retrieve')?.ms),
  draft: ms(stage('draft')?.ms),
  verify: checks.length > 0 ? `${passedChecks} of ${checks.length}` : null,
  record: auditRange ? `seq ${auditRange.first}–${auditRange.last}` : null,
}

// Four facts under the hero, each read from the record; one it cannot supply
// is dropped rather than drawn as a placeholder.
const selfTest = run.sandbox_self_test?.detail ?? null
const facts = [
  total ? { v: total.replace(/\s*s$/, ''), unit: 's', l: modelName ? `one question, end to end, ${modelName} on a laptop CPU` : 'one question, end to end, on a laptop CPU' } : null,
  checks.length > 0 ? { v: `${passedChecks}/${checks.length}`, unit: null, l: `checks on the answer, ${verdict}` } : null,
  auditRange ? { v: String(audit.count), unit: null, l: `audit records appended, hash-chained, seq ${auditRange.first}–${auditRange.last}` } : null,
  selfTest && selfTest.assessable !== false && selfTest.total > 0 ? { v: `${selfTest.passed}/${selfTest.total}`, unit: null, l: 'attack payloads refused or contained by the sandbox' } : null,
].filter((fact): fact is { v: string; unit: string | null; l: string } => fact !== null)

// The hero's tags: the run's passages and its record, one lit at a time.
const tags: SphereTag[] = [
  ...passages.slice(0, 4).map((unit) => ({
    id: unit.id,
    text: `${documentCode(unit)} ${sectionNumber(unit)}`.trim() + (unit.cited ? ' · cited' : ' · retrieved'),
  })),
  ...(checks.length > 0 ? [{ id: '✓', text: `${passedChecks} of ${checks.length} checks passed` }] : []),
  ...(auditRange ? [{ id: `#${auditRange.last}`, text: 'audit record · hash-chained' }] : []),
]

// The plant: the run's record, pinned to an illustration of what it was about.
const classifyNote = stage('classify')?.note?.replace(/_/g, ' ') ?? null
const callouts = ([
  exhibit ? { k: `${PLANT.callouts.clause} · ${exhibit.citeId} ${exhibit.doc} ${exhibit.section}`, v: `${exhibit.mark.replace(/^an?\s+/i, '').replace(/^./, (c) => c.toUpperCase())}${exhibit.figure}` } : null,
  classifyNote ? { k: PLANT.callouts.classified, v: classifyNote } : null,
  checks.length > 0 ? { k: PLANT.callouts.verifier, v: `${passedChecks} of ${checks.length} checks passed`, tone: 'ok' as const } : null,
  auditRange ? { k: PLANT.callouts.audit, v: `${audit.count} records · seq ${auditRange.first}–${auditRange.last}` } : null,
] as Array<VesselCallout | null>).filter((callout): callout is VesselCallout => callout !== null)

// Security: the recorded self-test, one payload a line, and the chain's tail.
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
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="hero-title" data-theme="dark" data-band className="lp-night lp-hero">
        <div aria-hidden className="lp-hero-light" />
        <SphereField tags={tags} className="absolute inset-0 z-0" />
        <div className="lp-shell lp-hero-copy">
          {total ? (
            <a href="#exhibit" className="lp-pill lp-load-1">
              <span aria-hidden className="dot" />
              {HERO.pill(total)}
              <span aria-hidden className="ar">
                →
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
        {facts.length > 0 ? (
          <dl className="lp-shell lp-facts" aria-label="The recorded run, in figures">
            {facts.map((fact) => (
              <div key={fact.l}>
                <dd>
                  {fact.v}
                  {fact.unit ? <small>{fact.unit}</small> : null}
                </dd>
                <dt>{fact.l}</dt>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Exhibit A: an answer beside the clause it rests on                */}
      {/* ---------------------------------------------------------------- */}
      {exhibit ? (
        <RevealSection id={EXHIBIT.id} aria-labelledby={`${EXHIBIT.id}-title`} className="lp-paper lp-section">
          <div className="lp-shell">
            <Head id={`${EXHIBIT.id}-title`} eyebrow={EXHIBIT.eyebrow} title={EXHIBIT.title} em={EXHIBIT.titleEm} lede={EXHIBIT.lede} />
            <Exhibit
              label={EXHIBIT.label}
              runId={runId}
              doc={exhibit.doc}
              section={exhibit.section}
              heading={exhibit.heading}
              before={exhibit.before}
              mark={exhibit.mark}
              figure={exhibit.figure}
              after={exhibit.after}
              citeId={exhibit.citeId}
              status={statusWord}
              meta={[total, checks.length > 0 ? `${passedChecks} of ${checks.length} checks passed` : null, `${passages.length} sources searched`].filter(Boolean).join(' · ')}
              answer={answerText}
              foot={[`${exhibit.citeId} · ${exhibit.doc} ${exhibit.section}`, auditRange ? `audit seq ${auditRange.last}` : null, hash8].filter(Boolean).join(' · ')}
            />
            <ol className="lp-notes lp-rise">
              <li>
                <span className="n">1</span>
                <span className="t">{EXHIBIT.notes.clause.title}</span>
                <q>
                  {exhibit.mark}
                  {exhibit.figure}
                </q>
                <span className="src">{EXHIBIT.notes.clause.source(`${exhibit.doc} ${exhibit.section}`, exhibit.score)}</span>
              </li>
              {checks.length > 0 ? (
                <li>
                  <span className="n">2</span>
                  <span className="t">{EXHIBIT.notes.checks.title}</span>
                  {EXHIBIT.notes.checks.line(checkLabels.join(', '), passedChecks, checks.length, verdict)}
                </li>
              ) : null}
              {auditRange ? (
                <li>
                  <span className="n">3</span>
                  <span className="t">{EXHIBIT.notes.record.title}</span>
                  {EXHIBIT.notes.record.line(audit.count, auditRange.first, auditRange.last)}
                </li>
              ) : null}
            </ol>
          </div>
        </RevealSection>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Use cases                                                         */}
      {/* ---------------------------------------------------------------- */}
      <RevealSection id={USE_CASES.id} aria-labelledby={`${USE_CASES.id}-title`} className="lp-paper lp-section !pt-0">
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
      {/* How it works: the vessel, and the five steps                      */}
      {/* ---------------------------------------------------------------- */}
      <RevealSection id={PIPELINE.id} aria-labelledby={`${PIPELINE.id}-title`} data-theme="dark" data-band className="lp-night lp-section">
        <div className="lp-shell">
          <Head id={`${PIPELINE.id}-title`} eyebrow={PIPELINE.eyebrow} title={PIPELINE.title} em={PIPELINE.titleTurn} lede={PIPELINE.lede} />
          <VesselField label={PLANT.label} callouts={callouts} className="lp-rise" />
          <ol className="lp-steps lp-rise" aria-label="The five steps of the recorded run">
            {PIPELINE.steps.map((step, i) => (
              <li key={step.key}>
                <span className="top">
                  <span className="n">{String(i + 1).padStart(2, '0')}</span>
                  {STEP_TIME[step.key] ? <span className="s">{STEP_TIME[step.key]}</span> : null}
                </span>
                <span className="l">{step.label}</span>
                <span className="d">{step.line}</span>
              </li>
            ))}
          </ol>
        </div>
      </RevealSection>

      {/* ---------------------------------------------------------------- */}
      {/* The product, screen by screen                                     */}
      {/* ---------------------------------------------------------------- */}
      <RevealSection id="product" aria-labelledby="product-title" className="lp-paper lp-section">
        <div className="lp-shell">
          <Head
            id="product-title"
            center
            eyebrow="Product"
            title="One workbench."
            em="Every step on the record."
            lede="The thread, skills, harnesses, the approval queue, the sandbox and the audit chain, as they run on the demo host."
          />
          <div className="lp-rise mt-12">
            <ProductGallery slides={GALLERY} variant="light" />
          </div>
        </div>
      </RevealSection>

      {/* ---------------------------------------------------------------- */}
      {/* Security: each claim something the reader can check               */}
      {/* ---------------------------------------------------------------- */}
      <RevealSection id={PROOF.id} aria-labelledby={`${PROOF.id}-title`} data-theme="dark" data-band className="lp-night lp-section">
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
      <RevealSection id={LIMITS.id} aria-labelledby={`${LIMITS.id}-title`} className="lp-paper lp-section">
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
      <RevealSection id={RUN_IT.id} aria-labelledby={`${RUN_IT.id}-title`} className="lp-paper lp-section !pt-0">
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
