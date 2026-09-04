'use client'

import { useEffect, useRef } from 'react'

/**
 * Optimus-Inspired Moving Dotted Matrix Background
 *
 * Renders a crisp grid of circular rings with undulating traveling wave physics,
 * dynamic filled dot swells, and interactive mouse cursor ripples.
 * Ultra-lightweight, 60fps hardware-accelerated canvas.
 */
export function AnimatedTechnicalBackground({
  className = '',
  dotSpacing = 28,
}: {
  className?: string
  dotSpacing?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let dpr = 1
    let raf = 0
    const mouse = { x: -2000, y: -2000, targetX: -2000, targetY: -2000 }

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const onMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX
      mouse.targetY = e.clientY
    }

    const onMouseLeave = () => {
      mouse.targetX = -2000
      mouse.targetY = -2000
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    document.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('resize', resize)

    resize()

    const startTime = performance.now()

    const render = (time: number) => {
      const elapsed = (time - startTime) * 0.0018

      // Smooth mouse easing
      mouse.x += (mouse.targetX - mouse.x) * 0.12
      mouse.y += (mouse.targetY - mouse.y) * 0.12

      ctx.clearRect(0, 0, width, height)

      const cols = Math.ceil(width / dotSpacing) + 2
      const rows = Math.ceil(height / dotSpacing) + 2
      const offsetX = (width % dotSpacing) / 2
      const offsetY = (height % dotSpacing) / 2

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = offsetX + (c - 1) * dotSpacing
          const y = offsetY + (r - 1) * dotSpacing

          // Multi-harmonic traveling diagonal wave physics
          const wave1 = Math.sin(x * 0.007 + y * 0.005 - elapsed * 1.8)
          const wave2 = Math.cos(x * 0.004 - y * 0.006 + elapsed * 1.2)
          const combinedWave = (wave1 * 0.65 + wave2 * 0.35 + 1) / 2 // 0 to 1

          // Distance and ripple from mouse cursor
          const distToMouse = Math.hypot(x - mouse.x, y - mouse.y)
          const mouseRadius = 160
          let mouseEffect = 0
          if (distToMouse < mouseRadius) {
            const rawProximity = 1 - distToMouse / mouseRadius
            const ripple = Math.sin((distToMouse / 24) - elapsed * 3) * 0.3
            mouseEffect = Math.max(0, rawProximity + ripple)
          }

          // Composite intensity factor
          const intensity = Math.min(1, combinedWave * 0.75 + mouseEffect * 0.8)

          // 1. Draw base circular ring outline
          const baseRingRadius = 2.2 + intensity * 1.6
          const ringAlpha = 0.18 + intensity * 0.35
          
          ctx.beginPath()
          ctx.arc(x, y, baseRingRadius, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(130, 128, 122, ${ringAlpha})`
          ctx.lineWidth = 0.75
          ctx.stroke()

          // 2. Draw solid filled inner dot when wave or mouse passes
          if (intensity > 0.45) {
            const fillRadius = Math.max(0.8, (intensity - 0.45) * 4.8)
            const fillAlpha = Math.min(0.85, (intensity - 0.45) * 1.5)

            ctx.beginPath()
            ctx.arc(x, y, fillRadius, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(50, 48, 44, ${fillAlpha})`
            ctx.fill()
          }
        }
      }

      if (!reduced) {
        raf = requestAnimationFrame(render)
      }
    }

    if (reduced) {
      render(0)
    } else {
      raf = requestAnimationFrame(render)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('resize', resize)
    }
  }, [dotSpacing])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`fixed inset-0 pointer-events-none ${className}`}
      style={{ zIndex: 0 }}
    />
  )
}

