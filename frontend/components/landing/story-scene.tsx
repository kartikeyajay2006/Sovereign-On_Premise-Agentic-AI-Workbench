'use client'

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { AegisMark } from '@/components/aegis-logo'

export interface SceneStep {
  key: string
  label: string
  title: string
  line: string
  /** What the record timed or counted for this step, if it did. */
  time: string | null
}

export interface SceneData {
  /** The run's short id and the address the window shows. */
  runId: string
  url: string
  skill: { id: string; name: string } | null
  input: string
  classify: string | null
  passages: Array<{ id: string; label: string; score: string | null; cited: boolean }>
  retrieveTime: string | null
  draftLine: string | null
  draftTime: string | null
  answer: string
  citeId: string
  citeLabel: string
  checks: Array<{ label: string; passed: boolean }>
  checksLine: string | null
  clause: { doc: string; section: string; heading: string; before: string; mark: string; figure: string; after: string } | null
  chain: Array<{ seq: number; what: string; hash: string }>
  seal: string | null
  total: string | null
  status: string
  steps: SceneStep[]
}

/** 0 before a, 1 after b, linear between. */
const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)))
const ease = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * How far the scene runs, in steps: the hero, the five steps, and a short
 * beat on the sealed run. Each step's motion finishes in the first two
 * thirds of its stretch, so the rest of it is for reading.
 */
const LENGTH = 6

/**
 * The page's one scene: the recorded run, played in the workbench as the
 * reader scrolls.
 *
 * The hero's window lies back under the headline; scrolling stands it up
 * and moves it aside for the steps, and then the run happens in it, in the
 * order the record gives: the question typed and classified, the passages
 * found and fanned out, the answer written with its citation, every claim
 * checked while the cited clause comes out marked in pen, and the audit
 * records chained and sealed. Every word and figure in it is the record's.
 *
 * One passive scroll listener, throttled to a frame, writes a handful of
 * custom properties on the stage; everything that moves reads them in CSS,
 * as opacity and transform only, so the scene composites without layout.
 * Under reduced motion, and below 1200px where there is no room beside the
 * window for the steps, the scene is not played: the page shows the run as
 * it ended, and the steps as a list.
 */
