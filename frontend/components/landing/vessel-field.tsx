'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface VesselCallout {
  /** The small line: where the fact comes from. */
  k: string
  /** The fact. */
  v: string
  tone?: 'ok'
}

/**
 * How a run is proved, drawn on what the run was about: a pressure vessel in
 * wireframe, turning a little, with a ring of light scanning along it and the
 * run's facts pinned to it.
 *
 * The vessel is an illustration and says so in its label; the callouts are
 * the run's own record -- its classification, the clause it cited, its checks
 * and its audit records -- handed in by the page. A callout lights as the
 * scan passes the point it is pinned to.
 *
 * One canvas at about thirty frames a second while on screen and visible;
 * drawn once and left still under reduced motion.
 */
export function VesselField({ label, callouts, className }: { label: string; callouts: readonly VesselCallout[]; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ctx: CanvasRenderingContext2D = context
    const host = canvas.parentElement ?? canvas
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75)

    // The vessel, in its own units: a cylinder along x with two
    // hemispherical heads, two nozzles on top and two saddles under it.
    const L = 1
    const r = 0.42
    const rings: Array<{ x: number; rr: number }> = []
    for (let j = 6; j >= 1; j--) {
      const ph = (j / 6) * (Math.PI / 2)
      rings.push({ x: -(L + r * Math.sin(ph)), rr: r * Math.cos(ph) })
    }
    for (let i = 0; i <= 14; i++) rings.push({ x: -L + (2 * L * i) / 14, rr: r })
    for (let j = 1; j <= 6; j++) {
      const ph = (j / 6) * (Math.PI / 2)
      rings.push({ x: L + r * Math.sin(ph), rr: r * Math.cos(ph) })
    }
    type Seg = [number, number, number, number, number, number]
    const shellSegs: Seg[] = []
    const fixtureSegs: Seg[] = []
    const SEG = 36
    for (const ring of rings) {
      if (ring.rr < 0.01) continue
      for (let k = 0; k < SEG; k++) {
        const a0 = (k / SEG) * Math.PI * 2
        const a1 = ((k + 1) / SEG) * Math.PI * 2
        shellSegs.push([ring.x, Math.sin(a0) * ring.rr, Math.cos(a0) * ring.rr, ring.x, Math.sin(a1) * ring.rr, Math.cos(a1) * ring.rr])
      }
    }
    const MER = 24
    for (let m = 0; m < MER; m++) {
      const a = (m / MER) * Math.PI * 2
      for (let i = 0; i < rings.length - 1; i++) {
        const p = rings[i]
        const q = rings[i + 1]
        shellSegs.push([p.x, Math.sin(a) * p.rr, Math.cos(a) * p.rr, q.x, Math.sin(a) * q.rr, Math.cos(a) * q.rr])
      }
    }
    for (const nx of [-0.5, 0.35]) {
      const nr = 0.085
      const top = -r - 0.2
      for (const [yy, rad] of [
        [-r * 0.96, nr],
        [top + 0.05, nr],
        [top, nr * 1.6],
      ] as const) {
        for (let k = 0; k < 20; k++) {
          const a0 = (k / 20) * Math.PI * 2
          const a1 = ((k + 1) / 20) * Math.PI * 2
          fixtureSegs.push([nx + Math.cos(a0) * rad, yy, Math.sin(a0) * rad, nx + Math.cos(a1) * rad, yy, Math.sin(a1) * rad])
        }
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        fixtureSegs.push([nx + Math.cos(a) * nr, -r * 0.96, Math.sin(a) * nr, nx + Math.cos(a) * nr, top + 0.05, Math.sin(a) * nr])
      }
    }
    for (const sx of [-0.62, 0.62]) {
      const gy = r + 0.3
      const hw = 0.12
      const dz = r * 0.8
      const q = [
        [sx - hw, r * 0.62, -dz], [sx + hw, r * 0.62, -dz], [sx + hw, gy, -dz * 1.15], [sx - hw, gy, -dz * 1.15],
        [sx - hw, r * 0.62, dz], [sx + hw, r * 0.62, dz], [sx + hw, gy, dz * 1.15], [sx - hw, gy, dz * 1.15],
      ]
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
        fixtureSegs.push([q[a][0], q[a][1], q[a][2], q[b][0], q[b][1], q[b][2]])
      }
    }
    // Where each callout is pinned, and which way its box sits from the pin.
    const anchors: Array<{ p: [number, number, number]; dx: number; dy: number }> = [
      { p: [0.15, -r * 0.35, -r * 0.93], dx: 70, dy: -150 },
      { p: [-0.5, -r - 0.2, 0], dx: -250, dy: -90 },
      { p: [L + r * 0.62, -r * 0.45, -r * 0.45], dx: 40, dy: 70 },
      { p: [-L - r * 0.55, r * 0.35, -r * 0.55], dx: -230, dy: 80 },
    ]

    let w = 0
    let h = 0
    let frame = 0
    let last = 0
    let onScreen = false
    let shown = document.visibilityState === 'visible'
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    const born = performance.now()

    function size() {
      const rect = canvas!.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas!.width = Math.max(1, Math.round(w * dpr))
      canvas!.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function draw(now: number) {
      const t = reduce ? 0 : (now - born) / 1000
      pointer.x += (pointer.tx - pointer.x) * 0.06
      pointer.y += (pointer.ty - pointer.y) * 0.06
      ctx.clearRect(0, 0, w, h)
      const K = Math.min((w * 0.6) / (2 * (L + r)), h * 0.5)
      const cx = w * 0.53
      const cy = h * 0.52
      const D = 5
      const yaw = -0.6 + Math.sin(t * 0.12) * 0.18 + pointer.x * 0.3
      const pitch = -0.28 + pointer.y * 0.14
      const cyw = Math.cos(yaw)
      const syw = Math.sin(yaw)
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      const P = (x: number, y: number, z: number): [number, number] => {
        const x1 = x * cyw + z * syw
        const z1 = -x * syw + z * cyw
        const y2 = y * cp - z1 * sp
        const z2 = y * sp + z1 * cp
        const k = D / (D + z2)
        return [cx + x1 * K * k, cy + y2 * K * k]
      }
      const span = 2 * (L + r) + 0.8
      const scan = reduce ? 0.15 : -(L + r) - 0.4 + ((t / 7) % 1) * span

      ctx.lineWidth = 1
      const stroke = (segs: Seg[], style: string) => {
        ctx.strokeStyle = style
        ctx.beginPath()
        for (const s of segs) {
          const a = P(s[0], s[1], s[2])
          const b = P(s[3], s[4], s[5])
          ctx.moveTo(a[0], a[1])
          ctx.lineTo(b[0], b[1])
        }
        ctx.stroke()
      }
      stroke(shellSegs, 'rgba(255,255,255,0.13)')
      stroke(fixtureSegs, 'rgba(255,255,255,0.24)')

      // The scan: the segments it passes over, lit in the signal colour.
      ctx.lineWidth = 1.3
      for (const s of shellSegs) {
        const d = Math.abs((s[0] + s[3]) / 2 - scan)
        if (d > 0.13) continue
        const a = P(s[0], s[1], s[2])
        const b = P(s[3], s[4], s[5])
        ctx.strokeStyle = `rgba(255,91,26,${(0.9 * (1 - d / 0.13)).toFixed(3)})`
        ctx.beginPath()
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
        ctx.stroke()
      }

      // The callouts, pinned.
      const since = (now - born) / 1000
      anchors.forEach((anchor, i) => {
        const box = boxRefs.current[i]
        if (!box) return
        if (!reduce && since < 0.6 + i * 0.35) return
        const [px, py] = P(anchor.p[0], anchor.p[1], anchor.p[2])
        const bw = box.offsetWidth
        const bh = box.offsetHeight
        // A callout the layout has hidden (a phone) gets no pin or leader either.
        if (bw === 0) return
        const bx = Math.max(12, Math.min(w - bw - 12, px + anchor.dx))
        const by = Math.max(44, Math.min(h - bh - 12, py + anchor.dy))
        const leftOfPin = bx + bw / 2 < px
        const ex = leftOfPin ? bx + bw : bx
        const ey = by + bh / 2
        const hot = Math.abs(anchor.p[0] - scan) < 0.22
        ctx.lineWidth = 1
        ctx.strokeStyle = hot ? 'rgba(255,91,26,0.9)' : 'rgba(255,255,255,0.32)'
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(ex + (leftOfPin ? 16 : -16), ey)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        ctx.fillStyle = hot ? '#ff5b1a' : '#f4f4f5'
        ctx.fillRect(px - 2.5, py - 2.5, 5, 5)
        box.style.opacity = '1'
        box.style.transform = `translate(${bx}px, ${by}px)`
        box.classList.toggle('hot', hot)
      })
    }

    function loop(now: number) {
      frame = 0
      if (!onScreen || !shown) return
      if (now - last >= 32) {
        draw(now)
        last = now
      }
      frame = requestAnimationFrame(loop)
    }
    function start() {
      if (reduce) {
        draw(performance.now())
        return
      }
      if (!frame && onScreen && shown) {
        last = 0
        frame = requestAnimationFrame(loop)
      }
    }

    size()
    const resize = new ResizeObserver(() => {
      size()
      draw(performance.now())
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
      const rect = host.getBoundingClientRect()
      pointer.tx = (event.clientX - rect.left) / rect.width - 0.5
      pointer.ty = (event.clientY - rect.top) / rect.height - 0.5
    }
    if (!reduce) host.addEventListener('pointermove', onMove, { passive: true })
    start()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      resize.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      host.removeEventListener('pointermove', onMove)
    }
  }, [callouts])

  return (
    <div className={cn('lp-plant', className)}>
      <canvas ref={canvasRef} aria-hidden />
      <span className="lp-plant-label">{label}</span>
      {callouts.map((callout, i) => (
        <div
          key={callout.k}
          ref={(el) => {
            boxRefs.current[i] = el
          }}
          className={cn('lp-call', callout.tone === 'ok' && 'ok')}
        >
          <span className="k">{callout.k}</span>
          {callout.v}
        </div>
      ))}
    </div>
  )
}
