'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AegisLogo } from '@/components/aegis-logo'
import { cn } from '@/lib/utils'

export interface ReplaySource {
  id: string
  code: string
  section: string
  score: number | null
  cited: boolean
}

export interface ReplayStep {
  id: string
  /** Done: "Searched the knowledge base". */
  label: string
  /** Under way: "Searching the knowledge base". */
  active: string
  /** Said after the title: "6 passages". */
  note: string | null
  /** Hung under the line after a ⎿: what came back. */
  result: string | null
  /** Measured duration of the stage, as recorded. */
  seconds: string | null
}

export interface ReplayCheck {
  name: string
  label: string
  passed: boolean
  detail: string
}

export interface RunReplayProps {
  runId: string
  prompt: string
  /** The skill the request went through, when it did: shown as the thread shows it. */
  skill: { id: string; name: string; input: string } | null
  answer: string
  sources: ReplaySource[]
  steps: ReplayStep[]
  checks: ReplayCheck[]
  held: boolean
  heldFor: string
  sealed: string | null
  total: string | null
  /** The run's usage, as the thread's closing line gives it. */
  usage: string | null
}

type Phase = 'idle' | 'asked' | 'working' | 'answering' | 'checking' | 'done'

/** Words of the answer, with [S1] markers kept as their own tokens. */
function tokenize(answer: string): string[] {
  return answer.split(/(\[[SFVCE]\d+\]|\s+)/).filter((part) => part !== '')
}

const SPINNER = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']

function Spinner() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120)
    return () => window.clearInterval(id)
  }, [])
  return (
    <span className="bullet spin" aria-hidden>
      {SPINNER[frame]}
    </span>
  )
}

/**
 * The hero: one real run, replayed the way the thread shows it.
 *
 * A bullet for each stage the run went through, what came back hung under
 * it after a ⎿ -- the passages by document and section, the model's tokens
 * and speed, the verifier's checks -- the answer word for word, and the line
 * the turn ends on: how long it worked and what it cost. Every value comes
 * from public/landing/run.json, the record the rest of the page reads. Only
 * the pacing is the page's: the run took its recorded time on a laptop CPU,
 * the replay takes seconds, and each line shows the duration it really had.
 * It plays when scrolled into view, stops when it leaves, and under reduced
 * motion shows its end state at once.
 */
