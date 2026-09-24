'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * How a run is proved, told by scrolling through one.
 *
 * On a wide screen the section pins: the five steps down the left, and on
 * the right a stage that turns to each step as the page scrolls past it --
 * the request classified, the passages ranked, the answer written, the
 * checks run, the records chained. Every value on the stage is from the
 * recorded run at the top of the page, handed down by the server; nothing
 * here computes or rounds a figure of its own.
 *
 * On a narrow screen there is no pin: each step is followed by its stage,
 * drawn complete. The same DOM serves both -- each stage is rendered twice,
 * once inline for the narrow layout and once on the pinned stage -- so the
 * server's first paint is already the right layout and nothing reflows on
 * hydration. Motion is opacity and transform, set off by the step becoming
 * the current one; under reduced motion every stage is simply drawn.
 */

export interface PipelineStep {
  key: string
  label: string
  title: string
  line: string
}

export interface PipelinePassage {
  id: string
  code: string
  section: string
  score: number | null
  cited: boolean
}

export interface PipelineCheck {
  label: string
  passed: boolean
  note: string
}

export interface PipelineRecord {
  sequence: number
  what: string
  hash: string
}

export interface PipelineData {
  runId: string
  skill: { id: string; name: string } | null
  request: string
  classify: { tags: string[]; ms: number | null }
  retrieve: { passages: PipelinePassage[]; ms: number | null; mode: string | null }
  draft: { answer: string; model: string | null; meta: string | null }
  verify: {
    claim: string | null
    passage: { label: string; before: string; mark: string; after: string } | null
    checks: PipelineCheck[]
    verdict: string
  }
  record: { records: PipelineRecord[]; summary: string | null }
}

type Scene = (props: { data: PipelineData }) => ReactNode

const i = (n: number) => ({ '--i': n }) as CSSProperties

function ClassifyScene({ data }: { data: PipelineData }) {
  return (
    <div className="ae-sc">
      <p className="ae-sc-label">Request</p>
      <div className="ae-sc-req">
        {data.skill && (
          <p className="sk">
            <span className="cmd">/{data.skill.id}</span> {data.skill.name}
          </p>
        )}
        <p className="q">{data.request}</p>
      </div>
      <p className="ae-sc-arrow">
        <span aria-hidden>↓</span> classified{data.classify.ms !== null ? ` in ${data.classify.ms} ms` : ''}
      </p>
      <ul className="ae-sc-tags">
        {data.classify.tags.map((tag, n) => (
          <li key={tag} style={i(n)}>
            {tag}
          </li>
        ))}
      </ul>
      <p className="ae-sc-foot">Policy reads this before a single passage is retrieved.</p>
    </div>
  )
}

function RetrieveScene({ data }: { data: PipelineData }) {
  const { passages, ms, mode } = data.retrieve
  return (
    <div className="ae-sc">
      <p className="ae-sc-label">
        {passages.length} passage{passages.length === 1 ? '' : 's'}, ranked
      </p>
      <ol className="ae-sc-passages">
        {passages.map((p, n) => (
          <li key={p.id} className={cn(p.cited && 'cited')} style={{ ...i(n), '--s': p.score ?? 0 } as CSSProperties}>
            <span className="id">{p.id}</span>
            <span className="doc">
              {p.code}
              {p.section ? <small> {p.section}</small> : null}
            </span>
            {p.score !== null && (
              <>
                <span className="bar" aria-hidden>
                  <i />
                </span>
                <span className="score">{p.score.toFixed(2)}</span>
              </>
            )}
          </li>
        ))}
      </ol>
      <p className="ae-sc-foot">
        {[ms !== null ? `${ms} ms` : null, mode, 'on this machine'].filter(Boolean).join(' · ')}
      </p>
    </div>
  )
}

/** The answer, word by word, with its citations as chips. */
function Words({ text }: { text: string }) {
  const parts = text.split(/(\[[SFVCE]\d+\]|\s+)/).filter((part) => part !== '' && !/^\s+$/.test(part))
  return (
    <>
      {parts.map((part, n) =>
        /^\[[SFVCE]\d+\]$/.test(part) ? (
          <span key={n} className="cite" style={i(n)}>
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={n} className="w" style={i(n)}>
            {part}{' '}
          </span>
        ),
      )}
    </>
  )
}

function DraftScene({ data }: { data: PipelineData }) {
  return (
    <div className="ae-sc">
      <p className="ae-sc-label">{data.draft.model ? `${data.draft.model}, on this machine` : 'The local model'}</p>
      <p className="ae-sc-answer">
        <Words text={data.draft.answer} />
      </p>
      {data.draft.meta && <p className="ae-sc-foot">{data.draft.meta}</p>}
    </div>
  )
}

