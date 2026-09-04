'use client'

import { useEffect, useRef } from 'react'

interface Node {
  x: number
  y: number
  vx: number
  vy: number
}

/**
 * Sparse monochrome constellation + drifting micro-particles rendered on a
 * single canvas. Slow, precise, mechanical motion. Honors prefers-reduced-motion
 * by rendering one static frame. Node count stays low for performance.
 */
export function AnimatedTechnicalBackground({
  dark = false,
  density = 26,
  className,
}: {
  dark?: boolean
  density?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const line = dark ? 'rgba(120,120,116,' : 'rgba(90,88,84,'
    const dot = dark ? 'rgba(160,158,152,' : 'rgba(80,78,74,'

    let width = 0
    let height = 0
    let dpr = 1
    const nodes: Node[] = []

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      width = rect?.width ?? canvas.clientWidth
      height = rect?.height ?? canvas.clientHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const seed = () => {
      nodes.length = 0
      const count = Math.max(10, Math.round((width / 1200) * density))
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12,
        })
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const m = nodes[j]
          const dx = n.x - m.x
          const dy = n.y - m.y
          const d = Math.hypot(dx, dy)
          if (d < 150) {
            ctx.strokeStyle = `${line}${(1 - d / 150) * 0.16})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(n.x, n.y)
            ctx.lineTo(m.x, m.y)
            ctx.stroke()
          }
        }
      }
      for (const n of nodes) {
        ctx.fillStyle = `${dot}0.5)`
        ctx.fillRect(n.x - 1, n.y - 1, 2, 2)
      }
    }

    const step = () => {
      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < 0 || n.x > width) n.vx *= -1
        if (n.y < 0 || n.y > height) n.vy *= -1
      }
      draw()
      raf = requestAnimationFrame(step)
    }

    let raf = 0
    resize()
    seed()

    if (reduced) {
      draw()
    } else {
      raf = requestAnimationFrame(step)
    }

    const onResize = () => {
      resize()
      seed()
      if (reduced) draw()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [dark, density])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    />
  )
}
