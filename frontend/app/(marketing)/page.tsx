import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { AttackList } from '@/components/landing/attack-list'
import { ChainTamper } from '@/components/landing/chain-tamper'
import { ChainVerify } from '@/components/landing/chain-verify'
import { ChapterTiles } from '@/components/landing/chapter-tiles'
import { CopyCommands } from '@/components/landing/copy-commands'
import { BENTO, CHAIN_VERIFY, CHAPTERS, HERO, LIMITS, PROOF, PROOF_SEQ, RAIL, REPLAY, RUN_IT, STATS, USE_CASES } from '@/components/landing/copy'
import { HeroVessel } from '@/components/landing/hero-vessel'
import * as R from '@/components/landing/landing-data'
import { LiveContainment } from '@/components/landing/live-containment'
import { LiveEgress } from '@/components/landing/live-egress'
import { PageRequests } from '@/components/landing/page-requests'
import { ProductGallery, type GallerySlide } from '@/components/landing/product-gallery'
import { ProofSequence, type ProofData } from '@/components/landing/proof-sequence'
import { RevealSection } from '@/components/landing/reveal-section'
import { RunReplay } from '@/components/landing/run-replay'

// --------------------------------------------------------------------------- //
// The public page, Hi-Vis Monochrome.
//
// Every figure and every quoted word about the run comes from
// public/landing/run.json through landing-data.ts, derived on the server at
// render. The only other numbers on the page are read live by the visitor's
// browser (egress, this page's own requests) or recomputed there (hashes).
// --------------------------------------------------------------------------- //

const checksLine = R.checks.length > 0 ? `${R.passedChecks} of ${R.checks.length} checks passed` : null

/** The hero reticle's label, a line a part: clause, figure, claims traced. */
const reticle = R.reticleLabel ? R.reticleLabel.split(' · ') : []

/** The meta rail: small uppercase lines, each value the record's. */
const rail = ([
  { k: RAIL.run, v: R.runId },
  R.total ? { k: RAIL.time, v: R.total } : null,
  R.modelName ? { k: RAIL.model, v: R.modelName } : null,
  checksLine ? { k: RAIL.checks, v: `${R.passedChecks} / ${R.checks.length} passed` } : null,
  R.headSeq !== null && R.hash8 ? { k: RAIL.chain, v: `#${R.headSeq} · ${R.hash8}` } : null,
  { k: RAIL.recorded, v: R.capturedOn },
] as Array<{ k: string; v: string } | null>).filter((row): row is { k: string; v: string } => row !== null)

// The limits, one line each. The latency line is the run's own.
const limits = LIMITS.brief.map((item) => (item.id === 'latency' && R.total ? { ...item, line: LIMITS.latencyLine(R.total) } : item))
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

const pad = (n: number) => String(n).padStart(2, '0')
const at = (i: number) => ({ ['--i' as string]: i }) as CSSProperties

/** Twelve segments of the section's top rule: the chapter wipe between sections. */
function ChapterRule() {
  return (
    <div className="lp-rule" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} style={at(i)} />
      ))}
    </div>
  )
}

/** A section's head: the mono eyebrow, the light claim with its key words heavy, one line of lede. */
function Head({ id, eyebrow, title, strong, lede }: { id: string; eyebrow: string; title: string; strong?: string; lede?: string }) {
  return (
    <div className="lp-head lp-rise">
      <p className="lp-eyebrow">{eyebrow}</p>
      <h2 id={id} className="lp-h2">
        {title}
        {strong ? (
          <>
            {' '}
            <b>{strong}</b>
          </>
        ) : null}
      </h2>
      {lede ? <p className="lp-lede">{lede}</p> : null}
    </div>
  )
}

function Section({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <RevealSection id={id} aria-labelledby={`${id}-title`} className={`lp-section${className ? ` ${className}` : ''}`}>
      <ChapterRule />
      <div className="lp-shell">{children}</div>
    </RevealSection>
  )
}

// --------------------------------------------------------------------------- //
// The three chapter panels, drawn from the record on the server.
// --------------------------------------------------------------------------- //

