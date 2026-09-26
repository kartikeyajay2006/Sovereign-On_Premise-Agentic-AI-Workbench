'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReplayLine } from './landing-data'

/** Replay speed: record milliseconds per wall-clock millisecond. */
const SPEED = 4

/**
 * The terminal replay: the recorded run's events, typed out as mono lines in
 * the order the record gives them, at 4× the recorded pace.
 *
 * Every line and every figure comes from the record (landing-data.ts builds
 * the lines on the server). A line the record timestamps prints its offset
 * from the task's creation; a stage the record timed only by duration prints
 * that duration once it settles. The draft line streams the answer over the
 * model's measured generation time, after the measured prompt read, with a
 * caret on the tail. Only the pacing is compressed, and the bar says by how
 * much.
 *
 * Server-rendered finished, so a page without JavaScript shows the whole
 * record. It plays once, the first time it is on screen, pauses while off
 * screen, and can be replayed or skipped to the end. Under reduced motion it
 * stays finished and the caret stays solid. Screen readers get the finished
 * transcript, not the typing.
 */
export function RunReplay({
  lines,
  runId,
  total,
  labels,
}: {
  lines: ReplayLine[]
  runId: string
  total: string | null
  labels: { speed: string; again: string; skip: string; still: string }
}) {
  const end = lines.reduce((max, line) => Math.max(max, line.end, line.at), 0)
  const [rt, setRt] = useState(end)
  const [playing, setPlaying] = useState(false)
  const [motion, setMotion] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const clock = useRef({ base: 0, from: 0, visible: false, started: false, playing: false })
  const frame = useRef(0)

  const loop = useCallback(() => {
    const c = clock.current
    const now = c.from + (performance.now() - c.base) * SPEED
    if (now >= end) {
      setRt(end)
      setPlaying(false)
      clock.current.playing = false
      frame.current = 0
      return
    }
    setRt(now)
    frame.current = window.requestAnimationFrame(loop)
  }, [end])

  const run = useCallback(
    (from: number) => {
      window.cancelAnimationFrame(frame.current)
      clock.current.base = performance.now()
      clock.current.from = from
      setRt(from)
      setPlaying(true)
      clock.current.playing = true
      if (clock.current.visible) frame.current = window.requestAnimationFrame(loop)
      else frame.current = 0
    },
    [loop],
  )

  const skip = useCallback(() => {
    window.cancelAnimationFrame(frame.current)
    frame.current = 0
    clock.current.playing = false
    setPlaying(false)
    setRt(end)
  }, [end])

  useEffect(() => {
    const el = root.current
    const query = window.matchMedia('(prefers-reduced-motion: no-preference)')
    setMotion(query.matches)
    if (!el || !query.matches || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => {
        const c = clock.current
        c.visible = entry.isIntersecting
        if (entry.isIntersecting && !c.started) {
          c.started = true
          run(0)
          return
        }
        if (!entry.isIntersecting && frame.current) {
          // Paused off screen: remember where the replay stood.
          window.cancelAnimationFrame(frame.current)
          frame.current = 0
          c.from = c.from + (performance.now() - c.base) * SPEED
        } else if (entry.isIntersecting && c.playing && !frame.current) {
          c.base = performance.now()
          frame.current = window.requestAnimationFrame(loop)
        }
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      window.cancelAnimationFrame(frame.current)
    }
  }, [loop, run])

  const shown = lines.filter((line) => rt >= line.at)
  const active = shown.at(-1) ?? null
  const done = rt >= end

  return (
    <div ref={root} className="lp-replay" data-motion={motion ? '' : undefined}>
      <div className="bar">
        <span className="id">{runId}</span>
        {total ? <span>{total} recorded</span> : null}
        <span className="speed">{motion ? labels.speed : labels.still}</span>
        {motion ? (
          <span className="ctl">
            {playing ? (
              <button type="button" onClick={skip}>
                {labels.skip}
              </button>
            ) : (
              <button type="button" onClick={() => run(0)}>
                {labels.again}
              </button>
            )}
          </span>
        ) : null}
      </div>

      <ol className="log" aria-hidden>
        {shown.map((line, i) => {
          const settled = rt >= line.end
          const isActive = line === active && !done
          return (
            <li key={i} data-tag={line.tag} data-state={settled ? 'done' : 'run'}>
              <span className="t">{line.source === 'clock' || settled ? line.stamp : '…'}</span>
              <span className="g">{line.tag}</span>
              <span className="x">
                {line.text}
                {line.meta ? <span className="m"> · {line.meta}</span> : null}
                {line.stream ? <Stream line={line} rt={rt} /> : null}
                {isActive && !line.stream ? <i className="caret" /> : null}
              </span>
            </li>
          )
        })}
        {done ? (
          <li className="prompt">
            <span className="t" />
            <span className="g">$</span>
            <span className="x">
              <i className="caret" />
            </span>
          </li>
        ) : null}
      </ol>

      <ol className="sr-only">
        {lines.map((line, i) => (
          <li key={i}>
            {line.stamp} {line.tag} {line.text}
            {line.meta ? ` · ${line.meta}` : ''}
            {line.stream ? ` · ${line.stream.text}` : ''}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The answer, streamed over the model's measured generation time. */
function Stream({ line, rt }: { line: ReplayLine; rt: number }) {
  const stream = line.stream
  if (!stream) return null
  const from = line.end - stream.ms
  const settled = rt >= line.end
  if (rt < from) {
    return (
      <span className="wait">
        {stream.wait ? <span className="m">{stream.wait}</span> : null}
        <i className="caret" />
      </span>
    )
  }
  const count = settled ? stream.text.length : Math.floor((stream.text.length * (rt - from)) / stream.ms)
  return (
    <span className="stream">
      {stream.text.slice(0, count)}
      {settled && stream.cite ? <span className="chip">{stream.cite}</span> : <i className="caret" />}
    </span>
  )
}
