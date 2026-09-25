'use client'

import { Network } from 'lucide-react'
import { useReading } from '@/shared/ui/data/reading'
import { cn } from '@/lib/utils'
import { drawingIdOf, highlightFor, readDrawing, type TopologyResult } from '@/components/pid/api'
import { PidDiagram, PidLegend } from '@/components/pid/pid-diagram'
import { TopologyAnswer } from '@/components/pid/topology-answer'

/**
 * A P&ID question the run answered from the drawing's graph: the answer
 * branch by branch, and the sheet with every element it names marked.
 */
export function TopologyCard({ topology, onCite }: { topology: TopologyResult; onCite: (id: string) => void }) {
  const id = drawingIdOf(topology.drawing)
  const drawing = useReading((signal) => readDrawing(id, signal), [id])
  const failing = topology.kind === 'isolation' && topology.compliant === false
  return (
    <section
      aria-label={`Drawing answer from ${topology.drawing}`}
      className={cn('grouped flex flex-col gap-3 px-4 py-3', failing ? 'wash-critical' : '')}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-ui font-medium text-foreground">
          <Network className="h-4 w-4 text-foreground-secondary" aria-hidden />
          {topology.kind === 'isolation' ? 'Isolation plan' : topology.kind === 'path' ? 'Flow path' : 'Flow'} ·{' '}
          {topology.tag ?? topology.from} · {topology.drawing}
        </span>
        {topology.evidence_id && (
          <button
            type="button"
            onClick={() => onCite(topology.evidence_id!)}
            className="hover-decay inline-flex h-5 items-center rounded-full bg-surface-sunken px-1.5 font-mono text-[11px] font-semibold text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
          >
            {topology.evidence_id}
          </button>
        )}
      </header>
      <TopologyAnswer result={topology} />
      {drawing.data && (
        <div className="flex flex-col gap-2">
          <PidDiagram drawing={drawing.data} highlight={highlightFor(topology)} />
          <PidLegend />
        </div>
      )}
      <p className="font-mono text-meta text-foreground-muted">computed by walking the drawing&apos;s graph · not by the model</p>
    </section>
  )
}