export function RunReplay({
  runId,
  prompt,
  skill,
  answer,
  sources,
  steps,
  checks,
  held,
  heldFor,
  sealed,
  total,
  usage,
}: RunReplayProps) {
  const tokens = useMemo(() => tokenize(answer), [answer])
  const draftAt = steps.findIndex((step) => step.id === 'draft')
  const verifyAt = steps.findIndex((step) => step.id === 'verify')
  const [phase, setPhase] = useState<Phase>('idle')
  const [stepCount, setStepCount] = useState(0)
  const [wordCount, setWordCount] = useState(0)
  const [checkCount, setCheckCount] = useState(0)
  const [visible, setVisible] = useState(false)
  const [run, setRun] = useState(0)
  const root = useRef<HTMLDivElement>(null)

  const finish = useCallback(() => {
    setPhase('done')
    setStepCount(steps.length)
    setWordCount(tokens.length)
    setCheckCount(checks.length)
  }, [steps.length, tokens.length, checks.length])

  // Play only while on screen.
  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish()
      return
    }
    if (phase === 'done') return
    const timers: number[] = []
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))

    setPhase('asked')
    setStepCount(0)
    setWordCount(0)
    setCheckCount(0)
    let t = 700
    at(t, () => setPhase('working'))
    steps.forEach((_, i) => {
      if (i === draftAt) {
        // The draft streams under the log while its line turns.
        at(t + 350, () => setPhase('answering'))
        tokens.forEach((__, w) => at(t + 450 + w * 36, () => setWordCount(w + 1)))
        t += 450 + tokens.length * 36 + 300
        at(t, () => {
          setPhase('working')
          setStepCount(i + 1)
        })
      } else if (i === verifyAt) {
        at(t + 250, () => setPhase('checking'))
        t += 700 + checks.length * 260
        checks.forEach((__, c) => at(t - checks.length * 260 + c * 260, () => setCheckCount(c + 1)))
        at(t, () => setStepCount(i + 1))
      } else {
        t += 650
        at(t, () => setStepCount(i + 1))
      }
    })
    at(t + 350, () => setPhase('done'))

    return () => timers.forEach((timer) => window.clearTimeout(timer))
    // `run` restarts the replay; the rest are fixed for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, run])

  const replay = () => {
    setPhase('idle')
    setRun((n) => n + 1)
  }

  const citedSoFar = new Set(
    tokens
      .slice(0, wordCount)
      .filter((t) => /^\[[SFVCE]\d+\]$/.test(t))
      .map((t) => t.slice(1, -1)),
  )
  const working = phase === 'working' || phase === 'answering' || phase === 'checking'
  const activeStep = working ? steps[stepCount] ?? null : null
  const passed = checks.filter((c) => c.passed).length
  const retrieveAt = steps.findIndex((step) => step.id === 'retrieve')
  const sourcesShown = phase === 'done' || (retrieveAt >= 0 ? stepCount > retrieveAt : stepCount > 0)

  return (
    <div ref={root} className="ae-replay">
      {/* window bar */}
      <div className="ae-replay-bar">
        <span className="flex items-center gap-2 text-[0.8rem] font-medium text-foreground">
          <AegisLogo variant="mark" size={18} />
          AEGIS
        </span>
        <span className="ml-auto flex items-center gap-3 text-[0.75rem] text-foreground-muted">
          <span className="hidden sm:inline">Replay of recorded run {runId}</span>
          <button type="button" onClick={replay} className="ae-replay-again" aria-label="Replay the run">
            Replay
          </button>
        </span>
      </div>

      <div className="ae-replay-body">
        {/* conversation */}
        <div className="min-w-0">
          <div className={cn('ae-replay-q', phase !== 'idle' && 'on')}>
            {skill ? (
              <>
                <span className="ae-replay-skill">
                  <span className="cmd">/{skill.id}</span>
                  <span className="name">{skill.name}</span>
                </span>
                {skill.input}
              </>
            ) : (
              prompt
            )}
          </div>

          <div className={cn('ae-replay-a', phase !== 'idle' && phase !== 'asked' && 'on')}>
            <div className="flex items-center gap-2.5">
              <AegisLogo variant="mark" size={26} />
              {phase === 'done' ? (
                <span className={cn('ae-pill', held ? 'held' : 'ok')}>
                  <span className="dot" aria-hidden />
                  {held ? 'Held for review' : 'Delivered'}
                </span>
              ) : (
                <span className="ae-pill run">
                  <span className="dot" aria-hidden />
                  Working
                </span>
              )}
              {phase === 'done' && total ? <span className="text-[0.8rem] text-foreground-muted">{total}</span> : null}
            </div>

            {/* the run, as a transcript */}
            <ol className="ae-replay-log" aria-label="What the run did">
              {steps.map((step, i) => {
                const done = i < stepCount
                const active = !done && activeStep?.id === step.id
                if (!done && !active) return null
                return (
                  <li key={step.id}>
                    <div className="row">
                      {active ? (
                        <Spinner />
                      ) : (
                        <span className={cn('bullet', step.id === 'verify' && passed < checks.length && 'fail')} aria-hidden>
                          ●
                        </span>
                      )}
                      <span className={cn('title', active && 'ae-shimmer')}>
                        {active ? `${step.active}…` : step.label}
                      </span>
                      {done && step.note ? <span className="note">· {step.id === 'verify' ? `${passed} of ${checks.length} passed` : step.note}</span> : null}
                      {done && step.seconds ? <span className="secs">{step.seconds}</span> : null}
                    </div>
                    {step.id === 'verify' && checkCount > 0 ? (
                      <div className="hang">
                        <span aria-hidden>⎿</span>
                        <span className="checks">
                          {checks.slice(0, checkCount).map((check) => (
                            <span key={check.name} title={check.detail} className={check.passed ? undefined : 'no'}>
                              <span className={check.passed ? 'ok' : 'no'} aria-hidden>
                                {check.passed ? '✓' : '✕'}
                              </span>{' '}
                              {check.label}
                            </span>
                          ))}
                        </span>
                      </div>
                    ) : done && step.result ? (
                      <div className="hang">
                        <span aria-hidden>⎿</span>
                        <span className="text">{step.result}</span>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ol>

            {/* the answer, word for word */}
            <p className="ae-replay-text" aria-live="off">
              {tokens.slice(0, wordCount).map((token, i) =>
                /^\[[SFVCE]\d+\]$/.test(token) ? (
                  <span key={i} className="ae-cite">
                    {token.slice(1, -1)}
                  </span>
                ) : /\n\n/.test(token) ? (
                  <Fragment key={i}>
                    <br />
                    <br />
                  </Fragment>
                ) : (
                  <span key={i} className="ae-word">
                    {token}
                  </span>
                ),
              )}
              {phase === 'answering' ? <span className="ae-caret" aria-hidden /> : null}
            </p>

            <div className={cn('ae-replay-worked', phase === 'done' && 'on')}>
              {total ? (
                <span>
                  <span aria-hidden>✻ </span>Worked for {total}
                  {usage ? ` · ${usage}` : ''}
                </span>
              ) : null}
              <span className="block">
                {held ? `Held for ${heldFor}` : 'Released'}
                {sealed ? ` · ${sealed}` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* sources */}
        <aside className="ae-replay-sources" aria-label="Passages retrieved">
          <p className="m-0 text-[0.75rem] font-medium text-foreground-muted">Sources</p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
            {sources.map((source, i) => {
              const lit = citedSoFar.has(source.id)
              return (
                <li
                  key={source.id}
                  className={cn('ae-src', sourcesShown && 'on', lit && 'lit')}
                  style={{ transitionDelay: sourcesShown ? `${i * 60}ms` : '0ms' }}
                >
                  <span className="id">{source.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8rem] font-medium text-foreground">{source.code}</span>
                    <span className="block truncate text-[0.72rem] text-foreground-muted">{source.section}</span>
                  </span>
                  {typeof source.score === 'number' ? (
                    <span className="score">
                      <span className="track" aria-hidden>
                        <span className="bar" style={{ width: sourcesShown ? `${Math.round(source.score * 100)}%` : '0%' }} />
                      </span>
                      <span className="num tabular-nums">{source.score.toFixed(2)}</span>
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </aside>
      </div>
      {working && activeStep ? (
        <span className="sr-only" aria-live="polite">
          {activeStep.active}
        </span>
      ) : null}
    </div>
  )
}
