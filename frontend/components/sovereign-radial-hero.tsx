'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface RadialNode {
  id: string
  label: string
  angleDeg: number // 0 at top, clockwise
  distance: number // percentage from center
}

const RADIAL_NODES: RadialNode[] = [
  { id: 'model', label: 'LOCAL MODEL', angleDeg: 0, distance: 38 },
  { id: 'vector', label: 'VECTOR STORE', angleDeg: 60, distance: 38 },
  { id: 'sandbox', label: 'SANDBOX', angleDeg: 120, distance: 38 },
  { id: 'documents', label: 'DOCUMENT STORE', angleDeg: 180, distance: 38 },
  { id: 'agent', label: 'AGENT', angleDeg: 240, distance: 38 },
  { id: 'audit', label: 'AUDIT LOG', angleDeg: 300, distance: 38 },
]

export function SovereignRadialHero({
  activeNodeId,
  className = '',
}: {
  activeNodeId?: string
  className?: string
}) {
  const [pulseProgress, setPulseProgress] = useState(0)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  useEffect(() => {
    let animFrame: number
    const start = performance.now()

    const animate = (time: number) => {
      const elapsed = (time - start) / 2600
      setPulseProgress(elapsed % 1)
      animFrame = requestAnimationFrame(animate)
    }

    animFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animFrame)
  }, [])

  // Calculate coordinates in SVG 100x100 space
  const nodesWithPos = useMemo(() => {
    return RADIAL_NODES.map((node) => {
      const rad = (node.angleDeg - 90) * (Math.PI / 180)
      const x = 50 + node.distance * Math.cos(rad)
      const y = 50 + node.distance * Math.sin(rad)
      return { ...node, x, y }
    })
  }, [])

  return (
    <div className={cn('relative flex h-[380px] w-full max-w-[500px] items-center justify-center select-none', className)}>
      {/* Background constellation & delicate grid */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Faint ambient constellation points & lines */}
        <g stroke="rgba(140, 138, 134, 0.18)" strokeWidth="0.25">
          <line x1="20" y1="24" x2="35" y2="15" />
          <line x1="68" y1="18" x2="84" y2="28" />
          <line x1="78" y1="52" x2="92" y2="48" />
          <line x1="12" y1="65" x2="28" y2="78" />
          <line x1="65" y1="84" x2="80" y2="92" />
        </g>
        <g fill="rgba(140, 138, 134, 0.4)">
          <circle cx="20" cy="24" r="0.6" />
          <circle cx="35" cy="15" r="0.5" />
          <circle cx="68" cy="18" r="0.6" />
          <circle cx="84" cy="28" r="0.5" />
          <circle cx="78" cy="52" r="0.5" />
          <circle cx="92" cy="48" r="0.6" />
          <circle cx="12" cy="65" r="0.5" />
          <circle cx="28" cy="78" r="0.6" />
          <circle cx="65" cy="84" r="0.5" />
          <circle cx="80" cy="92" r="0.6" />
        </g>

        {/* Outer Circular Perimeter Ring */}
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke="rgba(180, 178, 174, 0.4)"
          strokeWidth="0.4"
        />

        {/* Delicate Inner & Outer Concentric Guide Rings */}
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="rgba(180, 178, 174, 0.18)"
          strokeWidth="0.3"
          strokeDasharray="1 3"
        />
        <circle
          cx="50"
          cy="50"
          r="26"
          fill="none"
          stroke="rgba(180, 178, 174, 0.22)"
          strokeWidth="0.3"
        />

        {/* 6 Radial Spoke Lines from Center (50, 50) */}
        {nodesWithPos.map((node) => {
          const isActive = activeNodeId === node.id || hoveredNode === node.id
          return (
            <g key={node.id}>
              {/* Spoke Line */}
              <line
                x1="50"
                y1="50"
                x2={node.x}
                y2={node.y}
                stroke={isActive ? 'var(--sovereign)' : 'rgba(180, 178, 174, 0.5)'}
                strokeWidth={isActive ? '0.6' : '0.35'}
              />

              {/* Traveling Green Data Packet along each spoke */}
              <circle
                cx={50 + (node.x - 50) * pulseProgress}
                cy={50 + (node.y - 50) * pulseProgress}
                r="0.8"
                fill="var(--sovereign)"
                className="drop-shadow-[0_0_4px_var(--sovereign)]"
              />

              {/* Faint static mid-dot on spoke */}
              <circle
                cx={50 + (node.x - 50) * 0.5}
                cy={50 + (node.y - 50) * 0.5}
                r="0.4"
                fill="var(--sovereign)"
                opacity="0.6"
              />
            </g>
          )
        })}
      </svg>

      {/* Central HOST Node */}
      <div className="absolute z-20 flex h-14 w-14 flex-col items-center justify-center rounded-full border border-border-strong bg-surface shadow-sm transition-transform hover:scale-105">
        <span className="font-mono text-[11px] font-bold tracking-wider text-foreground">HOST</span>
        <span className="font-mono text-[9px] text-foreground-muted">127.0.0.1</span>
      </div>

      {/* 6 Square Station Nodes + Text Labels */}
      {nodesWithPos.map((node) => {
        const isHovered = hoveredNode === node.id
        const isActive = activeNodeId === node.id || isHovered

        // Position text label relative to node
        let labelPositionClasses = ''
        if (node.angleDeg === 0) labelPositionClasses = 'bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 text-center'
        else if (node.angleDeg === 60) labelPositionClasses = 'bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 sm:left-full sm:bottom-auto sm:translate-x-2 text-left'
        else if (node.angleDeg === 120) labelPositionClasses = 'top-[calc(100%+4px)] left-1/2 -translate-x-1/2 sm:left-full sm:top-auto sm:translate-x-2 text-left'
        else if (node.angleDeg === 180) labelPositionClasses = 'top-[calc(100%+6px)] left-1/2 -translate-x-1/2 text-center'
        else if (node.angleDeg === 240) labelPositionClasses = 'top-[calc(100%+4px)] left-1/2 -translate-x-1/2 sm:right-full sm:left-auto sm:top-auto sm:-translate-x-2 text-right'
        else if (node.angleDeg === 300) labelPositionClasses = 'bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 sm:right-full sm:left-auto sm:bottom-auto sm:-translate-x-2 text-right'

        return (
          <div
            key={node.id}
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
            }}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
          >
            {/* Square Box */}
            <div
              className={cn(
                'flex h-4 w-4 items-center justify-center border bg-surface transition-all duration-200',
                isActive
                  ? 'border-[var(--sovereign)] shadow-[0_0_10px_rgba(22,163,74,0.4)] scale-110'
                  : 'border-border-strong hover:border-foreground'
              )}
            >
              <div
                className={cn(
                  'h-1.5 w-1.5 transition-colors',
                  isActive ? 'bg-[var(--sovereign)]' : 'bg-transparent'
                )}
              />
            </div>

            {/* Uppercase Monospace Label */}
            <div
              className={cn(
                'absolute whitespace-nowrap font-mono text-[10px] tracking-[0.14em] uppercase transition-colors pointer-events-none',
                labelPositionClasses,
                isActive ? 'text-[var(--sovereign)] font-bold' : 'text-foreground-muted group-hover:text-foreground'
              )}
            >
              {node.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}
