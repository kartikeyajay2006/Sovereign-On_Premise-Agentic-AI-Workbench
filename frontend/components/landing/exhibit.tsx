'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface ExhibitProps {
  /** Over the exhibit: what it is. */
  label: string
  /** The run it was taken from. */
  runId: string
  /** The document and section the answer cites, as the sheet's header prints them. */
  doc: string
  section: string
  /** The section's own heading, from the passage. */
  heading: string
  /** The passage, split around the phrase the answer rests on. */
  before: string
  /** The phrase, up to the figure. */
  mark: string
  /** The figure the answer states, at the end of the phrase: circled. */
  figure: string
  after: string
  /** The passage's id in the answer: "S1". */
  citeId: string
  /** The run's own status word and the line beside it. */
  status: string
  meta: string
  /** The answer as it was released, without its markers. */
  answer: string
  /** Under the answer: where it points and where it was recorded. */
  foot: string
}

/**
 * Exhibit A: the answer beside the passage it rests on, the phrase marked in
 * highlighter, the figure circled in pen and a thread run from it to the
 * answer's citation. Every word on the sheet and the card is the run's own
 * record; the marking is drawn once, when the exhibit is first reached.
 *
 * The pen and the thread are measured from where the figure and the citation
 * actually set, so they follow the text at any width.
 */
export function Exhibit(props: ExhibitProps) {
  const root = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLElement>(null)
  const figureRef = useRef<HTMLSpanElement>(null)
  const chip = useRef<HTMLSpanElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  const [ink, setInk] = useState<{ pen: string; thread: string; marginTop: number } | null>(null)

  const measure = useCallback(() => {
    const r = row.current?.getBoundingClientRect()
    const s = sheet.current?.getBoundingClientRect()
    const f = figureRef.current?.getBoundingClientRect()
    const c = chip.current?.getBoundingClientRect()
    const a = card.current?.getBoundingClientRect()
    if (!r || !s || !f || !c || !a) return
    const x = f.left - r.left
    const y = f.top - r.top
    const cx = x + f.width / 2
    const cy = y + f.height / 2
    const rx = f.width / 2 + 12
    const ry = f.height / 2 + 7
    // A pen ellipse that does not quite close, as a hand draws one.
    const pen = `M ${cx - rx * 0.25} ${cy - ry} C ${cx + rx * 1.1} ${cy - ry * 1.15}, ${cx + rx * 1.15} ${cy + ry * 1.1}, ${cx} ${cy + ry} C ${cx - rx * 1.2} ${cy + ry * 1.05}, ${cx - rx * 1.15} ${cy - ry * 1.05}, ${cx + rx * 0.35} ${cy - ry * 1.2}`
    // The thread runs from the pen to the answer card's edge, level with the
    // line its citation sits on, so it never crosses the answer's words.
    const sx = cx + rx
    const ex = a.left - r.left - 6
    const ey = c.top - r.top + c.height / 2
    const thread = `M ${sx} ${cy} C ${sx + (ex - sx) * 0.45} ${cy}, ${ex - (ex - sx) * 0.45} ${ey}, ${ex} ${ey}`
    setInk({ pen, thread, marginTop: f.top - s.top - 4 })
  }, [])

  useEffect(() => {
    const el = root.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      setOn(true)
    } else {
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setOn(true)
            io.disconnect()
          }
        },
        { threshold: 0.3 },
      )
      io.observe(el)
      return () => io.disconnect()
    }
  }, [])

  useEffect(() => {
    measure()
    let alive = true
    document.fonts?.ready.then(() => alive && measure())
    const ro = new ResizeObserver(() => measure())
    if (row.current) ro.observe(row.current)
    return () => {
      alive = false
      ro.disconnect()
    }
  }, [measure])

  return (
    <div ref={root} className={cn('lp-exhibit', on && 'on')}>
      <div className="lp-exhibit-label">
        <span>{props.label}</span>
        <span className="lp-mono">{props.runId}</span>
      </div>
      <div ref={row} className="lp-exhibit-row">
        <article ref={sheet} className="lp-sheet" aria-label={`${props.doc} ${props.section}, as retrieved`}>
          <div className="hd">
            <span>{props.doc}</span>
            <span>{props.section}</span>
          </div>
          <h3>{props.heading}</h3>
          <p>
            {props.before}
            <span className="lp-mark">
              {props.mark}
              <span ref={figureRef}>{props.figure}</span>
            </span>
            {props.after}
          </p>
          <span aria-hidden className="lp-margin" style={{ top: ink?.marginTop ?? 0 }}>
            {props.citeId}
          </span>
        </article>
        <div ref={card} className="lp-answer" onTransitionEnd={measure}>
          <div className="who">
            <span className="ok">{props.status}</span>
            <span>{props.meta}</span>
          </div>
          <p>
            {props.answer}
            <span ref={chip} className="lp-cite">
              {props.citeId}
            </span>
          </p>
          <div className="meta">{props.foot}</div>
        </div>
        {ink ? (
          <svg aria-hidden className="lp-ink-svg">
            <path className="pen" d={ink.pen} />
            <path className="thread" d={ink.thread} />
          </svg>
        ) : null}
      </div>
    </div>
  )
}
