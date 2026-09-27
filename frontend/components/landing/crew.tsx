'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { CREW, type CrewId } from '@/lib/crew'
import type { CrewScenes, RelayCell } from './landing-data'

/**
 * The crew: the ten stages of one orchestrator, each with a small line
 * drawing in the hero vessel's manner, and under them a relay that replays
 * which stages the recorded run used.
 *
 * Motion follows the vessel's rules. Every drawing's resting state is its
 * final frame: that is what the server renders, what a page without
 * JavaScript shows and what reduced motion keeps. Where motion is welcome,
 * this component arms the drawings (data-play="wait", their start frame) and
 * plays each once as it scrolls into view, staggered across the cards that
 * arrive together; hovering or focusing a card plays its drawing again. The
 * relay then steps its lit cell through the stages that ran, once, and holds.
 * All the keyframes are in landing.css under "the crew".
 */

const STAGGER_MS = 120
/** The longest drawing, start to rest; a replay inside this window is ignored. */
const PLAY_MS = 1900
// The relay's step (420ms per stage) is in landing.css, where the animation reads it.

type Style = CSSProperties & Record<`--${string}`, string | number>
const t = (ms: number, extra?: Style): Style => ({ '--t': `${ms}ms`, ...extra })

export interface CrewProps {
  scenes: CrewScenes
  relay: RelayCell[]
  caption: string[]
  labels: {
    runsOn: string
    across: string
    note: string
    relayLabel: string
    legend: string
    unrecorded: string
    ran: string
    skipped: string
  }
}

