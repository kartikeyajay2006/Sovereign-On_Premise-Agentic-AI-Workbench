'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/shared/ui/controls/button'
import { FailureState, ReadingLine, useReading } from '@/shared/ui/data/reading'
import { highlightFor, queryDrawing, readDrawing, type PidSummary, type TopologyResult } from './api'
import { PidDiagram, PidLegend } from './pid-diagram'
import { TopologyAnswer } from './topology-answer'

const KINDS: { value: TopologyResult['kind']; label: string }[] = [
  { value: 'isolation', label: 'Isolation plan' },
  { value: 'upstream', label: 'Upstream' },
  { value: 'downstream', label: 'Downstream' },
  { value: 'path', label: 'Path to…' },
  { value: 'instruments', label: 'Instruments' },
]
const PURPOSES = [
  { value: 'confined_space', label: 'Confined space entry' },
  { value: 'hot_work', label: 'Hot work' },
  { value: 'maintenance', label: 'Other maintenance' },
]

const SELECT =
  'h-8 rounded-[var(--radius)] border border-line-default bg-background px-2 text-ui text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none'

/**
 * The plant's drawings as graphs, and the questions they answer exactly.
 * Click an element to ask about it; every answer names the elements it rests
 * on and the procedure clause it applies.
 */
export function DrawingExplorer({ drawings }: { drawings: PidSummary[] }) {
  const [drawingId, setDrawingId] = useState(drawings[0]?.id ?? '')
  const drawing = useReading((signal) => readDrawing(drawingId, signal), [drawingId], { enabled: Boolean(drawingId) })
  const [tag, setTag] = useState('V-2104')
  const [to, setTo] = useState('C-2101')
  const [kind, setKind] = useState<TopologyResult['kind']>('isolation')
  const [purpose, setPurpose] = useState('confined_space')
  const [result, setResult] = useState<TopologyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tags = useMemo(
    () => (drawing.data?.nodes ?? []).filter((n) => n.type !== 'tee').map((n) => n.id).sort(),
    [drawing.data],
  )
  useEffect(() => setResult(null), [drawingId])

  const ask = async () => {
    setBusy(true)
    setError(null)
    try {
      setResult(await queryDrawing(drawingId, { kind, tag, to: kind === 'path' ? to : null, purpose }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The drawing could not answer.')
    } finally {
      setBusy(false)
    }
  }

  if (drawings.length === 0) {
    return <p className="text-body text-foreground-muted">No drawings are held as graphs on this host.</p>
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-meta text-foreground-muted">
          Drawing
          <select className={SELECT} value={drawingId} onChange={(e) => setDrawingId(e.target.value)}>
            {drawings.map((d) => (
              <option key={d.id} value={d.id}>{`${d.id} rev ${d.revision} · ${d.title}`}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-meta text-foreground-muted">
          Question
          <select className={SELECT} value={kind} onChange={(e) => setKind(e.target.value as TopologyResult['kind'])}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-meta text-foreground-muted">
          Element
          <select className={SELECT} value={tag} onChange={(e) => setTag(e.target.value)}>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {kind === 'path' && (
          <label className="flex flex-col gap-1 text-meta text-foreground-muted">
            To
            <select className={SELECT} value={to} onChange={(e) => setTo(e.target.value)}>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
        {kind === 'isolation' && (
          <label className="flex flex-col gap-1 text-meta text-foreground-muted">
            For
            <select className={SELECT} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
        )}
        <Button variant="primary" size="sm" busy={busy} busyLabel="Walking the graph…" onClick={() => void ask()}>
          Ask the drawing
        </Button>
      </div>

      {drawing.status === 'failed' && !drawing.data ? (
        <FailureState failure={drawing.failure!} what="the drawing" retry={drawing.reload} />
      ) : !drawing.data ? (
        <ReadingLine what="the drawing" source={`GET /api/pid/${drawingId}`} startedAt={drawing.startedAt} />
      ) : (
        <div className="grouped flex flex-col gap-3 p-3">
          <PidDiagram drawing={drawing.data} highlight={highlightFor(result)} onSelect={setTag} selected={tag} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PidLegend />
            <span className="font-mono text-[11px] text-foreground-muted">
              {drawing.data.id} rev {drawing.data.revision} · {drawing.data.status} · {drawing.data.nodes.length} elements
            </span>
          </div>
        </div>
      )}
      {error && <p className="text-ui text-critical-text">{error}</p>}
      {result && <TopologyAnswer result={result} />}
    </div>
  )
}
