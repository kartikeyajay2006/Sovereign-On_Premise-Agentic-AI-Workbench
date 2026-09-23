'use client'

import { useEffect, useRef } from 'react'

/**
 * The ambience behind the hero, drawn rather than declared.
 *
 * This replaces two static gradients: a fixed dot grid and a radial pool.
 * They gave the page a surface, which is more than a flat void, but nothing
 * on the page moved and the hero read as a poster.
 *
 * What is drawn is the product's own idea rather than decoration for its own
 * sake. Records enter at the left, and each one links to the one before it.
 * A link is drawn only once both of its records exist, so the chain builds
 * rather than appearing -- the same order the audit log is written in.
 *
 * Constraints this has to respect, all of them load-bearing here:
 *
 * It is behind a headline, so it stays faint and slow. Anything legible
 * competes with the type it sits under.
 *
 * It must cost almost nothing. The event bus drops records for a subscriber
 * that cannot keep up and this host runs local inference on the same CPU, so
 * a canvas that burns the main thread is not a cosmetic choice. It advances
 * on a fixed 20fps step, draws at most a few dozen short lines, and stops
 * entirely when the tab is hidden or the section is scrolled past.
 *
 * It must degrade to nothing. If the canvas never initialises the hero is a
 * hero without a background, not a hero without a headline.
 */

const FPS = 20
const STEP = 1000 / FPS
/** Records on screen at full width. Scaled down with the viewport. */
const MAX_NODES = 13

interface Node {
  x: number
  y: number
  /** 0 to 1. Drives both the node's own fade and its link to the previous. */
  age: number
  /** Per-row opacity multiplier. This is what reads as depth. */
  weight: number
  /** First node of its row, so a link is never drawn between two rows. */
  first: boolean
}

/**
 * The bands. Nearer rows are heavier and wander more; the faint ones sit
 * behind the headline where anything stronger would compete with the type.
 */
const ROWS = [
  { band: 0.22, wander: 0.10, weight: 0.45, phase: 1.7 },
  { band: 0.46, wander: 0.14, weight: 1.0, phase: 0.0 },
  { band: 0.70, wander: 0.11, weight: 0.7, phase: 3.1 },
  { band: 0.88, wander: 0.07, weight: 0.35, phase: 2.2 },
]

export function HeroField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    // Respect the system setting before allocating anything.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (still.matches) return

    const context = canvas.getContext('2d')
    if (!context) return

    let width = 0
    let height = 0
    let ratio = 1
    let nodes: Node[] = []
    let frame = 0
    let last = 0
    let running = true

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    const budget = () => Math.max(6, Math.round((MAX_NODES * width) / 1200))

    const seed = () => {
      // Several chains at different depths, not one.
      //
      // A single row was 0.31% coverage of a 1019x560 field: present when
      // measured, invisible when looked at. Ambience needs more than one
      // gesture, and a ledger is many records rather than one line. Each row
      // gets its own band, phase and weight, so they read as depth instead
      // of as a grid.
      const count = budget()
      nodes = []
      for (let row = 0; row < ROWS.length; row += 1) {
        const { band, wander, weight, phase } = ROWS[row]
        for (let i = 0; i < count; i += 1) {
          nodes.push({
            x: (i / (count - 1)) * width,
            y: height * band + Math.sin(i * 0.7 + phase) * height * wander,
            // Staggered along the row so a chain is mid-build on first
            // paint rather than flashing into existence whole.
            age: Math.max(0, 1 - i / count) * 0.9,
            weight,
            first: i === 0,
          })
        }
      }
    }

    const draw = () => {
      context.clearRect(0, 0, width, height)

      const ink = getComputedStyle(canvas).color

      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i]
        const previous = nodes[i - 1]

        // A link exists only when both of its records do. This is the whole
        // gesture: the chain is built, never revealed.
        if (previous && !node.first && previous.age > 0.15 && node.age > 0.15) {
          const strength = Math.min(previous.age, node.age)
          context.globalAlpha = strength * 0.6 * node.weight
          context.strokeStyle = ink
          context.lineWidth = 1.5
          context.beginPath()
          context.moveTo(previous.x, previous.y)
          context.lineTo(node.x, node.y)
          context.stroke()
        }

        if (node.age > 0) {
          context.globalAlpha = node.age * 0.95 * node.weight
          context.fillStyle = ink
          context.fillRect(node.x - 2, node.y - 2, 4, 4)
        }
      }

      context.globalAlpha = 1
    }

    const tick = (now: number) => {
      if (!running) return
      frame = window.requestAnimationFrame(tick)
      if (now - last < STEP) return
      last = now

      for (const node of nodes) {
        node.age += 0.006
        if (node.age > 1) node.age -= 1
      }
      draw()
    }

    const onVisibility = () => {
      // A hidden tab still services rAF in some browsers, and this one has a
      // model running underneath it.
      if (document.hidden) {
        running = false
        window.cancelAnimationFrame(frame)
      } else if (!running) {
        running = true
        last = 0
        frame = window.requestAnimationFrame(tick)
      }
    }

    resize()
    seed()
    frame = window.requestAnimationFrame(tick)

    const observer = new ResizeObserver(() => {
      resize()
      seed()
    })
    observer.observe(canvas)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden
      // `color` is what the canvas reads for its ink, so the field follows
      // the theme without the component knowing any hex value.
      className={className}
      style={{
        color: 'var(--foreground)',
        // Faded at the edges and thinned through the middle, where the
        // headline sits. The chain should be something you notice after the
        // sentence, not something the sentence has to compete with.
        maskImage:
          'radial-gradient(120% 70% at 50% 45%, transparent 18%, #000 62%), linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
        WebkitMaskImage:
          'radial-gradient(120% 70% at 50% 45%, transparent 18%, #000 62%), linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in',
      }}
    />
  )
}
