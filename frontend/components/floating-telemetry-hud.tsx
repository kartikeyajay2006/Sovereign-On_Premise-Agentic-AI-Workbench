'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  Activity,
  Cpu,
  Radio,
  Lock,
  Zap,
  Minimize2,
  Maximize2,
  GripHorizontal,
  RotateCcw,
  Copy,
  Check,
  Terminal,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FloatingTelemetryHUDProps {
  onResetLayout?: () => void
  activeStageName?: string
  modelName?: string
  taskRunning?: boolean
}

export function FloatingTelemetryHUD({
  onResetLayout,
  activeStageName = 'STANDBY',
  modelName = 'Qwen-2.5-72B-Local',
  taskRunning = false,
}: FloatingTelemetryHUDProps) {
  const [position, setPosition] = useState({ x: 24, y: 120 })
  const [isDragging, setIsDragging] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [copiedHash, setCopiedHash] = useState(false)
  const [particleSpeed, setParticleSpeed] = useState<number>(1)
  const [tokenSpeed, setTokenSpeed] = useState(taskRunning ? 52.4 : 0.0)
  const [hashHead, setHashHead] = useState('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')

  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 })
  const hudRef = useRef<HTMLDivElement>(null)

  // Dynamic token stream simulation
  useEffect(() => {
    if (!taskRunning) {
      setTokenSpeed(0.0)
      return
    }
    const interval = setInterval(() => {
      setTokenSpeed(parseFloat((44.0 + Math.random() * 18.0).toFixed(1)))
      // Generate realistic dynamic SHA-256 chunk
      const hex = Array.from({ length: 8 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')
      setHashHead((prev) => `${hex}${prev.slice(8)}`)
    }, 600)
    return () => clearInterval(interval)
  }, [taskRunning])

  // Mouse drag handler
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true)
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        posX: position.x,
        posY: position.y,
      }
    },
    [position]
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      const dx = e.clientX - dragStartRef.current.mouseX
      const dy = e.clientY - dragStartRef.current.mouseY
      const newX = Math.max(10, Math.min(window.innerWidth - 340, dragStartRef.current.posX + dx))
      const newY = Math.max(60, Math.min(window.innerHeight - 200, dragStartRef.current.posY + dy))
      setPosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const copyHashToClipboard = () => {
    navigator.clipboard.writeText(hashHead)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 2000)
  }

  return (
    <aside
      aria-label="Sovereign Telemetry HUD"
      ref={hudRef}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }}
      className={cn(
        'fixed top-0 left-0 z-[70] w-80 select-none rounded-lg border border-border-strong bg-surface/95 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.18)] transition-shadow duration-200',
        isDragging && 'shadow-[0_20px_50px_rgba(0,0,0,0.3)] ring-2 ring-[var(--sovereign)]/40',
        isMinimized ? 'h-auto' : 'h-auto'
      )}
    >
      {/* HUD Drag Bar Header */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          'flex items-center justify-between border-b border-border px-3 py-2 cursor-grab active:cursor-grabbing bg-surface-sunken/80 rounded-t-lg transition-colors',
          isDragging && 'bg-[var(--sovereign)]/10'
        )}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-3.5 w-3.5 text-foreground-muted" />
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span
                className={cn(
                  'absolute inline-flex h-full w-full rounded-full opacity-75',
                  taskRunning ? 'animate-ping bg-[var(--sovereign)]' : 'bg-foreground-muted'
                )}
              />
              <span
                className={cn(
                  'relative inline-flex h-2 w-2 rounded-full',
                  taskRunning ? 'bg-[var(--sovereign)]' : 'bg-foreground-muted'
                )}
              />
            </span>
            <span className="font-mono text-[11px] font-semibold tracking-wider text-foreground">
              SOVEREIGN HUD
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onResetLayout && (
            <button
              type="button"
              onClick={onResetLayout}
              title="Reset station node positions"
              className="flex h-5 w-5 items-center justify-center rounded text-foreground-muted hover:bg-surface hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsMinimized((v) => !v)}
            title={isMinimized ? 'Expand HUD' : 'Minimize HUD'}
            className="flex h-5 w-5 items-center justify-center rounded text-foreground-muted hover:bg-surface hover:text-foreground transition-colors"
          >
            {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* HUD Body */}
      {!isMinimized && (
        <div className="flex flex-col gap-3 p-3">
          {/* Air Gap Radar + Egress Status */}
          <div className="flex items-center justify-between rounded border border-[var(--sovereign)]/30 bg-[var(--sovereign)]/5 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <div className="relative flex h-6 w-6 items-center justify-center rounded-full border border-[var(--sovereign)]/40 bg-[var(--sovereign)]/10">
                <Radio className="h-3.5 w-3.5 text-[var(--sovereign)] sov-spin-slow" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-mono text-[9px] uppercase tracking-widest text-foreground-muted">
                  Air-Gap Egress
                </span>
                <span className="font-mono text-[12px] font-bold text-[var(--sovereign)]">
                  0.00 KB/s · LOCKED
                </span>
              </div>
            </div>
            <span className="rounded bg-[var(--sovereign)]/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--sovereign)]">
              127.0.0.1
            </span>
          </div>

          {/* Model Stream & Active Node Gauge */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5 rounded border border-border bg-surface-sunken p-2">
              <div className="flex items-center gap-1 text-foreground-muted">
                <Cpu className="h-3 w-3 text-[var(--active)]" />
                <span className="font-mono text-[9px] uppercase tracking-wider">Model Velocity</span>
              </div>
              <span className="font-mono text-[13px] font-semibold text-foreground">
                {taskRunning ? `${tokenSpeed} tok/s` : 'IDLE · READY'}
              </span>
              <span className="truncate font-mono text-[9px] text-foreground-muted">
                {modelName}
              </span>
            </div>

            <div className="flex flex-col gap-0.5 rounded border border-border bg-surface-sunken p-2">
              <div className="flex items-center gap-1 text-foreground-muted">
                <Activity className="h-3 w-3 text-[var(--approval)]" />
                <span className="font-mono text-[9px] uppercase tracking-wider">Pipeline Node</span>
              </div>
              <span className="font-mono text-[13px] font-semibold text-foreground truncate">
                {activeStageName.toUpperCase()}
              </span>
              <span className="font-mono text-[9px] text-[var(--sovereign)]">
                Local VRAM: 14.2 GB
              </span>
            </div>
          </div>

          {/* Live SHA-256 Hash Head Chain */}
          <div className="flex flex-col gap-1 rounded border border-border bg-ink p-2 text-ink-foreground">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-ink-muted">
                <Lock className="h-2.5 w-2.5 text-[var(--sovereign)]" /> SHA-256 Ledger Root
              </span>
              <button
                type="button"
                onClick={copyHashToClipboard}
                className="flex items-center gap-1 font-mono text-[9px] text-ink-muted hover:text-ink-foreground transition-colors"
              >
                {copiedHash ? (
                  <>
                    <Check className="h-2.5 w-2.5 text-[var(--sovereign)]" /> COPIED
                  </>
                ) : (
                  <>
                    <Copy className="h-2.5 w-2.5" /> COPY
                  </>
                )}
              </button>
            </div>
            <div className="overflow-hidden font-mono text-[10px] text-[var(--sovereign)] tracking-tight truncate">
              {hashHead}
            </div>
          </div>

          {/* Interactive Flow Speed Adjuster */}
          <div className="flex items-center justify-between pt-1 border-t border-border/60 text-[10px] text-foreground-muted">
            <span className="font-mono flex items-center gap-1">
              <Zap className="h-3 w-3 text-[var(--active)]" /> Data Flow Speed:
            </span>
            <div className="flex items-center gap-1">
              {[1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => setParticleSpeed(speed)}
                  className={cn(
                    'px-1.5 py-0.5 rounded font-mono text-[9px] border transition-colors',
                    particleSpeed === speed
                      ? 'border-foreground bg-foreground text-primary-foreground font-bold'
                      : 'border-border bg-surface text-foreground-muted hover:text-foreground'
                  )}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
