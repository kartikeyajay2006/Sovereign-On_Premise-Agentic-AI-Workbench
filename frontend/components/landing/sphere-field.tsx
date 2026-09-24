'use client'

import { useEffect, useRef } from 'react'

export interface SphereTag {
  /** The passage or record id, set in the signal colour: "S1". */
  id: string
  /** What it is, from the run's record: "SOP-INS-014 §2.2 · cited". */
  text: string
}

/**
 * The hero's centrepiece: a sphere of points turning slowly inside a thin
 * shell, over a floor grid, with one of the run's passages lit at a time and
 * a tag drawn out to it.
 *
 * An illustration, not a reading: the points are not documents and the
 * sphere measures nothing. The tags are the run's own passages and records,
 * handed in by the page from the record, so the only text it draws is text
 * the record carries.
 *
 * One canvas, drawn about thirty times a second in small rectangles with one
 * fill colour, and only while it is on screen and the tab is visible. Under
 * reduced motion it is drawn once and left still, with no tags.
 */
export function SphereField({ tags, className }: { tags: readonly SphereTag[]; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tagRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const tag = tagRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !tag || !context) return
    const ctx: CanvasRenderingContext2D = context
    const host = canvas.closest<HTMLElement>('section') ?? canvas.parentElement ?? canvas
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75)

    const N = 1500
    const golden = Math.PI * (3 - Math.sqrt(5))
    const px = new Float32Array(N)
    const py = new Float32Array(N)
    const pz = new Float32Array(N)
    const phase = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const th = golden * i
      px[i] = Math.cos(th) * r
      py[i] = y
      pz[i] = Math.sin(th) * r
      phase[i] = Math.random() * Math.PI * 2
    }
    const sx = new Float32Array(N)
    const sy = new Float32Array(N)
    const sz = new Float32Array(N)

    let w = 0
    let h = 0
    let frame = 0
    let last = 0
    let onScreen = true
    let shown = document.visibilityState === 'visible'
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    const born = performance.now()
    // The one lit passage: which point, which tag, when it began.
    let lit: { i: number; tag: number; t0: number; side: 1 | -1 } | null = null
    let nextTag = 1.4
    let tagIndex = 0

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

      const R = Math.min(w * (w < 640 ? 0.3 : 0.17), h * 0.2, 300)
      const C = R * 1.3
      const cx = w / 2
      const cy = h * 0.67
      const D = R * 8
      const yaw = t * 0.075 + pointer.x * 0.5
      const pitch = 0.3 + pointer.y * 0.16
      const cyaw = Math.cos(yaw)
      const syaw = Math.sin(yaw)
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      // world -> screen, turning with the sphere or only tilted with the floor
      const project = (x: number, y: number, z: number, turn: boolean): [number, number, number, number] => {
        const x1 = turn ? x * cyaw + z * syaw : x
        const z1 = turn ? -x * syaw + z * cyaw : z
        const y2 = y * cp - z1 * sp
        const z2 = y * sp + z1 * cp
        const k = D / (D + z2)
        return [cx + x1 * k, cy + y2 * k, k, z2]
      }

      // The floor: a grid that does not turn, faded out from the middle.
      const fy = C * 1.12
      const ext = C * 2.4
      const lines = 12
      const buckets: Array<Array<[number, number, number, number]>> = [[], [], [], []]
      for (let dir = 0; dir < 2; dir++) {
        for (let i = 0; i <= lines; i++) {
          const u = -ext + (2 * ext * i) / lines
          for (let k = 0; k < 8; k++) {
            const v0 = -ext + (2 * ext * k) / 8
            const v1 = v0 + (2 * ext) / 8
            const a = dir ? project(u, fy, v0, false) : project(v0, fy, u, false)
            const b = dir ? project(u, fy, v1, false) : project(v1, fy, u, false)
            const fade = 1 - Math.hypot(u, (v0 + v1) / 2) / ext
            if (fade <= 0.05) continue
            buckets[Math.min(3, Math.floor(fade * 4))].push([a[0], a[1], b[0], b[1]])
          }
        }
      }
      ctx.lineWidth = 1
      buckets.forEach((segs, n) => {
        ctx.strokeStyle = `rgba(200,212,255,${(0.025 + n * 0.028).toFixed(3)})`
        ctx.beginPath()
        for (const [x0, y0, x1, y1] of segs) {
          ctx.moveTo(x0, y0)
          ctx.lineTo(x1, y1)
        }
        ctx.stroke()
      })

      // The shell: two great circles of the boundary, the far halves faint.
      const shell = (front: boolean) => {
        ctx.strokeStyle = front ? 'rgba(228,234,255,0.22)' : 'rgba(228,234,255,0.06)'
        ctx.beginPath()
        for (const tilt of [0, Math.PI / 2]) {
          for (let k = 0; k < 96; k++) {
            const a0 = (k / 96) * Math.PI * 2
            const a1 = ((k + 1) / 96) * Math.PI * 2
            const at = (a: number) => {
              const x = Math.cos(a) * C
              const z = Math.sin(a) * C
              // tilt 0: the equator; tilt pi/2: a meridian
              return tilt === 0 ? project(x, 0, z, true) : project(x, z, 0, true)
            }
            const q0 = at(a0)
            const q1 = at(a1)
            if (q0[3] + q1[3] < 0 !== front) continue
            ctx.moveTo(q0[0], q0[1])
            ctx.lineTo(q1[0], q1[1])
          }
        }
        ctx.stroke()
      }
      shell(false)

      // The sphere.
      const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2)
      glow.addColorStop(0, 'rgba(150,175,255,0.14)')
      glow.addColorStop(1, 'rgba(150,175,255,0)')
      ctx.fillStyle = glow
      ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4)
      ctx.fillStyle = '#e6ebff'
      for (let i = 0; i < N; i++) {
        const q = project(px[i] * R, py[i] * R, pz[i] * R, true)
        sx[i] = q[0]
        sy[i] = q[1]
        sz[i] = q[3]
        const front = (1 - q[3] / R) / 2
        let alpha = 0.05 + 0.62 * Math.pow(front, 1.7)
        if (!reduce && Math.sin(t * 1.1 + phase[i] * 7) > 0.992) alpha += 0.45
        const s = (0.7 + 1.4 * front) * q[2]
        ctx.globalAlpha = alpha > 1 ? 1 : alpha
        ctx.fillRect(q[0] - s / 2, q[1] - s / 2, s, s)
      }
      ctx.globalAlpha = 1
      shell(true)

      // One passage lit at a time, and a tag drawn out to what it is.
      // No tags on a phone: there is no room beside the sphere for one.
      if (!reduce && tags.length > 0 && w >= 640) {
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
        nextTag -= dt
        if (!lit && nextTag <= 0) {
          for (let tries = 0; tries < 60; tries++) {
            const i = (Math.random() * N) | 0
            // A point on the near face, low enough that neither it nor its tag
            // comes up behind the words above the sphere.
            if (sz[i] < -R * 0.4 && sy[i] > cy - R * 0.35 && sy[i] < cy + R * 0.55) {
              lit = { i, tag: tagIndex++ % tags.length, t0: now, side: tagIndex % 2 ? 1 : -1 }
              const item = tags[lit.tag]
              const b = document.createElement('b')
              b.textContent = item.id
              tag!.replaceChildren(b, document.createTextNode(item.text))
              break
            }
          }
        }
        if (lit) {
          const age = (now - lit.t0) / 1000
          const life = 3.4
          if (age > life) {
            lit = null
            nextTag = 1.2
            tag!.style.opacity = '0'
          } else {
            const a = Math.min(1, age / 0.4, (life - age) / 0.5)
            const qx = sx[lit.i]
            const qy = sy[lit.i]
            const lx = cx + lit.side * (C * 1.2 + 24)
            const ly = Math.max(h * 0.6, Math.min(h - 220, qy - 20))
            ctx.strokeStyle = `rgba(255,91,26,${(0.75 * a).toFixed(3)})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(qx, qy)
            ctx.lineTo(lx - lit.side * 28, ly)
            ctx.lineTo(lx, ly)
            ctx.stroke()
            ctx.fillStyle = `rgba(255,91,26,${a.toFixed(3)})`
            ctx.beginPath()
            ctx.arc(qx, qy, 3, 0, Math.PI * 2)
            ctx.fill()
            const bw = tag!.offsetWidth
            tag!.style.opacity = String(a)
            tag!.style.transform = `translate(${lit.side > 0 ? lx + 6 : lx - bw - 6}px, ${ly - 15}px)`
          }
        }
      }
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
    start()
    const resize = new ResizeObserver(() => {
      size()
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
      const rect = host.getBoundingClientRect()
      pointer.tx = (event.clientX - rect.left) / rect.width - 0.5
      pointer.ty = (event.clientY - rect.top) / rect.height - 0.5
    }
    if (!reduce) host.addEventListener('pointermove', onMove, { passive: true })

    return () => {
      if (frame) cancelAnimationFrame(frame)
      resize.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      host.removeEventListener('pointermove', onMove)
    }
  }, [tags])

  return (
    <div aria-hidden className={className}>
      <canvas ref={canvasRef} className="lp-hero-canvas" />
      <div ref={tagRef} className="lp-sphere-tag" />
    </div>
  )
}
