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
  detail: string
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
  answer: string
  sources: ReplaySource[]
  steps: ReplayStep[]
  checks: ReplayCheck[]
  held: boolean
  heldFor: string
  sealed: string | null
  total: string | null
}

type Phase = 'idle' | 'asked' | 'working' | 'answering' | 'checking' | 'done'

/** Words of the answer, with [S1] markers kept as their own tokens. */
function tokenize(answer: string): string[] {
  return answer.split(/(\[[SFVCE]\d+\]|\s+)/).filter((part) => part !== '')
}

/**
 * The hero: one real run, replayed.
 *
 * Every value in it -- the question, the six passages and their scores, each
 * stage's measured duration, the answer word for word, the four checks and
 * the audit record it ended on -- comes from public/landing/run.json, the
 * same record the rest of the page reads. Only the pacing is the page's: the
 * run took minutes on a laptop CPU, the replay takes seconds, and every step
 * shows the duration it really had. It starts when it is scrolled into view,
 * stops when it leaves, and shows its final state at once under reduced
 * motion.
 */
export function RunReplay({ runId, prompt, answer, sources, steps, checks, held, heldFor, sealed, total }: RunReplayProps) {
  const tokens = useMemo(() => tokenize(answer), [answer])
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
    at(700, () => setPhase('working'))
    steps.forEach((_, i) => at(1100 + i * 650, () => setStepCount(i + 1)))
    const answerAt = 1100 + steps.length * 650 + 250
    at(answerAt, () => setPhase('answering'))
    tokens.forEach((_, i) => at(answerAt + 120 + i * 38, () => setWordCount(i + 1)))
    const checkAt = answerAt + 300 + tokens.length * 38
    at(checkAt, () => setPhase('checking'))
    checks.forEach((_, i) => at(checkAt + 200 + i * 320, () => setCheckCount(i + 1)))
    at(checkAt + 400 + checks.length * 320, () => setPhase('done'))

    return () => timers.forEach((t) => window.clearTimeout(t))
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
  const status =
    phase === 'done'
      ? null
      : phase === 'checking'
        ? 'Checking every claim'
        : phase === 'answering'
          ? 'Writing the answer'
          : steps[Math.min(stepCount, steps.length - 1)]?.active ?? 'Working'
  const passed = checks.filter((c) => c.passed).length

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
          <div className={cn('ae-replay-q', phase !== 'idle' && 'on')}>{prompt}</div>

          <div className={cn('ae-replay-a', phase !== 'idle' && phase !== 'asked' && 'on')}>
            <div className="flex items-center gap-2.5">
              <AegisLogo variant="mark" size={28} />
              {status ? (
                <span className="ae-shimmer text-[0.88rem] font-medium">{status}…</span>
              ) : (
                <span className={cn('ae-pill', held ? 'held' : 'ok')}>
                  <span className="dot" aria-hidden />
                  {held ? 'Held for review' : 'Released'}
                </span>
              )}
              {phase === 'done' && total ? (
                <span className="text-[0.8rem] text-foreground-muted">
                  {passed} of {checks.length} checks · {total}
                </span>
              ) : null}
            </div>

            {/* the run's stages, with their measured durations */}
            <ol className="ae-replay-steps">
              {steps.map((step, i) => (
                <li key={step.id} className={cn(i < stepCount && 'on')}>
                  <span className="tick" aria-hidden>
                    ✓
                  </span>
                  <span className="text-foreground">{step.label}</span>
                  <span className="truncate text-foreground-muted">{step.detail}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-foreground-muted">{step.seconds}</span>
                </li>
              ))}
            </ol>

            {/* the answer, word for word */}
            <p className="ae-replay-text" aria-live="off">
              {tokens.slice(0, wordCount).map((token, i) =>
                /^\[[SFVCE]\d+\]$/.test(token) ? (
                  <span key={i} className="ae-cite">
                    {token.slice(1, -1)}
                  </span>
                ) : token === '\n\n' || /\n\n/.test(token) ? (
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

            {/* the checks */}
            <div className="ae-replay-checks">
              {checks.map((check, i) => (
                <span
                  key={check.name}
                  title={check.detail}
                  className={cn('ae-check', i < checkCount && 'on', check.passed ? 'pass' : 'fail')}
                >
                  <span aria-hidden>{check.passed ? '✓' : '✕'}</span>
                  {check.label}
                </span>
              ))}
            </div>

            <div className={cn('ae-replay-foot', phase === 'done' && 'on')}>
              {held ? <span>Waiting for {heldFor}</span> : <span>Released</span>}
              {sealed ? <span className="font-mono">{sealed}</span> : null}
            </div>
          </div>
        </div>

        {/* sources */}
        <aside className="ae-replay-sources" aria-label="Passages retrieved">
          <p className="m-0 text-[0.75rem] font-medium text-foreground-muted">Sources</p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
            {sources.map((source, i) => {
              const shown = stepCount >= Math.min(2, steps.length) || phase === 'done'
              const lit = citedSoFar.has(source.id)
              return (
                <li
                  key={source.id}
                  className={cn('ae-src', shown && 'on', lit && 'lit')}
                  style={{ transitionDelay: shown ? `${i * 60}ms` : '0ms' }}
                >
                  <span className="id">{source.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8rem] font-medium text-foreground">{source.code}</span>
                    <span className="block truncate text-[0.72rem] text-foreground-muted">{source.section}</span>
                  </span>
                  {typeof source.score === 'number' ? (
                    <span className="score">
                      <span className="track" aria-hidden>
                        <span className="bar" style={{ width: shown ? `${Math.round(source.score * 100)}%` : '0%' }} />
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
      {working ? <span className="sr-only" aria-live="polite">{status}</span> : null}
    </div>
  )
}
