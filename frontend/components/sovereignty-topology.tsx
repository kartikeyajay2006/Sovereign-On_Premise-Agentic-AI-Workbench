'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  FileText,
  Eye,
  Database,
  Terminal,
  FileCheck2,
  ShieldCheck,
  Zap,
  RotateCcw,
  Sparkles,
  Info,
  X,
  Lock,
  ArrowRight,
  Activity,
  AlertTriangle,
  Move,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type TopologyNodeId =
  | 'documents'
  | 'model'
  | 'vector'
  | 'sandbox'
  | 'agent'
  | 'audit'

interface StationMeta {
  id: TopologyNodeId
  number: string
  label: string
  subtitle: string
  icon: any
  tech: string
  guarantee: string
  color: string
  defaultPos: { x: number; y: number }
}

const STATIONS: StationMeta[] = [
  {
    id: 'documents',
    number: '01',
    label: 'LOCAL INTAKE',
    subtitle: 'Scans & CAD arrive',
    icon: FileText,
    tech: 'PyMuPDF · Direct Memory Buffer',
    guarantee: 'Zero disk cache leaks. Ingests PDFs, TIFFs, XLSX directly to local RAM.',
    color: '#10b981', // green
    defaultPos: { x: 12, y: 32 },
  },
  {
    id: 'model',
    number: '02',
    label: 'VISION READ',
    subtitle: 'Local Vision Model',
    icon: Eye,
    tech: 'Qwen 2.5 VL 7B · Localhost:8000',
    guarantee: 'Visual reasoning and OCR executed 100% on on-premise GPU.',
    color: '#3b82f6', // blue
    defaultPos: { x: 42, y: 15 },
  },
  {
    id: 'vector',
    number: '03',
    label: 'SOP VECTORS',
    subtitle: 'Local Knowledge Base',
    icon: Database,
    tech: 'MiniLM-L6-v2 · On-Prem Vectors',
    guarantee: 'Engineering SOPs and inspection guidelines queried locally.',
    color: '#8b5cf6', // purple
    defaultPos: { x: 78, y: 22 },
  },
  {
    id: 'sandbox',
    number: '04',
    label: 'AST SANDBOX',
    subtitle: 'Isolated Computation',
    icon: Terminal,
    tech: 'Python AST Validator · cgroups',
    guarantee: 'Static AST analysis bans socket, os.system, and urllib imports.',
    color: '#f59e0b', // amber
    defaultPos: { x: 74, y: 72 },
  },
  {
    id: 'agent',
    number: '05',
    label: 'APPROVAL',
    subtitle: 'Human Sign-off',
    icon: FileCheck2,
    tech: 'PKI Digital Signature · RBAC',
    guarantee: 'Human-in-the-loop gate before any document is released.',
    color: '#ec4899', // pink
    defaultPos: { x: 40, y: 82 },
  },
  {
    id: 'audit',
    number: '06',
    label: 'AUDIT LEDGER',
    subtitle: 'Tamper-Evident Hash',
    icon: ShieldCheck,
    tech: 'SHA-256 Chained JSONL Ledger',
    guarantee: 'Every step cryptographically chained: H_n = SHA256(H_{n-1} || Step).',
    color: '#16a34a', // sovereign green
    defaultPos: { x: 14, y: 74 },
  },
]

