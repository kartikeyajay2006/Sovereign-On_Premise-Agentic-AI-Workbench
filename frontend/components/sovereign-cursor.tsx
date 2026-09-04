'use client'

import { useEffect, useRef, useState } from 'react'

export function SovereignCursor() {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [hoverType, setHoverType] = useState<'button' | 'text' | 'danger' | 'link' | null>(null)
  const [clicked, setClicked] = useState(false)

  // Cursor coordinates
  const mousePos = useRef({ x: -100, y: -100 })
  const ringPos = useRef({ x: -100, y: -100 })
  const dotRef = useRef<HTMLDivElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Only run on desktop fine pointers
    if (typeof window === 'undefined') return
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (isTouch || prefersReduced) return

    setMounted(true)

    // Hide default cursor across document body
    document.documentElement.classList.add('custom-cursor-enabled')

    const onMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY }
      if (!visible) setVisible(true)

      // Detect interactive element beneath cursor
      const target = e.target as HTMLElement | null
      if (!target) return

      const interactive = target.closest(
        'button, a, input, textarea, select, [role="button"], [role="tab"], [role="menuitem"], [data-interactive="true"], .clickable',
      )

      if (interactive) {
        setHovered(true)
        if (target.closest('input, textarea')) {
          setHoverType('text')
        } else if (target.closest('.border-critical, [data-tone="critical"], .hover\\:text-critical')) {
          setHoverType('danger')
        } else if (target.closest('a')) {
          setHoverType('link')
        } else {
          setHoverType('button')
        }
      } else {
        setHovered(false)
        setHoverType(null)
      }
    }

    const onMouseDown = () => setClicked(true)
    const onMouseUp = () => setClicked(false)

    const onMouseEnter = () => setVisible(true)
    const onMouseLeave = () => setVisible(false)

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    document.documentElement.addEventListener('mouseenter', onMouseEnter)
    document.documentElement.addEventListener('mouseleave', onMouseLeave)

    // Smooth animation loop for trailing reticle ring
    let animationFrameId: number
    const animate = () => {
      // Lerp ring towards mouse with smooth damping
      const lerp = 0.2
      ringPos.current.x += (mousePos.current.x - ringPos.current.x) * lerp
      ringPos.current.y += (mousePos.current.y - ringPos.current.y) * lerp

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mousePos.current.x}px, ${mousePos.current.y}px, 0)`
      }

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringPos.current.x}px, ${ringPos.current.y}px, 0)`
      }

      animationFrameId = requestAnimationFrame(animate)
    }

    animationFrameId = requestAnimationFrame(animate)

    return () => {
      document.documentElement.classList.remove('custom-cursor-enabled')
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      document.documentElement.removeEventListener('mouseenter', onMouseEnter)
      document.documentElement.removeEventListener('mouseleave', onMouseLeave)
      cancelAnimationFrame(animationFrameId)
    }
  }, [visible])

  if (!mounted) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[999999] overflow-hidden transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {/* Precision Trailing Reticle Ring */}
      <div
        ref={ringRef}
        className="fixed -left-4 -top-4 will-change-transform pointer-events-none"
      >
        <div
          className={`relative flex items-center justify-center transition-all duration-200 ease-out ${
            hovered
              ? hoverType === 'text'
                ? 'h-8 w-4 -translate-x-0 -translate-y-2'
                : hoverType === 'danger'
                  ? 'h-10 w-10 -translate-x-1 -translate-y-1 rotate-45'
                  : 'h-10 w-10 -translate-x-1 -translate-y-1'
              : clicked
                ? 'h-6 w-6 translate-x-1 translate-y-1'
                : 'h-8 w-8'
          }`}
        >
          {/* Outer Glass Chassis */}
          <div
            className={`absolute inset-0 rounded-full border transition-all duration-200 ${
              hovered
                ? hoverType === 'danger'
                  ? 'border-critical/80 bg-critical/10 shadow-[0_0_12px_rgba(220,38,38,0.3)]'
                  : hoverType === 'text'
                    ? 'rounded-none border-x border-y-0 border-[var(--sovereign)] bg-transparent'
                    : 'border-[var(--sovereign)]/80 bg-[var(--sovereign)]/10 shadow-[0_0_14px_rgba(22,163,74,0.25)]'
                : clicked
                  ? 'border-foreground bg-foreground/15 scale-90'
                  : 'border-foreground/30 bg-foreground/[0.03]'
            }`}
          />

          {/* Precision 4-Corner Crosshair Ticks (Air-Gapped Sovereign Aesthetic) */}
          {!hovered && (
            <>
              {/* Top Tick */}
              <span className="absolute top-0 h-1 w-[1px] bg-foreground/50" />
              {/* Bottom Tick */}
              <span className="absolute bottom-0 h-1 w-[1px] bg-foreground/50" />
              {/* Left Tick */}
              <span className="absolute left-0 h-[1px] w-1 bg-foreground/50" />
              {/* Right Tick */}
              <span className="absolute right-0 h-[1px] w-1 bg-foreground/50" />
            </>
          )}

          {/* Active Target Locked Corner Brackets */}
          {hovered && hoverType !== 'text' && (
            <>
              <span className="absolute -top-0.5 -left-0.5 h-1.5 w-1.5 border-t-2 border-l-2 border-[var(--sovereign)]" />
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 border-t-2 border-r-2 border-[var(--sovereign)]" />
              <span className="absolute -bottom-0.5 -left-0.5 h-1.5 w-1.5 border-b-2 border-l-2 border-[var(--sovereign)]" />
              <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 border-b-2 border-r-2 border-[var(--sovereign)]" />
            </>
          )}

          {/* Click pulse shockwave ring */}
          {clicked && (
            <span className="absolute inset-0 rounded-full border border-[var(--sovereign)] animate-ping opacity-60" />
          )}
        </div>
      </div>

      {/* Instant Center Target Dot */}
      <div
        ref={dotRef}
        className="fixed -left-1 -top-1 will-change-transform pointer-events-none"
      >
        <div
          className={`h-2 w-2 rounded-full transition-all duration-150 ${
            hovered
              ? hoverType === 'danger'
                ? 'bg-critical scale-125 shadow-[0_0_8px_var(--critical)]'
                : 'bg-[var(--sovereign)] scale-125 shadow-[0_0_8px_var(--sovereign)]'
              : clicked
                ? 'bg-foreground scale-75'
                : 'bg-foreground shadow-[0_0_4px_rgba(0,0,0,0.3)]'
          }`}
        />
      </div>
    </div>
  )
}
