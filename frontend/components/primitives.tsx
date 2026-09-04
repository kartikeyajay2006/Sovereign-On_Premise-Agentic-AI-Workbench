'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { useReveal } from '@/hooks/use-reveal'

/* Small monospace technical eyebrow label */
export function TechnicalLabel({
  children,
  className,
  dot,
}: {
  children: ReactNode
  className?: string
  dot?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-foreground-muted',
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />}
      {children}
    </span>
  )
}

/* Large editorial section heading with a coordinate annotation */
export function SectionHeading({
  eyebrow,
  index,
  title,
  className,
  dark,
}: {
  eyebrow?: string
  index?: string
  title: ReactNode
  className?: string
  dark?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {(eyebrow || index) && (
        <div className="flex items-center justify-between">
          {eyebrow && <TechnicalLabel>{eyebrow}</TechnicalLabel>}
          {index && (
            <span className={cn('font-mono text-[11px]', dark ? 'text-ink-muted' : 'text-foreground-muted')}>
              {index}
            </span>
          )}
        </div>
      )}
      <h2
        className={cn(
          'text-balance text-3xl font-medium leading-[1.05] tracking-[-0.02em] md:text-5xl',
          dark ? 'text-ink-foreground' : 'text-foreground',
        )}
      >
        {title}
      </h2>
    </div>
  )
}

const statusMap = {
  DELIVERED: { color: 'var(--sovereign)', label: 'DELIVERED' },
  'AWAITING APPROVAL': { color: 'var(--approval)', label: 'AWAITING APPROVAL' },
  RUNNING: { color: 'var(--active)', label: 'RUNNING' },
  FAILED: { color: 'var(--critical)', label: 'FAILED' },
  BLOCKED: { color: 'var(--critical)', label: 'BLOCKED' },
  CANCELLED: { color: 'var(--ink-muted)', label: 'CANCELLED' },
  cancelled: { color: 'var(--ink-muted)', label: 'CANCELLED' },
  PENDING: { color: 'var(--approval)', label: 'PENDING' },
  APPROVED: { color: 'var(--sovereign)', label: 'APPROVED' },
  REJECTED: { color: 'var(--critical)', label: 'REJECTED' },
  INDEXED: { color: 'var(--sovereign)', label: 'INDEXED' },
  INGESTING: { color: 'var(--active)', label: 'INGESTING' },
  STORED: { color: 'var(--sovereign)', label: 'STORED' },
  PROCESSING: { color: 'var(--active)', label: 'PROCESSING' },
  ERROR: { color: 'var(--critical)', label: 'ERROR' },
} as const

export function StatusIndicator({
  status,
  pulse,
  className,
}: {
  status: keyof typeof statusMap | string
  pulse?: boolean
  className?: string
}) {
  const s = (statusMap as Record<string, { color: string; label: string }>)[status] || {
    color: 'var(--ink-muted)',
    label: String(status).toUpperCase(),
  }
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.08em]', className)}>
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span
            className="sov-pulse absolute inline-flex h-full w-full rounded-full"
            style={{ backgroundColor: s.color }}
          />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      </span>
      <span style={{ color: s.color }}>{s.label}</span>
    </span>
  )
}

/* Classification chip */
export function ClassificationTag({ level, dark }: { level: string; dark?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]',
        dark ? 'border-ink-border text-ink-muted' : 'border-border text-foreground-muted',
      )}
    >
      {level}
    </span>
  )
}

/* Scroll reveal wrapper */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const { ref, inView } = useReveal()
  return (
    <div
      ref={ref}
      className={cn('reveal', inView && 'in-view', className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}