export function SovereigntyTopology({
  active = false,
  activeNodes = [],
  breached = false,
  className = '',
}: {
  active?: boolean
  activeNodes?: TopologyNodeId[]
  breached?: boolean
  className?: string
}) {
  const [positions, setPositions] = useState<{ [key: string]: { x: number; y: number } }>(() => {
    const init: { [key: string]: { x: number; y: number } } = {}
    STATIONS.forEach((s) => {
      init[s.id] = { ...s.defaultPos }
    })
    return init
  })

  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const [selectedStation, setSelectedStation] = useState<StationMeta | null>(null)
  const [egressTestActive, setEgressTestActive] = useState(false)
  const [egressDeflected, setEgressDeflected] = useState(false)
  const [particles, setParticles] = useState<{ id: number; progress: number; fromIdx: number }[]>([
    { id: 1, progress: 0.1, fromIdx: 0 },
    { id: 2, progress: 0.45, fromIdx: 2 },
    { id: 3, progress: 0.8, fromIdx: 4 },
  ])

  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartPos = useRef({ mouseX: 0, mouseY: 0, nodeX: 0, nodeY: 0 })

  // Reset positions to default layout
  const resetLayout = useCallback(() => {
    const init: { [key: string]: { x: number; y: number } } = {}
    STATIONS.forEach((s) => {
      init[s.id] = { ...s.defaultPos }
    })
    setPositions(init)
  }, [])

  // Animate particles along connecting paths
  useEffect(() => {
    const speed = active ? 0.016 : 0.006
    const interval = setInterval(() => {
      setParticles((prev) =>
        prev.map((p) => {
          const nextProg = p.progress + speed
          if (nextProg >= 1) {
            return {
              id: p.id,
              progress: 0,
              fromIdx: (p.fromIdx + 1) % STATIONS.length,
            }
          }
          return { ...p, progress: nextProg }
        })
      )
    }, 30)
    return () => clearInterval(interval)
  }, [active])

  // Handle Dragging
  const handleMouseDownNode = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDraggingNode(id)
    dragStartPos.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: positions[id]?.x || 0,
      nodeY: positions[id]?.y || 0,
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingNode || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const dxPercent = ((e.clientX - dragStartPos.current.mouseX) / rect.width) * 100
      const dyPercent = ((e.clientY - dragStartPos.current.mouseY) / rect.height) * 100

      const newX = Math.max(4, Math.min(88, dragStartPos.current.nodeX + dxPercent))
      const newY = Math.max(8, Math.min(84, dragStartPos.current.nodeY + dyPercent))

      setPositions((prev) => ({
        ...prev,
        [draggingNode]: { x: newX, y: newY },
      }))
    }

    const handleMouseUp = () => {
      setDraggingNode(null)
    }

    if (draggingNode) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingNode])

  // Trigger simulated air-gap breach test
  const triggerEgressTest = () => {
    if (egressTestActive) return
    setEgressTestActive(true)
    setEgressDeflected(false)

    setTimeout(() => {
      setEgressDeflected(true)
    }, 700)

    setTimeout(() => {
      setEgressTestActive(false)
      setEgressDeflected(false)
    }, 2800)
  }

  // Calculate SVG curve paths between stations in order
  const getCircuitPath = () => {
    if (!STATIONS.length) return ''
    const pts = STATIONS.map((s) => positions[s.id] || s.defaultPos)
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 0; i < pts.length; i++) {
      const curr = pts[i]
      const next = pts[(i + 1) % pts.length]
      const mx = (curr.x + next.x) / 2
      const my = (curr.y + next.y) / 2
      d += ` Q ${curr.x} ${curr.y}, ${mx} ${my}`
    }
    d += ` Z`
    return d
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-[540px] sm:h-[620px] rounded-xl border border-border bg-ink tech-grid-ink overflow-hidden select-none p-4 sm:p-6 flex flex-col justify-between shadow-2xl',
        className
      )}
    >
      {/* Air-Gap Perimeter Security Border */}
      <div className="pointer-events-none absolute inset-2 rounded-lg border border-[var(--sovereign)]/30 border-dashed" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[var(--sovereign)]/5 to-transparent" />

      {/* Top Header Bar */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-ink-border pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--sovereign)]/20 text-[var(--sovereign)]">
            <Lock className="h-3.5 w-3.5" />
          </span>
          <div className="flex flex-col">
            <span className="font-mono text-[12px] font-bold uppercase tracking-widest text-ink-foreground">
              Air-Gap Sovereign Topology
            </span>
            <span className="font-mono text-[10px] text-ink-muted">
              Live movable station circuit · 0 outbound egress
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Simulate Egress Deflection */}
          <button
            type="button"
            onClick={triggerEgressTest}
            disabled={egressTestActive}
            className={cn(
              'flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-all',
              egressTestActive
                ? 'border-critical bg-critical/20 text-critical animate-pulse'
                : 'border-ink-border bg-ink-surface text-ink-foreground hover:border-[var(--sovereign)] hover:text-[var(--sovereign)]'
            )}
          >
            <Zap className="h-3.5 w-3.5 text-[var(--critical)]" />
            {egressTestActive ? 'Testing Egress Deflection…' : 'Test Air-Gap Deflection'}
          </button>

          {/* Reset Layout */}
          <button
            type="button"
            onClick={resetLayout}
            className="flex items-center gap-1 rounded border border-ink-border bg-ink-surface px-2.5 py-1.5 font-mono text-[11px] text-ink-muted hover:text-ink-foreground transition-colors"
            title="Reset node positions"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Nodes
          </button>
        </div>
      </div>

      {/* SVG Connecting Circuit Traces */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full z-10"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* Main closed loop circuit line */}
        <path
          d={getCircuitPath()}
          fill="none"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth="0.5"
          strokeDasharray="1.5 1.5"
        />

        {/* Animated Laser Circuit pulses */}
        {STATIONS.map((curr, i) => {
          const next = STATIONS[(i + 1) % STATIONS.length]
          const p1 = positions[curr.id] || curr.defaultPos
          const p2 = positions[next.id] || next.defaultPos
          const isActiveSegment = activeNodes.includes(curr.id) || activeNodes.includes(next.id)

          return (
            <line
              key={curr.id}
              x1={p1.x + 6}
              y1={p1.y + 4}
              x2={p2.x + 6}
              y2={p2.y + 4}
              stroke={isActiveSegment ? 'var(--sovereign)' : 'rgba(22, 163, 74, 0.35)'}
              strokeWidth={isActiveSegment ? '0.9' : '0.4'}
              className={isActiveSegment ? 'sov-laser-flow' : ''}
            />
          )
        })}

        {/* Traveling Data Packet Dots */}
        {particles.map((p) => {
          const from = positions[STATIONS[p.fromIdx]?.id] || STATIONS[p.fromIdx]?.defaultPos
          const to =
            positions[STATIONS[(p.fromIdx + 1) % STATIONS.length]?.id] ||
            STATIONS[(p.fromIdx + 1) % STATIONS.length]?.defaultPos
          if (!from || !to) return null
          const currentX = from.x + 6 + (to.x - from.x) * p.progress
          const currentY = from.y + 4 + (to.y - from.y) * p.progress

          return (
            <circle
              key={p.id}
              cx={currentX}
              cy={currentY}
              r="1.2"
              fill="var(--sovereign)"
              className="drop-shadow-[0_0_6px_var(--sovereign)]"
            />
          )
        })}

        {/* Egress Deflection Beam Animation */}
        {egressTestActive && (
          <g>
            <line
              x1="50"
              y1="50"
              x2="95"
              y2="15"
              stroke="var(--critical)"
              strokeWidth="1.4"
              strokeDasharray="3 3"
              className="animate-pulse"
            />
            {egressDeflected && (
              <circle
                cx="95"
                cy="15"
                r="6"
                fill="none"
                stroke="var(--critical)"
                strokeWidth="1"
                className="sov-deflection-burst"
              />
            )}
          </g>
        )}
      </svg>

      {/* Egress Deflection Notification Overlay */}
      {egressDeflected && (
        <div className="absolute top-20 right-8 z-30 flex items-center gap-2 rounded-lg border border-critical bg-critical/15 p-3 backdrop-blur-md text-critical animate-in fade-in zoom-in-95 duration-200">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="flex flex-col text-left leading-tight">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider">
              Air-Gap Boundary Defense: REFUSED
            </span>
            <span className="font-mono text-[10px] text-ink-foreground">
              Simulated outbound socket blocked at host level · 0 bytes leaked
            </span>
          </div>
        </div>
      )}

      {/* Movable Interactive Station Nodes */}
      <div className="relative z-20 h-full w-full">
        {STATIONS.map((station, index) => {
          const pos = positions[station.id] || station.defaultPos
          const isBusy = activeNodes.includes(station.id)
          const isDraggingThis = draggingNode === station.id
          const IconComponent = station.icon

          return (
            <div
              key={station.id}
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
              }}
              onMouseDown={(e) => handleMouseDownNode(e, station.id)}
              onClick={() => setSelectedStation(station)}
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing rounded-lg border p-3 backdrop-blur-md transition-shadow group',
                isDraggingThis ? 'scale-105 shadow-[0_0_30px_rgba(22,163,74,0.4)] z-40 border-[var(--sovereign)]' : 'z-20',
                isBusy
                  ? 'border-[var(--sovereign)] bg-ink-surface ring-2 ring-[var(--sovereign)]/60 shadow-[0_0_24px_rgba(22,163,74,0.3)]'
                  : 'border-ink-border bg-ink/90 hover:border-ink-muted hover:bg-ink-surface'
              )}
            >
              {/* Top Row: Station number + Title + Drag Handle */}
              <div className="flex items-center justify-between gap-3 min-w-[140px]">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded text-[10px] font-mono font-bold',
                      isBusy ? 'bg-[var(--sovereign)] text-black' : 'bg-ink-border text-ink-muted'
                    )}
                  >
                    {station.number}
                  </span>
                  <span className="font-mono text-[11px] font-semibold tracking-wider text-ink-foreground">
                    {station.label}
                  </span>
                </div>
                <Move className="h-3 w-3 text-ink-muted group-hover:text-ink-foreground opacity-60" />
              </div>

              {/* Subtitle & Status */}
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[10px] text-ink-muted leading-none">
                  {station.subtitle}
                </span>
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    isBusy ? 'bg-[var(--sovereign)] animate-ping' : 'bg-ink-muted/40'
                  )}
                />
              </div>

              {/* Active Glow Bar */}
              {isBusy && (
                <div className="absolute -bottom-px left-0 right-0 h-0.5 rounded-b-lg bg-[var(--sovereign)] shadow-[0_0_8px_var(--sovereign)]" />
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom Telemetry Footer */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-t border-ink-border pt-3">
        <div className="flex items-center gap-4 text-ink-muted">
          <span className="font-mono text-[11px] flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--sovereign)]" />
            Air-Gap Perimeter: Sealed
          </span>
          <span className="hidden sm:inline font-mono text-[11px]">
            Drag nodes to rearrange topology
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--sovereign)] font-medium">
            Local Pipeline: 6 Active Stations
          </span>
        </div>
      </div>

      {/* Interactive Node Inspector Modal */}
      {selectedStation && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-xl border border-ink-border bg-ink p-5 shadow-2xl text-ink-foreground">
            <button
              type="button"
              onClick={() => setSelectedStation(null)}
              className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-ink-surface hover:text-ink-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2.5 border-b border-ink-border pb-3">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--sovereign)]/20 text-[var(--sovereign)] font-mono font-bold text-[12px]">
                {selectedStation.number}
              </span>
              <div>
                <h3 className="font-mono text-[14px] font-bold uppercase tracking-wider text-ink-foreground">
                  {selectedStation.label}
                </h3>
                <span className="text-[11px] text-ink-muted">{selectedStation.subtitle}</span>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 text-[12px]">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
                  Underlying Tech Engine
                </span>
                <p className="mt-0.5 font-mono text-[12px] text-[var(--sovereign)] bg-ink-surface p-2 rounded border border-ink-border">
                  {selectedStation.tech}
                </p>
              </div>

              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
                  Isolation & Security Guarantee
                </span>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-foreground/90 bg-ink-surface/50 p-2.5 rounded border border-ink-border">
                  {selectedStation.guarantee}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
                <div className="rounded border border-ink-border bg-ink-surface p-2">
                  <span className="text-ink-muted">Network:</span>
                  <div className="text-[var(--sovereign)] font-bold">127.0.0.1 ONLY</div>
                </div>
                <div className="rounded border border-ink-border bg-ink-surface p-2">
                  <span className="text-ink-muted">Storage:</span>
                  <div className="text-ink-foreground font-bold">Encrypted RAM</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedStation(null)}
              className="mt-5 w-full rounded border border-ink-border bg-ink-surface py-2 font-mono text-[11px] uppercase tracking-wider text-ink-foreground hover:border-[var(--sovereign)] transition-colors"
            >
              Close Inspector
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
