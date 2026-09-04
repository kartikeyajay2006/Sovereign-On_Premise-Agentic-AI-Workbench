'use client'

import { useEffect, useRef } from 'react'

interface AnimatedTechnicalBackgroundProps {
  className?: string
  dotSpacing?: number
  masked?: boolean
}

/**
 * Premium Optimus-Grade Moving Dotted Matrix Background
 *
 * Renders a crisp architectural grid of circular rings with undulating traveling wave physics,
 * dynamic filled dot swells, and interactive mouse cursor ripples.
 * Uses a subtle radial vignette mask so it breathes naturally into the hero
 * without overwhelming lower UI content.
 */
export function AnimatedTechnicalBackground({
  className = '',
  dotSpacing = 30,
  masked = true,
}: AnimatedTechnicalBackgroundProps) {
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
      const elapsed = (time - startTime) * 0.0016

      // Smooth mouse easing
      mouse.x += (mouse.targetX - mouse.x) * 0.1
      mouse.y += (mouse.targetY - mouse.y) * 0.1

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
          const wave1 = Math.sin(x * 0.006 + y * 0.0045 - elapsed * 1.6)
          const wave2 = Math.cos(x * 0.0035 - y * 0.005 + elapsed * 1.1)
          const combinedWave = (wave1 * 0.65 + wave2 * 0.35 + 1) / 2 // 0 to 1

          // Proximity & ripple from mouse cursor
          const distToMouse = Math.hypot(x - mouse.x, y - mouse.y)
          const mouseRadius = 150
          let mouseEffect = 0
          if (distToMouse < mouseRadius) {
            const rawProximity = 1 - distToMouse / mouseRadius
            const ripple = Math.sin(distToMouse / 22 - elapsed * 2.8) * 0.25
            mouseEffect = Math.max(0, rawProximity + ripple)
          }

          // Composite wave intensity
          const intensity = Math.min(1, combinedWave * 0.7 + mouseEffect * 0.8)

          // 1. Base circular ring outline
          const baseRingRadius = 1.8 + intensity * 1.4
          const ringAlpha = 0.14 + intensity * 0.32

          ctx.beginPath()
          ctx.arc(x, y, baseRingRadius, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(130, 128, 122, ${ringAlpha})`
          ctx.lineWidth = 0.65
          ctx.stroke()

          // 2. Solid filled inner dot when wave or mouse passes
          if (intensity > 0.48) {
            const fillRadius = Math.max(0.7, (intensity - 0.48) * 4.2)
            const fillAlpha = Math.min(0.8, (intensity - 0.48) * 1.4)

            ctx.beginPath()
            ctx.arc(x, y, fillRadius, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(45, 43, 39, ${fillAlpha})`
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
      className={`fixed inset-0 pointer-events-none transition-opacity duration-500 ${className}`}
      style={{
        zIndex: 0,
        maskImage: masked
          ? 'radial-gradient(ellipse 75% 65% at 50% 28%, black 15%, rgba(0,0,0,0.6) 55%, transparent 90%)'
          : undefined,
        WebkitMaskImage: masked
          ? 'radial-gradient(ellipse 75% 65% at 50% 28%, black 15%, rgba(0,0,0,0.6) 55%, transparent 90%)'
          : undefined,
      }}
    />
  )
}


