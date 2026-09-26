'use client'

import { useEffect, useRef, type CSSProperties } from 'react'

export interface ProofData {
  labels: {
    document: { label: string; title: string }
    excerpt: { label: string; title: string }
    claim: { label: string; title: string }
    checks: { label: string; title: string }
    seal: { label: string; title: string }
    stamp: string
    held: string
  }
  doc: {
    code: string
    title: string
    section: string
    heading: string
    before: string
    mark: string
    figure: string
    after: string
  } | null
  claim: { text: string; cite: string | null; citeLabel: string | null }
  checks: Array<{ label: string; passed: boolean; detail: string }>
  checksLine: string | null
  seal: { hash: string; line: string | null; released: boolean } | null
}

const at = (i: number) => ({ ['--i' as string]: i }) as CSSProperties

/**
 * The proof sequence: one answer followed from its page to its seal, in five
 * steps that play as each scrolls into view.
 *
 *   document  the procedure's page, wiped in
 *   excerpt   the clause, with the lock's corner brackets closing on it
 *   claim     the answer's sentence, and the trace drawn to its passage
 *   checks    one square per check, ticked
 *   seal      the report hash resolving left to right, a lime rule, SEALED
 *
 * Where the browser has scroll-driven animations the first four are tied to
 * the scroll itself (animation-timeline: view(), in landing.css). Everywhere
 * else this component marks each step data-on as it is reached and the same
 * motions run once, on time. The seal is an event, not a position, so it
 * always runs on time, and only for a released run. With no JavaScript, or
 * under reduced motion, every step is drawn finished.
 */
export function ProofSequence({ data }: { data: ProofData }) {
  const root = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const steps = Array.from(el.querySelectorAll<HTMLElement>('.step'))
    if (typeof IntersectionObserver === 'undefined') {
      steps.forEach((step) => (step.dataset.on = ''))
      return
    }
    el.dataset.armed = ''
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            ;(entry.target as HTMLElement).dataset.on = ''
            io.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -25% 0px', threshold: 0.2 },
    )
    steps.forEach((step) => io.observe(step))
    return () => io.disconnect()
  }, [])

  const { labels, doc, claim, checks, seal } = data
  const n = (i: number) => String(i).padStart(2, '0')
  let step = 0

  return (
    <ol ref={root} className="lp-pf">
      {doc ? (
        <li className="step" data-k="document">
          <Caption n={n(++step)} {...labels.document} />
          <div className="fig">
            <div className="sheet fx">
              <p className="hd">
                <span>{doc.code}</span>
                <span>{doc.title}</span>
              </p>
              <p className="sec">{doc.heading}</p>
              <p className="body">
                {doc.before} <span className="mk">{doc.mark} {doc.figure}</span>
                {doc.after}
              </p>
            </div>
          </div>
        </li>
      ) : null}

      {doc ? (
        <li className="step" data-k="excerpt">
          <Caption n={n(++step)} {...labels.excerpt} />
          <div className="fig">
            <div className="excerpt">
              <p className="src">
                {claim.cite ? <b>{claim.cite}</b> : null} {doc.code} {doc.section}
              </p>
              <blockquote className="q">
                {doc.mark} <strong>{doc.figure}</strong>
                <span className="lock fx" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </blockquote>
            </div>
          </div>
        </li>
      ) : null}

      <li className="step" data-k="claim">
        <Caption n={n(++step)} {...labels.claim} />
        <div className="fig">
          <div className="claim">
            <p className="a">
              {claim.text} {claim.cite ? <span className="chip">{claim.cite}</span> : null}
            </p>
            {claim.cite && claim.citeLabel ? (
              <div className="trace">
                <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
                  <path d="M92 0V14H8V40" pathLength={1} className="fx" vectorEffect="non-scaling-stroke" />
                </svg>
                <p className="to">
                  <b>{claim.cite}</b> {claim.citeLabel}
                  {doc ? <span> · {doc.figure}</span> : null}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </li>

      {checks.length > 0 ? (
        <li className="step" data-k="checks">
          <Caption n={n(++step)} {...labels.checks} />
          <div className="fig">
            <ul className="checks">
              {checks.map((check, i) => (
                <li key={check.label} className={check.passed ? 'ok' : 'no'} style={at(i)}>
                  <span className="sq fx" aria-hidden />
                  <span className="t">
                    {check.label}
                    <span className="sr-only">{check.passed ? ': passed' : ': failed'}</span>
                  </span>
                  <span className="d">{check.detail}</span>
                </li>
              ))}
            </ul>
            {data.checksLine ? <p className="foot">{data.checksLine}</p> : null}
          </div>
        </li>
      ) : null}

      {seal ? (
        <li className="step" data-k="seal" data-released={seal.released ? '' : undefined}>
          <Caption n={n(++step)} {...labels.seal} />
          <div className="fig">
            <div className="seal">
              <p className="hex" aria-label={`SHA-256 ${seal.hash}`}>
                {Array.from(seal.hash).map((ch, i) => (
                  <span key={i} style={at(i)} aria-hidden>
                    {ch}
                  </span>
                ))}
              </p>
              <i className="rule" aria-hidden />
              <p className="foot">
                {seal.line ? <span>{seal.line}</span> : null}
                {seal.released ? <span className="stamp">{labels.stamp}</span> : <span className="held">{labels.held}</span>}
              </p>
            </div>
          </div>
        </li>
      ) : null}
    </ol>
  )
}

function Caption({ n, label, title }: { n: string; label: string; title: string }) {
  return (
    <div className="cap">
      <p className="k">
        <span>{n}</span> {label}
      </p>
      <p className="h">{title}</p>
    </div>
  )
}