export function Crew({ scenes, relay, caption, labels }: CrewProps) {
  const grid = useRef<HTMLOListElement>(null)
  const strip = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const list = grid.current
    const relayEl = strip.current
    if (!list || !relayEl) return
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return
    if (typeof IntersectionObserver === 'undefined') return

    const cards = Array.from(list.querySelectorAll<HTMLElement>('[data-crew]'))
    const busyUntil = new Map<HTMLElement, number>()
    let rosterDone = 0
    const timers: number[] = []

    const play = (card: HTMLElement, mode: 'in' | 're', delay: number) => {
      delete card.dataset.play
      void card.offsetWidth // restart the keyframes from their first frame
      card.style.setProperty('--d', `${delay}ms`)
      card.dataset.play = mode
      const until = performance.now() + delay + PLAY_MS
      busyUntil.set(card, until)
      rosterDone = Math.max(rosterDone, until)
    }

    for (const card of cards) card.dataset.play = 'wait'
    relayEl.dataset.play = 'wait'

    const cardIo = new IntersectionObserver(
      (entries) => {
        const arriving = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target as HTMLElement)
          .sort((a, b) => cards.indexOf(a) - cards.indexOf(b))
        arriving.forEach((card, i) => {
          cardIo.unobserve(card)
          play(card, 'in', i * STAGGER_MS)
        })
      },
      { threshold: 0.4 },
    )
    cards.forEach((card) => cardIo.observe(card))

    const replay = (event: Event) => {
      const card = event.currentTarget as HTMLElement
      if (card.dataset.play === 'wait') return
      if ((busyUntil.get(card) ?? 0) > performance.now()) return
      play(card, 're', 0)
    }
    for (const card of cards) {
      card.addEventListener('pointerenter', replay)
      card.addEventListener('focus', replay)
    }

    // The relay waits for the drawings above it to settle: one lime motion at a time.
    const relayIo = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        relayIo.disconnect()
        const wait = Math.max(0, rosterDone - performance.now())
        timers.push(
          window.setTimeout(() => {
            relayEl.dataset.play = 'on'
          }, wait),
        )
      },
      { threshold: 0.6 },
    )
    relayIo.observe(relayEl)

    return () => {
      cardIo.disconnect()
      relayIo.disconnect()
      timers.forEach((id) => window.clearTimeout(id))
      for (const card of cards) {
        card.removeEventListener('pointerenter', replay)
        card.removeEventListener('focus', replay)
      }
    }
  }, [])

  // The lit cell visits the stages that ran, in pipeline order.
  let step = 0
  const steps = relay.map((cell) => (cell.state === 'ran' ? step++ : -1))

  return (
    <div className="lp-crew-wrap">
      <ol ref={grid} className="lp-crew">
        {CREW.map((member) => (
          <li key={member.id} data-crew={member.id} tabIndex={0} className="lp-crew-card" aria-labelledby={`crew-${member.id}`}>
            <p className="ix">
              <span>{member.index}</span>
              <span>{member.stage ?? labels.across}</span>
            </p>
            <div className="vg" aria-hidden>
              <Scene id={member.id} scenes={scenes} />
            </div>
            <h3 id={`crew-${member.id}`} className="cs">
              {member.callsign}
            </h3>
            <p className="role">{member.role}</p>
            <p className="on">
              <span className="k">{labels.runsOn}</span>
              {member.runsOn.model ? (
                <>
                  <span className="nm">{member.runsOn.model}</span>
                  <span>{member.runsOn.note}</span>
                </>
              ) : (
                <span className="v">{member.runsOn.note}</span>
              )}
            </p>
          </li>
        ))}
      </ol>
      <p className="lp-note lp-crew-note">{labels.note}</p>

      <div className="lp-relay-wrap">
        <p className="lp-relay-label">{labels.relayLabel}</p>
        <ol ref={strip} className="lp-relay" style={{ '--steps': step } as Style}>
          {relay.map((cell, i) => (
            <li key={cell.id} data-state={cell.state} style={steps[i] >= 0 ? ({ '--k': steps[i] } as Style) : undefined}>
              <span className="cs">
                {cell.callsign}
                <span className="sr-only">: {cell.state === 'ran' ? labels.ran : cell.state === 'skipped' ? labels.skipped : labels.unrecorded}</span>
              </span>
              {cell.state === 'unrecorded' ? (
                <span className="v">{labels.unrecorded}</span>
              ) : cell.value ? (
                <span className="v">{cell.value}</span>
              ) : null}
              {cell.sub ? <span className="s">{cell.sub}</span> : null}
            </li>
          ))}
        </ol>
        <div className="lp-relay-cap">
          <span>{caption.join(' · ')}</span>
          <span>{labels.legend}</span>
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------- //
// The drawings. 200 x 100 each, drawn like the vessel: grey construction,
// light body lines, one lime event. Classes: a (construction), b (body),
// w (detail), x (lime stroke), xf (lime fill), ok (status fill); motion:
// m-draw (traces along pathLength 1), m-tick (appears in two steps),
// m-lock (brackets land from 1.4x), m-scan-y / m-scan-x (the lime scan,
// gone at rest), m-grow-x / m-grow-y (a rule or bar extends), m-move (a
// token travels to where it rests). --t is each part's offset in the play.
// --------------------------------------------------------------------------- //

/** Four 6-unit corner brackets around a box: the reticle. */
function brackets(x0: number, y0: number, x1: number, y1: number, n = 6) {
  return `M${x0} ${y0 + n}V${y0}H${x0 + n}M${x1 - n} ${y0}H${x1}V${y0 + n}M${x1} ${y1 - n}V${y1}H${x1 - n}M${x0 + n} ${y1}H${x0}V${y1 - n}`
}

/** The vessel's scan: a 1px lime line with a tail fading to nothing behind it. */
function Scan({
  gid,
  axis,
  from,
  length,
  dist,
  delay,
  tail = 10,
}: {
  gid: string
  axis: 'x' | 'y'
  from: number
  length: [number, number]
  dist: number
  delay: number
  tail?: number
}) {
  const [a, b] = length
  return axis === 'y' ? (
    <g transform={`translate(0 ${from})`}>
      <g className="m-scan" style={t(delay, { '--dx': '0px', '--dy': `${dist}px`, '--sd': `${dist * 6}ms` })}>
        <rect fill={`url(#${gid}-y)`} x={a} y={-tail} width={b - a} height={tail} />
        <path className="x" d={`M${a} 0H${b}`} />
      </g>
    </g>
  ) : (
    <g transform={`translate(${from} 0)`}>
      <g className="m-scan" style={t(delay, { '--dx': `${dist}px`, '--dy': '0px', '--sd': `${dist * 6}ms` })}>
        <rect fill={`url(#${gid}-x)`} x={-tail} y={a} width={tail} height={b - a} />
        <path className="x" d={`M0 ${a}V${b}`} />
      </g>
    </g>
  )
}

function Svg({ gid, children }: { gid?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet" className="art">
      {gid ? (
        <defs>
          <linearGradient id={`${gid}-y`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d4f24a" stopOpacity="0" />
            <stop offset="1" stopColor="#d4f24a" stopOpacity="0.14" />
          </linearGradient>
          <linearGradient id={`${gid}-x`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#d4f24a" stopOpacity="0" />
            <stop offset="1" stopColor="#d4f24a" stopOpacity="0.14" />
          </linearGradient>
        </defs>
      ) : null}
      {children}
    </svg>
  )
}

function Scene({ id, scenes }: { id: CrewId; scenes: CrewScenes }) {
  switch (id) {
    case 'triage':
      return <Triage tags={scenes.triage} />
    case 'planner':
      return <Planner />
    case 'reader':
      return <Reader />
    case 'scout':
      return <Scout {...scenes.scout} />
    case 'reckoner':
      return <Reckoner />
    case 'bench':
      return <Bench />
    case 'scribe':
      return <Scribe cite={scenes.scribe.cite} />
    case 'checker':
      return <Checker checks={scenes.checker} />
    case 'warden':
      return <Warden event={scenes.warden} />
    case 'notary':
      return <Notary {...scenes.notary} />
  }
}

/** The request is read, then its kind and data class lock on: the recorded classification. */
function Triage({ tags }: { tags: string[] }) {
  const rows = tags.slice(0, 2)
  const heads = ['KIND', 'CLASS']
  return (
    <Svg gid="lp-cg-triage">
      <g className="b">
        <path className="m-draw" pathLength={1} style={t(0)} d="M16 12H56L68 24V88H16Z" />
        <path className="m-draw" pathLength={1} style={t(120)} d="M56 12V24H68" />
      </g>
      <g className="w">
        <path className="m-draw" pathLength={1} style={t(180)} d="M24 36H58M24 46H54M24 56H60M24 66H46M24 76H52" />
      </g>
      <Scan gid="lp-cg-triage" axis="y" from={12} length={[12, 72]} dist={76} delay={420} />
      {rows.map((tag, i) => {
        const y = 22 + i * 36
        return (
          <g key={tag}>
            <path className="a m-draw" pathLength={1} style={t(1040 + i * 80)} d={`M72 ${y + 14}H90`} />
            <text className="lb m-tick" style={t(1040 + i * 80)} x="94" y={y + 3}>
              {heads[i]}
            </text>
            <g className="m-lock" style={t(1120 + i * 120)}>
              <rect className="x" x="94" y={y + 7} width="100" height="15" />
              <text className="tx" x="99" y={y + 17.5}>
                {tag}
              </text>
            </g>
          </g>
        )
      })}
    </Svg>
  )
}

/** One request split into steps: the branches draw, the steps tick in, the reticle takes the first. */
function Planner() {
  return (
    <Svg>
      <rect className="b m-tick" style={t(0)} x="12" y="42" width="40" height="16" />
      <path className="w" d="M18 50H44" />
      <path className="a m-draw" pathLength={1} style={t(140)} d="M52 50H72M72 22V78M72 22H98M72 50H98M72 78H98" />
      {[0, 1, 2].map((i) => (
        <g key={i} className="m-tick" style={t(560 + i * 140)}>
          <rect className="b" x="98" y={15 + i * 28} width="58" height="14" />
          <path className="w" d={`M104 ${22 + i * 28}H${138 - i * 8}`} />
          <text className="lb" x="164" y={25 + i * 28}>
            {i + 1}
          </text>
        </g>
      ))}
      <path className="x m-lock" style={t(1080)} d={brackets(93, 10, 161, 34)} />
    </Svg>
  )
}

/** A scanned page: the lime scan reads it top to bottom, then the reticle locks on its drawing. */
function Reader() {
  return (
    <Svg gid="lp-cg-reader">
      <path className="b m-draw" pathLength={1} style={t(0)} d="M62 6H130L140 16V94H62Z" />
      <path className="b m-draw" pathLength={1} style={t(80)} d="M130 6V16H140" />
      <g className="w m-tick" style={t(260)}>
        <path d="M70 18H118M70 26H124M70 34H110" />
        <path d="M112 56H132M112 64H128M112 72H132M112 80H122" />
      </g>
      <g className="w m-tick" style={t(340)}>
        <rect x="72" y="48" width="32" height="38" />
        <path d="M80 56A8 4 0 0 1 96 56V78A8 4 0 0 1 80 78Z" />
        <path d="M76 67H80M96 67H100" />
      </g>
      <Scan gid="lp-cg-reader" axis="y" from={6} length={[56, 146]} dist={88} delay={420} />
      <path className="x m-lock" style={t(1080)} d={brackets(68, 44, 108, 90)} />
    </Svg>
  )
}

/** The passages found, swept left to right; the reticle locks on the one the answer cites. */
function Scout({ count, documents, cited }: { count: number; documents: number; cited: string | null }) {
  const n = Math.max(1, Math.min(count, 8))
  const gap = 7
  const w = Math.min(24, (176 - (n - 1) * gap) / n)
  const x = (i: number) => 12 + i * (w + gap)
  const citedIndex = cited ? Math.max(0, Number(cited.replace(/\D/g, '')) - 1) : -1
  return (
    <Svg gid="lp-cg-scout">
      {Array.from({ length: n }, (_, i) => (
        <g key={i} className="m-tick" style={t(150 + Math.round((x(i) + w / 2 - 6) * 6))}>
          <text className={i === citedIndex ? 'tx' : 'lb'} x={x(i)} y="16">
            S{i + 1}
          </text>
          <rect className="b" x={x(i)} y="21" width={w} height="34" />
          <path className="w" d={`M${x(i) + 4} 29H${x(i) + w - 4}M${x(i) + 4} 36H${x(i) + w - 6}M${x(i) + 4} 43H${x(i) + w - 4}`} />
        </g>
      ))}
      <Scan gid="lp-cg-scout" axis="x" from={6} length={[18, 58]} dist={186} delay={120} tail={14} />
      {citedIndex >= 0 && citedIndex < n ? <path className="x m-lock" style={t(1280)} d={brackets(x(citedIndex) - 4, 17, x(citedIndex) + w + 4, 59)} /> : null}
      <path className="a m-draw" pathLength={1} style={t(900)} d="M12 68H188" />
      <text className="lb m-tick" style={t(1360)} x="12" y="82">
        {count} {count === 1 ? 'PASSAGE' : 'PASSAGES'} · {documents} {documents === 1 ? 'DOC' : 'DOCS'}
      </text>
      {cited ? (
        <text className="tx m-tick" style={t(1440)} x="188" y="82" textAnchor="end">
          {cited} CITED
        </text>
      ) : null}
    </Svg>
  )
}

/** A registered formula (backend/engineering/formulas.py, shell t-min to UG-27): set, ruled, locked. */
function Reckoner() {
  return (
    <Svg>
      <path className="a m-tick" style={t(0)} d="M14 14V58M186 14V58" strokeDasharray="2 3" />
      <text className="fx m-tick" style={t(200)} x="100" y="38" textAnchor="middle">
        t = P·R / (S·E − 0.6·P)
      </text>
      <path className="x m-grow-x" style={t(620)} d="M24 50H176" />
      <path className="x m-lock" style={t(980)} d={brackets(18, 20, 182, 56)} />
      <text className="lb m-tick" style={t(1100)} x="14" y="78">
        SHELL T-MIN · UG-27
      </text>
      <text className="lb m-tick" style={t(1180)} x="186" y="78" textAnchor="end">
        REGISTRY
      </text>
    </Svg>
  )
}

/** A process inside the sandbox climbs to its cap and is held there. */
function Bench() {
  return (
    <Svg>
      <path className="b m-draw" pathLength={1} style={t(0)} d="M34 8H166V92H34Z" />
      <path className="a m-tick" style={t(120)} d="M42 16H158V84H42Z" strokeDasharray="3 3" />
      <path className="x m-draw" pathLength={1} style={t(360)} d="M48 34H152" />
      <text className="tx m-tick" style={t(480)} x="48" y="29">
        CAP
      </text>
      <rect className="b m-grow-y" style={t(560)} x="132" y="34" width="18" height="50" />
      <path className="w m-tick" style={t(560)} d="M56 84H152" />
      <path className="x m-lock" style={t(1180)} d={brackets(126, 28, 156, 42)} />
      <text className="lb m-tick" style={t(1300)} x="48" y="78">
        HELD AT THE CAP
      </text>
    </Svg>
  )
}

/** The answer's lines trace across, and the last one closes on its citation. */
function Scribe({ cite }: { cite: string | null }) {
  return (
    <Svg>
      <path className="w m-draw" pathLength={1} style={t(0)} d="M14 22H176" />
      <path className="w m-draw" pathLength={1} style={t(220)} d="M14 38H164" />
      <path className="w m-draw" pathLength={1} style={t(440)} d="M14 54H172" />
      <path className="b m-draw" pathLength={1} style={t(660)} d={cite ? 'M14 70H112' : 'M14 70H150'} />
      {cite ? (
        <g className="m-lock" style={t(1100)}>
          <rect className="xf" x="118" y="63" width="22" height="13" />
          <text className="ink" x="129" y="72.5" textAnchor="middle">
            {cite}
          </text>
        </g>
      ) : null}
    </Svg>
  )
}

/** The recorded checks, read top to bottom; each result ticks in as the scan passes it. */
function Checker({ checks }: { checks: CrewScenes['checker'] }) {
  const rows = checks.slice(0, 4)
  return (
    <Svg gid="lp-cg-checker">
      {rows.map((check, i) => {
        const y = 14 + i * 20
        return (
          <g key={check.label}>
            <rect className="b m-tick" style={t(i * 60)} x="14" y={y} width="10" height="10" />
            <text className="lb m-tick" style={t(i * 60)} x="32" y={y + 7.5}>
              {check.label}
            </text>
            <path className="a m-tick" style={t(120 + i * 60)} d={`M${36 + check.label.length * 4.6} ${y + 5}H160`} strokeDasharray="1 2" />
            <g className="m-tick" style={t(480 + i * 120)}>
              <rect className={check.passed ? 'ok' : 'no'} x="16.5" y={y + 2.5} width="5" height="5" />
              <text className={check.passed ? 'okt' : 'not'} x="188" y={y + 7.5} textAnchor="end">
                {check.passed ? 'PASS' : 'FAIL'}
              </text>
            </g>
          </g>
        )
      })}
      <Scan gid="lp-cg-checker" axis="y" from={8} length={[8, 192]} dist={80} delay={420} />
    </Svg>
  )
}

/** Policy as a gate: the call stops, the rule is applied, and it passes on the recorded decision. */
function Warden({ event }: { event: CrewScenes['warden'] }) {
  const allowed = event ? event.decision === 'ALLOW' : true
  return (
    <Svg>
      <path className="a m-draw" pathLength={1} style={t(0)} d="M10 48H84M116 48H190" />
      <path className="b m-draw" pathLength={1} style={t(120)} d="M88 22V74M112 22V74" />
      <path className="w m-draw" pathLength={1} style={t(200)} d="M84 22H116M84 74H116" />
      <text className="lb m-tick" style={t(0)} x="100" y="14" textAnchor="middle">
        POLICY
      </text>
      {/* The token rests where the decision left it: past the gate, or held at it. */}
      <g className="m-move" style={t(260, allowed ? { '--from': '-140px', '--mid': '-55px' } : { '--from': '-85px', '--mid': '0px' })}>
        <rect className={allowed ? 'x' : 'held'} x={allowed ? 150 : 95} y="43" width="10" height="10" />
      </g>
      <path className="x m-lock" style={t(720)} d={brackets(80, 16, 120, 80)} />
      {event ? (
        <>
          <text className="lb m-tick" style={t(900)} x="10" y="94">
            {event.action}
            {event.more > 0 ? ` +${event.more}` : ''}
          </text>
          <text className={`${allowed ? 'okt' : 'heldt'} m-tick`} style={t(1000)} x="190" y="94" textAnchor="end">
            {event.decision}
          </text>
        </>
      ) : null}
    </Svg>
  )
}

/** The run's last records, linked by hash; the seal locks on the head and its rule wipes in. */
function Notary({ seqs, hash8, first, last }: CrewScenes['notary']) {
  const shown = seqs.slice(-3)
  const w = 40
  const gap = 18
  const x = (i: number) => 16 + i * (w + gap)
  return (
    <Svg>
      <text className="lb m-tick" style={t(0)} x="16" y="16">
        AUDIT CHAIN
      </text>
      {shown.map((seq, i) => (
        <g key={seq}>
          <g className="m-tick" style={t(120 + i * 200)}>
            <rect className={i === shown.length - 1 ? 'b' : 'w'} x={x(i)} y="26" width={w} height="30" />
            <text className={i === shown.length - 1 ? 'fg' : 'lb'} x={x(i) + w / 2} y="44" textAnchor="middle">
              #{seq}
            </text>
          </g>
          {i > 0 ? <path className="a m-draw" pathLength={1} style={t(40 + i * 200)} d={`M${x(i - 1) + w} 41H${x(i)}`} /> : null}
        </g>
      ))}
      {shown.length > 0 ? <path className="x m-lock" style={t(860)} d={brackets(x(shown.length - 1) - 4, 22, x(shown.length - 1) + w + 4, 60)} /> : null}
      <path className="x m-grow-x" style={t(1080)} d="M16 70H184" />
      {hash8 ? (
        <text className="fg m-tick" style={t(1240)} x="16" y="86">
          {hash8}…
        </text>
      ) : null}
      {first !== null && last !== null ? (
        <text className="lb m-tick" style={t(1240)} x="184" y="86" textAnchor="end">
          SEQ {first}–{last}
        </text>
      ) : null}
    </Svg>
  )
}
