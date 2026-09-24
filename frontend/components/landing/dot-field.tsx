'use client'

import { useEffect, useRef } from 'react'

/**
 * The hero's ground: a field of dots on the dark band.
 *
 * Three things move, all of them cheap. The field breathes -- each dot's
 * brightness drifts on a slow wave of its own phase. Every few seconds a soft
 * diagonal band sweeps across and lights the dots it passes, the way a check
 * runs over a record. And the dots scatter from the pointer and settle back
 * behind it.
 *
 * It is one canvas and one loop, drawn in rectangles with a single fill
 * colour, so a frame on the two-core laptop this was built on stays well
 * under a few milliseconds. The loop runs only while the band is on screen
 * and the tab is visible, drops to about 24 frames a second when nothing is
 * under the pointer, and under reduced motion the field is drawn once and
 * left still.
 */
export function DotField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const ctx: CanvasRenderingContext2D = context
    // The band that holds the field, so the pointer is followed over the
    // headline and buttons that sit on top of the canvas as well.
    const host = canvas.closest<HTMLElement>('[data-dot-field-host]') ?? canvas.parentElement ?? canvas

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const GAP = 24
    const REACH = 130
    const PUSH = 20
    const SWEEP_EVERY = 7.5
    const SWEEP_FOR = 2.4

    let width = 0
    let height = 0
    let xs = new Float32Array(0)
    let ys = new Float32Array(0)
    let ox = new Float32Array(0)
    let oy = new Float32Array(0)
    let phase = new Float32Array(0)
    let frame = 0
    let last = 0
    // True while dots are still settling or a sweep is crossing: those need
    // every frame. A field that is only breathing does not.
    let animating = false
    let onScreen = true
    let shown = document.visibilityState === 'visible'
    const pointer = { x: -1e4, y: -1e4, inside: false }
    const born = performance.now()

    function layout() {
      const rect = canvas!.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas!.width = Math.max(1, Math.round(width * dpr))
      canvas!.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const cols = Math.ceil(width / GAP) + 1
      const rows = Math.ceil(height / GAP) + 1
      const count = cols * rows
      xs = new Float32Array(count)
      ys = new Float32Array(count)
      ox = new Float32Array(count)
      oy = new Float32Array(count)
      phase = new Float32Array(count)
      const left = (width - (cols - 1) * GAP) / 2
      const top = (height - (rows - 1) * GAP) / 2
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          xs[i] = left + c * GAP
          ys[i] = top + r * GAP
          phase[i] = Math.sin(c * 0.33) * 1.4 + Math.cos(r * 0.41) * 1.2 + Math.sin((c + r) * 0.16) * 0.9
        }
      }
    }

    function draw(now: number) {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#faf9f6'
      const t = (now - born) / 1000
      const cycle = t % SWEEP_EVERY
      const sweeping = !reduce && t > 1.2 && cycle < SWEEP_FOR
      const front = cycle / SWEEP_FOR
      let moving = false

      for (let i = 0; i < xs.length; i++) {
        const x = xs[i]
        const y = ys[i]
        let tx = 0
        let ty = 0
        if (pointer.inside) {
          const dx = x - pointer.x
          const dy = y - pointer.y
          const d2 = dx * dx + dy * dy
          if (d2 < REACH * REACH) {
            const d = Math.sqrt(d2) || 1
            const f = 1 - d / REACH
            const push = f * f * PUSH
            tx = (dx / d) * push
            ty = (dy / d) * push
          }
        }
        ox[i] += (tx - ox[i]) * 0.14
        oy[i] += (ty - oy[i]) * 0.14
        const displaced = Math.abs(ox[i]) + Math.abs(oy[i])
        if (displaced > 0.05) moving = true

        let alpha = reduce ? 0.16 : 0.14 + 0.07 * Math.sin(t * 0.75 + phase[i])
        if (sweeping) {
          const along = (x / width) * 0.72 + (y / height) * 0.28
          const distance = Math.abs(along - (front * 1.3 - 0.15))
          if (distance < 0.07) alpha += (1 - distance / 0.07) * 0.5
        }
        alpha += Math.min(displaced / PUSH, 1) * 0.45
        ctx.globalAlpha = alpha > 1 ? 1 : alpha
        const size = displaced > 2 ? 2 : 1.5
        ctx.fillRect(x + ox[i] - size / 2, y + oy[i] - size / 2, size, size)
      }
      ctx.globalAlpha = 1
      return moving || pointer.inside || sweeping
    }

    function loop(now: number) {
      frame = 0
      if (!onScreen || !shown) return
      // A field that is only breathing needs no more than ~24 frames a second.
      if (animating || now - last > 40) {
        animating = draw(now)
        last = now
      }
      frame = requestAnimationFrame(loop)
    }

    function start() {
      if (reduce) {
        draw(performance.now())
        return
      }
      if (!frame && onScreen && shown) frame = requestAnimationFrame(loop)
    }

    layout()
    start()

    const resize = new ResizeObserver(() => {
      layout()
      if (reduce) draw(performance.now())
    })
    resize.observe(canvas)

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) start()
    })
    io.observe(canvas)

    const onVisibility = () => {
      shown = document.visibilityState === 'visible'
      if (shown) start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height
    }
    const onLeave = () => {
      pointer.inside = false
    }
    if (!reduce) {
      host.addEventListener('pointermove', onMove, { passive: true })
      host.addEventListener('pointerleave', onLeave)
    }

    return () => {
      if (frame) cancelAnimationFrame(frame)
      resize.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className={className} />
}