function VerifyScene({ data }: { data: PipelineData }) {
  const { claim, passage, checks, verdict } = data.verify
  return (
    <div className="ae-sc">
      {claim && passage && (
        <div className="ae-sc-trace">
          <p className="claim">“{claim}”</p>
          <p className="to">
            <span aria-hidden>↳</span> traced to {passage.label}
          </p>
          <p className="src">
            …{passage.before}
            <mark>{passage.mark}</mark>
            {passage.after}…
          </p>
        </div>
      )}
      <ul className="ae-sc-checks">
        {checks.map((check, n) => (
          <li key={check.label} className={check.passed ? 'ok' : 'no'} style={i(n)}>
            <span className="g" aria-hidden>
              {check.passed ? '✓' : '✕'}
            </span>
            <span className="l">{check.label}</span>
            <span className="n">{check.note}</span>
          </li>
        ))}
      </ul>
      <p className="ae-sc-verdict">{verdict}</p>
    </div>
  )
}

function RecordScene({ data }: { data: PipelineData }) {
  const { records, summary } = data.record
  return (
    <div className="ae-sc">
      <p className="ae-sc-label">The run’s last records</p>
      <ol className="ae-sc-chain">
        {records.map((record, n) => (
          <li key={record.sequence} style={i(n)}>
            {n > 0 && (
              <span className="lnk">
                <span aria-hidden>│</span> prev = {records[n - 1].hash.slice(0, 8)}…
              </span>
            )}
            <span className="blk">
              <span className="seq">seq {record.sequence}</span>
              <span className="what">{record.what}</span>
              <span className="h">{record.hash.slice(0, 8)}…</span>
            </span>
          </li>
        ))}
      </ol>
      {summary && <p className="ae-sc-verdict">{summary}</p>}
    </div>
  )
}

const SCENES: Record<string, Scene> = {
  classify: ClassifyScene,
  retrieve: RetrieveScene,
  draft: DraftScene,
  verify: VerifyScene,
  record: RecordScene,
}

export function ProofPipeline({ steps, data }: { steps: readonly PipelineStep[]; data: PipelineData }) {
  const root = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(0)

  // Which step the page has scrolled to, while the section is pinned. The
  // position goes to a CSS variable for the rail's fill; React hears only a
  // change of step, a handful of times across the whole section.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const wide = window.matchMedia('(min-width: 1024px)')
    let frame = 0
    const measure = () => {
      frame = 0
      if (!wide.matches) return
      const r = el.getBoundingClientRect()
      const span = r.height - window.innerHeight
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0
      el.style.setProperty('--ae-pipe', p.toFixed(4))
      setActive(Math.min(steps.length - 1, Math.floor(p * steps.length)))
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    wide.addEventListener('change', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      wide.removeEventListener('change', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [steps.length])

  const goTo = (n: number) => {
    const el = root.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    const span = el.offsetHeight - window.innerHeight
    window.scrollTo({ top: top + span * ((n + 0.35) / steps.length), behavior: 'smooth' })
  }

  return (
    <div ref={root} className="ae-pipe" style={{ '--ae-steps': steps.length } as CSSProperties}>
      <div className="ae-pipe-pin">
        <ol className="ae-pipe-steps">
          {steps.map((step, n) => {
            const Stage = SCENES[step.key]
            return (
              <li key={step.key} className={cn('ae-pipe-step', n === active && 'on', n < active && 'done')}>
                <button type="button" onClick={() => goTo(n)} className="ae-pipe-head" aria-current={n === active ? 'step' : undefined}>
                  <span className="n">{String(n + 1).padStart(2, '0')}</span>
                  <span className="t">{step.label}</span>
                </button>
                <div className="ae-pipe-more">
                  <div>
                    <p className="h">{step.title}</p>
                    <p className="l">{step.line}</p>
                  </div>
                </div>
                {/* The narrow layout: the stage under its step, complete. */}
                <div className="ae-pipe-inline" aria-hidden>
                  <div className="ae-pipe-frame">{Stage ? <Stage data={data} /> : null}</div>
                </div>
              </li>
            )
          })}
        </ol>

        <div className="ae-pipe-stage" aria-hidden>
          <div className="ae-pipe-frame">
            <div className="ae-pipe-bar">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              <span className="run">run {data.runId}</span>
              <span className="count">
                {active + 1} / {steps.length}
              </span>
            </div>
            <div className="ae-pipe-scenes">
              {steps.map((step, n) => {
                const Stage = SCENES[step.key]
                return (
                  <div key={step.key} className={cn('ae-pipe-scene', n === active && 'on', n < active && 'past')}>
                    {Stage ? <Stage data={data} /> : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
