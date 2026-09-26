'use client'

import { useEffect, useRef } from 'react'

/**
 * The hero moment: a line drawing of a vertical pressure vessel, swept by a
 * lime scan line, after which a reticle's corner brackets lock onto the
 * manway and pin the recorded run's cited clause to it.
 *
 * The drawing is an illustration, and says so under itself. The label is not:
 * every part of it is read from the run's record by the server and passed in.
 *
 * The loop is 8 s of CSS keyframes, all on one clock (landing.css, "hero
 * vessel"). This component only decides whether that clock runs: it sets
 * data-play="on" while the drawing is on screen and "off" (paused where it
 * stands) when it is not. Before hydration, with JavaScript off, and under
 * reduced motion, nothing is set and CSS draws the locked, static frame: the
 * scan as a still hairline with its label, the reticle already on the manway.
 */
export function HeroVessel({ label, note }: { label: string[]; note: string }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const motion = window.matchMedia('(prefers-reduced-motion: no-preference)')
    let onScreen = false
    const apply = () => {
      if (!motion.matches) delete el.dataset.play
      else el.dataset.play = onScreen ? 'on' : 'off'
    }
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              onScreen = entry.isIntersecting
              apply()
            },
            { threshold: 0.15 },
          )
    if (io) io.observe(el)
    else {
      onScreen = true
      apply()
    }
    motion.addEventListener('change', apply)
    return () => {
      io?.disconnect()
      motion.removeEventListener('change', apply)
    }
  }, [])

  return (
    <figure ref={root} className="lp-vessel">
      <svg viewBox="0 0 320 480" role="img" aria-labelledby="lp-vessel-title" className="art">
        <title id="lp-vessel-title">{`Line drawing of a pressure vessel. A reticle marks its manway with the recorded run's cited answer: ${label.join(', ')}.`}</title>
        <defs>
          <linearGradient id="lp-scan-tail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d4f24a" stopOpacity="0" />
            <stop offset="1" stopColor="#d4f24a" stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {/* Construction: centre line and an overall-height dimension. */}
        <g className="aux">
          <path d="M160 22V466" strokeDasharray="14 4 2 4" />
          <path d="M34 70V390M28 70H40M28 390H40" />
          <path d="M34 70H78M34 390H78" strokeDasharray="2 3" />
        </g>

        {/* The vessel: 2:1 heads, shell, skirt and base ring. */}
        <g className="body">
          <path d="M80 110A80 40 0 0 1 240 110V350A80 40 0 0 1 80 350Z" />
          <path d="M96 378L90 440M224 378L230 440" />
          <path d="M76 440H244V448H76Z" />
          <path d="M104 440V426H120V440M200 440V426H216V440" className="thin" />
        </g>

        {/* Welds: head-to-shell seams, the course seams, one longitudinal seam. */}
        <g className="weld">
          <path d="M80 110Q160 122 240 110M80 350Q160 362 240 350" />
          <path d="M80 190Q160 200 240 190M80 270Q160 280 240 270" strokeDasharray="3 3" />
          <path d="M122 115V190M198 196V270M122 276V350" strokeDasharray="3 3" />
        </g>

        {/* Nozzles: N1 at the crown, N2 and N3 on the shell. */}
        <g className="body">
          <path d="M150 71V46H170V71M142 46H178M142 40H178V46M142 40V46" />
          <path d="M240 142H268V128M240 158H268V172M268 124V176M274 124V176H268" />
          <path d="M80 318H54V306M80 332H54V344M54 302V348M48 302V348H54" />
        </g>

        {/* M1, the manway: where the reticle locks. */}
        <g className="target">
          <path d="M240 230H258V224M240 270H258V276M258 218V282M264 218V282H258" />
          <path d="M264 234H270M264 266H270M270 230V270" className="thin" />
        </g>

        {/* Tags, as a drawing carries them. */}
        <g className="tags">
          <text x="160" y="32" textAnchor="middle">N1</text>
          <text x="282" y="154">N2</text>
          <text x="22" y="330">N3</text>
          <text x="280" y="210">M1</text>
          <rect x="102" y="214" width="40" height="22" />
          <path d="M108 222H136M108 228H128" />
        </g>

        {/* The scan: a 1px lime line with a 32px tail, sweeping down. */}
        <g className="scan">
          <rect x="16" y="-32" width="288" height="32" fill="url(#lp-scan-tail)" className="tail" />
          <path d="M16 0H304" />
          <text x="304" y="-5" textAnchor="end" className="scan-label">
            SCAN
          </text>
        </g>

        {/* The reticle: four 8px corner brackets around M1. */}
        <g className="reticle">
          <path d="M232 214V206H240M276 206H284V214M284 286V294H276M240 294H232V286" />
        </g>
      </svg>

      {/* The clause the answer rests on, pinned to the manway. Text, not SVG,
          so it wraps and reads as text. */}
      <figcaption className="pin">
        <span className="lead" aria-hidden />
        <span className="box">
          {label.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      </figcaption>
      <p className="note">{note}</p>
    </figure>
  )
}
