'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Server, Database, ShieldCheck, FileText, Cpu, KeyRound } from 'lucide-react'

interface RadialNode {
  id: string
  label: string
  angleDeg: number // 0 at top, clockwise
  distance: number // percentage from center
  subtext: string
  spec: string
  icon: typeof Server
}

const RADIAL_NODES: RadialNode[] = [
  {
    id: 'model',
    label: 'LOCAL MODEL',
    angleDeg: 0,
    distance: 38,
    subtext: 'Qwen 2.5 72B-Instruct',
    spec: '0ms Egress · 14.8 GB VRAM · Local Ollama',
    icon: Cpu,
  },
  {
    id: 'vector',
    label: 'VECTOR STORE',
    angleDeg: 60,
    distance: 38,
    subtext: 'ChromaDB HNSW',
    spec: '42,890 Embeddings · Local SQLite',
    icon: Database,
  },
  {
    id: 'sandbox',
    label: 'SANDBOX',
    angleDeg: 120,
    distance: 38,
    subtext: 'gVisor Kernel',
    spec: 'Confined Container · Network ISOLATED',
    icon: ShieldCheck,
  },
  {
    id: 'documents',
    label: 'DOCUMENT STORE',
    angleDeg: 180,
    distance: 38,
    subtext: 'Encrypted Chunk Store',
    spec: 'SHA-256 Verified · Host Storage',
    icon: FileText,
  },
  {
    id: 'agent',
    label: 'AGENT',
    angleDeg: 240,
    distance: 38,
    subtext: 'Deterministic ReAct',
    spec: 'AST Constrained · Loop Protection',
    icon: Server,
  },
  {
    id: 'audit',
    label: 'AUDIT LOG',
    angleDeg: 300,
    distance: 38,
    subtext: 'Immutable Hash-Chain',
    spec: '0 External Calls · Append-Only Merkle',
    icon: KeyRound,
  },
]

