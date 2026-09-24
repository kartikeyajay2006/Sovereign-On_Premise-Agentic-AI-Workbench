'use client'

import { useEffect, useRef } from 'react'

/**
 * The machine, drawn as a boundary, with the work inside it moving and
 * turning back at the edge.
 *
 * An illustration, not a reading: the dots are not connections and the
 * count beside it is the live one. What it shows is the shape of the claim --
 * everything the workbench does stays inside the box -- and a small ring
 * where something meets the boundary and goes back.
 *
 * One canvas, one loop at about 30 frames a second, a few dozen dots. It
 * runs only while the card is on screen and the tab is visible, and under
 * reduced motion it is drawn once and left still.
 */
export function AirgapField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const COUNT = 34
    const INSET = 16
    const RADIUS = 16

    let w = 0
    let h = 0
    const dots = Array.from({ length: COUNT }, () => ({ x: 0, y: 0, vx: 0, vy: 0, r: 1.4 + Math.random() * 1.4 }))
    const rings: Array<{ x: number; y: number; t: number }> = []
    let frame = 0
    let last = 0
    let visible = false
    let shown = document.visibilityState === 'visible'

    const layout = () => {
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      for (const d of dots) {
        if (d.x === 0 && d.y === 0) {
          d.x = INSET + 10 + Math.random() * Math.max(1, w - 2 * INSET - 20)
          d.y = INSET + 10 + Math.random() * Math.max(1, h - 2 * INSET - 20)
          const a = Math.random() * Math.PI * 2
          const speed = 18 + Math.random() * 26
          d.vx = Math.cos(a) * speed
          d.vy = Math.sin(a) * speed
        }
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      // The boundary: this machine.
      ctx.strokeStyle = 'rgba(203, 166, 247, 0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(INSET + 0.5, INSET + 0.5, w - 2 * INSET - 1, h - 2 * INSET - 1, RADIUS)
      ctx.stroke()
      // Where something met the edge and went back.
      for (const ring of rings) {
        const k = ring.t / 0.9
        ctx.strokeStyle = `rgba(203, 166, 247, ${0.6 * (1 - k)})`
        ctx.beginPath()
        ctx.arc(ring.x, ring.y, 3 + k * 14, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(205, 214, 244, 0.75)'
      for (const d of dots) {
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const step = (dt: number) => {
      const minX = INSET + 4
      const minY = INSET + 4
      const maxX = w - INSET - 4
      const maxY = h - INSET - 4
      for (const d of dots) {
        d.x += d.vx * dt
        d.y += d.vy * dt
        let hit = false
        if (d.x < minX) { d.x = minX; d.vx = Math.abs(d.vx); hit = true }
        if (d.x > maxX) { d.x = maxX; d.vx = -Math.abs(d.vx); hit = true }
        if (d.y < minY) { d.y = minY; d.vy = Math.abs(d.vy); hit = true }
        if (d.y > maxY) { d.y = maxY; d.vy = -Math.abs(d.vy); hit = true }
        if (hit && rings.length < 10) rings.push({ x: d.x, y: d.y, t: 0 })
      }
      for (let n = rings.length - 1; n >= 0; n -= 1) {
        rings[n].t += dt
        if (rings[n].t > 0.9) rings.splice(n, 1)
      }
    }

    const loop = (now: number) => {
      frame = 0
      if (!visible || !shown) return
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      if (!last || now - last >= 32) {
        step(dt)
        draw()
        last = now
      }
      frame = window.requestAnimationFrame(loop)
    }
    const start = () => {
      if (reduce || frame || !visible || !shown) return
      last = 0
      frame = window.requestAnimationFrame(loop)
    }

    layout()
    draw()
    const resize = new ResizeObserver(() => {
      layout()
      draw()
    })
    resize.observe(canvas)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
    })
    io.observe(canvas)
    const onVisibility = () => {
      shown = document.visibilityState === 'visible'
      if (shown) start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      resize.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className={className} />
}
