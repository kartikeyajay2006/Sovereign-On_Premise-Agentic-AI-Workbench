import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { ChainTamper } from '@/components/landing/chain-tamper'
import { ChainVerify } from '@/components/landing/chain-verify'
import { CopyCommands } from '@/components/landing/copy-commands'
import { Crew } from '@/components/landing/crew'
import { CHAIN_VERIFY, CREW_COPY, HERO, PROOF_SEQ, RAIL, RUN_IT, STATS, TAMPER } from '@/components/landing/copy'
import { HeroVessel } from '@/components/landing/hero-vessel'
import * as R from '@/components/landing/landing-data'
import { LiveEgress } from '@/components/landing/live-egress'
import { ProductGallery, type GallerySlide } from '@/components/landing/product-gallery'
import { ProofSequence, type ProofData } from '@/components/landing/proof-sequence'
import { RevealSection } from '@/components/landing/reveal-section'

// --------------------------------------------------------------------------- //
// The public page, Hi-Vis Monochrome.
//
// Every figure and every quoted word about the run comes from
// public/landing/run.json through landing-data.ts, derived on the server at
// render. The only other numbers on the page are read live by the visitor's
// browser (egress) or recomputed there (hashes).
//
// Five sections: hero, the crew, proof, the workbench, run it.
// --------------------------------------------------------------------------- //

const checksLine = R.checks.length > 0 ? `${R.passedChecks} of ${R.checks.length} checks passed` : null

/** The hero reticle's label, a line a part: clause, figure, claims traced. */
const reticle = R.reticleLabel ? R.reticleLabel.split(' · ') : []

/** The meta rail: small uppercase lines, each value the record's. */
const rail = ([
  R.total ? { k: RAIL.time, v: R.total } : null,
  R.modelName ? { k: RAIL.model, v: R.modelName } : null,
  checksLine ? { k: RAIL.checks, v: `${R.passedChecks} of ${R.checks.length} passed` } : null,
  R.headSeq !== null && R.hash8 ? { k: RAIL.chain, v: `record #${R.headSeq}` } : null,
  { k: RAIL.recorded, v: R.capturedOn },
] as Array<{ k: string; v: string } | null>).filter((row): row is { k: string; v: string } => row !== null)


// The gallery: screenshots of the running product, captured on the demo host.
const GALLERY: GallerySlide[] = [
  {
    id: 'thread',
    label: 'Thread',
    title: 'Ask in plain language.',
    body: 'A run reads like a terminal session: each step with its time, the passages it found, the model’s tokens and the checks, then the cited answer.',
    light: '/landing/shots/thread-light.png',
    dark: '/landing/shots/thread-dark.png',
    alt: 'The AEGIS thread: a /clause request delivered in 39.6 s with four of four checks passed, and the answer citing S1, SOP-INS-014 §2.2.',
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
    alt: 'The sandbox: a payload that opens a socket, refused by the static validator before any process started.',
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
                  this answer: {R.cite.label}, {R.claims.supported} of {R.claims.total} {R.claims.total === 1 ? 'claim' : 'claims'} traced
                </span>
              ) : null}
            </div>
            <div className="cell">
              <small>{STATS.sealed.label}</small>
              <b>{STATS.sealed.value}</b>
              {R.headSeq !== null && R.hash8 ? (
                <span className="sub">
                  this run: record #{R.headSeq}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The crew: the orchestrator's stages, and the run's relay          */}
      {/* ---------------------------------------------------------------- */}
      <Section id={CREW_COPY.id}>
        <Head id={`${CREW_COPY.id}-title`} eyebrow={CREW_COPY.eyebrow} title={CREW_COPY.title} strong={CREW_COPY.titleKey} lede={CREW_COPY.lede} />
        <Crew
          scenes={R.crewScenes}
          relay={R.relay}
          caption={R.relayCaption}
          labels={{
            runsOn: CREW_COPY.runsOn,
            across: CREW_COPY.across,
            note: CREW_COPY.note,
            relayLabel: CREW_COPY.relay.label,
            legend: CREW_COPY.relay.legend,
            unrecorded: CREW_COPY.relay.unrecorded,
            ran: CREW_COPY.relay.ran,
            skipped: CREW_COPY.relay.skipped,
          }}
        />
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
        {R.audit.tail.length > 0 ? (
          <div className="lp-verify-wrap">
            <div className="lp-verify-head">
              <p className="lp-eyebrow">{TAMPER.label}</p>
              <h3>{TAMPER.title}</h3>
              <p>{TAMPER.line}</p>
            </div>
            <ChainTamper
              records={R.audit.tail.map((record) => ({ sequence: record.sequence, line: record.line }))}
              edit={{ ...TAMPER.edit, path: [...TAMPER.edit.path] }}
              labels={{ restore: TAMPER.restore, verified: TAMPER.verified, broken: TAMPER.broken, brokenLast: TAMPER.brokenLast, idle: TAMPER.idle }}
            />
          </div>
        ) : null}
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* The workbench, screen by screen                                   */}
      {/* ---------------------------------------------------------------- */}
      <Section id="product">
        <Head
          id="product-title"
          eyebrow="The workbench"
          title="One workbench."
          strong="Every step on the record."
          lede="The thread, skills, harnesses, the approval queue, the sandbox and the audit chain, as they ran on the demo host when these were captured."
        />
        <div className="lp-rise lp-gap">
          <ProductGallery slides={GALLERY} variant="dark" />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Run it                                                            */}
      {/* ---------------------------------------------------------------- */}
      <Section id={RUN_IT.id}>
        <Head id={`${RUN_IT.id}-title`} eyebrow={RUN_IT.eyebrow} title={RUN_IT.title} strong={RUN_IT.titleEm} lede={RUN_IT.lede} />
        <div className="lp-start lp-rise">
          <CopyCommands lines={[...RUN_IT.commands]} />
          <ol className="lp-next">
            {RUN_IT.next.slice(0, 3).map((line, i) => (
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