export function StoryScene({ data, hero }: { data: SceneData; hero: ReactNode }) {
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const section = root.current
    const el = stage.current
    if (!section || !el) return
    const wide = window.matchMedia('(min-width: 1200px) and (prefers-reduced-motion: no-preference)')
    let frame = 0
    let lastStep = -1

    const write = () => {
      frame = 0
      if (!wide.matches) return
      const rect = section.getBoundingClientRect()
      const travel = section.offsetHeight - window.innerHeight
      const p = travel > 0 ? Math.min(LENGTH, Math.max(0, (-rect.top / travel) * LENGTH)) : 0
      const v: Record<string, number> = {
        hero: seg(p, 0.05, 0.55),
        dock: ease(seg(p, 0.08, 1)),
        stepsIn: seg(p, 0.85, 1.05),
        type: seg(p, 1.05, 1.42),
        sent: seg(p, 1.46, 1.54),
        l1: seg(p, 1.58, 1.7),
        l2: seg(p, 2.05, 2.16),
        fan: seg(p, 2.12, 2.6),
        // The passages it will not cite step back before the answer is written.
        cull: seg(p, 3.02, 3.12),
        l3: seg(p, 3.05, 3.14),
        stream: seg(p, 3.14, 3.6),
        l4: seg(p, 4.05, 4.14),
        checks: seg(p, 4.12, 4.34),
        sheet: ease(seg(p, 4.3, 4.52)),
        mark: seg(p, 4.5, 4.62),
        pen: seg(p, 4.6, 4.74),
        chain: seg(p, 5.05, 5.42),
        seal: seg(p, 5.44, 5.6),
        // The rail fills to each step's dot as that step begins.
        prog: seg(p, 1, 5),
      }
      for (const [k, value] of Object.entries(v)) el.style.setProperty(`--${k}`, value.toFixed(4))
      const step = p < 1 ? 0 : Math.min(5, Math.floor(p))
      if (step !== lastStep) {
        lastStep = step
        el.dataset.step = String(step)
        el.querySelectorAll<HTMLElement>('.rail .dot').forEach((dot, i) => {
          dot.dataset.state = i + 1 < step ? 'done' : i + 1 === step ? 'on' : 'todo'
          if (i + 1 === step) dot.setAttribute('aria-current', 'step')
          else dot.removeAttribute('aria-current')
        })
      }
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(write)
    }
    // "How it works" lands on the first step: in the played scene that is a
    // point in the scene's travel, set in CSS; laid out as a list, it is
    // wherever the list falls, so the anchor is moved there.
    const how = section.querySelector<HTMLElement>('.lp-how')
    const list = el.querySelector<HTMLElement>('.lp-scene-steps')
    const camera = el.querySelector<HTMLElement>('.lp-camera')
    const placeAnchor = () => {
      // Laid out as a list, the horizon sits where the window's top edge falls.
      if (camera && !wide.matches) el.style.setProperty('--hz-static', `${camera.offsetTop}px`)
      if (!how || !list) return
      if (wide.matches) how.style.removeProperty('top')
      else how.style.top = `${list.getBoundingClientRect().top - section.getBoundingClientRect().top}px`
    }
    const onMode = () => {
      if (wide.matches) {
        el.dataset.play = 'on'
        write()
      } else {
        delete el.dataset.play
      }
      placeAnchor()
    }
    const onResize = () => {
      onScroll()
      placeAnchor()
    }
    onMode()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    wide.addEventListener('change', onMode)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      wide.removeEventListener('change', onMode)
    }
  }, [])

  // A dot on the rail takes the reader to the start of its step.
  const go = useCallback((n: number) => {
    const section = root.current
    if (!section) return
    const top = section.getBoundingClientRect().top + window.scrollY
    const travel = section.offsetHeight - window.innerHeight
    window.scrollTo({ top: top + (travel * (n + 0.06)) / LENGTH, behavior: 'smooth' })
  }, [])

  const question = `${data.skill ? `/${data.skill.id} ` : ''}${data.input}`
  const words = data.answer.split(' ')
  const at = (i: number, n?: number) => ({ '--i': i, ...(n !== undefined ? { '--n': n } : {}) }) as CSSProperties

  return (
    <section ref={root} aria-labelledby="hero-title" className="lp-scene">
      {/* Where "How it works" lands: the start of the first step. */}
      <span id="how" aria-hidden className="lp-how" />
      <div ref={stage} className="lp-stage" data-step="0">
        {/*
          The hero's light: an ember horizon at the window's top edge, a floor
          receding to it, and three facts from the record floating by the
          window. Decoration and one reading's worth of words; every fact is
          the run's own, and all of it is static CSS but the floor's drift.
        */}
        <div className="lp-backdrop" aria-hidden>
          <div className="glow" />
          <div className="floor">
            <i />
          </div>
          <div className="horizon" />
          {data.checksLine ? (
            <p className="chip a">
              <b className="ok">✓</b> {data.checksLine}
            </p>
          ) : null}
          {data.citeId ? (
            <p className="chip b">
              <b>{data.citeId}</b> {data.citeLabel} <span>cited</span>
            </p>
          ) : null}
          {data.seal && data.chain.length > 0 ? (
            <p className="chip c">
              <span>#{data.chain[data.chain.length - 1].seq}</span> sealed <b>{data.seal}</b>
            </p>
          ) : null}
        </div>

        <div className="lp-scene-hero">{hero}</div>

        <div className="lp-camera" aria-hidden>
          <div className="lp-window">
            <div className="bar">
              <i />
              <i />
              <i />
              <span className="url">{data.url}</span>
            </div>
            <div className="body">
              <div className="side">
                <p className="brand">
                  <AegisMark size={15} />
                  AEGIS
                </p>
                <p className="new">New run</p>
                <p className="nav on">Thread</p>
                <p className="nav">Skills</p>
                <p className="nav">Harnesses</p>
                <p className="nav">Approvals</p>
                <p className="nav">Knowledge</p>
                <p className="nav">Assurance</p>
                <p className="runs">Runs</p>
                <p className="run">
                  <b />
                  {question}
                </p>
              </div>
              <div className="main">
                <div className="greet">
                  What should we <em>check</em> today?
                </div>
                <div className="convo">
                  <div className="bubble">
                    {data.skill ? (
                      <span className="sk">
                        <span className="cmd">/{data.skill.id}</span> {data.skill.name}
                      </span>
                    ) : null}
                    {data.input}
                  </div>
                  <div className="turn">
                    <div className="head">
                      <span className="state">{data.status}</span>
                      {data.total ? <span className="meta">{data.total}</span> : null}
                      {data.checksLine ? <span className="meta">{data.checksLine}</span> : null}
                    </div>
                    <div className="log">
                      {data.classify ? (
                        <p className="ln c1" style={{ ['--k' as string]: 'var(--l1)' }}>
                          <b /> Classified the request <span>· {data.classify}</span>
                        </p>
                      ) : null}
                      <p className="ln c2" style={{ ['--k' as string]: 'var(--l2)' }}>
                        <b /> Searched the knowledge base <span>· {data.passages.length} passages</span>
                        {data.retrieveTime ? <time>{data.retrieveTime}</time> : null}
                      </p>
                      <p className="ln c3" style={{ ['--k' as string]: 'var(--l3)' }}>
                        <b /> Drafted the answer {data.draftLine ? <span>· {data.draftLine}</span> : null}
                        {data.draftTime ? <time>{data.draftTime}</time> : null}
                      </p>
                      <p className="ln c4" style={{ ['--k' as string]: 'var(--l4)' }}>
                        <b /> Checked every claim{' '}
                        <span>
                          · {data.checks.filter((c) => c.passed).length} of {data.checks.length} passed
                        </span>
                      </p>
                      <p className="checks" style={at(0, data.checks.length)}>
                        {data.checks.map((check, i) => (
                          <span key={check.label} style={at(i)} className={check.passed ? 'ok' : 'no'}>
                            {check.passed ? '✓' : '✕'} {check.label}
                          </span>
                        ))}
                      </p>
                    </div>
                    <p className="answer" style={at(0, words.length)}>
                      {words.map((word, i) => (
                        <span key={i} style={at(i)}>
                          {word}{' '}
                        </span>
                      ))}
                      <span className="cite">{data.citeId}</span>
                    </p>
                    <p className="source">
                      <b>{data.citeId}</b> {data.citeLabel}
                    </p>
                  </div>
                </div>
                <div className="composer">
                  <span className="typed" style={at(0, question.length)}>
                    {Array.from(question).map((ch, i) => (
                      <span key={i} style={at(i)}>
                        {ch}
                      </span>
                    ))}
                  </span>
                  <span className="ph">Ask about a procedure, a report or a calculation</span>
                  <span className="send">↑</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lp-ring" />

          {/* The passages retrieval found, fanned out beside the window. */}
          <div className="lp-cards">
            {data.passages.map((unit, i) => (
              <div
                key={unit.id}
                className={unit.cited ? 'card cited' : 'card'}
                style={{ ['--i' as string]: i, ['--dim' as string]: unit.cited ? 0 : 1 } as CSSProperties}
              >
                <b>{unit.id}</b>
                <span>{unit.label}</span>
                {unit.score ? <em>{unit.score}</em> : null}
              </div>
            ))}
          </div>

          {/* The clause the answer rests on, out of its passage, marked. */}
          {data.clause ? (
            <div className="lp-clause">
              <p className="hd">
                <span>{data.clause.doc}</span>
                <span>{data.clause.section}</span>
              </p>
              <p className="h">{data.clause.heading}</p>
              <p className="b">
                {data.clause.before}
                <span className="mk">
                  {data.clause.mark}
                  <span className="fig">
                    {data.clause.figure}
                    <svg viewBox="0 0 120 44" preserveAspectRatio="none">
                      <path d="M24 5 C 104 1, 118 21, 102 36 C 84 46, 20 44, 7 30 C -3 17, 22 5, 70 3" />
                    </svg>
                  </span>
                </span>
                {data.clause.after}
              </p>
            </div>
          ) : null}

          {/* The records the run appended, each carrying the hash before it. */}
          <div className="lp-chain">
            {data.chain.map((record, i) => (
              <div key={record.seq} className="blk" style={{ ['--i' as string]: i } as CSSProperties}>
                {i > 0 ? <i className="link" /> : null}
                <p className="s">
                  #{record.seq} <span>{record.what.split(' · ')[0]}</span>
                </p>
                <p className="w">{record.what.split(' · ').slice(1).join(' · ')}</p>
                <p className="x">{record.hash.slice(0, 12)}…</p>
              </div>
            ))}
            {data.seal ? (
              <p className="seal">
                sealed <b>{data.seal}</b>
              </p>
            ) : null}
          </div>
        </div>
        {/* The steps: a list under the window, or beside it while the run plays. */}
        <div className="lp-scene-steps">
          <div className="rail">
            <i />
            {data.steps.map((step, i) => (
              <button
                key={step.key}
                type="button"
                className="dot"
                data-state="todo"
                style={{ ['--y' as string]: data.steps.length > 1 ? i / (data.steps.length - 1) : 0 } as CSSProperties}
                aria-label={`Step ${i + 1}: ${step.label}`}
                title={`${String(i + 1).padStart(2, '0')} ${step.label}`}
                onClick={() => go(i + 1)}
              />
            ))}
          </div>
          {data.steps.map((step, i) => (
            <div key={step.key} className="step" data-n={i + 1}>
              <p className="n">
                <span>{String(i + 1).padStart(2, '0')}</span> {step.label}
                {step.time ? <span className="t">{step.time}</span> : null}
              </p>
              <p className="h">{step.title}</p>
              <p className="l">{step.line}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