export function SovereignRadialHero({
  activeNodeId,
  className = '',
}: {
  activeNodeId?: string
  className?: string
}) {
  const [pulseProgress, setPulseProgress] = useState(0)
  const [radarAngle, setRadarAngle] = useState(0)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  useEffect(() => {
    let animFrame: number
    const start = performance.now()

    const animate = (time: number) => {
      const elapsed = time - start
      setPulseProgress((elapsed / 2400) % 1)
      setRadarAngle((elapsed * 0.04) % 360)
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

  const activeNode = nodesWithPos.find(
    (n) => n.id === (hoveredNode || activeNodeId)
  )

  return (
    <div className={cn('relative flex h-[400px] w-full max-w-[540px] items-center justify-center select-none', className)}>
      {/* Background constellation & delicate radar sweep */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="radarSweepGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--sovereign)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--sovereign)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient constellation points & connections */}
        <g stroke="rgba(140, 138, 134, 0.16)" strokeWidth="0.2">
          <line x1="18" y1="22" x2="34" y2="14" />
          <line x1="68" y1="16" x2="84" y2="26" />
          <line x1="80" y1="52" x2="94" y2="46" />
          <line x1="10" y1="64" x2="26" y2="78" />
          <line x1="66" y1="84" x2="82" y2="92" />
        </g>
        <g fill="rgba(140, 138, 134, 0.35)">
          <circle cx="18" cy="22" r="0.5" />
          <circle cx="34" cy="14" r="0.4" />
          <circle cx="68" cy="16" r="0.5" />
          <circle cx="84" cy="26" r="0.4" />
          <circle cx="80" cy="52" r="0.5" />
          <circle cx="94" cy="46" r="0.4" />
          <circle cx="10" cy="64" r="0.4" />
          <circle cx="26" cy="78" r="0.5" />
          <circle cx="66" cy="84" r="0.4" />
          <circle cx="82" cy="92" r="0.5" />
        </g>

        {/* Outer Circular Perimeter Ring */}
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke="rgba(160, 158, 154, 0.35)"
          strokeWidth="0.4"
        />

        {/* Concentric Guide Rings */}
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="rgba(160, 158, 154, 0.14)"
          strokeWidth="0.25"
          strokeDasharray="1 3"
        />
        <circle
          cx="50"
          cy="50"
          r="26"
          fill="none"
          stroke="rgba(160, 158, 154, 0.2)"
          strokeWidth="0.3"
        />

        {/* Faint rotating radar sweep beam */}
        <line
          x1="50"
          y1="50"
          x2={50 + 38 * Math.cos((radarAngle * Math.PI) / 180)}
          y2={50 + 38 * Math.sin((radarAngle * Math.PI) / 180)}
          stroke="var(--sovereign)"
          strokeWidth="0.3"
          strokeOpacity="0.3"
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
                stroke={isActive ? 'var(--sovereign)' : 'rgba(160, 158, 154, 0.45)'}
                strokeWidth={isActive ? '0.7' : '0.35'}
              />

              {/* Traveling Green Data Packet along each spoke */}
              <circle
                cx={50 + (node.x - 50) * pulseProgress}
                cy={50 + (node.y - 50) * pulseProgress}
                r="0.85"
                fill="var(--sovereign)"
                className="drop-shadow-[0_0_5px_var(--sovereign)]"
              />

              {/* Static mid-dot on spoke */}
              <circle
                cx={50 + (node.x - 50) * 0.5}
                cy={50 + (node.y - 50) * 0.5}
                r="0.4"
                fill="var(--sovereign)"
                opacity="0.5"
              />
            </g>
          )
        })}
      </svg>

      {/* Central HOST Core */}
      <div className="group relative z-20 flex h-16 w-16 flex-col items-center justify-center rounded-full border border-border-strong bg-surface/90 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-foreground">
        {/* Subtle glowing halo */}
        <div className="absolute -inset-1 rounded-full bg-[var(--sovereign)]/10 blur-sm pointer-events-none" />
        
        <span className="font-mono text-[11px] font-bold tracking-wider text-foreground">HOST</span>
        <span className="font-mono text-[9px] text-foreground-muted">127.0.0.1</span>

        {/* Hover telemetry badge for HOST */}
        <div className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-surface/95 px-2 py-0.5 font-mono text-[9px] text-foreground-secondary shadow-sm opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          ● Air-Gapped Loopback
        </div>
      </div>

      {/* 6 Square Station Nodes + Text Labels */}
      {nodesWithPos.map((node) => {
        const isHovered = hoveredNode === node.id
        const isActive = activeNodeId === node.id || isHovered

        // Position text label relative to node
        let labelPositionClasses = ''
        if (node.angleDeg === 0) labelPositionClasses = 'bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 text-center'
        else if (node.angleDeg === 60) labelPositionClasses = 'bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 sm:left-full sm:bottom-auto sm:translate-x-2.5 text-left'
        else if (node.angleDeg === 120) labelPositionClasses = 'top-[calc(100%+4px)] left-1/2 -translate-x-1/2 sm:left-full sm:top-auto sm:translate-x-2.5 text-left'
        else if (node.angleDeg === 180) labelPositionClasses = 'top-[calc(100%+8px)] left-1/2 -translate-x-1/2 text-center'
        else if (node.angleDeg === 240) labelPositionClasses = 'top-[calc(100%+4px)] left-1/2 -translate-x-1/2 sm:right-full sm:left-auto sm:top-auto sm:-translate-x-2.5 text-right'
        else if (node.angleDeg === 300) labelPositionClasses = 'bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 sm:right-full sm:left-auto sm:bottom-auto sm:-translate-x-2.5 text-right'

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
            {/* Station Box */}
            <div
              className={cn(
                'flex h-4.5 w-4.5 items-center justify-center border bg-surface transition-all duration-200',
                isActive
                  ? 'border-[var(--sovereign)] shadow-[0_0_12px_rgba(22,163,74,0.45)] scale-110'
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

            {/* Live Telemetry Tooltip on Hover */}
            {isHovered && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-3 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-strong bg-surface/95 px-3 py-2 text-left shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center gap-2 border-b border-border pb-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--sovereign)]" />
                  <span className="font-mono text-[10px] font-bold text-foreground">{node.label}</span>
                </div>
                <div className="mt-1 font-sans text-[11px] font-medium text-foreground-secondary">{node.subtext}</div>
                <div className="mt-0.5 font-mono text-[9px] text-foreground-muted">{node.spec}</div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