const retrievePanel = (
  <div className="lp-pv">
    <p className="lp-pv-head">
      <span>{R.retrieve.count} passages</span>
      <span>{R.retrieve.documents} documents</span>
      {R.retrieve.mode ? <span>{R.retrieve.mode} search</span> : null}
      {R.retrieve.time ? <span>{R.retrieve.time}</span> : null}
      {R.retrieve.policy ? <span>policy {R.retrieve.policy}</span> : null}
    </p>
    <table className="lp-table">
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Id</th>
          <th scope="col">Document</th>
          <th scope="col">Section</th>
          <th scope="col" className="num">
            Score
          </th>
        </tr>
      </thead>
      <tbody>
        {R.retrieve.rows.map((row) => (
          <tr key={row.id} data-cited={row.cited ? '' : undefined}>
            <td>{pad(row.rank)}</td>
            <td>
              <span className={row.cited ? 'chip' : 'id'}>{row.id}</span>
            </td>
            <td>{row.doc}</td>
            <td className="sec">{row.section}</td>
            <td className="num">{row.score ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="lp-pv-foot">Score is the cosine similarity embedding search reported. The lit row is the passage the answer cites.</p>
  </div>
)

const verifyPanel = (
  <div className="lp-pv">
    <p className="lp-pv-head">
      {R.claims ? (
        <span>
          {R.claims.supported} of {R.claims.total} material claims supported
        </span>
      ) : null}
      {checksLine ? <span>{checksLine}</span> : null}
    </p>
    <p className="lp-pv-answer">
      {R.answerText} {R.cite ? <span className="chip">{R.cite.id}</span> : null}
    </p>
    <ul className="lp-pv-checks">
      {R.checks.map((check) => (
        <li key={check.name} className={check.passed ? 'ok' : 'no'}>
          <span className="sq" aria-hidden />
          <span className="t">
            {check.label}
            <span className="sr-only">{check.passed ? ': passed' : ': failed'}</span>
          </span>
          <span className="d">{check.detail}</span>
        </li>
      ))}
    </ul>
  </div>
)

const sealPanel = (
  <div className="lp-pv">
    <p className="lp-pv-head">
      {R.auditRange ? (
        <span>
          {R.auditRange.count} records appended · seq {R.auditRange.first}–{R.auditRange.last}
        </span>
      ) : null}
      <span>{R.audit.path}</span>
    </p>
    <table className="lp-table">
      <thead>
        <tr>
          <th scope="col">Seq</th>
          <th scope="col">At</th>
          <th scope="col">Record</th>
          <th scope="col">Prev → hash</th>
        </tr>
      </thead>
      <tbody>
        {R.chain.map((record) => (
          <tr key={record.seq} data-cited={record.seq === R.headSeq ? '' : undefined}>
            <td>#{record.seq}</td>
            <td>{record.at ?? ''}</td>
            <td className="sec">
              {record.category} · {record.action}
            </td>
            <td className="hash">
              {record.prev.slice(0, 8)} → <span>{record.hash.slice(0, 8)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="lp-pv-foot">The run’s last {R.chain.length} records as the capture holds them. Each prev is the hash of the record before it.</p>
  </div>
)

const proofData: ProofData = {
  labels: { ...PROOF_SEQ.steps, stamp: PROOF_SEQ.stamp, held: PROOF_SEQ.held },
  doc:
    R.cite && R.clause
      ? {
          code: R.cite.doc,
          title: R.cite.docTitle,
          section: R.cite.section,
          heading: R.clause.heading,
          before: R.clause.before,
          mark: R.clause.mark,
          figure: R.clause.figure,
          after: R.clause.after,
        }
      : null,
  claim: { text: R.answerText, cite: R.cite?.id ?? null, citeLabel: R.cite?.label ?? null },
  checks: R.checks.map((check) => ({ label: check.label, passed: check.passed, detail: check.detail })),
  checksLine,
  seal: R.hashFull
    ? {
        hash: R.hashFull,
        line: [R.headSeq !== null ? `audit #${R.headSeq}` : null, R.auditRange ? `${R.auditRange.count} records appended by this run` : null]
          .filter(Boolean)
          .join(' · '),
        released: R.released,
      }
    : null,
}

export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero: the claim, the vessel scan, the meta rail, the stat band    */}
      {/* ---------------------------------------------------------------- */}
      <section className="lp-hero" aria-labelledby="hero-title">
        <div className="lp-shell lp-hero-grid">
          <div className="copy">
            <p className="lp-eyebrow lp-load-1">{HERO.eyebrow}</p>
            <h1 id="hero-title" className="lp-display lp-load-2">
              {HERO.title}{' '}
              <b>
                <span aria-hidden className="lp-letters">
                  {Array.from(HERO.titleKey).map((ch, i) => (
                    <span key={i} style={at(i)}>
                      {ch}
                    </span>
                  ))}
                </span>
                <span className="sr-only">{HERO.titleKey}</span>
              </b>
            </h1>
            <p className="lp-lede lp-load-3">{HERO.lede}</p>
            <div className="lp-actions lp-load-3">
              <Link href={HERO.primary.href} className="lp-btn primary">
                {HERO.primary.label}
                <span className="ar" aria-hidden>
                  →
                </span>
              </Link>
              <a href={HERO.how.href} className="lp-btn ghost">
                {HERO.how.label}
              </a>
            </div>
          </div>

          {reticle.length > 0 ? <HeroVessel label={reticle} note={HERO.vesselNote} /> : null}

          <dl className="lp-rail lp-load-4" aria-label={RAIL.label}>
            <div className="hd">{RAIL.label}</div>
            {rail.map((row) => (
              <div key={row.k} className="row">
                <dt>{row.k}</dt>
                <dd>{row.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lp-shell">
          <div className="lp-stats">
            <LiveEgress recorded={R.recordedEgress} />
            <div className="cell">
              <small>{STATS.cited.label}</small>
              <b>{STATS.cited.value}</b>
              {R.cite && R.claims ? (
                <span className="sub">
                  this run: {R.claims.supported}/{R.claims.total} · {R.cite.id} {R.cite.label}
                </span>
              ) : null}
            </div>
            <div className="cell">
              <small>{STATS.formula.label}</small>
              <b>{STATS.formula.value}</b>
              <span className="sub">{STATS.formula.line}</span>
            </div>
            <div className="cell">
              <small>{STATS.sealed.label}</small>
              <b>{STATS.sealed.value}</b>
              {R.headSeq !== null && R.hash8 ? (
                <span className="sub">
                  this run: #{R.headSeq} · {R.hash8}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 01 Retrieve / 02 Verify / 03 Seal                                 */}
      {/* ---------------------------------------------------------------- */}
      <Section id={CHAPTERS.id}>
        <Head id={`${CHAPTERS.id}-title`} eyebrow={CHAPTERS.eyebrow} title={CHAPTERS.title} strong={CHAPTERS.titleKey} lede={CHAPTERS.lede} />
        <div className="lp-rise">
          <ChapterTiles
            idBase="lp-ch"
            tabs={CHAPTERS.tabs.map((tab) => ({
              ...tab,
              stat:
                tab.key === 'retrieve'
                  ? [`${R.retrieve.count} passages`, R.retrieve.time].filter(Boolean).join(' · ')
                  : tab.key === 'verify'
                    ? checksLine
                    : R.headSeq !== null && R.hash8
                      ? `#${R.headSeq} · ${R.hash8}`
                      : null,
            }))}
            panels={[retrievePanel, verifyPanel, sealPanel]}
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* The proof sequence, and the chain it closes                       */}
      {/* ---------------------------------------------------------------- */}
      <Section id={PROOF_SEQ.id}>
        <Head id={`${PROOF_SEQ.id}-title`} eyebrow={PROOF_SEQ.eyebrow} title={PROOF_SEQ.title} strong={PROOF_SEQ.titleKey} lede={PROOF_SEQ.lede} />
        <ProofSequence data={proofData} />
        {R.chain.length > 0 ? (
          <div className="lp-verify-wrap">
            <div className="lp-verify-head">
              <p className="lp-eyebrow">{CHAIN_VERIFY.label}</p>
              <h3>{CHAIN_VERIFY.title}</h3>
              <p>{CHAIN_VERIFY.line}</p>
            </div>
            <ChainVerify records={R.chain.map((record) => ({ seq: record.seq, category: record.category, action: record.action, line: record.line }))} head={R.hashFull} />
          </div>
        ) : null}
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* The run, replayed                                                 */}
      {/* ---------------------------------------------------------------- */}
      <Section id={REPLAY.id}>
        <Head id={`${REPLAY.id}-title`} eyebrow={REPLAY.eyebrow} title={REPLAY.title} strong={REPLAY.titleKey} lede={REPLAY.lede} />
        <div className="lp-rise">
          <RunReplay lines={R.replay} runId={R.runId} total={R.total} labels={{ speed: REPLAY.speed, again: REPLAY.again, skip: REPLAY.skip, still: REPLAY.still }} />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* What people ask it                                                */}
      {/* ---------------------------------------------------------------- */}
      <Section id={USE_CASES.id}>
        <Head id={`${USE_CASES.id}-title`} eyebrow={USE_CASES.eyebrow} title={USE_CASES.title} strong={USE_CASES.titleTurn} lede={USE_CASES.lede} />
        <ul className="lp-cases lp-rise">
          {cases.map((item, i) => {
            const command = item.text.match(/^(\/[a-z-]+)\s+(.*)$/)
            return (
              <li key={item.text}>
                <span className="kind">
                  <span>{pad(i + 1)}</span> {item.kind}
                </span>
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
        <p className="lp-note">{USE_CASES.note}</p>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* The product, screen by screen                                     */}
      {/* ---------------------------------------------------------------- */}
      <Section id="product">
        <Head
          id="product-title"
          eyebrow="Product"
          title="One workbench."
          strong="Every step on the record."
          lede="The thread, skills, harnesses, the approval queue, the sandbox and the audit chain, as they ran on the demo host when these were captured."
        />
        <div className="lp-rise lp-gap">
          <ProductGallery slides={GALLERY} variant="dark" />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Security: each claim something the reader can check               */}
      {/* ---------------------------------------------------------------- */}
      <Section id={PROOF.id}>
        <Head id={`${PROOF.id}-title`} eyebrow={PROOF.eyebrow} title={PROOF.title} strong={PROOF.titleTurn} lede={PROOF.lede} />
        <div className="lp-bento lp-rise">
          {R.audit.tail.length > 0 ? (
            <article className="lp-tile wide">
              <div>
                <h3 className="ti">{BENTO.tamper.title}</h3>
                <p className="li">{BENTO.tamper.line}</p>
              </div>
              <ChainTamper
                records={R.audit.tail.map((record) => ({ sequence: record.sequence, line: record.line }))}
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
            {R.attacks.length > 0 ? <AttackList attacks={R.attacks} foot={R.attacksFoot} /> : null}
          </article>
          <article className="lp-tile">
            <div>
              <h3 className="ti">{BENTO.requests.title}</h3>
              <p className="li">{BENTO.requests.line}</p>
            </div>
            <PageRequests />
          </article>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Limits, one line each                                             */}
      {/* ---------------------------------------------------------------- */}
      <Section id={LIMITS.id}>
        <Head id={`${LIMITS.id}-title`} eyebrow={LIMITS.eyebrow} title={LIMITS.title} strong={LIMITS.titleTurn} lede={LIMITS.lede} />
        <ol className="lp-limits lp-rise">
          {limits.map((item, i) => (
            <li key={item.id}>
              <span className="n">{pad(i + 1)}</span>
              <span className="t">{item.title}</span>
              <span className="l">{item.line}</span>
            </li>
          ))}
        </ol>
        <a href={LIMITS.readme.href} target="_blank" rel="noreferrer" className="lp-link">
          {LIMITS.readme.label} <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Get started                                                       */}
      {/* ---------------------------------------------------------------- */}
      <Section id={RUN_IT.id}>
        <Head id={`${RUN_IT.id}-title`} eyebrow={RUN_IT.eyebrow} title={RUN_IT.title} strong={RUN_IT.titleEm} lede={RUN_IT.lede} />
        <div className="lp-start lp-rise">
          <CopyCommands lines={[...RUN_IT.commands]} />
          <ol className="lp-next">
            {RUN_IT.next.map((line, i) => (
              <li key={line}>
                <span className="n">{pad(i + 1)}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </div>
      </Section>
    </>
  )
}
